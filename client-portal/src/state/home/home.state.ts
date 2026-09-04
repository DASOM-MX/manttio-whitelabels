import { Injectable, inject } from '@angular/core';
import { Action, Selector, State, StateContext } from '@ngxs/store';
import { catchError, forkJoin, of, tap } from 'rxjs';
import { PortalReportsService } from '../../app/services/http/portal-reports.service';
import { PortalContractsService } from '../../app/services/http/portal-contracts.service';
import { PortalQuotationsService } from '../../app/services/http/portal-quotations.service';
import { PortalServiceOrdersService } from '../../app/services/http/portal-service-orders.service';
import { PortalEquipmentService } from '../../app/services/http/portal-equipment.service';
import { PortalGrant } from '../../app/model/enums/portal-auth/portal-grants.enum';
import { HomeLoadSummaries } from './home.actions';
import { errorMessage } from '../../app/data/utils';
import type { HomeSectionSummary } from '../../app/data/types/home/home-section-summary.type';
import type { PortalReportListItem } from '../../app/data/dtos/portal-report/portal-report-list-item.dto';
import type { PortalContractListItem } from '../../app/data/dtos/portal-contract/portal-contract-list-item.dto';
import type { PortalQuotationListItem } from '../../app/data/dtos/portal-quotation/portal-quotation-list-item.dto';
import type { PortalServiceOrderListItem } from '../../app/data/dtos/portal-service-order/portal-service-order-list-item.dto';
import type { PortalEquipmentListItem } from '../../app/data/dtos/portal-equipment/portal-equipment-list-item.dto';

/** One card's worth per granted section, or `null` when the viewer holds no
 *  grant for it — the card itself is absent then, never shown empty. */
export interface HomeStateModel {
  loading: boolean;
  error: string | null;
  reports: HomeSectionSummary<PortalReportListItem> | null;
  contracts: HomeSectionSummary<PortalContractListItem> | null;
  quotations: HomeSectionSummary<PortalQuotationListItem> | null;
  serviceOrders: HomeSectionSummary<PortalServiceOrderListItem> | null;
  equipment: HomeSectionSummary<PortalEquipmentListItem> | null;
}

/** Inicio (04 §8): a landing panel, not a dashboard — one card per granted
 *  section, each asking its own list endpoint for two rows (`limit: 2`),
 *  never fifty. Reuses the read sections' own HTTP services; nothing new
 *  is added to the wire surface here. */
@State<HomeStateModel>({
  name: 'home',
  defaults: {
    loading: false,
    error: null,
    reports: null,
    contracts: null,
    quotations: null,
    serviceOrders: null,
    equipment: null,
  },
})
@Injectable()
export class HomeState {
  private readonly reportsApi = inject(PortalReportsService);
  private readonly contractsApi = inject(PortalContractsService);
  private readonly quotationsApi = inject(PortalQuotationsService);
  private readonly serviceOrdersApi = inject(PortalServiceOrdersService);
  private readonly equipmentApi = inject(PortalEquipmentService);

  @Selector() static loading(s: HomeStateModel): boolean {
    return s.loading;
  }
  @Selector() static error(s: HomeStateModel): string | null {
    return s.error;
  }
  @Selector() static reports(s: HomeStateModel): HomeSectionSummary<PortalReportListItem> | null {
    return s.reports;
  }
  @Selector() static contracts(
    s: HomeStateModel,
  ): HomeSectionSummary<PortalContractListItem> | null {
    return s.contracts;
  }
  @Selector() static quotations(
    s: HomeStateModel,
  ): HomeSectionSummary<PortalQuotationListItem> | null {
    return s.quotations;
  }
  @Selector() static serviceOrders(
    s: HomeStateModel,
  ): HomeSectionSummary<PortalServiceOrderListItem> | null {
    return s.serviceOrders;
  }
  @Selector() static equipment(
    s: HomeStateModel,
  ): HomeSectionSummary<PortalEquipmentListItem> | null {
    return s.equipment;
  }

  @Action(HomeLoadSummaries)
  loadSummaries(ctx: StateContext<HomeStateModel>, { grants }: HomeLoadSummaries) {
    ctx.patchState({ loading: true, error: null });

    const reports$ = grants.includes(PortalGrant.ViewReports)
      ? this.reportsApi.list({ limit: 2 })
      : of(null);
    const contracts$ = grants.includes(PortalGrant.ViewContracts)
      ? this.contractsApi.list({ limit: 2 })
      : of(null);
    const quotations$ = grants.includes(PortalGrant.ViewQuotations)
      ? this.quotationsApi.list({ limit: 2 })
      : of(null);
    const serviceOrders$ = grants.includes(PortalGrant.ViewServiceOrders)
      ? this.serviceOrdersApi.list({ limit: 2 })
      : of(null);
    const equipment$ = grants.includes(PortalGrant.ViewEquipment)
      ? this.equipmentApi.list({ limit: 2 })
      : of(null);

    return forkJoin([reports$, contracts$, quotations$, serviceOrders$, equipment$]).pipe(
      tap(([reports, contracts, quotations, serviceOrders, equipment]) => {
        ctx.patchState({
          reports: reports ? { total: reports.total, items: reports.items } : null,
          contracts: contracts ? { total: contracts.total, items: contracts.items } : null,
          quotations: quotations ? { total: quotations.total, items: quotations.items } : null,
          serviceOrders: serviceOrders
            ? { total: serviceOrders.total, items: serviceOrders.items }
            : null,
          equipment: equipment ? { total: equipment.total, items: equipment.items } : null,
          loading: false,
        });
      }),
      catchError((err) => {
        ctx.patchState({
          loading: false,
          error: errorMessage(err, 'No se pudo cargar el inicio.'),
        });
        throw err;
      }),
    );
  }
}
