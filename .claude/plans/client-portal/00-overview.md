# client-portal / 00 — Portal de clientes suite overview

> **Status:** planned (doc) · **Depends on:** 06 reports, 07 clients, 11 equipment, 13 contracts, 19 service-orders, 20 quotations
> **Owner:** — · **Last updated:** 2026-08-28

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
| 04 | `04-read-surfaces.md` | The four read sections: reports, contracts, quotations, service orders (+ PDF downloads) | 02, 03 |
| 05 | `05-quotation-approval.md` | In-portal approve/decline, coexisting with the emailed token page | 04 |
| 06 | `06-service-requests.md` | The new `service-requests/` backend module + the portal's request flow | 01, 03; feeds 22 |

**Build order:** 01 → 02 backend-side; 03 starts against mocked services as soon as 02 fixes
the shapes (superadmin master plan §2 rule 5). Then 04 → 05 in the portal, with 06 running in
parallel once 01 lands. The superadmin legs (26, 27) can start after 01/02: 26 gates the whole
portal (nobody can log in until staff can invite), so **26 ships before the portal is usable**.

**PR granularity:** one PR per checkpoint, stacked, base `main`. Branch naming
`feature/client-portal-<slice>` for portal app work, `feature/backend-portal-<slice>` for the
backend surface, `feature/superadmin-<slice>` for 22/23; `fullstack` prefix when a PR spans
both. Commit prefixes `feat(client-portal)` / `feat(backend)` / `feat(superadmin)`.

## 2. Binding invariants

Inherited from the repo and the superadmin suite — do not relitigate:

- **No hard deletes, ever** (fork rule). Revoking portal access is a soft delete /
  status flip on `portal_users`, never a row removal. Read helpers filter `isNull(deletedAt)`.
- **Event tables are append-only.** Portal actions land in the *existing* per-entity
  timelines (`quotation_events`, `service_order_events`, `service_request_events`) — no
  updates, no deletes.
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
   on `customer_contacts` and portal users are **not** rows in `users`. The same email invited
   at two customers is two separate accounts — `customerId` is therefore fixed per token and
   there is no customer switcher.
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
15. **Notifications both directions:** a new request raises a staff in-app notification through
    the existing notifications module; the contact receives transactional email (invite, reset,
    quote ready, request status changes).
16. **This branch ships plan documents only** — no implementation code.

## 4. Open asks (need owner sign-off before the relevant checkpoint starts)

| # | Ask | Blocks |
|---|---|---|
| A1 | The exact grant list (proposed in `01-data-model.md` §3) — six grants, or split "view" per section further? | 01 |
| A2 | Portal JWT TTL. Staff tokens are 1d prod / 7d dev; a customer portal arguably wants longer + a refresh path. | 02 |
| A3 | Reset-token rate limiting + lockout policy on repeated bad logins (there is none for staff today). | 02 |
| A4 | Is the portal a per-tenant offering? Module flags are org-level and manager-owned — the portal likely needs a manager-side flag rather than an in-tenant one. | 03 |
| A5 | Evidence images: reuse the `manttio-equipment` bucket, or a new `manttio-portal` bucket with its own lifecycle? | 01, 06 |
| A6 | When a quotation born from a request is **declined** by the client, does the request reopen (`in_review`) or close as `rejected`? | 06 |
| A7 | Does a portal user see *draft* quotations and *pending* reports, or only records staff have deliberately sent/finished? Proposal: only sent/finished. | 04 |
| A8 | Should the portal show the customer's equipment registry (11) as its own read section? It is needed as a *picker* for requests either way. | 04, 06 |
| A9 | `service_requests.equipment_id` is nullable so a customer with an empty registry can still file. Confirm, and whether staff must attach an equipment record before approving. | 01, 06 |
| A10 | One email = one portal account per tenant DB (partial-unique on `email`). Accept, or scope it to `(customer_id, email)` so one person can hold accounts at two customers? | 01 |
| A11 | The superadmin `AuthenticatedLayout` is **copied** into the portal (no shared library exists). Accept the drift, or extract a shared package? | 03 |
| A12 | Typography: the portal is tenant-facing, so `01-conventions.md` says **brand fonts**, not superadmin's Figtree. Confirm — "mirror superadmin" may have been meant to include the typeface. | 03 |
| A13 | Name the technician on a customer-visible report? (The report PDF already does.) | 04 |
| A14 | Name the other reviewers on a quotation, or show only the tally? | 04, 05 |
| A15 | Expose service-order priority to the customer? Proposal: no — it is an internal dispatch signal. | 04 |
