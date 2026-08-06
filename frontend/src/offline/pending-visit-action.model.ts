import type { CloseVisitRequest } from '../app/data/dtos/visit';

/** The three field taps a technician can queue offline (12 CP-3). */
export enum PendingVisitActionType {
  Start = 'start',
  Respond = 'respond',
  Close = 'close',
}

/** Sync lifecycle of a queued tap. Terminal records are kept (with `syncedAt`)
 *  rather than deleted — the queue doubles as the device's local trace of what
 *  was tapped when, which is the evidence a technician has if a sync outcome is
 *  ever disputed. Old terminal rows are pruned on boot.
 *
 *  There is no `failed`: a transient failure (no network, 5xx) leaves the
 *  record `pending` with `lastError` set and the sync retries next reconnect;
 *  a definitive rejection means the server already has a truth this tap would
 *  contradict, and the record becomes `superseded` — server wins (offline
 *  conflict rule, owner 2026-08-04). */
export enum PendingVisitActionStatus {
  Pending = 'pending',
  Syncing = 'syncing',
  /** The server accepted the action. */
  Synced = 'synced',
  /** The server refused it definitively (duplicate Iniciar, visit office
   *  already resolved) — dropped, not retried. */
  Superseded = 'superseded',
}

/** One queued tap, persisted in IndexedDB. `at` is the **local tap timestamp**
 *  — the field time the API records, preserved verbatim through the sync (the
 *  whole point of queueing rather than replaying at reconnect). */
export interface PendingVisitAction {
  /** Client-generated id (`crypto.randomUUID()`). Primary key. */
  tempId: string;
  visitId: string;
  /** The visit's `V-…` code, denormalized so queue UI can name the visit
   *  without a lookup that may itself need the network. */
  internalCode: string;
  action: PendingVisitActionType;
  /** When the technician tapped (ISO). Doubles as the queue's FIFO order. */
  at: string;
  /** Cerrar's categorized reason + note. Absent on Iniciar/Terminar. */
  close?: CloseVisitRequest;
  status: PendingVisitActionStatus;
  lastError?: string;
  /** Stamped when the record reached a terminal status. */
  syncedAt?: string;
}
