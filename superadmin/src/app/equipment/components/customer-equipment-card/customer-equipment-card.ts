import { Component, effect, inject, input, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TagModule } from 'primeng/tag';
import { LucidePlus, LucideWrench } from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { EquipmentState } from '../../../../state/equipment/equipment.state';
import { LoadCustomerEquipment } from '../../../../state/equipment/equipment.actions';
import {
  EquipmentStatusLabelPipe,
  EquipmentStatusSeverityPipe,
} from '../../../pipes/equipment-status.pipe';
import { EquipmentFormDialog } from '../equipment-form-dialog/equipment-form-dialog';

/** Compact equipment card for the customer view (11 §4) — the daily entry
 *  point. "Agregar equipo" opens the shared dialog with the client locked. */
@Component({
  selector: 'app-customer-equipment-card',
  imports: [
    RouterLink,
    TagModule,
    EquipmentStatusLabelPipe,
    EquipmentStatusSeverityPipe,
    EquipmentFormDialog,
    LucidePlus,
    LucideWrench,
  ],
  templateUrl: './customer-equipment-card.html',
})
export class CustomerEquipmentCard {
  customerId = input.required<string>();

  private store = inject(Store);
  protected equipment = select(EquipmentState.byCustomer);
  protected formDialog = viewChild<EquipmentFormDialog>('formDialog');

  constructor() {
    effect(() => {
      const id = this.customerId();
      if (id) this.store.dispatch(new LoadCustomerEquipment(id));
    });
  }

  protected openAdd(): void {
    this.formDialog()?.open({ customerId: this.customerId() });
  }

  protected refresh(): void {
    this.store.dispatch(new LoadCustomerEquipment(this.customerId()));
  }
}
