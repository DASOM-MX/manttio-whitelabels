import { Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { LucideEye, LucideImageUp, LucideTriangleAlert, LucideUndo2 } from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { AuthState } from '../../../../state/auth/auth.state';
import { BrandState } from '../../../../state/brand/brand.state';
import { LoadFonts } from '../../../../state/brand/brand.actions';
import { UploadService } from '../../../services/http/upload.service';
import { BrandThemeService } from '../../../services/theme/brand-theme.service';
import { ColorScaleService } from '../../../services/theme/color-scale.service';
import { FontLoaderService } from '../../../services/theme/font-loader.service';
import { errorMessage } from '../../../data/utils';
import { phoneValidator } from '../../../validators/phone.validator';
import { FONT_PREVIEW_SIZES } from '../../../model/constants/brand/font-preview-sizes.const';
import { BRAND_SCALE_STEPS } from '../../../model/constants/brand/scale-steps.const';
import { ScaleEditor } from '../../components/scale-editor/scale-editor';
import { ApplyBrandDialog } from '../../components/apply-brand-dialog/apply-brand-dialog';
import type { Brand, FontCatalogEntry, SaveBrandRequest } from '../../../data/dtos/brand';

type ImageSlot = 'logo' | 'logoDark' | 'isologo' | 'favicon';

interface ImageState {
  key?: string;
  url?: string;
  uploading: boolean;
}

/** Brand identity editor (03 §6) — top-level **Marca**. Owner edits; admin
 *  sees the same page read-only (14 §2 note 5). Saving is direct-apply behind
 *  the confirm-heavy dialog. */
@Component({
  selector: 'app-brand-editor',
  imports: [
    ReactiveFormsModule,
    InputTextModule,
    TextareaModule,
    SelectModule,
    ScaleEditor,
    ApplyBrandDialog,
    LucideEye,
    LucideImageUp,
    LucideTriangleAlert,
    LucideUndo2,
  ],
  templateUrl: './brand-editor.html',
})
export class BrandEditor {
  private fb = inject(FormBuilder);
  private store = inject(Store);
  private messages = inject(MessageService);
  private uploads = inject(UploadService);
  private theme = inject(BrandThemeService);
  private colorScale = inject(ColorScaleService);
  private fontLoader = inject(FontLoaderService);

  protected readonly BRAND_SCALE_STEPS = BRAND_SCALE_STEPS;
  protected readonly FONT_PREVIEW_SIZES = FONT_PREVIEW_SIZES;

  private me = select(AuthState.me);
  protected brand = select(BrandState.brand);
  protected fonts = select(BrandState.fonts);
  protected saving = select(BrandState.saving);

  /** Owner-only write; everyone else who can even match this route (admin)
   *  gets the read-only rendering (in-page gating via hasRole — 14 §3). */
  protected readOnly = computed(() => this.me()?.role !== 'owner');

  protected dialog = viewChild<ApplyBrandDialog>('applyDialog');

  /** Template shorthand for the contact controls' error state. */
  protected get contactControls() {
    return this.form.controls.contact.controls;
  }

  protected form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    slogan: ['', [Validators.required, Validators.maxLength(150)]],
    description: ['', Validators.maxLength(300)],
    // Contact info is required brand data (PUT /brand rejects it missing);
    // social links are optional and blank ones never travel (buildPayload).
    // Format rules and length caps mirror the backend's brand.validator.ts;
    // the template's maxlength attrs keep typing inside them.
    contact: this.fb.nonNullable.group({
      phone: ['', [Validators.required, phoneValidator, Validators.maxLength(20)]],
      whatsapp: ['', [Validators.required, phoneValidator, Validators.maxLength(20)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
      address: ['', [Validators.required, Validators.maxLength(250)]],
    }),
    social: this.fb.nonNullable.group({
      facebook: ['', Validators.maxLength(300)],
      instagram: ['', Validators.maxLength(300)],
      tiktok: ['', Validators.maxLength(300)],
      googleMaps: ['', Validators.maxLength(300)],
    }),
    font: this.fb.nonNullable.group({
      body: ['work_sans'],
      heading: ['rubik'],
    }),
  });

  protected primaryBase = this.fb.nonNullable.control('#3F7A9D');
  protected surfaceBase = this.fb.nonNullable.control('#4C5B5C');
  protected primaryScale = this.buildScaleGroup(
    [...BRAND_SCALE_STEPS],
    this.colorScale.deriveScale('#3F7A9D', false),
  );
  protected surfaceScale = this.buildScaleGroup(
    [...BRAND_SCALE_STEPS],
    this.colorScale.deriveScale('#4C5B5C', true),
  );

  protected readonly imageSlots: { id: ImageSlot; label: string; dark: boolean }[] = [
    { id: 'logo', label: 'Logotipo', dark: false },
    { id: 'logoDark', label: 'Logotipo (fondo oscuro)', dark: true },
    { id: 'isologo', label: 'Isologo (cuadrado)', dark: false },
    // Icon-generation source: the backend renders the PWA icon set from this
    // mark (falling back to the isologo) on every save (field-app plan 02).
    { id: 'favicon', label: 'Favicon / ícono PWA (cuadrado, PNG)', dark: false },
  ];

  protected images = signal<Record<ImageSlot, ImageState>>({
    logo: { uploading: false },
    logoDark: { uploading: false },
    isologo: { uploading: false },
    favicon: { uploading: false },
  });

  /** Draft theme is live on the shell (Previsualizar) until reverted/saved. */
  protected previewing = signal(false);
  protected contrastWarnings = signal<string[]>([]);

  constructor() {
    this.store.dispatch(new LoadFonts());

    // Re-derive full ramps when a base changes (per-step overrides reset — the
    // advanced expander refines a derivation, it doesn't survive a new base).
    this.primaryBase.valueChanges.pipe(takeUntilDestroyed()).subscribe((hex) => {
      if (this.colorScale.isHex(hex)) {
        this.primaryScale.patchValue(this.colorScale.deriveScale(hex, false));
      }
      this.updateContrast();
    });
    this.surfaceBase.valueChanges.pipe(takeUntilDestroyed()).subscribe((hex) => {
      if (this.colorScale.isHex(hex)) {
        this.surfaceScale.patchValue(this.colorScale.deriveScale(hex, true));
      }
      this.updateContrast();
    });
    this.primaryScale.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.updateContrast());
    this.surfaceScale.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.updateContrast());

    // Hydrate from the loaded brand; re-runs if a save refreshes state.
    effect(() => {
      const brand = this.brand();
      if (brand) this.hydrate(brand);
    });

    // Admin read-only: disable everything (read-only ≠ hidden — same page).
    effect(() => {
      if (this.readOnly()) {
        this.form.disable({ emitEvent: false });
        this.primaryBase.disable({ emitEvent: false });
        this.surfaceBase.disable({ emitEvent: false });
        this.primaryScale.disable({ emitEvent: false });
        this.surfaceScale.disable({ emitEvent: false });
      }
    });

    this.updateContrast();
  }

  // ── Fonts ────────────────────────────────────────────────────────────────

  /** Grouped options for the two pickers (03 §2.1 groups). */
  protected fontOptions = computed(() => {
    const groups = new Map<string, { label: string; items: { label: string; value: string }[] }>();
    for (const f of this.fonts()) {
      const g = f.group ?? 'Catálogo';
      if (!groups.has(g)) groups.set(g, { label: g, items: [] });
      groups.get(g)!.items.push({ label: f.label, value: f.code });
    }
    return [...groups.values()];
  });

  protected fontEntry(code: string | undefined): FontCatalogEntry | undefined {
    return this.fonts().find((f) => f.code === code);
  }

  protected bodyFontFamily = signal<string>('');
  protected headingFontFamily = signal<string>('');

  protected async onFontChange(role: 'body' | 'heading'): Promise<void> {
    const code = this.form.controls.font.controls[role].value;
    const entry = this.fontEntry(code);
    if (!entry) return;
    await this.fontLoader.ensureLoaded(entry);
    const family = `'${entry.label}', ${entry.fallbackStack ?? 'sans-serif'}`;
    if (role === 'body') this.bodyFontFamily.set(family);
    else this.headingFontFamily.set(family);
  }

  // ── Images ───────────────────────────────────────────────────────────────

  protected onFile(slot: ImageSlot, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.readOnly()) return;
    this.images.update((s) => ({ ...s, [slot]: { ...s[slot], uploading: true } }));
    this.uploads.uploadLogo(file).subscribe({
      next: ({ key, url }) =>
        this.images.update((s) => ({ ...s, [slot]: { key, url, uploading: false } })),
      error: (err) => {
        this.images.update((s) => ({ ...s, [slot]: { ...s[slot], uploading: false } }));
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo subir la imagen',
          detail: errorMessage(err, 'Inténtalo de nuevo.'),
        });
      },
    });
  }

  // ── Preview + save ───────────────────────────────────────────────────────

  protected previewDraft(): void {
    this.theme.apply({ name: this.form.getRawValue().name, colors: this.draftColors() });
    this.previewing.set(true);
  }

  protected revertPreview(): void {
    this.theme.apply(this.brand());
    this.previewing.set(false);
  }

  protected save(): void {
    if (this.form.invalid || this.readOnly()) return;
    this.dialog()?.open(this.buildPayload());
  }

  protected onApplied(): void {
    this.previewing.set(false);
    this.form.markAsPristine();
  }

  private buildPayload(): SaveBrandRequest {
    const raw = this.form.getRawValue();
    const img = this.images();
    return {
      name: raw.name,
      slogan: raw.slogan,
      description: raw.description || undefined,
      logoKey: img.logo.key,
      logoDarkKey: img.logoDark.key,
      isologoKey: img.isologo.key,
      faviconKey: img.favicon.key,
      colors: this.draftColors(),
      contact: raw.contact,
      social: this.compactSocial(raw.social),
      font: raw.font,
    };
  }

  /** Blank social inputs mean "not provided" — they never travel, so the
   *  backend's URL check only ever sees filled-in links. */
  private compactSocial(social: Record<string, string>): SaveBrandRequest['social'] {
    const entries = Object.entries(social).filter(([, url]) => url.trim() !== '');
    return entries.length ? Object.fromEntries(entries) : undefined;
  }

  /** The editor's hex groups converted to the wire format — HSL components at
   *  0…1000 (rule 2). Shared by the PUT payload and the live preview. */
  private draftColors(): SaveBrandRequest['colors'] {
    return {
      primary: this.colorScale.toWireScale(
        this.primaryScale.getRawValue() as Record<string, string>,
      ),
      surface: this.colorScale.toWireScale(
        this.surfaceScale.getRawValue() as Record<string, string>,
      ),
    };
  }

  private hydrate(brand: Brand): void {
    this.form.patchValue(
      {
        name: brand.name,
        slogan: brand.slogan ?? '',
        description: brand.description ?? '',
        contact: {
          phone: brand.contact?.phone ?? '',
          whatsapp: brand.contact?.whatsapp ?? '',
          email: brand.contact?.email ?? '',
          address: brand.contact?.address ?? '',
        },
        social: {
          facebook: brand.social?.['facebook'] ?? '',
          instagram: brand.social?.['instagram'] ?? '',
          tiktok: brand.social?.['tiktok'] ?? '',
          googleMaps: brand.social?.['googleMaps'] ?? '',
        },
        font: {
          body: brand.font?.body ?? 'work_sans',
          heading: brand.font?.heading ?? brand.font?.body ?? 'rubik',
        },
      },
      { emitEvent: false },
    );
    // The wire scales are HSL components (rule 2); the pickers work in hex.
    const primaryHex = this.colorScale.fromWireScale(brand.colors?.primary);
    const surfaceHex = this.colorScale.fromWireScale(brand.colors?.surface);
    if (Object.keys(primaryHex).length)
      this.primaryScale.patchValue(primaryHex, { emitEvent: false });
    if (Object.keys(surfaceHex).length)
      this.surfaceScale.patchValue(surfaceHex, { emitEvent: false });
    if (primaryHex['600']) {
      this.primaryBase.setValue(primaryHex['600'], { emitEvent: false });
    }
    if (surfaceHex['500']) {
      this.surfaceBase.setValue(surfaceHex['500'], { emitEvent: false });
    }
    this.images.set({
      logo: { url: brand.logoUrl, uploading: false },
      logoDark: { url: brand.logoDarkUrl, uploading: false },
      isologo: { url: brand.isologoUrl, uploading: false },
      favicon: { url: brand.faviconUrl, uploading: false },
    });
    this.updateContrast();
    this.form.markAsPristine();
  }

  private buildScaleGroup(steps: string[], initial: Record<string, string>): FormGroup {
    return this.fb.group(
      Object.fromEntries(
        steps.map((s) => [s, new FormControl(initial[s] ?? '#FFFFFF', { nonNullable: true })]),
      ),
    );
  }

  /** 03 §3: contrast check warns but never blocks. */
  private updateContrast(): void {
    const p = this.primaryScale.getRawValue() as Record<string, string>;
    const s = this.surfaceScale.getRawValue() as Record<string, string>;
    const warnings: string[] = [];
    if (this.colorScale.contrastRatio(p['600'], '#FFFFFF') < 4.5) {
      warnings.push(
        'El primario 600 sobre blanco queda por debajo de 4.5:1 — el texto de botones puede costar leerse.',
      );
    }
    if (this.colorScale.contrastRatio(p['300'], s['1000']) < 3) {
      warnings.push(
        'El primario 300 sobre la superficie 1000 queda por debajo de 3:1 — los acentos en modo oscuro pueden perderse.',
      );
    }
    this.contrastWarnings.set(warnings);
  }
}
