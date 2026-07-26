import { Component, computed, inject, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { LucidePencil, LucidePlus, LucideTrash2, LucideWrench } from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { ServicesState } from '../../../../state/services/services.state';
import { LoadServices } from '../../../../state/services/services.actions';
import { AuthState } from '../../../../state/auth/auth.state';
import { ListQueryService } from '../../../services/table/list-query.service';
import { hasRole } from '../../../guards/has-role.guard';
import { MoneyPipe } from '../../../pipes/money.pipe';
import { RelativeTimePipe } from '../../../pipes/relative-time.pipe';
import { ServiceTaxRateShortPipe } from '../../../pipes/service-tax-rate.pipe';
import { ServiceUomShortPipe } from '../../../pipes/service-uom.pipe';
import { ServiceFormDialog } from '../../components/service-form-dialog/service-form-dialog';
import { DeleteServiceDialog } from '../../components/delete-service-dialog/delete-service-dialog';
import { FiltersPopover } from '../../../shared/components/filters-popover/filters-popover';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import type { Service, ServiceListQuery } from '../../../data/dtos/service';

/** The tenant's service catalog (18 §3) — what the business sells, priced per
 *  unit of measure.
 *
 *  Read-wide, write-narrow (18 §2): office and technician both reach this page
 *  and see prices, so the create button and row actions are gated in-page on
 *  admin tier rather than the route. `cost` is redacted by the API itself, not
 *  hidden here — the column simply renders an em dash for technicians.
 *
 *  Paging is client-side: `GET /services` returns the whole catalog (no
 *  pagination — it's tens of rows), so the table isn't `[lazy]` and only `q`
 *  persists in the URL. */
@Component({
  selector: 'app-services-list',
  imports: [
    ReactiveFormsModule,
    TableModule,
    InputTextModule,
    TagModule,
    MoneyPipe,
    RelativeTimePipe,
    ServiceTaxRateShortPipe,
    ServiceUomShortPipe,
    ServiceFormDialog,
    DeleteServiceDialog,
    FiltersPopover,
    PageHeader,
    LucidePlus,
    LucidePencil,
    LucideTrash2,
    LucideWrench,
  ],
  providers: [ListQueryService],
  templateUrl: './services-list.html',
})
export class ServicesList {
  private store = inject(Store);
  protected list = inject(ListQueryService);

  protected services = select(ServicesState.items);
  protected loading = select(ServicesState.loading);
  private me = select(AuthState.me);

  /** Only owner/admin maintain the catalog; office and technician read it. */
  protected canManage = computed(() => hasRole(this.me(), ['owner', 'admin']));

  /** The API omits `cost` below back-office tier, so one probe of the loaded
   *  rows tells us whether the column is worth rendering at all. */
  protected showsCost = computed(() => this.services().some((s) => s.cost !== undefined));

  protected columnCount = computed(() => {
    let count = 6; // servicio, precio, unidad, IVA, sitio web, actualizado
    if (this.showsCost()) count += 1;
    if (this.canManage()) count += 1; // row actions
    return count;
  });

  /** Skeleton cells per row — materialized here because a template may not
   *  call functions (a call would re-run every change detection). */
  protected skeletonColumns = computed(() =>
    Array.from({ length: this.columnCount() }, (_, i) => i),
  );

  protected readonly skeletonRows = [0, 1, 2, 3, 4, 5, 6, 7];

  protected search = new FormControl('', { nonNullable: true });

  protected formDialog = viewChild<ServiceFormDialog>('formDialog');
  protected deleteDialog = viewChild<DeleteServiceDialog>('deleteDialog');

  constructor() {
    this.list.init({
      read: (params) => this.search.setValue(params.get('q') ?? '', { emitEvent: false }),
      write: () => ({ q: this.search.value || null }),
      load: () => this.store.dispatch(new LoadServices(this.query())),
    });
    this.list.bindFilters({ debounced: [this.search] });
  }

  private query(): ServiceListQuery {
    return { q: this.search.value || undefined };
  }

  /** Refetch after a create/edit/delete through a dialog. */
  protected refresh(): void {
    this.store.dispatch(new LoadServices(this.query()));
  }

  protected openCreate(): void {
    this.formDialog()?.open();
  }

  protected openEdit(service: Service): void {
    this.formDialog()?.open(service);
  }

  protected openDelete(service: Service): void {
    this.deleteDialog()?.open(service);
  }
}
