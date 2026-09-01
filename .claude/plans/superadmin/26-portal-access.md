# 26 — Portal access administration

> **Status:** planned (doc) · **Depends on:** 07 (clients), `../client-portal/01-data-model.md`
> + `../client-portal/02-auth-surface.md`
> **Owner:** — · **Last updated:** 2026-08-31

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
- Columns: contact name, customer (deep-link to 07), email, status, **admin** (a badge when
  `is_admin`), grants (compact chips), last login, invited by.
- **`locked_until` is shown on the row when it is in the future** ("bloqueado hasta 14:30"). The
  2-hour lockout after 5 failed logins (`../client-portal/02-auth-surface.md` §2) is invisible
  to the customer by design — the login says nothing — so support needs to see it here to
  answer "no me deja entrar". It self-clears; there is no unlock action to build.
- **`invited` with no last login is the row that matters.** An invite that was never used is an
  access request that silently failed; the list should make that state easy to find and act on.

## 2. Granting access

> **Owner, 2026-08-31 (00 §4b.27).** This is its **own form in its own section**, entirely
> separate from the customers form. Portal access is never a checkbox on a contact and never a
> side effect of editing a customer; staff come here deliberately, on demand. The form still
> *selects* an existing contact — that is what fills `contact_id` and `customer_id` — but it
> does not create, edit or delete contacts, and nothing in the customers editor grants or
> revokes portal access.

~~From a **customer's contacts tab** (07) — the natural place, since you decide about a person
while looking at them — and~~ **superseded 2026-08-31 by decision 27** (the contacts-tab entry
point is exactly the customers-editor grant surface that decision forbids): **only** from this
module, with a customer + contact picker.

The invite dialog is deliberately small: pick the contact, tick the grants, set the admin
toggle, send. It shows the contact's email as **text, not an editable field** — if it's wrong,
the fix is to correct the contact, not to type a different address into a credential.

On send: `POST /portal-users`, the backend mails a temp password
(`../client-portal/02-auth-surface.md` §6), the row appears as `invited`.

## 3. Grants editor

The seven grants (`../client-portal/01-data-model.md` §3) as labelled toggles with one-line
explanations in Spanish, grouped:

- **Consultar** — Reportes · Contratos · Cotizaciones · Órdenes de servicio · **Equipos**
- **Actuar** — Aprobar cotizaciones · Crear solicitudes de servicio

Rules the UI reflects but the **backend enforces**:

- Aprobar cotizaciones requires Consultar cotizaciones — ticking the first ticks the second and
  says why.
- **Consultar equipos and Crear solicitudes are independent** (owner, 2026-08-31). A customer may
  browse their installed base with no ability to file requests, and a filer without the view
  grant still gets the equipment **picker** inside the form. The editor must not couple them:
  ticking one does not tick the other, and the helper text says which surface each one opens.
- Zero grants is allowed and is not an error state; the portal shows that user an explanatory
  home. The list marks it plainly ("sin permisos") rather than pretending it is normal.

Every change writes a `portal_user_grants` row or sets `revoked_at` — **never a DELETE** — so
"who could see our prices in March" stays an answerable question.

## 3b. Administrador del portal (`is_admin`) — separate from the grants

A single toggle, rendered **outside** the grants block and labelled as what it is: *"Administra
el portal de este cliente"*. It writes `portal_users.is_admin`
(`../client-portal/01-data-model.md` §1), **not** a `portal_user_grants` row — grants say what a
person may do with records, this says who speaks for the customer
(`../client-portal/00-overview.md` §4b.17).

- Today it confers exactly **one** power: **closing a service request**
  (`../client-portal/06-service-requests.md` §3). The toggle's helper text says so plainly
  rather than implying a general administrator role the product does not have.
- It is independent of every grant, including `create_service_requests` — but an admin with no
  request grant sees no requests to close, so the editor warns when that combination is saved
  instead of silently producing a useless account.
- Toggling it is effective on the **next request** (the middleware re-reads the row), like a
  grant revocation.
- A customer may have **several** portal admins, or none. There is no "must have one" rule: a
  customer with no admin simply never closes requests, and staff still cannot close for them.

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
- [ ] **CP-2** — invite dialog in this module only, with the customer + contact picker (§2).
      No entry point in the customers editor — decision 27.
- [ ] **CP-3** — grants editor with the dependency rule + revocation history preserved, plus
      the `is_admin` toggle (§3b) and the no-request-grant warning.
- [ ] **CP-4** — lifecycle actions (resend, reset, suspend, reactivate, revoke-with-comment).
- [ ] **CP-5** — 07 contact-row indicator + the quotation-email portal link + the
      `locked_until` badge on the list.

## 8. Open decisions / asks

- Is there a per-customer cap on portal accounts? Proposal: no cap, but the list surfaces the
  count per customer so an outlier is visible.
- Should suspending a **customer** (blacklisting in 08) auto-suspend their portal users?
  Proposal: yes, and say so in the blacklist confirm dialog — a blacklisted customer keeping a
  live login is a surprise nobody wants to discover later.
