import type { Context } from 'hono';
import type { AppBindings } from '../../../env';
import { IMPORT_FILE_MAX_BYTES } from '../constants/import-limits';
import {
  FileTooLargeError,
  ImportInProgressError,
  ImportNotFoundError,
  ImportRowNotFoundError,
  ImportStateError,
  InvalidMappingError,
  UnparseableFileError,
} from './replenishment-imports.error';
import { warehouseErrorResponse } from './warehouses.error-response';

const STATE_MESSAGES: Record<ImportStateError['code'], string> = {
  import_not_pending: 'Este import ya fue enviado a procesar.',
  import_not_ready: 'Este import todavía no está listo para revisión.',
  import_not_rejected: 'Solo un import con cambios solicitados puede reenviarse.',
  import_not_cancellable: 'Este import ya está cerrado y no puede cancelarse.',
};

/** Replenishment-import domain errors → `{ error, message }` (02 §9). Location
 *  errors fall through to the warehouses mapper — the destination warehouse is
 *  its vocabulary — and that mapper rethrows anything unrecognized. */
export const replenishmentErrorResponse = (c: Context<AppBindings>, err: unknown) => {
  if (err instanceof ImportNotFoundError) {
    return c.json({ error: 'not_found', message: 'El import no existe.' }, 404);
  }
  if (err instanceof ImportRowNotFoundError) {
    return c.json({ error: 'not_found', message: 'Esa línea ya no existe en el import.' }, 404);
  }
  if (err instanceof UnparseableFileError) {
    return c.json(
      {
        error: 'unparseable_file',
        message: 'No pudimos leer el archivo. Debe ser .csv, .txt o .xlsx con una fila de encabezados.',
      },
      400,
    );
  }
  if (err instanceof FileTooLargeError) {
    return c.json(
      {
        error: 'file_too_large',
        message: `El archivo excede el límite de ${IMPORT_FILE_MAX_BYTES / 1024 / 1024} MB.`,
      },
      400,
    );
  }
  if (err instanceof InvalidMappingError) {
    return c.json(
      {
        error: 'invalid_mapping',
        message:
          'El mapeo debe incluir la columna de SKU y al menos una de cantidad, número de serie o lote.',
      },
      400,
    );
  }
  if (err instanceof ImportInProgressError) {
    return c.json(
      {
        error: 'import_in_progress',
        message: 'Este almacén ya tiene un reabastecimiento en curso; continúa con ese.',
        // The client resumes the existing one rather than starting over (07 §2),
        // so it needs the id, not just the refusal.
        importId: err.existingImportId,
      },
      409,
    );
  }
  if (err instanceof ImportStateError) {
    return c.json({ error: err.code, message: STATE_MESSAGES[err.code] }, 409);
  }
  return warehouseErrorResponse(c, err);
};
