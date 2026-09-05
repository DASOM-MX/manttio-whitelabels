import { Pipe, PipeTransform } from '@angular/core';
import { SERVICE_TAX_RATE_LABELS } from '../model/constants/service/service-tax-rate-labels.const';
import type { ServiceTaxRate } from '../model/enums/service/service-tax-rate.enum';

@Pipe({ name: 'serviceTaxRateLabel' })
export class ServiceTaxRateLabelPipe implements PipeTransform {
  transform(rate: ServiceTaxRate): string {
    return SERVICE_TAX_RATE_LABELS[rate];
  }
}
