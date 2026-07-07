# 04 — CMS (headless webpage content)

> **Status:** v1 done · **v1.1 home-doc extension done (frontend side — §6, approved
> 2026-07-07)** — backend `modules/cms` pending
> **Depends on:** 02 (CP-3, done)
> **Owner:** branch `feature/superadmin-cms` (stacked on the 02 shell PR) · **Last updated:** 2026-07-06

The logged-in client edits their marketing-site content (`cms_home`, `cms_clients`).
**The CMS is headless (decided 2026-07-05):** the backend stores and serves content
documents through an API; the tenant's public website is just one consumer, and nothing
here assumes a specific site frontend. **Brand identity is not CMS content** — it's its
own independent module (03); the two share nothing but the upload pipeline. This file
absorbs the original superadmin plan (`manttio-whitelabeled-superadmin-plan.md`, now
superseded) — scope and guardrails carried over.

---

## 1. Permissions (decided 2026-07-05)

`owner` + `admin` edit `cms_home`, `cms_clients`; office and technician have no CMS
access (`14-access-control.md` §2). The module is behind the tenant `cms` config flag.

## 2. Expected API surface

- `GET /cms/home` · `PUT /cms/home`
- `GET /cms/clients` · `POST /cms/clients` · `PATCH /cms/clients/:id` ·
  `DELETE /cms/clients/:id`
- Publish (decided 2026-07-05, §5): `GET`s above serve the **draft** to editors;
  `POST /cms/:section/publish` (section = `home` | `clients`) copies draft → published;
  the public read surface serves **published only**.
- `POST /upload` → R2 key (existing upload module) for content images

## 3. Pages & components

- `cms/components/repeater/` — the reusable **`RepeaterComponent`**: FormArray-backed
  add / remove / **reorder** (up/down buttons — the keyboard-accessible interaction;
  row enter via the shared `animate.enter` classes, per the revised 01 motion rules)
  used by every jsonb array group. Build first; everything else composes it.
- `cms/pages/home-editor/` — scalar fields (titles, descriptions, service_area) +
  repeater groups: badges, service targets, services, services_content. One save action
  for the whole document.
- `cms/pages/clients-editor/` — `<p-table>` of client logos/entries + **drawer form**
  per entry; image upload → R2 key via backend; `business_relation_description` through a
  **constrained rich-text control** (no arbitrary markup paste-through — backend sanitizes
  on write, the editor still restricts input).
- **Publish control**: "Publish" action + an "unpublished changes" badge (draft vs
  last-published compare) on both editors.

## 4. State

- `CmsState`: `home`, `clients`, `loading`, per-section `unpublished` flags. Actions:
  `LoadCmsHome`, `SaveCmsHome`, `LoadCmsClients`, `CreateCmsClient`, `UpdateCmsClient`,
  `DeleteCmsClient`, `PublishCms('home' | 'clients')`.
- `src/http/cms.service.ts`.

## 5. Save-flow model (decided 2026-07-05)

> **Draft→publish.** Editors save drafts; Publish pushes live — a half-edited homepage
> is never publicly visible. (Brand, by contrast, is direct-apply — `03-branding.md`
> §8.)

**Guardrail:** the HTML field is sanitized on the backend on write; still use a
constrained editor here.

## 6. Home-doc coverage audit vs the live site (2026-07-07)

Audit of `website/src/pages/index.astro` + its section components against the v1
`CmsHome` shape. The site renders **7 surfaces** (Header, Hero, Services, Clients,
Location, Manufacturers, Footer); v1 covers Hero + Services + a thin footer CTA.
Everything brand-shaped is already owned by 03 and is **not** duplicated here:

| Site content | Owner | Notes |
|---|---|---|
| Header/footer logos, colors, fonts | brand (03) | already integrated (15 §3) |
| Contact items (phone/email/address), map pin, directions | `brand.contact` + `brand.social.googleMaps` | Location section's left column + footer contact list |
| "Orgullosamente regiomontanos" tagline (hero + footer) | `brand.slogan` | |
| Footer blurb + `<meta description>` / OG description | `brand.description` | |
| Nav labels, CTA button labels, logo-ownership disclaimers, copyright line | fixed skeleton | per 15 §5 — no CMS-driven navigation/labels |
| Industries chips (Clients section) | **derived** | distinct `sector` values of published `cms_clients` — no field |

**Gaps — content with no home today.** Proposed **additive** `CmsHome` v1.1 fields
(jsonb doc → no migration pain; all optional so published v1 docs stay valid):

```ts
hero_video_url?: string;       // hero background video URL; empty → gradient fallback
clients_content?: {            // Clients section copy (entries stay in cms_clients)
  eyebrow?: string;            // "Clientes"
  title: string;               // "Construyendo confianza, proyecto por proyecto."
  description: string;         // section lede
  cta_title?: string;          // in-section CTA box ("¿Quieres ser nuestro próximo proyecto?")
  cta_description?: string;    // CTA box sub ("…te contacta en menos de 24 horas.")
};
manufacturers_content?: {      // Manufacturers section copy
  eyebrow?: string; title: string; description: string;
};
manufacturers?: {              // logo wall — name + logo only (decided 2026-07-07)
  name: string; logoKey?: string;   // upload → R2 key (same pipeline as cms_clients logos)
}[];
location_content?: {           // Location section copy (contact/map come from brand)
  eyebrow?: string; title: string; description: string;
  schedule?: string;           // "Lun a vie, 8:00 – 18:00" — shown under the phone item
};
// on CmsHomeService:
icon?: string;                 // curated lucide code — picker with exactly 12 icons
                               // (3×4 grid; model/constants/cms/service-icons.const);
                               // empty → the site keeps its positional defaults
```

**Decided 2026-07-07 (owner):** hero video URL and per-service icons are **in** v1.1
(icon picker = `cms/components/icon-picker/`, a CVA popover over the fixed 12-code set
rendered by `cms/components/service-icon/`). Manufacturers carry name + logo only.
Card accent colors still derive from brand scales (website-side concern).

**Editor impact (implemented):** home editor grows three tabs alongside
Portada/Servicios — **Clientes** (clients_content), **Marcas** (manufacturers_content +
manufacturers repeater w/ per-row logo upload, one upload at a time), **Ubicación**
(location_content). Section-copy groups are validator-free: an all-blank group is
omitted from the saved doc so the site keeps its fallbacks and published v1 docs
round-trip clean. Same single-document save + publish bar; all panels stay mounted.

---

## Checkpoints

### CP-1 — Repeater + read path
- [x] `RepeaterComponent` (add/remove/reorder via up/down buttons, row templates
      via `ng-template` context)
- [x] `CmsState` (lazy — `provideStates` in the route file) + `cms.service`;
      home + clients load and hydrate the editors
- [x] Route + sidebar entry live (behind the `cms` flag — shipped with 02;
      verified: tenants without `cms` bounce)

### CP-2 — Editors
- [x] Home editor: scalars + all four repeater groups (targets, badges, services,
      services_content) + contact_cta, single-document save
- [x] Clients editor: table + right drawer (appendTo body, slide motion disabled —
      PrimeNG 21 WAAPI-locks a mis-measured height), image upload → R2 key,
      constrained rich-text

### CP-3 — Publish + polish
- [x] Publish control + unpublished-changes badge on both editors (shared
      `publish-bar` component; §5)
- [x] Dirty-navigation guard (reusable `pendingChangesGuard`, confirm-dialog based)
- [x] Dark-mode variants throughout; build green; headless pass 17/17 (2026-07-06)
      vs a mock backend: edit home → draft save (public copy untouched) → publish
      clears badge; client create w/ logo upload + rich text → publish; delete;
      dirty-guard confirm; cms-flag bounce. Verification on the *rendered site*
      pends the real backend's published-read routes (15 §1.1)

### CP-4 — Home-doc v1.1 (§6 — approved 2026-07-07)
- [x] `CmsHome` DTO + mock backend extended with `hero_video_url`, `clients_content`,
      `manufacturers_content`, `manufacturers`, `location_content`, `services[].icon`
- [x] Home editor: Clientes / Marcas / Ubicación tabs; hero video URL field;
      manufacturers repeater with per-row logo upload → R2 key
- [x] Icon picker (12-code curated lucide set, 3×4 popover grid, CVA) on service cards
- [ ] Website consumes the new groups (tracked in 15 CP-2)

## Open decisions / asks
- ~~Rich-text control choice~~ — **decided 2026-07-06: minimal custom contenteditable
  CVA** (b/i/ul whitelist, paste-as-plain-text, DOM-walk sanitize) — no Quill
  dependency; backend sanitization stays authoritative.
- ~~§6 open items: hero background media; per-service icon codes~~ — **decided
  2026-07-07: both in** (hero video by URL; icons via the curated 12-code picker).
