import type { Db } from '../../database/client';
import {
  findServiceById,
  insertService,
  listPublishedServices,
  listServices,
  softDeleteService,
  updateService,
} from '../repository/services.repository';
import type {
  CreateServiceInput,
  ListServicesQuery,
  UpdateServiceInput,
} from '../validators/services.validator';
import type {
  NewService,
  PublicServiceDTO,
  ServiceDTO,
  ServiceRow,
  UpdateServiceFields,
} from '../types/services.types';

const opt = <T>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);

/** `includeCost` is the caller's admin-tier flag — office/technician readers use
 *  the catalog as a picker and never see the internal cost. */
const toDTO = (row: ServiceRow, includeCost: boolean): ServiceDTO => ({
  id: row.id,
  name: row.name,
  price: row.price,
  cost: includeCost ? opt(row.cost) : undefined,
  uom: row.uom,
  description: opt(row.description),
  taxRate: row.taxRate,
  satProdServCode: opt(row.satProdServCode),
  satUnitCode: opt(row.satUnitCode),
  isListableInWebsite: row.isListableInWebsite,
  isPriceVisibleInWebsite: row.isPriceVisibleInWebsite,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  deletedAt: row.deletedAt ? row.deletedAt.toISOString() : undefined,
});

/** Website invariant (18 §3): price visibility is meaningless on an unlisted
 *  service, so unlisting always clears it. Keeping a stale `true` around would
 *  leak a price the moment the service is relisted. */
const normalizeWebsiteFlags = <T extends { isListableInWebsite?: boolean; isPriceVisibleInWebsite?: boolean }>(
  input: T,
  currentlyListable: boolean,
): T => {
  const listable = input.isListableInWebsite ?? currentlyListable;
  return listable ? input : { ...input, isPriceVisibleInWebsite: false };
};

const collectUpdate = (input: UpdateServiceInput): UpdateServiceFields => {
  const f: UpdateServiceFields = {};
  if (input.name !== undefined) f.name = input.name;
  if (input.price !== undefined) f.price = input.price;
  if (input.cost !== undefined) f.cost = input.cost ?? null;
  if (input.uom !== undefined) f.uom = input.uom;
  if (input.description !== undefined) f.description = input.description ?? null;
  if (input.taxRate !== undefined) f.taxRate = input.taxRate;
  if (input.satProdServCode !== undefined) f.satProdServCode = input.satProdServCode ?? null;
  if (input.satUnitCode !== undefined) f.satUnitCode = input.satUnitCode ?? null;
  if (input.isListableInWebsite !== undefined) f.isListableInWebsite = input.isListableInWebsite;
  if (input.isPriceVisibleInWebsite !== undefined) {
    f.isPriceVisibleInWebsite = input.isPriceVisibleInWebsite;
  }
  return f;
};

export const getServices = async (
  db: Db,
  q: ListServicesQuery,
  includeCost: boolean,
): Promise<{ services: ServiceDTO[] }> => {
  const rows = await listServices(db, { search: q.q });
  return { services: rows.map((row) => toDTO(row, includeCost)) };
};

/** Website listing (18 §4, CP-3). Unauthenticated: the price is dropped unless
 *  the service explicitly opts in — per-service, not a global switch. */
export const getPublishedServices = async (db: Db): Promise<{ services: PublicServiceDTO[] }> => {
  const rows = await listPublishedServices(db);
  return {
    services: rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: opt(row.description),
      uom: row.uom,
      price: row.isPriceVisibleInWebsite ? row.price : undefined,
    })),
  };
};

export const getServiceById = async (
  db: Db,
  id: string,
  includeCost: boolean,
): Promise<ServiceDTO | null> => {
  const row = await findServiceById(db, id);
  return row ? toDTO(row, includeCost) : null;
};

export const createService = async (
  db: Db,
  input: CreateServiceInput,
): Promise<ServiceDTO> => {
  const clean = normalizeWebsiteFlags(input, false);
  const values: NewService = {
    name: clean.name,
    price: clean.price,
    cost: clean.cost ?? null,
    uom: clean.uom,
    description: clean.description ?? null,
    taxRate: clean.taxRate,
    satProdServCode: clean.satProdServCode ?? null,
    satUnitCode: clean.satUnitCode ?? null,
    isListableInWebsite: clean.isListableInWebsite,
    isPriceVisibleInWebsite: clean.isPriceVisibleInWebsite,
  };
  // Writes are admin-tier only, so the creator always sees the cost back.
  return toDTO(await insertService(db, values), true);
};

export const editService = async (
  db: Db,
  id: string,
  input: UpdateServiceInput,
): Promise<ServiceDTO | null> => {
  const current = await findServiceById(db, id);
  if (!current) return null;
  const clean = normalizeWebsiteFlags(input, current.isListableInWebsite);
  const row = await updateService(db, id, collectUpdate(clean));
  return row ? toDTO(row, true) : null;
};

export const removeService = async (
  db: Db,
  id: string,
  deleteComment: string,
  actorId: string,
): Promise<{ id: string } | null> => softDeleteService(db, id, deleteComment, actorId);
