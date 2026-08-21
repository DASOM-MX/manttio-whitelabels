import { describe, expect, test } from 'vitest';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import migrationSql from '../drizzle/migrations/0040_wms_data_model.sql?raw';
import { MOVEMENT_REASON_SEEDS } from '../src/modules/wms/constants/movement-reason-seeds';
import { STORAGE_NODE_RANK } from '../src/modules/wms/constants/storage-node-rank';
import { ReasonContext } from '../src/modules/wms/enums/movements.enum';
import { StorageNodeType } from '../src/modules/wms/enums/storage-nodes.enum';
import { materialLots } from '../src/modules/wms/models/material-lots.model';
import { movementReasonDefs } from '../src/modules/wms/models/movement-reason-defs.model';
import { movements } from '../src/modules/wms/models/movements.model';
import { storageNodes } from '../src/modules/wms/models/storage-nodes.model';
import { warehouses } from '../src/modules/wms/models/warehouses.model';

// WMS 01 CP-1 is SCHEMA ONLY — no controllers, no services, no endpoints to
// call. So this suite is pure: no DB connection, no `request()`, no fixtures to
// clean up. It pins the decisions `10-wms/01-data-model.md` records (the rank
// map, the 14 seeded reasons, the 2026-08-08 build deltas) so a later
// checkpoint can't drift from them without a failing test. Endpoint behaviour
// belongs in `wms.test.ts` once CP-2 exists.

const columnNames = (table: PgTable) => getTableConfig(table).columns.map((c) => c.name);
const indexNames = (table: PgTable) => getTableConfig(table).indexes.map((i) => i.config.name);
const checkNames = (table: PgTable) => getTableConfig(table).checks.map((c) => c.name);

const column = (table: PgTable, name: string) =>
  getTableConfig(table).columns.find((c) => c.name === name);

describe('WMS storage-node hierarchy (01 §1/§2)', () => {
  // The rule 01 §2 states, mirrored here because the validator that will read
  // this map lands with the storage-node service in CP-2. Violations answer
  // `400 invalid_parent_type`.
  const canParent = (parent: StorageNodeType, child: StorageNodeType) =>
    STORAGE_NODE_RANK[parent] < STORAGE_NODE_RANK[child];

  const types = Object.values(StorageNodeType);

  test('every node type has a rank, and the map holds nothing else', () => {
    expect(Object.keys(STORAGE_NODE_RANK).sort()).toEqual([...types].sort());
  });

  test('ranks are unique and zero-based contiguous', () => {
    const ranks = types.map((t) => STORAGE_NODE_RANK[t]).sort((a, b) => a - b);
    expect(ranks).toEqual(types.map((_, i) => i));
  });

  test('warehouse is the topmost type (owner 2026-08-18)', () => {
    expect(STORAGE_NODE_RANK[StorageNodeType.Warehouse]).toBe(0);
    expect(Math.min(...types.map((t) => STORAGE_NODE_RANK[t]))).toBe(
      STORAGE_NODE_RANK[StorageNodeType.Warehouse],
    );
  });

  test('warehouse can only ever be a root — nothing outranks it', () => {
    for (const t of types) {
      expect(canParent(t, StorageNodeType.Warehouse)).toBe(false);
    }
  });

  test('the four original levels keep their relative order beneath it', () => {
    expect(types.map((t) => STORAGE_NODE_RANK[t])).toEqual([0, 1, 2, 3, 4]);
    expect(canParent(StorageNodeType.StorageUnit, StorageNodeType.Rack)).toBe(true);
    expect(canParent(StorageNodeType.Rack, StorageNodeType.Section)).toBe(true);
    expect(canParent(StorageNodeType.Section, StorageNodeType.StorageBox)).toBe(true);
  });

  test('levels are skippable, but never flat or inverted', () => {
    // A box directly inside a storage unit is legal (01 §2).
    expect(canParent(StorageNodeType.StorageUnit, StorageNodeType.StorageBox)).toBe(true);
    expect(canParent(StorageNodeType.Warehouse, StorageNodeType.StorageBox)).toBe(true);
    // Same type nested in itself, and any climb back up, are rejected.
    expect(canParent(StorageNodeType.Rack, StorageNodeType.Rack)).toBe(false);
    expect(canParent(StorageNodeType.Section, StorageNodeType.Rack)).toBe(false);
    expect(canParent(StorageNodeType.StorageBox, StorageNodeType.StorageUnit)).toBe(false);
  });

  test('enum values are the snake_case literals the text column stores', () => {
    expect(types).toEqual([
      'warehouse',
      'storage_unit',
      'rack',
      'section',
      'storage_box',
    ]);
  });
});

describe('WMS built-in movement reasons (01 §5)', () => {
  const byCode = new Map(MOVEMENT_REASON_SEEDS.map((s) => [s.code, s]));

  test('seeds exactly the 14 built-in reasons, codes unique', () => {
    expect(MOVEMENT_REASON_SEEDS).toHaveLength(14);
    expect(byCode.size).toBe(14);
  });

  test('every reason carries a label and at least one valid context', () => {
    const contexts = Object.values(ReasonContext);
    for (const seed of MOVEMENT_REASON_SEEDS) {
      expect(seed.label.trim()).not.toBe('');
      expect(seed.appliesTo.length).toBeGreaterThan(0);
      for (const ctx of seed.appliesTo) {
        expect(contexts).toContain(ctx);
      }
    }
  });

  test('requires_note is set for exactly the two write-off reasons (00 §6 #23)', () => {
    const forced = MOVEMENT_REASON_SEEDS.filter((s) => s.requiresNote).map((s) => s.code);
    expect(forced.sort()).toEqual(['lot_expired', 'scrap']);
  });

  test('consumption is report_binding only (00 §6 #5)', () => {
    const consumption = MOVEMENT_REASON_SEEDS.filter((s) =>
      s.appliesTo.includes(ReasonContext.Consumption),
    ).map((s) => s.code);
    expect(consumption).toEqual(['report_binding']);
  });

  test('replenishment is inbound-only, stock_count covers both directions', () => {
    expect(byCode.get('replenishment')?.appliesTo).toEqual([ReasonContext.Inbound]);
    expect(byCode.get('stock_count')?.appliesTo.sort()).toEqual([
      ReasonContext.ReadjustmentIn,
      ReasonContext.ReadjustmentOut,
    ]);
  });

  test('the migration INSERT matches the TS mirror row for row', () => {
    // `('code', 'label', built_in, ARRAY['ctx', …], requires_note, active)`
    const rowPattern =
      /\('([a-z_]+)', '([^']*)', (true|false), ARRAY\[([^\]]*)\], (true|false), (true|false)\)/g;
    const seeded = [...migrationSql.matchAll(rowPattern)].map((m) => ({
      code: m[1],
      label: m[2],
      builtIn: m[3] === 'true',
      appliesTo: (m[4] ?? '').split(',').map((c) => c.trim().replace(/'/g, '')),
      requiresNote: m[5] === 'true',
      active: m[6] === 'true',
    }));

    expect(seeded).toHaveLength(MOVEMENT_REASON_SEEDS.length);
    expect(seeded.map(({ code, label, appliesTo, requiresNote }) => ({
      code,
      label,
      appliesTo,
      requiresNote,
    }))).toEqual(
      MOVEMENT_REASON_SEEDS.map(({ code, label, appliesTo, requiresNote }) => ({
        code,
        label,
        appliesTo: [...appliesTo] as string[],
        requiresNote,
      })),
    );
    // Built-ins are fully locked: no label edits, no deactivation.
    expect(seeded.every((s) => s.builtIn && s.active)).toBe(true);
    // Idempotent seeding — a re-run of the migration must not duplicate.
    expect(migrationSql).toContain('ON CONFLICT ("code") DO NOTHING');
  });
});

describe('WMS schema shape — the 2026-08-08 build deltas (01 header)', () => {
  test('warehouses hold an assigned USER, and may hold several', () => {
    expect(columnNames(warehouses)).toContain('assigned_user_id');
    expect(columnNames(warehouses)).not.toContain('assigned_technician_id');
    // Deliberately a plain lookup index: the one-van-per-technician rule is
    // role-aware, so the assignment service owns it, not the schema.
    const assigned = getTableConfig(warehouses).indexes.find(
      (i) => i.config.name === 'warehouses_assigned_user_idx',
    );
    expect(assigned?.config.unique).toBe(false);
  });

  test('warehouses must be locatable (client requirement)', () => {
    expect(columnNames(warehouses)).toEqual(
      expect.arrayContaining(['location_reference', 'latitude', 'longitude']),
    );
    expect(checkNames(warehouses).sort()).toEqual([
      'warehouses_coords_pair_check',
      'warehouses_locatable_check',
    ]);
  });

  test('lot stock carries the pieces package dimension', () => {
    const pieces = column(materialLots, 'pieces');
    expect(pieces?.notNull).toBe(true);
    expect(pieces?.hasDefault).toBe(true);
    expect(columnNames(movements)).toContain('pieces');
    // Top-up upsert key: NULLS NOT DISTINCT so warehouse-level rows (NULL
    // node) conflict properly.
    const uq = getTableConfig(materialLots).uniqueConstraints.find(
      (u) => u.name === 'material_lots_lot_location_uq',
    );
    expect(uq?.nullsNotDistinct).toBe(true);
  });

  test('movements are append-only — nothing to update, nothing to delete', () => {
    const cols = columnNames(movements);
    expect(cols).not.toContain('updated_at');
    expect(cols).not.toContain('deleted_at');
  });

  test('movements carry an idempotency key behind a partial unique (00 §6 #21)', () => {
    expect(columnNames(movements)).toContain('idempotency_key');
    const uidx = getTableConfig(movements).indexes.find(
      (i) => i.config.name === 'movements_idempotency_key_uidx',
    );
    expect(uidx?.config.unique).toBe(true);
    expect(uidx?.config.where).toBeDefined();
  });

  test('report_id is text, matching reports.id', () => {
    expect(column(movements, 'report_id')?.columnType).toBe('PgText');
  });

  test('reason definitions carry requires_note (00 §6 #23)', () => {
    const requiresNote = column(movementReasonDefs, 'requires_note');
    expect(requiresNote?.notNull).toBe(true);
    expect(requiresNote?.hasDefault).toBe(true);
  });

  test('the entity tables soft-delete; the journal and balances do not', () => {
    // No entity is ever hard-deleted, but a journal row is never removed at
    // all, and a drained balance row keeps its zero (01 §2).
    expect(columnNames(warehouses)).toContain('deleted_at');
    expect(columnNames(storageNodes)).toContain('deleted_at');
    expect(columnNames(materialLots)).not.toContain('deleted_at');
    expect(columnNames(movements)).not.toContain('deleted_at');
  });

  test('storage_nodes stores its type as text (no DB enum to migrate)', () => {
    expect(column(storageNodes, 'type')?.columnType).toBe('PgText');
    expect(indexNames(storageNodes)).toContain('storage_nodes_name_in_parent_uidx');
  });
});
