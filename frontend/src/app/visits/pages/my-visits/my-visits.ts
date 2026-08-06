import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Store, select } from '@ngxs/store';
import { AppState } from '../../../../state/app/app.state';
import { AuthState } from '../../../../state/auth/auth.state';
import { VisitsState } from '../../../../state/visits/visits.state';
import { LoadMyVisits } from '../../../../state/visits/visits.actions';
import { PendingVisitActionsState } from '../../../../state/pending-visit-actions/pending-visit-actions.state';
import { VisitDayPipe } from '../../../pipes/visit-day.pipe';
import { groupByDay, localDayKey, pendingByVisit, toVisitVM } from '../../visit-vm';
import type { VisitDayGroup, VisitVM } from '../../visit-vm';
import { VisitCard } from '../../components/visit-card/visit-card';

/** The list's fixed shape: today's plan, tomorrow's, the rest of the calendar
 *  week, and — once requested — the whole next week. The buckets never overlap
 *  — each later one starts *after* the previous, so a visit appears exactly
 *  once. */
interface VisitSections {
  today: VisitVM[];
  tomorrow: VisitVM[];
  /** Day-grouped because they span several days, unlike the first two. */
  week: VisitDayGroup[];
  nextWeek: VisitDayGroup[];
}

@Component({
  selector: 'app-my-visits',
  standalone: true,
  imports: [VisitDayPipe, VisitCard],
  templateUrl: './my-visits.html',
})
export class MyVisits {
  private store = inject(Store);
  private router = inject(Router);

  loading = select(VisitsState.loading);
  isOnline = select(AppState.isOnline);
  private visitRows = select(VisitsState.list);
  private pendingTaps = select(PendingVisitActionsState.pending);
  private user = select(AuthState.user);
  private technicianId = computed(() => this.user()?.id ?? null);

  /** "Siguiente semana" is lazy — its half of the window (and so its request)
   *  exists only after the technician asks for it. */
  nextWeekRequested = signal(false);

  /** Coming Sunday 23:59 device-local — the calendar week's end (today, if
   *  today is Sunday). The boundary between "esta semana" and "siguiente". */
  private thisWeekEnd(): Date {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    end.setDate(end.getDate() + ((7 - end.getDay()) % 7));
    return end;
  }

  /** Device-local bounds, today 00:00 → Sunday 23:59 — "esta semana" runs to
   *  the end of the calendar week (owner 2026-08-06). Never shorter than
   *  mañana (a Sunday's Monday belongs to next week but still has a section),
   *  and a next-week request extends it to the *following* Sunday. Both ends
   *  bounded: the backend refuses an unbounded scan. */
  private window = computed(() => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const weekEnd = this.thisWeekEnd();
    let to = weekEnd;
    if (this.nextWeekRequested()) {
      to = new Date(weekEnd);
      to.setDate(to.getDate() + 7);
    } else {
      const tomorrowEnd = new Date(from);
      tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
      tomorrowEnd.setHours(23, 59, 59, 999);
      if (tomorrowEnd > to) to = tomorrowEnd;
    }
    return { from: from.toISOString(), to: to.toISOString() };
  });

  sections = computed<VisitSections>(() => {
    const byVisit = pendingByVisit(this.pendingTaps());
    const vms = this.visitRows()
      .map((v) => toVisitVM(v, byVisit.get(v.id) ?? []))
      .sort((a, b) => a.visit.scheduledStart.localeCompare(b.visit.scheduledStart));

    const now = new Date();
    const todayKey = localDayKey(now.toISOString());
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = localDayKey(tomorrow.toISOString());
    const weekEnd = this.thisWeekEnd();

    const today: VisitVM[] = [];
    const tomorrowList: VisitVM[] = [];
    const rest: VisitVM[] = [];
    const next: VisitVM[] = [];
    for (const vm of vms) {
      const key = localDayKey(vm.visit.scheduledStart);
      if (key === todayKey) today.push(vm);
      else if (key === tomorrowKey) tomorrowList.push(vm);
      else if (new Date(vm.visit.scheduledStart) <= weekEnd) rest.push(vm);
      else next.push(vm);
    }
    return {
      today,
      tomorrow: tomorrowList,
      week: groupByDay(rest),
      nextWeek: groupByDay(next),
    };
  });

  empty = computed(() => {
    const s = this.sections();
    return !s.today.length && !s.tomorrow.length && !s.week.length && !s.nextWeek.length;
  });

  /** Collapses sections 1–3 into one empty card — but never the "siguiente
   *  semana" section, whose lazy-load button must stay reachable. */
  thisWeekEmpty = computed(() => {
    const s = this.sections();
    return !s.today.length && !s.tomorrow.length && !s.week.length;
  });

  constructor() {
    effect(() => {
      const technicianId = this.technicianId();
      if (!technicianId) return;
      const { from, to } = this.window();
      this.store.dispatch(new LoadMyVisits({ from, to, technicianId }));
    });
  }

  refresh(): void {
    const technicianId = this.technicianId();
    if (!technicianId) return;
    const { from, to } = this.window();
    this.store.dispatch(new LoadMyVisits({ from, to, technicianId }));
  }

  /** Widening the window is the whole trigger — the load `effect` reacts to
   *  the changed bounds and refetches, now including next week. */
  loadNextWeek(): void {
    this.nextWeekRequested.set(true);
  }

  openVisit(id: string): void {
    this.router.navigate(['/visits', id]);
  }
}
