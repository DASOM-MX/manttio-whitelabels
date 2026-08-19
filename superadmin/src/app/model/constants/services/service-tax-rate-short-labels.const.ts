import { ServiceTaxRate } from '../../../data/dtos/service';

/** Compact IVA labels for the catalog table column — the parenthetical in
 *  `SERVICE_TAX_RATE_LABELS` is too wide for a dense cell. */
export const SERVICE_TAX_RATE_SHORT_LABELS: Record<ServiceTaxRate, string> = {
  [ServiceTaxRate.Iva16]: '16%',
  [ServiceTaxRate.Iva8]: '8%',
  [ServiceTaxRate.Iva0]: '0%',
  [ServiceTaxRate.Exento]: 'Exento',
};
