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
- `POST /users` · `PATCH /users/:id`
- `DELETE /users/:id` with `{ deleteComment }` (soft delete)
- `POST /users/:id/restore` *(nice-to-have — open decision)*

## 3. Pages & components

- `users/pages/users-list/` — lazy `<p-table>`: name, email, role pill, active pill,
  created. Filters: search, role, active. Row actions: edit, delete.
- `users/pages/user-form/` — one reactive-form page for add + edit (route param decides).
  Fields: name, email, phone, role (`<p-select>`), active toggle. Password handling is
  backend-driven (invite email or set-password flow — open decision).
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
- New-user credential flow: invite email vs admin-set temporary password.
- Restore endpoint for soft-deleted users: in or out for v1?
