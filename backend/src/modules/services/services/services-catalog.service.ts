import type { Db } from '../../database/client';
import { isUniqueViolation } from '../../database/db-errors';
import { cdnUrl } from '../../storage/services/storage.service';
import { ServiceCodeInUseError } from '../http-errors/services.error';
import { ServiceCreatedVia, ServiceEventType } from '../enums/services.enum';
import {
  findServiceById,
  insertService,
  listPublishedServices,
  listServiceEvents,
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
  ServiceEventDTO,
  ServiceRow,
  UpdateServiceFields,
} from '../types/services.types';

const opt = <T>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);

/** Read-time materialization of the website photo (`manttio-images`): the row
 *  stores the R2 key, every response carries a URL. An absent key **and** an
 *  unconfigured `IMAGES_CDN_BASE_URL` both yield `undefined`, so no consumer —
 *  least of all the public page — can render `undefined/website/…`. */
const websiteImageUrl = (key: string | null, cdnBase: string | undefined): string | undefined =>
  key && cdnBase ? cdnUrl(cdnBase, key) : undefined;

/** The catalog-code unique index is the only unique constraint on this table,
 *  so a unique violation here can only be a duplicate code — translate it to
 *  the typed domain error the controller maps to 409. Anything else rethrows
 *  untouched. */
const asCodeConflict = async <T>(run: () => Promise<T>, code: string | undefined): Promise<T> => {
  try {
    return await run();
  } catch (err) {
    if (isUniqueViolation(err)) throw new ServiceCodeInUseError(code ?? '');
    throw err;
  }
};

/** `includeCost` is the caller's back-office-tier flag (18 §2): owner, admin and
 *  office all quote and invoice from the internal cost. Technicians read the
 *  catalog as a price list and never see it. */
const toDTO = (row: ServiceRow, includeCost: boolean, imagesCdnBase?: string): ServiceDTO => ({
  id: row.id,
  name: row.name,
  price: row.price,
  cost: includeCost ? opt(row.cost) : undefined,
  uom: row.uom,
  description: opt(row.description),
  websiteDescription: opt(row.websiteDescription),
  // The editor gets both: the key to send back on save, the URL to preview.
  websiteImageKey: opt(row.websiteImageKey),
  websiteImageUrl: websiteImageUrl(row.websiteImageKey, imagesCdnBase),
  internalServiceCode: opt(row.internalServiceCode),
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
  if (input.websiteDescription !== undefined) {
    f.websiteDescription = input.websiteDescription || null;
  }
  // Empty string clears the photo — the editor's "Quitar" sends '' rather than
  // a separate delete call. The R2 object is left in place: reverting a removal
  // is a re-save of the same key, and orphaned objects are cheaper than a
  // destructive cleanup path (no-hard-delete rule, in spirit).
  if (input.websiteImageKey !== undefined) {
    f.websiteImageKey = input.websiteImageKey || null;
  }
  // Empty string clears the code rather than storing '' — '' would collide
  // with the next empty one under the unique index.
  if (input.internalServiceCode !== undefined) {
    f.internalServiceCode = input.internalServiceCode || null;
  }
  if (input.taxRate !== undefined) f.taxRate = input.taxRate;
  if (input.satProdServCode !== undefined) f.satProdServCode = input.satProdServCode ?? null;
  if (input.satUnitCode !== undefined) f.satUnitCode = input.satUnitCode ?? null;
  if (input.isListableInWebsite !== undefined) f.isListableInWebsite = input.isListableInWebsite;
  if (input.isPriceVisibleInWebsite !== undefined) {
    f.isPriceVisibleInWebsite = input.isPriceVisibleInWebsite;
  }
  return f;
};

/** Per-field `{ old, new }` for the `service_updated` event (18 §6.1) —
 *  computed over the *collected* update, so an omitted field never registers
 *  and money compares as the fixed-2 strings both sides already are. Every
 *  edited column is recorded, not a curated list: price/cost/taxRate are the
 *  ones that matter, but the rest cost nothing and a list would go stale. */
const diffChanges = (
  current: ServiceRow,
  fields: UpdateServiceFields,
): Record<string, { old: unknown; new: unknown }> => {
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  for (const key of Object.keys(fields) as (keyof UpdateServiceFields)[]) {
    const prev = current[key];
    const next = fields[key];
    if (prev !== next) changes[key] = { old: prev, new: next };
  }
  return changes;
};

export const getServices = async (
  db: Db,
  q: ListServicesQuery,
  includeCost: boolean,
  imagesCdnBase?: string,
): Promise<{ services: ServiceDTO[] }> => {
  const rows = await listServices(db, { search: q.q });
  return { services: rows.map((row) => toDTO(row, includeCost, imagesCdnBase)) };
};

/** Website listing (18 §4, CP-3). Unauthenticated: the price is dropped unless
 *  the service explicitly opts in — per-service, not a global switch. */
export const getPublishedServices = async (
  db: Db,
  imagesCdnBase?: string,
): Promise<{ services: PublicServiceDTO[] }> => {
  const rows = await listPublishedServices(db);
  return {
    services: rows.map((row) => ({
      id: row.id,
      name: row.name,
      // The website copy only. No fallback to the internal `description` —
      // a listed service with no website copy renders title-only.
      description: opt(row.websiteDescription),
      // The URL, never the key: an unauthenticated consumer has no business
      // knowing bucket paths, and it has nothing to do with them anyway.
      imageUrl: websiteImageUrl(row.websiteImageKey, imagesCdnBase),
      uom: row.uom,
      price: row.isPriceVisibleInWebsite ? row.price : undefined,
    })),
  };
};

export const getServiceById = async (
  db: Db,
  id: string,
  includeCost: boolean,
  imagesCdnBase?: string,
): Promise<ServiceDTO | null> => {
  const row = await findServiceById(db, id);
  return row ? toDTO(row, includeCost, imagesCdnBase) : null;
};

export const createService = async (
  db: Db,
  input: CreateServiceInput,
  actorId: string,
  imagesCdnBase?: string,
): Promise<ServiceDTO> => {
  const clean = normalizeWebsiteFlags(input, false);
  const values: NewService = {
    name: clean.name,
    price: clean.price,
    cost: clean.cost ?? null,
    uom: clean.uom,
    description: clean.description ?? null,
    websiteDescription: clean.websiteDescription || null,
    websiteImageKey: clean.websiteImageKey || null,
    internalServiceCode: clean.internalServiceCode || null,
    taxRate: clean.taxRate,
    satProdServCode: clean.satProdServCode ?? null,
    satUnitCode: clean.satUnitCode ?? null,
    isListableInWebsite: clean.isListableInWebsite,
    isPriceVisibleInWebsite: clean.isPriceVisibleInWebsite,
  };
  // Writes are admin-tier only, so the creator always sees the cost back.
  // Provenance is derived, never claimed: a `sourceServiceId` riding along
  // makes this a clone (18 §6.2); import (CP-6) writes its own events through
  // its own endpoint.
  const row = await asCodeConflict(
    () =>
      insertService(db, values, {
        type: ServiceEventType.Created,
        actorId,
        changes: clean.sourceServiceId
          ? { via: ServiceCreatedVia.Clone, sourceServiceId: clean.sourceServiceId }
          : { via: ServiceCreatedVia.Form },
      }),
    clean.internalServiceCode,
  );
  return toDTO(row, true, imagesCdnBase);
};

export const editService = async (
  db: Db,
  id: string,
  input: UpdateServiceInput,
  actorId: string,
  imagesCdnBase?: string,
): Promise<ServiceDTO | null> => {
  const current = await findServiceById(db, id);
  if (!current) return null;
  const clean = normalizeWebsiteFlags(input, current.isListableInWebsite);
  const fields = collectUpdate(clean);
  // A no-op edit (every sent field equals the stored one) still runs the
  // UPDATE but writes no event — a trail row that says "nothing changed"
  // would be noise, not audit.
  const changes = diffChanges(current, fields);
  const events = Object.keys(changes).length
    ? [{ type: ServiceEventType.Updated, actorId, changes }]
    : [];
  const row = await asCodeConflict(
    () => updateService(db, id, fields, events),
    clean.internalServiceCode,
  );
  return row ? toDTO(row, true, imagesCdnBase) : null;
};

export const removeService = async (
  db: Db,
  id: string,
  deleteComment: string,
  actorId: string,
): Promise<{ id: string } | null> => softDeleteService(db, id, deleteComment, actorId);

/** The trail in insertion order (18 §6.1). Admin-tier only at the controller:
 *  `changes` carries cost old→new diffs and `note` carries delete comments —
 *  management audit, not commercial visibility. */
export const getServiceTimeline = async (db: Db, id: string): Promise<ServiceEventDTO[]> => {
  const rows = await listServiceEvents(db, id);
  return rows.map(({ event, actorName }) => ({
    id: event.id,
    type: event.type,
    actorId: event.actorId,
    actorName: opt(actorName),
    changes: opt(event.changes),
    note: opt(event.note),
    createdAt: event.createdAt.toISOString(),
  }));
};
