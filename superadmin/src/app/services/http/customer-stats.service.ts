import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type {
  IntakeStats,
  RecentCustomer,
  RecentInteraction,
  RecentItemsResponse,
} from '../../data/dtos/customer-stats';

/** Panel (CMS dashboard) reads — single-fetch page data held in component
 *  signals, no NGXS (utm-params 03: nothing here is cross-page). */
@Injectable({ providedIn: 'root' })
export class CustomerStatsService {
  private readonly remote = inject(RemoteService);

  getIntake(month?: string): Observable<IntakeStats> {
    return this.remote.get<IntakeStats>('/customers/stats/intake', { month });
  }

  getRecentInteractions(limit = 8): Observable<RecentInteraction[]> {
    return this.remote
      .get<RecentItemsResponse<RecentInteraction>>('/customers/interactions/recent', { limit })
      .pipe(map((res) => res.items));
  }

  getRecentCustomers(limit = 8): Observable<RecentCustomer[]> {
    return this.remote
      .get<RecentItemsResponse<RecentCustomer>>('/customers/recent', { limit })
      .pipe(map((res) => res.items));
  }
}
