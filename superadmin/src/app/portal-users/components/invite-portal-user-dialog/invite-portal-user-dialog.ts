import { Component, DestroyRef, computed, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { Store } from '@ngxs/store';
import { CustomersService } from '../../../services/http/customers.service';
import { CustomerSelect } from '../../../shared/components/customer-select/customer-select';
import { InvitePortalUser } from '../../../../state/portal-users/portal-users.actions';
import { PortalGrant } from '../../../model/enums/portal-user/portal-grant.enum';
import { errorMessage } from '../../../data/utils';
import { PortalGrantsFieldset } from '../portal-grants-fieldset/portal-grants-fieldset';
import type { CustomerContact } from '../../../data/dtos/customer';
import type { Option } from '../../../data/types/option';

/** Invite dialog (26 §2) — the portal's only door. Own section, own form: it
 *  picks an existing contact and never creates, edits or writes back to one
 *  (decision 27 — no grant surface lives in the customers editor).
 *
 *  Deliberately small: customer, then contact, then grants, then the admin
 *  toggle, then send. The contact's email is rendered as text, never an
 *  input — a wrong address is fixed on the contact, not typed into a
 *  credential. The temp password never appears here (26 §5): the backend
 *  mails it and the invite response never carries it.
 *
 *  The grant tick-boxes are `PortalGrantsFieldset` (26 CP-3) — the same
 *  component the standalone grants editor uses, so the grouping, labels,
 *  helper text and the Aprobar/Consultar cotizaciones dependency live in one
 *  place instead of two copies drifting apart. */
@Component({
  selector: 'app-invite-portal-user-dialog',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    DialogModule,
    CheckboxModule,
    SelectModule,
    CustomerSelect,
    PortalGrantsFieldset,
  ],
  templateUrl: './invite-portal-user-dialog.html',
})
export class InvitePortalUserDialog {
  readonly invited = output<void>();

  private readonly fb = inject(FormBuilder);
  private readonly store = inject(Store);
  private readonly customers = inject(CustomersService);
  private readonly messages = inject(MessageService);
  private readonly destroyRef = inject(DestroyRef);

  protected dialogOpen = signal(false);
  protected submitting = signal(false);
  protected loadingContacts = signal(false);
  private contacts = signal<CustomerContact[]>([]);

  protected form = this.fb.nonNullable.group({
    customerId: ['', Validators.required],
    contactId: ['', Validators.required],
    isAdmin: [false],
  });

  /** Keyed by the grant string values themselves — see
   *  `PortalGrantsFieldset`, which both surfaces share. */
  protected grantsForm = this.fb.nonNullable.group(
    Object.fromEntries(Object.values(PortalGrant).map((grant) => [grant, false])),
  );

  private status = toSignal(this.form.statusChanges, { initialValue: this.form.status });
  private selectedCustomerId = signal('');
  private selectedContactId = signal('');

  protected contactOptions = computed<Option[]>(() =>
    this.contacts().map((c) => ({ label: c.role ? `${c.name} — ${c.role}` : c.name, value: c.id ?? '' })),
  );
  protected selectedContact = computed(() =>
    this.contacts().find((c) => c.id === this.selectedContactId()),
  );
  protected customerChosen = computed(() => !!this.selectedCustomerId());
  protected hasNoContacts = computed(
    () => this.customerChosen() && !this.loadingContacts() && this.contacts().length === 0,
  );
  protected canSubmit = computed(() => this.status() === 'VALID' && !this.submitting());

  constructor() {
    this.form.controls.customerId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((customerId) => this.onCustomerChange(customerId));
    this.form.controls.contactId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((contactId) => this.selectedContactId.set(contactId));
  }

  open(): void {
    this.form.reset({ customerId: '', contactId: '', isAdmin: false });
    this.grantsForm.reset(
      Object.fromEntries(Object.values(PortalGrant).map((grant) => [grant, false])),
    );
    this.contacts.set([]);
    this.selectedCustomerId.set('');
    this.selectedContactId.set('');
    this.submitting.set(false);
    this.dialogOpen.set(true);
  }

  protected close(): void {
    if (this.submitting()) return;
    this.dialogOpen.set(false);
  }

  protected submit(): void {
    if (!this.canSubmit()) return;
    const raw = this.form.getRawValue();
    const grantsRaw = this.grantsForm.getRawValue();
    const grants = Object.entries(grantsRaw)
      .filter(([, checked]) => checked)
      .map(([grant]) => grant as PortalGrant);
    this.submitting.set(true);

    this.store
      .dispatch(
        new InvitePortalUser({
          contactId: raw.contactId,
          isAdmin: raw.isAdmin,
          grants,
        }),
      )
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.dialogOpen.set(false);
          this.messages.add({ severity: 'success', summary: 'Invitación enviada' });
          this.invited.emit();
        },
        error: (err) => {
          this.submitting.set(false);
          this.messages.add({
            severity: 'error',
            summary: 'No se pudo invitar',
            detail: errorMessage(err, 'Inténtalo de nuevo.'),
          });
        },
      });
  }

  /** Contacts come straight from the customer read, not `CustomersState` —
   *  opening this dialog must never disturb whatever customer the rest of
   *  the app has selected (the send-quotation-dialog idiom). Only contacts
   *  with a saved id and an email are offered: the former can't be invited
   *  (no contact row to attach to yet) and the latter has nowhere to mail
   *  the invite. */
  private onCustomerChange(customerId: string): void {
    this.selectedCustomerId.set(customerId);
    this.form.controls.contactId.setValue('', { emitEvent: false });
    this.selectedContactId.set('');
    this.contacts.set([]);
    if (!customerId) return;

    this.loadingContacts.set(true);
    this.customers.get(customerId).subscribe({
      next: (customer) => {
        this.contacts.set(customer.contacts.filter((c) => !!c.id && !!c.email));
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
}
