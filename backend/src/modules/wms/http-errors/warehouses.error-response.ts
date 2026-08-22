import type { Context } from 'hono';
import type { AppBindings } from '../../../env';
import {
  AssigneeNotFoundError,
  DuplicateNodeNameError,
  IncompleteAssignmentError,
  InvalidAssignmentLevelError,
  InvalidParentError,
  InvalidParentTypeError,
  NodeNotEmptyError,
  NodeWarehouseMismatchError,
  NotATechnicianError,
  NotOwnWarehouseError,
  StorageNodeNotFoundError,
  TechnicianAlreadyAssignedError,
  WarehouseNotEmptyError,
  WarehouseNotFoundError,
  WarehouseNotLocatableError,
} from './warehouses.error';

/** Translates the registry's thrown domain errors into the API's
 *  `{ error, message }` shape (02 §9), keeping the controller to
 *  validate → service → respond.
 *
 *  Everything mapped here is a rule the request broke, never a bug: the payload
 *  was well-formed and the caller asked for something the structure, the stock
 *  or the actor's role doesn't allow. Anything unrecognized is **rethrown** so
 *  the global handler still turns real faults into a logged 500 — this must not
 *  become a catch-all. */
export const warehouseErrorResponse = (c: Context<AppBindings>, err: unknown) => {
  if (err instanceof WarehouseNotFoundError || err instanceof StorageNodeNotFoundError) {
    return c.json({ error: 'not_found' }, 404);
  }
  if (err instanceof InvalidParentError) {
    return c.json({ error: 'invalid_parent', message: err.message }, 400);
  }
  if (err instanceof InvalidParentTypeError) {
    return c.json(
      {
        error: 'invalid_parent_type',
        message: `Una ubicación de tipo "${err.childType}" no puede colocarse dentro de una de tipo "${err.parentType}".`,
      },
      400,
    );
  }
  if (err instanceof NodeWarehouseMismatchError) {
    return c.json(
      {
        error: 'node_warehouse_mismatch',
        message: 'La ubicación seleccionada pertenece a otro almacén.',
      },
      400,
    );
  }
  if (err instanceof DuplicateNodeNameError) {
    return c.json(
      {
        error: 'duplicate_node_name',
        message: `Ya existe una ubicación llamada "${err.name}" en el mismo nivel.`,
      },
      409,
    );
  }
  if (err instanceof WarehouseNotEmptyError) {
    return c.json({ error: 'warehouse_not_empty', message: err.message }, 409);
  }
  if (err instanceof NodeNotEmptyError) {
    return c.json({ error: 'node_not_empty', message: err.message }, 409);
  }
  if (err instanceof AssigneeNotFoundError) {
    return c.json(
      { error: 'assignee_not_found', message: 'El usuario seleccionado no existe.' },
      400,
    );
  }
  if (err instanceof NotATechnicianError) {
    return c.json(
      {
        error: 'not_a_technician',
        message: 'Solo un usuario con rol de técnico puede asignarse como responsable técnico.',
      },
      400,
    );
  }
  if (err instanceof TechnicianAlreadyAssignedError) {
    return c.json(
      {
        error: 'technician_already_assigned',
        message: 'Este técnico ya tiene un almacén asignado.',
      },
      409,
    );
  }
  if (err instanceof InvalidAssignmentLevelError) {
    return c.json(
      {
        error: 'invalid_assignment_level',
        message: 'Solo un almacén o una unidad de almacenamiento puede tener responsable.',
      },
      400,
    );
  }
  if (err instanceof IncompleteAssignmentError) {
    return c.json(
      {
        error: 'incomplete_assignment',
        message: 'La asignación necesita usuario y rol; envía ambos o ninguno.',
      },
      400,
    );
  }
  if (err instanceof WarehouseNotLocatableError) {
    return c.json(
      {
        error: 'warehouse_not_locatable',
        message: 'Un almacén necesita una referencia de ubicación o un par de coordenadas.',
      },
      400,
    );
  }
  if (err instanceof NotOwnWarehouseError) {
    return c.json(
      { error: 'not_own_van', message: 'Solo puedes consultar el almacén asignado a ti.' },
      403,
    );
  }
  throw err;
};
