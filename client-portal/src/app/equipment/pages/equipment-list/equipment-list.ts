import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { InputTextModule } from 'primeng/inputtext';
import { LucideBoxes } from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { EquipmentState } from '../../../../state/equipment/equipment.state';
import { EquipmentLoadList } from '../../../../state/equipment/equipment.actions';
import { ListQueryService } from '../../../services/table/list-query.service';
import { tableLoading } from '../../../services/table/table-loading';
import { FiltersPopover } from '../../../shared/components/filters-popover/filters-popover';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import type { PortalEquipmentListItem } from '../../../data/dtos/portal-equipment/portal-equipment-list-item.dto';
import type { PortalEquipmentQuery } from '../../../data/dtos/portal-equipment/portal-equipment-query.dto';

/** Equipos (04 §7): server-paginated list, filters + page persisted in the
 *  URL — the same `ListQueryService` idiom the rest of the portal uses. No
 *  status filter: retired units stay visible alongside active ones (only
 *  soft-deleted rows are hidden, A7). */
@Component({
  selector: 'app-equipment-list',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    TableModule,
    InputTextModule,
    FiltersPopover,
    PageHeader,
    LucideBoxes,
  ],
  providers: [ListQueryService],
  templateUrl: './equipment-list.html',
})
export class EquipmentList {
  private readonly store = inject(Store);
  private readonly router = inject(Router);
  protected readonly list = inject(ListQueryService);

  protected equipment = select(EquipmentState.items);
  protected total = select(EquipmentState.total);
  protected loading = select(EquipmentState.loading);
  protected tableBusy = tableLoading(this.loading, this.equipment);

  protected search = new FormControl('', { nonNullable: true });
  protected locationFilter = new FormControl('', { nonNullable: true });

  /** Distinguishes the empty states (04 §1): "nothing here yet" vs "nothing
   *  matches your filters". Set from the URL params directly, so it stays
   *  correct on the very first paint. */
  protected hasFilters = signal(false);

  constructor() {
    this.list.init({
      read: (params) => {
        this.search.setValue(params.get('q') ?? '', { emitEvent: false });
        this.locationFilter.setValue(params.get('location') ?? '', { emitEvent: false });
        this.hasFilters.set(!!params.get('q') || !!params.get('location'));
      },
      write: () => ({
        q: this.search.value || null,
        location: this.locationFilter.value || null,
      }),
      load: (page) => this.store.dispatch(new EquipmentLoadList(this.query(page))),
    });
    this.list.bindFilters({
      debounced: [this.search, this.locationFilter],
    });
  }

  private query(page: number): PortalEquipmentQuery {
    return {
      page,
      limit: this.list.PAGE_SIZE,
      search: this.search.value || undefined,
      location: this.locationFilter.value || undefined,
    };
  }

  protected openEquipment(unit: PortalEquipmentListItem): void {
    this.router.navigate(['/equipment', unit.id]);
  }
}
