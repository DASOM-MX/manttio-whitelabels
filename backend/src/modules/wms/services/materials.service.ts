import type { Db } from '../../database/client';
import { isUniqueViolation, uniqueConstraintName } from '../../database/db-errors';
import {
  MaterialHasStockError,
  SkuInUseError,
  TrackingImmutableError,
  UpcInUseError,
} from '../http-errors/materials.error';
import {
  findMaterialById,
  insertMaterial,
  listMaterialEntries,
  listMaterialLots,
  listMaterialsPaged,
  listMaterialUnits,
  materialHasMovements,
  materialHasStock,
  softDeleteMaterial,
  updateMaterialRow,
} from '../repository/materials.repository';
import type {
  MaterialDTO,
  MaterialRow,
  MaterialStockDTO,
  StockPlaceRefDTO,
  UpdateMaterialFields,
} from '../types/materials.types';
import type {
  CreateMaterialInput,
  ListMaterialsQuery,
  UpdateMaterialInput,
} from '../validators/materials.validator';

const opt = <T>(value: T | null): T | undefined => value ?? undefined;

/** A left-joined node comes back as a null OBJECT, not null fields. */
const place = (node: StockPlaceRefDTO | null): StockPlaceRefDTO | undefined => node ?? undefined;

const toDTO = (row: { material: MaterialRow; totalStock: string }): MaterialDTO => {
  const { material, totalStock } = row;
  return {
    id: material.id,
    sku: opt(material.sku),
    upc: opt(material.upc),
    name: material.name,
    description: opt(material.description),
    unit: material.unit,
    tracking: material.tracking,
    minStock: opt(material.minStock),
    totalStock,
    // Derived here as well as in SQL — the query needs it to filter, the DTO
    // needs it to render, and both read the same two numbers.
    lowStock: material.minStock !== null && Number(totalStock) < Number(material.minStock),
    createdAt: material.createdAt.toISOString(),
  };
};

/** Two partial uniques on one table, so "duplicate" is not a precise enough
 *  answer — the dialog has to know which field to mark. Read off the violated
 *  index rather than pre-checked, which keeps it correct under a race. */
const translateDuplicate = (
  err: unknown,
  attempted: { sku?: string | null; upc?: string | null },
): never => {
  if (isUniqueViolation(err)) {
    const constraint = uniqueConstraintName(err);
    if (constraint === 'materials_upc_uidx' && attempted.upc) {
      throw new UpcInUseError(attempted.upc);
    }
    if (attempted.sku) throw new SkuInUseError(attempted.sku);
  }
  throw err;
};

export const getMaterials = async (
  db: Db,
  query: ListMaterialsQuery,
): Promise<{ items: MaterialDTO[]; total: number }> => {
  const { items, total } = await listMaterialsPaged(
    db,
    { search: query.search, tracking: query.tracking, lowStock: query.lowStock },
    query.page,
    query.limit,
  );
  return { items: items.map(toDTO), total };
};

export const getMaterial = async (db: Db, id: string): Promise<MaterialDTO | null> => {
  const row = await findMaterialById(db, id);
  return row ? toDTO(row) : null;
};

export const createMaterial = async (
  db: Db,
  input: CreateMaterialInput,
): Promise<MaterialDTO> => {
  try {
    const row = await insertMaterial(db, {
      sku: input.sku ?? null,
      upc: input.upc ?? null,
      name: input.name,
      description: input.description ?? null,
      unit: input.unit,
      tracking: input.tracking,
      minStock: input.minStock ?? null,
    });
    // Nothing can be in stock yet, so the total is a known zero — no read-back.
    return toDTO({ material: row, totalStock: '0' });
  } catch (err) {
    return translateDuplicate(err, { sku: input.sku, upc: input.upc });
  }
};

export const editMaterial = async (
  db: Db,
  id: string,
  input: UpdateMaterialInput,
): Promise<MaterialDTO | null> => {
  const current = await findMaterialById(db, id);
  if (!current) return null;

  const fields: UpdateMaterialFields = {};
  if (input.sku !== undefined) fields.sku = input.sku;
  if (input.upc !== undefined) fields.upc = input.upc;
  if (input.name !== undefined) fields.name = input.name;
  if (input.description !== undefined) fields.description = input.description;
  if (input.unit !== undefined) fields.unit = input.unit;
  if (input.minStock !== undefined) fields.minStock = input.minStock;

  // Re-stating the SAME mode is not a change and never blocks — only an actual
  // switch has to answer for the history behind it.
  if (input.tracking !== undefined && input.tracking !== current.material.tracking) {
    if (await materialHasMovements(db, id)) throw new TrackingImmutableError(id);
    fields.tracking = input.tracking;
  }

  // A PATCH that changes nothing is a no-op, not an error: drizzle refuses an
  // empty `.set({})`, and an editor that submits the whole form unchanged — or
  // re-states the one immutable field — would otherwise get a 500.
  if (Object.keys(fields).length === 0) return toDTO(current);

  try {
    const row = await updateMaterialRow(db, id, fields);
    if (!row) return null;
    return toDTO({ material: row, totalStock: current.totalStock });
  } catch (err) {
    return translateDuplicate(err, { sku: input.sku, upc: input.upc });
  }
};

export const removeMaterial = async (db: Db, id: string): Promise<{ id: string } | null> => {
  const current = await findMaterialById(db, id);
  if (!current) return null;
  if (await materialHasStock(db, id)) throw new MaterialHasStockError(id);

  const row = await softDeleteMaterial(db, id);
  return row ? { id: row.id } : null;
};

/** `GET /materials/:id/stock` (02 §3). All three keys are always present so the
 *  client renders from the material's tracking mode, not from which list
 *  happens to be non-empty. */
export const getMaterialStock = async (
  db: Db,
  id: string,
): Promise<MaterialStockDTO | null> => {
  const material = await findMaterialById(db, id);
  if (!material) return null;

  const [entries, units, lots] = await Promise.all([
    listMaterialEntries(db, id),
    listMaterialUnits(db, id),
    listMaterialLots(db, id),
  ]);

  return {
    entries: entries.map((row) => ({
      warehouse: row.warehouse,
      node: place(row.node),
      quantity: row.quantity,
    })),
    units: units.map((row) => ({
      id: row.id,
      serialNumber: row.serialNumber,
      status: row.status,
      warehouse: row.warehouse,
      node: place(row.node),
    })),
    lots: lots.map((row) => ({
      lotNumber: row.lotNumber,
      warehouse: row.warehouse,
      node: place(row.node),
      quantity: row.quantity,
      pieces: row.pieces,
      expiresAt: row.expiresAt?.toISOString(),
    })),
  };
};
