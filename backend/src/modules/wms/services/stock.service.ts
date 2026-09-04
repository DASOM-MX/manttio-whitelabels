import type { AuthUser } from '../../../env';
import { isAdminTier } from '../../auth/utils/role-tier';
import type { Db, Tx } from '../../database/client';
import { isUniqueViolation, uniqueConstraintName } from '../../database/db-errors';
import { REASON_CODES, WRITE_OFF_REASON_CODES } from '../constants/reason-codes';
import { AssignmentRole } from '../enums/assignments.enum';
import { MaterialTracking, MaterialUnitStatus } from '../enums/materials.enum';
import { MovementType, ReadjustmentDirection, ReasonContext } from '../enums/movements.enum';
import { MaterialNotFoundError } from '../http-errors/materials.error';
import {
  InsufficientStockError,
  InvalidReasonContextError,
  NoAssignedWarehouseError,
  NotOwnVanError,
  NoteRequiredError,
  ReasonInactiveError,
  SameLocationError,
  SerialExistsError,
  SourceForbiddenError,
  TrackingMismatchError,
  UnitNotAvailableError,
  UseReplenishmentFlowError,
} from '../http-errors/stock.error';
import {
  NodeWarehouseMismatchError,
  StorageNodeNotFoundError,
  WarehouseNotFoundError,
} from '../http-errors/warehouses.error';
import { findMaterialById } from '../repository/materials.repository';
import { findMovementReasonByCode } from '../repository/movement-reasons.repository';
import {
  findMovementById,
  findMovementIdByIdempotencyKey,
  insertMovement,
  insertMovementUnits,
  listMovementsPaged,
  listUnitsForMovements,
  type JoinedMovementRow,
} from '../repository/movements.repository';
import {
  addLot,
  addStockEntry,
  findExistingSerials,
  findLotExpiry,
  insertMaterialUnits,
  lockLot,
  lockStockEntry,
  lockUnits,
  setUnitsState,
  subtractLot,
  subtractStockEntry,
} from '../repository/stock-balances.repository';
import { findStorageNodeById } from '../repository/storage-nodes.repository';
import { findLiveTechnicianVan, findWarehouseById } from '../repository/warehouses.repository';
import type { MaterialRow } from '../types/materials.types';
import type { StockLocationRefDTO } from '../types/warehouses.types';
import type {
  MovementDTO,
  MovementFilters,
  MovementPlaceDTO,
  MovementUnitRefDTO,
  NewMovement,
  StockLocation,
} from '../types/stock.types';
import type {
  InboundInput,
  ListMovementsQuery,
  ReadjustInput,
  TransferInput,
} from '../validators/stock.validator';

// The three stock operations + the journal read (10-wms/02 §4). Every write
// runs the 01 §3 transaction: validate, insert the movement, apply the delta —
// journal and balance commit together or not at all.

// ── shared validation ──────────────────────────────────────────────────────

const loadMaterial = async (db: Db, materialId: string): Promise<MaterialRow> => {
  const row = await findMaterialById(db, materialId);
  if (!row) throw new MaterialNotFoundError(materialId);
  return row.material;
};

/** Proves the location exists and that the node really belongs to the
 *  warehouse the caller named (`400 node_warehouse_mismatch`) — otherwise a
 *  typo would post stock into a shelf of a different building. */
const resolveLocation = async (
  db: Db,
  input: { warehouseId: string; storageNodeId?: string },
): Promise<StockLocation> => {
  const warehouse = await findWarehouseById(db, input.warehouseId);
  if (!warehouse) throw new WarehouseNotFoundError(input.warehouseId);
  if (input.storageNodeId === undefined) {
    return { warehouseId: input.warehouseId, storageNodeId: null };
  }
  const node = await findStorageNodeById(db, input.storageNodeId);
  if (!node) throw new StorageNodeNotFoundError(input.storageNodeId);
  if (node.node.warehouseId !== input.warehouseId) {
    throw new NodeWarehouseMismatchError(input.storageNodeId, input.warehouseId);
  }
  return { warehouseId: input.warehouseId, storageNodeId: input.storageNodeId };
};

/** An unknown code and a code that does not cover this context are the same
 *  answer on purpose: a reason that applies to nothing is exactly a reason that
 *  does not apply here, and telling the two apart would let a client enumerate
 *  the tenant's reason table through a stock endpoint. */
const resolveReason = async (
  db: Db,
  code: string,
  context: ReasonContext,
  notes: string | undefined,
) => {
  const def = await findMovementReasonByCode(db, code);
  if (!def) throw new InvalidReasonContextError(code, context);
  if (!def.active) throw new ReasonInactiveError(code);
  if (!def.appliesTo.includes(context)) throw new InvalidReasonContextError(code, context);
  // 00 §6 #23. No reason reaches this today: the two seeded `requiresNote`
  // codes are readjust-out only, and `readjust` already requires notes at the
  // validator. It is the shared enforcement point CONSUMPTION will use (§7),
  // where notes are optional and `report_binding` can carry the flag — so the
  // rule lives with the other reason checks rather than being re-derived there.
  if (def.requiresNote && !notes) throw new NoteRequiredError(code);
  return def;
};

// ── payload ↔ tracking ─────────────────────────────────────────────────────

type ResolvedPayload =
  | { kind: 'quantity'; quantity: string }
  | {
      kind: 'lot';
      lotNumber: string;
      quantity: string;
      pieces: number;
      expiresAt: Date | null;
    }
  | { kind: 'serials'; serials: string[] }
  | { kind: 'units'; materialUnitIds: string[] };

const EXPECTED_PAYLOAD: Record<MaterialTracking, string> = {
  [MaterialTracking.Unserialized]: 'cantidad',
  [MaterialTracking.Lot]: 'lote y cantidad',
  [MaterialTracking.Serialized]: 'series o unidades',
};

const mismatch = (material: MaterialRow) =>
  new TrackingMismatchError(material.tracking, EXPECTED_PAYLOAD[material.tracking]);

/** The validator can only prove that ONE payload shape was sent; which shape is
 *  legal depends on the material's tracking mode, which is a DB read away. This
 *  is where the two meet (`400 tracking_mismatch`). */
const resolvePayload = (
  material: MaterialRow,
  input: {
    quantity?: string;
    serials?: string[];
    materialUnitIds?: string[];
    lotNumber?: string;
    pieces?: number;
    expiresAt?: Date;
  },
): ResolvedPayload => {
  if (input.lotNumber !== undefined && input.quantity !== undefined) {
    if (material.tracking !== MaterialTracking.Lot) throw mismatch(material);
    return {
      kind: 'lot',
      lotNumber: input.lotNumber,
      quantity: input.quantity,
      pieces: input.pieces ?? 0,
      expiresAt: input.expiresAt ?? null,
    };
  }
  if (input.serials !== undefined) {
    if (material.tracking !== MaterialTracking.Serialized) throw mismatch(material);
    return { kind: 'serials', serials: input.serials };
  }
  if (input.materialUnitIds !== undefined) {
    if (material.tracking !== MaterialTracking.Serialized) throw mismatch(material);
    return { kind: 'units', materialUnitIds: input.materialUnitIds };
  }
  if (input.quantity !== undefined) {
    if (material.tracking !== MaterialTracking.Unserialized) throw mismatch(material);
    return { kind: 'quantity', quantity: input.quantity };
  }
  throw mismatch(material);
};

// ── DTO assembly ───────────────────────────────────────────────────────────

/** A left-joined location comes back as a null OBJECT, not null fields — so an
 *  inbound's absent source is one check, not three. */
const place = (
  warehouse: { id: string; name: string } | null,
  node: StockLocationRefDTO | null,
): MovementPlaceDTO | undefined =>
  warehouse ? { warehouse, node: node ?? undefined } : undefined;

const toMovementDTO = (row: JoinedMovementRow, units: MovementUnitRefDTO[]): MovementDTO => ({
  id: row.id,
  type: row.type,
  direction: row.direction ?? undefined,
  reason: { code: row.reasonCode, label: row.reasonLabel },
  material: {
    id: row.material.id,
    name: row.material.name,
    sku: row.material.sku ?? undefined,
    unit: row.material.unit,
    tracking: row.material.tracking,
  },
  quantity: row.quantity ?? undefined,
  pieces: row.pieces ?? undefined,
  lotNumber: row.lotNumber ?? undefined,
  units,
  from: place(row.fromWarehouse, row.fromNode),
  to: place(row.toWarehouse, row.toNode),
  reportId: row.reportId ?? undefined,
  replenishmentId: row.replenishmentId ?? undefined,
  countSessionId: row.countSessionId ?? undefined,
  user: row.user,
  notes: row.notes ?? undefined,
  createdAt: row.createdAt.toISOString(),
});

const readMovement = async (db: Db, id: string): Promise<MovementDTO> => {
  const row = await findMovementById(db, id);
  if (!row) throw new Error(`movement ${id} vanished after insert`);
  const units = await listUnitsForMovements(db, [id]);
  return toMovementDTO(
    row,
    units.map((u) => ({ id: u.id, serialNumber: u.serialNumber })),
  );
};

// ── the operation envelope ─────────────────────────────────────────────────

/** 00 §6 #21: with an `Idempotency-Key` a replay returns the ORIGINAL movement
 *  instead of booking a second one. Checked before the transaction for the
 *  ordinary retry, and again in the catch for the case where two copies of the
 *  same request raced and the partial unique index picked a winner. */
const runOperation = async (
  db: Db,
  ctx: { idempotencyKey?: string; materialId: string; serials?: string[] },
  op: (tx: Tx) => Promise<string>,
): Promise<MovementDTO> => {
  const replay = async () => {
    if (!ctx.idempotencyKey) return null;
    const id = await findMovementIdByIdempotencyKey(db, ctx.idempotencyKey);
    return id ? readMovement(db, id) : null;
  };

  const existing = await replay();
  if (existing) return existing;

  try {
    return await readMovement(db, await db.transaction(op));
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const constraint = uniqueConstraintName(err);
    if (constraint === 'movements_idempotency_key_uidx') {
      const raced = await replay();
      if (raced) return raced;
    }
    // The serial pre-check inside the transaction catches every sequential
    // case; this is the two-simultaneous-receipts race, where the index is the
    // only arbiter left.
    if (constraint === 'material_units_serial_uidx' && ctx.serials) {
      const taken = await findExistingSerials(db, ctx.materialId, ctx.serials);
      throw new SerialExistsError(taken[0] ?? ctx.serials[0] ?? '');
    }
    throw err;
  }
};

const sameLocation = (a: StockLocation, b: StockLocation) =>
  a.warehouseId === b.warehouseId && a.storageNodeId === b.storageNodeId;

// ── balance movers, shared by the three operations ─────────────────────────

const takeQuantity = async (
  tx: Tx,
  materialId: string,
  at: StockLocation,
  quantity: string,
) => {
  const row = await lockStockEntry(tx, materialId, at);
  if (!row || Number(row.quantity) < Number(quantity)) {
    throw new InsufficientStockError(
      `hay ${row ? Number(row.quantity) : 0} y se intentan mover ${quantity}`,
    );
  }
  await subtractStockEntry(tx, row.id, quantity);
};

const takeLot = async (
  tx: Tx,
  materialId: string,
  lotNumber: string,
  at: StockLocation,
  quantity: string,
  pieces: number,
) => {
  const row = await lockLot(tx, materialId, lotNumber, at);
  if (!row || Number(row.quantity) < Number(quantity)) {
    throw new InsufficientStockError(
      `el lote ${lotNumber} tiene ${row ? Number(row.quantity) : 0} y se intentan mover ${quantity}`,
    );
  }
  // Packages are their own dimension: 200 nails may leave an open bag without
  // any bag leaving, but 3 bags cannot leave a location that holds 2.
  if (row.pieces < pieces) {
    throw new InsufficientStockError(
      `el lote ${lotNumber} tiene ${row.pieces} paquetes y se intentan mover ${pieces}`,
    );
  }
  await subtractLot(tx, row.id, quantity, pieces);
  return row;
};

/** Locks the named units and proves every one of them is `in_stock` at the
 *  source. A unit that is missing, belongs to another material, sits somewhere
 *  else or is already consumed all fail the same way — from the caller's side
 *  they are one fact: that piece is not there to move. */
const takeUnits = async (
  tx: Tx,
  materialId: string,
  at: StockLocation,
  unitIds: string[],
) => {
  const rows = await lockUnits(tx, materialId, unitIds);
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const id of unitIds) {
    const row = byId.get(id);
    if (
      !row ||
      row.status !== MaterialUnitStatus.InStock ||
      row.warehouseId !== at.warehouseId ||
      row.storageNodeId !== at.storageNodeId
    ) {
      throw new UnitNotAvailableError(id);
    }
  }
  return rows;
};

const createUnits = async (
  tx: Tx,
  materialId: string,
  at: StockLocation,
  serials: string[],
) => {
  const taken = await findExistingSerials(tx, materialId, serials);
  if (taken.length > 0) throw new SerialExistsError(taken[0] ?? '');
  return insertMaterialUnits(tx, materialId, at, serials);
};

/** Destination-side lot write. The expiry stored for this `(material, lot)`
 *  always wins over one sent in the body (01 §3): first receipt sets the date,
 *  every later touch of the same lot inherits it, so a lot split across three
 *  locations never disagrees with itself about when it expires. */
const putLot = async (
  tx: Tx,
  materialId: string,
  lotNumber: string,
  at: StockLocation,
  quantity: string,
  pieces: number,
  supplied: Date | null,
) => {
  const stored = await findLotExpiry(tx, materialId, lotNumber);
  await addLot(tx, {
    materialId,
    lotNumber,
    at,
    quantity,
    pieces,
    expiresAt: stored ?? supplied,
  });
};

// ── POST /stock/inbound ────────────────────────────────────────────────────

export const inbound = async (
  db: Db,
  user: AuthUser,
  input: InboundInput,
  idempotencyKey?: string,
): Promise<MovementDTO> => {
  const material = await loadMaterial(db, input.materialId);
  const to = await resolveLocation(db, input.to);
  const reason = await resolveReason(db, input.reason, ReasonContext.Inbound, input.notes);
  // Ad-hoc `replenishment` is admin-selectable (owner 2026-07-20); for office
  // a restock stays a document with an approval step behind it.
  if (reason.code === REASON_CODES.replenishment && !isAdminTier(user)) {
    throw new UseReplenishmentFlowError();
  }
  const payload = resolvePayload(material, input);

  return runOperation(
    db,
    {
      idempotencyKey,
      materialId: material.id,
      serials: payload.kind === 'serials' ? payload.serials : undefined,
    },
    async (tx) => {
      const base: NewMovement = {
        type: MovementType.Inbound,
        reason: reason.code,
        materialId: material.id,
        toWarehouseId: to.warehouseId,
        toNodeId: to.storageNodeId,
        userId: user.id,
        notes: input.notes ?? null,
        idempotencyKey: idempotencyKey ?? null,
      };

      if (payload.kind === 'quantity') {
        await addStockEntry(tx, material.id, to, payload.quantity);
        return (await insertMovement(tx, { ...base, quantity: payload.quantity })).id;
      }
      if (payload.kind === 'lot') {
        await putLot(
          tx,
          material.id,
          payload.lotNumber,
          to,
          payload.quantity,
          payload.pieces,
          payload.expiresAt,
        );
        return (
          await insertMovement(tx, {
            ...base,
            quantity: payload.quantity,
            lotNumber: payload.lotNumber,
            pieces: payload.pieces,
          })
        ).id;
      }
      if (payload.kind === 'serials') {
        const units = await createUnits(tx, material.id, to, payload.serials);
        const movement = await insertMovement(tx, base);
        await insertMovementUnits(
          tx,
          movement.id,
          units.map((u) => u.id),
        );
        return movement.id;
      }
      // Unreachable through the validator — inbound has no `materialUnitIds`
      // field, because a receipt creates the pieces it books.
      throw mismatch(material);
    },
  );
};

// ── POST /stock/transfer ───────────────────────────────────────────────────

/** Self-checkout, server-enforced (02 §4). A technician's transfer is not a
 *  general transfer with a narrower gate: it is one specific act — loading
 *  their own van — and all three constraints exist because the client cannot
 *  be the one holding them. */
const assertSelfCheckout = async (
  db: Db,
  user: AuthUser,
  from: StockLocation,
  to: StockLocation,
  reasonCode: string,
) => {
  const van = await findLiveTechnicianVan(db, user.id);
  if (!van) throw new NoAssignedWarehouseError();
  if (to.warehouseId !== van.id) throw new NotOwnVanError(to.warehouseId);

  const source = await findWarehouseById(db, from.warehouseId);
  const sourceRow = source?.warehouse;
  if (
    sourceRow &&
    sourceRow.assignmentRole === AssignmentRole.Technician &&
    sourceRow.assignedUserId !== null &&
    sourceRow.assignedUserId !== user.id
  ) {
    throw new SourceForbiddenError(from.warehouseId);
  }
  if (reasonCode !== REASON_CODES.relocation) {
    throw new InvalidReasonContextError(reasonCode, ReasonContext.Transfer);
  }
};

export const transfer = async (
  db: Db,
  user: AuthUser,
  input: TransferInput,
  idempotencyKey?: string,
): Promise<MovementDTO> => {
  const material = await loadMaterial(db, input.materialId);
  const from = await resolveLocation(db, input.from);
  const to = await resolveLocation(db, input.to);
  const reason = await resolveReason(db, input.reason, ReasonContext.Transfer, input.notes);
  // Scope before shape: a technician is told what they may do before they are
  // told what they got wrong, so a malformed body never doubles as a probe of
  // which warehouses exist.
  if (user.role === 'technician') {
    await assertSelfCheckout(db, user, from, to, reason.code);
  }
  if (sameLocation(from, to)) throw new SameLocationError();
  const payload = resolvePayload(material, input);

  return runOperation(db, { idempotencyKey, materialId: material.id }, async (tx) => {
    const base: NewMovement = {
      type: MovementType.Transfer,
      reason: reason.code,
      materialId: material.id,
      fromWarehouseId: from.warehouseId,
      fromNodeId: from.storageNodeId,
      toWarehouseId: to.warehouseId,
      toNodeId: to.storageNodeId,
      userId: user.id,
      notes: input.notes ?? null,
      idempotencyKey: idempotencyKey ?? null,
    };

    if (payload.kind === 'quantity') {
      await takeQuantity(tx, material.id, from, payload.quantity);
      await addStockEntry(tx, material.id, to, payload.quantity);
      return (await insertMovement(tx, { ...base, quantity: payload.quantity })).id;
    }
    if (payload.kind === 'lot') {
      const source = await takeLot(
        tx,
        material.id,
        payload.lotNumber,
        from,
        payload.quantity,
        payload.pieces,
      );
      // The destination row inherits the SOURCE row's expiry, not the body's:
      // a split lot is still one lot.
      await addLot(tx, {
        materialId: material.id,
        lotNumber: payload.lotNumber,
        at: to,
        quantity: payload.quantity,
        pieces: payload.pieces,
        expiresAt: source.expiresAt,
      });
      return (
        await insertMovement(tx, {
          ...base,
          quantity: payload.quantity,
          lotNumber: payload.lotNumber,
          pieces: payload.pieces,
        })
      ).id;
    }
    if (payload.kind === 'units') {
      await takeUnits(tx, material.id, from, payload.materialUnitIds);
      await setUnitsState(tx, payload.materialUnitIds, to, MaterialUnitStatus.InStock);
      const movement = await insertMovement(tx, base);
      await insertMovementUnits(tx, movement.id, payload.materialUnitIds);
      return movement.id;
    }
    // Unreachable through the validator: a transfer moves pieces that already
    // exist, so it names them by id and never by serial.
    throw mismatch(material);
  });
};

// ── POST /stock/readjust ───────────────────────────────────────────────────

/** Restores units to stock. The unit must currently be OUT of stock — restoring
 *  something already on hand would journal an increase that never happened, and
 *  moving a live piece is what `transfer` is for. */
const restoreUnits = async (
  tx: Tx,
  materialId: string,
  at: StockLocation,
  unitIds: string[],
) => {
  const rows = await lockUnits(tx, materialId, unitIds);
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const id of unitIds) {
    const row = byId.get(id);
    if (!row || row.status === MaterialUnitStatus.InStock) throw new UnitNotAvailableError(id);
  }
  await setUnitsState(tx, unitIds, at, MaterialUnitStatus.InStock);
};

export const readjust = async (
  db: Db,
  user: AuthUser,
  input: ReadjustInput,
  idempotencyKey?: string,
): Promise<MovementDTO> => {
  const material = await loadMaterial(db, input.materialId);
  const at = await resolveLocation(db, input.at);
  const goingIn = input.direction === ReadjustmentDirection.In;
  const reason = await resolveReason(
    db,
    input.reason,
    goingIn ? ReasonContext.ReadjustmentIn : ReasonContext.ReadjustmentOut,
    input.notes,
  );
  const payload = resolvePayload(material, input);

  return runOperation(
    db,
    {
      idempotencyKey,
      materialId: material.id,
      serials: payload.kind === 'serials' ? payload.serials : undefined,
    },
    async (tx) => {
      const base: NewMovement = {
        type: MovementType.Readjustment,
        direction: input.direction,
        reason: reason.code,
        materialId: material.id,
        // A readjustment touches ONE location, on whichever side its direction
        // puts it — that is what makes the signed journal sum reconcile.
        fromWarehouseId: goingIn ? null : at.warehouseId,
        fromNodeId: goingIn ? null : at.storageNodeId,
        toWarehouseId: goingIn ? at.warehouseId : null,
        toNodeId: goingIn ? at.storageNodeId : null,
        userId: user.id,
        notes: input.notes,
        idempotencyKey: idempotencyKey ?? null,
      };

      if (payload.kind === 'quantity') {
        if (goingIn) await addStockEntry(tx, material.id, at, payload.quantity);
        else await takeQuantity(tx, material.id, at, payload.quantity);
        return (await insertMovement(tx, { ...base, quantity: payload.quantity })).id;
      }
      if (payload.kind === 'lot') {
        if (goingIn) {
          await putLot(
            tx,
            material.id,
            payload.lotNumber,
            at,
            payload.quantity,
            payload.pieces,
            payload.expiresAt,
          );
        } else {
          await takeLot(
            tx,
            material.id,
            payload.lotNumber,
            at,
            payload.quantity,
            payload.pieces,
          );
        }
        return (
          await insertMovement(tx, {
            ...base,
            quantity: payload.quantity,
            lotNumber: payload.lotNumber,
            pieces: payload.pieces,
          })
        ).id;
      }
      if (payload.kind === 'serials') {
        // In-direction only (validator): pieces that exist physically but were
        // never received.
        const units = await createUnits(tx, material.id, at, payload.serials);
        const movement = await insertMovement(tx, base);
        await insertMovementUnits(
          tx,
          movement.id,
          units.map((u) => u.id),
        );
        return movement.id;
      }

      if (goingIn) {
        await restoreUnits(tx, material.id, at, payload.materialUnitIds);
      } else {
        await takeUnits(tx, material.id, at, payload.materialUnitIds);
        // A write-off means the piece is GONE; every other out-reason means it
        // left on purpose. Both leave stock, and the last location stays put
        // either way (01 §4) — only the status tells the two stories apart.
        const status = WRITE_OFF_REASON_CODES.includes(reason.code)
          ? MaterialUnitStatus.Lost
          : MaterialUnitStatus.Consumed;
        await setUnitsState(tx, payload.materialUnitIds, at, status);
      }
      const movement = await insertMovement(tx, base);
      await insertMovementUnits(tx, movement.id, payload.materialUnitIds);
      return movement.id;
    },
  );
};

// ── GET /movements ─────────────────────────────────────────────────────────

export const getMovements = async (
  db: Db,
  user: AuthUser,
  query: ListMovementsQuery,
): Promise<{ items: MovementDTO[]; total: number }> => {
  const filters: MovementFilters = {
    materialId: query.materialId,
    warehouseId: query.warehouseId,
    nodeId: query.nodeId,
    reportId: query.reportId,
    replenishmentId: query.replenishmentId,
    lotNumber: query.lotNumber,
    type: query.type,
    reason: query.reason,
    from: query.from,
    to: query.to,
  };

  // Technician scope is applied HERE, not by the client (02 §4): their own van
  // and their own reports. A technician with no van still sees their report
  // consumption — that history is theirs regardless of where it came from.
  if (user.role === 'technician') {
    const van = await findLiveTechnicianVan(db, user.id);
    filters.technicianScope = { userId: user.id, warehouseId: van?.id ?? null };
  }

  const { rows, total } = await listMovementsPaged(db, filters, query.page, query.limit);
  const units = await listUnitsForMovements(
    db,
    rows.map((row) => row.id),
  );

  const byMovement = new Map<string, MovementUnitRefDTO[]>();
  for (const unit of units) {
    const list = byMovement.get(unit.movementId) ?? [];
    list.push({ id: unit.id, serialNumber: unit.serialNumber });
    byMovement.set(unit.movementId, list);
  }

  return {
    items: rows.map((row) => toMovementDTO(row, byMovement.get(row.id) ?? [])),
    total,
  };
};
