import { Component, DestroyRef, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { LucideBoxes } from '@lucide/angular';
import { Actions, ofActionErrored, select, Store } from '@ngxs/store';
import { EquipmentState } from '../../../../state/equipment/equipment.state';
import { EquipmentLoadOne } from '../../../../state/equipment/equipment.actions';
import { AuthState } from '../../../../state/auth/auth.state';
import { EquipmentStatusLabelPipe, EquipmentStatusSeverityPipe } from '../../../pipes/equipment-status.pipe';
import { ReportStatusLabelPipe, ReportStatusSeverityPipe } from '../../../pipes/report-status.pipe';
import {
  ServiceRequestStatusLabelPipe,
  ServiceRequestStatusSeverityPipe,
} from '../../../pipes/service-request-status.pipe';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { PortalGrant } from '../../../model/enums/portal-auth/portal-grants.enum';

/** Read-only per-unit detail (04 §7): identification block plus the history
 *  that makes the section worth having. Each sub-list obeys its own grant —
 *  the backend only populates `linkedReports`/`linkedServiceRequests` when
 *  the viewer holds the matching grant, so this page hides the whole section
 *  rather than rendering an empty one for someone who was never shown any.
 *
 *  Two things this page deliberately does NOT render, both because their
 *  target route does not exist yet (06 CP-3, not built): the linked
 *  service-request rows carry no link (there is no `/service-requests/:id`
 *  to point at), and the "Solicitar servicio para este equipo" deep-link
 *  into the request form (04 §7) is omitted outright rather than shipped as
 *  a dead link. Reports still deep-link — `/reports/:id` exists (04 CP-2). */
@Component({
  selector: 'app-equipment-detail',
  imports: [
    DatePipe,
    RouterLink,
    TagModule,
    EquipmentStatusLabelPipe,
    EquipmentStatusSeverityPipe,
    ReportStatusLabelPipe,
    ReportStatusSeverityPipe,
    ServiceRequestStatusLabelPipe,
    ServiceRequestStatusSeverityPipe,
    PageHeader,
    LucideBoxes,
  ],
  templateUrl: './equipment-detail.html',
})
export class EquipmentDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly store = inject(Store);
  private readonly actions$ = inject(Actions);
  private readonly messages = inject(MessageService);
  private readonly destroyRef = inject(DestroyRef);

  protected unit = select(EquipmentState.selected);
  protected loading = select(EquipmentState.selectedLoading);
  private error = select(EquipmentState.selectedError);
  private grants = select(AuthState.grants);

  /** Gate each sub-list section on its own grant (04 §7) — an equipment-only
   *  user sees the unit and nothing hanging off it. */
  protected canViewReports = computed(() => this.grants().includes(PortalGrant.ViewReports));
  protected canViewRequests = computed(() =>
    this.grants().includes(PortalGrant.CreateServiceRequests),
  );

  /** True once the load has settled with no unit to show — a real 404, not
   *  the initial-paint gap before the dispatch below runs. */
  protected notFound = computed(() => !this.loading() && !this.unit() && !!this.error());

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.store.dispatch(new EquipmentLoadOne(id));

    this.actions$
      .pipe(ofActionErrored(EquipmentLoadOne), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo cargar el equipo',
          detail: this.error() ?? undefined,
        });
      });
  }
}
