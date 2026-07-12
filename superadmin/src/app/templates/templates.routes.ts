import { Routes } from '@angular/router';
import { provideStates } from '@ngxs/store';
import { ReportTemplatesState } from '../../state/report-templates/report-templates.state';
import { pendingChangesGuard } from '../guards/pending-changes.guard';
import { TemplatesList } from './pages/templates-list/templates-list';
import { TemplateDetail } from './pages/template-detail/template-detail';

export default [
  {
    path: '',
    providers: [provideStates([ReportTemplatesState])],
    children: [
      { path: '', component: TemplatesList },
      { path: 'new', component: TemplateDetail, canDeactivate: [pendingChangesGuard] },
      { path: ':id', component: TemplateDetail, canDeactivate: [pendingChangesGuard] },
    ],
  },
] satisfies Routes;
