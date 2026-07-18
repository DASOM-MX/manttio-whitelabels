import type { AbstractControl, ValidationErrors } from '@angular/forms';
import { FormArray } from '@angular/forms';

/** A customer needs at least one contact (the primary). Attach to the contacts
 *  FormArray. */
export function contactsRequiredValidator(control: AbstractControl): ValidationErrors | null {
  return control instanceof FormArray && control.length > 0 ? null : { contactsRequired: true };
}
