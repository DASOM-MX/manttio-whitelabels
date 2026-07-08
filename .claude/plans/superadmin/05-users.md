# 05 — Users

> **Status:** done (frontend side — backend users-module changes pending, except the
> role enum: `office` added to `ROLES`/`GRANTABLE_ROLES` + `users_role_check`, migration
> `0011`, 2026-07-08)
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
  load path. This is the canonical pattern for every superadmin list page.
  **QA 2026-07-08:** whole row clicks through to the user's page (action links remain
  the keyboard path; owner rows carry a read-only "view" link instead of edit/delete);
  role pills use the app-wide blue hierarchy ladder (14 §1); a failed detail load
  (e.g. 404) toasts and redirects back to the list.
- `users/pages/user-form/` — one reactive-form page for add + edit (route param decides).
  Fields: name, email, phone, role (`<p-select>`), active toggle. **Edit mode is
  tabbed; the last tab is "Crítico"** — the danger zone holding the **reset password**
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
- ~~New-user credential flow~~ — **resolved 2026-07-05: temp-password model.** Reset
  issues a generated temporary password (shown once) + forced change at next login;
  creation follows the same shape (`POST /users` response carries the initial temp
  password, `mustChangePassword` set). No invite emails in v1.
- ~~Self-service password change~~ — **partially resolved 2026-07-05:** a change-own
  endpoint (`POST /auth/password`) must exist for the forced-change dialog. Whether a
  profile page exposes it voluntarily is still open.
- Temp-password expiry (e.g. force a new reset after N days unused): in or out for v1?
- Restore endpoint for soft-deleted users: in or out for v1?
