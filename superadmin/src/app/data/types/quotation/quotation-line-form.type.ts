import type { FormControl, FormGroup } from '@angular/forms';
import type { ServiceTaxRate, ServiceUom } from '../../dtos/service';

/** One row of the builder's line FormArray.
 *
 *  A row is **catalog** (`offCatalog` false: `serviceId` required, the priced
 *  fields resolved server-side) or **off-catalog** (decided 2026-07-29:
 *  `name`/`unitPrice`/`uom`/`taxRate` required — they ARE the snapshot).
 *  Validators swap with the toggle; see `applyLineKindValidators`.
 *
 *  `discountPercent` is builder-local quick-entry and is **never sent**: typing
 *  a % converts once into `discountAmount`, the frozen figure the API stores
 *  (decided 2026-07-29). */
export type QuotationLineForm = FormGroup<{
  offCatalog: FormControl<boolean>;
  serviceId: FormControl<string>;
  name: FormControl<string>;
  unitPrice: FormControl<number | null>;
  uom: FormControl<ServiceUom | null>;
  taxRate: FormControl<ServiceTaxRate | null>;
  quantity: FormControl<number>;
  description: FormControl<string>;
  discountAmount: FormControl<number>;
  discountPercent: FormControl<number | null>;
}>;
