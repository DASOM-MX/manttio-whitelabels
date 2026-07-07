import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

const CORE_FIELDS = ['rfc', 'legalName', 'taxRegimeCode', 'fiscalZip', 'cfdiUseCode'] as const;

/** Fiscal block is optional as a whole, but all-or-nothing once any field is
 *  filled (07 §1). Surfaces as `{ fiscalIncomplete: true }` on the group. */
export const fiscalGroupValidator: ValidatorFn = (
  group: AbstractControl,
): ValidationErrors | null => {
  const values = CORE_FIELDS.map((f) => String(group.get(f)?.value ?? '').trim());
  const filled = values.filter(Boolean).length;
  if (filled === 0 || filled === CORE_FIELDS.length) return null;
  return { fiscalIncomplete: true };
};
