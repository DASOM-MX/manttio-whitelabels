import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Store } from '@ngxs/store';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';
import { AuthState } from '../app/store/auth/auth';

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private http = inject(HttpClient);
  private store = inject(Store);

  private get authHeaders() {
    const token = this.store.selectSnapshot(AuthState.token);
    return { Authorization: `Bearer ${token}` };
  }

  createReport(reportData: any): Observable<any> {
    return this.http.post(`${environment.apiUrl}reports`, reportData, {
      headers: this.authHeaders,
    });
  }

  updateReport(id: string, changes: Partial<any>): Observable<any> {
    return this.http.patch<any>(`${environment.apiUrl}reports/${id}`, changes, {
      headers: this.authHeaders,
    });
  }

  getReport(id: string): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}reports/${id}`, {
      headers: this.authHeaders,
    });
  }
}
