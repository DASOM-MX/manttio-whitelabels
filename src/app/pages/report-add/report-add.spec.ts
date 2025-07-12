import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReportAdd } from './report-add';

describe('ReportAdd', () => {
  let component: ReportAdd;
  let fixture: ComponentFixture<ReportAdd>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReportAdd]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReportAdd);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
