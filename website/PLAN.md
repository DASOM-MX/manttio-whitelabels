# Website build plan

Tracking the build-out of the marketing site in `/website`.

## Brand

### Color palette (wired in `tailwind.config.mjs` as Tailwind steps 50–950)
| Token           | Base (500) | Use                                   |
|-----------------|------------|---------------------------------------|
| `granite`       | `#4C5B5C`  | Neutral dark / body text / surfaces   |
| `coral`         | `#FF715B`  | Primary accent / CTAs                 |
| `golden`        | `#F9CB40`  | Secondary accent / highlights         |
| `nuclear`       | `#BCED09`  | Tertiary accent / "active" indicators |
| `royal`         | `#2F52E0`  | Link / informational accent           |

Usage: `bg-coral-500`, `text-granite-800`, `border-royal-600`, etc.

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

## House rules (see `CLAUDE.md`)
- Tailwind 3.4.17 only; extend `tailwind.config.mjs` for any new tokens — no arbitrary values.
- `size-*` over `w-*` + `h-*` when equal.
- anime.js for animations only.
- No inline `style="..."` attributes.
