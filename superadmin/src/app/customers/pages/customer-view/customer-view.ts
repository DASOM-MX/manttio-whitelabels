import { Component, computed, inject } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TagModule } from 'primeng/tag';
import {
  LucideArrowLeft,
  LucideMail,
  LucidePencil,
  LucidePhone,
  LucideMessageCircle,
} from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { CustomersState } from '../../../../state/customers/customers.state';
import { LoadCustomer } from '../../../../state/customers/customers.actions';
import {
  CustomerSourceLabelPipe,
  CustomerStatusLabelPipe,
  CustomerStatusSeverityPipe,
} from '../../../pipes/customer-status.pipe';

/** Client detail (07 §3): 360 header (status, tags, quick contact, summary
 *  strip) + general/fiscal cards + reserved CRM (08) and Bills (09) slots. */
@Component({
  selector: 'app-customer-view',
  imports: [
    SlicePipe,
    RouterLink,
    TagModule,
    CustomerStatusLabelPipe,
    CustomerStatusSeverityPipe,
    CustomerSourceLabelPipe,
    LucideArrowLeft,
    LucidePencil,
    LucidePhone,
    LucideMail,
    LucideMessageCircle,
  ],
  templateUrl: './customer-view.html',
})
export class CustomerView {
  private store = inject(Store);
  private route = inject(ActivatedRoute);

  protected customer = select(CustomersState.selected);

  /** Quick-action hrefs (07 §2.1) — precomputed, no template calls. */
  protected phoneHref = computed(() => {
    const phone = this.customer()?.phone;
    return phone ? `tel:${phone.replace(/\s+/g, '')}` : null;
  });
  protected whatsappHref = computed(() => {
    const phone = this.customer()?.phone;
    return phone ? `https://wa.me/${phone.replace(/\D/g, '')}` : null;
  });
  protected emailHref = computed(() => {
    const email = this.customer()?.email;
    return email ? `mailto:${email}` : null;
  });

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.store.dispatch(new LoadCustomer(id));
  }
}
