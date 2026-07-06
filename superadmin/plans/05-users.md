# 05 — Users

> **Status:** not-started · **Depends on:** 02 (CP-3)
> **Owner:** — · **Last updated:** 2026-07-05

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

**Owner protection** (`14-access-control.md` §2 note 1): admins cannot edit/delete the
`owner` account or grant/change the `owner` role — hide those row actions and exclude
`owner` from the role select for non-owners; backend enforces.

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
  created. Filters: search, role, active. Row actions: edit, delete.
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
- [ ] DTOs + `users.service.ts` + `UsersState` (load list/detail)
- [ ] List page with lazy table, filters, pills
- [ ] Route + sidebar entry live

### CP-2 — Write path
- [ ] User form page (add + edit) with validators
- [ ] Delete dialog ported (audit comment + typed email)
- [ ] "Crítico" tab on user-form edit mode: reset-password button (confirm dialog →
      temp password shown once w/ copy) — visible only for allowed pairings
      (owner→admin/office/tech, admin→office/tech; 14 §2 note 1)
- [ ] Toasts on create/update/delete; list refreshes

### CP-3 — Polish
- [ ] Dark-mode audit of every view
- [ ] Empty/loading/error states on list + form
- [ ] Build green; manual pass: create → edit → delete → confirm soft-deleted user gone
      from list

## Open decisions / asks
- ~~Role enum~~ — **resolved 2026-07-05:** `owner|admin|office|technician`
  (`14-access-control.md`); backend migration of the existing role column is a backend
  ask.
- ~~New-user credential flow~~ — **resolved 2026-07-05: temp-password model.** Reset
  issues a generated temporary password (shown once) + forced change at next login;
  creation follows the same shape (`POST /users` response carries the initial temp
  password, `mustChangePassword` set). No invite emails in v1.
- ~~Self-service password change~~ — **partially resolved 2026-07-05:** a change-own
  endpoint (`POST /auth/password`) must exist for the forced-change dialog. Whether a
  profile page exposes it voluntarily is still open.
- Temp-password expiry (e.g. force a new reset after N days unused): in or out for v1?
- Restore endpoint for soft-deleted users: in or out for v1?
