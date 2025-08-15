import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CustomerAdd } from './customer-add';

describe('CustomerAdd', () => {
  let component: CustomerAdd;
  let fixture: ComponentFixture<CustomerAdd>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomerAdd]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CustomerAdd);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
