import { Component, inject, signal } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { LucideLayoutTemplate, LucidePlus } from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { ReportTemplatesState } from '../../../../state/report-templates/report-templates.state';
import { LoadTemplates } from '../../../../state/report-templates/report-templates.actions';
import {
  QuestionCountPipe,
  TemplateStatusLabelPipe,
  TemplateStatusSeverityPipe,
} from '../../../pipes/report-status.pipe';

const PAGE_SIZE = 10;

/** Templates list (06 §5.3) — own top-level Plantillas area, owner/admin
 *  only (route data enforces; office/tech never see the nav entry). */
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
  templateUrl: './templates-list.html',
})
export class TemplatesList {
  private store = inject(Store);

  protected templates = select(ReportTemplatesState.items);
  protected total = select(ReportTemplatesState.total);
  protected loading = select(ReportTemplatesState.loading);
  protected readonly PAGE_SIZE = PAGE_SIZE;

  private page = signal(1);

  protected onLazyLoad(event: TableLazyLoadEvent): void {
    const first = event.first ?? 0;
    const rows = event.rows ?? PAGE_SIZE;
    this.page.set(Math.floor(first / rows) + 1);
    this.store.dispatch(new LoadTemplates({ page: this.page(), limit: rows }));
  }
}
