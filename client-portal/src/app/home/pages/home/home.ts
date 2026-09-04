import { Component, DestroyRef, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import {
  LucideBoxes,
  LucideFileSignature,
  LucideFileText,
  LucideLockKeyhole,
  LucideReceipt,
  LucideWrench,
} from '@lucide/angular';
import { Actions, ofActionErrored, select, Store } from '@ngxs/store';
import { AuthState } from '../../../../state/auth/auth.state';
import { HomeState } from '../../../../state/home/home.state';
import { HomeLoadSummaries } from '../../../../state/home/home.actions';
import { PortalGrant } from '../../../model/enums/portal-auth/portal-grants.enum';
import { ReportStatusLabelPipe, ReportStatusSeverityPipe } from '../../../pipes/report-status.pipe';
import {
  ContractValidityLabelPipe,
  ContractValiditySeverityPipe,
} from '../../../pipes/contract.pipe';
import {
  QuotationStatusLabelPipe,
  QuotationStatusSeverityPipe,
} from '../../../pipes/quotation-status.pipe';
import {
  ServiceOrderStatusLabelPipe,
  ServiceOrderStatusSeverityPipe,
} from '../../../pipes/service-order-status.pipe';
import { MoneyPipe } from '../../../pipes/money.pipe';
import { PageHeader } from '../../../shared/components/page-header/page-header';

/** `/home` — the Inicio panel (04 §8): a landing page, not a dashboard. The
 *  tenant's brand and colors already ride the shell (sidebar logo/colors);
 *  this page adds only a short greeting and one card per granted section,
 *  each showing its total and its two most recent rows pulled straight off
 *  the same `GenericQueryResponse<T>` the section's own list page
 *  paginates on (`limit: 2` — never fifty). No charts, no KPIs.
 *
 *  A user with zero grants never reaches the card grid at all (00 §3
 *  decision 7 / 03 §4, carried from CP-3): the explanatory empty state
 *  tells them who to ask, which is a real destination, not a fallback. */
@Component({
  selector: 'app-home',
  imports: [
    RouterLink,
    TagModule,
    ReportStatusLabelPipe,
    ReportStatusSeverityPipe,
    ContractValidityLabelPipe,
    ContractValiditySeverityPipe,
    QuotationStatusLabelPipe,
    QuotationStatusSeverityPipe,
    ServiceOrderStatusLabelPipe,
    ServiceOrderStatusSeverityPipe,
    MoneyPipe,
    PageHeader,
    LucideLockKeyhole,
    LucideFileText,
    LucideFileSignature,
    LucideReceipt,
    LucideWrench,
    LucideBoxes,
  ],
  templateUrl: './home.html',
})
export class HomeComponent {
  private readonly store = inject(Store);
  private readonly actions$ = inject(Actions);
  private readonly messages = inject(MessageService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly user = select(AuthState.user);
  protected readonly grants = select(AuthState.grants);

  protected readonly hasGrants = computed(() => this.grants().length > 0);
  protected readonly contactName = computed(() => this.user()?.user?.name ?? null);
  protected readonly customerName = computed(() => this.user()?.customer?.name ?? null);
  protected readonly description = computed(() => {
    const name = this.customerName();
    return name ? `Portal de ${name}` : undefined;
  });

  private readonly error = select(HomeState.error);

  protected readonly canViewReports = computed(() => this.grants().includes(PortalGrant.ViewReports));
  protected readonly canViewContracts = computed(() =>
    this.grants().includes(PortalGrant.ViewContracts),
  );
  protected readonly canViewQuotations = computed(() =>
    this.grants().includes(PortalGrant.ViewQuotations),
  );
  protected readonly canViewServiceOrders = computed(() =>
    this.grants().includes(PortalGrant.ViewServiceOrders),
  );
  protected readonly canViewEquipment = computed(() =>
    this.grants().includes(PortalGrant.ViewEquipment),
  );

  protected readonly reportsSummary = select(HomeState.reports);
  protected readonly contractsSummary = select(HomeState.contracts);
  protected readonly quotationsSummary = select(HomeState.quotations);
  protected readonly serviceOrdersSummary = select(HomeState.serviceOrders);
  protected readonly equipmentSummary = select(HomeState.equipment);

  constructor() {
    if (this.hasGrants()) {
      this.store.dispatch(new HomeLoadSummaries(this.grants()));
    }

    this.actions$
      .pipe(ofActionErrored(HomeLoadSummaries), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo cargar el inicio',
          detail: this.error() ?? undefined,
        });
      });
  }
}
