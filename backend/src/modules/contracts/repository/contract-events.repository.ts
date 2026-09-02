import type { Db } from '../../database/client';
import { contractEvents } from '../models/contract-events.model';
import type { NewContractEvent } from '../types/contracts.types';

// Anything that can run a query: the pool client, or a transaction handle.
type QueryRunner = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

/** Append events to the contract timeline. Called with a caller-supplied
 *  QueryRunner so it can be composed into a larger transaction — the write
 *  always happens in the same transaction as the action it records. */
export const appendContractEvents = async (
  runner: QueryRunner,
  events: NewContractEvent[],
): Promise<void> => {
  if (events.length === 0) return;
  await runner.insert(contractEvents).values(events);
};
