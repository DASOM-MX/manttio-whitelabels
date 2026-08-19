import { and, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import type { Db } from '../../database/client';
import { equipment, equipmentReports } from '../models/equipment.model';
import { customers } from '../../customers/models/customers.model';
import { reports } from '../../reports/models/reports.model';
import type { EquipmentStatus } from '../enums/equipment.enum';
import type {
  EquipmentReportLink,
  EquipmentRow,
  NewEquipment,
  UpdateEquipmentFields,
} from '../types/equipment.types';

// A query executor: the pooled `Db` or a transaction handle.
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Executor = Db | Tx;

const activeFilter = isNull(equipment.deletedAt);

// Latest service date across an equipment's linked, non-deleted reports — the
// "último servicio" column (11 §4). Cast to `date` so the driver yields a plain
// 'YYYY-MM-DD' string regardless of timezone.
const lastServiceExpr = sql<string | null>`(
  select cast(max(coalesce(r.date_arrival, r.finished_at, r.created_at)) as date)
  from equipment_reports er
  join reports r on r.id = er.report_id and r.deleted_at is null
  where er.equipment_id = ${equipment.id}
)`;

// A row of the equipment table plus its two derived projections.
export interface EquipmentMetaRow {
  row: EquipmentRow;
  customerName: string | null;
  lastServiceDate: string | null;
}

const metaColumns = {
  row: equipment,
  customerName: customers.name,
  lastServiceDate: lastServiceExpr,
};

export const listEquipment = async (
  db: Db,
  filters: { search?: string; customerId?: string; status?: EquipmentStatus },
  page: number,
  limit: number,
): Promise<{ items: EquipmentMetaRow[]; total: number }> => {
  const conds = [activeFilter];
  if (filters.customerId) conds.push(eq(equipment.customerId, filters.customerId));
  if (filters.status) conds.push(eq(equipment.status, filters.status));
  if (filters.search) {
    const q = `%${filters.search}%`;
    const match = or(
      ilike(equipment.name, q),
      ilike(equipment.brand, q),
      ilike(equipment.model, q),
      ilike(equipment.serialNumber, q),
    );
    if (match) conds.push(match);
  }
  const where = and(...conds);

  const items = await db
    .select(metaColumns)
    .from(equipment)
    .leftJoin(customers, eq(customers.id, equipment.customerId))
    .where(where)
    .orderBy(desc(equipment.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(equipment)
    .where(where);

  return { items, total: countRows[0]?.count ?? 0 };
};

/** Which of these equipment ids actually belong to the customer, ignoring
 *  soft-deleted units. Callers diff this against what was asked for so the
 *  error can name the offenders. Shared by every module that links units to a
 *  client-scoped record — visits (12 §1) and contracts (13 §1). */
export const equipmentIdsForCustomer = async (
  db: Db,
  customerId: string,
  ids: string[],
): Promise<string[]> => {
  if (!ids.length) return [];
  const rows = await db
    .select({ id: equipment.id })
    .from(equipment)
    .where(and(inArray(equipment.id, ids), eq(equipment.customerId, customerId), activeFilter));
  return rows.map((r) => r.id);
};

export const listEquipmentByCustomer = async (
  db: Db,
  customerId: string,
): Promise<EquipmentMetaRow[]> => {
  return db
    .select(metaColumns)
    .from(equipment)
    .leftJoin(customers, eq(customers.id, equipment.customerId))
    .where(and(activeFilter, eq(equipment.customerId, customerId)))
    .orderBy(desc(equipment.createdAt));
};

export const findEquipmentById = async (
  db: Executor,
  id: string,
): Promise<EquipmentRow | null> => {
  const [row] = await db
    .select()
    .from(equipment)
    .where(and(eq(equipment.id, id), activeFilter))
    .limit(1);
  return row ?? null;
};

export const findEquipmentWithMeta = async (
  db: Db,
  id: string,
): Promise<EquipmentMetaRow | null> => {
  const [row] = await db
    .select(metaColumns)
    .from(equipment)
    .leftJoin(customers, eq(customers.id, equipment.customerId))
    .where(and(eq(equipment.id, id), activeFilter))
    .limit(1);
  return row ?? null;
};

/** Derived service history (11 §2/§4): linked reports, newest first. */
export const reportsForEquipment = async (
  db: Db,
  equipmentId: string,
): Promise<EquipmentReportLink[]> => {
  const rows = await db
    .select({
      id: reports.id,
      status: reports.status,
      serviceDate: sql<string>`cast(coalesce(${reports.dateArrival}, ${reports.finishedAt}, ${reports.createdAt}) as date)`,
    })
    .from(equipmentReports)
    .innerJoin(reports, and(eq(reports.id, equipmentReports.reportId), isNull(reports.deletedAt)))
    .where(eq(equipmentReports.equipmentId, equipmentId))
    .orderBy(desc(reports.createdAt));
  return rows.map((r) => ({ id: r.id, folio: r.id, serviceDate: r.serviceDate, status: r.status }));
};

export const insertEquipment = async (db: Db, values: NewEquipment): Promise<EquipmentRow> => {
  const [row] = await db.insert(equipment).values(values).returning();
  if (!row) throw new Error('insertEquipment returned no row');
  return row;
};

export const updateEquipment = async (
  db: Db,
  id: string,
  fields: UpdateEquipmentFields,
): Promise<EquipmentRow | null> => {
  const [row] = await db
    .update(equipment)
    .set({ ...fields, updatedAt: new Date() })
    .where(and(eq(equipment.id, id), activeFilter))
    .returning();
  return row ?? null;
};

export const softDeleteEquipment = async (
  db: Db,
  id: string,
  deleteComment: string,
  deletedBy: string,
): Promise<{ id: string } | null> => {
  const now = new Date();
  const [row] = await db
    .update(equipment)
    .set({ deletedAt: now, updatedAt: now, deleteComment, deletedBy })
    .where(and(eq(equipment.id, id), activeFilter))
    .returning({ id: equipment.id });
  return row ?? null;
};

export const linkReport = async (db: Db, equipmentId: string, reportId: string): Promise<void> => {
  await db.insert(equipmentReports).values({ equipmentId, reportId }).onConflictDoNothing();
};

export const unlinkReport = async (
  db: Db,
  equipmentId: string,
  reportId: string,
): Promise<void> => {
  await db
    .delete(equipmentReports)
    .where(
      and(eq(equipmentReports.equipmentId, equipmentId), eq(equipmentReports.reportId, reportId)),
    );
};
