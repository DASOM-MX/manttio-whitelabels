# Manttio — Whitelabeled Main Frontend Plan

**Repo:** `manttio` (main product repo) · the public website each tenant serves to visitors.
**Role:** the public-facing site, themed per tenant from its brand + CMS. Read-only to
visitors; no editing here.

System map: whitelabeled backend (public CMS read API) → **[this] whitelabeled frontend**.

---

## 1. Boundaries

**Consumes**
- The *whitelabeled backend* **public CMS read API** — `brand`, `cms_home`, `cms_clients`.
- R2-hosted assets via keys returned in that payload (logo, favicon, images).

Visitors never authenticate. This app only reads.

---

## 2. Theming (database-driven whitelabel)

The brand config drives the whole look at runtime:
- `primary_color` / `secondary_color` → CSS custom properties applied at boot.
- `font_family` + `font_source` (`google` → load from Google Fonts; `r2` → self-hosted font
  file by key; `system`) → applied globally.
- `logo_key`, `favicon_key` → resolved to R2 URLs; favicon served at `/favicon.ico`.

Brand is fetched once at boot/SSR (envID-keyed) and cached by the backend's DO, so theming
costs one fast read.

---

## 3. Pages / sections

- **Home** — heading_title + heading_description; badges (years/clients/projects, may vary);
  service targets (Nave industrial, Pista de hielo…); services (Venta, Renta, Reparación);
  services_content cards (title/description/image|icon); service_area (display copy); contact
  block from `brand_profile`.
- **Clients / portfolio** — list ordered by sort_order, active only: logo, images (≤5),
  line_of_business, and `business_relation_description` (**HTML — render sanitized**).

---

## 4. Concerns

- **SEO / SSR:** it's a public marketing site, so prefer **SSR or prerender** over pure CSR
  (Angular SSR / static prerender) for crawlability and first-paint.
- **HTML field guardrail:** even though the backend sanitizes on write, render
  `business_relation_description` through Angular `DomSanitizer` / DOMPurify (defense in depth).
- **Fonts:** decide google vs R2-hosted per the brand's `font_source`; avoid layout shift.
- **Performance:** all content reads hit the backend's DO cache; no direct DB access from here.

---

## 5. Build checklist  ( `- [ ]` / `- [~]` / `- [x]` )

**Shell & theming**
- [ ] Boot/SSR fetch of brand config (envID-keyed)
- [ ] Apply colors → CSS variables, font per `font_source`
- [ ] Logo + favicon from R2 keys (favicon route)

**Pages**
- [ ] Home (heading, badges, service targets, services, services_content, service_area, contact)
- [ ] Clients/portfolio (list, images, sanitized HTML description)

**Hardening**
- [ ] SSR/prerender for SEO
- [ ] DomSanitizer/DOMPurify on the HTML field
- [ ] Loading/empty states; graceful render if a section is empty

**Stack:** Angular + PrimeNG + Tailwind (standalone + signals), SSR/prerender · served by the
instance · reads the whitelabeled backend public API.
