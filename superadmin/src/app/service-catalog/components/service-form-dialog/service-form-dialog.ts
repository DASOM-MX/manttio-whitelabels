import { Component, computed, inject, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { CheckboxModule } from 'primeng/checkbox';
import { MessageService } from 'primeng/api';
import { LucideImage, LucideImageUp, LucideTrash2 } from '@lucide/angular';
import { Store } from '@ngxs/store';
import { CreateService, UpdateService } from '../../../../state/services/services.actions';
import { SERVICE_TAX_RATE_LABELS } from '../../../model/constants/services/service-tax-rate-labels.const';
import { SERVICE_UOM_GROUPS } from '../../../model/constants/services/service-uom-groups.const';
import { UploadService } from '../../../services/http/upload.service';
import { errorMessage } from '../../../data/utils';
import { ServiceTaxRate, ServiceUom, type Service } from '../../../data/dtos/service';
import type { ServiceWebsiteImage } from '../../../data/types/services/service-website-image';

/** Shape-3 create/edit dialog for a catalog service (18 §3).
 *
 *  Price visibility on the website is revealed only once the service is
 *  listed — progressive disclosure, because the flag is meaningless
 *  otherwise. The backend enforces the same invariant, so the two can't
 *  drift apart. */
@Component({
  selector: 'app-service-form-dialog',
  imports: [
    ReactiveFormsModule,
    DialogModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    TextareaModule,
    CheckboxModule,
    LucideImage,
    LucideImageUp,
    LucideTrash2,
  ],
  templateUrl: './service-form-dialog.html',
})
export class ServiceFormDialog {
  /** Emits after create/update so the list refetches. */
  readonly saved = output<void>();

  private fb = inject(FormBuilder);
  private store = inject(Store);
  private messages = inject(MessageService);
  private uploads = inject(UploadService);

  protected dialogOpen = signal(false);
  protected submitting = signal(false);
  protected editing = signal<Service | null>(null);
  /** Website card photo — the key is committed on save, the url previews it.
   *  Held outside the form because it's not a text control (same split as the
   *  clients-editor logo). */
  protected image = signal<ServiceWebsiteImage>({ uploading: false });

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

  open(service?: Service): void {
    const svc = service ?? null;
    this.editing.set(svc);
    this.form.reset({
      name: svc?.name ?? '',
      // Money arrives as an exact-decimal string; the control is numeric, so
      // this is the one inbound conversion (mirrored on submit).
      price: svc ? Number(svc.price) : 0,
      cost: svc?.cost === undefined ? null : Number(svc.cost),
      uom: svc?.uom ?? ServiceUom.Servicio,
      internalServiceCode: svc?.internalServiceCode ?? '',
      description: svc?.description ?? '',
      taxRate: svc?.taxRate ?? ServiceTaxRate.Iva16,
      isListableInWebsite: svc?.isListableInWebsite ?? false,
      isPriceVisibleInWebsite: svc?.isPriceVisibleInWebsite ?? false,
      websiteDescription: svc?.websiteDescription ?? '',
    });
    this.image.set({
      key: svc?.websiteImageKey,
      url: svc?.websiteImageUrl,
      uploading: false,
    });
    this.submitting.set(false);
    this.dialogOpen.set(true);
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

  protected close(): void {
    if (this.submitting()) return;
    this.dialogOpen.set(false);
  }

  protected submit(): void {
    if (this.form.invalid || this.submitting() || this.image().uploading) return;
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
    const editing = this.editing();
    this.submitting.set(true);
    this.store
      .dispatch(editing ? new UpdateService(editing.id, payload) : new CreateService(payload))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.dialogOpen.set(false);
          this.messages.add({
            severity: 'success',
            summary: editing ? 'Servicio actualizado' : 'Servicio registrado',
          });
          this.saved.emit();
        },
        error: (err) => {
          this.submitting.set(false);
          this.messages.add({
            severity: 'error',
            summary: 'No se pudo guardar el servicio',
            detail: errorMessage(err, 'Inténtalo de nuevo.'),
          });
        },
      });
  }
}
