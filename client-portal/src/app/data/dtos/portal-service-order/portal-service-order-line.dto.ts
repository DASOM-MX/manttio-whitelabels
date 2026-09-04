import type { ServiceTaxRate } from '../../../model/enums/service/service-tax-rate.enum';

/** One scope line, frozen at order creation (backend
 *  `PortalServiceOrderLine` — the priced line without the quotation's
 *  `description`, which order lines don't carry). */
export interface PortalServiceOrderLine {
  id: string;
  serviceName: string;
  uom: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  taxRate: ServiceTaxRate;
}
