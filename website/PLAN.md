# Website build plan

Tracking the build-out of the marketing site in `/website`.

## Brand

### Logo assets (in `public/brand/`, extracted from `PEÑA NEVADA.pdf`)
- `penanevada-mark.png` / `penanevada-mark-light.png` — emblem only (transparent / white bg)
- `penanevada-wordmark.png` / `penanevada-wordmark-light.png` — text lockup
- `penanevada-full.png` / `penanevada-full-light.png` — emblem + wordmark
- Header & Footer use the white-bg emblem inside a `rounded-full bg-white` chip; no text wordmark.

### Color palette (wired in `tailwind.config.mjs` as Tailwind steps 50–950)
| Token     | Base (500) | Use                                   |
|-----------|------------|---------------------------------------|
| `granite` | `#4C5B5C`  | Neutral dark / body text / surfaces   |
| `navy`    | `#4C6783`  | Primary brand / dark surfaces         |
| `sky`     | `#4D91B6`  | Secondary accent / highlights         |
| `cyan`    | `#4BA8D1`  | CTA accent / link / "Chillers" accent |

Usage: `bg-navy-900`, `text-cyan-400`, `border-sky-500`, etc. Old `coral` / `golden` / `royal` / `nuclear` scales removed.

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
- [ ] Commit + push the brand asset / palette overhaul + env-var wiring + Clients rename.

## House rules (see `CLAUDE.md`)
- Tailwind 3.4.17 only; extend `tailwind.config.mjs` for any new tokens — no arbitrary values.
- `size-*` over `w-*` + `h-*` when equal.
- anime.js for animations only.
- No inline `style="..."` attributes.
