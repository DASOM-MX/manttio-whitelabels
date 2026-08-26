import { Component, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { LucideFileSpreadsheet } from '@lucide/angular';
import { QuotationsService } from '../../../services/http/quotations.service';
import { MoneyPipe } from '../../../pipes/money.pipe';
import {
  QuotationShowsOverduePipe,
  QuotationStatusLabelPipe,
  QuotationStatusSeverityPipe,
  QuotationTallyPipe,
} from '../../../pipes/quotation-status.pipe';
import type { QuotationSummary } from '../../../data/dtos/quotation/quotation';
import { tableLoading } from '../../../services/table/table-loading';

/** The client's quotations, mounted in 07's customer view (20 §8).
 *
 *  Reads `GET /customers/:id/quotations` (20 §9). Shows the newest page;
 *  "ver todas" hands off to the full list with the client filter pre-applied.
 *
 *  Fetches through the HTTP service instead of `QuotationsState` so opening a
 *  customer never overwrites the quotations list the user left behind. */
@Component({
  selector: 'app-customer-quotations-card',
  imports: [
    RouterLink,
    TableModule,
    TagModule,
    MoneyPipe,
    QuotationShowsOverduePipe,
    QuotationStatusLabelPipe,
    QuotationStatusSeverityPipe,
    QuotationTallyPipe,
    LucideFileSpreadsheet,
  ],
  templateUrl: './customer-quotations-card.html',
})
export class CustomerQuotationsCard {
  customerId = input.required<string>();

  private quotationsService = inject(QuotationsService);

  protected quotations = signal<QuotationSummary[]>([]);
  protected total = signal(0);
  protected loading = signal(true);
  protected tableBusy = tableLoading(this.loading, this.quotations);
  protected readonly pageSize = 5;
  protected readonly skeletonRows = [0, 1, 2];

  constructor() {
    // input() is available after construction; defer the first load a tick.
    queueMicrotask(() => this.load());
  }

  private load(): void {
    this.loading.set(true);
    this.quotationsService
      .listForCustomer(this.customerId(), { page: 1, limit: this.pageSize })
      .subscribe({
        next: ({ items, total }) => {
          this.quotations.set(items);
          this.total.set(total);
          this.loading.set(false);
        },
        error: () => {
          this.quotations.set([]);
          this.total.set(0);
          this.loading.set(false);
        },
      });
  }
}
