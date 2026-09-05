import { ServiceTaxRate } from '../../enums/service/service-tax-rate.enum';

/** Compact IVA labels for the lines table cell. */
export const SERVICE_TAX_RATE_LABELS: Record<ServiceTaxRate, string> = {
  [ServiceTaxRate.Iva16]: '16%',
  [ServiceTaxRate.Iva8]: '8%',
  [ServiceTaxRate.Iva0]: '0%',
  [ServiceTaxRate.Exento]: 'Exento',
};
