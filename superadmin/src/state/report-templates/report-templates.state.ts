import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { catchError, tap } from 'rxjs';
import { ReportTemplatesService } from '../../http/report-templates.service';
import {
  ActivateTemplate,
  CreateTemplate,
  DeactivateTemplate,
  DisableTemplate,
  LoadTemplate,
  LoadTemplates,
  UpdateTemplate,
} from './report-templates.actions';
import type { ReportTemplate } from '../../app/data/dtos/report-template';

export interface ReportTemplatesStateModel {
  items: ReportTemplate[];
  total: number;
  loading: boolean;
  selected: ReportTemplate | null;
}

@State<ReportTemplatesStateModel>({
  name: 'reportTemplates',
  defaults: { items: [], total: 0, loading: false, selected: null },
})
@Injectable()
export class ReportTemplatesState {
  private readonly api = inject(ReportTemplatesService);

  @Selector() static items(s: ReportTemplatesStateModel): ReportTemplate[] {
    return s.items;
  }
  @Selector() static total(s: ReportTemplatesStateModel): number {
    return s.total;
  }
  @Selector() static loading(s: ReportTemplatesStateModel): boolean {
    return s.loading;
  }
  @Selector() static selected(s: ReportTemplatesStateModel): ReportTemplate | null {
    return s.selected;
  }

  private upsertSelected(ctx: StateContext<ReportTemplatesStateModel>, tpl: ReportTemplate): void {
    const s = ctx.getState();
    ctx.patchState({
      selected: tpl,
      items: s.items.some((t) => t.id === tpl.id)
        ? s.items.map((t) => (t.id === tpl.id ? tpl : t))
        : s.items,
    });
  }

  @Action(LoadTemplates)
  loadTemplates(ctx: StateContext<ReportTemplatesStateModel>, { query }: LoadTemplates) {
    ctx.patchState({ loading: true });
    return this.api.list(query).pipe(
      tap(({ items, total }) => ctx.patchState({ items, total, loading: false })),
      catchError((err) => {
        ctx.patchState({ loading: false });
        throw err;
      }),
    );
  }

  @Action(LoadTemplate)
  loadTemplate(ctx: StateContext<ReportTemplatesStateModel>, { id }: LoadTemplate) {
    ctx.patchState({ selected: null });
    return this.api.get(id).pipe(tap((tpl) => ctx.patchState({ selected: tpl })));
  }

  @Action(CreateTemplate)
  createTemplate(ctx: StateContext<ReportTemplatesStateModel>, { payload }: CreateTemplate) {
    return this.api.create(payload).pipe(tap((tpl) => this.upsertSelected(ctx, tpl)));
  }

  @Action(UpdateTemplate)
  updateTemplate(ctx: StateContext<ReportTemplatesStateModel>, { id, payload }: UpdateTemplate) {
    return this.api.update(id, payload).pipe(tap((tpl) => this.upsertSelected(ctx, tpl)));
  }

  @Action(ActivateTemplate)
  activate(ctx: StateContext<ReportTemplatesStateModel>, { id }: ActivateTemplate) {
    return this.api.activate(id).pipe(tap((tpl) => this.upsertSelected(ctx, tpl)));
  }

  @Action(DeactivateTemplate)
  deactivate(ctx: StateContext<ReportTemplatesStateModel>, { id }: DeactivateTemplate) {
    return this.api.deactivate(id).pipe(tap((tpl) => this.upsertSelected(ctx, tpl)));
  }

  @Action(DisableTemplate)
  disable(ctx: StateContext<ReportTemplatesStateModel>, { id, reason }: DisableTemplate) {
    return this.api.disable(id, reason).pipe(tap((tpl) => this.upsertSelected(ctx, tpl)));
  }
}
