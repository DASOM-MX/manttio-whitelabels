# 18 — Services (catalog)

> **Status:** CP-1 built (backend) · **Depends on:** 02 · **Consumed by:** 20 (quotation lines), 19 (order lines), 06 (template link), 15 (website listing), 09 (billing)
> **Owner:** — · **Last updated:** 2026-07-25

The tenant's **service catalog** — what the business sells (mantenimiento preventivo,
instalación, diagnóstico…), priced per unit of measure. Quotations (20) feed from this
catalog, and the service orders (19) an accepted quote generates compose the same
services into a job; templates (06 §5) can bind to a service so report filling starts
from the right form set.

Deliberately small: a flat catalog, no categories/variants in v1. Each service carries a
**Mexican IVA rate** (`taxRate`, decided 2026-07-24 — 16% / 8% / 0% / exento) so quotations
build the IVA base **per line** (20 §3); a boolean *taxable* isn't enough — the rates differ.

---

## 1. Data model (DTO view)

```
Service {
  id,                      // uuid
  name,                    // required
  price,                   // numeric(12,2) >= 0, required — first money column in
                           //   the schema; Drizzle numeric maps to string in TS
                           //   (stays a string end-to-end, no float rounds a peso).
                           //   MXN implicit (single-currency v1)
  cost?,                   // numeric(12,2), optional (decided 2026-07-25) — internal
                           //   cost feeding margin on quotation/order lines (20).
                           //   Admin-tier only: the DTO omits it for office/technician
  uom,                     // required free text v1: 'servicio', 'hora',
                           //   'equipo', 'visita'… — no invented catalog,
                           //   same posture as equipment.kind (11 §1)
  description?,
  taxRate,                 // Mexican IVA rate enum, default iva_16 (decided 2026-07-24):
                           //   iva_16 (16%) | iva_8 (8%, frontera) | iva_0 (0%, tasa
                           //   cero) | exento (CFDI-distinct from 0%). Quotation/order
                           //   lines snapshot it; IVA sums per line (20 §3)
  satProdServCode?,        // SAT c_ClaveProdServ (decided 2026-07-25) — optional,
  satUnitCode?,            // SAT c_ClaveUnidad. Carried on the catalog (where they
                           //   belong) so facturación (09) needs no hand-backfill.
                           //   No v1 UI; no format assertion (SAT versions its
                           //   catalogs — validating against a stale copy would
                           //   reject valid keys). 09 owns real validation
  isListableInWebsite,     // boolean, default false — feeds the future
                           //   public website services section (15 ask)
  isPriceVisibleInWebsite, // boolean, default false (decided 2026-07-23) — a
                           //   listed service may show or hide its price on the
                           //   site; independent of listing. Only meaningful
                           //   when isListableInWebsite is true, and the service
                           //   layer forces it false whenever listing is off, so
                           //   relisting can't leak a price the owner had hidden
  deleteComment, deletedBy,// audited soft delete (decided 2026-07-25), same shape
                           //   as users/equipment: DELETE takes { deleteComment }
  createdAt, updatedAt     // deletedAt: soft delete only, as everywhere
}
```

- **Soft delete never breaks orders:** order lines (19) FK-restrict to `services.id`
  *and* snapshot `unitPrice` at order time — a deleted/renamed/repriced service leaves
  history intact. Deleting a service only removes it from new-order pickers.
- **Price edits are catalog-only.** Existing order lines never re-read the catalog.

## 2. Roles (extends `14-access-control.md` §2 — matrix ask below)

| Action | owner | admin | office | technician |
|---|---|---|---|---|
| Read the catalog — list page + pickers, **price included** | ✓ | ✓ | ✓ | ✓ |
| See a service's internal `cost` | ✓ | ✓ | ✓ | — |
| Create / edit / delete services | ✓ | ✓ | — | — |
| Toggle `isListableInWebsite` / `isPriceVisibleInWebsite` | ✓ | ✓ | — | — |

**Decided 2026-07-25 (supersedes the earlier "technicians see names only" footnote and
closes the 19 price-redaction ask):** office *and* technician both get the `/services`
list page, prices and all — the catalog is a price list the field needs on hand, and
redacting it would only push people to ask someone else. `MODULE_ROLES.services =
['owner', 'admin', 'office', 'technician']`, the same read-wide set as reports /
calendar / wms.

**`cost` follows the back-office line, not the admin line (decided 2026-07-25):** owner,
admin *and* office see it — office quotes and invoices, so the number margin is computed
from is part of their job. Technicians don't. `GET /services` omits the field entirely
for them rather than shipping it and hiding it client-side.

That's a second, narrower tier than the usual owner/admin one, so it gets its own
predicate: `isBackOfficeTier` / `BACK_OFFICE_TIER` in `auth/utils/role-tier.ts`.
Where `ADMIN_TIER` gates *authority*, this gates *commercial visibility*. Stated as an
allow-list, never `role !== 'technician'` — a negative check would silently admit any
role added later, the wrong default for a confidentiality gate.

## 3. UI — `/services`

- `services/pages/services-list/` — p-table catalog (name, price `font-data`, uom,
  website pill, updated) — customers-list idiom, URL-persisted filters (`q`).
  Primary action **Registrar servicio** opens the dialog.
- `services/components/service-form-dialog/` — shape-3 create/edit: name, price
  (`p-inputnumber` `mode="currency"` MXN), uom, description, **`taxRate` select** (IVA
  16% / 8% / 0% / Exento, default 16%), then two website toggles:
  `isListableInWebsite` ("Aparecerá en la sección de servicios del sitio") and, revealed
  when it's on, `isPriceVisibleInWebsite` ("Mostrar el precio en el sitio") — progressive
  disclosure, since price-visibility only matters for a listed service.
- Delete = confirm dialog (audited soft delete), only when not the last picker option…
  no — deletes never block (global rule); confirm copy just states orders keep their
  history.
- Nav: **Negocio → Servicios** (`module: 'services'`).

## 4. Expected API surface

- `GET /services?q=` → `{ services: [...] }` — active only, name-sorted; no pagination
  (catalog-sized). Any authenticated role (pickers). `cost` is present **only for
  admin tier** — office/technician get the DTO without it.
- `GET /services/:id`
- `POST /services` · `PATCH /services/:id` — owner/admin.
- `DELETE /services/:id` — owner/admin, body `{ deleteComment }` (audited soft delete).
  Never blocks on references; order/quote lines keep their FK and price snapshot.
- `GET /public/services` → `{ services: [...] }` — unauthenticated, mounted before the
  JWT middleware alongside `/public/cms` and `/public/leads`. Published subset
  (`isListableInWebsite`), name-sorted; each entry is `{ id, name, description?, uom,
  price? }` — `price` present **only when `isPriceVisibleInWebsite`** (decided
  2026-07-23 — per-service, not a global switch), so an omitted `price` is the site's
  cue to render "Precio a consultar". Never returns `cost`, the SAT keys, `taxRate`,
  or the delete audit; the repository selects only the public columns so a DTO slip
  can't leak them. An empty catalog is a 200 with `[]`, not a 404 (unlike the CMS
  reads) — nothing published yet is a legitimate state, and the site just omits the
  section. **Built 2026-07-25** ahead of the rest of CP-3.

## 5. State

- `ServicesState`: `items`, `loading`, `selected`. Actions: `LoadServices`,
  `CreateService`, `UpdateService`, `DeleteService`.
- `src/app/services/http/services-catalog.service.ts` (avoid the `services.service.ts`
  stutter).

---

## Checkpoints

### CP-1 — Backend catalog
- [x] `services` table + hand-written additive DDL (ahead-of-migrations rule) — *DDL
      pending manual application to the shared Neon DB*
- [x] CRUD endpoints + validators (price `>= 0`, uom required)
- [x] Reads open to all authenticated roles; writes owner/admin
- [x] `GET /public/services` (pulled forward from CP-3, 2026-07-25)
- [ ] `test/services.test.ts` — blocked until the DDL is applied (the suite hits live Neon)

### CP-2 — Superadmin catalog UI
- [ ] `ServicesState` + http service + DTOs
- [ ] List page (URL filters) + shape-3 dialog + delete confirm
- [ ] Nav entry + `ModuleKey`/`MODULE_ROLES` `'services'` =
      `['owner', 'admin', 'office', 'technician']` (§2); list page is read-only for
      office/technician — no **Registrar servicio** button, no row actions; build green

### CP-3 — Website exposure
- [x] `GET /public/services` — shipped with CP-1 (2026-07-25)
- [ ] `website/` services section consuming it (still needs the 15 card-copy decision)

## Open decisions / asks
- **Money representation — decided 2026-07-23:** `numeric(12,2)`, MXN implicit,
  single currency in v1.
- **Tax — decided 2026-07-24 (supersedes the `taxable` boolean):** each service carries a
  **Mexican IVA rate** `taxRate` (enum `iva_16` | `iva_8` | `iva_0` | `exento`, default
  `iva_16`) — not every service is 16%, and `exento` differs from `0%` in CFDI. Quotation/
  order lines snapshot it and IVA totals compute **per line** (20 §3). **`iva_8` (región
  fronteriza, 8%) is in scope — confirmed 2026-07-24: the tenant works mainly in northern
  Mexico** — it's the border-stimulus rate, applied per qualifying service (so it stays
  per-service selectable; the field default remains `iva_16`, the general rate). **IEPS +
  IVA/ISR retenciones are the
  billing/facturación module's job (09), computed at invoicing — not here** (decided
  2026-07-24); the catalog/quote/order carry only each service's IVA rate. Model a per-line
  tax array in 09 if a tenant needs them (still behind the CFDI deferral, 00 §4).
- **Internal cost — decided 2026-07-25:** services carry an optional `cost`
  `numeric(12,2)` next to `price`, so margin on quotation/order lines (20) needs no
  later schema change. **Back-office tier** (owner/admin/office, decided 2026-07-25) —
  `GET /services` omits `cost` for technicians only, and it never reaches
  `/public/services` at all.
- **SAT catalog keys — decided 2026-07-25:** `satProdServCode` (c_ClaveProdServ) +
  `satUnitCode` (c_ClaveUnidad) live on the catalog now, optional and with no v1 UI.
  They're catalog attributes, not invoice attributes, so putting them here spares 09 a
  hand-backfill of every service. Not format-validated — the SAT versions its catalogs
  and a stale local copy would reject valid keys; **09 owns real validation.**
- **Delete shape — decided 2026-07-25:** audited soft delete (`delete_comment` +
  `deleted_by`, `DELETE` takes `{ deleteComment }`), matching users/equipment rather
  than the bare customers/reports shape. §3's confirm dialog therefore needs a required
  reason field, not just a yes/no.
- `uom` stays free text v1; revisit an option catalog only on real demand.
- ~~Price visibility for technicians — owned by 19 (leaning hide)~~ — **decided
  2026-07-25:** office and technician both read the catalog *with* prices (§2). Only
  `cost` is tier-gated, and only against technicians. 19 no longer owns this question.
- **No DB-level `check` constraints** on `price >= 0` or `tax_rate` — the validator
  enforces both, and the equipment precedent keeps constraints out of the DDL so the
  Drizzle model stays the single source of truth. Revisit if a non-API writer appears.
- Ask to 14: add `services` to the module/role matrix as
  `['owner', 'admin', 'office', 'technician']` (decided 2026-07-25, §2). `service-orders`
  (19) is still open.
- ~~Ask to 15: public listing with or without prices~~ — **decided 2026-07-23:**
  per-service `isPriceVisibleInWebsite` flag (a listed service shows or hides its
  price independently). Remaining 15 ask: per-service description length for cards.
- Ask to 09: billing reads order-line snapshots, never the live catalog — confirm.
