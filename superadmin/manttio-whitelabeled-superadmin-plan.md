# Manttio — Whitelabeled Superadmin Plan

**Repo:** `manttio` (main product repo) · behind product auth.
**Role:** the in-product admin where the logged-in **client** edits their own CMS content.
Tenant-scoped (their own instance), product user-auth — **not** the shared token.

System map: **[this] whitelabeled superadmin** → whitelabeled backend (client CMS read/write,
user-auth).

---

## 1. Boundaries

**Consumes**
- The *whitelabeled backend* **client CMS read/write API**, authenticated as a normal
  logged-in user of this instance. Scope is this tenant only.

This is where per-user identity and "who edited" live (the shared token is never used here).

---

## 2. Permissions (default — adjustable)

- **Client can edit:** `cms_home`, `cms_clients`.
- **Brand:** read-only by default (the whitelabel identity is set by *us* via the manager
  push). Flip to client-editable if you want clients to self-serve branding — a one-line
  policy choice on the backend's write authz.

---

## 3. Components

- **Home editor** — a reusable `RepeaterComponent<T>` (FormArray-backed, add/remove/reorder)
  for the jsonb groups: badges, service targets, services, services_content. Plus the scalar
  fields (titles, descriptions, service_area).
- **Clients editor** — PrimeNG table + drawer form per client; image uploads → R2 keys via the
  backend; `business_relation_description` via a **safe rich-text control**.
- **Brand view** — read-only (or editable per §2).
- **Publish control** — see open decision; if publish-step, a "Publish" action + an
  "unpublished changes" badge (compare draft vs last published).

---

## 4. Open decision (shapes this UI)

> draft→publish **vs** edit=live. If publish-step: editors save drafts and a **Publish**
> button pushes live. If edit=live: no draft state, no Publish button, saves go live. Decide
> on the backend (§ write paths) — this UI mirrors that choice.

**Guardrail:** the HTML field is sanitized on the backend on write; still use a constrained
editor here (no arbitrary markup paste-through).

---

## 5. Build checklist  ( `- [ ]` / `- [~]` / `- [x]` )

- [ ] Auth-gated entry (this tenant's logged-in client)
- [ ] `RepeaterComponent<T>` for jsonb array groups
- [ ] Home editor (arrays + scalars)
- [ ] Clients editor (table + drawer, image upload → R2 key, safe rich-text)
- [ ] Brand view (read-only, or editable per policy)
- [ ] Publish control + "unpublished changes" badge *(if publish-step)*

**Stack:** Angular + PrimeNG + Tailwind (standalone + signals) · calls the whitelabeled
backend client API.
