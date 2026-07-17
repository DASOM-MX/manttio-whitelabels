import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

const CORE_FIELDS = ['rfc', 'legalName', 'taxRegimeCode', 'fiscalZip', 'cfdiUseCode'] as const;

/** Fiscal block is optional as a whole, but all-or-nothing once any field is
 *  filled (07 §1) — a lone billing email also demands the core set, so it is
 *  never silently dropped on save. Surfaces as `{ fiscalIncomplete: true }`. */
export const fiscalGroupValidator: ValidatorFn = (
  group: AbstractControl,
): ValidationErrors | null => {
  const values = CORE_FIELDS.map((f) => String(group.get(f)?.value ?? '').trim());
  const filled = values.filter(Boolean).length;
  if (filled === CORE_FIELDS.length) return null;
  const billingFilled = !!String(group.get('billingEmail')?.value ?? '').trim();
  if (filled === 0 && !billingFilled) return null;
  return { fiscalIncomplete: true };
};
