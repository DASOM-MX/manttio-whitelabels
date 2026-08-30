# module-isolation / 04 — Provisioning, docs, and the manager push

> **Status:** planned · **Depends on:** 01–03 · **Touches:** docs + deploy process
> **Owner:** — · **Last updated:** 2026-08-29

Flags are set by hand for now (00 §4 decision 11). This file is the checklist that makes that
safe, the docs sweep that stops the old "no in-repo flag plumbing" rule from contradicting the
new one, and the specification of the manager push that is **not** being built here.

---

## 1. Per-tenant provisioning

`MODULES` sits next to `API_URL` in the **backend** Worker's dashboard — the app Workers get
nothing new (00 §4 decision 5). Plan 25 §7's three pieces still apply, and `keep_vars: true`
is what stops the next `wrangler deploy` from wiping it.

```
1. Provision the tenant DB      (backend: pnpm db:migrate)
2. Deploy the backend Worker    npx wrangler deploy --name <tenant>-api
3. Dashboard, backend Worker:   API_URL-side vars as today
                                MODULES = "operation-package"      <- new, plain text
4. Deploy superadmin + field app Workers, each with their own API_URL
5. Verify:  GET /modules with a tenant token lists exactly what was sold
            (and reports the expected `package`)
            the superadmin nav shows exactly those modules
            a disabled module's endpoint 403s module_disabled
```

**Write the package name when one fits.** The three (00 §3.3) cover what is actually sold:

| Sold as | `MODULES` | Gets |
|---|---|---|
| Field | `field-package` | core + CMS |
| Operation | `operation-package` | everything but the warehouse |
| Complete | `complete-package` | everything |
| Operation + warehouse trial | `operation-package,wms` | packages and keys mix freely |
| Anything bespoke | `wms,billing,calendar` | core + exactly those |

`complete-package` and an unset `MODULES` resolve to the same thing; **write it anyway** — an
unset variable cannot be told apart from a forgotten one. `core` is the one token that cannot
be combined with anything: a value that opens with it is a core-only tenant and nothing else,
and mixing it 503s (00 §3.5).

**Do not commit a value to `backend/wrangler.toml`.** A committed `MODULES` would make the
shared config file the authority again and `keep_vars` would stop protecting the dashboard
value — the same trap 25 §7 documents for `API_URL`. The file carries a comment only.

**Changing a tenant's modules later:** edit the variable, then redeploy or let isolates
recycle; users pick it up on their next page load. It is a provisioning action, not a live
kill switch (00 §7 risk 2).

**If the API starts answering 503 `module_config_invalid`,** read the `detail` field — it names
the offending key and the reason. That is the expected failure mode of a bad edit, and it is
loud on purpose (00 §7 risk 1).

## 2. Docs sweep (CP-5)

- [ ] `superadmin/14-access-control.md` — the 2026-07-15 correction block is **superseded**.
      Rewrite it to point at this suite: module gating exists, it is env-var sourced and
      backend-enforced, `hasModule` is real, and the axis-1 list is replaced by 00 §3's
      core/flagged split. Keep the dated trail (superseded-by, not deleted) per the standing
      convention for plan decisions.
- [ ] `superadmin/00-master-plan.md` — add a row pointing at this suite, as 25 has one.
- [ ] `backend/CLAUDE.md` — `requireModule` in the middleware conventions; `module_disabled`
      (403) and `module_config_invalid` (503) in the error-shape list.
- [ ] Root `CLAUDE.md` — one line under cross-cutting conventions: module availability is a
      per-tenant `MODULES` var on the backend Worker (package names or bare keys, mixed
      freely), enforced server-side, consumed by both apps via `GET /modules`.
- [ ] `superadmin/CLAUDE.md` + `frontend/CLAUDE.md` — one pointer each to their leg.
- [ ] The `field-app-design` and `superadmin-design` skills — module agents must declare
      `data: { module }` and gate embedded cross-module blocks (02 §7). Add it where each
      skill's pre-close checklist lives.

## 3. The manager push — specified, not built

The whitelabel manager (a separate app, not this repo) owns which modules an organization
bought. Today a human copies that into the tenant Worker's dashboard. Two shapes for closing
that gap, neither chosen:

| | **A — Cloudflare API** | **B — backend endpoint** |
|---|---|---|
| Mechanism | Manager `PATCH`es the Worker's `MODULES` var via the CF API | Manager `POST`s the list to the tenant backend over the shared token |
| Storage | Stays an env var — one source of truth, no schema | Needs a row (and therefore a table, migration, and read path) |
| Takes effect | Next isolate / redeploy | Immediately |
| Cost | A CF API token per tenant account, with Worker-edit scope, held by the manager | Reverses 00 §4 decision 5 — flags become data, not deployment identity |
| Audit | Cloudflare's own deployment history | Would want an append-only event table of its own |

**A** preserves every decision in this suite and is the smaller change; **B** is the one that
makes a flag flip instant and auditable in-product. Pick when the manager side is actually
being built — this suite deliberately does not force it, and nothing in 01–03 assumes either.

## 4. Checkpoint

### CP-5 — provisioning + docs
- [ ] §1 checklist added to the deploy documentation the other Worker steps live in
- [ ] `MODULES` comment (no value) in `backend/wrangler.toml`
- [ ] Every §2 doc updated, with 14's correction block properly superseded rather than edited
      away
- [ ] §3 recorded as the standing open item, cross-linked from 00 §8
- [ ] One end-to-end pass on a scratch Worker: `MODULES="core"` → both apps render a
      core-only product, every flagged endpoint 403s, and `MODULES` unset restores everything
- [ ] The same pass for each package: `field-package` (CMS only), `operation-package` (no
      warehouse anywhere, PWA included), `complete-package` (identical to unset), plus one
      mixed value such as `operation-package,wms`
