import { ServiceTaxRate } from '../../../data/dtos/service';

/** Full IVA labels for the form select (18 §1). `Exento` is spelled out as
 *  distinct from 0% — same money, different CFDI treatment. */
export const SERVICE_TAX_RATE_LABELS: Record<ServiceTaxRate, string> = {
  [ServiceTaxRate.Iva16]: 'IVA 16% (general)',
  [ServiceTaxRate.Iva8]: 'IVA 8% (región fronteriza)',
  [ServiceTaxRate.Iva0]: 'IVA 0% (tasa cero)',
  [ServiceTaxRate.Exento]: 'Exento de IVA',
};
