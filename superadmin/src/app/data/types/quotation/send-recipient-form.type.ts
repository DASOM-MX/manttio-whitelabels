import type { FormControl, FormGroup } from '@angular/forms';

/** One row of the send dialog's recipient FormArray. `included` is local to the
 *  dialog — the API only ever receives the ticked rows. */
export type SendRecipientForm = FormGroup<{
  contactId: FormControl<string>;
  included: FormControl<boolean>;
  isReviewer: FormControl<boolean>;
}>;
