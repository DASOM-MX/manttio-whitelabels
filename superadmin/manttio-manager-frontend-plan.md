# Manttio — Whitelabel Manager Frontend Plan

**Repo:** `manttio-whitelabel-admin` (separate, internal — you / your team only).
**Role:** the internal superadmin UI for operating the fleet — the AdminKit-style dashboard.
Talks only to the *manager backend*; never to instances, never holds the shared token.

System map: **[this] manager frontend** → manager backend (internal user-auth).

---

## 1. Boundaries

**Consumes**
- The *manager backend* API only (internal superadmin user-auth). All instance pushes and KV
  status writes happen on the backend; this UI just drives them.

---

## 2. Layout (AdminKit shell)

- **Shell** — fixed dark sidebar + topbar + content (the structure from the earlier prototype;
  treat that prototype as the visual reference, build it in Angular + PrimeNG).
- **Sidebar** — role-aware nav config; here the role is single (your team).
- **Topbar** — **tenant switcher** (operating across tenants is the core job), search, avatar.

---

## 3. Screens

- **Dashboard** — fleet stats (tenant count, active/suspended, last push), status breakdown,
  recent activity.
- **Tenants** — registry list + detail (env_id, public_name, api_base_url, status,
  neon_project_ref).
- **Branding / CMS push** — forms that compose a config payload and send it via the manager
  backend to the selected instance.
- **Billing reference** — view/edit the admin-side tracking fields.
- **Start / stop** — per-tenant toggle → manager backend `KV.put`.

---

## 4. Open dependency

The **push forms** depend on the draft-vs-live decision (save vs publish semantics). Settle it
(whitelabeled backend plan) before finalizing those forms.

---

## 5. Build checklist  ( `- [ ]` / `- [~]` / `- [x]` )

**Shell**
- [ ] Dark sidebar + topbar + tenant switcher
- [ ] Role-aware nav config (single role here)

**Screens**
- [ ] Dashboard (fleet stats, status, activity)
- [ ] Tenant registry list + detail
- [ ] Branding/CMS push forms *(blocked on draft-vs-live)*
- [ ] Billing reference view/edit
- [ ] Start/stop toggle

**Stack:** Angular + PrimeNG + Tailwind (standalone + signals) · calls the manager backend
only. Charts via `p-chart`; table via `p-table`; status via `p-tag`.
