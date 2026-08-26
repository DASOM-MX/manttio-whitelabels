import { Component, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TableModule } from 'primeng/table';
import { LucideHistory } from '@lucide/angular';
import { CustomersService } from '../../../services/http/customers.service';
import { InteractionRefKind } from '../../../model/enums/interaction/interaction-ref-kind.enum';
import { RelativeTimePipe } from '../../../pipes/relative-time.pipe';
import { tableLoading } from '../../../services/table/table-loading';
import type { Interaction } from '../../../data/dtos/interaction';

/** A contract's audit trail (13 §3/§6) — created, edited, document replaced,
 *  deleted.
 *
 *  Contracts have **no events table of their own**: every lifecycle entry is
 *  appended to the client's `customer_interactions` timeline, which is the one
 *  anchor that works for order-generated and standalone contracts alike. So the
 *  card reads the client timeline narrowed to this contract
 *  (`?refKind=contract&refId=…`, added for exactly this in CP-3) rather than
 *  paging a client's whole history and filtering here — on an active client the
 *  contract's entries would simply not be on the page that came back.
 *
 *  Fetched through the HTTP service, not `CustomersState`, so opening a
 *  contract never overwrites the timeline a customer view left in state. */
/** Append the next page, dropping ids already on screen.
 *
 *  Offset paging over an **append-only, newest-first** feed overlaps by
 *  construction: one entry written between two page reads shifts the whole
 *  window down, so page 2 repeats page 1's last row. Unchecked that duplicates
 *  a `dataKey="id"` — two table rows claiming the same key. */
const merge = (current: Interaction[], next: Interaction[]): Interaction[] => {
  const seen = new Set(current.map((e) => e.id));
  return [...current, ...next.filter((e) => !seen.has(e.id))];
};

@Component({
  selector: 'app-contract-audit-card',
  imports: [DatePipe, TableModule, RelativeTimePipe, LucideHistory],
  templateUrl: './contract-audit-card.html',
})
export class ContractAuditCard {
  contractId = input.required<string>();
  /** The client the trail hangs on — a contract's `customerId` is immutable, so
   *  this never drifts from the entries it reads. */
  customerId = input.required<string>();

  private customersApi = inject(CustomersService);

  protected entries = signal<Interaction[]>([]);
  protected total = signal(0);
  /** **One** in-flight marker, not a boolean per request kind: two flags can
   *  disagree, and each response would clear both — including the one belonging
   *  to a request still running. `null` means idle. */
  private inFlight = signal<'first' | 'more' | null>('first');
  private page = signal(1);

  protected readonly pageSize = 8;
  protected readonly skeletonRows = [0, 1, 2];

  protected loadingMore = computed(() => this.inFlight() === 'more');

  /** Only a page-1 read can replace what is on screen — "load more" appends,
   *  and `loadingMore` is the affordance for that. */
  protected tableBusy = tableLoading(
    computed(() => this.inFlight() === 'first'),
    this.entries,
  );

  protected hasMore = computed(() => this.entries().length < this.total());

  constructor() {
    // input() is available after construction; defer the first load a tick.
    queueMicrotask(() => this.load(1));
  }

  protected loadMore(): void {
    if (this.inFlight()) return;
    this.inFlight.set('more');
    this.load(this.page() + 1);
  }

  private load(page: number): void {
    this.inFlight.set(page === 1 ? 'first' : 'more');
    this.customersApi
      .listInteractions(this.customerId(), {
        page,
        limit: this.pageSize,
        refKind: InteractionRefKind.Contract,
        refId: this.contractId(),
      })
      .subscribe({
        next: ({ items, total }) => {
          this.page.set(page);
          this.entries.update((current) => (page === 1 ? items : merge(current, items)));
          this.total.set(total);
          this.inFlight.set(null);
        },
        error: () => {
          // A trail that fails to load reads as an empty card rather than an
          // error banner — the contract itself is what this page is about.
          if (page === 1) {
            this.entries.set([]);
            this.total.set(0);
          }
          this.inFlight.set(null);
        },
      });
  }
}
