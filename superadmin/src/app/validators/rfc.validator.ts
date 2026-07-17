import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** RFC (CFDI 4.0): 12 chars (persona moral) or 13 (persona física),
 *  uppercase — 3–4 letters (incl. Ñ/&) + yymmdd + 3-char homoclave. */
const RFC_RE = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

export const rfcValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = String(control.value ?? '').trim();
  if (!value) return null; // requiredness is the fiscal group's call
  return RFC_RE.test(value.toUpperCase()) && (value.length === 12 || value.length === 13)
    ? null
    : { rfc: true };
};
