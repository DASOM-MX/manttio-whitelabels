import { Component, computed, inject, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { map } from 'rxjs';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { TextareaModule } from 'primeng/textarea';
import { MessageService } from 'primeng/api';
import { RouterLink } from '@angular/router';
import { select, Store } from '@ngxs/store';
import { QuotationsState } from '../../../../state/quotations/quotations.state';
import { SendQuotation } from '../../../../state/quotations/quotations.actions';
import { CustomersService } from '../../../services/http/customers.service';
import { QuotationStatus } from '../../../model/enums/quotation/quotation-status.enum';
import { QuotationResponse } from '../../../model/enums/quotation/quotation-response.enum';
import { errorMessage } from '../../../data/utils';
import type { CustomerContact } from '../../../data/dtos/customer';
import type { QuotationDetail } from '../../../data/dtos/quotation/quotation';
import type { SendRecipientForm } from '../../../data/types/quotation/send-recipient-form.type';
import type { SendRecipientRow } from '../../../data/types/quotation/send-recipient-row.type';

/** Send / re-send a quotation to the client's contacts (20 §8).
 *
 *  Two behaviours from the API this dialog exists to make visible:
 *
 *  1. **A re-send can lower the status.** The tally is re-derived over the full
 *     reviewer set, so adding a reviewer to an `approved` quote drops it back to
 *     `partially_approved` — it is no longer true that everyone approved. The
 *     dialog warns before that happens rather than letting a quote appear to
 *     regress on its own.
 *  2. **A contact with no address fails the whole send**, not just their row.
 *     Those rows are locked here instead of being sent and rejected.
 *
 *  Contacts are fetched straight from the API rather than through
 *  `CustomersState` so opening this dialog never disturbs whatever customer the
 *  rest of the app has selected. */
@Component({
  selector: 'app-send-quotation-dialog',
  imports: [RouterLink, ReactiveFormsModule, DialogModule, CheckboxModule, TextareaModule],
  templateUrl: './send-quotation-dialog.html',
})
export class SendQuotationDialog {
  /** Emits after a successful send so the view reloads detail + timeline. */
  readonly sent = output<void>();

  private fb = inject(FormBuilder);
  private store = inject(Store);
  private customers = inject(CustomersService);
  private messages = inject(MessageService);
  private lastDelivery = select(QuotationsState.lastDelivery);

  protected dialogOpen = signal(false);
  protected submitting = signal(false);
  protected loadingContacts = signal(false);
  protected quotation = signal<QuotationDetail | null>(null);
  private contacts = signal<CustomerContact[]>([]);

  protected form = this.fb.nonNullable.group({
    message: [''],
    recipients: this.fb.array<SendRecipientForm>([]),
  });

  private recipientsValue = toSignal(
    this.form.controls.recipients.valueChanges.pipe(map(() => this.recipients.getRawValue())),
    { initialValue: this.form.controls.recipients.getRawValue() },
  );

  protected rows = computed<SendRecipientRow[]>(() => {
    const quotation = this.quotation();
    const sentTo = new Map((quotation?.recipients ?? []).map((r) => [r.contactId, r]));
    return this.recipientsValue().map((value, index) => {
      const contact = this.contacts()[index];
      const existing = sentTo.get(value.contactId);
      return {
        index,
        contactId: value.contactId,
        name: contact?.name ?? '',
        email: contact?.email ?? '',
        hasEmail: !!contact?.email,
        alreadySent: !!existing,
        hasApproved:
          existing?.isReviewer === true && existing.response === QuotationResponse.Approved,
        included: value.included,
        isReviewer: value.isReviewer,
      };
    });
  });

  protected selected = computed(() => this.rows().filter((row) => row.included && row.hasEmail));

  protected reviewerCount = computed(() => this.selected().filter((row) => row.isReviewer).length);

  /** No contacts at all — the quote cannot be sent from here.
   *
   *  A known gap, not a UI shortcut: recipients are `customer_contacts` rows
   *  and `quotation_recipients.contact_id` is NOT NULL, so a client whose
   *  record only carries the main email has nobody to mail (20 §4 lists that
   *  address as a target; the backend does not implement it yet). */
  protected hasNoContacts = computed(() => !this.loadingContacts() && this.contacts().length === 0);

  /** Would this send move an `approved` quote back down? True when it
   *  introduces a reviewer with no approval on record — a new one, or an
   *  informational recipient being promoted. */
  protected willLowerStatus = computed(() => {
    if (this.quotation()?.status !== QuotationStatus.Approved) return false;
    return this.selected().some((row) => row.isReviewer && !row.hasApproved);
  });

  protected canSend = computed(
    () => this.selected().length > 0 && !this.submitting() && !this.loadingContacts(),
  );

  protected get recipients() {
    return this.form.controls.recipients;
  }

  open(quotation: QuotationDetail): void {
    this.quotation.set(quotation);
    this.form.reset({ message: '' });
    this.recipients.clear();
    this.contacts.set([]);
    this.submitting.set(false);
    this.loadingContacts.set(true);
    this.dialogOpen.set(true);

    this.customers.get(quotation.customerId).subscribe({
      next: (customer) => {
        const sentTo = new Map(quotation.recipients.map((r) => [r.contactId, r]));
        const contacts = customer.contacts.filter((c) => !!c.id);
        this.contacts.set(contacts);
        for (const contact of contacts) {
          const existing = contact.id ? sentTo.get(contact.id) : undefined;
          const group = this.fb.nonNullable.group({
            contactId: [contact.id ?? '', Validators.required],
            // A re-send defaults to exactly who already has it, keeping their
            // reviewer standing — the common case is "send it again", not
            // "change who decides".
            included: [!!existing || (!quotation.recipients.length && !!contact.isDefault)],
            isReviewer: [existing?.isReviewer ?? false],
          });
          // Disabled on the control, not via a template `[disabled]` binding —
          // the latter is the reactive-forms footgun Angular warns about.
          if (!contact.email) {
            group.controls.included.setValue(false, { emitEvent: false });
            group.disable({ emitEvent: false });
          }
          this.recipients.push(group);
        }
        this.loadingContacts.set(false);
      },
      error: (err) => {
        this.loadingContacts.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'No se pudieron cargar los contactos',
          detail: errorMessage(err, 'Inténtalo de nuevo.'),
        });
      },
    });
  }

  protected close(): void {
    if (this.submitting()) return;
    this.dialogOpen.set(false);
  }

  protected confirm(): void {
    const quotation = this.quotation();
    if (!quotation || !this.canSend()) return;
    this.submitting.set(true);
    const message = this.form.getRawValue().message.trim();
    this.store
      .dispatch(
        new SendQuotation(quotation.id, {
          recipients: this.selected().map((row) => ({
            contactId: row.contactId,
            isReviewer: row.isReviewer,
          })),
          ...(message ? { message } : {}),
        }),
      )
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.dialogOpen.set(false);
          this.report();
          this.sent.emit();
        },
        error: (err) => {
          this.submitting.set(false);
          this.messages.add({
            severity: 'error',
            summary: 'No se pudo enviar',
            detail: errorMessage(err, 'Inténtalo de nuevo.'),
          });
        },
      });
  }

  /** A partial send is a success with a caveat, never an error: the recipients
   *  and their links exist, so the toast names the addresses that bounced
   *  instead of implying nothing went out. */
  private report(): void {
    const delivery = this.lastDelivery();
    if (delivery?.failed.length) {
      this.messages.add({
        severity: 'warn',
        summary: `Enviada a ${delivery.sent}, ${delivery.failed.length} sin entregar`,
        detail: `No llegó a: ${delivery.failed.map((f) => f.email).join(', ')}`,
        life: 10000,
      });
      return;
    }
    this.messages.add({ severity: 'success', summary: 'Cotización enviada' });
  }
}
