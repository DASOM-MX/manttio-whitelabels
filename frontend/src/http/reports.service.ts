import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type {
  ReportListQuery,
  CreateReportFields, UpdateReportRequest, UpdateAssigneeRequest,
  AddSignatureFields, DeletePicturesRequest,
  ReportResponse, ReportHeaderResponse, ReportDetailsResponse,
  ReportListResponse, DeleteReportResponse,
} from '../app/data/dtos/report';
import type {
  SendReportEmailRequest, SendReportEmailResponse,
  ReportEmailListResponse, RevokeEmailResponse,
} from '../app/data/dtos/report-email';

const appendIf = (fd: FormData, k: string, v: unknown): void => {
  if (v === undefined || v === null || v === '') return;
  fd.set(k, v as string | Blob);
};

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly remote = inject(RemoteService);

  list(query?: ReportListQuery): Observable<ReportListResponse> {
    return this.remote.get<ReportListResponse>('/reports', query as Record<string, string | undefined> | undefined);
  }
  get(id: string): Observable<ReportResponse> {
    return this.remote.get<ReportResponse>(`/reports/${id}`);
  }
  create(fields: CreateReportFields): Observable<ReportResponse> {
    const fd = new FormData();
    appendIf(fd, 'report_type', fields.report_type);
    appendIf(fd, 'work_type', fields.work_type);
    appendIf(fd, 'client_id', fields.client_id);
    appendIf(fd, 'date_arrival', fields.date_arrival);
    appendIf(fd, 'date_departure', fields.date_departure);
    appendIf(fd, 'assigned_to', fields.assigned_to);
    appendIf(fd, 'created_by', fields.created_by);
    appendIf(fd, 'signed_by', fields.signed_by);
    fd.set('data', JSON.stringify(fields.data));
    for (const pic of fields.pictures ?? []) fd.append('pictures', pic);
    appendIf(fd, 'signature', fields.signature);
    appendIf(fd, 'signature_base64', fields.signature_base64);
    appendIf(fd, 'signed_latitude', fields.signed_latitude);
    appendIf(fd, 'signed_longitude', fields.signed_longitude);
    appendIf(fd, 'signed_accuracy', fields.signed_accuracy);
    return this.remote.postForm<ReportResponse>('/reports', fd);
  }
  update(id: string, body: UpdateReportRequest): Observable<ReportResponse> {
    return this.remote.patch<ReportResponse>(`/reports/${id}`, body);
  }
  setAssignee(id: string, body: UpdateAssigneeRequest): Observable<ReportHeaderResponse> {
    return this.remote.put<ReportHeaderResponse>(`/reports/${id}/assignee`, body);
  }
  addSignature(id: string, fields: AddSignatureFields): Observable<ReportResponse> {
    const fd = new FormData();
    fd.set('signed_by', fields.signed_by);
    appendIf(fd, 'signature', fields.signature);
    appendIf(fd, 'signature_base64', fields.signature_base64);
    fd.set('signed_latitude', String(fields.signed_latitude));
    fd.set('signed_longitude', String(fields.signed_longitude));
    appendIf(fd, 'signed_accuracy', fields.signed_accuracy);
    return this.remote.putForm<ReportResponse>(`/reports/${id}/signature`, fd);
  }
  addPictures(id: string, pictures: File[]): Observable<ReportDetailsResponse> {
    const fd = new FormData();
    for (const pic of pictures) fd.append('pictures', pic);
    return this.remote.putForm<ReportDetailsResponse>(`/reports/${id}/pictures`, fd);
  }
  removePictures(id: string, body: DeletePicturesRequest): Observable<ReportDetailsResponse> {
    return this.remote.delete<ReportDetailsResponse>(`/reports/${id}/pictures`, body);
  }
  remove(id: string): Observable<DeleteReportResponse> {
    return this.remote.delete<DeleteReportResponse>(`/reports/${id}`);
  }
  sendEmail(id: string, body: SendReportEmailRequest): Observable<SendReportEmailResponse> {
    return this.remote.post<SendReportEmailResponse>(`/reports/${id}/email`, body);
  }
  listEmails(id: string): Observable<ReportEmailListResponse> {
    return this.remote.get<ReportEmailListResponse>(`/reports/${id}/emails`);
  }
  revokeEmail(emailId: string): Observable<RevokeEmailResponse> {
    return this.remote.post<RevokeEmailResponse>(`/reports/emails/${emailId}/revoke`, {});
  }
  downloadByToken(token: string): Observable<Blob> {
    return this.remote.getBlob(`/reports/download/${token}`);
  }
}
