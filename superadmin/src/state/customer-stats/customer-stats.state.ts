import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { catchError, tap } from 'rxjs';
import { CustomerStatsService } from '../../app/services/http/customer-stats.service';
import {
  LoadFollowUps,
  LoadIntakeStats,
  LoadIntakeTrend,
  LoadRecentCustomers,
  LoadRecentInteractions,
} from './customer-stats.actions';
import type {
  FollowUpsResponse,
  IntakeStats,
  IntakeTrend,
  RecentCustomer,
  RecentInteraction,
} from '../../app/data/dtos/customer-stats';

export interface CustomerStatsStateModel {
  intake: IntakeStats | null;
  /** Month the cached intake answers ('' = the default/current month) — a
   *  different month in a future filter forces a refetch. */
  intakeMonth: string | null;
  intakeLoading: boolean;
  trend: IntakeTrend | null;
  trendLoading: boolean;
  followUps: FollowUpsResponse | null;
  followUpsLoading: boolean;
  activity: RecentInteraction[] | null;
  activityLoading: boolean;
  recentClients: RecentCustomer[] | null;
  recentClientsLoading: boolean;
}

@State<CustomerStatsStateModel>({
  name: 'customerStats',
  defaults: {
    intake: null,
    intakeMonth: null,
    intakeLoading: false,
    trend: null,
    trendLoading: false,
    followUps: null,
    followUpsLoading: false,
    activity: null,
    activityLoading: false,
    recentClients: null,
    recentClientsLoading: false,
  },
})
@Injectable()
export class CustomerStatsState {
  private readonly api = inject(CustomerStatsService);

  @Selector() static intake(s: CustomerStatsStateModel): IntakeStats | null {
    return s.intake;
  }
  @Selector() static intakeLoading(s: CustomerStatsStateModel): boolean {
    return s.intakeLoading;
  }
  @Selector() static trend(s: CustomerStatsStateModel): IntakeTrend | null {
    return s.trend;
  }
  @Selector() static trendLoading(s: CustomerStatsStateModel): boolean {
    return s.trendLoading;
  }
  @Selector() static followUps(s: CustomerStatsStateModel): FollowUpsResponse | null {
    return s.followUps;
  }
  @Selector() static followUpsLoading(s: CustomerStatsStateModel): boolean {
    return s.followUpsLoading;
  }
  @Selector() static activity(s: CustomerStatsStateModel): RecentInteraction[] | null {
    return s.activity;
  }
  @Selector() static activityLoading(s: CustomerStatsStateModel): boolean {
    return s.activityLoading;
  }
  @Selector() static recentClients(s: CustomerStatsStateModel): RecentCustomer[] | null {
    return s.recentClients;
  }
  @Selector() static recentClientsLoading(s: CustomerStatsStateModel): boolean {
    return s.recentClientsLoading;
  }

  @Action(LoadIntakeStats)
  loadIntake(ctx: StateContext<CustomerStatsStateModel>, { month, refresh }: LoadIntakeStats) {
    const state = ctx.getState();
    const key = month ?? '';
    if (!refresh && state.intake && state.intakeMonth === key) return undefined;
    ctx.patchState({ intakeLoading: true });
    return this.api.getIntake(month).pipe(
      tap((intake) => ctx.patchState({ intake, intakeMonth: key, intakeLoading: false })),
      catchError((err) => {
        ctx.patchState({ intakeLoading: false });
        throw err;
      }),
    );
  }

  @Action(LoadIntakeTrend)
  loadTrend(ctx: StateContext<CustomerStatsStateModel>, { months, refresh }: LoadIntakeTrend) {
    if (!refresh && ctx.getState().trend) return undefined;
    ctx.patchState({ trendLoading: true });
    return this.api.getTrend(months).pipe(
      tap((trend) => ctx.patchState({ trend, trendLoading: false })),
      catchError((err) => {
        ctx.patchState({ trendLoading: false });
        throw err;
      }),
    );
  }

  @Action(LoadFollowUps)
  loadFollowUps(ctx: StateContext<CustomerStatsStateModel>, { limit, refresh }: LoadFollowUps) {
    if (!refresh && ctx.getState().followUps) return undefined;
    ctx.patchState({ followUpsLoading: true });
    return this.api.getFollowUps(limit).pipe(
      tap((followUps) => ctx.patchState({ followUps, followUpsLoading: false })),
      catchError((err) => {
        ctx.patchState({ followUpsLoading: false });
        throw err;
      }),
    );
  }

  @Action(LoadRecentInteractions)
  loadActivity(
    ctx: StateContext<CustomerStatsStateModel>,
    { limit, refresh }: LoadRecentInteractions,
  ) {
    if (!refresh && ctx.getState().activity) return undefined;
    ctx.patchState({ activityLoading: true });
    return this.api.getRecentInteractions(limit).pipe(
      tap((activity) => ctx.patchState({ activity, activityLoading: false })),
      catchError((err) => {
        ctx.patchState({ activityLoading: false });
        throw err;
      }),
    );
  }

  @Action(LoadRecentCustomers)
  loadRecentClients(
    ctx: StateContext<CustomerStatsStateModel>,
    { limit, refresh }: LoadRecentCustomers,
  ) {
    if (!refresh && ctx.getState().recentClients) return undefined;
    ctx.patchState({ recentClientsLoading: true });
    return this.api.getRecentCustomers(limit).pipe(
      tap((recentClients) => ctx.patchState({ recentClients, recentClientsLoading: false })),
      catchError((err) => {
        ctx.patchState({ recentClientsLoading: false });
        throw err;
      }),
    );
  }
}
