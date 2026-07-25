# 13 — Contracts (contratos / pólizas)

> **Status:** not-started · **Depends on:** 07 (client), 19 (service orders — the generating path), `storage/` (R2 signed URLs); 11 optional (equipment link) · **Reworked 2026-07-24** (owner: document-artifact model — supersedes the recurring-póliza / visit-generator model)
> **Owner:** — · **Last updated:** 2026-07-24

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
                           //   (copied from the order when order-generated)
  serviceOrderId?,         // nullable (decided 2026-07-24): the order that generated
                           //   this contract; an order generates 0..n contracts.
                           //   null = standalone (imported / no order). Restrict.
  name,                    // title, e.g. "Garantía compresor — Hotel X"
  type,                    // ContractType enum (fixed, §1.1)
  description?,            // free text — what the contract covers / notes
  equipmentIds?: string[], // covered units (11) — optional, scoped to the client
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

### 1.2 Stored document + signed URL (decided 2026-07-24)

- The file uploads to the private **`manttio-contracts` R2 bucket** (its own bucket,
  separate from report evidence; binding + name declared in `wrangler.toml`, infra config)
  via the `storage/` module — multipart form-data, the reports-evidence precedent. Allowed
  types are enforced server-side: **pdf / docx / odt / xls / xlsx** (`ContractFileType` enum
  + mime allowlist); reject anything else at upload.
- **Access is via a short-lived signed URL, never a public link** ("sign the file URL for
  enhanced security"): every read mints a fresh **presigned R2 GET URL** with a **1-hour
  TTL** (decided 2026-07-24). The `fileKey` never leaves the backend; the frontend only ever
  receives the time-boxed URL from `GET /contracts/:id/file-url`.
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
[[interactions-append-only-audit-trail]]). When order-generated, the **order timeline**
(19 §7) additionally carries the `order_contract_generated` event. `InteractionRefKind`
gains `Contract = 'contract'`.

(Open: whether high-frequency metadata edits belong on the CRM timeline or a dedicated
append-only `contract_events` table — start on `customer_interactions`, revisit if noisy.)

## 4. Roles (extends `14-access-control.md` §2)

| Action | owner | admin | office | technician |
|---|---|---|---|---|
| View / download contracts (signed URL) | ✓ | ✓ | ✓ | — |
| Create (from order or standalone) + upload file | ✓ | ✓ | ✓ | — |
| Edit metadata · replace file | ✓ | ✓ | ✓ | — |
| Delete (soft, reason) | ✓ | ✓ | — | — |

Technicians don't manage contracts (they see the job's visits/reports, not the paperwork).
Contracts carry **no money workflow** in v1 (no `amount`/billing; reconciliation is 09's).

## 5. Expected API surface

- `GET /contracts?page&limit&search&customerId&serviceOrderId&type&validity` → paged
  (`validity` = derived por-iniciar / vigente / vencido filter)
- `GET /contracts/:id` → contract + resolved customer / order / equipment display
- `GET /contracts/:id/file-url` → `{ url, expiresAt }` — a fresh short-lived **signed** R2
  GET URL (the only way the file is served)
- `POST /contracts` (multipart) — `{ customerId, serviceOrderId?, name, type, description?,
  equipmentIds?, validFromDate, expiryDate?, file }` → validate file type, store to R2,
  write the record, audit (§3)
- `PATCH /contracts/:id` — metadata edits (name/type/description/dates/equipment);
  audited with a field diff
- `POST /contracts/:id/file` (multipart) — replace the stored file; audited
- `DELETE /contracts/:id` `{ deleteComment }` — soft delete (audited)
- `GET /customers/:id/contracts` — customer-view card (07 slot — ask)
- `GET /service-orders/:id/contracts` — the order's generated contracts (19 order view)

## 6. Pages & components

- `contracts/pages/contracts-list/` — p-table (folio `font-data`, cliente, **type tag**,
  vigencia [validFrom → expiry, or "sin vencimiento"], **validity pill**, archivo icon,
  creada), URL filters (`q`/`customer`/`type`/`validity`). Primary action **Registrar
  contrato**. Top-level **Contratos** nav entry (owner/admin/office).
- `contracts/components/contract-form-dialog/` (or a page if the upload UX needs room) —
  create/edit: client select (pre-filled + locked when launched from an order), type
  select (the fixed enum), name, description, validFrom + optional expiry
  (`p-datepicker`; a "sin vencimiento" toggle clears expiry), equipment multiselect
  (scoped to the client, hidden until 11), and the **file upload** (pdf/docx/odt/xls/xlsx,
  single file). Edit keeps the current file unless replaced.
- `contracts/pages/contract-view/` — header (folio, client link, type tag, validity pill,
  order link when present), metadata card, **document card** (file name/type + **Descargar**
  → fetches a fresh signed URL), covered-equipment list, and the contract's audit entries
  (from the customer timeline, filtered to this contract).
- `contracts/components/delete-contract-dialog/` — shape-3, audit reason (soft delete).
- Order view (19 §5): **Generar contrato** action + a "Contratos" card listing the order's
  contracts.
- Customer view (07): "Contratos" card (07 slot — ask).

## 7. State

- `ContractsState`: `list`, `total`, `loading`, `selected`, `filters`. Actions:
  `LoadContracts(query)`, `LoadContract(id)`, `CreateContract`, `UpdateContract`,
  `ReplaceContractFile(id, file)`, `DeleteContract(id, comment)`, `GetContractFileUrl(id)`
  (transient — the signed URL is short-lived, never persisted in state).
- `src/app/services/http/contracts.service.ts`.

---

## Checkpoints

### CP-1 — Backend: contracts + file store + audit
- [ ] `contracts` table + `contract_counters` + hand-written additive DDL;
      `ContractType` / `ContractFileType` CHECKs; `serviceOrderId?` FK (restrict);
      `InteractionRefKind.Contract`
- [ ] CRUD + multipart upload to R2 (type allowlist) + `GET /:id/file-url` (short-lived
      **signed** URL) + soft delete
- [ ] Audit to `customer_interactions` (create / update / file-replace / delete);
      order-generated also logs `order_contract_generated` to the order timeline (19 §7)

### CP-2 — Superadmin: contracts UI
- [ ] DTOs + `ContractsState` + http service
- [ ] List (URL filters, validity pill) + form (upload) + view (signed-URL download) +
      delete dialog
- [ ] Nav **Contratos** + `ModuleKey`/`MODULE_ROLES` `'contracts'`; build green

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
- **Signed-URL TTL — 1 hour (decided 2026-07-24).** Whether downloads are additionally
  access-logged is still open (revisit at build).
- **Early termination** — cancelling a live contract before `expiryDate` is a soft delete
  with a reason in v1 (no separate `cancelled` status); add one if reporting must
  distinguish expired vs terminated.
- **File versioning** — v1 keeps only the current file (replace overwrites the ref,
  audited); keep old versions only if a tenant asks.
- **Audit home** — `customer_interactions` (reuse append-only infra) vs a dedicated
  `contract_events` table — start on the former, revisit if the CRM timeline gets noisy.
- **Amount / value** — omitted in v1 (no money workflow on contracts); add `amount?` only
  if the order/quote total should carry onto the contract (coordinate with 09).
- ~~description vs comments~~ — **decided 2026-07-24: description only** (a single
  free-text field; the separate `comments` field is dropped).
- Ask to 07: "Contratos" card slot on customer-view.
- Ask to 14: `contracts` module row in the matrix; config flag (own vs rides `scheduling`).
- Ask to 11: equipment multiselect on contracts (covered units) when equipment lands.
