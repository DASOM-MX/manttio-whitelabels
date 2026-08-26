# Website build plan

Tracking the build-out of the marketing site in `/website`.

## Brand

### Logo assets (in `public/brand/`, extracted from `PEÑA NEVADA.pdf`)
- `penanevada-mark.png` / `penanevada-mark-light.png` — emblem only (transparent / white bg)
- `penanevada-wordmark.png` / `penanevada-wordmark-light.png` — text lockup
- `penanevada-full.png` / `penanevada-full-light.png` — emblem + wordmark
- Header & Footer use the white-bg emblem inside a `rounded-full bg-white` chip; no text wordmark.

### Color palette (wired in `tailwind.config.mjs`)
Two tenant scales at steps 0–1000 by 100, plus stock Tailwind `zinc` for chrome.

| Token     | Steps    | Source                            | Use                                  |
|-----------|----------|-----------------------------------|--------------------------------------|
| `primary` | 0–1000   | `--brand-primary-*` from `/brand` | Brand anchor: CTAs, links, emphasis  |
| `accent`  | 0–1000   | `--brand-accent-*` from `/brand`  | Categorical / decorative             |
| `zinc`    | 50–950   | Tailwind's own palette            | Chrome: text, borders, panels, ground |

Usage: `bg-primary-900`, `text-accent-400`, `border-zinc-200`. The one alias is
`bg-background` (= `zinc-50`), the page ground. Brand steps map onto zinc as
0 → 50 and 1000 → 950, interior one-to-one.

`granite` / `navy` / `sky` / `cyan` are **tombstoned** — declared as empty objects
so they emit no CSS. Never delete the empty declarations: `sky` and `cyan` are
stock Tailwind names, and `theme.extend` merges with the default theme, so a
straggler would silently render stock blue instead of nothing.

### Typography
- Headings: Rubik (self-hosted via Fontsource) → `font-heading`
- Body: Work Sans (self-hosted via Fontsource) → `font-sans`
- See memory entry on font caveat — kept for now, to be revisited.

## Tasks

- [x] **1. Main heading / top navigation bar.** Logo lockup + primary nav links.
- [x] **2. Hero (first-fold).** Large attention-grabbing section; must include the phrase **"Orgullosamente regiomontanos"** somewhere in the copy. Full viewport height on desktop.
- [x] **3. Services section.** Three offerings for both *domestic* and *industrial* cooling & heating equipment:
  - Mantenimiento
  - Renta
  - Venta
- [x] **4. Location section.** Business info card + embedded Google Maps pin at: **Vereda Tropical #265, Dos Ríos, Guadalupe, Nuevo León 67134**.
- [x] **5. Manufacturer partners.** Logo grid/strip: Carrier, York, Aqua Force, Trane, Lennox, Lenomex, Danfoss, Honeywell, BOSCH.
- [x] **6. Footer.** Contact info (phone, email, address), social links if any, copyright line.
- [x] **7. Clientes section.** Real client list with layered intro; ISSSTE legal name shown under the brand.
- [x] **8. Mobile overflow fixes.** Location section: JS-mounted iframe clamped to viewport, `min-w-0` chain on grid items, `break-words` on contact text.
- [x] **9. Actionable contact info.** `tel:` / `mailto:` anchors on phone + email tags.
- [x] **10. Brand asset & palette overhaul.** Logos extracted from PDF, new navy/sky/cyan palette wired, class sweep across all components, Header/Footer switched to white-chip emblem (no wordmark text). *(uncommitted)*
- [x] **11. Contact info via env vars.** `PUBLIC_CONTACT_PHONE` / `PUBLIC_CONTACT_EMAIL` consumed through `src/lib/contact.ts`; `.env.example` committed, `.env` gitignored. Real values to be set locally and in Cloudflare Pages env.

## Pending

- [ ] Self-hosted hero video URL → `Hero.astro` `heroVideoUrl` constant (Cloudflare-hosted).
- [x] Commit + push the brand asset / palette overhaul + env-var wiring + Clients rename.

## House rules (see `CLAUDE.md`)
- Tailwind 3.4.17 only; extend `tailwind.config.mjs` for any new tokens — no arbitrary values.
- `size-*` over `w-*` + `h-*` when equal.
- anime.js for animations only.
- No inline `style="..."` attributes.
