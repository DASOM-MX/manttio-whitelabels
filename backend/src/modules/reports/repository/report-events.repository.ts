import type { Db } from '../../database/client';
import { reportEvents } from '../models/report-events.model';
import type { NewReportEvent } from '../types/reports.types';

// Anything that can run a query: the pool client, or a transaction handle.
type QueryRunner = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

/** Append events to the report timeline. Called with a caller-supplied
 *  QueryRunner so it can be composed into a larger transaction — the write
 *  always happens in the same transaction as the action it records. */
export const appendReportEvents = async (
  runner: QueryRunner,
  events: NewReportEvent[],
): Promise<void> => {
  if (events.length === 0) return;
  await runner.insert(reportEvents).values(events);
};
