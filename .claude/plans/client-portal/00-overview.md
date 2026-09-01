# client-portal / 00 — Portal de clientes suite overview

> **Status:** planned (doc) · **Depends on:** 06 reports, 07 clients, 11 equipment, 13 contracts, 19 service-orders, 20 quotations
> **Owner:** — · **Last updated:** 2026-08-31

The **Portal de clientes** is the product's fourth deployable app: a logged-in **end customer**
(a contact of a tenant's customer) sees the records their tenant produced for them — reports,
contracts, quotations, service orders — approves quotations, and raises **service requests**
that staff turn into quotations.

System map: **[this] client-portal** → whitelabeled backend (`/portal/*`, portal-user auth)
→ same tenant DB the superadmin and field app read.

This is **not** a superadmin module. It is a separate app with a separate auth surface, and it
gets its own plan suite. Two *staff-facing* surfaces it needs do live in the superadmin suite:
`../superadmin/26-portal-access.md` (invites + grants) and
`../superadmin/27-service-requests.md` (triage).

---

## 1. Sub-plans

| # | File | Scope | Depends on |
|---|---|---|---|
| 00 | `00-overview.md` | This file — index, invariants, decisions ledger, asks | — |
| 01 | `01-data-model.md` | Backend: `portal_users`, `portal_user_grants`, `service_requests` (+ events), enums, relations, migrations | — |
| 02 | `02-auth-surface.md` | Backend: the `/portal/*` surface — login, me, password, reset, grant guard, invite flow | 01 |
| 03 | `03-app-shell.md` | `client-portal/` app: scaffold, stack, layout reuse, routing, theming, NGXS/HTTP plumbing | 02 shapes |
| 04 | `04-read-surfaces.md` | The read sections: reports, contracts, quotations, service orders, equipment (+ PDF downloads) | 02, 03 |
| 05 | `05-quotation-approval.md` | In-portal approve/decline, coexisting with the emailed token page | 04 |
| 06 | `06-service-requests.md` | The new `service-requests/` backend module + the portal's request flow | 01, 03; feeds 27 |

**Build order:** 01 → 02 backend-side; 03 starts against mocked services as soon as 02 fixes
the shapes (superadmin master plan §2 rule 5). Then 04 → 05 in the portal, with 06 running in
parallel once 01 lands. The superadmin legs (26, 27) can start after 01/02: 26 gates the whole
portal (nobody can log in until staff can invite), so **26 ships before the portal is usable**.

**PR granularity:** one PR per checkpoint, stacked, base `main`. Branch naming
`feature/client-portal-<slice>` for portal app work, `feature/backend-portal-<slice>` for the
backend surface, `feature/superadmin-<slice>` for 26/27; `fullstack` prefix when a PR spans
both. Commit prefixes `feat(client-portal)` / `feat(backend)` / `feat(superadmin)`.

## 2. Binding invariants

Inherited from the repo and the superadmin suite — do not relitigate:

- **No hard deletes, ever** (fork rule). Revoking portal access is a soft delete /
  status flip on `portal_users`, never a row removal. Read helpers filter `isNull(deletedAt)`.
- **Event tables are append-only.** Portal actions land in the *existing* per-entity
  timelines (`quotation_events`, `service_order_events`, `service_request_events`, and now
  `report_events` + `contract_events`) — no updates, no deletes. **Since decision 23 that
  includes reads:** a file downloaded from the portal is an action, and it appends a row like
  any other.
- **One generic query envelope.** Every portal list returns `GenericQueryResponse<T>`;
  `total` is the unpaginated count, never `items.length`.
- **Gate restricted fields on the server.** A portal response omits what the contact may not
  see — internal notes, cost/margin fields, staff attribution, other customers' anything.
  Never ship-then-hide in the portal UI.
- **No brand literals.** The portal reads `/brand` at runtime like the field app: colors,
  logo, fonts, tenant name. No Peña Nevada strings, no build-time brand.
- **Spanish UI, no i18n layer** — same as the rest of the product.

## 3. Decisions (owner, 2026-08-28 — the planning interview for this suite)

1. **Own app, `client-portal/`.** Not a section of superadmin or the field app. **One
   Cloudflare Worker per tenant** (Workers Static Assets, `apiUrl` from `GET /__config` at
   boot) — the topology `../superadmin/25-runtime-config.md` settled on 2026-08-28, which the
   portal is scaffolded onto directly rather than migrated to later. (§ `03-app-shell.md`)
2. **Stack mirrors superadmin** — Angular standalone zoneless + NGXS + PrimeNG Aura + Tailwind,
   and it **reuses the superadmin `AuthenticatedLayout`** (owner, same day): same shell, same
   sidebar/topbar behaviour, portal nav items.
3. **Identity: `portal_users`, 1:1 with a `customer_contacts` row.** Credentials do **not** go
   on `customer_contacts` and portal users are **not** rows in `users`. `customerId` is fixed
   per token and there is no customer switcher.
   ~~The same email invited at two customers is two separate accounts.~~
   **Superseded 2026-08-31 (§4 A16): contacts are unique per email tenant-wide**, so one address
   is one contact is one account. A person working for two of the tenant's customers needs two
   addresses. (§ `01-data-model.md` §0)
4. **Staff invite only.** No public signup, no self-registration route. Staff flip a contact to
   portal access in superadmin (plan 26); the backend mails a temp password and sets
   `mustChangePassword`, exactly like the users module.
5. **Password recovery: both paths.** A public self-service reset (one-time token mailed to the
   contact) *and* a staff-issued reset in superadmin.
6. **Grants live in `portal_user_grants` rows** — one row per (portal user, grant). Extensible
   without a migration and auditable per grant. The portal guard checks grants per request.
7. **Visibility is grant-gated, not record-linked.** Reports, contracts and service orders carry
   no contact FK today and none is added: within a granted section a portal user sees all of
   *their customer's* records. Anything the portal creates is created **on behalf of the
   customer, with an audit record naming the contact.**
8. **Separate `/portal/*` auth surface** — own login/me/password routes, own middleware, own
   JWT secret, token carrying `{ sub: portalUserId, customerId, type: 'portal' }`. A portal
   token cannot reach a staff endpoint by construction, and vice-versa.
9. **Portal capabilities:** read + PDF download + approve/decline quotations + create service
   requests, each gated by a grant.
10. **The emailed quotation token page stays.** `/public/quotations/:token` is not retired —
    contacts without portal access keep deciding by link. Both paths write the same
    `quotation_events` rows (`contactId` set, `actorId` null).
11. **No `portal_events` table.** Portal actions are recorded in the existing per-entity event
    tables. (Revisit only if a portal-only action ever has no entity to attach to.)
12. **Service requests are a new backend module** (`backend/src/modules/service-requests/`),
    planned here in `06-service-requests.md`. Its **staff triage UI is superadmin plan 27**;
    **portal access administration is superadmin plan 26**.
13. **A request is: equipment + behavior description + optional evidence image.** No catalog
    exposure, no quantities, no prices — the customer describes a problem, staff price it.
14. **Request lifecycle:** `submitted → in_review → (needs_info ⇄ client answers) → approved |
    rejected`. Rejection requires a reason. **Approval creates a linked draft quotation**
    pre-filled with the customer and the request's equipment/description as context; staff add
    catalog lines and prices and send it through the normal quotation flow.
    **Amended 2026-08-30 (§4 A6):** `approved` is no longer terminal — a request may carry
    several quotations over its life, and the only terminal client-side state is `closed`,
    which only a portal **admin** may set.
15. **Notifications both directions:** a new request raises a staff in-app notification through
    the existing notifications module; the contact receives transactional email (invite, reset,
    quote ready, request status changes).
16. **This branch ships plan documents only** — no implementation code.

## 4. Resolved asks (owner, 2026-08-30)

Every ask A1–A15 raised on 2026-08-28 is answered. The table is the record; each row names
where the answer is encoded.

| # | Answer | Encoded in |
|---|---|---|
| A1 | **Grant list accepted as proposed** — the six grants stand, no further splitting. **Amended 2026-08-31 to seven**, see A8. | 01 §3 |
| A2 | **Portal JWT TTL = 2 days.** No refresh endpoint; re-login on expiry. | 02 §1 |
| A3 | **5 failed logins → 2-hour cooldown** on the account. Applies to the portal login route. | 01 §1, 02 §2 |
| A4 | **Not a flag. Every tenant gets the portal** — it is part of the product's value proposition, so there is no manager-side toggle and no `module-isolation` key. | 03 §6 |
| A5 | **New bucket `manttio-customer-report`**, separate from `manttio-equipment`, with its own lifecycle. | 01 §4, 06 §2 |
| A6 | **Neither reopen nor auto-close.** A declined quotation leaves the request open; **staff create a new quotation manually**, linked by a new **`quotations.service_request_id`** FK (one request → many quotations over time). The request's terminal state is **`closed`**, and **only a portal user with `is_admin` may close it** — a new column on `portal_users`. | 01 §1, 01 §4, 06 §3–4 |
| A7 | **Only records staff deliberately released.** No draft, deleted or archived/cancelled records reach the portal, in any section. | 04 §2 |
| A8 | **Both** — equipment is its own read section *and* the picker inside the service-request form. **2026-08-31:** the section is reachable without request permission, so it gets its own grant, **`view_equipment`** (the seventh). `GET /portal/equipment` accepts either grant; only the browsable section requires `view_equipment`. | 01 §3, 04 §7, 06 §2 |
| A9 | **`equipment_id` stays nullable** — a customer may simply not have registered the unit yet, and that must not block a request. | 01 §4 |
| A10 | **One account per customer contact.** The uniqueness rule is `contact_id` — **and, since A16, the email address as well**, at the contact level. | 01 §0, 01 §1 |
| A11 | **Copy the superadmin `AuthenticatedLayout` into the new project and adapt it.** Drift between the two is accepted; no shared package. | 03 §2 |
| A12 | **Same typography as superadmin** (Figtree) — the portal reads as product chrome, not as tenant-branded surface. Colors and logo still come from `/brand`. | 03 §3 |
| A13 | **Yes — name the technician**, always. | 04 §3 |
| A14 | **Yes — name the other reviewers.** The customer sees who else was asked and how each answered. | 04 §5, 05 §3 |
| A15 | **No — priority is not exposed** to the customer. | 04 §6 |

### 4b. Decisions this created

17. **`portal_users.is_admin`** (boolean, default false) — an *identity* attribute, deliberately
    not a `portal_user_grants` row. Grants say what a portal user may **do with records**;
    `is_admin` says **who speaks for the customer**. Today it confers exactly one power —
    closing a service request — and nothing else may be attached to it without a decision here.
18. **The request↔quotation link lives on the quotation** (`quotations.service_request_id`), and
    `service_requests.quotation_id` is **dropped from the model before it is ever built**. One
    request can spawn several quotations (declined v1 → new v2), so a single column on the
    request could not hold the truth, and keeping both would let the two disagree — the same
    reasoning `QuotationEventRefKind` records for its own exclusion of `contactId`.
19. **Login lockout is state on `portal_users`** (`failed_login_attempts`, `locked_until`), not a
    KV or in-memory counter: a Worker has no shared memory between isolates, so a counter that
    is not in the database is not a counter. **Confirmed 2026-08-31** — the database is the
    source of truth for it.
20. **`customer_contacts.email` is unique tenant-wide** (A16) — a change to module 07's table,
    made because email is the portal's login identity. Tenant databases are provisioned from the
    migrations, so the index precedes their first contact row; the shared test DB gets a one-off
    dedup script before it is applied.
21. **`view_equipment` is the seventh grant** (A8 follow-up). Reading the registry and filing
    requests are different entitlements: a customer may want to see their installed base without
    being able to open tickets, and the picker inside the request form is not a licence to
    browse.
22. **The full chain is `service_request → quotation ⇄ approval/denial → service_order (0–1)`**
    (A6 confirmation, 2026-08-31). Every arrow is already built except the first: quotations
    already carry `service_order_id` with 0-or-1 cardinality, and the approval/denial loop is
    the reviewer tally. The portal adds the request at the head of the chain and nothing else —
    **no step of the existing quotation → order flow changes.**
23. **Every portal download is an audited event** (owner, 2026-08-31). A file leaving the
    portal appends a row to the timeline of **the record it came from** — `contactId` set,
    `actorId` null, inside the same transaction that serves the bytes, **every time**, with no
    first-download-only dedup. This is §2's "portal actions land in the existing per-entity
    timelines" extended to reads: the customer holding the document is the fact worth keeping.
    §3.11's no-`portal_events` rule stands — the row goes on the entity, not in a portal-side
    log — which is what forced **A18**, and decision 25 answers it. (§ 04 §2b, 01 §6c, 01 §6d)
24. **`Facturas` ships as a disabled nav row** (owner, 2026-08-31) — greyed out, a
    *"Próximamente"* label, **no route, no guard, no grant, no endpoint**, visible to every
    portal user including one with zero grants. Invoicing does not exist anywhere in the
    product yet (superadmin's `billing/` is still a `ModuleStub`), and the row is a deliberate
    statement that it is coming rather than a silence. It goes live only when a staff-side
    invoicing module exists to feed it, and that is that plan's decision, not this suite's.
    (§ 03 §4)
25. **`reports` and `contracts` get event tables of their own** (A18, owner 2026-08-31) —
    `report_events` and `contract_events`, append-only, modelled column-for-column on
    `quotation_events`, so every one of decision 23's three download routes has a timeline to
    write to. This **supersedes 13 §3's "no per-contract audit table" clause** and nothing
    else: service orders and quotations already run an own-timeline *and* a complementary
    client-timeline entry, and contracts simply join them. Everything 13 CP-1 shipped keeps
    working unchanged — the new tables start life carrying downloads, and a download writes the
    entity timeline **only**, never a `customer_interactions` entry, because a fetch is not a
    commercial touch and the client 360 would drown in them. (§ 01 §6d)
26. **`portal_users.contact_id` has no foreign key** (owner, 2026-08-31) — the column stays
    and its unique index stands (A10), but the `REFERENCES` constraint is removed.
    `updateCustomerWithRelations` deletes and re-inserts all contacts per PATCH; a restrict
    FK would make customer edits permanently impossible the moment a contact has a portal user.
    A portal user is **created from** a contact and is standalone thereafter — staff
    administering portal accounts must not interfere with the contacts list. The pointer can
    go stale if the customer's contacts are later replaced; this is accepted. The email column,
    independent since invite, is the live identity (§ 01 §1).

## 5. Residual asks — resolved 2026-08-31

| # | Answer | Encoded in |
|---|---|---|
| A16 | **Contacts must be unique per email.** Not option (a): the ambiguity is removed at the source rather than papered over at login. `customer_contacts` gains a unique email index, `portal_users.email` goes back to partial-unique, and 00 §3.3's two-accounts-per-address clause is superseded. Costs a **retroactive constraint on live data** — see §4b.20. | 01 §0, 01 §1, 02 §1 |
| A17 | **Never required.** Staff may create the equipment record **from the request view** and attach it, but a request with `equipment_id` null moves through the whole lifecycle unimpeded. | 01 §4, 06 §4, superadmin 27 §3 |

One further ask was raised and answered the same day — see §6.

## 6. Ask raised and resolved 2026-08-31

| # | Answer | Encoded in |
|---|---|---|
| A18 | **Option (a): reports and contracts MUST have event tables too.** `report_events` + `contract_events`, append-only, modelled on `quotation_events`, so all three of decision 23's download routes write to the timeline of the record they served. Supersedes 13 §3's no-per-contract-audit-table clause; changes nothing 13 CP-1 shipped. | 01 §6d, 00 §4b.25 |

**No open asks remain in this suite.**

> **Note on how A18 was framed.** It was raised as *"reports and contracts have no event
> table"*, which was true but incomplete: both already have an audit **home** —
> `customer_interactions` with `InteractionRefKind.Report` / `.Contract`, and for contracts
> that was a deliberate 13 §3 decision, not an omission. The answer stands with that on the
> record: the new tables are the *complementary* per-entity trail, exactly as service orders
> and quotations already run alongside their client-timeline entries.
