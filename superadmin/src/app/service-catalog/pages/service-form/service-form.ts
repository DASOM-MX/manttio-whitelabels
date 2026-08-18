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
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import {
  LucideChevronDown,
  LucideChevronUp,
  LucideCopy,
  LucideDynamicIcon,
  LucideImage,
  LucideImageUp,
  LucidePencil,
  LucideTrash2,
} from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { AuthState } from '../../../../state/auth/auth.state';
import { ServicesState } from '../../../../state/services/services.state';
import {
  CreateService,
  LoadService,
  LoadServiceTimeline,
  UpdateService,
} from '../../../../state/services/services.actions';
import { hasRole } from '../../../guards/has-role.guard';
import { SERVICE_TAX_RATE_LABELS } from '../../../model/constants/services/service-tax-rate-labels.const';
import { SERVICE_UOM_GROUPS } from '../../../model/constants/services/service-uom-groups.const';
import { SERVICE_UOM_SAT_UNIT_CODES } from '../../../model/constants/services/service-uom-sat-unit-codes.const';
import { MoneyPipe } from '../../../pipes/money.pipe';
import { RelativeTimePipe } from '../../../pipes/relative-time.pipe';
import {
  ServiceEventDetailPipe,
  ServiceEventIconPipe,
  ServiceEventLabelPipe,
} from '../../../pipes/service-event.pipe';
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
    ToggleSwitchModule,
    TableModule,
    TagModule,
    MoneyPipe,
    RelativeTimePipe,
    ServiceEventDetailPipe,
    ServiceEventIconPipe,
    ServiceEventLabelPipe,
    ServiceTaxRateLabelPipe,
    ServiceUomLabelPipe,
    PageHeader,
    LucideChevronDown,
    LucideChevronUp,
    LucideCopy,
    LucideDynamicIcon,
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
  protected timeline = select(ServicesState.timeline);
  protected timelineLoading = select(ServicesState.timelineLoading);
  protected readonly skeletonRows = [0, 1, 2];
  /** One dispatch per visit — the effect below re-runs whenever `me()`
   *  hydrates, and the trail shouldn't reload on every auth-state tick. */
  private timelineRequested = false;

  protected serviceId: string | null = this.route.snapshot.paramMap.get('id');
  protected isEdit = !!this.serviceId;
  /** Clone source (18 §6.2): `/services/new?from=<id>` prefills the create
   *  from that service. Snapshot read — there is no in-page navigation that
   *  changes it. Only meaningful on the create route. */
  private cloneSourceId: string | null = this.isEdit
    ? null
    : this.route.snapshot.queryParamMap.get('from');
  protected isClone = !!this.cloneSourceId;
  /** View-first: the form only renders after an explicit "Editar" click. */
  protected editing = signal(false);
  protected busy = signal(false);

  /** Only owner/admin maintain the catalog; office and technician read it. */
  protected canManage = computed(() => hasRole(this.me(), ['owner', 'admin']));

  protected pageTitle = computed(() =>
    this.isEdit
      ? (this.selected()?.name ?? 'Servicio')
      : this.isClone
        ? 'Duplicar servicio'
        : 'Registrar servicio',
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

  /** Pre-grouped by dimension (PrimeNG `SelectItemGroup[]`) — 30 units read as
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
    // Free text on purpose (18 §6.4): the SAT versions its catalogs, so a
    // stale local format check would reject valid keys. 09 owns validation.
    satProdServCode: [''],
    satUnitCode: [''],
    isReportSource: [false],
    isListableInWebsite: [false],
    isPriceVisibleInWebsite: [false],
    websiteDescription: [''],
  });

  private listable = toSignal(this.form.controls.isListableInWebsite.valueChanges, {
    initialValue: this.form.controls.isListableInWebsite.value,
  });

  /** The price-visibility toggle only exists for a listed service. */
  protected showsPriceToggle = computed(() => this.listable() === true);

  /** The revealed website block is collapsible — long forms shouldn't force
   *  scrolling past copy + photo already dealt with. Re-opens whenever the
   *  listable checkbox turns on, so checking it always shows what it enabled. */
  protected websiteSectionOpen = signal(true);

  constructor() {
    effect(() => {
      if (this.listable()) this.websiteSectionOpen.set(true);
    });

    // Detail and clone share the load: either way the page needs one service
    // fetched, and it's useless without it → back to the list on failure. The
    // toast detail is whatever the backend answered — never overridden here.
    const loadId = this.serviceId ?? this.cloneSourceId;
    if (loadId) {
      this.store.dispatch(new LoadService(loadId)).subscribe({
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
      if (!svc) return;
      if (svc.id === this.serviceId) this.hydrate(svc);
      else if (svc.id === this.cloneSourceId) this.hydrateClone(svc);
    });

    // The trail is admin-tier only (the endpoint 403s the rest), and `me()`
    // may hydrate after construction — so the dispatch rides an effect
    // gated on the role rather than the constructor body.
    effect(() => {
      if (this.serviceId && this.canManage() && !this.timelineRequested) {
        this.timelineRequested = true;
        this.store.dispatch(new LoadServiceTimeline(this.serviceId));
      }
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
      satProdServCode: svc.satProdServCode ?? '',
      satUnitCode: svc.satUnitCode ?? '',
      isReportSource: svc.isReportSource,
      isListableInWebsite: svc.isListableInWebsite,
      isPriceVisibleInWebsite: svc.isPriceVisibleInWebsite,
      websiteDescription: svc.websiteDescription ?? '',
    });
    this.image.set({ key: svc.websiteImageKey, url: svc.websiteImageUrl, uploading: false });
    this.savedImageKey = svc.websiteImageKey;
  }

  /** Prefill from the clone source (18 §6.2) with exactly two deltas: the
   *  catalog code is cleared (unique across the live catalog — a copy can't
   *  reuse it) and the photo key copies as-is (same R2 object; "Quitar" only
   *  ever clears a row's key, never deletes the object, so sharing is safe).
   *  Everything else verbatim. The form stays pristine and `savedImageKey`
   *  mirrors the copied key — an untouched clone abandons nothing, so the
   *  pending-changes guard shouldn't ask. */
  private hydrateClone(svc: Service): void {
    this.form.reset({
      name: svc.name,
      price: Number(svc.price),
      cost: svc.cost === undefined ? null : Number(svc.cost),
      uom: svc.uom,
      internalServiceCode: '',
      description: svc.description ?? '',
      taxRate: svc.taxRate,
      // Catalog attributes of the same kind of work — a copy invoices the
      // same way, and unlike the código these carry no uniqueness.
      satProdServCode: svc.satProdServCode ?? '',
      satUnitCode: svc.satUnitCode ?? '',
      isReportSource: svc.isReportSource,
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

  protected toggleWebsiteSection(): void {
    this.websiteSectionOpen.update((open) => !open);
  }

  /** Suggest the SAT unit key when the owner picks a unidad (18 §6.4).
   *  Bound to the select's `onChange`, which only fires on a real pick — a
   *  programmatic `reset()` during hydration must never invent a key for a
   *  service that doesn't have one. Never overwrites a typed value; the map
   *  is total (units the SAT has no entry for ride the E48 collapse), so an
   *  empty field always gets a suggestion. */
  protected onUomSelected(): void {
    const control = this.form.controls.satUnitCode;
    if (control.value.trim()) return;
    control.setValue(SERVICE_UOM_SAT_UNIT_CODES[this.form.controls.uom.value]);
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
      // Always sent (as '' when erased) so clearing a key persists — same
      // reasoning as the photo, and the backend maps '' → null.
      satProdServCode: raw.satProdServCode.trim(),
      satUnitCode: raw.satUnitCode.trim(),
      isReportSource: raw.isReportSource,
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
      // Clone provenance — presence alone marks the created event
      // `via: 'clone'` server-side. Harmlessly ignored on updates (the PATCH
      // schema omits it), but only ever set on the create path anyway.
      ...(this.cloneSourceId ? { sourceServiceId: this.cloneSourceId } : {}),
    };
    this.busy.set(true);

    if (this.serviceId) {
      const id = this.serviceId;
      this.store.dispatch(new UpdateService(id, payload)).subscribe({
        // Stay on the detail: state carries the fresh service, view mode
        // shows it (and the hydrate effect re-syncs the form).
        next: () => {
          this.busy.set(false);
          this.form.markAsPristine();
          this.savedImageKey = this.image().key;
          this.editing.set(false);
          // The save just appended its service_updated row — refresh the
          // trail so the card shows it without a reload.
          this.store.dispatch(new LoadServiceTimeline(id));
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
