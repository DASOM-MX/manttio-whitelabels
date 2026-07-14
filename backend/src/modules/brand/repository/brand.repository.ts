import type { Db } from '../../database/client';
import { brand } from '../models/brand.model';
import type { BrandRow, NewBrandRow } from '../types/brand.types';

export const findBrand = async (db: Db): Promise<BrandRow | null> => {
  const rows = await db.select().from(brand).limit(1);
  return rows[0] ?? null;
};

// Full-replace upsert of the single row (id pinned to 1). Callers pass every
// column explicitly (absent optionals as null) — the two write paths share
// last-write-wins semantics, so nothing may linger from the previous write.
export const upsertBrand = async (
  db: Db,
  values: Omit<NewBrandRow, 'id'>,
): Promise<BrandRow> => {
  const rows = await db
    .insert(brand)
    .values({ ...values, id: 1 })
    .onConflictDoUpdate({
      target: brand.id,
      set: { ...values, updatedAt: new Date() },
    })
    .returning();
  return rows[0]!;
};
