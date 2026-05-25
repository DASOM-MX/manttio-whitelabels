import type { CanDeactivateFn } from '@angular/router';
import type { ReportAdd } from '../reports/pages/report-add/report-add';

export const reportAddDeactivateGuard: CanDeactivateFn<ReportAdd> = (component) =>
  component.canLeave();
