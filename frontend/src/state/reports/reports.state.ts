import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { tap } from 'rxjs/operators';
import { ReportsService } from '../../http/reports.service';
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
  private readonly api = inject(ReportsService);

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
  loadList(ctx: StateContext<ReportsStateModel>) {
    const { query } = ctx.getState();
    ctx.patchState({ loading: true });
    return this.api.list(query ?? undefined).pipe(
      tap(({ reports }) => {
        const entities: Record<string, ReportRow> = {};
        const ids: string[] = [];
        for (const r of reports) { entities[r.id] = r; ids.push(r.id); }
        ctx.patchState({ entities, ids, loading: false });
      }),
    );
  }

  @Action(LoadReport)
  loadOne(ctx: StateContext<ReportsStateModel>, { id }: LoadReport) {
    return this.api.get(id).pipe(
      tap(({ report, details }) => {
        const s = ctx.getState();
        const ids = s.ids.includes(id) ? s.ids : [...s.ids, id];
        ctx.patchState({
          entities: { ...s.entities, [id]: report },
          ids,
          selected: report,
          selectedDetails: details,
        });
      }),
    );
  }

  @Action(SelectReport)
  select(ctx: StateContext<ReportsStateModel>, { report }: SelectReport) {
    ctx.patchState({ selected: report, selectedDetails: null });
  }

  @Action(SetReportsQuery)
  setQuery(ctx: StateContext<ReportsStateModel>, { query }: SetReportsQuery) {
    ctx.patchState({ query });
  }

  @Action(CreateReport)
  create(ctx: StateContext<ReportsStateModel>, { fields }: CreateReport) {
    return this.api.create(fields).pipe(
      tap(({ report, details }) => {
        const s = ctx.getState();
        if (s.ids.includes(report.id)) {
          ctx.patchState({ selected: report, selectedDetails: details });
          return;
        }
        ctx.patchState({
          entities: { ...s.entities, [report.id]: report },
          ids: [...s.ids, report.id],
          selected: report,
          selectedDetails: details,
        });
      }),
    );
  }

  @Action(UpdateReport)
  update(ctx: StateContext<ReportsStateModel>, { id, payload }: UpdateReport) {
    return this.api.update(id, payload).pipe(
      tap(({ report, details }) => {
        const s = ctx.getState();
        ctx.patchState({
          entities: { ...s.entities, [id]: report },
          selected: s.selected?.id === id ? report : s.selected,
          selectedDetails: s.selected?.id === id ? details : s.selectedDetails,
        });
      }),
    );
  }

  @Action(SetAssignee)
  setAssignee(ctx: StateContext<ReportsStateModel>, { id, assignedTo }: SetAssignee) {
    return this.api.setAssignee(id, { assigned_to: assignedTo }).pipe(
      tap(({ report }) => {
        const s = ctx.getState();
        ctx.patchState({
          entities: { ...s.entities, [id]: report },
          selected: s.selected?.id === id ? report : s.selected,
        });
      }),
    );
  }

  @Action(AddSignature)
  addSignature(ctx: StateContext<ReportsStateModel>, { id, fields }: AddSignature) {
    return this.api.addSignature(id, fields).pipe(
      tap(({ report, details }) => {
        const s = ctx.getState();
        ctx.patchState({
          entities: { ...s.entities, [id]: report },
          selected: s.selected?.id === id ? report : s.selected,
          selectedDetails: s.selected?.id === id ? details : s.selectedDetails,
        });
      }),
    );
  }

  @Action(AddPictures)
  addPictures(ctx: StateContext<ReportsStateModel>, { id, pictures }: AddPictures) {
    return this.api.addPictures(id, pictures).pipe(
      tap(({ details }) => {
        const s = ctx.getState();
        if (s.selected?.id !== id) return;
        ctx.patchState({ selectedDetails: details });
      }),
    );
  }

  @Action(RemovePictures)
  removePictures(ctx: StateContext<ReportsStateModel>, { id, payload }: RemovePictures) {
    return this.api.removePictures(id, payload).pipe(
      tap(({ details }) => {
        const s = ctx.getState();
        if (s.selected?.id !== id) return;
        ctx.patchState({ selectedDetails: details });
      }),
    );
  }

  @Action(DeleteReport)
  remove(ctx: StateContext<ReportsStateModel>, { id }: DeleteReport) {
    return this.api.remove(id).pipe(
      tap(() => {
        const s = ctx.getState();
        const { [id]: _gone, ...rest } = s.entities;
        const wasSelected = s.selected?.id === id;
        ctx.patchState({
          entities: rest,
          ids: s.ids.filter((x) => x !== id),
          selected: wasSelected ? null : s.selected,
          selectedDetails: wasSelected ? null : s.selectedDetails,
        });
      }),
    );
  }

  @Action(SendReportEmail)
  sendEmail(_ctx: StateContext<ReportsStateModel>, { id, payload }: SendReportEmail) {
    return this.api.sendEmail(id, payload);
  }

  @Action(LoadReportEmails)
  loadEmails(ctx: StateContext<ReportsStateModel>, { id }: LoadReportEmails) {
    return this.api.listEmails(id).pipe(
      tap(({ emails }) => {
        const s = ctx.getState();
        ctx.patchState({ emails: { ...s.emails, [id]: emails } });
      }),
    );
  }

  @Action(RevokeReportEmail)
  revokeEmail(ctx: StateContext<ReportsStateModel>, { emailId }: RevokeReportEmail) {
    return this.api.revokeEmail(emailId).pipe(
      tap(() => {
        const s = ctx.getState();
        const next: Record<string, ReportEmailRow[]> = {};
        for (const [rid, rows] of Object.entries(s.emails)) {
          next[rid] = rows.map((r) => (r.id === emailId ? { ...r, revokedAt: new Date().toISOString() } : r));
        }
        ctx.patchState({ emails: next });
      }),
    );
  }
}
