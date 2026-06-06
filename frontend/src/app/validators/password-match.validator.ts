import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Group-level validator: when `password` has a value, `confirmPassword` must
 *  match it. Passive when `password` is empty so it doesn't fight the optional
 *  "change password" flow on user-edit (where both fields start empty and
 *  staying empty means "keep the current password"). */
export const passwordMatchValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const password = control.get('password');
  const confirmPassword = control.get('confirmPassword');
  if (
    password?.value &&
    confirmPassword &&
    password.value !== confirmPassword.value
  ) {
    return { passwordMismatch: true };
  }
  return null;
};
