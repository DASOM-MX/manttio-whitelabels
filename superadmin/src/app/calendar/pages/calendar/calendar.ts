import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { catchError, of } from 'rxjs';
import { DatePickerModule } from 'primeng/datepicker';
import { MultiSelectModule } from 'primeng/multiselect';
import { LucideChevronLeft, LucideChevronRight, LucidePlus } from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { VisitsState } from '../../../../state/visits/visits.state';
import { LoadVisits } from '../../../../state/visits/visits.actions';
import { AuthState } from '../../../../state/auth/auth.state';
import { hasRole } from '../../../guards/has-role.guard';
import { UsersService } from '../../../services/http/users.service';
import { WEEKDAY_SHORT_LABELS } from '../../../model/constants/calendar/weekday-short-labels.const';
import { MONTH_SHORT_LABELS } from '../../../model/constants/calendar/month-short-labels.const';
import { TechnicianDotClassPipe, VisitChipClassPipe } from '../../../pipes/visit.pipe';
import { VisitDialog } from '../../components/visit-dialog/visit-dialog';
import { CloseVisitDialog } from '../../components/close-visit-dialog/close-visit-dialog';
import { RescheduleVisitDialog } from '../../components/reschedule-visit-dialog/reschedule-visit-dialog';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { addDays, startOfWeek, toCalendarDate } from '../../../data/utils';
import type { AssignableUser } from '../../../data/dtos/user';
import type { Visit } from '../../../data/dtos/visit';

/** One rendered column of the week grid. */
interface CalendarDay {
  label: string;
  dayOfMonth: number;
  isToday: boolean;
  visits: Visit[];
}

/** The backlog entry of the technician filter — same sentinel the API uses. */
const UNASSIGNED = 'unassigned';

/** Week grid + day agenda (12 §3, shipped as 19 CP-3): one column per day,
 *  visit chips colored by status with a per-technician identity dot, a
 *  client-side technician filter (the week is already loaded — filtering it
 *  costs nothing) and dialog-driven moves — no drag-and-drop in v1. Week +
 *  filter persist as URL query params (`?week&tech`), and `queryParamMap` is
 *  the single load path, same discipline as the list pages. */
@Component({
  selector: 'app-calendar',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    DatePickerModule,
    MultiSelectModule,
    TechnicianDotClassPipe,
    VisitChipClassPipe,
    VisitDialog,
    CloseVisitDialog,
    RescheduleVisitDialog,
    PageHeader,
    LucideChevronLeft,
    LucideChevronRight,
    LucidePlus,
  ],
  templateUrl: './calendar.html',
})
export class Calendar {
  private store = inject(Store);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  protected visits = select(VisitsState.items);
  protected loading = select(VisitsState.loading);
  private me = select(AuthState.me);

  protected canSchedule = computed(() => hasRole(this.me(), ['owner', 'admin', 'office']));

  protected weekStart = signal(startOfWeek(new Date()));
  /** The technician filter as the URL carries it — user ids + the
   *  `unassigned` sentinel; empty = everyone. */
  private techSelection = signal<string[]>([]);

  protected techFilter = new FormControl<string[]>([], { nonNullable: true });
  protected jumpControl = new FormControl<Date | null>(null);

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

  protected rangeLabel = computed(() => {
    const start = this.weekStart();
    const end = addDays(start, 6);
    const from = `${start.getDate()} ${MONTH_SHORT_LABELS[start.getMonth()]}`;
    return `${from} – ${end.getDate()} ${MONTH_SHORT_LABELS[end.getMonth()]} ${end.getFullYear()}`;
  });

  protected days = computed<CalendarDay[]>(() => {
    const start = this.weekStart();
    const selection = this.techSelection();
    const today = toCalendarDate(new Date());
    const shown = selection.length
      ? this.visits().filter((visit) => selection.includes(visit.technicianId ?? UNASSIGNED))
      : this.visits();
    return WEEKDAY_SHORT_LABELS.map((label, i) => {
      const date = addDays(start, i);
      const key = toCalendarDate(date);
      return {
        label,
        dayOfMonth: date.getDate(),
        isToday: key === today,
        visits: shown
          .filter((visit) => toCalendarDate(new Date(visit.scheduledStart)) === key)
          .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart)),
      };
    });
  });

  protected weekIsEmpty = computed(
    () => !this.loading() && this.days().every((day) => day.visits.length === 0),
  );

  protected visitDialog = viewChild<VisitDialog>('visitDialog');
  protected closeDialog = viewChild<CloseVisitDialog>('closeDialog');
  protected rescheduleDialog = viewChild<RescheduleVisitDialog>('rescheduleDialog');

  protected readonly skeletonDays = WEEKDAY_SHORT_LABELS;

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const week = params.get('week');
      const parsed = week ? new Date(`${week}T00:00:00`) : new Date();
      const start = startOfWeek(Number.isNaN(parsed.getTime()) ? new Date() : parsed);
      this.weekStart.set(start);
      const tech = params.get('tech');
      const selection = tech ? tech.split(',') : [];
      this.techSelection.set(selection);
      this.techFilter.setValue(selection, { emitEvent: false });
      this.store.dispatch(
        new LoadVisits({ from: start.toISOString(), to: addDays(start, 7).toISOString() }),
      );
    });
  }

  protected prevWeek(): void {
    this.setWeek(addDays(this.weekStart(), -7));
  }

  protected nextWeek(): void {
    this.setWeek(startOfWeek(addDays(this.weekStart(), 7)));
  }

  protected goToday(): void {
    this.setWeek(startOfWeek(new Date()));
  }

  /** Month jump (12 §3): pick any date, land on its week. */
  protected onJump(date: Date | null): void {
    if (!date) return;
    this.jumpControl.setValue(null, { emitEvent: false });
    this.setWeek(startOfWeek(date));
  }

  protected onTechFilterChange(): void {
    const selection = this.techFilter.value;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tech: selection.length ? selection.join(',') : null },
      queryParamsHandling: 'merge',
    });
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

  /** Any mutation reloads the visible week — a corrected date or a successor
   *  may enter or leave it, and membership is this page's call, not the
   *  state's. */
  protected reloadWeek(): void {
    const start = this.weekStart();
    this.store.dispatch(
      new LoadVisits({ from: start.toISOString(), to: addDays(start, 7).toISOString() }),
    );
  }

  private setWeek(start: Date): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { week: toCalendarDate(start) },
      queryParamsHandling: 'merge',
    });
  }
}
