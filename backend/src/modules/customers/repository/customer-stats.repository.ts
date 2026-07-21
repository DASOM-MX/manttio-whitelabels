import { and, inArray, isNull, sql } from 'drizzle-orm';
import type { Db } from '../../database/client';
import { customers } from '../models/customers.model';
import { CustomerStatus } from '../enums/customers.enum';
import type { IntakeCountRow } from '../types/customer-stats.types';

// "When the current status took effect": rows still holding their birth status
// carry NULL status_changed_at, so readers coalesce to created_at (utm-params 03).
const effectiveAt = sql`coalesce(${customers.statusChangedAt}, ${customers.createdAt})`;

/** Lead/active counts grouped by source × status for one period. Soft-deleted
 *  rows excluded; the partial `customers_source_idx` carries the read. */
export const countIntakeBySource = async (
  db: Db,
  from: Date,
  to: Date,
): Promise<IntakeCountRow[]> => {
  return db
    .select({
      source: customers.source,
      status: customers.status,
      count: sql<number>`count(*)::int`,
    })
    .from(customers)
    .where(
      and(
        isNull(customers.deletedAt),
        inArray(customers.status, [CustomerStatus.Lead, CustomerStatus.Active]),
        sql`${effectiveAt} >= ${from.toISOString()}`,
        sql`${effectiveAt} < ${to.toISOString()}`,
      ),
    )
    .groupBy(customers.source, customers.status);
};
