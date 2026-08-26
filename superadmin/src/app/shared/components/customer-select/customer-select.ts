import {
  Component,
  DestroyRef,
  computed,
  forwardRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule, NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import type { ScrollerOptions } from 'primeng/api';
import {
  Observable,
  Subject,
  catchError,
  debounceTime,
  defer,
  distinctUntilChanged,
  finalize,
  of,
} from 'rxjs';
import { CustomersService } from '../../../services/http/customers.service';
import type { Option } from '../../../data/types/option';

/** Clients arrive a page at a time as the overlay scrolls (owner 2026-08-18,
 *  extended to every customer select 2026-08-25) — the roster runs to 1000+
 *  rows on a real tenant, and loading all of it to open a form or a filter is
 *  the thing this avoids. `p-select`'s lazy virtual scroll asks for the visible
 *  row window; we translate that window into pages and fill the slots. */
const PAGE_SIZE = 65;
const ROW_HEIGHT = 40;
const SEARCH_DEBOUNCE_MS = 300;

/** Slot text before its page arrives — the scroller sizes rows off the array,
 *  so every index must hold something from the start. */
const PLACEHOLDER: Option = { label: '…', value: '' };

/** The row window the virtual scroller asks for. */
interface ScrollerLazyLoadEvent {
  first: number;
  last: number;
}

/** The one customer picker (21 §4). Every customer select in the app is this
 *  component: filter dropdowns, form pickers and the contract form alike.
 *
 *  It exists because `GET /customers` is paged — a select that reads the whole
 *  roster shows the first page of choices and silently hides the rest, which is
 *  the failure mode 21 is about. The paging, the sparse array and the
 *  server-side search live here once instead of in each call site.
 *
 *  A CVA, so call sites bind `formControlName` and never see any of it. */
@Component({
  selector: 'app-customer-select',
  imports: [FormsModule, SelectModule],
  templateUrl: './customer-select.html',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomerSelect),
      multi: true,
    },
  ],
})
export class CustomerSelect implements ControlValueAccessor {
  private readonly api = inject(CustomersService);
  private readonly destroyRef = inject(DestroyRef);

  readonly inputId = input<string>();
  readonly placeholder = input('Elige un cliente');
  /** Label for a leading "no filter" entry, e.g. "Todos los clientes". Set on
   *  filter dropdowns; omitted on form pickers, where an empty choice is not a
   *  valid answer. It is held outside the sparse array and offsets the row
   *  window by one, so it can never be overwritten by a page fill. */
  readonly allOptionLabel = input<string>();
  readonly ariaLabelledBy = input<string>();

  /** The chosen client, label included. Fires on a user pick **and** whenever
   *  a programmatically-written value (edit forms, `?from=` prefills) has its
   *  label resolved — a lazily-paged select cannot assume the row is loaded, so
   *  callers that need the name would otherwise have nowhere to get it. */
  readonly selectionChange = output<Option | null>();

  protected readonly rowHeight = ROW_HEIGHT;
  /** No `delay`/`showLoader`. The scroller's own loader is a *scroll* indicator,
   *  not a fetch one: with a delay set it flips `d_loading` on any geometric
   *  range change — scrolling back over rows already in hand included — and
   *  while that flag is up the panel renders no options at all, only the mask.
   *  The footer label below reports actual requests instead, and unfetched rows
   *  keep showing their `…` placeholder. */
  protected readonly scrollOptions: ScrollerOptions = {
    lazy: true,
    onLazyLoad: (event: ScrollerLazyLoadEvent) => this.onLazyLoad(event),
  };

  /** Sparse: sized to the roster's total on first load, filled page by page as
   *  the overlay scrolls. */
  protected options = signal<Option[]>([]);
  protected value = signal('');
  protected disabled = signal(false);

  /** Roster requests in flight. A count rather than a flag: a row window can
   *  straddle two pages and ask for both, and the first to settle must not
   *  clear the label while the second is still running. */
  private readonly pending = signal(0);
  protected readonly fetching = computed(() => this.pending() > 0);

  private loadedPages = new Set<number>();
  private search = new Subject<string>();
  /** True while a search term is active: the array is then a materialized
   *  result list, not a sparse roster, so lazy fills must not run against it. */
  private searching = false;

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor() {
    this.search
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((term) => this.runSearch(term));
    this.seed();
  }

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
    if (!value) {
      this.selectionChange.emit(null);
      return;
    }
    const known = this.options().find((o) => o.value === value);
    if (known) this.selectionChange.emit(known);
    else this.resolveSelected();
  }
  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  protected onSelect(value: string): void {
    this.value.set(value);
    this.onChange(value);
    this.onTouched();
    this.selectionChange.emit(this.options().find((o) => o.value === value) ?? null);
  }

  protected onFilter(term: string): void {
    this.search.next(term.trim());
  }

  /** Counts a roster request for the footer label. `defer` so the increment
   *  happens on subscribe, pairing with `finalize` on teardown — success,
   *  error and unsubscribe alike. */
  private track<T>(source: Observable<T>): Observable<T> {
    return defer(() => {
      this.pending.update((n) => n + 1);
      return source;
    }).pipe(finalize(() => this.pending.update((n) => n - 1)));
  }

  /** How many leading slots the "all" entry occupies. */
  private get offset(): number {
    return this.allOptionLabel() ? 1 : 0;
  }

  private head(): Option[] {
    const label = this.allOptionLabel();
    return label ? [{ label, value: '' }] : [];
  }

  /** First page doubles as the roster's size probe: `total` fixes the array
   *  length, so the scrollbar is honest before the rest has been fetched. */
  private seed(): void {
    this.searching = false;
    this.loadedPages.clear();
    this.loadedPages.add(1);
    this.track(
      this.api.list({ page: 1, limit: PAGE_SIZE }).pipe(catchError(() => of(null))),
    ).subscribe((res) => {
      if (!res) {
        this.loadedPages.delete(1);
        return;
      }
      const options = [...this.head(), ...new Array<Option>(res.total).fill(PLACEHOLDER)];
      this.fill(options, 1, res.items);
      this.options.set(options);
      this.resolveSelected();
    });
  }

  /** The scroller reports a row window; a window can straddle two pages. */
  private onLazyLoad(event: ScrollerLazyLoadEvent): void {
    if (this.searching) return;
    const off = this.offset;
    const firstRow = Math.max(event.first - off, 0);
    const lastRow = Math.max(event.last - 1 - off, firstRow);
    const firstPage = Math.floor(firstRow / PAGE_SIZE) + 1;
    const lastPage = Math.floor(lastRow / PAGE_SIZE) + 1;
    for (let page = firstPage; page <= lastPage; page++) this.loadPage(page);
  }

  private loadPage(page: number): void {
    if (this.loadedPages.has(page)) return;
    // Claimed before the request: the scroller re-fires while one is in flight.
    this.loadedPages.add(page);
    this.track(
      this.api.list({ page, limit: PAGE_SIZE }).pipe(catchError(() => of(null))),
    ).subscribe((res) => {
      if (!res) {
        this.loadedPages.delete(page);
        return;
      }
      const options = [...this.options()];
      this.fill(options, page, res.items);
      this.options.set(options);
    });
  }

  /** Typing queries the server instead of the loaded slice.
   *
   *  Results are materialized in full, with **no placeholder rows** —
   *  `p-select` filters its options array client-side whenever a term is set,
   *  so the `…` slots would be dropped and the sparse tail (with its lazy
   *  loading) would go with them. Real rows survive that pass unchanged, since
   *  the server matched on the same names the local filter re-checks.
   *
   *  The trade: a term shows the first `PAGE_SIZE` matches and does not page
   *  further. Narrowing the term is the way to reach the rest — which is what
   *  someone typing a client's name is already doing. Clearing it restores the
   *  full lazily-paged roster. */
  private runSearch(term: string): void {
    if (!term) {
      this.seed();
      return;
    }
    this.track(
      this.api.list({ page: 1, limit: PAGE_SIZE, search: term }).pipe(catchError(() => of(null))),
    ).subscribe((res) => {
      if (!res) return;
      this.searching = true;
      this.loadedPages.clear();
      this.options.set([
        ...this.head(),
        ...res.items.map((customer) => ({ label: customer.name, value: customer.id })),
      ]);
    });
  }

  /** A preselected client (edit forms, `?from=` prefills) is usually not in the
   *  first page, and `p-select` renders nothing for a value it cannot find. One
   *  single read resolves its label and parks it in its slot — cheaper and more
   *  honest than making every caller pass a name it may not have. */
  private resolveSelected(): void {
    const id = this.value();
    if (!id) return;
    const current = this.options();
    if (current.some((o) => o.value === id)) return;
    this.api
      .get(id)
      .pipe(catchError(() => of(null)))
      .subscribe((customer) => {
        if (!customer) return;
        const option: Option = { label: customer.name, value: customer.id };
        const options = [...this.options()];
        const slot = options.findIndex((o) => o.value === PLACEHOLDER.value);
        if (slot >= 0) options[slot] = option;
        else options.push(option);
        this.options.set(options);
        this.selectionChange.emit(option);
      });
  }

  private fill(options: Option[], page: number, items: { id: string; name: string }[]): void {
    const start = this.offset + (page - 1) * PAGE_SIZE;
    items.forEach((customer, i) => {
      options[start + i] = { label: customer.name, value: customer.id };
    });
  }
}
