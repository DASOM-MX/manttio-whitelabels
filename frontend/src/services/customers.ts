import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Customer {
  id: string;
  name: string;
  identification: string;
  phone: string;
  email: string;
  observation: string;

}

@Injectable({
  providedIn: 'root'
})
export class CustomersService {
  private baseUrl = 'http://localhost:3000/customers';

  constructor(private http: HttpClient) { }

  getCustomers(): Observable<Customer[]> {

    return this.http.get<Customer[]>(this.baseUrl);
  }
}
