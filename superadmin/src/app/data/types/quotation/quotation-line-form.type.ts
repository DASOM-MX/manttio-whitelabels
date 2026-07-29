import type { FormControl, FormGroup } from '@angular/forms';

/** One row of the builder's line FormArray. Only the three fields the API
 *  accepts — price, name, uom and taxRate are resolved server-side from the
 *  catalog and never travel from here. */
export type QuotationLineForm = FormGroup<{
  serviceId: FormControl<string>;
  quantity: FormControl<number>;
  description: FormControl<string>;
}>;
