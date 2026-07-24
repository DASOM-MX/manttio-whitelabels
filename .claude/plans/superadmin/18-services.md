# 18 — Services (catalog)

> **Status:** planned · **Depends on:** 02 · **Consumed by:** 20 (quotation lines), 19 (order lines), 06 (template link), 15 (website listing), 09 (billing)
> **Owner:** — · **Last updated:** 2026-07-24

The tenant's **service catalog** — what the business sells (mantenimiento preventivo,
instalación, diagnóstico…), priced per unit of measure. Quotations (20) feed from this
catalog, and the service orders (19) an accepted quote generates compose the same
services into a job; templates (06 §5) can bind to a service so report filling starts
from the right form set.

Deliberately small: a flat catalog, no categories/variants in v1. Each service carries a
`taxable` flag (2026-07-24) so quotations can build the IVA base (20 §3) — the only tax
concept at the catalog level.

---

## 1. Data model (DTO view)

```
Service {
  id,                      // uuid
  name,                    // required
  price,                   // numeric(12,2) >= 0 — first money column in the
                           //   schema; Drizzle numeric maps to string in TS.
                           //   MXN implicit (single-currency v1)
  uom,                     // required free text v1: 'servicio', 'hora',
                           //   'equipo', 'visita'… — no invented catalog,
                           //   same posture as equipment.kind (11 §1)
  description?,
  taxable,                 // boolean, default true (decided 2026-07-24) — whether
                           //   IVA applies; quotation lines snapshot this to build
                           //   the tax base (20 §3). Exempt/zero-rated services set
                           //   false
  isListableInWebsite,     // boolean, default false — feeds the future
                           //   public website services section (15 ask)
  isPriceVisibleInWebsite, // boolean, default false (decided 2026-07-23) — a
                           //   listed service may show or hide its price on the
                           //   site; independent of listing. Only meaningful
                           //   when isListableInWebsite is true
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
| Read the catalog (pickers) | ✓ | ✓ | ✓ | ✓ᵃ |
| Create / edit / delete services | ✓ | ✓ | — | — |
| Toggle `isListableInWebsite` / `isPriceVisibleInWebsite` | ✓ | ✓ | — | — |

a. Technicians only ever see service *names* through their assigned reports/orders;
   whether price is redacted for them is a 19 open decision (leaning hide).

## 3. UI — `/services`

- `services/pages/services-list/` — p-table catalog (name, price `font-data`, uom,
  website pill, updated) — customers-list idiom, URL-persisted filters (`q`).
  Primary action **Registrar servicio** opens the dialog.
- `services/components/service-form-dialog/` — shape-3 create/edit: name, price
  (`p-inputnumber` `mode="currency"` MXN), uom, description, `taxable` toggle (default
  on — "Aplica IVA"), then two website toggles:
  `isListableInWebsite` ("Aparecerá en la sección de servicios del sitio") and, revealed
  when it's on, `isPriceVisibleInWebsite` ("Mostrar el precio en el sitio") — progressive
  disclosure, since price-visibility only matters for a listed service.
- Delete = confirm dialog (audited soft delete), only when not the last picker option…
  no — deletes never block (global rule); confirm copy just states orders keep their
  history.
- Nav: **Negocio → Servicios** (`module: 'services'`).

## 4. Expected API surface

- `GET /services` → `{ services: [...] }` — active only, name-sorted; no pagination
  (catalog-sized). Any authenticated role (pickers).
- `GET /services/:id`
- `POST /services` · `PATCH /services/:id` · `DELETE /services/:id` (soft) — owner/admin.
- Future (15): `GET /public/services` → published subset (`isListableInWebsite`);
  each entry includes `price` **only when `isPriceVisibleInWebsite`** (decided
  2026-07-23 — per-service, not a global switch), otherwise price is omitted.

## 5. State

- `ServicesState`: `items`, `loading`, `selected`. Actions: `LoadServices`,
  `CreateService`, `UpdateService`, `DeleteService`.
- `src/app/services/http/services-catalog.service.ts` (avoid the `services.service.ts`
  stutter).

---

## Checkpoints

### CP-1 — Backend catalog
- [ ] `services` table + hand-written additive DDL (ahead-of-migrations rule)
- [ ] CRUD endpoints + validators (price `>= 0`, uom required)
- [ ] Reads open to all authenticated roles; writes owner/admin

### CP-2 — Superadmin catalog UI
- [ ] `ServicesState` + http service + DTOs
- [ ] List page (URL filters) + shape-3 dialog + delete confirm
- [ ] Nav entry + `ModuleKey`/`MODULE_ROLES` `'services'`; build green

### CP-3 — Website exposure (blocked on 15 decisions)
- [ ] `GET /public/services` + website section consuming it

## Open decisions / asks
- **Money representation — decided 2026-07-23:** `numeric(12,2)`, MXN implicit,
  single currency in v1.
- `uom` stays free text v1; revisit an option catalog only on real demand.
- Price visibility for technicians — owned by 19 (leaning hide).
- Ask to 14: add `services` (and `service-orders`, 19) to the module/role matrix.
- ~~Ask to 15: public listing with or without prices~~ — **decided 2026-07-23:**
  per-service `isPriceVisibleInWebsite` flag (a listed service shows or hides its
  price independently). Remaining 15 ask: per-service description length for cards.
- Ask to 09: billing reads order-line snapshots, never the live catalog — confirm.
