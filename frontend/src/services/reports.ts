import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private baseUrl = 'reports';

  constructor(private http: HttpClient) {}

  createReport(reportData: any): Observable<any> {
    const token = localStorage.getItem('token');

    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
    return this.http.post(`${this.baseUrl}`, reportData, { headers });
  }

  updateReport(id: string, changes: Partial<any>): Observable<any> {
    return this.http.patch<any>(
      `${environment.apiUrl}${this.baseUrl}/${id}`,
      changes,
      {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      }
    );
  }

  getReport(id: string): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}${this.baseUrl}/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
  }
}
