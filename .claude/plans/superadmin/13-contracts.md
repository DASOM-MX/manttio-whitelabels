# 13 — Contracts (contratos / pólizas)

> **Status:** **CP-1 + CP-2 done (2026-08-18)** — backend complete: folio, order link, types, role-scoped visibility, private file store, covered units and the audit trail all built and tested; superadmin list/form/view/delete shipped. CP-3 not started · **Depends on:** 07 (client), 19 (service orders — the generating path), `storage/` (R2); 11 optional (equipment link) · **Reworked 2026-07-24** (owner: document-artifact model — supersedes the recurring-póliza / visit-generator model)
> **Owner:** — · **Last updated:** 2026-08-18

A **contract is a stored document** — the signed pdf/docx/odt/xls/xlsx — plus typed
metadata and validity dates. **Service orders generate contracts (0..n):** a job may
produce a guarantee, a programmed-maintenance agreement, a rental/sale doc, or none at
all; **standalone contracts** (no order) are also allowed for importing existing paper.
A contract is **not** a visit generator (decided 2026-07-24 — reverses the earlier
"contracts generate visits" model); future maintenance is booked as **new service orders**
(optionally citing the contract). UI copy: **Contrato / Póliza**; code says `contracts`.

---

## 1. Data model (DTO view)

```
Contract {
  id,                      // uuid PK
  folio,                   // 'CON-YYYYMMDD-NNNN', unique — own daily counter
                           //   (contract_counters, report_counters mechanics)
  customerId,              // REQUIRED, restrict — the client the contract is with
                           //   (copied from the order when order-generated).
                           //   Reaffirmed 2026-08-18 against a nullable variant:
                           //   it is the anchor §3's audit trail hangs on.
  serviceOrderId?,         // nullable (decided 2026-07-24): the order that generated
                           //   this contract; an order generates 0..n contracts.
                           //   null = standalone (imported / no order). Restrict.
  name,                    // title, e.g. "Garantía compresor — Hotel X"
  type,                    // ContractType enum (fixed, §1.1)
  description?,            // free text — what the contract covers / notes
  equipmentIds?: string[], // covered units (11) — optional, scoped to the client.
                           //   `contract_equipment` join table (0037); editable after
                           //   creation, unlike `visit_equipment`: the covered list is a
                           //   statement about the agreement, not a record of what a
                           //   technician touched
  visibleToRoles,          // Role[] — which non-manager roles may view/download this
                           //   contract (office / technician). Owner + admin always see
                           //   it and are the only ones who set this. Default: all
                           //   (office + technician) — owners restrict per contract
  // stored document — signed-URL access only (§1.2)
  fileKey,                 // R2 object key — PRIVATE, never a public URL
  fileName,                // original upload name
  fileType,                // ContractFileType enum: pdf | docx | odt | xls | xlsx
  fileSize?,               // bytes
  // validity
  validFromDate,           // date the contract takes effect
  expiryDate?,             // nullable — some contracts never expire (decided 2026-07-24)
  createdBy, createdAt,    // createdAt = the creation date
  updatedAt, deletedAt     // soft delete only (no hard delete, ever)
}
```

- **No stored status enum.** Validity is **derived from the dates** (display-only pill):
  *por iniciar* (`validFromDate` in the future) · *vigente* (in range, or no expiry) ·
  *vencido* (past `expiryDate`). Removal = **soft delete** (audited, §3); early termination
  before expiry is a soft delete with a reason in v1 (open item below).
- **Order link is 0..n (decided 2026-07-24).** The FK lives on the contract
  (`serviceOrderId`), not a single `contractId` on the order — one order can produce a
  guarantee *and* a programmed-maintenance contract. Restrict, never cascade.
- **Standalone allowed (decided 2026-07-24).** `serviceOrderId` null = a contract created
  directly on a customer (e.g. importing an existing signed agreement). `customerId` is
  the always-present anchor (audit + packaging below), so a contract is complete without
  an order.

### 1.1 Contract type — fixed enum (decided 2026-07-24)

A **fixed backend enum** (TS enum + `z.nativeEnum` + CHECK), *not* the tenant-customizable
`ContractTypeDef` (that soft-entity approach is dropped for contracts — 00 §4 updated):

```
enum ContractType {
  ProgrammedMaintenance = 'programmed_maintenance',
  CorrectiveMaintenance = 'corrective_maintenance',
  PreventiveMaintenance = 'preventive_maintenance',
  Installation          = 'installation',
  Rent                  = 'rent',
  Sell                  = 'sell',
  Buy                   = 'buy',
  Guarantee             = 'guarantee',
}
```

Type is descriptive metadata — **no behavior branches on it** (a `programmed_maintenance`
contract does not auto-schedule anything; it's a document). Spanish labels live in a
`model/constants/contracts/` label map (superadmin), one constant per file per the
constants rule.

### 1.2 Stored document + private access (decided 2026-07-24, access mechanism revised 2026-08-18)

- The file uploads to the private **`manttio-contracts` R2 bucket** (its own bucket,
  separate from report evidence; binding + name declared in `wrangler.toml`, infra config)
  via the `storage/` module — multipart form-data, the reports-evidence precedent. Allowed
  types are enforced server-side: **pdf / docx / odt / xls / xlsx** (`ContractFileType` enum
  + mime allowlist); reject anything else at upload.
- **Access is never a public link.** The `fileKey` never leaves the backend.
  ~~Every read mints a presigned R2 GET URL with a 1-hour TTL, fetched from
  `GET /contracts/:id/file-url`.~~ **Superseded 2026-08-18: the backend streams the file
  itself** from `GET /contracts/:id/file`, re-checking the caller's role and
  `visibleToRoles` on every request.
  **Why:** the repo has no presigning infrastructure at all — no `aws4fetch`/`@aws-sdk`
  dependency, no R2 S3 access keys, and `storage.service.ts` exposes only
  `r2Key`/`cdnUrl`/`putObject`/`deleteObject`. Presigning would mean a new dependency plus
  two new per-tenant secrets. Proxying needs neither, reuses the existing binary-response
  precedent (`reports.controller.ts`), and is **strictly stronger** for a signed contract:
  a presigned URL stays valid for its full hour no matter what, while a proxied download
  honours a visibility change immediately. The `manttio-contracts` bucket therefore carries
  **no public domain**, and there is no `CONTRACTS_CDN_BASE_URL`.
- **Replacing the file** = a new upload that updates `fileKey`/`fileName`/`fileType` and
  **appends an audit event** (§3). Versioning (keeping old files) is out of v1 (open item).

## 2. Generation from a service order

- The order view (19 §5) offers **Generar contrato**, opening the contract form with
  `serviceOrderId` + `customerId` pre-filled and locked from the order. An order can
  generate several (0..n); each is an independent contract record.
- Order-generated creation appends `order_contract_generated` to the **order timeline**
  (19 §7, `refId` → the contract), so the order's client handoff shows the contracts it
  spawned.
- Standalone creation (`serviceOrderId` null) starts from the contracts list or the
  customer view instead.

## 3. Audit trail — contract updates audited (decided 2026-07-24)

Every contract lifecycle event — **created · metadata updated (with a changed-field
summary) · file replaced · soft-deleted** — appends an **append-only** system entry to the
**customer's interaction timeline** (08, `customer_interactions`) — the always-present
anchor that works for order-generated *and* standalone contracts, so there is **no
per-contract audit table** (consistent with [[order-level-audit-trail]] and
[[interactions-append-only-audit-trail]]). `InteractionRefKind` gains `Contract = 'contract'`.

**Creating a contract for a client writes a client audit record (decided 2026-07-25).**
Just as raising a service order does (19 §2), `POST /contracts` appends a
`customer_interactions` system entry ("Contrato CON-… creado — <tipo>") to that client's
timeline — so the client 360 shows every contract raised for them. When the contract is
order-generated the **order timeline** (19 §7) *additionally* carries the
`order_contract_generated` event; the two are complementary (client history vs job history).

## 4. Roles (extends `14-access-control.md` §2)

**Visibility is per-contract (decided 2026-07-24).** Owner + admin always see and manage
every contract; **office/technician see a contract only when their role is in its
`visibleToRoles`**, which **only owner/admin set**. Default `visibleToRoles = [office,
technician]` (all staff see by default) — owners **restrict** it per contract for sensitive docs.

| Action | owner | admin | office | technician |
|---|---|---|---|---|
| View / download (signed URL) | ✓ all | ✓ all | if role ∈ `visibleToRoles` | if role ∈ `visibleToRoles` |
| Create (from order or standalone) + upload | ✓ | ✓ | ✓ | — |
| Edit metadata · replace file | ✓ | ✓ | ✓ (visible ones) | — |
| **Set visibility by role** (`visibleToRoles`) | ✓ | ✓ | — | — |
| Delete (soft, reason) | ✓ | ✓ | — | — |

Technicians never create/edit contracts (they only ever *view* one an owner explicitly
shares). Contracts carry **no money workflow** (no `amount`/billing — decided 2026-07-24;
reconciliation is 09's).

## 5. Expected API surface

*(built 2026-08-18 unless noted)*

- `GET /contracts?page&limit&search&customerId&serviceOrderId&type&validity&tag` → paged,
  **role-scoped** (owner/admin see all; office/technician see only contracts whose
  `visibleToRoles` includes their role). `validity` = derived por-iniciar / vigente / vencido.
  `search` ilikes folio / name / description / fileName / tags
- `GET /contracts/:id` → contract + resolved customer + order folio. A contract the caller
  may not see returns **404, not 403** — the endpoint never confirms a restricted document
  exists
- `GET /contracts/:id/file` → the document itself, streamed from the private bucket
  (supersedes `/file-url`, §1.2)
- `POST /contracts` (multipart) — `{ customerId, serviceOrderId?, name, type, description?,
  validFromDate, expiryDate?, tags?, visibleToRoles?, file }` → validate file type, store to
  R2, write the record, audit (§3). **There is no `/upload/contract`**: `/upload/*` sits
  behind bare auth, so a standalone route would let any authenticated technician write into
  the contracts bucket. Upload is part of this request instead
- `PATCH /contracts/:id` — metadata edits (name/type/description/dates/tags); plus
  `visibleToRoles` (**owner/admin only** — 403 for office); audited with a field diff.
  `customerId`/`serviceOrderId` are immutable — re-filing under another client would orphan
  the audit trail
- `POST /contracts/:id/file` (multipart) — replace the stored document; audited
- `DELETE /contracts/:id` `{ deleteComment }` — soft delete (audited), owner/admin only
- `GET /customers/:id/contracts` — customer-view card (07 slot — ask)
- `GET /service-orders/:id/contracts` — the order's generated contracts (19 order view)
- `GET /contracts?equipmentId=` — "which contracts cover this unit", the 11 equipment-view
  coverage card. An `EXISTS` against `contract_equipment`, so a contract covering several
  units is never doubled in the page or the count
- `equipmentIds` rides on `POST /contracts` (JSON array over multipart) and `PATCH
  /contracts/:id` (**full replacement set**: omit to leave untouched, `[]` to clear). Units
  are **client-scoped** — a unit belonging to another customer, or a retired one, is
  `409 equipment_customer_mismatch` rather than a silent drop

## 6. Pages & components

- `contracts/pages/contracts-list/` — p-table (folio `font-data`, cliente, **type tag**,
  vigencia [validFrom → expiry, or "sin vencimiento"], **validity pill**, archivo icon,
  creada), URL filters (`q`/`customer`/`type`/`validity`). Primary action **Registrar
  contrato**. Top-level **Contratos** nav entry (owner/admin/office).
- `contracts/pages/contract-form/` — **a page, decided 2026-08-18** (owner: "MUST be an
  isolated page instead, for extensibility"). Supersedes the dialog this section originally
  hedged on: the form already carries a document, covered units and a visibility decision,
  it is expected to keep growing (renewals, amounts, signatories), and a route gives every
  entry point a plain link — which is exactly what §5's order-driven "Generar contrato"
  needs (`/contracts/new?customer=…&order=…` opens with both pre-locked). Canon to follow is
  `customers/pages/customer-form/`. Create/edit: client select (pre-filled + locked when launched from an order), type
  select (the fixed enum), name, description, validFrom + optional expiry
  (`p-datepicker`; a "sin vencimiento" toggle clears expiry), equipment multiselect
  (scoped to the client; the backend accepts `equipmentIds` as of 2026-08-18), a **visibility-by-role** multiselect (owner/admin
  only — office / technician; managers implicit), and the **file upload**
  (pdf/docx/odt/xls/xlsx, single file). Edit keeps the current file unless replaced.
- `contracts/pages/contract-view/` — header (folio, client link, type tag, validity pill,
  order link when present), metadata card, **document card** (file name/type + **Descargar**
  → hits `GET /contracts/:id/file`), covered-equipment list, and the contract's audit entries
  (from the customer timeline, filtered to this contract).
- `contracts/components/delete-contract-dialog/` — shape-3, audit reason (soft delete).
- Order view (19 §5): **Generar contrato** action + a "Contratos" card listing the order's
  contracts.
- Customer view (07): "Contratos" card (07 slot — ask).

## 7. State

- `ContractsState`: `list`, `total`, `loading`, `selected`, `filters`. Actions:
  `LoadContracts(query)`, `LoadContract(id)`, `CreateContract`, `UpdateContract`,
  `ReplaceContractFile(id, file)`, `DeleteContract(id, comment)`. The download is
  **transient and stays out of state** (built 2026-08-18): the view calls
  `ContractsService.download(id)` for the bytes and revokes the object URL immediately — the
  report-PDF precedent. There is nothing to store and no URL to hold (§1.2).
- `src/app/services/http/contracts.service.ts`.

---

## Checkpoints

### CP-1 — Backend: contracts + file store + audit ✅ (2026-08-18)
Landed in two passes. The first (2026-07-22) was written against the *superseded* "plain
document filing" spec and delivered only the filing core; the second (2026-08-18) brought
it to this plan. Migration `0036_contracts.sql` — amended in place rather than stacked,
since `main` had never applied it.

- [x] `contracts` table + `contract_counters` (`CON-YYYYMMDD-NNNN`, allocated in the create
      transaction so a folio is never burned unused); `ContractType` / `ContractFileType`
      CHECKs; `serviceOrderId?` FK (restrict); `visibleToRoles`; `createdBy`;
      `InteractionRefKind.Contract`
- [x] CRUD + multipart upload to the private R2 bucket (type allowlist: pdf/docx/odt/xls/xlsx,
      415 otherwise — images are rejected, a photo of a contract is not the contract)
      + `GET /:id/file` (§1.2, supersedes the signed-URL design) + **role-scoped list/read**
      (`visibleToRoles`; owner/admin-only to set; restricted contracts read as 404) + soft delete
- [x] Audit to `customer_interactions` (create / update with a changed-field summary /
      file-replace / delete); order-generated also logs `order_contract_generated` to the
      order timeline (19 §7)
- [x] **Covered units** (2026-08-18, second pass): `contract_equipment` join table
      (`0037_contract_equipment.sql`), `equipmentIds` on create + as a full replacement set on
      PATCH, client-scoped (a foreign or retired unit → `409 equipment_customer_mismatch`),
      `?equipmentId=` list filter, and the links in the DTO — name-only on list reads,
      nameplates on the detail read
- [x] `test/contracts.test.ts` — 26 tests, green against the live DB

**Deferred out of CP-1:** download access-logging (§ open item — the proxy route makes it
trivial to add later).

### CP-2 — Superadmin: contracts UI ✅ (2026-08-18)
Built fresh against the document-artifact contract. A 2026-07-23 attempt exists on the
unmerged `feature/superadmin-contracts-ui` branch but was written for the **superseded**
spec (public `fileUrl` downloads, JSON create, optional client, `validationDate`, a
client-derived `por_vencer ≤30d` vigencia) and predates the plan-17 restyle by 54 commits —
it was mined for ideas, not rebased.

- [x] `data/dtos/contract/` + `model/enums/contract/` (type · file type · validity, parity
      with the backend) + `model/constants/contract/` labels/severities + `contract.pipe.ts`
      (type · validity label/severity · file glyph · visibility) + `file-size.pipe.ts`
- [x] `ContractsService` — multipart create (metadata + document in **one** request),
      metadata PATCH, `POST /:id/file` replace, and `download()` returning a **Blob**
- [x] `ContractsState` (route-lazy `provideStates`) with `items`/`selected` +
      `byCustomer`/`byServiceOrder` card feeds already wired for CP-3
- [x] `contracts-list` — p-table, URL filters (`?q&customer&type&validity&tag&page`),
      validity pill straight off the API, clickable tag chips, whole-row click into the view
- [x] `contract-form` — a **routed page**, not a dialog (owner 2026-08-18): `/contracts/new`
      and `/contracts/:id/edit`, `pendingChangesGuard`, four card sections (General ·
      Documento · Vigencia · Equipos cubiertos) on the `customer-form` pattern. Client select
      (**lazy virtual scroll, 65 rows per request, server-backed search** — the roster is 1000+ on a real tenant;
      locked fields render as text, not a disabled select), type, dates + "sin vencimiento" toggle,
      **equipment multiselect scoped to the client**, role-visibility multiselect
      (owner/admin only), single-file picker. Create sends one request; edit patches metadata
      and only then replaces the document
- [x] `contract-view` — header (folio, validity pill), ficha, **document card with
      Descargar** (fetches bytes, object URL revoked immediately — no link to share),
      covered-equipment table
- [x] `delete-contract-dialog` — audited soft delete, owner/admin only
- [x] Routes replace the `ModuleStub`; nav entry + `MODULE_ROLES` already existed. Build green

**Not built — needs a backend change first:** the view's **audit-entry card** (§6). The
entries exist (`customer_interactions`, `refKind: 'contract'`), but
`GET /customers/:id/interactions` takes only `page`/`limit` — there is no `refKind`/`refId`
filter, so the card could only page the whole client timeline and hope the contract's
entries are on it. Client-side filtering would render a card that is silently empty for any
active client. The fix is a small filter on that endpoint; deliberately not folded into a
superadmin checkpoint.

### CP-3 — Order + customer integration
- [ ] Order view **Generar contrato** (pre-locks client/order) + order "Contratos" card
- [ ] Customer-view "Contratos" card (07 slot)
- [ ] Role gating (office no delete); dark-mode; empty states; manual pass: order →
      generar contrato (upload pdf) → download via signed URL → edit expiry (audited) →
      standalone contract → soft delete

## Open decisions / asks
- **Reworked 2026-07-24 (owner):** contract = **stored signed document + typed metadata**,
  generated from an order (0..n) or standalone; **no visit generation** (supersedes the
  recurring-póliza model); fixed `ContractType` enum (8 values); `expiryDate` nullable;
  updates audited. Resolves the 19 "order → contract" open ask — a `programmed_maintenance`
  contract does **not** auto-schedule; future maintenance is new orders.
- ~~**Signed-URL TTL — 1 hour (decided 2026-07-24).**~~ **Superseded 2026-08-18: no signed
  URLs at all** — the backend streams the document from `GET /contracts/:id/file` and
  re-checks access per request (§1.2 carries the reasoning). Whether downloads are
  additionally access-logged is still open; the proxy route is the natural place for it.
- **Role visibility — decided 2026-07-24:** per-contract `visibleToRoles`, **owner/admin
  set**; owner/admin always see all, office/technician only when their role is listed.
  **Default: all staff** (`[office, technician]`) — owners restrict per contract.
- ~~Early termination~~ — **decided 2026-07-24: always soft delete** (with a reason); **no
  `cancelled` status.** A terminated contract is a soft-deleted record; a naturally lapsed
  one is simply `vencido` (past `expiryDate`) but not deleted.
- ~~File versioning~~ — **decided 2026-07-24: none.** Replacing the file overwrites the
  stored object + `fileKey` (the change is audited); old versions are not kept.
- ~~Amount / value~~ — **decided 2026-07-24: no amount** on a contract (it's a document,
  not a money record — makes no sense here); value/billing lives in 09.
- ~~Audit home~~ — **decided 2026-07-25: the client's `customer_interactions` timeline**
  (no dedicated `contract_events` table). Contract create / update / file-replace / delete
  all append there; **creation mirrors order-creation's client entry** (19 §2).
- ~~description vs comments~~ — **decided 2026-07-24: description only** (a single
  free-text field; the separate `comments` field is dropped).
- **Migration numbering (2026-08-18):** the contracts DDL is `0036_contracts.sql`. Earlier
  revisions of this file said `0023` and then `0032`; both are stale — `main` took 0033–0035
  (report `template_id`, report `comments`, order-events index) while this work sat unpushed.
- **Dev-DB reconciliation (2026-08-18):** the shared Neon DB carried a hand-applied
  `contracts` table from the superseded spec. It was dropped and recreated from the
  migration (its only row was a self-labelled, soft-deleted smoke-test row referenced by
  nothing). A tenant DB is provisioned from the migrations, so hand-applied schema is a
  provisioning bug — see [[shared-neon-db-ahead-of-migrations]].
- Ask to 07: "Contratos" card slot on customer-view.
- Ask to 14: `contracts` module row in the matrix; config flag (own vs rides `scheduling`).
- ~~Ask to 11: equipment multiselect on contracts (covered units) when equipment lands.~~
  **Resolved 2026-08-18** — the backend leg is built (`contract_equipment`, `equipmentIds`,
  `?equipmentId=`). What remains is the CP-2 multiselect and, on 11's side, a
  "contratos que cubren este equipo" card fed by `?equipmentId=`.
