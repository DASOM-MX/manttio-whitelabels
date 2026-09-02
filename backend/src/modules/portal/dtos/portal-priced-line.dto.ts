import type { ServiceTaxRate, ServiceUom } from '../../services/enums/services.enum';

/** A catalog service frozen onto a document at the moment it was committed —
 *  the shape quotation lines and order lines share, because an order's lines
 *  are created from the quote's. Money is a decimal string, never a number. */
export interface PortalPricedLine {
  id: string;
  serviceName: string;
  uom: ServiceUom;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  taxRate: ServiceTaxRate;
}
