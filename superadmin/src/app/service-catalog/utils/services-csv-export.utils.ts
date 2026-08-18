import { SERVICE_CSV_COLUMNS } from '../../model/constants/services/service-csv-columns.const';
import { toCsv } from './csv.utils';
import type { Service } from '../../data/dtos/service';

/** Export (18 §6.3): the loaded catalog as canonical CSV — wire-enum codes
 *  (`servicio`, `iva_16`…), never labels, so the file round-trips through the
 *  import mapper untouched. Client-side only: the list already holds the
 *  whole catalog, and it's an admin-tier action so `cost` ships too. */
export const servicesToCsv = (services: Service[]): string =>
  toCsv(
    [...SERVICE_CSV_COLUMNS],
    services.map((svc) =>
      SERVICE_CSV_COLUMNS.map((column) => {
        const value = svc[column];
        if (value === undefined || value === null) return '';
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        return String(value);
      }),
    ),
  );
