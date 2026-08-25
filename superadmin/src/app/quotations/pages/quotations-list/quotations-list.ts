import { Component, computed, inject, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { LucideFileSpreadsheet, LucidePlus, LucideSettings2 } from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { QuotationsState } from '../../../../state/quotations/quotations.state';
import { AuthState } from '../../../../state/auth/auth.state';
import { hasRole } from '../../../guards/has-role.guard';
import { QuotationSettingsDialog } from '../../components/quotation-settings-dialog/quotation-settings-dialog';
import { LoadQuotations } from '../../../../state/quotations/quotations.actions';
import { ListQueryService, keyIn } from '../../../services/table/list-query.service';
import { QUOTATION_STATUS_LABELS } from '../../../model/constants/quotation/quotation-status-labels.const';
import { QuotationStatus } from '../../../model/enums/quotation/quotation-status.enum';
import {
  QuotationShowsOverduePipe,
  QuotationStatusLabelPipe,
  QuotationStatusSeverityPipe,
  QuotationTallyPipe,
} from '../../../pipes/quotation-status.pipe';
import { MoneyPipe } from '../../../pipes/money.pipe';
import { FiltersPopover } from '../../../shared/components/filters-popover/filters-popover';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import type { QuotationListQuery } from '../../../data/dtos/quotation/quotation-requests';
import type { QuotationSummary } from '../../../data/dtos/quotation/quotation';
import { CustomerSelect } from '../../../shared/components/customer-select/customer-select';

/** Quotations list (20 §8) — lazy server-side table with folio/client search,
 *  client and status filters, all persisted as URL query params through
 *  ListQueryService (users-list is canon).
 *
 *  The client select is capped at the first 100 customers: it is a convenience
 *  filter, and the search box already reaches any quote by folio or client
 *  name. */
@Component({
  selector: 'app-quotations-list',
  imports: [CustomerSelect, 
    DatePipe,
    RouterLink,
    ReactiveFormsModule,
    TableModule,
    SelectModule,
    InputTextModule,
    TagModule,
    MoneyPipe,
    QuotationShowsOverduePipe,
    QuotationStatusLabelPipe,
    QuotationStatusSeverityPipe,
    QuotationTallyPipe,
    FiltersPopover,
    PageHeader,
    QuotationSettingsDialog,
    LucidePlus,
    LucideFileSpreadsheet,
    LucideSettings2,
  ],
  providers: [ListQueryService],
  templateUrl: './quotations-list.html',
})
export class QuotationsList {
  private store = inject(Store);
  private router = inject(Router);
  protected list = inject(ListQueryService);

  protected quotations = select(QuotationsState.items);
  protected total = select(QuotationsState.total);
  protected loading = select(QuotationsState.loading);

  protected search = new FormControl('', { nonNullable: true });
  protected statusFilter = new FormControl<QuotationStatus | ''>('', { nonNullable: true });
  protected customerFilter = new FormControl('', { nonNullable: true });
  protected dueFilter = new FormControl<'' | 'soon' | 'overdue'>('', { nonNullable: true });

  private me = select(AuthState.me);
  /** The default terms speak for the tenant — owner/admin edit them. */
  protected canEditSettings = computed(() => hasRole(this.me(), ['owner', 'admin']));
  protected settingsDialog = viewChild<QuotationSettingsDialog>('settingsDialog');

  protected readonly dueOptions = [
    { label: 'Todas las vigencias', value: '' },
    { label: 'Por vencer (7 días)', value: 'soon' },
    { label: 'Vencidas', value: 'overdue' },
  ];

  protected statusOptions = [
    { label: 'Todos los estados', value: '' },
    ...(Object.entries(QUOTATION_STATUS_LABELS) as [QuotationStatus, string][]).map(
      ([value, label]) => ({ label, value }),
    ),
  ];

  protected readonly skeletonRows = [0, 1, 2, 3, 4, 5, 6, 7];
  protected readonly skeletonColumns = [0, 1, 2, 3, 4, 5, 6];

  constructor() {
    this.list.init({
      read: (params) => {
        this.search.setValue(params.get('q') ?? '', { emitEvent: false });
        this.statusFilter.setValue(keyIn(QUOTATION_STATUS_LABELS, params.get('status')), {
          emitEvent: false,
        });
        this.customerFilter.setValue(params.get('customerId') ?? '', { emitEvent: false });
        const due = params.get('due');
        this.dueFilter.setValue(due === 'soon' || due === 'overdue' ? due : '', {
          emitEvent: false,
        });
      },
      write: () => ({
        q: this.search.value || null,
        status: this.statusFilter.value || null,
        customerId: this.customerFilter.value || null,
        due: this.dueFilter.value || null,
      }),
      load: (page) => this.store.dispatch(new LoadQuotations(this.query(page))),
    });
    this.list.bindFilters({
      debounced: [this.search],
      instant: [this.statusFilter, this.customerFilter, this.dueFilter],
    });
  }

  private query(page: number): QuotationListQuery {
    return {
      page,
      limit: this.list.PAGE_SIZE,
      q: this.search.value || undefined,
      status: this.statusFilter.value || undefined,
      customerId: this.customerFilter.value || undefined,
      due: this.dueFilter.value || undefined,
    };
  }

  protected openSettings(): void {
    this.settingsDialog()?.open();
  }

  protected openQuotation(quotation: QuotationSummary): void {
    this.router.navigate(['/quotations', quotation.id]);
  }
}
