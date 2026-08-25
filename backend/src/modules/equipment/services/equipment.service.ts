import type { Db } from '../../database/client';
import {
  findEquipmentById,
  findEquipmentWithMeta,
  insertEquipment,
  linkReport,
  listEquipment,
  listEquipmentByCustomer,
  reportsForEquipment,
  softDeleteEquipment,
  unlinkReport,
  updateEquipment,
  type EquipmentMetaRow,
} from '../repository/equipment.repository';
import { findReportById } from '../../reports/repository/reports.repository';
import type {
  CreateEquipmentInput,
  ListEquipmentQuery,
  UpdateEquipmentInput,
} from '../validators/equipment.validator';
import type {
  EquipmentDTO,
  EquipmentReportLink,
  EquipmentRow,
  NewEquipment,
  UpdateEquipmentFields,
} from '../types/equipment.types';
import { ReportCustomerMismatchError } from '../http-errors/equipment.error';
import type { GenericQueryResponse } from '../../shared/types/generic-query-response.types';

const opt = <T>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);

const toDTO = (
  row: EquipmentRow,
  extras: {
    customerName?: string | null;
    lastServiceDate?: string | null;
    reports?: EquipmentReportLink[];
  } = {},
): EquipmentDTO => ({
  id: row.id,
  customerId: row.customerId,
  customerName: opt(extras.customerName),
  name: opt(row.name),
  brand: opt(row.brand),
  model: opt(row.model),
  serialNumber: opt(row.serialNumber),
  kind: opt(row.kind),
  capacity: opt(row.capacity),
  location: opt(row.location),
  installDate: opt(row.installDate),
  origin: row.origin,
  materialUnitId: opt(row.materialUnitId),
  status: row.status,
  notes: opt(row.notes),
  photos: row.photos ?? [],
  lastServiceDate: opt(extras.lastServiceDate),
  reports: extras.reports,
  createdAt: row.createdAt.toISOString(),
  deletedAt: row.deletedAt ? row.deletedAt.toISOString() : undefined,
});

const metaToDTO = (m: EquipmentMetaRow): EquipmentDTO =>
  toDTO(m.row, { customerName: m.customerName, lastServiceDate: m.lastServiceDate });

/** Full detail DTO (row + customer name + service history) — the write shape the
 *  frontend applies to `selected`, so it always carries the linked reports. */
const detailDTO = async (db: Db, id: string): Promise<EquipmentDTO | null> => {
  const meta = await findEquipmentWithMeta(db, id);
  if (!meta) return null;
  const linked = await reportsForEquipment(db, id);
  return toDTO(meta.row, {
    customerName: meta.customerName,
    lastServiceDate: meta.lastServiceDate,
    reports: linked,
  });
};

const collectUpdate = (input: UpdateEquipmentInput): UpdateEquipmentFields => {
  const f: UpdateEquipmentFields = {};
  if (input.name !== undefined) f.name = input.name ?? null;
  if (input.brand !== undefined) f.brand = input.brand ?? null;
  if (input.model !== undefined) f.model = input.model ?? null;
  if (input.serialNumber !== undefined) f.serialNumber = input.serialNumber ?? null;
  if (input.kind !== undefined) f.kind = input.kind ?? null;
  if (input.capacity !== undefined) f.capacity = input.capacity ?? null;
  if (input.location !== undefined) f.location = input.location ?? null;
  if (input.installDate !== undefined) f.installDate = input.installDate ?? null;
  if (input.origin !== undefined) f.origin = input.origin;
  if (input.notes !== undefined) f.notes = input.notes ?? null;
  if (input.photos !== undefined) f.photos = input.photos;
  if (input.status !== undefined) f.status = input.status;
  return f;
};

export const getEquipment = async (
  db: Db,
  q: ListEquipmentQuery,
): Promise<GenericQueryResponse<EquipmentDTO>> => {
  const page = await listEquipment(
    db,
    { search: q.search, customerId: q.customerId, status: q.status },
    q.page,
    q.limit,
  );
  return { ...page, items: page.items.map(metaToDTO) };
};

export const getCustomerEquipment = async (
  db: Db,
  customerId: string,
): Promise<EquipmentDTO[]> => {
  const rows = await listEquipmentByCustomer(db, customerId);
  return rows.map(metaToDTO);
};

export const getEquipmentById = async (db: Db, id: string): Promise<EquipmentDTO | null> =>
  detailDTO(db, id);

export const createEquipment = async (
  db: Db,
  input: CreateEquipmentInput,
): Promise<EquipmentDTO> => {
  const values: NewEquipment = {
    customerId: input.customerId,
    name: input.name ?? null,
    brand: input.brand ?? null,
    model: input.model ?? null,
    serialNumber: input.serialNumber ?? null,
    kind: input.kind ?? null,
    capacity: input.capacity ?? null,
    location: input.location ?? null,
    installDate: input.installDate ?? null,
    origin: input.origin,
    notes: input.notes ?? null,
    photos: input.photos ?? [],
  };
  const row = await insertEquipment(db, values);
  return (await detailDTO(db, row.id)) ?? toDTO(row);
};

export const editEquipment = async (
  db: Db,
  id: string,
  input: UpdateEquipmentInput,
): Promise<EquipmentDTO | null> => {
  const row = await updateEquipment(db, id, collectUpdate(input));
  if (!row) return null;
  return detailDTO(db, id);
};

export const removeEquipment = async (
  db: Db,
  id: string,
  deleteComment: string,
  actorId: string,
): Promise<{ id: string } | null> => softDeleteEquipment(db, id, deleteComment, actorId);

/** Retro-link a report (11 §2). The report must exist and belong to the same
 *  customer as the equipment; returns null when either the equipment or report
 *  is missing (→ 404), throws `ReportCustomerMismatchError` on a cross-customer
 *  attempt (→ 400). */
export const linkReportToEquipment = async (
  db: Db,
  id: string,
  reportId: string,
): Promise<EquipmentDTO | null> => {
  const unit = await findEquipmentById(db, id);
  if (!unit) return null;
  const report = await findReportById(db, reportId);
  if (!report) return null;
  if (report.clientId !== unit.customerId) throw new ReportCustomerMismatchError();
  await linkReport(db, id, reportId);
  return detailDTO(db, id);
};

export const unlinkReportFromEquipment = async (
  db: Db,
  id: string,
  reportId: string,
): Promise<EquipmentDTO | null> => {
  const unit = await findEquipmentById(db, id);
  if (!unit) return null;
  await unlinkReport(db, id, reportId);
  return detailDTO(db, id);
};
