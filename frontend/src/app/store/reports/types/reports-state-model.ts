import { Report } from './report';

export interface ReportsStateModel {
  items: Report[];
  total: number;
  lastFetchedAt: number | null;
  loading: boolean;
}
