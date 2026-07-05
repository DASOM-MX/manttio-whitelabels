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

The **config push body** is shaped by the draft-vs-live decision (see whitelabeled backend
plan). Settle it before building the push path.

Additional push-schema requirements from superadmin planning (2026-07-05, see
`manttio-whitelabeled-backend-plan.md` §1):
- `modules` feature flags: `{ billing, wms, crm, cms, scheduling }` — `scheduling`
  covers calendar + contracts (tentative split; equipment rides core clients).
- **Tenant timezone** (IANA) — default/fallback for visit times and tenant-wide views
  (`customers.timezone` stays the per-customer override for report rendering).

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

**Config push** *(blocked on draft-vs-live)*
- [ ] BFF → instance config POST (fan-out via `api_base_url`)

**Billing**
- [ ] `billing_reference` store + CRUD (admin-side only)

**Stack:** server-side BFF on Cloudflare Workers · own small DB (registry + billing) ·
Cloudflare KV (status writes).
