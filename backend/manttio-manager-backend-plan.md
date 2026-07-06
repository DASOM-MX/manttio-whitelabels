# Manttio — Whitelabel Manager Backend Plan

**Repo:** `manttio-whitelabel-admin` (separate, internal).
**Role:** the control-plane backend / BFF. The **only** holder of the shared token. Owns the
tenant registry and billing reference, pushes config to instances, and writes the KV status
that starts/stops them.

System map: manager frontend → **[this] manager backend** → whitelabeled backend (token-auth
push) · → Cloudflare KV (status write).

---

## 1. Boundaries

**Exposes**
- An API to the *manager frontend* (internal superadmin user-auth). The frontend never calls
  instances or touches the token directly.

**Acts on**
- **Config push** → `POST {instance.api_base_url}/<config endpoint>` with the **shared token**
  (per-tenant fan-out using the registry).
- **Status write** → `KV.put` on `tenant:{envId}` → `{ status }` (read by the whitelabeled
  backend's gate).

---

## 2. Data model

- **`tenant_registry`** — env_id (pk), internal_name, public_name, api_base_url,
  neon_project_ref, status (mirror of KV), created_at, updated_at.
- **`billing_reference`** — env_id (fk), business_name, legal_name, legal_owner, tax_id (RFC),
  tax_zip (CP fiscal), owner_phone, notes. **Reference/tracking only.**

> **Guardrail:** `billing_reference` is admin-side only — never sent to a tenant DB, never
> exposed to a client.

---

## 3. Operations

- **Config push** — superadmin edits → BFF POSTs to the tenant's `api_base_url` with the
  shared token. Rare action.
- **Brand push** — seed or correct a tenant's brand object (same instance-side row the
  tenant owner edits; last write wins). **CMS content is never pushed** — see §5.
- **Start / stop / suspend** — `KV.put` on the status key. ~60s propagation; for instant
  emergency stop, also pull the instance route.
- **Register tenant** — create the registry row (env_id, api_base_url, neon_project_ref) during
  by-hand provisioning. The instance is unreachable from here until this row exists.
- **Billing reference** — CRUD.

---

## 4. Auth & secrets

- **Frontend → this backend:** internal superadmin user-auth.
- **This backend → instances:** the **shared token**, auth-only.
  - **Daily rotation** with a **dual-valid overlap window** (no failed pushes during rotation).
  - **Lives only here.** Never shipped to the browser.
  - Proves "trusted backend," not user identity — acceptable because pushes are rare and
    superadmin-only.

Status source of truth is **KV**; the registry `status` is a UI mirror. If they disagree, KV
wins.

---

## 5. Open dependency

~~The **config push body** is shaped by the draft-vs-live decision~~ — **settled
2026-07-05** (CMS content is draft→publish, brand is direct-apply; both are
tenant-owned instance-side data and neither travels in the push — see
`manttio-whitelabeled-backend-plan.md` §3). The push body is unblocked and carries
operational config only: the items below.

Additional push-schema requirements from superadmin planning (2026-07-05, see
`manttio-whitelabeled-backend-plan.md` §1):
- `modules` feature flags: `{ billing, wms, crm, cms, scheduling }` — `scheduling`
  covers calendar + contracts (tentative split; equipment rides core clients).
- **Tenant timezone** (IANA) — default/fallback for visit times and tenant-wide views
  (`customers.timezone` stays the per-customer override for report rendering).
- **Branding pushes; CMS content never (decided 2026-07-05):** the manager can
  **seed/override a tenant's brand object** (provisioning + occasional corrections)
  via the shared-token push — it writes the same single instance-side brand row the
  tenant owner edits in superadmin (`PUT /brand`; direct-apply, last write wins).
  **CMS content (`cms_home`/`cms_clients`) never travels through the manager** — it's
  tenant data, headless-served instance-side (see
  `manttio-whitelabeled-backend-plan.md` §3). Other provisioning-time pieces stay
  manager-side: domain, PWA manifest + app-icon generation from the tenant's isologo,
  legal/billing reference.

---

## 6. Build checklist  ( `- [ ]` / `- [~]` / `- [x]` )

**Foundations**
- [ ] `tenant_registry` store
- [ ] Internal superadmin auth

**BFF & secrets**
- [ ] BFF skeleton (frontend calls it; it calls instances)
- [ ] Shared-token storage (never browser) + one test passthrough
- [ ] Daily token rotation with overlap window

**Control**
- [ ] Start/stop via `KV.put`; registry status mirror
- [ ] Emergency hard-stop runbook (route removal)

**Config push**
- [ ] BFF → instance config POST (fan-out via `api_base_url`)
- [ ] Brand seed/override push (writes the instance brand row via shared token; never
      CMS content)

**Billing**
- [ ] `billing_reference` store + CRUD (admin-side only)

**Stack:** server-side BFF on Cloudflare Workers · own small DB (registry + billing) ·
Cloudflare KV (status writes).
