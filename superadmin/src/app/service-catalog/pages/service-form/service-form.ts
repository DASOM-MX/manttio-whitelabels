import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { CheckboxModule } from 'primeng/checkbox';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { LucideImage, LucideImageUp, LucidePencil, LucideTrash2 } from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { AuthState } from '../../../../state/auth/auth.state';
import { ServicesState } from '../../../../state/services/services.state';
import {
  CreateService,
  LoadService,
  UpdateService,
} from '../../../../state/services/services.actions';
import { hasRole } from '../../../guards/has-role.guard';
import { SERVICE_TAX_RATE_LABELS } from '../../../model/constants/services/service-tax-rate-labels.const';
import { SERVICE_UOM_GROUPS } from '../../../model/constants/services/service-uom-groups.const';
import { MoneyPipe } from '../../../pipes/money.pipe';
import { ServiceTaxRateLabelPipe } from '../../../pipes/service-tax-rate.pipe';
import { ServiceUomLabelPipe } from '../../../pipes/service-uom.pipe';
import { UploadService } from '../../../services/http/upload.service';
import { errorMessage } from '../../../data/utils';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import type { HasPendingChanges } from '../../../guards/pending-changes.guard';
import { ServiceTaxRate, ServiceUom, type Service } from '../../../data/dtos/service';
import type { ServiceWebsiteImage } from '../../../data/types/services/service-website-image';

/** Add + detail/edit in one page (user-form idiom); the route param decides.
 *  The detail is **view-first (QA 2026-07-09)**: static labels until "Editar"
 *  is clicked — no live inputs by default, so stray edits can't fire unwanted
 *  requests.
 *
 *  Read-wide, write-narrow (18 §2): every staff role can open the detail —
 *  office and technician read the catalog — and only owner/admin see Editar.
 *  `cost` is redacted by the API itself for technicians, so its row simply
 *  doesn't render for them.
 *
 *  Price visibility on the website is revealed only once the service is
 *  listed — progressive disclosure, because the flag is meaningless
 *  otherwise. The backend enforces the same invariant, so the two can't
 *  drift apart. */
@Component({
  selector: 'app-service-form',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    DatePipe,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    TextareaModule,
    CheckboxModule,
    TagModule,
    MoneyPipe,
    ServiceTaxRateLabelPipe,
    ServiceUomLabelPipe,
    PageHeader,
    LucideImage,
    LucideImageUp,
    LucidePencil,
    LucideTrash2,
  ],
  templateUrl: './service-form.html',
})
export class ServiceForm implements HasPendingChanges {
  private fb = inject(FormBuilder);
  private store = inject(Store);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private messages = inject(MessageService);
  private uploads = inject(UploadService);

  private me = select(AuthState.me);
  protected selected = select(ServicesState.selected);

  protected serviceId: string | null = this.route.snapshot.paramMap.get('id');
  protected isEdit = !!this.serviceId;
  /** View-first: the form only renders after an explicit "Editar" click. */
  protected editing = signal(false);
  protected busy = signal(false);

  /** Only owner/admin maintain the catalog; office and technician read it. */
  protected canManage = computed(() => hasRole(this.me(), ['owner', 'admin']));

  protected pageTitle = computed(() =>
    this.isEdit ? (this.selected()?.name ?? 'Servicio') : 'Registrar servicio',
  );

  /** Website card photo — the key is committed on save, the url previews it.
   *  Held outside the form because it's not a text control (same split as the
   *  clients-editor logo). */
  protected image = signal<ServiceWebsiteImage>({ uploading: false });
  /** Last persisted key — an upload or Quitar without a save counts as a
   *  pending change even though the form controls stay pristine. */
  private savedImageKey: string | undefined;

  protected taxRateOptions = (
    Object.entries(SERVICE_TAX_RATE_LABELS) as [ServiceTaxRate, string][]
  ).map(([value, label]) => ({ label, value }));

  /** Pre-grouped by dimension (PrimeNG `SelectItemGroup[]`) — 19 units read as
   *  a wall in a flat list. */
  protected uomGroups = SERVICE_UOM_GROUPS;

  protected form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    price: [0, [Validators.required, Validators.min(0)]],
    cost: [null as number | null],
    uom: [ServiceUom.Servicio, Validators.required],
    internalServiceCode: [''],
    description: [''],
    taxRate: [ServiceTaxRate.Iva16, Validators.required],
    isListableInWebsite: [false],
    isPriceVisibleInWebsite: [false],
    websiteDescription: [''],
  });

  private listable = toSignal(this.form.controls.isListableInWebsite.valueChanges, {
    initialValue: this.form.controls.isListableInWebsite.value,
  });

  /** The price-visibility toggle only exists for a listed service. */
  protected showsPriceToggle = computed(() => this.listable() === true);

  constructor() {
    if (this.serviceId) {
      this.store.dispatch(new LoadService(this.serviceId)).subscribe({
        // The page is useless without the service → back to the list either
        // way. The toast detail is whatever the backend answered — never
        // overridden here.
        error: (err) => {
          this.messages.add({
            severity: 'error',
            summary: 'No se pudo cargar el servicio',
            detail: errorMessage(err, 'Inténtalo de nuevo.'),
          });
          this.router.navigate(['/services']);
        },
      });
    }

    effect(() => {
      const svc = this.selected();
      if (svc && svc.id === this.serviceId) this.hydrate(svc);
    });
  }

  private hydrate(svc: Service): void {
    this.form.reset({
      name: svc.name,
      // Money arrives as an exact-decimal string; the control is numeric, so
      // this is the one inbound conversion (mirrored on submit).
      price: Number(svc.price),
      cost: svc.cost === undefined ? null : Number(svc.cost),
      uom: svc.uom,
      internalServiceCode: svc.internalServiceCode ?? '',
      description: svc.description ?? '',
      taxRate: svc.taxRate,
      isListableInWebsite: svc.isListableInWebsite,
      isPriceVisibleInWebsite: svc.isPriceVisibleInWebsite,
      websiteDescription: svc.websiteDescription ?? '',
    });
    this.image.set({ key: svc.websiteImageKey, url: svc.websiteImageUrl, uploading: false });
    this.savedImageKey = svc.websiteImageKey;
  }

  hasPendingChanges(): boolean {
    return (this.form.dirty || this.imageChanged()) && !this.busy();
  }

  private imageChanged(): boolean {
    return (this.image().key ?? '') !== (this.savedImageKey ?? '');
  }

  protected startEdit(): void {
    if (!this.canManage()) return;
    this.editing.set(true);
  }

  protected cancelEdit(): void {
    const svc = this.selected();
    if (svc) this.hydrate(svc);
    this.editing.set(false);
  }

  protected onImageFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.image().uploading) return;
    this.image.update((s) => ({ ...s, uploading: true }));
    this.uploads.uploadWebsiteImage(file).subscribe({
      next: ({ key, url }) => this.image.set({ key, url, uploading: false }),
      error: (err) => {
        this.image.update((s) => ({ ...s, uploading: false }));
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo subir la imagen',
          detail: errorMessage(err, 'Inténtalo de nuevo.'),
        });
      },
    });
  }

  protected removeImage(): void {
    if (this.image().uploading) return;
    // Clears both — submit() sends '' so the server drops the stored key.
    this.image.set({ uploading: false });
  }

  protected submit(): void {
    if (this.form.invalid || this.busy() || this.image().uploading) return;
    const raw = this.form.getRawValue();
    const listed = raw.isListableInWebsite;
    const payload = {
      name: raw.name.trim(),
      price: raw.price,
      cost: raw.cost ?? undefined,
      uom: raw.uom,
      // Empty clears the code — '' would collide with the next blank one
      // under the unique index.
      internalServiceCode: raw.internalServiceCode.trim() || undefined,
      description: raw.description.trim() || undefined,
      taxRate: raw.taxRate,
      isListableInWebsite: listed,
      // Mirrors the server invariant: an unlisted service can't carry a
      // price-visible flag, so we never send a stale true.
      isPriceVisibleInWebsite: listed && raw.isPriceVisibleInWebsite,
      // Website copy is kept even when unlisted — it's not exposed unless the
      // service is listed, and discarding it would lose work on every toggle.
      websiteDescription: raw.websiteDescription.trim() || undefined,
      // Always sent (as '' when cleared) so "Quitar" actually persists — same
      // reasoning as the copy, the photo survives an unlist so no re-upload on
      // relist. The backend maps '' → null.
      websiteImageKey: this.image().key ?? '',
    };
    this.busy.set(true);

    if (this.serviceId) {
      this.store.dispatch(new UpdateService(this.serviceId, payload)).subscribe({
        // Stay on the detail: state carries the fresh service, view mode
        // shows it (and the hydrate effect re-syncs the form).
        next: () => {
          this.busy.set(false);
          this.form.markAsPristine();
          this.savedImageKey = this.image().key;
          this.editing.set(false);
          this.messages.add({ severity: 'success', summary: 'Servicio actualizado' });
        },
        error: (err) => this.onSaveError(err),
      });
      return;
    }

    this.store.dispatch(new CreateService(payload)).subscribe({
      next: () => {
        this.busy.set(false);
        // Pristine before leaving so pendingChangesGuard doesn't ask about
        // the work we just saved.
        this.form.markAsPristine();
        this.savedImageKey = this.image().key;
        this.messages.add({ severity: 'success', summary: 'Servicio registrado' });
        this.router.navigate(['/services']);
      },
      error: (err) => this.onSaveError(err),
    });
  }

  /** The detail is the backend's own message (e.g. the 409 names the clashing
   *  catalog code) — displayed as-is, never rewritten here. */
  private onSaveError(err: unknown): void {
    this.busy.set(false);
    this.messages.add({
      severity: 'error',
      summary: 'No se pudo guardar el servicio',
      detail: errorMessage(err, 'Inténtalo de nuevo.'),
    });
  }
}
