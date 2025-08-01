import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private baseUrl = 'http://localhost:3000/reports'; // Asegúrate de que coincida con tu backend

  constructor(private http: HttpClient) { }

  createReport(reportData: any): Observable<any> {

    const token = localStorage.getItem('token');

    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
    return this.http.post(`${this.baseUrl}`, reportData, { headers });
  }
}