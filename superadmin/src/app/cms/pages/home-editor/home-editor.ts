import { Component, effect, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { MessageService } from 'primeng/api';
import { select, Store } from '@ngxs/store';
import { CmsState } from '../../../../state/cms/cms.state';
import { LoadCmsHome, PublishCms, SaveCmsHome } from '../../../../state/cms/cms.actions';
import { Repeater } from '../../components/repeater/repeater';
import { PublishBar } from '../../components/publish-bar/publish-bar';
import { errorMessage } from '../../../data/utils';
import type { HasPendingChanges } from '../../../guards/pending-changes.guard';
import type { CmsHome } from '../../../data/dtos/cms';

/** Home-document editor (04 §3): scalar fields + the four repeater groups,
 *  one save action for the whole document; draft→publish via the bar. */
@Component({
  selector: 'app-home-editor',
  imports: [ReactiveFormsModule, InputTextModule, TextareaModule, Repeater, PublishBar],
  templateUrl: './home-editor.html',
})
export class HomeEditor implements HasPendingChanges {
  private fb = inject(FormBuilder);
  private store = inject(Store);
  private messages = inject(MessageService);

  protected home = select(CmsState.home);
  protected unpublished = select(CmsState.homeUnpublished);
  protected loading = select(CmsState.loading);
  protected saving = select(CmsState.saving);

  protected busy = signal(false);

  protected form = this.fb.nonNullable.group({
    title: ['', Validators.required],
    description: ['', Validators.required],
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
    service_targets: this.fb.array<FormControl<string>>([]),
    badges: this.fb.array<FormGroup>([]),
    services: this.fb.array<FormGroup>([]),
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

  protected asControl(ctrl: AbstractControl): FormControl<string> {
    return ctrl as FormControl<string>;
  }
  protected asGroup(ctrl: AbstractControl): FormGroup {
    return ctrl as FormGroup;
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

  protected addService(svc?: { title?: string; description?: string; tags?: string[] }): void {
    this.services.push(
      this.fb.nonNullable.group({
        title: [svc?.title ?? '', Validators.required],
        description: [svc?.description ?? '', Validators.required],
        tagsCsv: [svc?.tags?.join(', ') ?? ''],
      }),
    );
    if (!svc) this.form.markAsDirty();
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
      service_area: raw.service_area || undefined,
      services_content: raw.services_content,
      contact_cta:
        raw.contact_cta.title || raw.contact_cta.description ? raw.contact_cta : undefined,
      service_targets: raw.service_targets.filter((t) => !!t.trim()),
      badges: raw.badges as CmsHome['badges'],
      services: (raw.services as { title: string; description: string; tagsCsv: string }[]).map(
        (s) => ({
          title: s.title,
          description: s.description,
          tags: s.tagsCsv
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      ),
    };
  }

  private hydrate(doc: CmsHome): void {
    this.form.patchValue(
      {
        title: doc.title,
        description: doc.description,
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
    this.form.markAsPristine();
  }
}
