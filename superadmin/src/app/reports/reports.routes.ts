import { Routes } from '@angular/router';
import { provideStates } from '@ngxs/store';
import { ReportsState } from '../../state/reports/reports.state';
import { ReportTemplatesState } from '../../state/report-templates/report-templates.state';
import { ReportsList } from './pages/reports-list/reports-list';
import { ReportView } from './pages/report-view/report-view';

export default [
  {
    path: '',
    // Templates state rides along for the list's template filter.
    providers: [provideStates([ReportsState, ReportTemplatesState])],
    children: [
      { path: '', component: ReportsList },
      { path: ':id', component: ReportView },
    ],
  },
] satisfies Routes;
