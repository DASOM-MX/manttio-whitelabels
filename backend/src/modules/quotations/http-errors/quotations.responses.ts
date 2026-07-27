import type { Context } from 'hono';
import type { AppBindings } from '../../../env';
import type {
  InvalidRecipientError,
  QuotationClosedError,
  QuotationServiceNotFoundError,
} from './quotations.error';

// The HTTP half of this module's error contract: one responder per typed
// domain error thrown in `services/`. They live beside the error classes rather
// than in the controller so the code, status and Spanish message for a given
// failure are defined once — two routes can throw the same error, and the
// client must not have to handle two spellings of it.

/** Edits stop at `draft` — a conflict, not a validation failure: the payload is
 *  fine, the quote has simply moved past the point where editing it under the
 *  same folio would still be honest. */
export const notDraftResponse = (c: Context<AppBindings>) =>
  c.json(
    { error: 'quotation_not_draft', message: 'Solo se puede editar una cotización en borrador.' },
    409,
  );

/** `cancelled` / `order_created` are terminal — the way forward is a new quote,
 *  not resurrecting this one. */
export const notLiveResponse = (c: Context<AppBindings>) =>
  c.json(
    {
      error: 'quotation_not_live',
      message: 'La cotización ya fue cancelada o convertida en orden.',
    },
    409,
  );

/** Names the offending id so the builder can mark that row rather than showing
 *  a bare "algo salió mal". */
export const serviceGoneResponse = (
  c: Context<AppBindings>,
  err: QuotationServiceNotFoundError,
) =>
  c.json(
    {
      error: 'service_not_found',
      message: 'Una de las partidas referencia un servicio que ya no existe.',
      serviceId: err.serviceId,
    },
    400,
  );

/** Covers both "not this customer's contact" and "contact has no address" —
 *  deliberately one code, because the client's remedy is identical (pick a
 *  different recipient) and distinguishing them would tell an unauthenticated
 *  caller which contact ids exist. */
export const badRecipientResponse = (c: Context<AppBindings>, err: InvalidRecipientError) =>
  c.json(
    {
      error: 'invalid_recipient',
      message: 'Un destinatario no pertenece a este cliente o no tiene correo.',
      contactId: err.contactId,
    },
    400,
  );

// --- public token surface (20 §4) -----------------------------------------
// These reach an unauthenticated client contact, so the copy addresses them
// rather than staff, and none of it discloses anything about the tenant's
// internals.

/** An informational recipient holds a read-only copy of the quote. */
export const notAReviewerResponse = (c: Context<AppBindings>) =>
  c.json(
    {
      error: 'not_a_reviewer',
      message: 'Este enlace es solo de consulta; no permite aprobar ni rechazar.',
    },
    403,
  );

/** Only the *action* is closed — the page itself stays readable in both cases,
 *  because someone opening an expired link should still see what they were
 *  quoted rather than a dead end. */
export const quotationClosedResponse = (c: Context<AppBindings>, err: QuotationClosedError) =>
  c.json(
    {
      error: 'quotation_closed',
      message:
        err.reason === 'expired'
          ? 'La cotización venció y ya no puede responderse. Solicita una nueva.'
          : 'La cotización ya fue resuelta y ya no puede responderse.',
      reason: err.reason,
    },
    409,
  );
