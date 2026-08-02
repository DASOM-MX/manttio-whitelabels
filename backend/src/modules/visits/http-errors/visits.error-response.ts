import type { Context } from 'hono';
import type { AppBindings } from '../../../env';
import {
  EquipmentCustomerMismatchError,
  InvalidActualTimeError,
  OrderCustomerMismatchError,
  ReportCustomerMismatchError,
  ServiceOrderNotOpenError,
  TechnicianNotFoundError,
  VisitAlreadyRescheduledError,
  VisitCustomerNotFoundError,
  VisitNotAssignedToUserError,
  VisitNotClosedError,
  VisitNotCorrectableError,
  VisitNotFoundError,
  VisitNotOpenError,
  VisitNotStartableError,
  VisitNotTerminalError,
  VisitServiceOrderNotFoundError,
} from './visits.error';

/** Translates the module's thrown domain errors into the API's
 *  `{ error, message }` shape, keeping the controller to validate → service →
 *  respond.
 *
 *  Everything mapped here is a rule the request broke, not a bug: the payload
 *  was well-formed and the caller simply asked for something the visit's state
 *  or the actor's role doesn't allow. Anything unrecognized is rethrown so the
 *  global handler still turns real faults into a 500 — this must never become
 *  a catch-all that swallows them. */
export const visitErrorResponse = (c: Context<AppBindings>, err: unknown) => {
  // Only thrown on a lost race — the visit was soft-deleted mid-request. Same
  // answer as the ordinary missing-visit path so callers see one 404 shape.
  if (err instanceof VisitNotFoundError) {
    return c.json({ error: 'not_found' }, 404);
  }
  if (err instanceof VisitNotOpenError) {
    return c.json(
      {
        error: 'visit_not_open',
        message: 'Esta visita ya fue atendida o cerrada y no puede modificarse.',
      },
      409,
    );
  }
  if (err instanceof VisitNotCorrectableError) {
    return c.json(
      {
        error: 'visit_not_correctable',
        message: 'Esta visita ya está en curso o finalizada y su programación no puede moverse.',
      },
      409,
    );
  }
  if (err instanceof VisitNotStartableError) {
    return c.json(
      { error: 'visit_not_startable', message: 'Esta visita ya fue iniciada o finalizada.' },
      409,
    );
  }
  if (err instanceof VisitNotTerminalError) {
    return c.json(
      {
        error: 'visit_not_terminal',
        message: 'Solo pueden corregirse los tiempos de una visita ya finalizada o cerrada.',
      },
      409,
    );
  }
  if (err instanceof InvalidActualTimeError) {
    return c.json({ error: 'invalid_actual_time', message: err.message }, 400);
  }
  if (err instanceof VisitNotClosedError) {
    return c.json(
      { error: 'visit_not_closed', message: 'Solo puede reprogramarse una visita cerrada.' },
      409,
    );
  }
  if (err instanceof VisitAlreadyRescheduledError) {
    return c.json(
      {
        error: 'visit_already_rescheduled',
        message: 'Esta visita ya tiene una visita de reemplazo.',
      },
      409,
    );
  }
  if (err instanceof VisitNotAssignedToUserError) {
    return c.json(
      { error: 'visit_not_yours', message: 'Solo puedes actuar sobre visitas asignadas a ti.' },
      403,
    );
  }
  if (err instanceof EquipmentCustomerMismatchError) {
    return c.json(
      {
        error: 'equipment_customer_mismatch',
        message: 'Algún equipo seleccionado no pertenece a este cliente.',
      },
      409,
    );
  }
  if (err instanceof ReportCustomerMismatchError) {
    return c.json(
      { error: 'report_customer_mismatch', message: 'El reporte no pertenece a este cliente.' },
      409,
    );
  }
  if (err instanceof ServiceOrderNotOpenError) {
    return c.json(
      {
        error: 'service_order_not_open',
        message: 'Solo pueden programarse visitas en una orden de servicio abierta.',
      },
      409,
    );
  }
  if (err instanceof OrderCustomerMismatchError) {
    return c.json(
      {
        error: 'order_customer_mismatch',
        message: 'La orden de servicio no pertenece a este cliente.',
      },
      409,
    );
  }
  if (err instanceof VisitCustomerNotFoundError) {
    return c.json({ error: 'customer_not_found', message: 'El cliente no existe.' }, 400);
  }
  if (err instanceof VisitServiceOrderNotFoundError) {
    return c.json(
      { error: 'service_order_not_found', message: 'La orden de servicio no existe.' },
      400,
    );
  }
  if (err instanceof TechnicianNotFoundError) {
    return c.json({ error: 'technician_not_found', message: 'El técnico no existe.' }, 400);
  }
  throw err;
};
