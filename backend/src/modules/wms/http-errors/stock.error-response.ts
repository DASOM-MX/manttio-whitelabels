import type { Context } from 'hono';
import type { AppBindings } from '../../../env';
import { MaterialNotFoundError } from './materials.error';
import {
  InsufficientStockError,
  InvalidReasonContextError,
  NoAssignedWarehouseError,
  NotOwnVanError,
  NoteRequiredError,
  ReasonInactiveError,
  SameLocationError,
  SerialExistsError,
  SourceForbiddenError,
  TrackingMismatchError,
  UnitNotAvailableError,
  UseReplenishmentFlowError,
} from './stock.error';
import { warehouseErrorResponse } from './warehouses.error-response';

const TRACKING_LABELS: Record<string, string> = {
  serialized: 'serializado',
  lot: 'por lote',
  unserialized: 'por cantidad',
};

/** Stock-operation domain errors → the API's `{ error, message }` shape (02 §9).
 *
 *  Location errors fall through to the warehouses mapper: `warehouse_not_found`
 *  and `node_warehouse_mismatch` mean the same thing here as they do there, and
 *  a second copy would drift. That mapper rethrows anything unrecognized, so
 *  real faults still reach the global handler as a logged 500. */
export const stockErrorResponse = (c: Context<AppBindings>, err: unknown) => {
  if (err instanceof MaterialNotFoundError) {
    return c.json({ error: 'not_found', message: 'El material no existe.' }, 404);
  }
  if (err instanceof TrackingMismatchError) {
    return c.json(
      {
        error: 'tracking_mismatch',
        message: `Este material es ${TRACKING_LABELS[err.tracking] ?? err.tracking}; el movimiento debe enviarse en esa forma.`,
      },
      400,
    );
  }
  if (err instanceof InvalidReasonContextError) {
    return c.json(
      {
        error: 'invalid_reason_context',
        message: 'El motivo seleccionado no aplica a este tipo de movimiento.',
      },
      400,
    );
  }
  if (err instanceof ReasonInactiveError) {
    return c.json(
      { error: 'reason_inactive', message: 'El motivo seleccionado está desactivado.' },
      400,
    );
  }
  if (err instanceof NoteRequiredError) {
    return c.json(
      { error: 'note_required', message: 'Este motivo exige una nota que lo explique.' },
      400,
    );
  }
  if (err instanceof UseReplenishmentFlowError) {
    return c.json(
      {
        error: 'use_replenishment_flow',
        message: 'Un reabastecimiento se registra desde el flujo de reabastecimientos.',
      },
      400,
    );
  }
  if (err instanceof SameLocationError) {
    return c.json(
      { error: 'same_location', message: 'El origen y el destino son la misma ubicación.' },
      400,
    );
  }
  if (err instanceof NotOwnVanError) {
    return c.json(
      { error: 'not_own_van', message: 'Solo puedes cargar material a tu propio almacén.' },
      403,
    );
  }
  if (err instanceof SourceForbiddenError) {
    return c.json(
      { error: 'source_forbidden', message: 'No puedes tomar material del almacén de otro técnico.' },
      403,
    );
  }
  if (err instanceof NoAssignedWarehouseError) {
    return c.json(
      {
        error: 'no_assigned_warehouse',
        message: 'No tienes un almacén asignado; pide a un administrador que te asigne uno.',
      },
      409,
    );
  }
  if (err instanceof InsufficientStockError) {
    return c.json(
      { error: 'insufficient_stock', message: `Existencias insuficientes: ${err.detail}.` },
      409,
    );
  }
  if (err instanceof SerialExistsError) {
    return c.json(
      {
        error: 'serial_exists',
        message: `Ya existe una pieza con el número de serie "${err.serialNumber}".`,
      },
      409,
    );
  }
  if (err instanceof UnitNotAvailableError) {
    return c.json(
      {
        error: 'unit_not_available',
        message: 'Alguna de las piezas seleccionadas ya no está disponible en el origen.',
      },
      409,
    );
  }
  return warehouseErrorResponse(c, err);
};
