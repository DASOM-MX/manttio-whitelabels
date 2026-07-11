import { Component, inject } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { LucideLayoutTemplate, LucidePlus } from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { ReportTemplatesState } from '../../../../state/report-templates/report-templates.state';
import { LoadTemplates } from '../../../../state/report-templates/report-templates.actions';
import { ListQueryService } from '../../../services/table/list-query.service';
import {
  QuestionCountPipe,
  TemplateStatusLabelPipe,
  TemplateStatusSeverityPipe,
} from '../../../pipes/report-status.pipe';
import type { ReportTemplate } from '../../../data/dtos/report-template';

/** Templates list (06 §5.3) — own top-level Plantillas area, owner/admin
 *  only (route data enforces; office/tech never see the nav entry). Page
 *  persists as a GET param (?page) through ListQueryService (05 §3 canon). */
@Component({
  selector: 'app-templates-list',
  imports: [
    SlicePipe,
    RouterLink,
    TableModule,
    TagModule,
    TemplateStatusLabelPipe,
    TemplateStatusSeverityPipe,
    QuestionCountPipe,
    LucidePlus,
    LucideLayoutTemplate,
  ],
  providers: [ListQueryService],
  templateUrl: './templates-list.html',
})
export class TemplatesList {
  private store = inject(Store);
  private router = inject(Router);
  protected list = inject(ListQueryService);

  protected templates = select(ReportTemplatesState.items);
  protected total = select(ReportTemplatesState.total);
  protected loading = select(ReportTemplatesState.loading);

  constructor() {
    this.list.init({
      read: () => {},
      write: () => ({}),
      load: (page) => this.store.dispatch(new LoadTemplates({ page, limit: this.list.PAGE_SIZE })),
    });
  }

  /** Whole row clicks through to the builder (05 §3 QA pattern); the "Abrir"
   *  link remains the keyboard path. */
  protected openTemplate(tpl: ReportTemplate): void {
    this.router.navigate(['/templates', tpl.id]);
  }
}
