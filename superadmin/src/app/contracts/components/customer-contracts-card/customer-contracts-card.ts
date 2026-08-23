import { Component, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { LucideFileText, LucidePlus } from '@lucide/angular';
import { ContractsService } from '../../../services/http/contracts.service';
import {
  ContractTypeLabelPipe,
  ContractValidityLabelPipe,
  ContractValiditySeverityPipe,
} from '../../../pipes/contract.pipe';
import type { Contract } from '../../../data/dtos/contract/contract';

/** The client's filed contracts, mounted in 07's customer view (13 §6, CP-3).
 *
 *  Reads the dedicated `GET /customers/:id/contracts` — the client is the path,
 *  so no stray filter can contradict it — and the feed is **role-scoped
 *  backend-side**: office sees only the contracts whose `visibleToRoles`
 *  includes them, which is why the card never filters visibility itself.
 *
 *  Fetches through the HTTP service rather than `ContractsState`: that state is
 *  route-lazy on `/contracts`, so it does not exist on this page at all. */
@Component({
  selector: 'app-customer-contracts-card',
  imports: [
    RouterLink,
    TableModule,
    TagModule,
    ContractTypeLabelPipe,
    ContractValidityLabelPipe,
    ContractValiditySeverityPipe,
    LucideFileText,
    LucidePlus,
  ],
  templateUrl: './customer-contracts-card.html',
})
export class CustomerContractsCard {
  customerId = input.required<string>();

  private contractsApi = inject(ContractsService);

  protected contracts = signal<Contract[]>([]);
  protected loading = signal(true);
  protected readonly skeletonRows = [0, 1, 2];

  constructor() {
    // input() is available after construction; defer the first load a tick.
    queueMicrotask(() => this.load());
  }

  private load(): void {
    this.loading.set(true);
    this.contractsApi.listForCustomer(this.customerId()).subscribe({
      next: (contracts) => {
        this.contracts.set(contracts);
        this.loading.set(false);
      },
      error: () => {
        this.contracts.set([]);
        this.loading.set(false);
      },
    });
  }
}
