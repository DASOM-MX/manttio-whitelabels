import { Injectable } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import {
  LoadReports, LoadReport, SelectReport, SetReportsQuery,
  CreateReport, UpdateReport, SetAssignee,
  AddSignature, AddPictures, RemovePictures, DeleteReport,
  SendReportEmail, LoadReportEmails, RevokeReportEmail,
} from './reports.actions';
import type {
  ReportRow, ReportDetailRow, ReportListQuery,
} from '../../app/data/dtos/report';
import type { ReportEmailRow } from '../../app/data/dtos/report-email';

export interface ReportsStateModel {
  entities: Record<string, ReportRow>;
  ids: string[];
  selected: ReportRow | null;
  selectedDetails: ReportDetailRow | null;
  query: ReportListQuery | null;
  loading: boolean;
  emails: Record<string, ReportEmailRow[]>;
}

@State<ReportsStateModel>({
  name: 'reports',
  defaults: {
    entities: {},
    ids: [],
    selected: null,
    selectedDetails: null,
    query: null,
    loading: false,
    emails: {},
  },
})
@Injectable()
export class ReportsState {
  @Selector() static list(s: ReportsStateModel): ReportRow[] {
    return s.ids.map((id) => s.entities[id]).filter(Boolean) as ReportRow[];
  }
  @Selector() static selected(s: ReportsStateModel): { report: ReportRow; details: ReportDetailRow | null } | null {
    return s.selected ? { report: s.selected, details: s.selectedDetails } : null;
  }
  @Selector() static loading(s: ReportsStateModel): boolean { return s.loading; }
  @Selector() static query(s: ReportsStateModel): ReportListQuery | null { return s.query; }

  static byId(id: string) {
    return (s: ReportsStateModel) => s.entities[id] ?? null;
  }
  static emailsForReport(id: string) {
    return (s: ReportsStateModel) => s.emails[id] ?? [];
  }

  @Action(LoadReports)
  loadList(_ctx: StateContext<ReportsStateModel>) {
    // stub — wired up in PR #5 once ReportsService exists
  }

  @Action(LoadReport)
  loadOne(_ctx: StateContext<ReportsStateModel>, _action: LoadReport) {
    // stub — PR #5 will GET /reports/:id and patch
    //   { entities: { ...s.entities, [id]: report }, selected: report, selectedDetails: details }
  }

  @Action(SelectReport)
  select(ctx: StateContext<ReportsStateModel>, { report }: SelectReport) {
    // synchronous setter (e.g. from a list row click). Null `selectedDetails`
    // — details only come from GET /reports/:id via LoadReport.
    ctx.patchState({ selected: report, selectedDetails: null });
  }

  @Action(SetReportsQuery)
  setQuery(ctx: StateContext<ReportsStateModel>, { query }: SetReportsQuery) {
    ctx.patchState({ query });
  }

  @Action(CreateReport)
  create(_ctx: StateContext<ReportsStateModel>, _action: CreateReport) {
    // stub
  }

  @Action(UpdateReport)
  update(_ctx: StateContext<ReportsStateModel>, _action: UpdateReport) {
    // stub
  }

  @Action(SetAssignee)
  setAssignee(_ctx: StateContext<ReportsStateModel>, _action: SetAssignee) {
    // stub
  }

  @Action(AddSignature)
  addSignature(_ctx: StateContext<ReportsStateModel>, _action: AddSignature) {
    // stub
  }

  @Action(AddPictures)
  addPictures(_ctx: StateContext<ReportsStateModel>, _action: AddPictures) {
    // stub
  }

  @Action(RemovePictures)
  removePictures(_ctx: StateContext<ReportsStateModel>, _action: RemovePictures) {
    // stub
  }

  @Action(DeleteReport)
  remove(_ctx: StateContext<ReportsStateModel>, _action: DeleteReport) {
    // stub
  }

  @Action(SendReportEmail)
  sendEmail(_ctx: StateContext<ReportsStateModel>, _action: SendReportEmail) {
    // stub
  }

  @Action(LoadReportEmails)
  loadEmails(_ctx: StateContext<ReportsStateModel>, _action: LoadReportEmails) {
    // stub
  }

  @Action(RevokeReportEmail)
  revokeEmail(_ctx: StateContext<ReportsStateModel>, _action: RevokeReportEmail) {
    // stub
  }
}
