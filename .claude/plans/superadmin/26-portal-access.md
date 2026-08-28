# 26 — Portal access administration

> **Status:** planned (doc) · **Depends on:** 07 (clients), `../client-portal/01-data-model.md`
> + `../client-portal/02-auth-surface.md`
> **Owner:** — · **Last updated:** 2026-08-28

Where staff decide **who** gets into the Portal de clientes and **what** they can do there.
Access is invite-only (`../client-portal/00-overview.md` §3.4) — there is no public signup — so
this module is the portal's only door. **It ships before the portal is usable.**

Data model and endpoints belong to the client-portal suite; this file owns the superadmin UI.

---

## 1. Nav + list

New sidebar entry **Portal de clientes**, tenant-wide (not buried inside one customer), because
the questions staff actually ask are "who has access to our portal?" and "who was invited and
never logged in?" — both cross-customer.

- `p-table`, server-paginated, URL filters: customer, status (`invited` / `active` /
  `suspended`), grant, free text over name + email.
- Columns: contact name, customer (deep-link to 07), email, status, grants (compact chips),
  last login, invited by.
- **`invited` with no last login is the row that matters.** An invite that was never used is an
  access request that silently failed; the list should make that state easy to find and act on.

## 2. Granting access

From a **customer's contacts tab** (07) — the natural place, since you decide about a person
while looking at them — and from this module with a customer + contact picker.

The invite dialog is deliberately small: pick the contact, tick the grants, send. It shows the
contact's email as **text, not an editable field** — if it's wrong, the fix is to correct the
contact, not to type a different address into a credential.

On send: `POST /portal-users`, the backend mails a temp password
(`../client-portal/02-auth-surface.md` §6), the row appears as `invited`.

## 3. Grants editor

The six grants (`../client-portal/01-data-model.md` §3) as labelled toggles with one-line
explanations in Spanish, grouped:

- **Consultar** — Reportes · Contratos · Cotizaciones · Órdenes de servicio
- **Actuar** — Aprobar cotizaciones · Crear solicitudes de servicio

Rules the UI reflects but the **backend enforces**:

- Aprobar cotizaciones requires Consultar cotizaciones — ticking the first ticks the second and
  says why.
- Zero grants is allowed and is not an error state; the portal shows that user an explanatory
  home. The list marks it plainly ("sin permisos") rather than pretending it is normal.

Every change writes a `portal_user_grants` row or sets `revoked_at` — **never a DELETE** — so
"who could see our prices in March" stays an answerable question.

## 4. Lifecycle actions

| Action | Effect |
|---|---|
| **Reenviar invitación** | New temp password, new email. Only for `invited`. |
| **Restablecer contraseña** | Staff-issued reset (the second half of `00 §3.5`): new temp password, `must_change_password`, email. |
| **Suspender** | `status: suspended`. Login refused, existing tokens dead on the next request (the middleware re-reads the row). Reversible. |
| **Reactivar** | Back to `active`. |
| **Revocar acceso** | Soft delete with a **required comment** + `deleted_by`, mirroring the users module. The contact stays; only the login goes. Re-invitable later. |

There is no hard delete and no "delete portal user" wording anywhere in the UI. Suspend is the
reversible answer and revoke is the permanent one, and both leave the record.

## 5. What staff must never see

The temp password is in the email only — never rendered in the UI, never returned by the API,
never logged. If a staff member needs to help a customer in, the action is "reenviar
invitación", not "read me the password".

## 6. Rollout companion tasks

- The quotation send email (20) gains a portal link for contacts who have access.
- The customer detail page (07) shows a portal-access indicator per contact so staff see, in
  context, who can log in.

## 7. Checkpoints

- [ ] **CP-1** — nav entry + tenant-wide list with URL filters + status/grant chips.
- [ ] **CP-2** — invite dialog from 07's contacts tab and from this module.
- [ ] **CP-3** — grants editor with the dependency rule + revocation history preserved.
- [ ] **CP-4** — lifecycle actions (resend, reset, suspend, reactivate, revoke-with-comment).
- [ ] **CP-5** — 07 contact-row indicator + the quotation-email portal link.

## 8. Open decisions / asks

- Is there a per-customer cap on portal accounts? Proposal: no cap, but the list surfaces the
  count per customer so an outlier is visible.
- Should suspending a **customer** (blacklisting in 08) auto-suspend their portal users?
  Proposal: yes, and say so in the blacklist confirm dialog — a blacklisted customer keeping a
  live login is a surprise nobody wants to discover later.
