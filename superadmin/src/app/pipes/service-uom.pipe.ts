import { Pipe, PipeTransform } from '@angular/core';
import { SERVICE_UOM_LABELS } from '../model/constants/services/service-uom-labels.const';
import { SERVICE_UOM_SHORT_LABELS } from '../model/constants/services/service-uom-short-labels.const';
import type { ServiceUom } from '../data/dtos/service';

@Pipe({ name: 'serviceUomLabel' })
export class ServiceUomLabelPipe implements PipeTransform {
  transform(uom: ServiceUom): string {
    return SERVICE_UOM_LABELS[uom];
  }
}

/** Table-column variant — 'm²' rather than 'Metro cuadrado (m²)'. */
@Pipe({ name: 'serviceUomShort' })
export class ServiceUomShortPipe implements PipeTransform {
  transform(uom: ServiceUom): string {
    return SERVICE_UOM_SHORT_LABELS[uom];
  }
}
