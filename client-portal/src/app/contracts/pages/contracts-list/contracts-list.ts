import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { TagModule } from 'primeng/tag';
import { LucideEye, LucideFileSignature, LucideFileSpreadsheet, LucideFileText } from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { ContractsState } from '../../../../state/contracts/contracts.state';
import { ContractsLoadList } from '../../../../state/contracts/contracts.actions';
import { ListQueryService, keyIn } from '../../../services/table/list-query.service';
import { tableLoading } from '../../../services/table/table-loading';
import { CONTRACT_TYPE_LABELS } from '../../../model/constants/contract/contract-type-labels.const';
import { CONTRACT_VALIDITY_LABELS } from '../../../model/constants/contract/contract-validity-labels.const';
import {
  ContractFileGlyphPipe,
  ContractTypeLabelPipe,
  ContractValidityLabelPipe,
  ContractValiditySeverityPipe,
} from '../../../pipes/contract.pipe';
import { FiltersPopover } from '../../../shared/components/filters-popover/filters-popover';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { toCalendarDate } from '../../../data/utils';
import type { PortalContractListItem } from '../../../data/dtos/portal-contract/portal-contract-list-item.dto';
import type { PortalContractsQuery } from '../../../data/dtos/portal-contract/portal-contracts-query.dto';
import type { ContractType } from '../../../model/enums/contract/contract-type.enum';
import type { ContractValidity } from '../../../model/enums/contract/contract-validity.enum';

/** Contratos (04 §4): server-paginated list, filters + page persisted in the
 *  URL — the same `ListQueryService` idiom Reportes uses. The backend scopes
 *  rows to the token's customer and to live (non-deleted) rows only (A7). */
@Component({
  selector: 'app-contracts-list',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    TableModule,
    SelectModule,
    InputTextModule,
    DatePickerModule,
    TagModule,
    ContractTypeLabelPipe,
    ContractValidityLabelPipe,
    ContractValiditySeverityPipe,
    ContractFileGlyphPipe,
    FiltersPopover,
    PageHeader,
    LucideEye,
    LucideFileSignature,
    LucideFileSpreadsheet,
    LucideFileText,
  ],
  providers: [ListQueryService],
  templateUrl: './contracts-list.html',
})
export class ContractsList {
  private readonly store = inject(Store);
  private readonly router = inject(Router);
  protected readonly list = inject(ListQueryService);

  protected contracts = select(ContractsState.items);
  protected total = select(ContractsState.total);
  protected loading = select(ContractsState.loading);
  protected tableBusy = tableLoading(this.loading, this.contracts);

  private readonly ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  protected search = new FormControl('', { nonNullable: true });
  protected typeFilter = new FormControl<ContractType | ''>('', { nonNullable: true });
  protected validityFilter = new FormControl<ContractValidity | ''>('', { nonNullable: true });
  protected dateRange = new FormControl<Date[] | null>(null);

  protected typeOptions = [
    { label: 'Todos los tipos', value: '' },
    ...(Object.entries(CONTRACT_TYPE_LABELS) as [ContractType, string][]).map(([value, label]) => ({
      label,
      value,
    })),
  ];
  protected validityOptions = [
    { label: 'Cualquier vigencia', value: '' },
    ...(Object.entries(CONTRACT_VALIDITY_LABELS) as [ContractValidity, string][]).map(
      ([value, label]) => ({ label, value }),
    ),
  ];

  /** Distinguishes the empty states (04 §1): "nothing here yet" vs "nothing
   *  matches your filters". Set from the URL params directly, so it stays
   *  correct on the very first paint. */
  protected hasFilters = signal(false);

  constructor() {
    this.list.init({
      read: (params) => {
        const from = this.parseDateParam(params.get('from'));
        const to = this.parseDateParam(params.get('to'));
        this.search.setValue(params.get('q') ?? '', { emitEvent: false });
        this.typeFilter.setValue(keyIn(CONTRACT_TYPE_LABELS, params.get('type')), {
          emitEvent: false,
        });
        this.validityFilter.setValue(keyIn(CONTRACT_VALIDITY_LABELS, params.get('validity')), {
          emitEvent: false,
        });
        this.dateRange.setValue(from ? (to ? [from, to] : [from]) : null, { emitEvent: false });
        this.hasFilters.set(
          !!params.get('q') ||
            !!params.get('type') ||
            !!params.get('validity') ||
            !!params.get('from') ||
            !!params.get('to'),
        );
      },
      write: () => {
        const range = this.dateRange.value;
        return {
          q: this.search.value || null,
          type: this.typeFilter.value || null,
          validity: this.validityFilter.value || null,
          from: range?.[0] ? toCalendarDate(range[0]) : null,
          to: range?.[1] ? toCalendarDate(range[1]) : null,
        };
      },
      load: (page) => this.store.dispatch(new ContractsLoadList(this.query(page))),
    });
    this.list.bindFilters({
      debounced: [this.search],
      instant: [this.typeFilter, this.validityFilter, this.dateRange],
    });
  }

  private query(page: number): PortalContractsQuery {
    const range = this.dateRange.value;
    return {
      page,
      limit: this.list.PAGE_SIZE,
      search: this.search.value || undefined,
      type: this.typeFilter.value || undefined,
      validity: this.validityFilter.value || undefined,
      dateFrom: range?.[0] ? toCalendarDate(range[0]) : undefined,
      dateTo: range?.[1] ? toCalendarDate(range[1]) : undefined,
    };
  }

  /** Local-midnight parse of a sanitized `YYYY-MM-DD` URL param — anything
   *  malformed is dropped, never fed to the picker or the API. */
  private parseDateParam(value: string | null): Date | null {
    if (!value || !this.ISO_DATE.test(value)) return null;
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  protected openContract(contract: PortalContractListItem): void {
    this.router.navigate(['/contracts', contract.id]);
  }
}
