import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SignaturePad } from './signature-pad';

describe('SignaturePad', () => {
  let component: SignaturePad;
  let fixture: ComponentFixture<SignaturePad>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SignaturePad]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SignaturePad);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
