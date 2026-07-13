import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Human-formatted phone numbers: optional +country code and separators
 *  allowed, 10–15 digits once stripped (MX numbers are 10). Mirrors the
 *  backend's `brand.validator.ts` rule. Empty passes — pair with
 *  `Validators.required`. Surfaces as `{ phone: true }`. */
export const phoneValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const value: string = control.value ?? '';
  if (!value) return null;
  const digits = value.replace(/[\s\-().]/g, '');
  return /^\+?\d{10,15}$/.test(digits) ? null : { phone: true };
};
