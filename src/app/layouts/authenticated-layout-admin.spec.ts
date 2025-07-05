import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuthenticatedLayoutAdmin } from './authenticated-layout-admin';

describe('AuthenticatedLayoutAdmin', () => {
  let component: AuthenticatedLayoutAdmin;
  let fixture: ComponentFixture<AuthenticatedLayoutAdmin>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuthenticatedLayoutAdmin]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AuthenticatedLayoutAdmin);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
