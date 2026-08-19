import { Pipe, PipeTransform } from '@angular/core';
import { SERVICE_TAX_RATE_LABELS } from '../model/constants/services/service-tax-rate-labels.const';
import { SERVICE_TAX_RATE_SHORT_LABELS } from '../model/constants/services/service-tax-rate-short-labels.const';
import type { ServiceTaxRate } from '../data/dtos/service';

@Pipe({ name: 'serviceTaxRateLabel' })
export class ServiceTaxRateLabelPipe implements PipeTransform {
  transform(rate: ServiceTaxRate): string {
    return SERVICE_TAX_RATE_LABELS[rate];
  }
}

/** Table-column variant — '16%' rather than 'IVA 16% (general)'. */
@Pipe({ name: 'serviceTaxRateShort' })
export class ServiceTaxRateShortPipe implements PipeTransform {
  transform(rate: ServiceTaxRate): string {
    return SERVICE_TAX_RATE_SHORT_LABELS[rate];
  }
}
