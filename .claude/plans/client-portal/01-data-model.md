# client-portal / 01 — Data model

> **Status:** planned (doc) · **Depends on:** — · **Feeds:** 02, 06, superadmin 26/27
> **Owner:** — · **Last updated:** 2026-08-28

Everything the portal adds to the tenant schema. Five new tables, three new enums, no
changes to any existing table's columns (the only existing-table edits are the
`notifications` type CHECK and the `schema.ts` barrel's `relations()`).

Module placement: `portal_users` / `portal_user_grants` / `portal_password_resets` belong to
a new `backend/src/modules/portal/` domain; `service_requests` / `service_request_events` /
`service_request_counters` belong to a new `backend/src/modules/service-requests/` domain.

---

## 1. `portal_users` (`modules/portal/models/portal-users.model.ts`)

A login for exactly one `customer_contacts` row (00 §3.3). Credentials never touch
`customer_contacts` — a contact is an address-book entry, and most contacts never get access.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `contact_id` | uuid not null → `customer_contacts.id` (restrict) | 1:1 among active rows |
| `customer_id` | uuid not null → `customers.id` (restrict) | Denormalized from the contact: it is the token claim and the scope of every read. Written at invite, never updated — a contact does not move between customers. |
| `email` | text not null | Login identity. Seeded from the contact at invite; **independent afterwards** (editing a contact's address must not silently change a credential). |
| `password_hash` | text not null | Same `password.service.ts` as staff users. |
| `must_change_password` | boolean not null default true | Temp-password model, mirrors `users`. |
| `status` | text `$type<PortalUserStatus>` not null default `invited` | `invited` → `active` on first successful password change; `suspended` = staff revoked access without deleting. |
| `last_login_at` | timestamptz | Shown in superadmin 26 so staff can see whether an invite was ever used. |
| `invited_by` | uuid → `users.id` (restrict) | The staff member who granted access. |
| `deleted_at` / `delete_comment` / `deleted_by` | timestamptz / text / uuid → `users.id` | Soft delete + audit, exactly the `users` posture. **No hard delete path.** |
| `created_at` / `updated_at` | timestamptz | |

Indexes:

- `uniqueIndex('portal_users_email_active_idx').on(email).where(deleted_at is null)` — the same
  partial-unique posture as `users_email_active_idx`, so a revoked account never blocks a
  re-invite. **Note the consequence of 00 §3.3:** one email = one portal account *per tenant
  database*, so a person who is a contact at two customers cannot be invited twice under the
  same address. Recorded as ask **A10** below.
- `uniqueIndex('portal_users_contact_active_idx').on(contact_id).where(deleted_at is null)`.
- `index('portal_users_customer_idx').on(customer_id)`.

Enum `PortalUserStatus` (`modules/portal/enums/portal-users.enum.ts`, string-valued TS enum
per the repo rule): `Invited = 'invited'`, `Active = 'active'`, `Suspended = 'suspended'`.

## 2. `portal_user_grants` (`modules/portal/models/portal-user-grants.model.ts`)

One row per (portal user, grant) — 00 §3.6. Rows, not columns, so adding a capability is data,
not DDL, and each grant carries its own who/when.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `portal_user_id` | uuid not null → `portal_users.id` (restrict) | |
| `grant` | text `$type<PortalGrant>` not null | |
| `granted_by` | uuid not null → `users.id` (restrict) | |
| `created_at` | timestamptz | |
| `revoked_at` / `revoked_by` | timestamptz / uuid → `users.id` | Revoking is a flip, never a DELETE (no-hard-deletes rule). The row stays as the record that access once existed. |

- `uniqueIndex('portal_user_grants_active_idx').on(portal_user_id, grant).where(revoked_at is null)`
- `index('portal_user_grants_user_idx').on(portal_user_id)`

## 3. `PortalGrant` — the proposed grant list (ask **A1**)

```
ViewReports          = 'view_reports'
ViewContracts        = 'view_contracts'
ViewQuotations       = 'view_quotations'
ViewServiceOrders    = 'view_service_orders'
ApproveQuotations    = 'approve_quotations'
CreateServiceRequests = 'create_service_requests'
```

Rules the validator enforces at grant time (not just in the UI):

- `approve_quotations` requires `view_quotations`. Approving something you cannot read is not
  a state we want to represent.
- Viewing *your own* service requests is implied by `create_service_requests` — there is no
  separate `view_service_requests` grant. A portal user with no request grant sees no request
  section at all.
- A portal user with **zero** grants can log in and change their password and sees an empty
  home with an explanatory panel. Login is not itself a grant.

## 4. `service_requests` (`modules/service-requests/models/service-requests.model.ts`)

The customer-authored problem report (00 §3.13). Deliberately **not** a quotation draft: no
lines, no quantities, no prices, no catalog exposure.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `folio` | text not null | `SOL-YYYYMMDD-NNNN`, from a `service_request_counters` upsert — same mechanism as `quotation_counters`. A customer phoning about "solicitud SOL-20260828-0007" is the point. |
| `customer_id` | uuid not null → `customers.id` (restrict) | |
| `contact_id` | uuid not null → `customer_contacts.id` (restrict) | **The audit record for "on behalf of"** (00 §3.7): the record belongs to the customer, this column says which human filed it. |
| `portal_user_id` | uuid → `portal_users.id` (restrict) | Null when staff filed it for a client who phoned in (superadmin 27 supports this). |
| `equipment_id` | uuid → `equipment.id` (restrict) | Nullable **by design**: a customer whose registry is empty must still be able to ask for service. The portal form requires a selection whenever the registry is non-empty, and offers "no aparece mi equipo" otherwise. See ask **A9**. |
| `description` | text not null | The behavior description — what the unit is doing. Min length enforced in the validator. |
| `evidence` | text[] not null default `'{}'` | Up to 3 image URLs, same convention and cap as `equipment.photos`. Bucket per ask **A5**. |
| `status` | text `$type<ServiceRequestStatus>` not null default `submitted` | |
| `quotation_id` | uuid → `quotations.id` (restrict) | Set when staff approve (00 §3.14). The link is one-way from here; the quotation does not carry a request FK. |
| `created_at` / `updated_at` | timestamptz | |

**No `deleted_at`.** A request is never removed — `rejected` is the closing state, and the
event trail is the record. (Same posture as `customer_interactions`.)

Indexes: `(customer_id, created_at)` for the portal list; `(status, created_at)` for the staff
triage queue; `(equipment_id)` for the per-unit history in module 11.

Enum `ServiceRequestStatus`:

```
Submitted = 'submitted'   // filed, untouched by staff
InReview  = 'in_review'   // a staff member picked it up
NeedsInfo = 'needs_info'  // staff asked the contact something; ball is in the client's court
Approved  = 'approved'    // terminal — quotation_id is set
Rejected  = 'rejected'    // terminal — reason required, lives in the event note
```

Transitions (enforced server-side, not just in the UI):
`submitted → in_review | rejected` · `in_review → needs_info | approved | rejected` ·
`needs_info → in_review` (the contact answering moves it back) · `approved`/`rejected` terminal.

## 5. `service_request_events`

Modelled on `quotation_events` line for line — same append-only contract, same attribution
split (00 §3.11: portal actions reuse existing per-entity timelines, and a request's timeline
*is* one).

| Column | Type | Notes |
|---|---|---|
| `seq` | bigserial | Insertion order, the only sort key — same reasoning as `quotation_events.seq` (batched writes share a timestamp). |
| `id` | uuid pk | |
| `service_request_id` | uuid not null → `service_requests.id` (restrict) | |
| `type` | text `$type<ServiceRequestEventType>` not null | |
| `actor_id` | uuid → `users.id` (restrict) | Staff action. |
| `contact_id` | uuid → `customer_contacts.id` (restrict) | Portal action. **Never both set** — same invariant as `quotation_events`. |
| `changes` | jsonb | Per-type detail. |
| `note` | text | The mandatory reject reason, the info question, the client's answer. |
| `created_at` | timestamptz | |

`ServiceRequestEventType`: `created`, `evidence_added`, `taken_for_review`, `info_requested`,
`info_provided`, `approved`, `rejected`, `quotation_linked`.

Every row is written **inside the transaction that made the change it describes** — a status
change without its event is not a reachable state.

## 6. `portal_password_resets` (`modules/portal/models/portal-password-resets.model.ts`)

Backs the self-service half of 00 §3.5.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `portal_user_id` | uuid not null → `portal_users.id` (restrict) | |
| `token_hash` | text not null | **Hash, never the token.** A DB leak must not hand over live reset links. |
| `expires_at` | timestamptz not null | Proposed TTL 1h — ask **A3**. |
| `used_at` | timestamptz | Single use; a consumed row is kept, not deleted. |
| `created_at` | timestamptz | |

`uniqueIndex` on `token_hash`; `index` on `(portal_user_id, created_at)` for the rate check.

## 7. Wiring + migrations

- `modules/database/schema.ts` re-exports all five tables and holds their `relations()`:
  `portalUsers → customerContacts | customers | grants | resets`,
  `serviceRequests → customers | customerContacts | equipment | quotations | events`.
- `notifications` type CHECK grows the new members (additive DDL, per the notifications plan's
  own convention) — see `06-service-requests.md` §5 for the list.
- Migrations are **generated** (`pnpm db:generate`), never hand-applied DDL, and their
  `when` timestamp must be newer than the newest row in `__drizzle_migrations` or drizzle-kit
  silently skips them. Applying them against the live Neon DB stays a human's call.

## 8. Checkpoints

- [ ] **CP-1** — `portal_users`, `portal_user_grants`, `portal_password_resets`, enums,
      relations, generated migration, repository read helpers filtering `deleted_at`.
- [ ] **CP-2** — `service_requests`, `service_request_events`, `service_request_counters`,
      enums, relations, generated migration, transition guard unit-tested.
- [ ] **CP-3** — notifications CHECK extension + `NotificationType` members.

## 9. Asks raised here

- **A9** — `equipment_id` nullable (customer with an empty registry). Confirm the fallback copy
  and whether staff must attach an equipment record before approving.
- **A10** — one email = one portal account per tenant DB. Accept, or scope the unique index to
  `(customer_id, email)` so the same person can hold two accounts at two customers?
