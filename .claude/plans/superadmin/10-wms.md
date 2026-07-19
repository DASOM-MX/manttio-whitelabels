# 10 — WMS (small warehouse management)

> **Status:** superseded — expanded 2026-07-19 into the **`10-wms/` plan suite**
> (`10-wms/00-overview.md` is the entry point) · **Last updated:** 2026-07-19

This file was the single source of truth for the WMS module. It grew into the largest
plan in the suite, so its content was **expanded into `10-wms/`** — one sub-plan per
submodule, each ownable by one agent, same checkpoint protocol (`00-master-plan.md`
§2). Every decision recorded here (2026-07-05 dates) **carries forward unchanged**;
new decisions introduced by the expansion are marked *proposed 2026-07-19* and indexed
in `10-wms/00-overview.md` §6.

| Sub-plan | Scope |
|---|---|
| `10-wms/00-overview.md` | Index, binding invariants, routing map, asks ledger, progress board |
| `10-wms/01-data-model.md` | Backend tables, enums, seeds, stock math, append-only enforcement |
| `10-wms/02-api-surface.md` | Backend endpoint catalog, role gates, error codes |
| `10-wms/03-warehouses.md` | Warehouses + sub-warehouses + technician (van) assignment |
| `10-wms/04-storage-hierarchy.md` | Storage-node tree + location stock panel |
| `10-wms/05-materials-catalog.md` | Material catalog + material view |
| `10-wms/06-stock-operations.md` | Movements, reasons, inbound/transfer/readjustment, self-checkout |
| `10-wms/07-replenishments.md` | Bulk restock documents: import, preview, evidence |
| `10-wms/08-report-materials.md` | Report material tracking + staff corrections |
| `10-wms/09-technician-surfaces.md` | Mi almacén + Consulta de stock + closing sweep |
| `10-wms/10-state-services-dtos.md` | Frontend plumbing reference (states/services/DTOs) |

Do not add module content to this file — it exists only so `10-wms` links keep
resolving.
