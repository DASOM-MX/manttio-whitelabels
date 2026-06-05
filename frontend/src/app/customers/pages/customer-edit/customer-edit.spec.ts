import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import { MessageService } from 'primeng/api';
import { Actions, Store } from '@ngxs/store';
import { CustomerEdit } from './customer-edit';
import { LoadCustomer, UpdateCustomer } from '../../../../state/customers/customers.actions';
import { CustomersState } from '../../../../state/customers/customers.state';
import type { CustomerRow } from '../../../data/dtos/customer';

describe('CustomerEdit', () => {
  let storeSpy: jasmine.SpyObj<Store>;
  let messagesSpy: jasmine.SpyObj<MessageService>;
  let routerSpy: jasmine.SpyObj<Router>;
  let selectedSignal: ReturnType<typeof signal<CustomerRow | null>>;

  const mockCustomer: CustomerRow = {
    id: 'cust-1',
    name: 'Acme',
    razonSocial: null,
    email: null,
    identification: null,
    phone: '5551234567',
    address: null,
    state: null,
    observation: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  // Mirrors what the effect() in CustomerEdit does once the selected customer
  // resolves. We invoke it manually because we don't render the template (the
  // routerLink directive needs a real Router) and effect flushing in zoneless
  // test contexts is unreliable.
  const populateForm = (component: CustomerEdit, c: CustomerRow): void => {
    component.form.reset({
      name: c.name ?? '',
      razonSocial: (c.razonSocial ?? '').toUpperCase(),
      email: c.email ?? '',
      identification: (c.identification ?? '').toUpperCase(),
      phone: (c.phone ?? '').replace(/\D/g, '').slice(0, 10),
      address: c.address ?? '',
      state: c.state ?? null,
      observation: c.observation ?? '',
    });
  };

  beforeEach(() => {
    selectedSignal = signal<CustomerRow | null>(mockCustomer);

    storeSpy = jasmine.createSpyObj<Store>('Store', ['dispatch', 'selectSignal']);
    storeSpy.dispatch.and.returnValue(of(undefined) as any);
    storeSpy.selectSignal.and.callFake((sel: any) => {
      if (sel === CustomersState.selected) return selectedSignal as any;
      return signal(null) as any;
    });

    messagesSpy = jasmine.createSpyObj<MessageService>('MessageService', ['add']);
    routerSpy = jasmine.createSpyObj<Router>('Router', ['navigate']);

    TestBed.configureTestingModule({
      imports: [CustomerEdit],
      providers: [
        provideZonelessChangeDetection(),
        { provide: Store, useValue: storeSpy },
        { provide: MessageService, useValue: messagesSpy },
        { provide: Router, useValue: routerSpy },
        { provide: Actions, useValue: new Subject<unknown>() },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of({ get: (k: string) => (k === 'id' ? 'cust-1' : null) }),
            snapshot: { paramMap: { get: (k: string) => (k === 'id' ? 'cust-1' : null) } },
          },
        },
      ],
    });
  });

  it('dispatches LoadCustomer on construction', () => {
    TestBed.createComponent(CustomerEdit);
    const dispatched = storeSpy.dispatch.calls.allArgs().flat();
    expect(dispatched.some((a) => a instanceof LoadCustomer && (a as LoadCustomer).id === 'cust-1'))
      .withContext('LoadCustomer("cust-1") should be dispatched on init')
      .toBeTrue();
  });

  it('dispatches UpdateCustomer with only the dirty fields, trimmed', () => {
    const fixture = TestBed.createComponent(CustomerEdit);
    const component = fixture.componentInstance;
    populateForm(component, mockCustomer);
    storeSpy.dispatch.calls.reset();

    component.form.controls['phone'].setValue('5559999000');
    component.form.controls['phone'].markAsDirty();
    component.onSubmit();

    expect(storeSpy.dispatch).toHaveBeenCalledTimes(1);
    const action = storeSpy.dispatch.calls.mostRecent().args[0] as UpdateCustomer;
    expect(action).toEqual(jasmine.any(UpdateCustomer));
    expect(action.id).toBe('cust-1');
    expect(action.payload).toEqual({ phone: '5559999000' });
  });

  it('normalizes razón social and RFC to uppercase as the user types', () => {
    const fixture = TestBed.createComponent(CustomerEdit);
    const component = fixture.componentInstance;
    populateForm(component, mockCustomer);

    component.form.controls['razonSocial'].setValue('Acme S.A. de C.V.');
    component.form.controls['identification'].setValue('xaxx010101000');

    expect(component.form.controls['razonSocial'].value).toBe('ACME S.A. DE C.V.');
    expect(component.form.controls['identification'].value).toBe('XAXX010101000');
  });

  it('strips non-digits and caps the phone at 10 characters', () => {
    const fixture = TestBed.createComponent(CustomerEdit);
    const component = fixture.componentInstance;
    populateForm(component, mockCustomer);

    component.form.controls['phone'].setValue('(555) 123-4567 ext. 999');

    expect(component.form.controls['phone'].value).toBe('5551234567');
  });

  it('marks the form invalid when the phone has fewer than 10 digits', () => {
    const fixture = TestBed.createComponent(CustomerEdit);
    const component = fixture.componentInstance;
    populateForm(component, mockCustomer);
    storeSpy.dispatch.calls.reset();

    component.form.controls['phone'].setValue('555123');
    component.form.controls['phone'].markAsDirty();
    component.onSubmit();

    expect(storeSpy.dispatch).not.toHaveBeenCalled();
  });

  it('dispatches a multi-field UpdateCustomer when several controls are dirty', () => {
    const fixture = TestBed.createComponent(CustomerEdit);
    const component = fixture.componentInstance;
    populateForm(component, mockCustomer);
    storeSpy.dispatch.calls.reset();

    component.form.controls['email'].setValue('contact@acme.com');
    component.form.controls['email'].markAsDirty();
    component.form.controls['state'].setValue('Jalisco');
    component.form.controls['state'].markAsDirty();
    component.onSubmit();

    const action = storeSpy.dispatch.calls.mostRecent().args[0] as UpdateCustomer;
    expect(action.payload).toEqual({ email: 'contact@acme.com', state: 'Jalisco' });
  });

  it('shows an info toast and does NOT dispatch when nothing is dirty', () => {
    const fixture = TestBed.createComponent(CustomerEdit);
    const component = fixture.componentInstance;
    populateForm(component, mockCustomer);
    storeSpy.dispatch.calls.reset();

    component.onSubmit();

    expect(storeSpy.dispatch).not.toHaveBeenCalled();
    expect(messagesSpy.add).toHaveBeenCalledWith(
      jasmine.objectContaining({ severity: 'info' }),
    );
  });

  it('does NOT dispatch when the form is invalid (name cleared)', () => {
    const fixture = TestBed.createComponent(CustomerEdit);
    const component = fixture.componentInstance;
    populateForm(component, mockCustomer);
    storeSpy.dispatch.calls.reset();

    component.form.controls['name'].setValue('');
    component.form.controls['name'].markAsDirty();
    component.onSubmit();

    expect(storeSpy.dispatch).not.toHaveBeenCalled();
  });

  it('does NOT dispatch when the form is invalid (bad email)', () => {
    const fixture = TestBed.createComponent(CustomerEdit);
    const component = fixture.componentInstance;
    populateForm(component, mockCustomer);
    storeSpy.dispatch.calls.reset();

    component.form.controls['email'].setValue('not-an-email');
    component.form.controls['email'].markAsDirty();
    component.onSubmit();

    expect(storeSpy.dispatch).not.toHaveBeenCalled();
  });

  it('skips dirty fields that trim to empty', () => {
    const fixture = TestBed.createComponent(CustomerEdit);
    const component = fixture.componentInstance;
    populateForm(component, mockCustomer);
    storeSpy.dispatch.calls.reset();

    component.form.controls['address'].setValue('   ');
    component.form.controls['address'].markAsDirty();
    component.onSubmit();

    expect(storeSpy.dispatch).not.toHaveBeenCalled();
    expect(messagesSpy.add).toHaveBeenCalledWith(
      jasmine.objectContaining({ severity: 'info' }),
    );
  });
});
