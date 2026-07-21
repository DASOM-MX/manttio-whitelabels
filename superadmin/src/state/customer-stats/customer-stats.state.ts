import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { catchError, tap } from 'rxjs';
import { CustomerStatsService } from '../../app/services/http/customer-stats.service';
import {
  LoadIntakeStats,
  LoadRecentCustomers,
  LoadRecentInteractions,
} from './customer-stats.actions';
import type {
  IntakeStats,
  RecentCustomer,
  RecentInteraction,
} from '../../app/data/dtos/customer-stats';

export interface CustomerStatsStateModel {
  intake: IntakeStats | null;
  /** Month the cached intake answers ('' = the default/current month) — a
   *  different month in a future filter forces a refetch. */
  intakeMonth: string | null;
  intakeLoading: boolean;
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
