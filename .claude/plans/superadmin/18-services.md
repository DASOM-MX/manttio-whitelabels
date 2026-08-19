# 18 — Services (catalog)

> **Status:** CP-1–CP-3 built (backend + superadmin UI + website); QA'd 2026-07-29 (PR #112 — dialog → view-first page, §3); **enhancements CP-4–CP-7 planned 2026-07-29** (§6) · **Depends on:** 02 · **Consumed by:** 20 (quotation lines), 19 (order lines), 06 (template link), 15 (website listing), 09 (billing)
> **Owner:** — · **Last updated:** 2026-07-29

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
  uom,                     // required, closed list (enum ServiceUom, 19 members
                           //   grouped by dimension: trabajo/tiempo/cantidad/
                           //   longitud/superficie/volumen/peso). Validator-
                           //   enforced, column stays `text` so a new unit needs
                           //   no DDL (2026-07-26)
  description?,            // INTERNAL management copy — notes for whoever maintains
                           //   the catalog. Never reaches the website (2026-07-25)
  websiteDescription?,     // the public card copy, and the ONLY description the site
                           //   sees (decided 2026-07-25). No fallback: a listed
                           //   service without one renders title-only. Shown in the
                           //   dialog only once isListableInWebsite is on
  websiteImageKey?,        // the public card photo (owner 2026-07-26). Stores the R2
                           //   KEY, not a URL — the bucket is `manttio-images` (its
                           //   own bucket, like brand assets), uploaded via
                           //   POST /upload/website-image, and the URL is materialized
                           //   on read against IMAGES_CDN_BASE_URL so a CDN move never
                           //   rewrites rows. Same disclosure rule as the copy above;
                           //   /public/services publishes `imageUrl`, never the key
  internalServiceCode?,    // tenant catalog code (decided 2026-07-25). Internal only —
                           //   never on /public/services. UNIQUE across the live
                           //   catalog (partial index: nulls exempt, tombstones
                           //   release their code); duplicate → 409. Searchable via ?q=
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

**Folder is `app/service-catalog/`, not `app/services/` (decided 2026-07-25):**
`app/services/` already means *injectables* (`http/`, `theme/`, `table/`), so feature
pages can't live there. The route stays `/services` and `ModuleKey` stays `'services'` —
only the folder differs, mirroring the same stutter dodge §5 applied to the http
service. Freeing the name would mean moving every injectable, a large unrelated refactor.

**QA 2026-07-29 (PR #112) — the dialog became a routed page.** The catalog was the last
module editing through a dialog; it now follows the users/customers idiom:
`service-catalog/pages/service-form/` serves `/services/new` (straight form) and
`/services/:id` (**view-first detail** — static display rows until an explicit Editar,
per the never-values-in-disabled-inputs rule; only admin tier sees Editar), both behind
`pendingChangesGuard`. `LoadService` hydrates by id so deep links survive refresh; error
toasts surface the backend's own message verbatim. The list row opens the detail for
every role (eye link as the read-only keyboard path), and the revealed website block in
the form is collapsible behind a chevron (re-opens whenever the listable checkbox turns
on). The `service-form-dialog` bullets below describe the pre-QA shape and stay for
history; the field inventory and disclosure rules they document carried over unchanged.

- `service-catalog/pages/services-list/` — p-table catalog (name + description, price
  `font-data`, **costo** (back-office only), uom, **IVA**, website pill, updated) —
  customers-list idiom, URL-persisted filter (`q`). Primary action **Registrar
  servicio** opens the dialog. Paging is **client-side**: `GET /services` returns the
  whole catalog, so the table isn't `[lazy]` and no `page` param is in the URL.
  The costo column renders only when the API actually returned costs (i.e. not for
  technicians); create button and row actions render only for admin tier.
- `service-catalog/components/service-form-dialog/` — shape-3 create/edit: name, price
  (`p-inputnumber` `mode="currency"` MXN), **`uom` select** (19 units, filterable,
  default Servicio), description, **`taxRate` select** (IVA
  16% / 8% / 0% / Exento, default 16%), then two website toggles:
  `isListableInWebsite` ("Aparecerá en la sección de servicios del sitio") and, revealed
  when it's on, `isPriceVisibleInWebsite` ("Mostrar el precio en el sitio") — progressive
  disclosure, since price-visibility only matters for a listed service. The same
  disclosure holds the two public-content fields: **Descripción para el sitio** and
  **Imagen para el sitio** (2026-07-26 — preview box + `.link-action` upload/Quitar
  pair, mirroring the clients-editor logo idiom; the photo state lives in a signal, not
  a form control, and `Guardar` is disabled while an upload is in flight). Both are kept
  when a service is unlisted — discarding them would lose work on every toggle — and
  both are always sent on save (`''` when cleared) so clearing actually persists
  through the PATCH.
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
  (`isListableInWebsite`), name-sorted; each entry is `{ id, name, description?,
  imageUrl?, uom, price? }` — `price` present **only when `isPriceVisibleInWebsite`** (decided
  2026-07-23 — per-service, not a global switch), so an omitted `price` is the site's
  cue to render "Precio a consultar". Never returns `cost`, the SAT keys, `taxRate`,
  or the delete audit; the repository selects only the public columns so a DTO slip
  can't leak them. Its `description` is **`websiteDescription`**, never the internal
  `description` (decided 2026-07-25) — management notes can't reach the site, and there
  is deliberately no fallback. `internalServiceCode` never leaves the tenant either.
  `imageUrl` (2026-07-26) is the **materialized** URL of `websiteImageKey` — the raw
  bucket key never reaches an unauthenticated consumer, and the field is omitted both
  when there is no photo and when the deploy has no `IMAGES_CDN_BASE_URL`, so the site
  can never render `undefined/<key>`. An empty catalog is a 200 with `[]`, not a 404 (unlike the CMS
  reads) — nothing published yet is a legitimate state, and the site just omits the
  section. **Built 2026-07-25** ahead of the rest of CP-3.

## 5. State

- `ServicesState`: `items`, `loading`, `selected`. Actions: `LoadServices`,
  `CreateService`, `UpdateService`, `DeleteService`.
- `src/app/services/http/services-catalog.service.ts` (avoid the `services.service.ts`
  stutter).

## 6. Catalog enhancements (planned 2026-07-29)

Four owner-approved additions, one PR per checkpoint (CP-4 → CP-7). Order matters only
where noted: CP-6's import events need CP-4's table; everything else is independent.

### 6.1 Price-change audit trail — `service_events` (CP-4)

The catalog is where the money *comes from*, yet price edits are silent overwrites —
every other money-bearing module already carries an append-only timeline
(`quotation_events`, `service_order_events`, `customer_interactions`). Same shape here:

```
ServiceEvent { id, serviceId, type, actorId, changes?, note?, seq, createdAt }
```

- **Append-only, forever** — no updates, no deletes, no cascades (global rule). Events
  are written **inside the same transaction** as the mutation, one multi-row insert
  (the quotations CP-1 performance rule).
- **Ordering is `seq` (bigserial), never `created_at`** — batch rows share one `now()`
  (quotations CP-1 review precedent); `seq` is the only sort key.
- Types: `service_created` (`changes.via: 'form' | 'clone' | 'import'`, clone carries
  `changes.sourceServiceId`), `service_updated` (`changes` = per-field `{ old, new }`
  for every edited column — price/cost/taxRate/uom/name/code are the ones that matter,
  but recording all edited fields costs nothing and spares a curated list going stale),
  `service_deleted` (`note` = the mandatory `deleteComment`). `actorId` is always a
  staff user — this module has no public actors.
- `GET /services/:id/timeline` → resolved events, **owner/admin only**: the trail
  contains `cost` old→new diffs and delete comments — management audit, not commercial
  visibility, so it rides `ADMIN_TIER`, not `BACK_OFFICE_TIER`.
- UI: timeline card on `/services/:id` (view mode, below the detail card), house
  timeline idiom; rendered only for admin tier.

### 6.2 Clone / duplicate (CP-5)

Catalogs fill with near-identical rows (the same service per tonnage / zone / duración).
**Frontend-only flow — no new backend surface:** a **Duplicar** action (list row +
detail view) navigates to `/services/new?from=<id>`; the form hydrates from the source
via `LoadService` (queryParamMap is the single load path, per the list-filter
convention) with two deltas: `internalServiceCode` **cleared** (unique across the live
catalog — a copy can't reuse it) and the photo **key copied as-is** (same R2 object;
"Quitar" later only clears the row's key, never deletes the object, so sharing is
safe). Everything else copies verbatim; saving is the normal `POST /services`. With
CP-4 in place the created event notes `via: 'clone'` + the source id.

### 6.3 Excel import/export — CSV (CP-6)

The whitelabel onboarding path: every new tenant arrives with a price list in Excel and
today that means hand-typing the catalog.

- **Format is CSV (UTF-8), not `.xlsx` — decided 2026-07-29.** Excel opens and saves
  CSV natively; parsing real xlsx on Workers means a heavy dependency for no gain.
  Revisit only on real demand. Columns: `name, price, cost, uom, taxRate,
  internalServiceCode, description, websiteDescription, satProdServCode, satUnitCode,
  isListableInWebsite, isPriceVisibleInWebsite` — codes are the wire enums
  (`servicio`, `iva_16`…), not labels.
- **Export** is client-side — the catalog ships whole (`GET /services`, no pagination),
  so an **Exportar CSV** toolbar action on the list serializes the loaded rows;
  admin-tier action, file includes `cost`. No backend surface.
- **Import** is a dedicated page (`/services/import`, admin tier,
  `pendingChangesGuard`): upload → client-side parse → **field mapper** → **preview
  p-table with per-row validation** (unknown uom/taxRate codes, non-numeric price,
  duplicate códigos in-file or against the live catalog) → confirm →
  `POST /services/import { rows }`. The backend **re-validates every row** (the client
  is never trusted) and the insert is **transactional, all-or-nothing** — a 422 names
  each failing row; a partial import that silently skipped rows would read as
  "imported everything" (no-silent-caps rule). **Create-only in v1** — no
  upsert-by-código (open ask below). Each row's `service_created` event carries
  `via: 'import'` (needs CP-4).
- **Field mapper (owner ask 2026-07-29):** tenant price lists never arrive with our
  canonical headers ("Concepto", "P.V.", "Clave SAT"…), so between parse and preview
  sits a mapping step: one row per catalog field, each with a **source-column select**
  populated from the file's headers plus a few sample values so the owner can see what
  they're pointing at. Auto-match preselects by normalized header (lowercase,
  accent-folded, space/punctuation-stripped) against the canonical names **and an alias
  list** (`concepto`/`servicio`/`nombre` → name · `precio`/`precio de venta`/`pv` →
  price · `costo` → cost · `unidad`/`um`/`u.m.` → uom · `iva`/`tasa` → taxRate ·
  `codigo`/`clave`/`sku` → internalServiceCode · `clave sat`/`claveprodserv` →
  satProdServCode · `clave unidad` → satUnitCode …). **`name` and `price` must map to a
  column**; every other field may map to a column, a **fixed value for all rows** (the
  escape hatch for lists with no unidad/IVA column — the selects offer the enum
  options, defaults `servicio`/`iva_16`), or *Omitir*. Enum cells accept the wire code
  **or** the Spanish label (accent-folded match against the label constants) — anything
  else is a per-row error in the preview, never a silent guess. The mapper is entirely
  client-side: it resolves before submit, so `POST /services/import` still receives
  canonical rows and the backend contract doesn't change.

### 6.4 SAT code fields UI (CP-7)

Supersedes the "no v1 UI" line of the 2026-07-25 SAT decision — the columns, validator
fields (`services.validator.ts` already accepts both) and DTO fields all exist, so this
is form + detail wiring: two optional text inputs (`satProdServCode` c_ClaveProdServ,
`satUnitCode` c_ClaveUnidad) in the service form under a **Facturación (SAT)** group,
plus their static rows on the detail view (rendered with — when unset). **Still no
format validation** — the SAT versions its catalogs and a stale local copy would reject
valid keys; 09 owns real validation (unchanged). Verify the write path round-trips both
fields end-to-end (validator → repository → DTO); `/public/services` keeps omitting
them. CP-6's CSV columns already include both, so an import can seed them.

---

## Checkpoints

### CP-1 — Backend catalog
- [x] `services` table + hand-written additive DDL — **applied to the shared Neon DB
      2026-07-25** (`create table` + partial name index, no migration file)
- [x] CRUD endpoints + validators (price `>= 0`, uom required)
- [x] Reads open to all authenticated roles; writes owner/admin
- [x] `GET /public/services` (pulled forward from CP-3, 2026-07-25)
- [x] `test/services.test.ts` — 17 tests, green. Fixtures are `test+`-prefixed **names**
      (no email column to isolate on) and soft-deleted in `afterAll`

### CP-2 — Superadmin catalog UI
- [x] `ServicesState` + http service + DTOs (`ServiceTaxRate` is a TS **enum**, matching
      the backend and the `CustomerStatus`/`TemplateStatus` precedent in `data/dtos/`)
- [x] List page (URL filter `q`) + shape-3 dialog + delete confirm
- [x] Nav entry + `ModuleKey`/`MODULE_ROLES` `'services'` =
      `['owner', 'admin', 'office', 'technician']` (§2); list page is read-only for
      office/technician — no **Registrar servicio** button, no row actions; build green
- [x] **`TECH_NAV` gains "Servicios"** — technicians have catalog access, so leaving it
      out of their nav would have made it URL-only

### CP-3 — Website exposure
- [x] `GET /public/services` — shipped with CP-1 (2026-07-25)
- [x] `websiteDescription` + `internalServiceCode` columns, API, dialog fields, catalog
      column, 6 new tests (2026-07-25). **DDL applied to the shared Neon DB.**
- [x] `website/src/components/ServiceCatalog.astro` — own section (`#catalogo`), a card
      per published service: title, `websiteDescription` when set, price + unit, or
      "Precio a consultar" when the price is hidden. `uom` codes are labelled by
      `website/src/lib/service-uom.ts` (bare symbol/lowercase noun — the labels read
      mid-phrase, "MXN / m²"; an unknown code degrades to readable text so a backend
      that grows a unit can't break a card). Verified against the real backend
      2026-07-26, not a stub.
- [x] **Section copy comes from the CMS** — `cms_home.catalog_content` (04 §6 group,
      added 2026-07-26): eyebrow/title/description edited in the *Catálogo* tab of the
      home editor, blank falls back to `DEFAULT_CATALOG_CONTENT`. Copy only — the cards
      keep coming from `/public/services`, so the group has no array beside it.
- [x] **Per-service photo** (`websiteImageKey`, owner 2026-07-26): new column + validator
      field, `POST /upload/website-image` into the **`manttio-images`** bucket
      (`MANTTIO_IMAGES` binding + `IMAGES_CDN_BASE_URL`, both wired in `wrangler.toml`;
      the bucket already existed in the account, unbound), dialog upload/preview/Quitar,
      and an `aspect-video object-cover` image atop the card. **Absent → no media block
      at all** (owner 2026-07-26): a uniform band with neutral placeholder tiles for
      photo-less services was built, screenshotted and rejected — "I would rather have
      long cards than empty looking ones with no image" — so a mixed grid carries
      whitespace in the text-only cards by choice, and no placeholder tile may be
      reintroduced. 4 new tests; **DDL applied to the shared Neon DB.**
      Verified live against the real backend end-to-end: upload → PATCH → `/public/services`
      → rendered `<img>` on `:4202`, then cleared again.
      **Deploy dependency:** no R2 custom domain is connected to `manttio-images` yet, so
      uploaded photos won't load in a browser until one is — the same pending state as
      `cdn.` / `logos.dasom.com`, which is why the field degrades to no-image rather than
      a broken one.

### CP-4 — Price-change audit trail (§6.1)
- [ ] `service_events` table (append-only, `seq` bigserial ordering, no CHECK
      constraints — house posture), additive DDL applied per the shared-DB rule
- [ ] Events written inside every mutation transaction (create/update/delete), single
      multi-row insert; `service_updated` carries per-field `{ old, new }`
- [ ] `GET /services/:id/timeline` — owner/admin only (`ADMIN_TIER`), resolved actors
- [ ] Timeline card on `/services/:id` view mode, admin tier only
- [ ] Tests: events per mutation, tier gate, `seq` ordering; fixtures soft-deleted

### CP-5 — Clone / duplicate (§6.2)
- [ ] **Duplicar** action on list row + detail view → `/services/new?from=<id>`
- [ ] Form hydrates from the source: `internalServiceCode` cleared, photo key copied,
      everything else verbatim; normal `POST /services` on save
- [ ] `service_created` event notes `via: 'clone'` + `sourceServiceId` (CP-4)
- [ ] Build green; manual pass: clone → tweak → save → both rows independent

### CP-6 — CSV import/export (§6.3)
- [ ] **Exportar CSV** list toolbar action (admin tier, client-side, wire-enum codes)
- [ ] `/services/import` page: upload → parse → field mapper → preview p-table with
      per-row validation → confirm; `pendingChangesGuard`
- [ ] Field mapper: source-column selects with sample values, alias-based auto-match,
      fixed-value option for uom/taxRate/flags, *Omitir* for optionals; `name` +
      `price` must map to a column; enum cells accept wire code or Spanish label
      (accent-folded), unknowns → per-row preview errors
- [ ] `POST /services/import { rows }` — backend re-validates every row, transactional
      all-or-nothing, 422 names each failing row; create-only v1
- [ ] Per-row `service_created` events with `via: 'import'` (needs CP-4)
- [ ] Tests: happy path, duplicate código (in-file + against live catalog), bad
      uom/taxRate code, all-or-nothing rollback

### CP-7 — SAT code fields UI (§6.4)
- [ ] `satProdServCode` + `satUnitCode` inputs in the form (**Facturación (SAT)**
      group) + static rows on the detail view
- [ ] Round-trip verified end-to-end (validator → repository → DTO); no format
      validation (09 owns it); `/public/services` still omits both
- [ ] CSV columns confirmed (CP-6); tests for persist + public omission

## Open decisions / asks
- **`is_report_source` (decided 2026-07-31, owner)** — a catalog service now says
  whether a unit of it produces a **report skeleton** of its own (19 §2): true for jobs
  a technician performs and documents, false for what an order only charges (labor by
  the hour, consumables by the kilo, freight). Column added in migration `0031`,
  **DEFAULT true** so every existing row keeps today's behavior and tenants flip their
  consumables off. Consumed by both order birth paths as the *default* explosion count;
  staff can override per line. Editor toggle lands with the 19 UI leg.
- **Import upsert (open, deferred from CP-6):** v1 import is create-only. An
  upsert-by-`internalServiceCode` mode (update price/copy for rows whose código already
  exists) is the natural v2 — decide when a tenant actually re-imports a revised list.
- **Timeline visibility (decided 2026-07-29):** the service timeline is
  owner/admin only — it carries `cost` diffs and delete comments (management audit),
  so it rides `ADMIN_TIER` rather than the `BACK_OFFICE_TIER` that gates `cost` itself.
- **CSV, not xlsx (decided 2026-07-29):** import/export speak Excel-compatible
  UTF-8 CSV; real `.xlsx` parsing on Workers is a heavy dependency for no gain.
  Revisit on real demand.
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
  `satUnitCode` (c_ClaveUnidad) live on the catalog now, optional ~~and with no v1 UI~~
  — **the no-UI half superseded 2026-07-29 by CP-7 (§6.4)**, which adds the form
  fields; the no-format-validation posture is unchanged.
  They're catalog attributes, not invoice attributes, so putting them here spares 09 a
  hand-backfill of every service. Not format-validated — the SAT versions its catalogs
  and a stale local copy would reject valid keys; **09 owns real validation.**
- **Delete shape — decided 2026-07-25:** audited soft delete (`delete_comment` +
  `deleted_by`, `DELETE` takes `{ deleteComment }`), matching users/equipment rather
  than the bare customers/reports shape. §3's confirm dialog therefore needs a required
  reason field, not just a yes/no.
- **Website copy — decided 2026-07-25:** `description` is internal management copy;
  `websiteDescription` is the public text and the **only** one `/public/services`
  returns. No fallback between them, so a management note can never be published by
  accident. The field is revealed in the dialog only once `isListableInWebsite` is on,
  but its value is **kept** when the service is unlisted — it isn't exposed while
  unlisted, and discarding it would lose work on every toggle.
- **Catalog code — decided 2026-07-25:** `internalServiceCode`, optional, internal only
  (never public). **Unique across the live catalog**, enforced by a partial unique index
  (`where internal_service_code is not null and deleted_at is null`) so nulls are exempt
  and a soft-deleted service releases its code for reuse. A duplicate returns
  `409 internal_service_code_in_use`. `?q=` searches it alongside name and description.
  An empty string is stored as NULL — `''` would collide with the next blank one.
- ~~`uom` stays free text v1; revisit an option catalog only on real demand~~ —
  **decided 2026-07-26 (real demand arrived):** `uom` is a closed list, TS enum
  `ServiceUom` with 19 generic commercial units, mirrored in the superadmin DTO and
  rendered as a filterable select with **PrimeNG option groups** (`[group]="true"` +
  `SelectItemGroup[]`, not comment-only grouping): **Trabajo** servicio/visita/viaje ·
  **Tiempo** hora/día/mes · **Cantidad** unidad/pieza/pallet · **Longitud**
  metro/yarda/pulgada · **Superficie** m²/hectárea · **Volumen**
  m³/litro/mililitro/galón · **Peso** kilogramo. Group membership lives in
  `service-uom-groups.const.ts` as a `Record<ServiceUom, …>`, so a new enum member
  **fails the build** until it's assigned a group instead of silently disappearing from
  the dropdown (verified by adding a member and watching tsc reject it). Enum values
  stay ASCII (`hectarea`, `galon`) even where the label is accented — the code is a
  wire value, the label is presentation. Free text let the same unit arrive as 'hr' / 'Hora' / 'horas', which
  would have split reporting once 19/20 aggregate lines. Deliberately generic, not
  trade-specific — the catalog is whitelabel. **Validator-only enforcement**
  (`z.nativeEnum`), no DB check constraint: same posture as `taxRate`, so the Drizzle
  model stays the single source of truth and adding a unit needs no DDL. Applied with
  zero live rows in the catalog, so no backfill.
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
