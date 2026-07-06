# 11 — Equipment (client asset registry)

> **Status:** not-started · **Depends on:** 07 (CP-1); hooks into 06, 10
> **Owner:** — · **Last updated:** 2026-07-05

The client's installed units — what an HVAC/service shop actually maintains. Each piece of
equipment belongs to a customer and accumulates a **per-unit service history** (reports
linked to it), which is what turns "we visited Hotel X" into "this compressor has been
repaired three times — sell the replacement." This is a strategic differentiator vs generic
CRMs (decided 2026-07-05): it exploits reports (04) and serialized WMS stock (09), which
generic CRMs don't have.

UI copy is Spanish-side "Equipos"; code says `equipment`.

---

## 1. Data model (DTO view)

```
Equipment {
  id, customerId,
  name?,                        // friendly label: "Rooftop unit 2", "Chiller principal"
  brand?, model?, serialNumber?,
  kind?,                        // free text v1: 'minisplit', 'chiller', 'paquete'…
  capacity?,                    // free text v1: '3 TR', '60,000 BTU'
  location?,                    // where on the client's premises: 'azotea', 'site'
  installDate?,
  installedByUs: boolean,       // false = pre-existing unit we service
  materialUnitId?,              // WMS hook: the serialized unit this asset came from (10)
  status: 'active' | 'retired',
  notes?, createdAt, deletedAt?
}
```

- `kind`/`capacity` stay **free text in v1** — don't invent catalogs before real tenant
  data shows the shapes; promoting them to enums later is a backfill, not a break.
- **WMS hook (ask to 10 + backend):** when an install report consumes a *serialized*
  `MaterialUnit`, the backend should offer/auto-create the corresponding `Equipment`
  record (`installedByUs: true`, `materialUnitId` backlink). v1 superadmin also allows
  plain manual creation — most of a new tenant's equipment pre-exists.
- Service history is **derived**, not stored: reports linked to the equipment (§2).

## 2. Report linkage

A service visit often covers several units, so report ↔ equipment is **many-to-many**
(join: `reportId`, `equipmentId`). Capture-time linking happens in the field app
(**upstream ask** — out of superadmin scope); superadmin provides **retro-linking**:
attach/detach a report to equipment from the equipment view (owner/admin/office).
Detaching is allowed (it's a categorization fix, not an audit record — the report itself
is untouched).

## 3. Expected API surface

- `GET /customers/:id/equipment` → list (the common read path)
- `GET /equipment?search&customerId&status` → paged (global search: "where are all the
  Carrier chillers we service?")
- `GET /equipment/:id` — detail incl. `reports: ReportSummary[]` (service history)
- `POST /equipment` · `PATCH /equipment/:id` (incl. `status` retire/reactivate)
- `DELETE /equipment/:id` `{ deleteComment }` (soft — reserve for created-by-mistake;
  a unit that stopped being serviced is `retired`, not deleted)
- `POST /equipment/:id/reports` `{ reportId }` · `DELETE /equipment/:id/reports/:reportId`
  (retro-link/unlink)

## 4. Pages & components

Routing note: equipment lives **under the Clients nav group** (All / Leads / Blacklist /
**Equipment**) — the global list is a projection; the daily entry point is the customer
view.

- `equipment/pages/equipment-list/` — global paged table: name/label, kind, brand+model,
  serial, client (link), status pill, last service. Filters: search, client, status.
- `equipment/pages/equipment-view/` — detail card (all fields, WMS unit link when
  `materialUnitId`), **service history** table (linked reports, newest first, link to
  06's report view) with the retro-link action ("attach report" — searchable report
  select scoped to the same client), retire/reactivate action.
- `equipment/components/equipment-form-dialog/` — shape-3 dialog (fields are few enough;
  no dedicated form page). Openable from the equipment list *and* from the customer
  view's equipment card with the client pre-locked.
- **Customer-view equipment card** (mounted in a new reserved slot in 07's customer-view,
  next to CRM/Bills): compact list of the client's units (name, kind, status, last
  service) + "add equipment" → the dialog. Coordinate the slot with 07 (record as ask).

## 5. State

- `EquipmentState`: `list`, `total`, `loading`, `selected`, `byCustomer` (customer-view
  card), `filters`. Actions: `LoadEquipment(query)`, `LoadCustomerEquipment(customerId)`,
  `LoadEquipmentDetail(id)`, `CreateEquipment`, `UpdateEquipment`, `RetireEquipment(id)`,
  `LinkReport(id, reportId)`, `UnlinkReport(id, reportId)`, `DeleteEquipment(id, comment)`.
- `src/http/equipment.service.ts`.

---

## Checkpoints

### CP-1 — Registry
- [ ] DTOs + service + `EquipmentState`
- [ ] Global list page + filters; nested nav entry under Clients
- [ ] Form dialog (create/edit) from list + customer-view card
- [ ] Customer-view equipment card in 07's slot (coordinate with 07)

### CP-2 — Service history
- [ ] Equipment view page with linked-reports table
- [ ] Retro-link/unlink actions + toasts
- [ ] Retire/reactivate flow (status pill everywhere)

### CP-3 — Polish
- [ ] WMS unit link rendered when `materialUnitId` present (link to 10's views)
- [ ] Dark-mode audit; empty states ("no equipment registered — add the first unit")
- [ ] Route `data` declared on all pages; build green; manual pass: create client → add
      2 units → retro-link a report → history shows it → retire one unit

## Open decisions / asks
- Ask to 07: reserve an **Equipment** slot on customer-view (like CRM/Bills).
- Ask to 10 + backend: serialized-unit-consumed-on-report → equipment auto-create hook
  (v1 or later?); `materialUnitId` FK direction confirm.
- Upstream ask (field app, out of scope here): let technicians pick the serviced
  equipment at capture time — until then all linking is retro-active in superadmin.
- `kind` free text vs enum: revisit after real tenant data.
- Whether equipment should surface in 06's report-view (badge/links on linked reports) —
  coordinate with 06 when both land.
