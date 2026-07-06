# 06 — Reports

> **Status:** not-started · **Depends on:** 02 (CP-3)
> **Owner:** — · **Last updated:** 2026-07-05

Admin-side browser for service reports captured in the field app. Superadmin **reads and
administers** report *instances*; it does not author them (capture stays in `frontend/`) —
but it **does author the templates those reports are captured from**: the custom
report-template builder (§5, owner/admin only) is this module's whitelabel headline.
Reports are the anchor for billing (09: bill-by-report) and material tracking
(10: materials consumed per report).

**Roles** (`14-access-control.md` §2): owner/admin full, office manage. **Technician** gets
the same list + view pages as a **"My reports"** route — pre-filtered to their own reports
(backend scopes the query), read-only (no delete/resend actions rendered) **with one
exception**: the materials block (10's `report-materials-editor`) is editable on their own
reports (§2.1b — tech records consumption from their own van; owner/admin correct). Reuse
the components with locked filters + hidden actions; don't fork variants.

---

## 1. Data model (DTO view)

```
ReportSummary {
  id, folio?, customerId, customerName,
  technicianId, technicianName,
  serviceDate, status,                  // confirm status enum against backend reports module
  billingStatus?: 'unbilled' | 'billed',   // derived, appears once 09 lands
  hasMaterialTracking?: boolean,           // appears once 10 lands
  createdAt
}
ReportDetail = ReportSummary + {
  details: ReportDetailItem[],          // sections/answers as backend returns them
  signatureUrl?, photos: string[],      // R2 keys
  pdfUrl?
}
```

## 2. Expected API surface

- `GET /reports?page&limit&search&customerId&technicianId&from&to&status` → paged
- `GET /reports/:id`
- `GET /reports/:id/pdf` (existing pdf pipeline)
- `POST /reports/:id/resend-email` *(open decision)*
- `DELETE /reports/:id` with `{ deleteComment }` (soft delete)

## 3. Pages & components

- `reports/pages/reports-list/` — lazy `<p-table>`: folio, client, technician, service
  date, status pill; filters: date range (`<p-datepicker>` range), client select,
  technician select, status. Row: view, PDF, delete.
- `reports/pages/report-view/` — read-only detail: header card (client/tech/date/status),
  `.card-section` per detail group, photo grid, signature image (unstyled in dark mode per
  conventions), PDF download button. Slots reserved for 09 (billing card) and 10
  (materials card) — leave a clearly-marked placeholder region, don't build their UI.
- `reports/components/delete-report-dialog/` — shape-3 dialog, audit comment (reuse the
  delete-dialog pattern; extract a shared base only if 05's agent agrees — record as ask).

## 4. State

- `ReportsState`: `list`, `total`, `loading`, `selected`, `filters`. Actions:
  `LoadReports(query)`, `LoadReport(id)`, `DeleteReport(id, comment)`.
- `src/http/reports.service.ts`.

## 5. Report templates — custom report builder (decided 2026-07-05)

Each tenant designs the report forms its technicians fill in the field app.
**Owner + admin only** (`14-access-control.md` §2) — office and technicians never see
this area.

**Placement + flow (decided 2026-07-05):** two separate routes — **`/reports`** (the
browser, §1–4) and **`/templates`** (this builder, its own top-level nav entry
**Plantillas**, owner/admin only). Flow: `/templates` → templates list → template
detail (builder + question preview).

### 5.1 Data model (DTO view)

```
ReportTemplate {
  id, name, description?,
  status: 'draft' | 'active' | 'disabled',
  sections: TemplateSection[],                 // 1..n, ordered (decided 2026-07-05)
  disabledReason?, disabledBy?, disabledAt?,   // set via the disable dialog
  createdAt, updatedAt
}
TemplateSection {
  id, order, title,
  columns: 1 | 2 | 3,                          // per-SECTION layout — each section
  questions: TemplateQuestion[]                //   owns its own grid + questions
}
TemplateQuestion {
  id, order, label,
  datatype: 'text' | 'textarea' | 'number' | 'date' | 'boolean'
          | 'select' | 'multiselect' | 'photo',   // proposed set — open decision
  required: boolean,
  options?: string[]                           // select / multiselect only
}
```

- **Fixed skeleton — every template, non-negotiable:** **report heading** (system-owned:
  business info + client info — client, technician, service date, folio) →
  **content sections** (1..n, the tenant-designed part) → **images block** (photo
  grid, as today's reports) → **footer**: **comments** (always present, never
  removable, not a question the builder can touch) + **signature (decided 2026-07-05
  — a selling point, not open to discussion):** every report, whatever its template,
  **requires a captured signature to be marked `finished` and to be mailed** —
  server-enforced status-transition guard, not just field-app UX.
- **Sections (decided 2026-07-05):** questions nest inside sections; a template has
  **1 to n sections**, each with its **own title, own 1–3 column layout, and own
  questions**. Sections stack vertically in order. Render target:

  ```
  ┌─────────────────────────────┐
  │        business info        │
  │         client info         │   ← heading (system-owned)
  ├─────────────────────────────┤
  │ Section A                   │
  │   q1       q2       q3     │   ← 3-col section
  │ Section B                   │
  │      q1         q2         │   ← 2-col section
  ├─────────────────────────────┤
  │      images  ·  footer      │   ← photo grid + comments + signature
  └─────────────────────────────┘
  ```

- **Layout:** per section — 1-col renders `| Label | value |` rows; 2/3-col render a
  grid (label above value). The field app collapses to 1 col on phone widths
  regardless — `columns` is the desktop/PDF layout.
- **Datatype drives the field-app input:** each question's datatype renders the matching
  control in the main app (text input, textarea, numeric input, datepicker, sí/no
  toggle, select, multiselect, photo capture).

### 5.2 Lifecycle

`draft ⇄ active → disabled` — **no versioning in v1 (decided 2026-07-05)**

- **draft** — freely editable; invisible to the field app.
- **active** — **the only state the field app ever sees** (its template fetch is scoped
  to active). Editing an active template = **pull it back to draft** (direct
  transition, no version copies), edit, re-activate; the field app simply stops
  offering it while it sits in draft. Accepted v1 trade-off: since there's no
  versioning, edits can change how previously captured reports re-render.
- **disabled** — retired, terminal (to bring the shape back, duplicate it into a new
  draft). **Disabling requires a reason** (dialog, §5.3), stored as `disabledReason` +
  `disabledBy` + `disabledAt`. Reports already captured from a disabled template keep
  rendering.

### 5.3 Pages & components

- `templates/pages/templates-list/` — table: name, status pill (draft/active/disabled),
  question count, updated. Row: open. (Own feature folder — `/templates` is its own
  route area; still owned by this module's agent.)
- `templates/pages/template-detail/` — the builder: **section editor** (add / reorder /
  remove / rename sections; per-section column selector 1/2/3) with a **question
  editor nested per section** (add / reorder / remove; label, datatype, required,
  options), and a **live preview** pane rendering the full skeleton — heading mock,
  the sections stacked with their own grids (incl. the `| Label | value |` table for
  1-col sections), images/footer mock. **The preview always renders each section's
  selected column count — never collapse it (decided 2026-07-05):** on narrow
  viewports the pane becomes its own `overflow-x: auto` container (01 layout rule
  `horizontal-scroll`); a 2/3-col section collapsing to 1 col in the preview would
  read as the selection not applying. Editing is draft-only — active and disabled
  templates open the builder read-only.
- `templates/components/disable-template-dialog/` — shape-3 dialog with a **required
  reason** (mirrors the delete-dialog audit pattern), dispatches disable, toasts.

### 5.4 Expected API surface

- `GET /report-templates?status&page&limit` → paged (the field app calls it scoped
  `active`)
- `GET /report-templates/:id`
- `POST /report-templates` · `PATCH /report-templates/:id` (**draft only** — backend
  rejects edits to active/disabled)
- `POST /report-templates/:id/activate` · `POST /report-templates/:id/deactivate`
  (active → draft, the edit path — §5.2)
- `POST /report-templates/:id/disable` with `{ reason }`

State: `ReportTemplatesState` + `src/http/report-templates.service.ts` (separate from
`ReportsState`).

---

## Checkpoints

### CP-1 — List
- [ ] DTOs + service + `ReportsState`
- [ ] List page with full filter bar + status pills
- [ ] Route + sidebar entry live

### CP-2 — Detail
- [ ] Report view page (cards, photos, signature, PDF link)
- [ ] Placeholder regions for billing (09) + materials (10) marked in template comments
- [ ] Delete dialog + toasts

### CP-3 — Roles + polish
- [ ] "My reports" technician route (locked filter, actions hidden) + route `data`
      declared on all pages
- [ ] Dark-mode audit; empty/loading/error states
- [ ] Build green; manual pass: filter by client + date → open report → download PDF →
      delete; as technician: only own reports, no destructive actions

### CP-4 — Templates: list + builder (owner/admin)
- [ ] `ReportTemplatesState` + `report-templates.service.ts` + DTOs
- [ ] Templates list at `/templates` (own top-level **Plantillas** nav entry),
      status pills
- [ ] Builder: section editor (add/reorder/remove/rename, per-section column selector)
      + nested question editor (add/reorder/remove, datatype, required, options),
      live full-skeleton preview (heading mock, stacked sections incl. 1-col
      `| Label | value |` rendering, images/footer mock; true per-section column
      count at every viewport — overflow-x scroll on mobile, no collapse)
- [ ] Route `data` owner/admin only; office/tech never see the entry

### CP-5 — Templates: lifecycle
- [ ] Activate (draft → active) + deactivate (active → draft, the edit path) with
      confirm dialogs
- [ ] Disable dialog with required reason; detail view surfaces the stored reason on
      disabled templates
- [ ] Draft-only editing enforced in UI (active/disabled open read-only; "edit" on an
      active template offers the pull-to-draft transition)
- [ ] Build green; manual pass: create draft → preview at 1/2/3 cols → activate →
      deactivate → edit → re-activate → disable with reason → confirm terminal
      read-only

## Open decisions / asks
- Status enum + folio field: confirm against backend `reports` module before CP-1.
- Resend-email action: in or out for v1?
- Shared delete-dialog base component with 05: coordinate, don't duplicate silently.
- **Datatype set (§5.1):** proposed eight (`text`/`textarea`/`number`/`date`/`boolean`/
  `select`/`multiselect`/`photo`) — still needs a veto pass.
- ~~Signature placement~~ — **resolved 2026-07-05: fixed skeleton, selling point.**
  Every report requires a signature to reach `finished`/mailed (§5.1, server-enforced).
- ~~Editing active templates~~ — **resolved 2026-07-05: no versioning in v1.** Direct
  `draft ⇄ active`; pull to draft, edit, re-activate (§5.2). Accepted trade-off: edits
  can change how previously captured reports re-render.
- ~~Re-activation of disabled~~ — **resolved 2026-07-05:** `disabled` is terminal;
  duplicate into a new draft to resurrect a shape (§5.2).
- ~~Seeding~~ — **resolved 2026-07-05:** every tenant starts with the **current fixed
  HVAC report as a seeded template** (created at provisioning, expressed as
  sections/questions in the new model; editable/disableable like any other).
