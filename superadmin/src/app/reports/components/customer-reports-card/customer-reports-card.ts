import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TagModule } from 'primeng/tag';
import { LucideFileText } from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { ReportsState } from '../../../../state/reports/reports.state';
import { LoadCustomerReports } from '../../../../state/reports/reports.actions';
import { ReportStatusLabelPipe, ReportStatusSeverityPipe } from '../../../pipes/report-status.pipe';

/** Client service history (06 → customer 360 "Servicios" tab). Compact,
 *  read-only list of the client's reports (folio/date, technician, status),
 *  each row linking through to 06's report view. The activity trail (08) shows
 *  the same reports as "service performed" system entries; this tab is the flat
 *  ledger. */
@Component({
  selector: 'app-customer-reports-card',
  imports: [RouterLink, TagModule, LucideFileText, ReportStatusLabelPipe, ReportStatusSeverityPipe],
  templateUrl: './customer-reports-card.html',
})
export class CustomerReportsCard {
  customerId = input.required<string>();

  private store = inject(Store);

  protected reports = select(ReportsState.customerReports);
  protected loading = select(ReportsState.customerReportsLoading);

  constructor() {
    // input() is available after construction; defer the first load a tick.
    queueMicrotask(() => this.store.dispatch(new LoadCustomerReports(this.customerId())));
  }
}
