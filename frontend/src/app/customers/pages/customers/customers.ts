import { Component, computed, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Store } from '@ngxs/store';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { CustomersState } from '../../../../state/customers/customers.state';
import { LoadCustomers } from '../../../../state/customers/customers.actions';

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [RouterModule, TableModule, ButtonModule],
  templateUrl: './customers.html',
  styleUrl: './customers.scss',
})
export class Customers {
  private store = inject(Store);

  customers = this.store.selectSignal(CustomersState.list);
  loading = this.store.selectSignal(CustomersState.loading);
  total = computed(() => this.customers().length);

  constructor() {
    this.store.dispatch(new LoadCustomers());
  }

  refresh(): void {
    this.store.dispatch(new LoadCustomers());
  }
}
