# client-portal / 01 — Data model

> **Status:** planned (doc) · **Depends on:** — · **Feeds:** 02, 06, superadmin 26/27
> **Owner:** — · **Last updated:** 2026-08-31

Everything the portal adds to the tenant schema. Eight new tables, six new enums, and **three
changes to existing tables** — `quotations.service_request_id` (00 §4b.18), a **unique email
index on `customer_contacts`** (§0, A16), and a new **`QuotationEventType` member** for audited
downloads (§6c, 00 §4b.23). The remaining existing-table edits are the `notifications` type
CHECK and the `schema.ts` barrel's `relations()`.

---

## 0. `customer_contacts.email` becomes unique (A16, owner 2026-08-31)

**"Contacts MUST be unique per email."** This is a change to module 07's table, made because the
portal needs it: email is the login identity, so a lookup by email has to return one row.

```
uniqueIndex('customer_contacts_email_uidx').on(email)
```

- `email` is **nullable** and stays nullable — Postgres allows any number of NULLs under a
  unique index, so contacts without an address are unaffected.
- **This supersedes 00 §3.3's "the same email invited at two customers is two separate
  accounts."** One email = one contact = one portal account, tenant-wide. A person who works for
  two of the tenant's customers needs two addresses, or is a contact at one of them.
- `portal_users.email` therefore returns to a **partial-unique** index (§1), and the login
  lookup is unambiguous.

A tenant database is provisioned **from** the migrations, so the index is in place before the
first contact row exists and there is nothing to reconcile. The only database with data today is
the shared test one; a one-off script blanks any duplicate address there (`SET email = NULL`,
never a row delete — `email` is nullable and this repo does not hard-delete) before the
migration is applied.

~~`customer_contacts` has **no `deleted_at`** today, so the index is absolute rather than
partial.~~ **Superseded 2026-09-01 (owner):** `customer_contacts` now has `deleted_at`, and this
index is partial — `.where(sql\`deleted_at is null\`)` — exactly as this paragraph required of
any change that introduced soft delete. `customer_contacts_one_default_idx` gained the same
clause, or a tombstoned default would hold its customer's default slot forever.

The move also fixed a live bug rather than only satisfying the no-hard-delete rule:
`updateCustomerWithRelations` replaced a customer's contacts with a **hard DELETE**, while
`quotation_recipients.contact_id` and `quotation_events.contact_id` are both
`onDelete: 'restrict'` — so editing any customer who had ever been sent a quotation raised a
foreign-key violation. Tombstoning keeps those references resolvable, so a sent quote still
renders the name it was addressed to.

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
| `contact_id` | uuid not null | 1:1 among active rows, enforced by uniqueness index. **No FK:** `updateCustomerWithRelations` deletes and re-inserts all contacts per PATCH; a restrict FK would break customer edits the moment a contact has a portal user. A portal user is created from a contact and is standalone thereafter — the pointer can go stale if the customer's contacts are later replaced (owner 2026-08-31, decision 26). The email column, independent since invite, is the live identity. |
| `customer_id` | uuid not null → `customers.id` (restrict) | Denormalized from the contact: it is the token claim and the scope of every read. Written at invite, never updated — a contact does not move between customers. |
| `email` | text not null | Login identity. Seeded from the contact at invite; **independent afterwards** (editing a contact's address must not silently change a credential). |
| `password_hash` | text not null | Same `password.service.ts` as staff users. |
| `must_change_password` | boolean not null default true | Temp-password model, mirrors `users`. |
| `status` | text `$type<PortalUserStatus>` not null default `invited` | `invited` → `active` on first successful password change; `suspended` = staff revoked access without deleting. |
| `name` | text not null | Personal name, mirrors the `users` table for consistency when superadmin lists show staff and portal users together. Seeded from the `customer_contacts` row at invite but becomes independent thereafter — editing a contact's details does not change the portal user's name. |
| `paternal_last_name` | text | Mexican two-surname convention: mirrors `users.paternalLastName` (owner ask, 2026-07-21) so superadmin renders both with the same name format. Nullable because it is free input at invite time. |
| `maternal_last_name` | text | Second surname for the Mexican convention. Nullable. |
| `role` | text | Job title from the customer's own organisation (e.g. "Gerente de mantenimiento", "Jefe de planta"), **not a permission.** Free text, deliberately unconstrained — `is_admin` (below) is the actual capability. This is an exception to the module's usual real-TS-enum rule; role here is descriptive data only and must stay flexible to customer organisational structures. Seeded from `customer_contacts` but independent thereafter. |
| `is_admin` | boolean not null default false | **A6 / 00 §4b.17.** The customer's own administrator. Confers exactly one power today: **closing a service request** (§4). Not a grant row — grants say what you may do with records, this says who speaks for the customer. Set at invite and editable in superadmin 26. |
| `failed_login_attempts` | integer not null default 0 | **A3.** Reset to 0 on any successful login. |
| `locked_until` | timestamptz | **A3.** Set to `now() + 2h` when `failed_login_attempts` reaches **5**; login refuses while it is in the future, with the same generic body as a wrong password (02 §2). State lives here, not in memory — a Worker isolate has none to share (00 §4b.19). |
| `last_login_at` | timestamptz | Shown in superadmin 26 so staff can see whether an invite was ever used. |
| `invited_by` | uuid → `users.id` (restrict) | The staff member who granted access. |
| `deleted_at` / `delete_comment` / `deleted_by` | timestamptz / text / uuid → `users.id` | Soft delete + audit, exactly the `users` posture. **No hard delete path.** |
| `created_at` / `updated_at` | timestamptz | |

Indexes:

- `uniqueIndex('portal_users_contact_active_idx').on(contact_id).where(deleted_at is null)` —
  **the uniqueness rule (A10): one account per customer contact.** A revoked account never
  blocks a re-invite of the same contact.
- `uniqueIndex('portal_users_email_active_idx').on(email).where(deleted_at is null)` — same
  partial-unique posture as `users_email_active_idx`, so a revoked account never blocks a
  re-invite. **A16 (2026-08-31) makes this sound:** contacts are unique per email (§0), so one
  address maps to one account and the login lookup returns one row.
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

## 3. `PortalGrant` — the grant list (accepted as proposed, A1)

```
ViewReports           = 'view_reports'
ViewContracts         = 'view_contracts'
ViewQuotations        = 'view_quotations'
ViewServiceOrders     = 'view_service_orders'
ViewEquipment         = 'view_equipment'
ApproveQuotations     = 'approve_quotations'
CreateServiceRequests = 'create_service_requests'
```

**Seven grants.** The list was accepted at six on 2026-08-30 (A1); `view_equipment` was added on
2026-08-31 when A8's follow-up settled that *"users with no request permission can still see
equipment, if permission is granted"* — the registry is a readable section in its own right, not
a side effect of being allowed to file requests.

`is_admin` is **not** in this list and is not a grant — it is a column on `portal_users`
(§1, 00 §4b.17).

Rules the validator enforces at grant time (not just in the UI):

- `approve_quotations` requires `view_quotations`. Approving something you cannot read is not
  a state we want to represent.
- Viewing *your own* service requests is implied by `create_service_requests` — there is no
  separate `view_service_requests` grant. A portal user with no request grant sees no request
  section at all.
- **`create_service_requests` implies read access to the equipment picker, but not the Equipos
  section.** `GET /portal/equipment` accepts *either* grant; the nav item and the browsable
  section need `view_equipment`. A filer without it picks their unit from a list they cannot
  otherwise browse — which is exactly the distinction the two grants exist to draw.
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
| `equipment_id` | uuid → `equipment.id` (restrict) | Nullable, **confirmed (A9)**: the unit may simply never have been registered, and that must not block the request. The portal form offers the registry and an explicit "no aparece mi equipo" escape. Staff may create the equipment record **from the request view** and attach it later (A17) — the column is set on attach, never required to move the request forward. |
| `description` | text not null | The behavior description — what the unit is doing. Min length enforced in the validator. |
| `evidence` | text[] not null default `'{}'` | Up to 3 image URLs, same convention and cap as `equipment.photos`. Bucket **`manttio-customer-report`** (A5) — its own bucket with its own lifecycle, never the equipment one. |
| `status` | text `$type<ServiceRequestStatus>` not null default `submitted` | |
| `quotation_id` | uuid → `quotations.id` (restrict) | **Added 2026-09-01 (owner).** Backtrack to the quotation this request produced; null until one is issued. The full set stays on `quotations.service_request_id` (§6b). |
| `closed_at` | timestamptz | Set when the customer's portal admin closes it (A6). |
| `closed_by_portal_user_id` | uuid → `portal_users.id` (restrict) | Who closed it. Always a portal user with `is_admin` — staff have no close action. |
| `created_at` / `updated_at` | timestamptz | |

~~**There is no `quotation_id` column.** The link lives on the quotation
(`quotations.service_request_id`, §6b) because one request may spawn several quotations over its
life — 00 §4b decision 18.~~ **Superseded 2026-09-01 (owner):** the request carries a nullable
`quotation_id` → `quotations.id` (restrict) as a **backtrack**. It does not replace §6b — the
one-to-many set still hangs off `quotations.service_request_id`; this column answers the single
question the request view asks, "what came of this?", without a join.

**No `deleted_at`.** A request is never removed — `rejected` and `closed` are its resting
states, and the event trail is the record. (Same posture as `customer_interactions`.)

Indexes: `(customer_id, created_at)` for the portal list; `(status, created_at)` for the staff
triage queue; `(equipment_id)` for the per-unit history in module 11.

Enum `ServiceRequestStatus`:

```
Submitted = 'submitted'   // filed, untouched by staff
InReview  = 'in_review'   // a staff member picked it up
NeedsInfo = 'needs_info'  // staff asked the contact something; ball is in the client's court
Approved  = 'approved'    // staff accepted it and quoted — NOT terminal (A6)
Rejected  = 'rejected'    // terminal (staff) — reason required, lives in the event note
Closed    = 'closed'      // terminal (portal admin only) — the customer says it is done
```

Transitions (enforced server-side, not just in the UI):

- `submitted → in_review | rejected`
- `in_review → needs_info | approved | rejected`
- `needs_info → in_review` (the contact answering moves it back)
- **`approved` stays open.** A6: a declined quotation does not reopen or close anything — staff
  simply issue another quotation against the same request. `approved` means "accepted and being
  quoted", and it can hold several quotations in sequence.
- **`* → closed` is a portal action, available only to a portal user with `is_admin`**, from any
  non-terminal state (including `submitted` — a customer withdrawing their own request) and
  from `approved`. Staff have no close transition; `rejected` remains their only terminal move.
- `rejected` / `closed` are terminal.

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
| `portal_user_id` | uuid → `portal_users.id` (restrict) | Portal action. **Never both set** — same invariant as `quotation_events`. **Changed 2026-09-01 (owner):** was `contact_id → customer_contacts.id`. Only a login can write to this timeline, and `portal_users.contact_id` still resolves the address-book entry — so attribution loses nothing and stops depending on a contacts list that `updateCustomerWithRelations` replaces wholesale. |
| `changes` | jsonb | Per-type detail. |
| `note` | text | The mandatory reject reason, the info question, the client's answer. |
| `created_at` | timestamptz | |

`ServiceRequestEventType`: `created`, `evidence_added`, `taken_for_review`, `info_requested`,
`info_provided`, `approved`, `rejected`, `quotation_linked`, **`closed`** (portal admin, A6).
`quotation_linked` is written **once per quotation** attached to the request, so the trail shows
the v1-declined → v2-issued sequence without a status change to carry it.

Every row is written **inside the transaction that made the change it describes** — a status
change without its event is not a reachable state.

## 6. `portal_password_resets` (`modules/portal/models/portal-password-resets.model.ts`)

Backs the self-service half of 00 §3.5.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `portal_user_id` | uuid not null → `portal_users.id` (restrict) | |
| `token_hash` | text not null | **Hash, never the token.** A DB leak must not hand over live reset links. |
| `expires_at` | timestamptz not null | TTL 1h. |
| `used_at` | timestamptz | Single use; a consumed row is kept, not deleted. |
| `created_at` | timestamptz | |

`uniqueIndex` on `token_hash`; `index` on `(portal_user_id, created_at)` for the rate check.

## 6b. `quotations.service_request_id` — the one existing-table column

An additive nullable column on `quotations`, `→ service_requests.id` (restrict), plus
`index('quotations_service_request_idx')`. Set by the approval transaction (06 §4) and by any
later quotation staff issue against the same request.

It is declared **in SQL only**, exactly like `quotations.serviceOrderId`: declaring both sides
in Drizzle would make the two model files import each other. Models stay acyclic.

**Correction 2026-09-01:** a `relations()` entry cannot carry this join either — Drizzle needs the
column on the `quotations` model to infer it, so a `many(quotations)` on `serviceRequests` throws
the moment it is used in a `with:`. CP-2 shipped exactly that dangling entry and it is now removed;
the barrel carries `quotation: one(quotations)` off the new `service_requests.quotation_id` (§4)
instead. Reads that need *all* quotations for a request use an explicit `where` on the SQL-only
column, the same way `serviceOrderId` is read today.

Nothing about the quotation flow changes because of it (20 stays untouched) — it is a backlink,
never a branch in that module's logic.

## 6c. `QuotationEventType.Downloaded` — the download trail's one settled leg

Portal downloads are audited on the timeline of the record they came from (00 §4b.23,
04 §2b). Quotations already have that timeline, so the whole change here is one enum member
and the row the download route writes:

```
Downloaded = 'quotation_downloaded'
```

- **No DDL.** `quotation_events.type` is unconstrained `text` — the enum is the contract, the
  same posture `QuotationStatus` already takes on `quotations.status`. Nothing to generate.
- Written with `contactId` set and `actorId` null, like every other client-origin row on that
  table, and `refKind` null — the event is about the quotation itself. `changes` carries
  `{ via: 'portal' }`, the same marker 05 §2 puts on portal-originated responses — the token
  page has its own `…/:token/pdf` route, and if it is ever trailed too the two must not be
  indistinguishable.
- **Deliberately not `Viewed`.** That member means "the emailed token page was opened, first
  view per recipient": a different subject, a different act, and counted differently (viewed is
  once, downloaded is every time). Folding them together would make the trail unreadable at
  exactly the moment someone needs to read it.
- Superadmin's quotation timeline (20 §5) gains a label for the member. The addition is
  additive; nothing else in 20 changes.

The other two download routes get timelines of their own — §6d.

## 6d. `report_events` + `contract_events` — the other two timelines (A18, owner 2026-08-31)

**"Contracts and reports MUST have events tables too."** Two new append-only tables, modelled
column-for-column on `quotation_events`, so all three download routes write to the timeline of
the record they served.

| Column | `report_events` | `contract_events` |
|---|---|---|
| `seq` | bigserial — insertion order, the only sort key | same |
| `id` | uuid pk | uuid pk |
| entity FK | `report_id` **text** not null → `reports.id` (restrict) | `contract_id` uuid not null → `contracts.id` (restrict) |
| `type` | text `$type<ReportEventType>` not null | text `$type<ContractEventType>` not null |
| `actor_id` | uuid → `users.id` (restrict) — staff action | same |
| `contact_id` | uuid → `customer_contacts.id` (restrict) — portal action, **never both set** | same |
| `changes` | jsonb, per-type detail | same |
| `note` | text | same |
| `created_at` | timestamptz | same |

- `report_events.report_id` is **`text`, not `uuid`** — `reports.id` is the `R-YYYYMMDD-NNNN`
  folio, which is also why `service_order_events.refId` is text.
- Index each on `(entity_id, seq)`. A timeline is only ever read as "this record, in insertion
  order", the same single read shape `quotation_events` has.
- Enums live in the existing per-module enum files (`reports/enums/reports.enum.ts`,
  `contracts/enums/contracts.enum.ts`), the way `ServiceOrderEventType` lives in
  `service-orders.enum.ts`. **One member each:**

```
ReportEventType.Downloaded   = 'report_downloaded'
ContractEventType.Downloaded = 'contract_downloaded'
```

  The tables are the home for those modules' future audit — a report mailed, a contract's file
  replaced — but this suite adds only the member it needs. Speculative members are how an enum
  stops describing anything.
- Both rows carry `changes: { via: 'portal' }`, exactly as §6c's does.
- **These are new tables, so real DDL** — generated, in CP-5.

### What this supersedes, and what it does not

13 §3 decided (2026-07-24, and CP-1 built it) that contracts have **no per-contract audit
table**: every contract event appends to the customer's interaction timeline instead.
`contract_events` **supersedes that clause and nothing else.** The pattern it moves to already
exists in this codebase — service orders and quotations each run *both* trails, complementary
by design ("what happened with this client" vs "what happened on this job", as
`InteractionRefKind.ServiceOrder`'s own comment puts it). Contracts now do the same.

Deliberately conservative about the rest:

- **Nothing shipped changes.** Contract create / metadata update / file replace / soft delete
  keep writing their `customer_interactions` entries exactly as 13 CP-1 built them, and
  `GET /customers/:id/interactions?refKind=contract&refId=…` keeps answering the same way.
- **The new tables start life carrying downloads only.** Whether 13's existing contract audit
  entries should *move* into `contract_events` is that module's call, not something this suite
  does on the way past.
- **A download writes the entity timeline only** — no complementary `customer_interactions`
  entry. A download is not a commercial touch with the client, and one row per fetch would
  bury the client 360 under the noise it exists to keep out.
- `InteractionRefKind.Contract`'s doc comment ("Contracts have **no** audit table of their
  own") goes stale the day this lands, and is corrected in the same checkpoint.

## 7. Wiring + migrations

- `modules/database/schema.ts` re-exports all eight tables and holds their `relations()`
  (`reportEvents → reports | users | customerContacts`, `contractEvents → contracts | users |
  customerContacts`, plus):
  `portalUsers → customerContacts | customers | grants | resets`,
  `serviceRequests → customers | customerContacts | equipment | quotation | events | closedBy`,
  `serviceRequestEvents → serviceRequests | users | portalUsers`.
- `notifications` type CHECK grows the new members (additive DDL, per the notifications plan's
  own convention) — see `06-service-requests.md` §5 for the list.
- Migrations are **generated** (`pnpm db:generate`), never hand-applied DDL, and their
  `when` timestamp must be newer than the newest row in `__drizzle_migrations` or drizzle-kit
  silently skips them. Applying them against the live Neon DB stays a human's call.

## 8. Checkpoints

- [ ] **CP-1** — the `customer_contacts` unique email index (§0), `portal_users` (incl.
      `is_admin` + the lockout pair), `portal_user_grants`,
      `portal_password_resets`, enums, relations, generated migration, repository read helpers
      filtering `deleted_at`.
- [ ] **CP-2** — `service_requests`, `service_request_events`, `service_request_counters`,
      enums, relations, generated migration, transition guard unit-tested **including
      `approved` being non-terminal and `closed` being reachable only with `is_admin`**.
- [ ] **CP-3** — `quotations.service_request_id` + index (§6b), in its own migration so the
      existing-table change is reviewable apart from the six new tables.
- [ ] **CP-4** — notifications CHECK extension + `NotificationType` members.
- [ ] **CP-5** — the download trail: `QuotationEventType.Downloaded` (§6c, code-only),
      `report_events` + `contract_events` with their one-member enums and a generated
      migration (§6d), the write on all three download routes, and the corrected
      `InteractionRefKind.Contract` doc comment.

## 9. Asks

Resolved 2026-08-30: **A5** (bucket `manttio-customer-report`), **A6** (link on the quotation,
`closed` by portal admin), **A9** (`equipment_id` stays nullable), **A10** (uniqueness is
`contact_id`).

Resolved 2026-08-31: **A16** — contacts are unique per email (§0), so `portal_users.email`
is partial-unique again and login is unambiguous. **A17** — staff may create the equipment
record from the request view; attaching one is never a precondition for approving.

**A18 resolved 2026-08-31:** reports and contracts get event tables of their own (§6d), so all
three audited download routes write to the timeline of the record they served.

None open. See 00 §4 and §6.
