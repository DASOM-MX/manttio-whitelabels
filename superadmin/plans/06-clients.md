# 06 — Clients (directory + Mexican invoicing info)

> **Status:** not-started · **Depends on:** 02 (CP-3)
> **Owner:** — · **Last updated:** 2026-07-05

The tenant's client directory. This **is** the product's existing `customers` resource
(master plan §4: UI says "client", code says `customers`), extended with **basic Mexican
fiscal (CFDI 4.0) data** for billing, and with CRM fields (status/source/blacklist/
follow-up date) whose *UI* belongs to module 07 — the customer-field data model is defined
here once (07's own `Interaction` entity is defined there).

---

## 1. Data model (DTO view)

```
Customer {
  id, name,                              // display/commercial name
  contactName?, email?, phone?, address?,   // primary contact (quick-action target)
  contacts: CustomerContact[],           // additional people (B2B: facility mgr, AP, owner)
  tags: string[],                        // free-form segmentation chips
  // ---- CRM fields (UI in module 07) ----
  status: 'active' | 'lead' | 'disabled' | 'blacklisted',
  source: 'facebook' | 'google' | 'referral' | 'website' | 'phonecall'
        | 'personal_meeting' | 'other',
  referredByCustomerId?,                 // set when source = 'referral'
  blacklistReason?,                      // required when status = 'blacklisted'
  nextFollowUpAt?,                       // follow-up date (07 §3) — no task system in v1
  // ---- fiscal (CFDI 4.0 basics) ----
  fiscal?: CustomerFiscal,
  createdAt, updatedAt, deletedAt?
}
CustomerContact { id?, name, role?, phone?, email? }
CustomerFiscal {
  rfc,                                   // 12 (moral) / 13 (física) chars
  legalName,                             // razón social, uppercase, no régimen suffix
  taxRegimeCode,                         // SAT c_RegimenFiscal (e.g. '601', '612', '626')
  fiscalZip,                             // CP del domicilio fiscal, 5 digits
  cfdiUseCode,                           // SAT c_UsoCFDI (e.g. 'G03', 'P01')
  billingEmail?
}
```

- SAT catalogs (`c_RegimenFiscal`, `c_UsoCFDI`): ship as **static constant option lists**
  in `data/dtos/customers/sat-catalogs.ts` (code + label) — no runtime catalog service in
  v1. Only the common subset (~10 regimes, ~5 uses); full catalogs when CFDI stamping
  lands.
- Validators (in `src/app/validators/`): `rfcValidator` (moral/física pattern, uppercase),
  `fiscalZipValidator` (5 digits). Fiscal group is **optional as a whole** but
  all-or-nothing required once any fiscal field is filled (cross-field validator).

## 2. Expected API surface

- `GET /customers?page&limit&search&status&source` → paged
- `GET /customers/:id`
- `POST /customers` · `PATCH /customers/:id` (fiscal nested or flattened — mirror backend)
- `DELETE /customers/:id` with `{ deleteComment }` (soft)
- Status transitions may get a dedicated endpoint (see 07) — confirm with backend.

## 3. Pages & components

- `customers/pages/customers-list/` — lazy table: name, contact, status pill, source tag,
  tags chips, RFC (or "—"), created. Filters: search, status, source, tags
  (`<p-multiselect>` over the tenant's existing tag set). Row: view/edit, delete.
- `customers/pages/customer-form/` — add/edit, three `.card-section`s:
  **General** (name, primary contact/email/phone, address, tags chips input —
  free-text with autocomplete on existing tags), **Contactos** (repeater rows:
  name/role/phone/email, add/remove — primary stays in General) and
  **Datos fiscales** (RFC, razón social, régimen `<p-select>`, CP fiscal, uso CFDI
  `<p-select>`, billing email) with the all-or-nothing rule surfaced inline.
  CRM fields (status/source) appear on the form as plain selects; when
  `source = 'referral'` a **"Referred by" client select** appears (searchable, excludes
  self). The richer flows (blacklist with reason, status views) are 07's.
- `customers/pages/customer-view/` — detail topped by a **client 360 header**: status
  pill, tags, quick-contact actions (07 §2.1), and a summary strip — last service date,
  total jobs, total billed, open follow-up. The report/billing figures are composed from
  04/05 data and render "—" until those modules land (same placeholder philosophy, but
  the strip itself ships now). Below: general card (incl. contacts list + "referred by" /
  "referred N clients" links), fiscal card, and reserved sections for **CRM** (07: status
  card + activity timeline) and **Bills** (05). Same placeholder-slot convention as 04.
- `customers/components/delete-customer-dialog/` — shape-3, audit comment.

## 4. State

- `CustomersState`: `list`, `total`, `loading`, `selected`, `filters`. Actions:
  `LoadCustomers(query)`, `LoadCustomer(id)`, `CreateCustomer`, `UpdateCustomer`,
  `DeleteCustomer(id, comment)`.
- `src/http/customers.service.ts`.

---

## Checkpoints

### CP-1 — Data model + read path *(gate for 05 and 07)*
- [ ] DTOs incl. `CustomerFiscal`, `CustomerContact`, tags, referredBy + SAT catalog
      constants + validators
- [ ] Service + `CustomersState` (list/detail)
- [ ] List page with filters (incl. tags) + status/source pills + tag chips
- [ ] Route + sidebar entry live

### CP-2 — Write path
- [ ] Customer form (general + contacts repeater + fiscal sections, cross-field fiscal
      rule, tags input, conditional referred-by select)
- [ ] Delete dialog + toasts
- [ ] Customer view page: 360 header (summary strip with "—" placeholders, quick-contact
      buttons wired to 07's composer once it lands) + reserved CRM/Bills slots

### CP-3 — Polish
- [ ] Referral links on view ("referred by" ↔ "referred N clients")
- [ ] Dark-mode audit; empty/loading/error states
- [ ] Build green; manual pass: create client without fiscal → add contacts + tags →
      add fiscal later → RFC validation rejects bad input → filter list by tag → delete

## Open decisions / asks
- Upstream `customers` already exists — confirm which fields are net-new columns (status,
  source, blacklistReason, nextFollowUpAt, referredByCustomerId, tags, contacts table,
  fiscal block) so the backend plan can migrate.
- Fiscal data nested object vs flat columns in API responses — mirror backend's choice.
- `source` enum: user listed facebook/google/phonecall/personal_meeting + "etc" — the list
  above adds referral/website/other; trim or extend before CP-1.
- 360 summary strip figures (`lastServiceDate`, `totalJobs`, `totalBilled`): dedicated
  `GET /customers/:id/summary` vs fields on the detail response — backend call.
- Tags: plain `text[]` on customers vs normalized tag table — backend call; UI treats
  them as strings either way.
