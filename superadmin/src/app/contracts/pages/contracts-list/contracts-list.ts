import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { LucideEye, LucideFileSignature, LucidePlus } from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { ContractsState } from '../../../../state/contracts/contracts.state';
import { LoadContracts } from '../../../../state/contracts/contracts.actions';
import { ListQueryService, keyIn } from '../../../services/table/list-query.service';
import { CONTRACT_TYPE_LABELS } from '../../../model/constants/contract/contract-type-labels.const';
import { CONTRACT_VALIDITY_LABELS } from '../../../model/constants/contract/contract-validity-labels.const';
import {
  ContractTypeLabelPipe,
  ContractValidityLabelPipe,
  ContractValiditySeverityPipe,
} from '../../../pipes/contract.pipe';
import { FiltersPopover } from '../../../shared/components/filters-popover/filters-popover';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import type { ContractType } from '../../../model/enums/contract/contract-type.enum';
import type { ContractValidity } from '../../../model/enums/contract/contract-validity.enum';
import type { Contract } from '../../../data/dtos/contract/contract';
import type { ContractListQuery } from '../../../data/dtos/contract/contract-requests';
import { CustomerSelect } from '../../../shared/components/customer-select/customer-select';

/** The filing cabinet (13 §6). Filters + page persist as GET query params
 *  (?q&customer&type&validity&tag&page) through ListQueryService (05 §3 canon).
 *
 *  The **validity** column is not computed here: the backend derives it from the
 *  dates and the same rule drives the filter, so the pill and the filtered set
 *  can never disagree. */
@Component({
  selector: 'app-contracts-list',
  imports: [CustomerSelect, 
    RouterLink,
    ReactiveFormsModule,
    TableModule,
    SelectModule,
    InputTextModule,
    TagModule,
    ContractTypeLabelPipe,
    ContractValidityLabelPipe,
    ContractValiditySeverityPipe,
    FiltersPopover,
    PageHeader,
    LucidePlus,
    LucideEye,
    LucideFileSignature,
  ],
  providers: [ListQueryService],
  templateUrl: './contracts-list.html',
})
export class ContractsList {
  private store = inject(Store);
  private router = inject(Router);
  protected list = inject(ListQueryService);

  protected contracts = select(ContractsState.items);
  protected total = select(ContractsState.total);
  protected loading = select(ContractsState.loading);

  protected search = new FormControl('', { nonNullable: true });
  protected customerFilter = new FormControl('', { nonNullable: true });
  protected typeFilter = new FormControl<ContractType | ''>('', { nonNullable: true });
  protected validityFilter = new FormControl<ContractValidity | ''>('', { nonNullable: true });
  protected tagFilter = new FormControl('', { nonNullable: true });
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

  constructor() {
    this.list.init({
      read: (params) => {
        this.search.setValue(params.get('q') ?? '', { emitEvent: false });
        this.customerFilter.setValue(params.get('customer') ?? '', { emitEvent: false });
        this.typeFilter.setValue(keyIn(CONTRACT_TYPE_LABELS, params.get('type')), {
          emitEvent: false,
        });
        this.validityFilter.setValue(keyIn(CONTRACT_VALIDITY_LABELS, params.get('validity')), {
          emitEvent: false,
        });
        this.tagFilter.setValue(params.get('tag') ?? '', { emitEvent: false });
      },
      write: () => ({
        q: this.search.value || null,
        customer: this.customerFilter.value || null,
        type: this.typeFilter.value || null,
        validity: this.validityFilter.value || null,
        tag: this.tagFilter.value || null,
      }),
      load: (page) => this.store.dispatch(new LoadContracts(this.query(page))),
    });
    this.list.bindFilters({
      debounced: [this.search],
      instant: [this.customerFilter, this.typeFilter, this.validityFilter, this.tagFilter],
    });
  }

  private query(page: number): ContractListQuery {
    return {
      page,
      limit: this.list.PAGE_SIZE,
      search: this.search.value || undefined,
      customerId: this.customerFilter.value || undefined,
      type: this.typeFilter.value || undefined,
      validity: this.validityFilter.value || undefined,
      tag: this.tagFilter.value || undefined,
    };
  }

  /** Row click → the contract view (canon whole-row idiom). A contract has a
   *  detail worth a page: the stored document and the units it covers. */
  protected openContract(contract: Contract): void {
    this.router.navigate(['/contracts', contract.id]);
  }

  /** Clicking a tag chip filters by it — the fastest path through a filing
   *  cabinet is usually "more like this one". */
  protected filterByTag(tag: string): void {
    this.tagFilter.setValue(tag);
  }
}
