# 13 — Maintenance contracts (pólizas de mantenimiento)

> **Status:** not-started · **Depends on:** 06 (CP-1), 12 (CP-1); 11 optional (equipment link)
> **Owner:** — · **Last updated:** 2026-07-05

The recurring-revenue engine: annual/periodic service agreements with N scheduled visits.
A contract is the *commercial* object; activating it **generates `ScheduledVisit`s into
the calendar (12)**, which drive reports (04), which drive bills (05) — this module closes
the loop across the whole product. Standard practice in Mexican HVAC B2B ("póliza de
mantenimiento"); UI copy uses **Póliza/Contrato**, code says `contracts`.

---

## 1. Data model (DTO view)

```
MaintenanceContract {
  id, customerId, folio?,
  name?,                        // "Póliza anual 2026 — Hotel X"
  type,                         // code of ContractTypeDef (below)
  status: 'draft' | 'active' | 'expired' | 'cancelled',
  startDate, endDate,
  frequency: 'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'annual' | 'custom',
  visitsPlanned,                // derived from frequency + range; editable when 'custom'
  defaultTechnicianId?,         // pre-assign generated visits (else unassigned)
  equipmentIds?: string[],      // covered units (11) — optional
  amount?,                      // total contract value, MXN; informational in v1
  notes?,
  createdBy, createdAt, cancelledAt?, cancelReason?, deletedAt?
}
```

### 1.1 Contract types (soft entity — decided 2026-07-05)

Types are **tenant-customizable data**, not an enum — same definition-entity pattern as
WMS movement reasons (master plan §4):

```
ContractTypeDef {
  id, code,                     // immutable slug, auto-generated from label
  label,                        // editable ("Preventivo", "Póliza integral"…)
  active,                       // deactivate-only — NO delete (history integrity)
  createdAt
}
```

- **Seeded defaults per tenant:** `preventivo`, `correctivo`, `mixto` — plain rows, not
  locked (unlike reason built-ins, no logic hangs off a type; rename/deactivate freely).
- **Owner customizes** (add / rename / deactivate); deactivated types disappear from the
  select but still render on historical contracts by `code`.
- Types are descriptive/reporting metadata in v1 — no behavior branches on them (a type
  that changes visit-generation rules would be a v2 feature, recorded below).

- **Lifecycle:** `draft` (editable freely) → `active` (locks commercial terms; generates
  visits) → `expired` (automatic at `endDate`) | `cancelled` (manual, reason required).
  **Renewal = new contract** (optionally pre-filled "duplicate from"), never mutating an
  old one — history stays honest.
- **Visit generation (backend):** on activation, evenly-spaced `ScheduledVisit`s between
  `startDate`/`endDate` per `frequency` (`contractId` backlink, `defaultTechnicianId` or
  unassigned, `equipmentIds` copied). Staff then adjusts individual dates/techs in the
  calendar — generated visits are normal visits; the contract does not micro-manage them
  after generation.
- **Cancelling a contract** cancels its remaining `scheduled` visits (completed ones
  stand). Amounts/billing stay informational in v1 — no auto-billing (open decision).

## 2. Roles (extends `10-access-control.md` §2 — mirrors Billing³)

Contracts are money commitments, so they gate like bills: **office drafts; owner/admin
activate/cancel.**

| Action | owner | admin | office | technician |
|---|---|---|---|---|
| View contracts | ✓ | ✓ | ✓ | — |
| Create / edit **drafts** | ✓ | ✓ | ✓ | — |
| Activate (generates visits) | ✓ | ✓ | — | — |
| Cancel (reason required) | ✓ | ✓ | — | — |
| **Manage contract types** (add / rename / deactivate, §1.1) | ✓ | —ᵃ | — | — |

a. Owner-only per the 2026-07-05 decision ("for owners to customize"). Note this is
   *tighter* than the WMS reason pattern (owner **and** admin) — extend to admin only if
   parity proves more practical (open decision).

Technicians never see contracts — they see the resulting visits in the calendar.

## 3. Expected API surface

- `GET /contract-types` (`?all=true` includes inactive, for the manage view)
- `POST /contract-types` `{ label }` → code auto-slugged server-side
- `PATCH /contract-types/:id` `{ label?, active? }` — **no DELETE** endpoint
- `GET /contracts?page&limit&search&customerId&status&type` → paged
- `GET /contracts/:id` — incl. generated visits summary (done/upcoming counts)
- `POST /contracts` · `PATCH /contracts/:id` (draft only)
- `POST /contracts/:id/activate` — validates range/frequency, generates visits
- `POST /contracts/:id/cancel` `{ reason }` — cancels remaining scheduled visits
- `GET /customers/:id/contracts` — customer-view card

## 4. Pages & components

- `contracts/pages/contracts-list/` — paged table: folio/name, client, **type tag**,
  period, frequency, visits progress (`4/12 done`), amount, status pill. Filters: search,
  client, status, type. Top-level **Contracts** sidebar entry (owner/admin/office).
  Header (owner only): "Tipos de contrato" button → manage-types dialog.
- `contracts/pages/contract-form/` — create/edit draft: client select, name,
  **type select** (active `ContractTypeDef`s; footer "Add type" button, owner only —
  same in-select pattern as 09's reason-select), period (`<p-datepicker>` range),
  frequency select (custom ⇒ visitsPlanned input), default technician, equipment
  multiselect (scoped to client; hidden until 11 lands), amount, notes. Live preview
  line: "Generará 12 visitas, una cada mes aprox."
- `contracts/components/manage-contract-types-dialog/` — owner-only (§2ᵃ): list of all
  types (incl. inactive, muted) with inline label rename + active toggle + add row. No
  delete anywhere.
- `contracts/pages/contract-view/` — detail card + **generated visits table** (date,
  tech, status — links into calendar/visit dialog), progress bar (done/planned),
  activate / cancel / duplicate-as-new actions per role.
- `contracts/components/activate-contract-dialog/` — confirm-heavy shape-3: restates
  period/frequency/visit count before generating.
- `contracts/components/cancel-contract-dialog/` — reason required; states how many
  scheduled visits will be cancelled.
- Customer-view **Contracts card** (06 slot — ask): active contract(s) + progress.

## 5. State

- `ContractsState`: `list`, `total`, `loading`, `selected`, `filters`, `types`. Actions:
  `LoadContracts(query)`, `LoadContract(id)`, `CreateContract`, `UpdateContract`,
  `ActivateContract(id)`, `CancelContract(id, reason)`, `LoadContractTypes(all?)`,
  `CreateContractType(label)`, `UpdateContractType(id, {label?, active?})`.
- `src/http/contracts.service.ts`.

---

## Checkpoints

### CP-1 — Contract documents
- [ ] DTOs (incl. `ContractTypeDef`) + service + `ContractsState`
- [ ] List page + filters (incl. type) + status pills; **Contracts** sidebar entry
- [ ] Form (draft create/edit) with type select + generation preview line

### CP-2 — Lifecycle + generation
- [ ] Activate dialog → visits appear in calendar (12) with `contractId` backlink
- [ ] Cancel dialog (reason, remaining-visits warning)
- [ ] Contract view with visits table + progress

### CP-3 — Integration + polish
- [ ] Manage-types dialog (owner-only) + "Add type" in-select flow; deactivated type
      still renders on an existing contract
- [ ] Customer-view contracts card (06 slot)
- [ ] Role gating per §2 (office sees no activate/cancel; only owner sees type
      management); route `data` declared
- [ ] Dark-mode audit; empty states; build green; manual pass: draft (office) →
      activate (admin) → 12 visits in calendar → cancel → remaining visits cancelled

## Open decisions / asks
- Billing integration (auto-draft a bill per contract period, or bill-by-report against
  contract visits) — **deferred**; v1 `amount` is informational. Revisit with 05 once
  both are live.
- Expiry: backend cron flips `active → expired` at `endDate` — same infra question as
  12's missed-sweep; until then render "expired" derived client-side from `endDate`.
- Visit generation timing: all upfront on activation (assumed, simple) vs rolling
  (generate next N) — backend call; upfront is fine for ≤1yr contracts.
- Contract PDF (printable póliza for the client to sign) — later; pairs with the pdf
  module (backend) when whitelabel PDF customization lands.
- Ask to 06: contracts card slot on customer-view.
- Config flag: rides `scheduling` with 12 (tentative — 10 open item).
- Contract-type management owner-only vs owner+admin (§2ᵃ) — decided owner-only
  2026-07-05; revisit for parity with WMS reasons if it chafes.
- Seed labels (`preventivo`/`correctivo`/`mixto`) — sanity-check with a real tenant.
- v2: behavior-bearing types (e.g. a type that implies frequency or a visit checklist
  template) — keep types purely descriptive until then.
