# 04 — CMS (headless webpage content)

> **Status:** not-started · **Depends on:** 02 (CP-3)
> **Priority:** **first after 02, alongside 03** (prioritized 2026-07-05)
> **Owner:** — · **Last updated:** 2026-07-05

The logged-in client edits their marketing-site content (`cms_home`, `cms_clients`).
**The CMS is headless (decided 2026-07-05):** the backend stores and serves content
documents through an API; the tenant's public website is just one consumer, and nothing
here assumes a specific site frontend. **Brand identity is not CMS content** — it's its
own independent module (03); the two share nothing but the upload pipeline. This file
absorbs the original superadmin plan (`../manttio-whitelabeled-superadmin-plan.md`, now
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

- `cms/components/repeater/` — the reusable **`RepeaterComponent<T>`**: FormArray-backed
  add / remove / **reorder** (anime.js for the reorder animation, per conventions) used by
  every jsonb array group. Build first; everything else composes it.
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

---

## Checkpoints

### CP-1 — Repeater + read path
- [ ] `RepeaterComponent<T>` (add/remove/reorder, typed row templates)
- [ ] `CmsState` + service; home + clients load and render read-only
- [ ] Route + sidebar entry live (behind the `cms` flag)

### CP-2 — Editors
- [ ] Home editor: scalars + all four repeater groups, single save
- [ ] Clients editor: table + drawer, image upload → R2 key, constrained rich-text

### CP-3 — Publish + polish
- [ ] Publish control + unpublished-changes badge on both editors (§5)
- [ ] Dirty-navigation guard (confirm on leaving with unsaved changes)
- [ ] Dark-mode audit; build green; manual pass: edit home → save draft (site
      unchanged) → publish → verify on the rendered site; edit client entry with
      image → publish

## Open decisions / asks
- Rich-text control choice: PrimeNG Editor (Quill) constrained toolbar vs minimal custom
  contenteditable — decide at CP-2 start.
