import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import {
  LucideCopy,
  LucideDownload,
  LucideEye,
  LucidePencil,
  LucidePlus,
  LucideTrash2,
  LucideUpload,
  LucideWrench,
} from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { ServicesState } from '../../../../state/services/services.state';
import { LoadServices } from '../../../../state/services/services.actions';
import { ServicesCatalogService } from '../../../services/http/services-catalog.service';
import { AuthState } from '../../../../state/auth/auth.state';
import { ListQueryService } from '../../../services/table/list-query.service';
import { hasRole } from '../../../guards/has-role.guard';
import { MoneyPipe } from '../../../pipes/money.pipe';
import { RelativeTimePipe } from '../../../pipes/relative-time.pipe';
import { ServiceTaxRateShortPipe } from '../../../pipes/service-tax-rate.pipe';
import { ServiceUomShortPipe } from '../../../pipes/service-uom.pipe';
import { DeleteServiceDialog } from '../../components/delete-service-dialog/delete-service-dialog';
import { FiltersPopover } from '../../../shared/components/filters-popover/filters-popover';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { servicesToCsv } from '../../utils/services-csv-export.utils';
import { downloadCsv } from '../../utils/csv.utils';
import type { Service, ServiceListQuery } from '../../../data/dtos/service';
import { tableLoading } from '../../../services/table/table-loading';

/** The tenant's service catalog (18 §3) — what the business sells, priced per
 *  unit of measure.
 *
 *  Read-wide, write-narrow (18 §2): office and technician both reach this page
 *  and see prices, so the create button and the edit/delete row actions are
 *  gated in-page on admin tier rather than the route. The whole row opens the
 *  view-first detail (`/services/:id`) for every role — read-only until its
 *  own Editar, which only admins see. `cost` is redacted by the API itself,
 *  not hidden here — the column simply renders an em dash for technicians.
 *
 *  Paging is server-side since 21 CP-5 (supersedes 18 §4): the table is
 *  `[lazy]`, and `q` + `page` persist in the URL through `ListQueryService`
 *  like every other list page. Service *pickers* do not read this slice — they
 *  read the unpaged roster (`ServicesState.options`), or they would offer page
 *  one of the catalog and nothing else. */
@Component({
  selector: 'app-services-list',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    TableModule,
    InputTextModule,
    TagModule,
    MoneyPipe,
    RelativeTimePipe,
    ServiceTaxRateShortPipe,
    ServiceUomShortPipe,
    DeleteServiceDialog,
    FiltersPopover,
    PageHeader,
    LucideCopy,
    LucideDownload,
    LucideEye,
    LucidePlus,
    LucidePencil,
    LucideTrash2,
    LucideUpload,
    LucideWrench,
  ],
  providers: [ListQueryService],
  templateUrl: './services-list.html',
})
export class ServicesList {
  private store = inject(Store);
  private router = inject(Router);
  protected list = inject(ListQueryService);

  private api = inject(ServicesCatalogService);

  protected services = select(ServicesState.items);
  protected total = select(ServicesState.total);
  protected loading = select(ServicesState.loading);
  protected tableBusy = tableLoading(this.loading, this.services);
  private me = select(AuthState.me);

  /** Only owner/admin maintain the catalog; office and technician read it. */
  protected canManage = computed(() => hasRole(this.me(), ['owner', 'admin']));

  /** Set while the export walks the catalog — the button reports it rather
   *  than looking inert on a large catalog. */
  protected exporting = signal(false);

  /** The API omits `cost` below back-office tier, so one probe of the loaded
   *  rows tells us whether the column is worth rendering at all. */
  protected showsCost = computed(() => this.services().some((s) => s.cost !== undefined));

  protected columnCount = computed(() => {
    // servicio, código, precio, unidad, IVA, sitio web, actualizado, acciones
    let count = 8;
    if (this.showsCost()) count += 1;
    return count;
  });

  /** Skeleton cells per row — materialized here because a template may not
   *  call functions (a call would re-run every change detection). */
  protected skeletonColumns = computed(() =>
    Array.from({ length: this.columnCount() }, (_, i) => i),
  );

  protected search = new FormControl('', { nonNullable: true });

  protected deleteDialog = viewChild<DeleteServiceDialog>('deleteDialog');

  constructor() {
    this.list.init({
      read: (params) => this.search.setValue(params.get('q') ?? '', { emitEvent: false }),
      write: () => ({ q: this.search.value || null }),
      load: (page) => this.store.dispatch(new LoadServices(this.query(page))),
    });
    this.list.bindFilters({ debounced: [this.search] });
  }

  private query(page: number): ServiceListQuery {
    return { page, limit: this.list.PAGE_SIZE, q: this.search.value || undefined };
  }

  /** Refetch after a delete through the dialog; steps back a page when the
   *  last row on this one was the one deleted. */
  protected refresh(): void {
    this.list.refresh(this.services().length);
  }

  protected openService(service: Service): void {
    this.router.navigate(['/services', service.id]);
  }

  protected openDelete(service: Service): void {
    this.deleteDialog()?.open(service);
  }

  /** Exportar CSV (18 §6.3): the whole filtered catalog, not the page on
   *  screen. Before CP-5 the list held every row and this could serialize
   *  `services()` directly; now that would export ten rows and look like it
   *  worked, so it re-reads the catalog through `listAll`. Wire-enum codes,
   *  cost included (the button only renders for admin tier). The current
   *  filter is honoured — you export what you are looking at, all of it. */
  protected exportCsv(): void {
    this.exporting.set(true);
    this.api.listAll(this.query(1)).subscribe({
      next: (rows) => {
        downloadCsv(`servicios-${new Date().toISOString().slice(0, 10)}.csv`, servicesToCsv(rows));
        this.exporting.set(false);
      },
      error: () => this.exporting.set(false),
    });
  }
}
