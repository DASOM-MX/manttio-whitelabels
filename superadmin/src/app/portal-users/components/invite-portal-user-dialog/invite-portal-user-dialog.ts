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
 *  mails it and the invite response never carries it. */
@Component({
  selector: 'app-invite-portal-user-dialog',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    DialogModule,
    CheckboxModule,
    SelectModule,
    CustomerSelect,
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
    viewReports: [false],
    viewContracts: [false],
    viewQuotations: [false],
    viewServiceOrders: [false],
    viewEquipment: [false],
    approveQuotations: [false],
    createServiceRequests: [false],
    cancelServiceRequests: [false],
  });

  private status = toSignal(this.form.statusChanges, { initialValue: this.form.status });
  private selectedCustomerId = signal('');
  private selectedContactId = signal('');
  /** Mirrors `approveQuotations` for the template — it can't call the
   *  control's `.value` getter from a binding without re-running on every
   *  change-detection pass. */
  protected approveQuotationsChecked = signal(false);

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
    // Aprobar cotizaciones requires Consultar cotizaciones (26 §3, enforced
    // server-side too) — ticking the first ticks the second; unticking the
    // second can't leave the first standing on its own.
    this.form.controls.approveQuotations.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((checked) => {
        this.approveQuotationsChecked.set(checked);
        if (checked) this.form.controls.viewQuotations.setValue(true, { emitEvent: false });
      });
    this.form.controls.viewQuotations.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((checked) => {
        if (!checked) {
          this.form.controls.approveQuotations.setValue(false, { emitEvent: false });
          this.approveQuotationsChecked.set(false);
        }
      });

    this.form.controls.customerId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((customerId) => this.onCustomerChange(customerId));
    this.form.controls.contactId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((contactId) => this.selectedContactId.set(contactId));
  }

  open(): void {
    this.form.reset({
      customerId: '',
      contactId: '',
      isAdmin: false,
      viewReports: false,
      viewContracts: false,
      viewQuotations: false,
      viewServiceOrders: false,
      viewEquipment: false,
      approveQuotations: false,
      createServiceRequests: false,
      cancelServiceRequests: false,
    });
    this.contacts.set([]);
    this.selectedCustomerId.set('');
    this.selectedContactId.set('');
    this.approveQuotationsChecked.set(false);
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
    this.submitting.set(true);

    const grants: PortalGrant[] = [];
    if (raw.viewReports) grants.push(PortalGrant.ViewReports);
    if (raw.viewContracts) grants.push(PortalGrant.ViewContracts);
    if (raw.viewQuotations) grants.push(PortalGrant.ViewQuotations);
    if (raw.viewServiceOrders) grants.push(PortalGrant.ViewServiceOrders);
    if (raw.viewEquipment) grants.push(PortalGrant.ViewEquipment);
    if (raw.approveQuotations) grants.push(PortalGrant.ApproveQuotations);
    if (raw.createServiceRequests) grants.push(PortalGrant.CreateServiceRequests);
    if (raw.cancelServiceRequests) grants.push(PortalGrant.CancelServiceRequests);

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
