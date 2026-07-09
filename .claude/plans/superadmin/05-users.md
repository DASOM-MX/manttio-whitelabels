# 05 — Users

> **Status:** done (frontend side — backend users-module changes pending, except:
> the role enum — `office` in `ROLES`/`GRANTABLE_ROLES` + `users_role_check`, migration
> `0011`, 2026-07-08 — and the **password-reset process, shipped 2026-07-09**:
> `POST /users/:id/password` (pairing-gated), temp-password create, `must_change_password`
> (migration `0012`), `POST /auth/password`. Temp passwords are always `tmp_` + 18 random
> chars. Still pending: paged `GET /users` list query, `active` + `phone` columns.)
> **Depends on:** 02 (CP-3, done)
> **Owner:** branch `feature/superadmin-users` (stacked on the 02 shell PR) · **Last updated:** 2026-07-08

Manage the tenant's product users (admins, technicians, office staff). This mirrors the
frontend's `users/` feature — reuse its shapes, don't redesign them.

---

## 1. Data model (DTO view)

```
User {
  id, name, email, phone?,
  role: 'owner' | 'admin' | 'office' | 'technician',   // decided — 14-access-control.md §1
  active: boolean,
  createdAt, updatedAt,
  deletedAt?, deleteComment?, deletedBy?     // soft-delete audit trail (backend convention)
}
```

**Owner protection** (`14-access-control.md` §2 note 1 — hardened 2026-07-08): owner
rows are **immutable in-tenant for everyone, the owner included**. Owner accounts are
provisioned from the **whitelabel manager** (the higher-level internal tool); changes or
invalidation go through the support team — an in-tenant slip could lock out the whole
tenant. UI: hide edit/delete on owner rows for all actors, exclude `owner` from the role
select entirely (offer `GRANTABLE_ROLES` only: admin/office/technician); backend enforces
(`cannot_modify_owner`, `GRANTABLE_ROLES` zod enum).

WMS link (module 10): a technician can have an **assigned warehouse** (their van/mobile
stock). That assignment is owned by module 10 — this module only *shows* it read-only on
the user detail once 10 lands.

## 2. Expected API surface

- `GET /users?page&limit&search&role&active` → `PagedResponse<User>`
- `GET /users/:id`
- `POST /users` (response carries the initial temp password — same model as reset
  below) · `PATCH /users/:id`
- `POST /users/:id/password` — **reset password (decided 2026-07-05), role-gated per
  `14-access-control.md` §2 note 1:** owner resets admins/office/technicians; admins
  reset office/technicians only; nobody in-tenant resets the owner. Backend enforces
  the pairings. **Temp-password model (decided 2026-07-05):** the backend generates a
  temporary password, returns it **once** in the response (there's no email flow — the
  resetter hands it over), and flags the user `mustChangePassword`. At next login the
  user is forced through an **unskippable set-your-own-password dialog** before
  entering the app (shell-level — `02-app-shell.md` §3).
- `DELETE /users/:id` with `{ deleteComment }` (soft delete)
- `POST /users/:id/restore` *(nice-to-have — open decision)*

## 3. Pages & components

- `users/pages/users-list/` — lazy `<p-table>`: name, email, role pill, active pill,
  created. Filters: search, role, active. Row actions: edit, delete. **Filters + page
  persist as GET query params (`?q&role&active&page`, decided 2026-07-08)** so browser
  back/forward walks the filter history — the `queryParamMap` subscription is the single
  load path. This is the canonical pattern for every superadmin list page, and its
  mechanics live in **`app/services/table/list-query.service.ts`** (`ListQueryService`,
  component-provided; extracted 2026-07-08): page clamping, `[first]` offset, filter→URL
  navigation, lazy-load page changes, refetch/step-back refresh, plus the `keyIn` param
  whitelist helper. List components keep only param mapping, query building and dispatch.
  **QA 2026-07-08:** whole row clicks through to the user's page (action links remain
  the keyboard path; owner rows carry a read-only "view" link instead of edit/delete);
  role pills use the app-wide blue hierarchy ladder (14 §1); a failed detail load
  (e.g. 404) toasts and redirects back to the list.
- `users/pages/user-form/` — one page for add + detail/edit (route param decides).
  **The detail is view-first (QA 2026-07-09):** static labels (name, email, phone, role
  pill, estado tag, created) — the reactive-form inputs only render after an explicit
  "Editar" click, so no live controls sit armed by default (fewer accidental/unwanted
  requests, and the view will later grow into a fuller user detail). Cancel reverts to
  view mode; a successful save stays on the detail in view mode. Form fields: name,
  email, phone, role (`<p-select>`). **Edit mode is tabbed; the last tab is "Crítico"**
  — the danger zone holding (a) the **account activation toggle** (QA 2026-07-09:
  disabling an account is a lockout action, not a form field — moved out of Datos;
  confirm dialog → `PATCH /users/:id { active }`), and (b) the **reset password**
  button (rendered only for the allowed pairings — 14 §2 note 1; confirm dialog →
  calls `POST /users/:id/password` → shows the generated temp password **once** with a
  copy button and a "won't be shown again" warning). New users get the same
  temp-password treatment on create (§2 / open-decision resolution below).
- `users/components/delete-user-dialog/` — **port the canonical frontend
  `delete-user-dialog`**: self-contained (shape 3), required audit comment + typed-email
  confirmation, dispatches delete, toasts result.

## 4. State

- `UsersState`: `list`, `total`, `loading`, `selected`. Actions: `LoadUsers(query)`,
  `LoadUser(id)`, `CreateUser`, `UpdateUser`, `DeleteUser(id, comment)`.
- `src/http/users.service.ts` using `toParams`.

---

## Checkpoints

### CP-1 — Read path
- [x] DTOs + `users.service.ts` + `UsersState` (lazy `provideStates`; list/detail +
      one-time `tempPassword` slot cleared after display)
- [x] List page with lazy server-side table (page/limit), search (debounced) +
      role + active filters, role/estado pills
- [x] Route + sidebar entry live (shipped with 02)

### CP-2 — Write path
- [x] User form page (add + edit; owner account read-only for everyone; role
      select offers `GRANTABLE_ROLES` only — hardened 2026-07-08) with validators
- [x] Delete dialog ported from frontend canon (audit comment + typed-email,
      case-insensitive match)
- [x] "Crítico" tab on edit mode: reset-password (confirm dialog → temp password
      shown once w/ copy + won't-be-shown-again warning) — gated by
      `canResetPassword` pairings in access.ts (14 §2 note 1); creation shows the
      initial temp password through the same dialog
- [x] Toasts on create/update/delete; list refreshes

### CP-3 — Polish
- [x] Dark-mode variants on every view
- [x] Empty/loading states on list; dirty-navigation guard on the form
- [x] Build green; headless pass 18/18 (2026-07-06): list + server-side search,
      create → one-time password → row appears, edit hydrate, Crítico reset,
      delete via audit dialog → row gone, admin sees no owner actions and gets
      the owner edit page read-only

## Open decisions / asks
- ~~Role enum~~ — **resolved 2026-07-05:** `owner|admin|office|technician`
  (`14-access-control.md`); ~~backend migration of the existing role column is a backend
  ask~~ — **done 2026-07-08:** `office` added to backend `ROLES`/`GRANTABLE_ROLES` +
  `users_role_check` (migration `0011`, applied to Neon). Per-module permissions for
  `office` on existing endpoints remain a per-module backend ask.
- ~~Owner self-edit~~ — **resolved 2026-07-08:** owner rows are immutable in-tenant for
  everyone (owner included). Owners are provisioned/changed from the whitelabel manager;
  invalidation goes through support (lockout safety). Soft deletes only, as everywhere.
- ~~New-user credential flow~~ — **resolved 2026-07-05: temp-password model; backend
  shipped 2026-07-09.** Reset issues a generated temporary password (shown once,
  always `tmp_` + 18 random chars) + forced change at next login; creation follows the
  same shape (`POST /users` response carries the initial temp password when `password`
  is omitted, `mustChangePassword` set). No invite emails in v1.
- ~~Self-service password change~~ — **partially resolved 2026-07-05; endpoint shipped
  2026-07-09:** `POST /auth/password` (change own, new password only) exists for the
  forced-change dialog. Whether a profile page exposes it voluntarily is still open.
- Temp-password expiry (e.g. force a new reset after N days unused): in or out for v1?
- Restore endpoint for soft-deleted users: in or out for v1?
