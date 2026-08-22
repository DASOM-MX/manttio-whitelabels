import { Component, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { LucideFileText } from '@lucide/angular';
import { ContractsService } from '../../../services/http/contracts.service';
import {
  ContractTypeLabelPipe,
  ContractValidityLabelPipe,
  ContractValiditySeverityPipe,
} from '../../../pipes/contract.pipe';
import type { Contract } from '../../../data/dtos/contract/contract';

/** The contracts one job generated (13 §2, 19 §5 — CP-3).
 *
 *  An order generates **0..n**: a job may produce a guarantee, a programmed-
 *  maintenance agreement, both, or nothing at all — which is why the link lives
 *  on the contract (`serviceOrderId`) and this is a list rather than a single
 *  slot on the order.
 *
 *  Reads the dedicated `GET /service-orders/:id/contracts` through the HTTP
 *  service; `ContractsState` is route-lazy on `/contracts` and does not exist
 *  on the order view. */
@Component({
  selector: 'app-service-order-contracts-card',
  imports: [
    RouterLink,
    TableModule,
    TagModule,
    ContractTypeLabelPipe,
    ContractValidityLabelPipe,
    ContractValiditySeverityPipe,
    LucideFileText,
  ],
  templateUrl: './service-order-contracts-card.html',
})
export class ServiceOrderContractsCard {
  serviceOrderId = input.required<string>();

  private contractsApi = inject(ContractsService);

  protected contracts = signal<Contract[]>([]);
  protected loading = signal(true);
  protected readonly skeletonRows = [0, 1];

  constructor() {
    // input() is available after construction; defer the first load a tick.
    queueMicrotask(() => this.load());
  }

  private load(): void {
    this.loading.set(true);
    this.contractsApi.listForServiceOrder(this.serviceOrderId()).subscribe({
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
