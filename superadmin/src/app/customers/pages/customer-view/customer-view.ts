import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { DatePickerModule } from 'primeng/datepicker';
import { MessageService } from 'primeng/api';
import {
  LucideBan,
  LucideMail,
  LucidePencil,
  LucidePhone,
  LucidePlus,
  LucideMessageCircle,
  LucideRefreshCw,
  LucideSearchX,
  LucideStar,
} from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { CustomersState } from '../../../../state/customers/customers.state';
import {
  LoadCustomer,
  SaveCustomerContacts,
  SetFollowUp,
} from '../../../../state/customers/customers.actions';
import { CustomerStatus } from '../../../data/dtos/customer';
import type { CustomerContact } from '../../../data/dtos/customer';
import {
  CustomerSourceLabelPipe,
  CustomerStatusLabelPipe,
  CustomerStatusSeverityPipe,
} from '../../../pipes/customer-status.pipe';
import { AddContactDialog } from '../../components/add-contact-dialog/add-contact-dialog';
import { ChangeStatusDialog } from '../../../crm/components/change-status-dialog/change-status-dialog';
import { CustomerTimeline } from '../../../crm/components/customer-timeline/customer-timeline';
import { CustomerEquipmentCard } from '../../../equipment/components/customer-equipment-card/customer-equipment-card';
import { CustomerReportsCard } from '../../../reports/components/customer-reports-card/customer-reports-card';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { errorMessage } from '../../../data/utils';

/** Client detail (07 §3): 360 header + General/Contactos/Fiscal tabs, plus the
 *  live CRM surface (08) — status change dialog, inline follow-up, blacklist
 *  banner, and the activity timeline in its own "Actividad" tab. Quick-contact
 *  buttons open the channel AND jump to the timeline composer pre-filled with
 *  the matching type (08 §2.1) — logging is one save away, never automatic. */
@Component({
  selector: 'app-customer-view',
  imports: [
    SlicePipe,
    RouterLink,
    ReactiveFormsModule,
    TabsModule,
    TagModule,
    DatePickerModule,
    CustomerStatusLabelPipe,
    CustomerStatusSeverityPipe,
    CustomerSourceLabelPipe,
    ChangeStatusDialog,
    CustomerTimeline,
    AddContactDialog,
    CustomerEquipmentCard,
    CustomerReportsCard,
    PageHeader,
    LucideBan,
    LucidePencil,
    LucidePhone,
    LucidePlus,
    LucideMail,
    LucideMessageCircle,
    LucideRefreshCw,
    LucideSearchX,
    LucideStar,
  ],
  templateUrl: './customer-view.html',
})
export class CustomerView {
  private store = inject(Store);
  private route = inject(ActivatedRoute);
  private messages = inject(MessageService);

  protected customer = select(CustomersState.selected);
  protected loadFailed = select(CustomersState.selectedError);
  protected customerId: string = this.route.snapshot.paramMap.get('id') ?? '';

  /** Which detail tab is showing — a signal so quick-contact can switch to
   *  "actividad" before pre-filling the composer. */
  protected activeTab = signal('general');

  protected addContactDialog = viewChild<AddContactDialog>('addContactDialog');
  protected statusDialog = viewChild<ChangeStatusDialog>('statusDialog');
  protected timeline = viewChild<CustomerTimeline>('timeline');

  /** Inline follow-up field (08 §3) — saves on change via PATCH. */
  protected followUp = new FormControl<Date | null>(null);
  private syncingFollowUp = false;

  /** Blacklist reason banner shows only for blacklisted clients that carry one. */
  protected showBlacklistReason = computed(() => {
    const c = this.customer();
    return c?.status === CustomerStatus.Blacklisted && !!c.blacklistReason;
  });

  protected openAddContact(): void {
    const c = this.customer();
    if (c) this.addContactDialog()?.open(c);
  }

  /** Promote a contact to primary straight from the list (backend replaces the
   *  contacts wholesale, so we send the full set with the new default). */
  protected makeDefault(target: CustomerContact): void {
    const c = this.customer();
    if (!c || target.isDefault) return;
    const contacts = c.contacts.map((contact) => ({
      ...contact,
      isDefault: contact === target,
    }));
    this.store.dispatch(new SaveCustomerContacts(c.id, contacts)).subscribe({
      next: () =>
        this.messages.add({ severity: 'success', summary: 'Contacto principal actualizado' }),
      error: (err) =>
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo actualizar',
          detail: errorMessage(err, 'Inténtalo de nuevo.'),
        }),
    });
  }

  /** Quick-action hrefs (07 §2.1) — precomputed, no template calls. */
  protected phoneHref = computed(() => {
    const phone = this.customer()?.phone;
    return phone ? `tel:${phone.replace(/\s+/g, '')}` : null;
  });
  protected whatsappHref = computed(() => {
    const phone = this.customer()?.phone;
    return phone ? `https://wa.me/${phone.replace(/\D/g, '')}` : null;
  });
  /** SMS deep-link (the bubble action) — separate channel from WhatsApp. */
  protected smsHref = computed(() => {
    const phone = this.customer()?.phone;
    return phone ? `sms:${phone.replace(/\s+/g, '')}` : null;
  });
  protected emailHref = computed(() => {
    const email = this.customer()?.email;
    return email ? `mailto:${email}` : null;
  });

  constructor() {
    if (this.customerId) this.store.dispatch(new LoadCustomer(this.customerId));

    this.followUp.valueChanges.pipe(takeUntilDestroyed()).subscribe((date) => {
      if (this.syncingFollowUp) return;
      const iso = date ? date.toISOString().slice(0, 10) : null;
      const current = this.customer()?.nextFollowUpAt?.slice(0, 10) ?? null;
      if (iso === current) return;
      this.store.dispatch(new SetFollowUp(this.customerId, iso)).subscribe({
        error: (err) =>
          this.messages.add({
            severity: 'error',
            summary: 'No se pudo guardar el seguimiento',
            detail: errorMessage(err, 'Inténtalo de nuevo.'),
          }),
      });
    });

    // Mirror state → control without re-dispatching.
    this.store
      .select(CustomersState.selected)
      .pipe(takeUntilDestroyed())
      .subscribe((c) => {
        this.syncingFollowUp = true;
        this.followUp.setValue(c?.nextFollowUpAt ? new Date(c.nextFollowUpAt) : null, {
          emitEvent: false,
        });
        this.syncingFollowUp = false;
      });
  }

  /** p-tabs emits `string | number | undefined` — normalize to our tab keys. */
  protected setTab(value: string | number | undefined): void {
    this.activeTab.set(String(value ?? 'general'));
  }

  protected openStatusDialog(): void {
    const c = this.customer();
    if (c) this.statusDialog()?.open(c);
  }

  protected onStatusChanged(): void {
    // Backend emitted the system entry — reload page 1 (read-your-writes).
    this.timeline()?.reload();
  }

  /** Quick contact (08 §2.1): the channel opens via the anchor's href; here we
   *  jump to the Actividad tab and pre-fill the composer so logging the touch
   *  is one save away (never auto-saved — the contact may not complete). */
  protected prefillLog(kind: 'call' | 'whatsapp' | 'email'): void {
    this.activeTab.set('actividad');
    // The timeline lives in a tab panel that may render only on activation —
    // defer the open() so its view is created first.
    setTimeout(() => this.timeline()?.open(kind), 0);
  }
}
