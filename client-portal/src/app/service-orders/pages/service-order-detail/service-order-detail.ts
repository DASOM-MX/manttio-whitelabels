import { Component, DestroyRef, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { LucideWrench } from '@lucide/angular';
import { Actions, ofActionErrored, select, Store } from '@ngxs/store';
import { ServiceOrdersState } from '../../../../state/service-orders/service-orders.state';
import { ServiceOrdersLoadOne } from '../../../../state/service-orders/service-orders.actions';
import { AuthState } from '../../../../state/auth/auth.state';
import {
  ServiceOrderStatusLabelPipe,
  ServiceOrderStatusSeverityPipe,
} from '../../../pipes/service-order-status.pipe';
import { ReportStatusLabelPipe, ReportStatusSeverityPipe } from '../../../pipes/report-status.pipe';
import { VisitStatusLabelPipe, VisitStatusSeverityPipe } from '../../../pipes/visit-status.pipe';
import { ServiceTaxRateLabelPipe } from '../../../pipes/service-tax-rate.pipe';
import { MoneyPipe } from '../../../pipes/money.pipe';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { PortalGrant } from '../../../model/enums/portal-auth/portal-grants.enum';

/** Read-only service-order detail (04 §6): the order's scope lines, its
 *  linked reports and the quotation it was born from — deep-linking into
 *  each **only when the viewer holds the matching grant**, since a link into
 *  a guard rejection is worse than no link. Visits render as a window and a
 *  status, never the technician assignment behind them; there is no download route
 *  (an order is a detail page, not a document) and no priority anywhere on
 *  the wire shape (A15). */
@Component({
  selector: 'app-service-order-detail',
  imports: [
    DatePipe,
    RouterLink,
    TableModule,
    TagModule,
    ServiceOrderStatusLabelPipe,
    ServiceOrderStatusSeverityPipe,
    ReportStatusLabelPipe,
    ReportStatusSeverityPipe,
    VisitStatusLabelPipe,
    VisitStatusSeverityPipe,
    ServiceTaxRateLabelPipe,
    MoneyPipe,
    PageHeader,
    LucideWrench,
  ],
  templateUrl: './service-order-detail.html',
})
export class ServiceOrderDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly store = inject(Store);
  private readonly actions$ = inject(Actions);
  private readonly messages = inject(MessageService);
  private readonly destroyRef = inject(DestroyRef);

  protected order = select(ServiceOrdersState.selected);
  protected loading = select(ServiceOrdersState.selectedLoading);
  private error = select(ServiceOrdersState.selectedError);
  private grants = select(AuthState.grants);

  /** Gate the two cross-links on their own grants — never link into a route
   *  the viewer's own guard would reject. */
  protected canViewQuotations = computed(() => this.grants().includes(PortalGrant.ViewQuotations));
  protected canViewReports = computed(() => this.grants().includes(PortalGrant.ViewReports));

  /** True once the load has settled with no order to show — a real 404, not
   *  the initial-paint gap before the dispatch below runs. */
  protected notFound = computed(() => !this.loading() && !this.order() && !!this.error());

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.store.dispatch(new ServiceOrdersLoadOne(id));

    this.actions$
      .pipe(ofActionErrored(ServiceOrdersLoadOne), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo cargar la orden de servicio',
          detail: this.error() ?? undefined,
        });
      });
  }
}
