# client-portal / 02 — The `/portal/*` backend surface

> **Status:** planned (doc) · **Depends on:** 01 · **Feeds:** 03, 04, 05, 06
> **Owner:** — · **Last updated:** 2026-08-28

A **second, parallel auth surface** on the same Worker (00 §3.8). Not a role added to the
existing one: portal users are a different kind of subject, with a different token, a
different secret and a different middleware, so a portal token reaching `/users` or
`/reports` is impossible by construction rather than by a role check somebody has to remember
to write.

---

## 1. Token + middleware

```
POST /portal/auth/login → { token, mustChangePassword }

JWT payload: { sub: <portalUserId>, cid: <customerId>, typ: 'portal' }
signed HS256 with PORTAL_JWT_SECRET   ← a NEW binding, distinct from JWT_SECRET
```

- `portalJwtMiddleware` (`modules/portal/middleware/portal-jwt.middleware.ts`) verifies against
  `PORTAL_JWT_SECRET`, rejects any token whose `typ` is not `'portal'`, loads the
  `portal_users` row, and 401s if it is `suspended` or soft-deleted. It sets
  `c.set('portalUser', { id, contactId, customerId, email, grants })`.
- **Grants are loaded per request from `portal_user_grants`, not carried in the token.** A
  revocation must take effect immediately; a grant baked into a 7-day JWT would not. The load
  is one indexed query on a table with a handful of rows per user.
- `requireGrant(PortalGrant.X)` is a second middleware, applied per route group. Missing grant
  is **404, not 403**, for anything record-shaped — the portal must not confirm that a section
  or a record exists to someone not entitled to it.
- `AppBindings['Variables']` gains `portalUser`; `Env` gains `PORTAL_JWT_SECRET`
  (`.dev.vars` + `wrangler.toml` secret, never committed).
- **Mount order in `index.ts`:** `/portal` mounts *before* the global staff `jwtMiddleware`,
  alongside `/auth` and `/public/*`, and carries its own guards route by route. The staff
  middleware must never see a portal request and vice-versa.

**Token TTL — ask A2.** Staff tokens are 1d prod / 7d dev. A customer who logs in four times a
year will meet an expired session every time. Proposal: 30d portal tokens with no refresh
endpoint (re-login on expiry), revocable through `status = suspended` because the middleware
re-reads the row on every request.

## 2. Public routes (no token)

| Route | Behaviour |
|---|---|
| `POST /portal/auth/login` | `{ email, password }`. Invalid → `401 invalid_credentials`, the same body whether the email is unknown, the password wrong, or the account suspended. Success writes `last_login_at`. |
| `POST /portal/auth/forgot-password` | `{ email }`. **Always `204`**, unknown address included — no account enumeration. On a match: create a `portal_password_resets` row (1h TTL, hashed token) and mail the link. |
| `POST /portal/auth/reset-password` | `{ token, password }`. Looks up by token hash, rejects used/expired, sets the password, marks `used_at`, flips `status` to `active`, clears `must_change_password`. |

**Abuse control — ask A3.** Neither staff login nor this surface has any today, and this one is
internet-facing for people we did not hire. Proposal: reuse the existing `modules/turnstile`
on `login` + `forgot-password`, plus a per-account reset throttle (max 3 unused live tokens,
newest wins). Lockout policy left to the owner.

## 3. Authed routes

| Route | Grant | Notes |
|---|---|---|
| `GET /portal/auth/me` | — | `{ user: { id, name, email }, customer: { id, name }, grants: PortalGrant[], mustChangePassword }`. The boot payload the app gates its nav on. |
| `POST /portal/auth/password` | — | Change own password; clears `must_change_password`, flips `invited → active`. |
| `GET /portal/reports` `GET /portal/reports/:id` `GET /portal/reports/:id/pdf` | `view_reports` | 04 |
| `GET /portal/contracts` `…/:id` `…/:id/pdf` | `view_contracts` | 04 |
| `GET /portal/quotations` `…/:id` `…/:id/pdf` | `view_quotations` | 04 |
| `POST /portal/quotations/:id/respond` | `approve_quotations` | 05 |
| `GET /portal/service-orders` `…/:id` | `view_service_orders` | 04 |
| `GET /portal/equipment` | `create_service_requests` (picker) or `view_*` per ask A8 | 06 |
| `GET /portal/service-requests` `…/:id` `POST /portal/service-requests` `POST /portal/service-requests/:id/answer` | `create_service_requests` | 06 |
| `POST /portal/upload/evidence` | `create_service_requests` | Its own route, **not** the staff `/upload/image` — different bucket, different cap, and the staff route is behind the staff middleware. |

## 4. Two non-negotiable query rules

1. **`customerId` comes from the token. Always.** Never from a path param, query string or
   body. Every portal repository function takes it as a required argument and every query
   filters on it. A portal endpoint that can be pointed at another customer by editing a URL is
   the one bug this whole surface exists to make impossible.
2. **A record that fails the scope check is `404`.** Not 403, not "not yours" — the portal never
   confirms the existence of another customer's record.

## 5. Response shaping — omit, never hide

Per the repo rule, restricted fields are **absent from the response body**, not hidden in the
UI. Portal responses use their own DTOs in `modules/portal/dtos/`, built by explicit field
selection — never by spreading a staff DTO and deleting keys.

Categorically stripped: internal/staff notes, cost and margin figures, staff attribution
(who wrote the report, who priced the quote), other contacts' personal data, soft-delete audit
columns, and anything belonging to another customer. **CP-3 enumerates the kept field list per
entity** and a test asserts each portal DTO's exact key set, so a future column added to a
staff DTO cannot leak by inheritance.

Lists return `GenericQueryResponse<T>` with a real `total`.

## 6. Invite flow (the staff side lives in superadmin 26)

`POST /portal-users` on the **staff** surface (not `/portal/*` — staff call it with a staff
token), body `{ contactId, grants[] }`:

1. Validate the contact exists, is not soft-deleted, and has an email.
2. Create `portal_users` (`status: invited`, `must_change_password: true`, `customer_id` copied
   from the contact, `invited_by` = the caller).
3. Insert the requested `portal_user_grants` rows.
4. Generate a temp password, hash it, mail it via the `email` module with the tenant's brand
   (no literals) and the portal URL for this tenant.
5. Return the created portal user. **The temp password is in the email only** — never in the
   API response, never in a log.

Staff-issued reset, suspend, resume, revoke-access and grant edits are the same module's
endpoints; superadmin 26 is their UI.

## 7. Tests

`backend/test/portal/` (Vitest against the live Neon DB — run deliberately, not casually):

- A staff token is rejected on `/portal/*`; a portal token is rejected on `/users`,
  `/reports`, `/customers`, `/upload/image`.
- Every read endpoint returns 404 for a record belonging to another customer.
- Each `requireGrant` route 404s without its grant and succeeds with it.
- Revoking a grant takes effect on the **next request** with an unchanged token.
- A suspended and a soft-deleted portal user are both refused at the middleware.
- `forgot-password` returns 204 for an unknown email and writes no row.
- A reset token cannot be replayed.

## 8. Checkpoints

- [ ] **CP-1** — env binding, `portalJwtMiddleware`, `requireGrant`, login/me/password, mount
      order in `index.ts`, cross-surface rejection tests.
- [ ] **CP-2** — forgot/reset password + email templates + throttle/Turnstile decision applied.
- [ ] **CP-3** — portal DTO layer + per-entity kept-field enumeration + key-set tests.
- [ ] **CP-4** — staff-side portal-user endpoints (invite, grants, suspend, resume, reset).
