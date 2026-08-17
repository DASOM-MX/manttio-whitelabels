import { Injectable } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { OpenReportDraft, UpdateReportDraft, DiscardReportDraft } from './report-draft.actions';
import type { WorkType } from '../../app/data/types/report';

export interface ReportDraft {
  /** ISO timestamp captured when the technician first opened the form.
   *  Frozen for the lifetime of the draft so refreshes don't reset it. */
  arrivalAt: string;
  templateId?: string;
  customerId: string | null;
  workType: WorkType | null;
}

export interface ReportDraftStateModel {
  draft: ReportDraft | null;
}

const defaultDraft = (): ReportDraft => ({
  arrivalAt: new Date().toISOString(),
  customerId: null,
  workType: null,
});

@State<ReportDraftStateModel>({
  name: 'reportDraft',
  defaults: { draft: null },
})
@Injectable()
export class ReportDraftState {
  @Selector() static draft(s: ReportDraftStateModel): ReportDraft | null {
    return s.draft;
  }

  @Action(OpenReportDraft)
  open(ctx: StateContext<ReportDraftStateModel>) {
    if (ctx.getState().draft) return;
    ctx.patchState({ draft: defaultDraft() });
  }

  @Action(UpdateReportDraft)
  update(ctx: StateContext<ReportDraftStateModel>, { patch }: UpdateReportDraft) {
    const current = ctx.getState().draft;
    if (!current) return;
    ctx.patchState({ draft: { ...current, ...patch } });
  }

  @Action(DiscardReportDraft)
  discard(ctx: StateContext<ReportDraftStateModel>) {
    ctx.patchState({ draft: null });
  }
}
