import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { catchError, debounceTime, distinctUntilChanged, of } from 'rxjs';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import {
  LucideChevronLeft,
  LucideChevronRight,
  LucideFlag,
  LucidePlus,
  LucideX,
} from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { VisitsState } from '../../../../state/visits/visits.state';
import { LoadVisits } from '../../../../state/visits/visits.actions';
import { AuthState } from '../../../../state/auth/auth.state';
import { hasRole } from '../../../guards/has-role.guard';
import { UsersService } from '../../../services/http/users.service';
import { WEEKDAY_SHORT_LABELS } from '../../../model/constants/calendar/weekday-short-labels.const';
import { WEEKDAY_INITIALS } from '../../../model/constants/calendar/weekday-initials.const';
import { MONTH_SHORT_LABELS } from '../../../model/constants/calendar/month-short-labels.const';
import { MONTH_LABELS } from '../../../model/constants/calendar/month-labels.const';
import { HOUR_LABELS } from '../../../model/constants/calendar/hour-labels.const';
import {
  CALENDAR_VIEW_CYCLE,
  CalendarView,
} from '../../../model/enums/calendar/calendar-view.enum';
import {
  TechnicianDotClassPipe,
  VisitBlockClassPipe,
  VisitDurationPipe,
  VisitHoverCardPipe,
  VisitPriorityFlagClassPipe,
  VisitStatusLabelPipe,
  VisitStatusSeverityPipe,
} from '../../../pipes/visit.pipe';
import { VisitDialog } from '../../components/visit-dialog/visit-dialog';
import { CloseVisitDialog } from '../../components/close-visit-dialog/close-visit-dialog';
import { RescheduleVisitDialog } from '../../components/reschedule-visit-dialog/reschedule-visit-dialog';
import { CorrectActualsDialog } from '../../components/correct-actuals-dialog/correct-actuals-dialog';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { FiltersPopover } from '../../../shared/components/filters-popover/filters-popover';
import { VISIT_CODE_PATTERN } from '../../../model/constants/visit/visit-code.const';
import { addDays, errorMessage, startOfDay, toCalendarDate } from '../../../data/utils';
import { monthGridStart, rangeForView, stepAnchor } from '../../../data/calendar-range';
import { layOutDay, visitDayKey } from '../../../data/calendar-layout';
import type {
  CalendarDay,
  MonthDayCell,
  YearMonthCell,
} from '../../../data/types/calendar/visit-block.type';
import type { AssignableUser } from '../../../data/dtos/user';
import type { Visit } from '../../../data/dtos/visit';

/** The backlog entry of the technician filter — same sentinel the API uses. */
const UNASSIGNED = 'unassigned';

/** Matches the list pages' search debounce (`ListQueryService`) so every search
 *  box in the app reacts at the same speed. */
const SEARCH_DEBOUNCE_MS = 300;

/** How many visits a month cell lists before collapsing the rest into a count.
 *  Three fits the cell at every viewport that renders the month grid. */
const MONTH_CELL_VISIBLE = 3;

/** Six rows of seven — the month grid is a fixed size, see `monthGridStart`. */
const MONTH_GRID_DAYS = 42;

/** The team calendar (12 §3). Four views over one visits read, chosen by
 *  clicking the corner label (owner 2026-08-03):
 *
 *  - **Día / Semana** — the 24-hour time axis, one column or seven. Visits are
 *    blocks positioned and sized by their times, overlapping ones split the
 *    column, and a visit with recorded times draws twice — the booking as a
 *    faint ghost, the real thing solid on top — so the period reads as
 *    plan-vs-actual at a glance. This is the working view: scheduling happens
 *    against clock time.
 *  - **Mes** — six weeks of day cells, each a short list. No time axis: a month
 *    of 24-hour columns is unreadable, and at this zoom the question is "how
 *    full is the 14th", not "what time".
 *  - **Año** — twelve months by visit count, for the question a month cannot
 *    answer: which parts of the year are heavy.
 *
 *  All of it lives in the URL (`?view&date&tech&code`) with `queryParamMap` as
 *  the single load path, the same discipline as the list pages. A code search
 *  overrides the view entirely — a match can land in any period, so it renders
 *  as a result list instead.
 *
 *  Moves are dialog-driven; there is no drag-and-drop in v1. */
@Component({
  selector: 'app-calendar',
  imports: [
    DatePipe,
    NgTemplateOutlet,
    ReactiveFormsModule,
    DatePickerModule,
    InputTextModule,
    MultiSelectModule,
    TableModule,
    TagModule,
    TooltipModule,
    TechnicianDotClassPipe,
    VisitBlockClassPipe,
    VisitDurationPipe,
    VisitHoverCardPipe,
    VisitPriorityFlagClassPipe,
    VisitStatusLabelPipe,
    VisitStatusSeverityPipe,
    VisitDialog,
    CloseVisitDialog,
    RescheduleVisitDialog,
    CorrectActualsDialog,
    PageHeader,
    FiltersPopover,
    LucideChevronLeft,
    LucideChevronRight,
    LucideFlag,
    LucidePlus,
    LucideX,
  ],
  templateUrl: './calendar.html',
  styleUrl: './calendar.scss',
})
export class Calendar {
  private store = inject(Store);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private messages = inject(MessageService);

  protected visits = select(VisitsState.items);
  protected loading = select(VisitsState.loading);
  private me = select(AuthState.me);

  protected canSchedule = computed(() => hasRole(this.me(), ['owner', 'admin', 'office']));

  /** The date every view is built around: the day shown, the week containing
   *  it, the month containing it, the year containing it. One anchor for all
   *  four means switching views never loses your place. */
  private anchor = signal(startOfDay(new Date()));
  private view = signal<CalendarView>(CalendarView.Week);
  /** The technician filter as the URL carries it — user ids + the
   *  `unassigned` sentinel; empty = everyone. */
  private techSelection = signal<string[]>([]);
  /** A code prefix from the URL. Non-empty swaps the page into search mode. */
  protected codeQuery = signal('');

  protected techFilter = new FormControl<string[]>([], { nonNullable: true });
  protected jumpControl = new FormControl<Date | null>(null);
  protected codeControl = new FormControl('', { nonNullable: true });
  /** Inline message under the code field — see `applyCode`. */
  protected codeError = signal('');

  /** What the popover's badge counts and what its Limpiar clears. `view` and
   *  `date` are deliberately absent: they are always in the URL after any
   *  navigation, so counting them would peg the badge at 2 forever, and
   *  clearing filters must not throw away the period you were looking at. */
  protected readonly filterParams = ['code', 'tech'];

  protected technicians = toSignal(
    inject(UsersService)
      .listAssignable()
      .pipe(catchError(() => of([] as AssignableUser[]))),
    { initialValue: [] as AssignableUser[] },
  );

  protected techOptions = computed(() => [
    { label: 'Sin asignar', value: UNASSIGNED },
    ...this.technicians().map((user) => ({ label: user.fullName, value: user.id })),
  ]);

  protected searching = computed(() => this.codeQuery().length > 0);

  protected isDayView = computed(() => this.view() === CalendarView.Day);
  protected isTimeAxis = computed(
    () => this.view() === CalendarView.Day || this.view() === CalendarView.Week,
  );
  protected isMonthView = computed(() => this.view() === CalendarView.Month);
  protected isYearView = computed(() => this.view() === CalendarView.Year);

  /** What the corner label reads, and what clicking it will show next. Each view
   *  names the period it is actually showing — and no more: the day-of-month
   *  numbers are already across the header row in day and week, so repeating
   *  them there would spend the width saying what the columns say. */
  protected periodLabel = computed(() => {
    const anchor = this.anchor();
    switch (this.view()) {
      case CalendarView.Day:
        return `${anchor.getDate()} ${MONTH_SHORT_LABELS[anchor.getMonth()]} ${anchor.getFullYear()}`;
      case CalendarView.Month:
        return `${MONTH_LABELS[anchor.getMonth()]} ${anchor.getFullYear()}`;
      case CalendarView.Year:
        return `${anchor.getFullYear()}`;
      default: {
        const { from, to } = rangeForView(CalendarView.Week, anchor);
        const end = addDays(to, -1);
        const a = MONTH_SHORT_LABELS[from.getMonth()];
        const b = MONTH_SHORT_LABELS[end.getMonth()];
        // The one week a year that straddles December names both years; it
        // wraps to a second line in the corner, once a year.
        if (from.getFullYear() !== end.getFullYear()) {
          return `${a} ${from.getFullYear()}–${b} ${end.getFullYear()}`;
        }
        return a === b ? `${a} ${end.getFullYear()}` : `${a}–${b} ${end.getFullYear()}`;
      }
    }
  });

  /** The loaded window, minus whoever the technician filter excludes. Filtering
   *  client-side is right here: the whole period is already in memory, so a
   *  round trip would only make the toggle feel slower. */
  private shownVisits = computed(() => {
    const selection = this.techSelection();
    if (!selection.length) return this.visits();
    return this.visits().filter((visit) => selection.includes(visit.technicianId ?? UNASSIGNED));
  });

  /** Visits bucketed by the day they were booked for — the one grouping all
   *  three grids read from. */
  private byDay = computed(() => {
    const map = new Map<string, Visit[]>();
    for (const visit of this.shownVisits()) {
      const key = visitDayKey(visit);
      const bucket = map.get(key);
      if (bucket) bucket.push(visit);
      else map.set(key, [visit]);
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
    }
    return map;
  });

  /** The time-axis columns: one in day view, seven in week view. */
  protected columns = computed<CalendarDay[]>(() => {
    const today = toCalendarDate(new Date());
    const byDay = this.byDay();
    const dayView = this.isDayView();
    const start = dayView ? this.anchor() : rangeForView(CalendarView.Week, this.anchor()).from;
    const count = dayView ? 1 : 7;
    return Array.from({ length: count }, (_, i) => {
      const date = addDays(start, i);
      const key = toCalendarDate(date);
      return {
        key,
        // In day view the single column names its own weekday; in week view the
        // index is the weekday, which is why the labels are Monday-first.
        label: WEEKDAY_SHORT_LABELS[dayView ? (date.getDay() + 6) % 7 : i],
        dayOfMonth: date.getDate(),
        isToday: key === today,
        blocks: layOutDay(byDay.get(key) ?? []),
      };
    });
  });

  /** Six weeks of day cells. Always six rows — see `monthGridStart`. */
  protected monthCells = computed<MonthDayCell[]>(() => {
    const today = toCalendarDate(new Date());
    const byDay = this.byDay();
    const start = monthGridStart(this.anchor());
    const month = this.anchor().getMonth();
    return Array.from({ length: MONTH_GRID_DAYS }, (_, i) => {
      const date = addDays(start, i);
      const key = toCalendarDate(date);
      const visits = byDay.get(key) ?? [];
      return {
        key,
        dayOfMonth: date.getDate(),
        isToday: key === today,
        inMonth: date.getMonth() === month,
        shown: visits.slice(0, MONTH_CELL_VISIBLE),
        overflow: Math.max(0, visits.length - MONTH_CELL_VISIBLE),
      };
    });
  });

  /** Twelve mini-months, each the same six-week grid the month view draws, with
   *  the days that hold visits tinted. The year's shape reads from where those
   *  tints cluster — no counts, which at this size nobody could read anyway.
   *
   *  The borrowed days at the corners of January and December belong to the
   *  neighbouring *years*, which this range never loaded, so they always show
   *  clear. They are dimmed as out-of-month regardless, and the honest fix
   *  would be loading two extra weeks to render six pixels — not worth it. */
  protected yearCells = computed<YearMonthCell[]>(() => {
    const year = this.anchor().getFullYear();
    const today = toCalendarDate(new Date());
    const now = new Date();
    const byDay = this.byDay();
    return MONTH_LABELS.map((label, index) => {
      const first = new Date(year, index, 1);
      const start = monthGridStart(first);
      return {
        key: `${year}-${String(index + 1).padStart(2, '0')}`,
        label,
        date: toCalendarDate(first),
        isCurrentMonth: year === now.getFullYear() && index === now.getMonth(),
        days: Array.from({ length: MONTH_GRID_DAYS }, (_, i) => {
          const date = addDays(start, i);
          const key = toCalendarDate(date);
          return {
            key,
            dayOfMonth: date.getDate(),
            inMonth: date.getMonth() === index,
            isToday: key === today,
            hasVisits: (byDay.get(key)?.length ?? 0) > 0,
          };
        }),
      };
    });
  });

  /** The single day the phone-sized agenda lists. In day view that is the
   *  anchor itself; in week view, the anchor's day within the shown week. */
  protected agendaDay = computed<CalendarDay>(() => {
    const columns = this.columns();
    const key = toCalendarDate(this.anchor());
    return columns.find((day) => day.key === key) ?? columns[0];
  });

  /** Search results, newest booking first — a code prefix can match a whole
   *  year, and the recent one is nearly always the one being looked for.
   *
   *  Deliberately **not** run through the technician filter: searching a code
   *  means "find me this visit", and hiding the match because a filter left over
   *  from the calendar excludes its assignee would look like the visit does not
   *  exist. */
  protected results = computed(() =>
    [...this.visits()].sort((a, b) => b.scheduledStart.localeCompare(a.scheduledStart)),
  );

  // No period-level empty state on purpose: empty columns on a time axis, and
  // empty cells on a month grid, already say "nothing scheduled" better than a
  // sentence does. The phone agenda keeps its per-day message — an empty *list*
  // renders as blank space, which reads as a page that failed to load.

  protected visitDialog = viewChild<VisitDialog>('visitDialog');
  protected closeDialog = viewChild<CloseVisitDialog>('closeDialog');
  protected rescheduleDialog = viewChild<RescheduleVisitDialog>('rescheduleDialog');
  protected actualsDialog = viewChild<CorrectActualsDialog>('actualsDialog');

  protected readonly hourLabels = HOUR_LABELS;
  protected readonly weekdayLabels = WEEKDAY_SHORT_LABELS;
  protected readonly weekdayInitials = WEEKDAY_INITIALS;

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.view.set(parseView(params.get('view')));
      this.anchor.set(parseDate(params.get('date')));

      const tech = params.get('tech');
      const selection = tech ? tech.split(',') : [];
      this.techSelection.set(selection);
      this.techFilter.setValue(selection, { emitEvent: false });

      const code = (params.get('code') ?? '').trim();
      this.codeQuery.set(code);
      this.codeControl.setValue(code, { emitEvent: false });

      this.load();
    });

    // Filter wiring, same split the list pages use: the search debounces, the
    // rest navigate on the spot. Both read back through `queryParamMap` above,
    // which stays the single load path.
    this.codeControl.valueChanges
      .pipe(debounceTime(SEARCH_DEBOUNCE_MS), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((value) => this.applyCode(value));

    this.techFilter.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((selection) =>
        this.setParams({ tech: selection.length ? selection.join(',') : null }),
      );
  }

  /** What the last dispatch asked the API for. `queryParamMap` is the single
   *  load path and fires for *every* param — including `tech`, whose filtering
   *  is client-side, and a `date` that stays inside the loaded week — so an
   *  identical window is not fetched twice. `reload()` bypasses this: same
   *  window, deliberately fresh data. */
  private loadedKey = '';

  /** The single load. Either narrowing satisfies the API — it 400s when given
   *  neither — and a code search deliberately drops the period, because the
   *  visit it finds may be in any of them. That is the point of a code. */
  private load(force = false): void {
    const code = this.codeQuery();
    const { from, to } = rangeForView(this.view(), this.anchor());
    const query = code
      ? { internalCode: code }
      : { from: from.toISOString(), to: to.toISOString() };
    const key = JSON.stringify(query);
    if (!force && key === this.loadedKey) return;
    this.loadedKey = key;
    this.store.dispatch(new LoadVisits(query)).subscribe({
      // Without this the failure is swallowed and the page just sits on stale
      // blocks — the one reading that is worse than an empty period, because
      // it is indistinguishable from a correct one.
      error: (err) => {
        // A failed window must not be remembered as loaded, or the next
        // navigation back to it would skip the retry.
        this.loadedKey = '';
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo cargar el calendario',
          detail: errorMessage(err, 'Inténtalo de nuevo.'),
        });
      },
    });
  }

  /** Each view's arrows step by its own unit, so "next" always means the next
   *  thing you are looking at. */
  protected prev(): void {
    this.setParams({ date: toCalendarDate(stepAnchor(this.view(), this.anchor(), -1)) });
  }

  protected next(): void {
    this.setParams({ date: toCalendarDate(stepAnchor(this.view(), this.anchor(), 1)) });
  }

  protected goToday(): void {
    this.setParams({ date: toCalendarDate(new Date()) });
  }

  /** The label is the view switch (owner 2026-08-03): each click zooms out one
   *  step, and year wraps back to day. The anchor never moves, so zooming out
   *  and back in lands where you started. */
  protected cycleView(): void {
    const index = CALENDAR_VIEW_CYCLE.indexOf(this.view());
    const next = CALENDAR_VIEW_CYCLE[(index + 1) % CALENDAR_VIEW_CYCLE.length];
    this.setParams({ view: next });
  }

  /** Drilling in from an overview: a month cell opens its day, a year cell opens
   *  its month. The reverse of the label's zoom-out, and the reason the anchor
   *  is a single date rather than one per view. */
  protected openDay(key: string): void {
    this.setParams({ date: key, view: CalendarView.Day });
  }

  protected openMonth(cell: YearMonthCell): void {
    this.setParams({ date: cell.date, view: CalendarView.Month });
  }

  /** Date jump: land on the picked date, keeping whatever view is open. */
  protected onJump(date: Date | null): void {
    if (!date) return;
    this.jumpControl.setValue(null, { emitEvent: false });
    this.setParams({ date: toCalendarDate(date) });
  }

  /** Paste a code, find the visit. Debounced like every other search box in the
   *  app (05 §3 canon) rather than gated behind a button, so the popover's three
   *  filters all behave the same way — type and it applies.
   *
   *  An out-of-alphabet character does **not** navigate and does **not** toast:
   *  it just leaves the message under the field. A toast per keystroke is what
   *  gating on a button was avoiding, and this avoids it without the button. */
  private applyCode(raw: string): void {
    const term = raw.trim().toUpperCase();
    if (!term) {
      this.codeError.set('');
      this.setParams({ code: null });
      return;
    }
    if (!VISIT_CODE_PATTERN.test(term)) {
      this.codeError.set('Solo letras, números y guiones.');
      return;
    }
    this.codeError.set('');
    this.setParams({ code: term });
  }

  /** "Volver al calendario" — emptying the control runs the same path. */
  protected clearSearch(): void {
    this.codeControl.setValue('');
  }

  /** A result is in some other period: go to its day and open it, so the block
   *  is in context the moment the dialog is dismissed. */
  protected openResult(visit: Visit): void {
    this.codeControl.setValue('');
    this.setParams({
      code: null,
      date: toCalendarDate(new Date(visit.scheduledStart)),
      view: CalendarView.Day,
    });
    this.visitDialog()?.openVisit(visit);
  }

  protected selectAgendaDay(key: string): void {
    this.setParams({ date: key });
  }

  protected openCreate(): void {
    this.visitDialog()?.openCreate();
  }

  protected openVisit(visit: Visit): void {
    this.visitDialog()?.openVisit(visit);
  }

  /** The visit dialog hands the close over to the categorized-close flow. */
  protected onCloseRequested(visit: Visit): void {
    this.closeDialog()?.open(visit);
  }

  /** "Reprogramar ahora" after a close — the successor dialog, pre-filled. */
  protected onRescheduleRequested(visit: Visit): void {
    this.rescheduleDialog()?.open(visit);
  }

  /** Owner/admin fixing a mis-tapped Iniciar/Terminar on a terminal visit. */
  protected onActualsRequested(visit: Visit): void {
    this.actualsDialog()?.open(visit);
  }

  /** Any mutation reloads the visible window — a corrected time or a successor
   *  may enter or leave it, and membership is this page's call, not the
   *  state's. */
  protected reload(): void {
    this.load(true);
  }

  /** Every navigation merges — the view, the anchor, the filter and the search
   *  each own one param and none of them clears the others. */
  private setParams(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
    });
  }
}

/** URL → view, defaulting to the working view. Anything unrecognized falls back
 *  rather than blanking the page: the query string is caller-controlled. */
const parseView = (raw: string | null): CalendarView =>
  CALENDAR_VIEW_CYCLE.find((view) => view === raw) ?? CalendarView.Week;

/** URL → anchor date. A missing or unparseable value means today, for the same
 *  reason. Parsed at local midnight, never through `Date.parse('YYYY-MM-DD')`,
 *  which reads as UTC and lands on the previous day west of Greenwich. */
const parseDate = (raw: string | null): Date => {
  if (!raw) return startOfDay(new Date());
  const parsed = new Date(`${raw}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? startOfDay(new Date()) : startOfDay(parsed);
};
