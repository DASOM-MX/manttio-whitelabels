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
  details: Record<string, ReportDetailRow>;
  ids: string[];
  selectedId: string | null;
  query: ReportListQuery | null;
  loading: boolean;
  emails: Record<string, ReportEmailRow[]>;
}

@State<ReportsStateModel>({
  name: 'reports',
  defaults: {
    entities: {},
    details: {},
    ids: [],
    selectedId: null,
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
  @Selector() static loading(s: ReportsStateModel): boolean { return s.loading; }
  @Selector() static query(s: ReportsStateModel): ReportListQuery | null { return s.query; }

  static byId(id: string) {
    return (s: ReportsStateModel) => s.entities[id] ?? null;
  }
  static detailsById(id: string) {
    return (s: ReportsStateModel) => s.details[id] ?? null;
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
    // stub
  }

  @Action(SelectReport)
  select(ctx: StateContext<ReportsStateModel>, { id }: SelectReport) {
    ctx.patchState({ selectedId: id });
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
