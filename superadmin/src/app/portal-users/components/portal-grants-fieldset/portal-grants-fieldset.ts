import { Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import type { FormGroup } from '@angular/forms';
import { CheckboxModule } from 'primeng/checkbox';
import { PORTAL_GRANT_GROUPS } from '../../../model/constants/portal-user/portal-grant-groups.const';
import { PortalGrant } from '../../../model/enums/portal-user/portal-grant.enum';
import { PortalGrantLabelPipe } from '../../../pipes/portal-grant-label.pipe';
import { PortalGrantHelperTextPipe } from '../../../pipes/portal-grant-helper-text.pipe';

/** The eight-grant tick-box set, grouped Consultar/Actuar (26 §3) — one
 *  source of truth for both the invite dialog (26 CP-2) and the standalone
 *  grants editor (26 CP-3).
 *
 *  Presentational: the parent owns the `FormGroup` and reads it back on
 *  submit. It is keyed by the grant string values themselves (`view_reports`,
 *  …) rather than camelCase aliases, so `[formControlName]="grant"` binds
 *  straight off the loop variable with no lookup table. This component only
 *  renders the group and wires the one dependency the backend enforces —
 *  Aprobar cotizaciones requires Consultar cotizaciones — so a form built
 *  from this component can never produce the combination the validator
 *  rejects. */
@Component({
  selector: 'app-portal-grants-fieldset',
  imports: [ReactiveFormsModule, CheckboxModule, PortalGrantLabelPipe, PortalGrantHelperTextPipe],
  templateUrl: './portal-grants-fieldset.html',
})
export class PortalGrantsFieldset {
  readonly grants = input.required<FormGroup>();

  private readonly destroyRef = inject(DestroyRef);

  protected readonly groups = PORTAL_GRANT_GROUPS;

  /** Mirrors `approve_quotations` for the template: a getter call in a
   *  binding would re-run every change-detection pass. */
  protected approveChecked = signal(false);

  constructor() {
    // The parent builds this FormGroup once and never replaces it, so this
    // effect runs exactly once — signals only re-fire on a reference change.
    effect(() => {
      const form = this.grants();
      const approve = form.controls[PortalGrant.ApproveQuotations];
      const view = form.controls[PortalGrant.ViewQuotations];
      this.approveChecked.set(!!approve.value);

      approve.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((checked) => {
        this.approveChecked.set(checked);
        // Ticking Aprobar cotizaciones ticks Consultar cotizaciones (26 §3);
        // the backend rejects the combination without it.
        if (checked) view.setValue(true, { emitEvent: false });
      });
      view.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((checked) => {
        // Unticking the view grant can't leave Aprobar standing on its own.
        if (!checked) {
          approve.setValue(false, { emitEvent: false });
          this.approveChecked.set(false);
        }
      });
    });
  }
}
