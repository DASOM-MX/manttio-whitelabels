import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';


@Injectable({ providedIn: 'root' })
export class ReportsService {
  private baseUrl = 'http://localhost:3000/reports';

  constructor(private http: HttpClient) { }

  createReport(reportData: any): Observable<any> {

    const token = localStorage.getItem('token');

    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
    return this.http.post(`${this.baseUrl}`, reportData, { headers });
  }

  updateReport(id: string, changes: Partial<any>): Observable<any> {
    return this.http.patch<any>(`${this.baseUrl}/${id}`, changes, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
  }

  getReport(id: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
  }
}