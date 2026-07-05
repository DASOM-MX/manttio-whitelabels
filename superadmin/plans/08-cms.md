# 08 — CMS (webpage content)

> **Status:** not-started · **Depends on:** 02 (CP-3)
> **Owner:** — · **Last updated:** 2026-07-05

The logged-in client edits their own marketing-site content (`cms_home`, `cms_clients`)
for their whitelabeled webpage. This absorbs the original superadmin plan
(`../manttio-whitelabeled-superadmin-plan.md`, now superseded) — scope and guardrails
carried over.

---

## 1. Permissions (default — adjustable)

- **Client can edit:** `cms_home`, `cms_clients`.
- **Brand:** read-only by default (whitelabel identity is set by *us* via the manager
  push). Flipping to client-editable is a one-line policy choice on the backend's write
  authz — the UI ships the editor behind that flag either way.

## 2. Expected API surface

- `GET /cms/home` · `PUT /cms/home`
- `GET /cms/clients` · `POST /cms/clients` · `PATCH /cms/clients/:id` ·
  `DELETE /cms/clients/:id`
- `POST /upload` → R2 key (existing upload module) for images
- `GET /cms/brand` (read-only v1)
- If draft→publish (see §5): `POST /cms/:section/publish` + draft/published variants on GET

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
- `cms/pages/brand-view/` — read-only brand identity card (or editable per §1 policy).
- **Publish control** *(only if draft→publish, §5)*: "Publish" action + an "unpublished
  changes" badge (draft vs last-published compare) on both editors.

## 4. State

- `CmsState`: `home`, `clients`, `brand`, `loading`, `dirty`/`unpublished` flags. Actions:
  `LoadCmsHome`, `SaveCmsHome`, `LoadCmsClients`, `CreateCmsClient`, `UpdateCmsClient`,
  `DeleteCmsClient`, `LoadBrand` (+ `PublishCms(section)` if publish-step).
- `src/http/cms.service.ts`.

## 5. Open decision (carried over — shapes this UI)

> **draft→publish vs edit=live.** If publish-step: editors save drafts and a Publish
> button pushes live. If edit=live: saves go live, no draft state, no Publish button.
> Decided on the backend (write paths); this UI mirrors the choice. **Blocker for CP-2 —
> resolve before building save flows.**

**Guardrail:** the HTML field is sanitized on the backend on write; still use a
constrained editor here.

---

## Checkpoints

### CP-1 — Repeater + read path
- [ ] `RepeaterComponent<T>` (add/remove/reorder, typed row templates)
- [ ] `CmsState` + service; home + clients + brand load and render read-only
- [ ] Route + sidebar entry live

### CP-2 — Editors *(blocked on §5 decision)*
- [ ] Home editor: scalars + all four repeater groups, single save
- [ ] Clients editor: table + drawer, image upload → R2 key, constrained rich-text
- [ ] Brand view (read-only or editable per policy flag)

### CP-3 — Publish + polish
- [ ] Publish control + unpublished-changes badge *(if publish-step)*
- [ ] Dirty-navigation guard (confirm on leaving with unsaved changes)
- [ ] Dark-mode audit; build green; manual pass: edit home → save → edit client entry
      with image → verify on the rendered site

## Open decisions / asks
- §5 draft→publish vs edit=live — backend decision, blocks CP-2.
- Rich-text control choice: PrimeNG Editor (Quill) constrained toolbar vs minimal custom
  contenteditable — decide at CP-2 start.
- Brand editability policy flag name/shape from backend.
