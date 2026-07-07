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
import { UploadService } from '../../../../http/upload.service';
import { applyBrandTheme } from '../../../theme/apply-brand';
import { errorMessage } from '../../../data/utils';
import { FONT_PREVIEW_SIZES } from '../../../model/constants/brand/font-preview-sizes.const';
import { PRIMARY_STEPS } from '../../../model/constants/brand/primary-steps.const';
import { SURFACE_STEPS } from '../../../model/constants/brand/surface-steps.const';
import { contrastRatio, deriveScale, isHex } from '../../derive-scale';
import { ensureFontLoaded } from '../../font-preview';
import { ScaleEditor } from '../../components/scale-editor/scale-editor';
import { ApplyBrandDialog } from '../../components/apply-brand-dialog/apply-brand-dialog';
import type { Brand, FontCatalogEntry, SaveBrandRequest } from '../../../data/dtos/brand';

type ImageSlot = 'logo' | 'logoDark' | 'isologo';

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

  protected readonly PRIMARY_STEPS = PRIMARY_STEPS;
  protected readonly SURFACE_STEPS = SURFACE_STEPS;
  protected readonly FONT_PREVIEW_SIZES = FONT_PREVIEW_SIZES;

  private me = select(AuthState.me);
  protected brand = select(BrandState.brand);
  protected fonts = select(BrandState.fonts);
  protected saving = select(BrandState.saving);

  /** Owner-only write; everyone else who can even match this route (admin)
   *  gets the read-only rendering (in-page gating via hasRole — 14 §3). */
  protected readOnly = computed(() => this.me()?.role !== 'owner');

  protected dialog = viewChild<ApplyBrandDialog>('applyDialog');

  protected form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    slogan: [''],
    description: [''],
    contact: this.fb.nonNullable.group({
      phone: [''],
      whatsapp: [''],
      email: ['', Validators.email],
      address: [''],
    }),
    social: this.fb.nonNullable.group({
      facebook: [''],
      instagram: [''],
      tiktok: [''],
    }),
    font: this.fb.nonNullable.group({
      body: ['work_sans'],
      heading: ['rubik'],
    }),
  });

  protected primaryBase = this.fb.nonNullable.control('#3F7A9D');
  protected surfaceBase = this.fb.nonNullable.control('#4C5B5C');
  protected primaryScale = this.buildScaleGroup([...PRIMARY_STEPS], deriveScale('#3F7A9D', false));
  protected surfaceScale = this.buildScaleGroup([...SURFACE_STEPS], deriveScale('#4C5B5C', true));

  protected readonly imageSlots: { id: ImageSlot; label: string; dark: boolean }[] = [
    { id: 'logo', label: 'Logotipo', dark: false },
    { id: 'logoDark', label: 'Logotipo (fondo oscuro)', dark: true },
    { id: 'isologo', label: 'Isologo (cuadrado)', dark: false },
  ];

  protected images = signal<Record<ImageSlot, ImageState>>({
    logo: { uploading: false },
    logoDark: { uploading: false },
    isologo: { uploading: false },
  });

  /** Draft theme is live on the shell (Previsualizar) until reverted/saved. */
  protected previewing = signal(false);
  protected contrastWarnings = signal<string[]>([]);

  constructor() {
    this.store.dispatch(new LoadFonts());

    // Re-derive full ramps when a base changes (per-step overrides reset — the
    // advanced expander refines a derivation, it doesn't survive a new base).
    this.primaryBase.valueChanges.pipe(takeUntilDestroyed()).subscribe((hex) => {
      if (isHex(hex)) this.primaryScale.patchValue(deriveScale(hex, false));
      this.updateContrast();
    });
    this.surfaceBase.valueChanges.pipe(takeUntilDestroyed()).subscribe((hex) => {
      if (isHex(hex)) this.surfaceScale.patchValue(deriveScale(hex, true));
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
    await ensureFontLoaded(entry);
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
    this.uploads.uploadImage(file).subscribe({
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
    applyBrandTheme({ name: this.form.getRawValue().name, colors: this.draftColors() });
    this.previewing.set(true);
  }

  protected revertPreview(): void {
    applyBrandTheme(this.brand());
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
      slogan: raw.slogan || undefined,
      description: raw.description || undefined,
      logoKey: img.logo.key,
      logoDarkKey: img.logoDark.key,
      isologoKey: img.isologo.key,
      colors: this.draftColors(),
      contact: raw.contact,
      social: raw.social,
      font: raw.font,
    };
  }

  private draftColors(): SaveBrandRequest['colors'] {
    return {
      primary: this.primaryScale.getRawValue() as Record<string, string>,
      surface: this.surfaceScale.getRawValue() as Record<string, string>,
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
        },
        font: {
          body: brand.font?.body ?? 'work_sans',
          heading: brand.font?.heading ?? brand.font?.body ?? 'rubik',
        },
      },
      { emitEvent: false },
    );
    if (brand.colors?.primary)
      this.primaryScale.patchValue(brand.colors.primary, { emitEvent: false });
    if (brand.colors?.surface)
      this.surfaceScale.patchValue(brand.colors.surface, { emitEvent: false });
    if (brand.colors?.primary?.['600']) {
      this.primaryBase.setValue(brand.colors.primary['600'], { emitEvent: false });
    }
    if (brand.colors?.surface?.['500']) {
      this.surfaceBase.setValue(brand.colors.surface['500'], { emitEvent: false });
    }
    this.images.set({
      logo: { url: brand.logoUrl, uploading: false },
      logoDark: { url: brand.logoDarkUrl, uploading: false },
      isologo: { url: brand.isologoUrl, uploading: false },
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
    if (contrastRatio(p['600'], '#FFFFFF') < 4.5) {
      warnings.push(
        'El primario 600 sobre blanco queda por debajo de 4.5:1 — el texto de botones puede costar leerse.',
      );
    }
    if (contrastRatio(p['300'], s['950']) < 3) {
      warnings.push(
        'El primario 300 sobre la superficie 950 queda por debajo de 3:1 — los acentos en modo oscuro pueden perderse.',
      );
    }
    this.contrastWarnings.set(warnings);
  }
}
