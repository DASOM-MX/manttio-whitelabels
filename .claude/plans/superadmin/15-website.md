# 15 — Website (public site: CMS content + brand consumption)

> **Status:** in-progress (CP-2) · **Depends on:** 03 (brand read path), 04 (publish flow)
> **Owner:** PR #44 (`feature/website-cms-brand-integration`) · **Last updated:** 2026-07-06

The consumer-side integration plan for the **tenant public website** — the
`website/`-replacement in the backend plan's system map. **Not a superadmin module**: no
nav entry, no Angular code; the work lives in the `website/` package (Astro). This file
exists so the read contract the website depends on is planned with the modules that
produce it. **Scope decided 2026-07-06: reads only** — the site renders itself from the
whitelabeled backend's **brand identity (03)** and **published CMS content (04)**; no
website→CRM lead capture in v1 (§5).

Today's `website/` is a single-page static Astro site for one brand (Hero / Services /
Manufacturers / Location / Clients sections, contact via `PUBLIC_CONTACT_*` env vars).
The whitelabeled site keeps that structure but every hardcoded string, color, logo, and
contact detail becomes a fetch.

---

## 1. What the website consumes

| Source | Endpoint | Feeds |
|---|---|---|
| Brand (03) | `GET /brand` — public, served via the per-tenant cache DO (03 §5.1) | name, slogan, logo/logo-dark/isologo (CDN URLs), materialized color scales, contact + social, font codes |
| Font catalog (03 §2.1) | `GET /fonts` — public | resolves `brand.font` codes → woff2 URLs for `@font-face` |
| CMS home (04) | public **published-only** read (§1.1) | hero titles/descriptions, badges, service targets, services, services_content, service_area |
| CMS clients (04) | public **published-only** read (§1.1) | client logos + `business_relation_description` entries |

Drafts never reach the site — the publish gate is the whole point of 04 §5.

### 1.1 Public published-read endpoints (ask — backend call)

04 §2 defines `GET /cms/home|clients` as **draft-for-editors** (authed). The website
needs the published counterpart as its own public route (e.g. `GET /public/cms/home` ·
`GET /public/cms/clients` — exact shape is the backend's call, recorded in
`backend/manttio-whitelabeled-backend-plan.md` §6). Same ask covers whether published
docs join the **`TenantCacheDO`** (backend plan §5) with invalidation on
`POST /cms/:section/publish` — they are the same hot-public-read profile as the brand.

## 2. Rendering model (open decision — lean recorded)

- **(a) Runtime fetch / SSR on CF (Astro adapter)** — one deployment serves every
  tenant, tenant resolved by hostname; a publish is live on the next request, no
  rebuild infra; pairs naturally with the DO-cached reads. **← lean.**
- **(b) Static build per tenant** — CF Pages deploy hook triggered by publish; cheapest
  serving, but per-tenant build pipelines and publish latency.
- **(c) Static shell + client-side hydrate** — no infra change, but content pops in
  after paint and SEO needs care. Not preferred.

Decide before CP-1; 04 CP-3's manual pass ("publish → verify on the rendered site")
runs against whichever model wins. Hostname→tenant mapping is provisioning/manager-side
— this plan only needs the resolved `api_base_url` contract.

## 3. Brand application

- **Colors:** materialized primary/surface scales → CSS variables backing the Tailwind
  palette tokens (same repoint-with-fallbacks approach as the apps — 03 §4; current
  Peña Nevada values are the fallbacks).
- **Fonts:** `brand.font` codes → catalog files → injected `@font-face`
  (`font-display: swap`), defaults Work Sans + Rubik — which the site already uses, so
  the default tenant renders pixel-identical.
- **Logos:** header/footer logo (+ dark variant where applicable), isologo as favicon —
  favicon/PWA icons stay provisioning-time in v1 (03 §1).
- **Identity:** name/slogan in hero + `<title>`/meta description; OG tags from
  name + logo; contact + social replace the `PUBLIC_CONTACT_*` env vars (footer,
  tel/mailto/WhatsApp links). Never "manttio" in rendered output (existing rule).

## 4. Section mapping (current site → CMS home/clients docs)

Hero ← home titles/badges · Services ← services + services_content · service
targets/areas ← service_targets + service_area · Clients ← `cms_clients` entries ·
Manufacturers/Location — fold into home doc groups or drop per-tenant (open, §6).
Header/Footer ← brand only.

## 5. Out of scope in v1 (decided 2026-07-06)

- **No CRM lead capture** — contact stays direct-channel links (tel / mailto / WhatsApp
  from `brand.contact`); a website form creating `status=lead, source=website`
  customers is the designated v2 growth path.
- No per-tenant custom sections/layouts, no CMS-driven navigation — every tenant gets
  the same section skeleton, content-varied only.

---

## Checkpoints

### CP-1 — Data layer + theming proof
- [x] Rendering model decided (§2): SSR — the site already ran the CF adapter;
      `prerender = false` on index (PR #44); typed fetchers for brand / fonts /
      published CMS in `website/src/lib/`
- [x] Brand applied: CSS-var palette repoint, @font-face injection, logos, meta —
      fallbacks render the current site unchanged when fetches fail (verified via
      `wrangler dev`)
- [x] Home hero renders from a live published `cms_home` doc *(verified against a
      mock backend — re-verify when the real endpoints land)*

### CP-2 — Full content
- [~] All home sections from the home doc — hero/services/clients/footer done;
      Manufacturers/Location §4 mapping decision still open
- [x] Clients section from published `cms_clients`
- [x] Contact/social/footer fully brand-driven; `PUBLIC_CONTACT_*` env vars deleted

### CP-3 — Publish loop + polish
- [ ] End-to-end with 04: edit → publish in superadmin → site reflects it (04 CP-3's
      manual pass rides this)
- [ ] SEO/OG audit, responsive audit, Lighthouse pass on the SSR/static output

## Open decisions / asks
- Rendering model (§2) — infra call, lean SSR-on-CF.
- **Ask backend (mirrored in backend plan §6):** public published-CMS read routes +
  published docs riding `TenantCacheDO` with publish-time invalidation.
- Manufacturers + Location sections: CMS-modeled groups vs dropped from the whitelabel
  skeleton (§4) — decide at CP-2 start.
- v2 (recorded, not planned): website lead-capture form → CRM (§5).
