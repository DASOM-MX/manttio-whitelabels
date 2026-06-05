import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import { MessageService } from 'primeng/api';
import { Actions, Store } from '@ngxs/store';
import { CustomerAdd } from './customer-add';
import { CreateCustomer } from '../../../../state/customers/customers.actions';

describe('CustomerAdd', () => {
  let storeSpy: jasmine.SpyObj<Store>;
  let messagesSpy: jasmine.SpyObj<MessageService>;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(() => {
    storeSpy = jasmine.createSpyObj<Store>('Store', ['dispatch']);
    storeSpy.dispatch.and.returnValue(of(undefined) as any);
    messagesSpy = jasmine.createSpyObj<MessageService>('MessageService', ['add']);
    routerSpy = jasmine.createSpyObj<Router>('Router', ['navigate']);

    TestBed.configureTestingModule({
      imports: [CustomerAdd],
      providers: [
        provideZonelessChangeDetection(),
        { provide: Store, useValue: storeSpy },
        { provide: MessageService, useValue: messagesSpy },
        { provide: Router, useValue: routerSpy },
        { provide: Actions, useValue: new Subject<unknown>() },
      ],
    });
  });

  it('starts with an invalid form (name is required)', () => {
    const fixture = TestBed.createComponent(CustomerAdd);
    expect(fixture.componentInstance.form.invalid).toBeTrue();
  });

  it('does NOT dispatch when submitting an empty form', () => {
    const fixture = TestBed.createComponent(CustomerAdd);
    fixture.componentInstance.onSubmit();
    expect(storeSpy.dispatch).not.toHaveBeenCalled();
  });

  it('dispatches CreateCustomer with only the trimmed, non-empty fields', () => {
    const fixture = TestBed.createComponent(CustomerAdd);
    const component = fixture.componentInstance;
    component.form.setValue({
      name: '  Acme Corp  ',
      razonSocial: '',
      email: 'contact@acme.com',
      identification: '',
      phone: '  555-1234  ',
      address: '',
      state: 'Jalisco',
      observation: '',
    });
    component.onSubmit();

    expect(storeSpy.dispatch).toHaveBeenCalledTimes(1);
    const action = storeSpy.dispatch.calls.mostRecent().args[0] as CreateCustomer;
    expect(action).toEqual(jasmine.any(CreateCustomer));
    expect(action.payload).toEqual({
      name: 'Acme Corp',
      email: 'contact@acme.com',
      phone: '555-1234',
      state: 'Jalisco',
      razonSocial: undefined,
      identification: undefined,
      address: undefined,
      observation: undefined,
    });
  });

  it('does NOT dispatch when the email is malformed', () => {
    const fixture = TestBed.createComponent(CustomerAdd);
    const component = fixture.componentInstance;
    component.form.setValue({
      name: 'Acme',
      razonSocial: '',
      email: 'not-an-email',
      identification: '',
      phone: '',
      address: '',
      state: null,
      observation: '',
    });
    component.onSubmit();
    expect(storeSpy.dispatch).not.toHaveBeenCalled();
  });

  it('treats whitespace-only values as empty (omits them from the payload)', () => {
    const fixture = TestBed.createComponent(CustomerAdd);
    const component = fixture.componentInstance;
    component.form.setValue({
      name: 'Acme',
      razonSocial: '   ',
      email: '',
      identification: '   ',
      phone: '',
      address: '',
      state: null,
      observation: '   ',
    });
    component.onSubmit();

    const action = storeSpy.dispatch.calls.mostRecent().args[0] as CreateCustomer;
    expect(action.payload.razonSocial).toBeUndefined();
    expect(action.payload.identification).toBeUndefined();
    expect(action.payload.observation).toBeUndefined();
    expect(action.payload.name).toBe('Acme');
  });

  it('omits state when nothing is selected', () => {
    const fixture = TestBed.createComponent(CustomerAdd);
    const component = fixture.componentInstance;
    component.form.setValue({
      name: 'Acme',
      razonSocial: '',
      email: '',
      identification: '',
      phone: '',
      address: '',
      state: null,
      observation: '',
    });
    component.onSubmit();

    const action = storeSpy.dispatch.calls.mostRecent().args[0] as CreateCustomer;
    expect(action.payload.state).toBeUndefined();
  });
});
