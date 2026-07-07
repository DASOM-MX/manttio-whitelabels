import { Component, effect, inject, signal } from '@angular/core';
import {
  FormArray,
  FormControl,
  FormGroup,
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { TabsModule } from 'primeng/tabs';
import { MessageService } from 'primeng/api';
import { LucideImage, LucideImageUp } from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { CmsState } from '../../../../state/cms/cms.state';
import { LoadCmsHome, PublishCms, SaveCmsHome } from '../../../../state/cms/cms.actions';
import { UploadService } from '../../../services/http/upload.service';
import { Repeater } from '../../components/repeater/repeater';
import { IconPicker } from '../../components/icon-picker/icon-picker';
import { AsFormControlPipe, AsFormGroupPipe } from '../../../pipes/cast.pipe';
import { PublishBar } from '../../components/publish-bar/publish-bar';
import { errorMessage } from '../../../data/utils';
import type { HasPendingChanges } from '../../../guards/pending-changes.guard';
import type { CmsHome, CmsHomeManufacturer } from '../../../data/dtos/cms';

/** Home-document editor (04 §3 + §6): scalar fields + the repeater groups
 *  across the five section tabs, one save action for the whole document;
 *  draft→publish via the bar. */
@Component({
  selector: 'app-home-editor',
  imports: [
    ReactiveFormsModule,
    InputTextModule,
    TextareaModule,
    TabsModule,
    Repeater,
    IconPicker,
    PublishBar,
    AsFormControlPipe,
    AsFormGroupPipe,
    LucideImage,
    LucideImageUp,
  ],
  templateUrl: './home-editor.html',
})
export class HomeEditor implements HasPendingChanges {
  private fb = inject(FormBuilder);
  private store = inject(Store);
  private messages = inject(MessageService);
  private uploads = inject(UploadService);

  protected home = select(CmsState.home);
  protected unpublished = select(CmsState.homeUnpublished);
  protected loading = select(CmsState.loading);
  protected saving = select(CmsState.saving);

  protected busy = signal(false);
  /** Manufacturer row whose logo is uploading (one at a time — the other
   *  upload buttons disable while it runs). */
  protected uploadingLogo = signal<FormGroup | null>(null);

  protected form = this.fb.nonNullable.group({
    title: ['', Validators.required],
    description: ['', Validators.required],
    hero_video_url: [''],
    service_area: [''],
    services_content: this.fb.nonNullable.group({
      eyebrow: [''],
      title: ['', Validators.required],
      description: ['', Validators.required],
    }),
    contact_cta: this.fb.nonNullable.group({
      title: [''],
      description: [''],
    }),
    // v1.1 section-copy groups (04 §6) — optional: left blank, the group is
    // omitted from the saved doc and the site keeps its fallbacks.
    clients_content: this.fb.nonNullable.group({
      eyebrow: [''],
      title: [''],
      description: [''],
      cta_title: [''],
      cta_description: [''],
    }),
    manufacturers_content: this.fb.nonNullable.group({
      eyebrow: [''],
      title: [''],
      description: [''],
    }),
    location_content: this.fb.nonNullable.group({
      eyebrow: [''],
      title: [''],
      description: [''],
      schedule: [''],
    }),
    service_targets: this.fb.array<FormControl<string>>([]),
    badges: this.fb.array<FormGroup>([]),
    services: this.fb.array<FormGroup>([]),
    manufacturers: this.fb.array<FormGroup>([]),
  });

  constructor() {
    this.store.dispatch(new LoadCmsHome());
    effect(() => {
      const doc = this.home();
      if (doc) this.hydrate(doc);
    });
  }

  hasPendingChanges(): boolean {
    return this.form.dirty;
  }

  // ── FormArray plumbing ───────────────────────────────────────────────────

  get serviceTargets(): FormArray<FormControl<string>> {
    return this.form.controls.service_targets;
  }
  get badges(): FormArray<FormGroup> {
    return this.form.controls.badges;
  }
  get services(): FormArray<FormGroup> {
    return this.form.controls.services;
  }
  get manufacturers(): FormArray<FormGroup> {
    return this.form.controls.manufacturers;
  }

  protected addTarget(value = ''): void {
    this.serviceTargets.push(
      new FormControl(value, { nonNullable: true, validators: Validators.required }),
    );
    this.form.markAsDirty();
  }

  protected addBadge(badge?: { label?: string; value?: string; unit?: string }): void {
    this.badges.push(
      this.fb.nonNullable.group({
        label: [badge?.label ?? '', Validators.required],
        value: [badge?.value ?? '', Validators.required],
        unit: [badge?.unit ?? ''],
      }),
    );
    if (!badge) this.form.markAsDirty();
  }

  protected addService(svc?: {
    title?: string;
    description?: string;
    tags?: string[];
    icon?: string;
  }): void {
    this.services.push(
      this.fb.nonNullable.group({
        icon: [svc?.icon ?? ''],
        title: [svc?.title ?? '', Validators.required],
        description: [svc?.description ?? '', Validators.required],
        tagsCsv: [svc?.tags?.join(', ') ?? ''],
      }),
    );
    if (!svc) this.form.markAsDirty();
  }

  protected addManufacturer(entry?: CmsHomeManufacturer): void {
    this.manufacturers.push(
      this.fb.nonNullable.group({
        name: [entry?.name ?? '', Validators.required],
        logoKey: [entry?.logoKey ?? ''],
        logoUrl: [entry?.logoUrl ?? ''],
      }),
    );
    if (!entry) this.form.markAsDirty();
  }

  protected onManufacturerLogo(event: Event, row: FormGroup): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.uploadingLogo()) return;
    this.uploadingLogo.set(row);
    this.uploads.uploadImage(file).subscribe({
      next: ({ key, url }) => {
        row.patchValue({ logoKey: key, logoUrl: url });
        row.markAsDirty();
        this.form.markAsDirty();
        this.uploadingLogo.set(null);
      },
      error: (err) => {
        this.uploadingLogo.set(null);
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo subir el logotipo',
          detail: errorMessage(err, 'Inténtalo de nuevo.'),
        });
      },
    });
  }

  // ── Save + publish ───────────────────────────────────────────────────────

  protected save(): void {
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.store.dispatch(new SaveCmsHome(this.buildDocument())).subscribe({
      next: () => {
        this.busy.set(false);
        this.form.markAsPristine();
        this.messages.add({
          severity: 'success',
          summary: 'Borrador guardado',
          detail: 'El sitio público no cambia hasta que publiques.',
        });
      },
      error: (err) => {
        this.busy.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo guardar',
          detail: errorMessage(err, 'Inténtalo de nuevo.'),
        });
      },
    });
  }

  protected publish(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.store.dispatch(new PublishCms('home')).subscribe({
      next: () => {
        this.busy.set(false);
        this.messages.add({
          severity: 'success',
          summary: 'Publicado',
          detail: 'El contenido del inicio ya está en el sitio público.',
        });
      },
      error: (err) => {
        this.busy.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo publicar',
          detail: errorMessage(err, 'Inténtalo de nuevo.'),
        });
      },
    });
  }

  private buildDocument(): CmsHome {
    const raw = this.form.getRawValue();
    return {
      title: raw.title,
      description: raw.description,
      hero_video_url: raw.hero_video_url.trim() || undefined,
      service_area: raw.service_area || undefined,
      services_content: raw.services_content,
      contact_cta:
        raw.contact_cta.title || raw.contact_cta.description ? raw.contact_cta : undefined,
      clients_content: this.sectionOrUndefined(raw.clients_content),
      manufacturers_content: this.sectionOrUndefined(raw.manufacturers_content),
      location_content: this.sectionOrUndefined(raw.location_content),
      service_targets: raw.service_targets.filter((t) => !!t.trim()),
      badges: raw.badges as CmsHome['badges'],
      services: (
        raw.services as { icon: string; title: string; description: string; tagsCsv: string }[]
      ).map((s) => ({
        title: s.title,
        description: s.description,
        icon: s.icon || undefined,
        tags: s.tagsCsv
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      })),
      manufacturers: (raw.manufacturers as { name: string; logoKey: string; logoUrl: string }[])
        .filter((m) => !!m.name.trim())
        .map((m) => ({
          name: m.name,
          logoKey: m.logoKey || undefined,
          logoUrl: m.logoUrl || undefined,
        })),
    };
  }

  /** Optional section-copy groups (04 §6): all-blank → omit from the doc so
   *  the site keeps its fallbacks and published v1 docs round-trip clean. */
  private sectionOrUndefined<T extends Record<string, string>>(group: T): T | undefined {
    return Object.values(group).some((v) => v.trim()) ? group : undefined;
  }

  private hydrate(doc: CmsHome): void {
    this.form.patchValue(
      {
        title: doc.title,
        description: doc.description,
        hero_video_url: doc.hero_video_url ?? '',
        service_area: doc.service_area ?? '',
        services_content: {
          eyebrow: doc.services_content?.eyebrow ?? '',
          title: doc.services_content?.title ?? '',
          description: doc.services_content?.description ?? '',
        },
        contact_cta: {
          title: doc.contact_cta?.title ?? '',
          description: doc.contact_cta?.description ?? '',
        },
        clients_content: {
          eyebrow: doc.clients_content?.eyebrow ?? '',
          title: doc.clients_content?.title ?? '',
          description: doc.clients_content?.description ?? '',
          cta_title: doc.clients_content?.cta_title ?? '',
          cta_description: doc.clients_content?.cta_description ?? '',
        },
        manufacturers_content: {
          eyebrow: doc.manufacturers_content?.eyebrow ?? '',
          title: doc.manufacturers_content?.title ?? '',
          description: doc.manufacturers_content?.description ?? '',
        },
        location_content: {
          eyebrow: doc.location_content?.eyebrow ?? '',
          title: doc.location_content?.title ?? '',
          description: doc.location_content?.description ?? '',
          schedule: doc.location_content?.schedule ?? '',
        },
      },
      { emitEvent: false },
    );
    this.serviceTargets.clear({ emitEvent: false });
    for (const t of doc.service_targets ?? []) {
      this.serviceTargets.push(
        new FormControl(t, { nonNullable: true, validators: Validators.required }),
        { emitEvent: false },
      );
    }
    this.badges.clear({ emitEvent: false });
    for (const b of doc.badges ?? []) this.addBadge(b);
    this.services.clear({ emitEvent: false });
    for (const s of doc.services ?? []) this.addService(s);
    this.manufacturers.clear({ emitEvent: false });
    for (const m of doc.manufacturers ?? []) this.addManufacturer(m);
    this.form.markAsPristine();
  }
}
