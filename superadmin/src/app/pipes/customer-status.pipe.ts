import { Pipe, PipeTransform } from '@angular/core';
import { CUSTOMER_STATUS_LABELS } from '../model/constants/customer/customer-status-labels.const';
import { CUSTOMER_STATUS_SEVERITIES } from '../model/constants/customer/customer-status-severities.const';
import { CUSTOMER_SOURCE_LABELS } from '../model/constants/customer/customer-source-labels.const';
import type { CustomerSource, CustomerStatus } from '../data/dtos/customer';

/** Pure per-row client mappings (01 Angular: no method calls in templates). */

@Pipe({ name: 'customerStatusLabel' })
export class CustomerStatusLabelPipe implements PipeTransform {
  transform(status: CustomerStatus): string {
    return CUSTOMER_STATUS_LABELS[status];
  }
}

@Pipe({ name: 'customerStatusSeverity' })
export class CustomerStatusSeverityPipe implements PipeTransform {
  transform(status: CustomerStatus): 'success' | 'info' | 'secondary' | 'danger' {
    return CUSTOMER_STATUS_SEVERITIES[status];
  }
}

@Pipe({ name: 'customerSourceLabel' })
export class CustomerSourceLabelPipe implements PipeTransform {
  transform(source: CustomerSource): string {
    return CUSTOMER_SOURCE_LABELS[source];
  }
}
