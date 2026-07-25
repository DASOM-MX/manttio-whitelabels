# 06 — Reports

> **Status:** done (frontend side — backend reports changes pending; **backend
> report-templates module shipped 2026-07-09**: `modules/report-templates/` per §5.4
> — jsonb sections doc, draft⇄active→disabled lifecycle, reads open to any authed
> user / mutations admin-tier, `unit` whitelisted server-side (MAGNITUDES enum,
> number-only zod refine), migration `0013` applied to Neon. Still pending: reports
> capture/answer-snapshot rework, folio column, provisioning-time HVAC seed.)
> **Depends on:** 02 (CP-3, done)
> **Owner:** branch `feature/superadmin-reports` (stacked on the 02 shell PR) · **Last updated:** 2026-07-06

Admin-side browser for service reports captured in the field app. Superadmin **reads and
administers** report *instances*; it does not author them (capture stays in `frontend/`) —
but it **does author the templates those reports are captured from**: the custom
report-template builder (§5, owner/admin only) is this module's whitelabel headline.
Reports are the anchor for billing (09: bill-by-report) and material tracking
(10: materials consumed per report).

> **Standalone-suite rule (decided 2026-07-23).** Reporting is an **independently
> sellable suite** — a tenant may buy just the reporting flow without services/orders/
> calendar (18/19/12). So **reports never require a service order**: `serviceOrderId` /
> `serviceId` stay nullable *by design*, the manual create path is always complete on
> its own, and the order-driven bits (explosion, `pending`/`cancelled` statuses,
> template↔service prefilter) are **additive enrichments** that only light up when the
> operations suite is enabled. Nothing in 06 may hard-depend on 19. 06 depends only on
> 02 (never on 18/19).

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
  templateId, templateName,             // which template the report was captured from (§5.5)
  serviceDate, status,                  // confirm status enum against backend reports module
  billingStatus?: 'unbilled' | 'billed',   // derived, appears once 09 lands
  hasMaterialTracking?: boolean,           // appears once 10 lands
  createdAt
}
ReportDetail = ReportSummary + {
  sections: ReportAnswerSection[],      // template-shaped answers — §5.5 snapshot model
  signatureUrl?, photos: string[],      // R2 keys
  pdfUrl?
}
```

## 2. Expected API surface

- `GET /reports?page&limit&search&customerId&technicianId&templateId&from&to&status` → paged
- `GET /reports/:id`
- `GET /reports/:id/pdf` (existing pdf pipeline)
- `POST /reports/:id/resend-email` *(open decision)*
- `DELETE /reports/:id` with `{ deleteComment }` (soft delete)

## 3. Pages & components

- `reports/pages/reports-list/` — lazy `<p-table>`: folio, client, technician, template,
  service date, status pill; filters: date range (`<p-datepicker>` range), client select,
  technician select, **template select**, status. Row: view, PDF, delete. **QA
  2026-07-09:** whole row clicks through to the report view (05 §3 row-click pattern —
  `[rowHover]`, action cell stops propagation; action links stay the keyboard path).
- `reports/pages/report-view/` — read-only detail: header card (client/tech/date/
  template/status), **template-shaped body**: one `.card-section` per answer section,
  rendered at the section's captured column count (same skeleton the builder previews —
  reports are dynamic now, never assume the old fixed HVAC shape), photo grid, signature
  image (unstyled in dark mode per
  conventions), PDF download button. **"Enviar por correo" button (QA 2026-07-09,
  field-app parity):** finished/mailed reports, admin tier only (backend gate on
  `POST /reports/:id/email` is owner/admin); confirm dialog → send (backend defaults
  `to` to the customer email) → toast + reload so `finished` flips to `mailed`. Slots
  reserved for 09 (billing card) and 10 (materials card) — leave a clearly-marked
  placeholder region, don't build their UI.
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
  serviceId?,                                  // 19 CP-4 (2026-07-23): binds the
                                               //   template to a catalog service (18);
                                               //   fill-time picker prefilters by the
                                               //   report's serviceId, null = generic
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
          | 'select' | 'multiselect' | 'radio' | 'checkbox_group',
          // final set — decided 2026-07-05
  required: boolean,
  options?: string[],     // select / multiselect / radio / checkbox_group
  unit?: string,          // number only (rule 2026-07-09): nullable magnitude,
                          //   a display symbol from MAGNITUDE_OPTIONS ('cm',
                          //   'V', '°C', …) — grouped by category (longitud,
                          //   masa, volumen, eléctrico, presión, temperatura,
                          //   caudal, tiempo, general incl. u/par/%) and
                          //   rendered as-is next to the label everywhere
                          //   (builder preview, field app, PDF)
  constraints?: {         // per-datatype validation — in v1 (decided 2026-07-05)
    min?, max?,           //   number
    maxLength?,           //   text / textarea
    minDate?, maxDate?    //   date — 'today' | ISO date allowed as bounds
  }
}
```

- **Fixed skeleton — every template, non-negotiable:** **report heading** (system-owned:
  business info + client info — client, technician, service date, folio) →
  **content sections** (1..n, the tenant-designed part) → **images block** (photo
  grid, as today's reports — **confirmed 2026-07-05: fixed at the end, not
  builder-configurable; stays that way until a real tenant asks**) → **footer**: **comments** (always present, never
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
  control in the main app — text input, textarea, numeric input, datepicker, sí/no
  toggle, select (single, dropdown), multiselect (dropdown), radio group (single,
  options visible), checkbox group (multi, options visible). The two dropdown/visible
  pairs are deliberate: dropdowns for long option lists, radio/checkbox groups for
  short ones a technician should see at a glance. No `photo` datatype — the fixed
  images block covers photos.
- **Validation constraints — in v1 (decided 2026-07-05):** beyond `required`, a question
  can carry per-datatype `constraints` (number `min`/`max`; text/textarea `maxLength`;
  date `minDate`/`maxDate`). The builder shows the matching constraint fields when the
  datatype is picked (all optional — an unconstrained question stays the easy path);
  the field-app form and the backend both enforce them on capture.

### 5.2 Lifecycle

`draft ⇄ active → disabled` — **no versioning in v1 (decided 2026-07-05)**

- **draft** — freely editable; invisible to the field app.
- **active** — **the only state the field app ever sees** (its template fetch is scoped
  to active). Editing an active template = **pull it back to draft** (direct
  transition, no version copies), edit, re-activate; the field app simply stops
  offering it while it sits in draft. Accepted v1 trade-off: since there's no
  versioning, edits can change how previously captured reports re-render — mitigated
  by the answer-snapshot model (§5.5), which keeps captured reports rendering complete.
- **Status gates *starting* reports, never syncing them (decided 2026-07-05):** the
  field app is offline-first — a technician can hold a cached template that went back
  to draft (or disabled) mid-capture. **Sync always accepts** a report captured against
  a template in any state; deactivation/disable only stop *new* captures from being
  started. No field data is ever rejected at sync time.
- **disabled** — retired, terminal (to bring the shape back, duplicate it into a new
  draft). **Disabling requires a reason** (dialog, §5.3), stored as `disabledReason` +
  `disabledBy` + `disabledAt`. Reports already captured from a disabled template keep
  rendering.

### 5.3 Pages & components

- `templates/pages/templates-list/` — table: name, status pill (draft/active/disabled),
  question count, updated. Row: open. (Own feature folder — `/templates` is its own
  route area; still owned by this module's agent.) **QA 2026-07-09:** whole row clicks
  through to the builder (05 §3 row-click pattern) and the page rides ListQueryService
  (`?page` persists; no filters yet).
- `templates/pages/template-detail/` — the builder: **section editor** (add / reorder /
  remove / rename sections; per-section column selector 1/2/3) with a **question
  editor nested per section** (add / reorder / remove; label, datatype, required,
  options; **magnitude select for number questions** — nullable, category-grouped,
  rule 2026-07-09). **Sections and question metadata are accordions (QA 2026-07-09):
  the section title input and question label input stay always visible in the
  accordion headers; columns/questions and the per-question metadata fold. State is
  keyed by control instance (survives reorders); user-added items open expanded,
  hydrated ones start collapsed.** The **live preview** renders the full skeleton —
  heading mock,
  the sections stacked with their own grids (incl. the `| Label | value |` table for
  1-col sections), images/footer mock. **The preview lives on its own tab (QA
  2026-07-09 — Editor | Vista previa, ARIA tabs pattern; was a side-by-side pane).**
  **The preview always renders each section's
  selected column count — never collapse it (decided 2026-07-05):** on narrow
  viewports the panel becomes its own `overflow-x: auto` container (01 layout rule
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

### 5.5 Report ↔ template binding — answer snapshot model (decided 2026-07-05)

Every captured report references its template (`templateId`) **and snapshots what it
answered**: answers are stored per section, each answer carrying `questionId` **plus the
question's `label` and `datatype` at capture time** (cheap denormalization, not
versioning). Consequences:

- **Captured reports always render complete** — view, list, and PDF draw from the
  snapshot, so a template edit that deletes or relabels questions never blanks out
  historical reports (this is what makes the no-versioning trade-off in §5.2 safe).
- Superadmin's report-view (§3) and the PDF pipeline render **from the report's stored
  sections**, not by re-joining the live template. The live template is only consulted
  when *starting* a capture.

```
ReportAnswerSection { title, columns, answers: ReportAnswer[] }   // order preserved
ReportAnswer { questionId, label, datatype, value }               // label+datatype frozen at capture
```

**Field-app obligations (fork `frontend/` task, recorded in the backend plan §3):**

- **Template picker:** with 1..n active templates, starting a report begins with a
  "choose template" step (single active template skips it — straight into capture).
- **Existing reports retro-link:** at provisioning, previously captured fixed-HVAC
  reports are migrated to reference the seeded template (§5.2 seeding) with their
  answers expressed in the snapshot model, so every report in the system renders
  through one code path.

---

## Checkpoints

### CP-1 — List
- [x] DTOs + service + `ReportsState` (lazy `provideStates`); **status enum
      confirmed against the backend model 2026-07-06**
      (`created|in-progress|finished|mailed`); `folio` optional — no backend
      column yet (ask below)
- [x] List page: lazy server-side table, search + date-range + template +
      status filters, status pills (customer/technician selects wait for the
      07/05 lookup endpoints — the query DTO already carries both ids)
- [x] Route + sidebar entry live (shipped with 02)

### CP-2 — Detail
- [x] Report view: header card + **snapshot-rendered sections at captured
      column counts** (1-col = label|value rows), photo grid, signature on
      white, PDF download
- [x] Placeholder regions for billing (09) + materials (10) marked in template
      comments
- [x] Delete dialog (audit comment) + toasts

### CP-3 — Roles + polish
- [x] "Mis reportes" technician rendering of the same page (backend-scoped
      query; filters locked to search+dates, destructive actions hidden —
      no forked variant); route `data` declared (02)
- [x] Dark-mode variants; empty/loading states
- [x] Build green; headless pass (2026-07-06, part of 27/27): filter → view →
      PDF download → audit delete; technician sees own report only, no
      delete, no admin filters

### CP-4 — Templates: list + builder (owner/admin)
- [x] `ReportTemplatesState` + `report-templates.service.ts` + DTOs
- [x] Templates list at `/templates` (own **Plantillas** nav entry), status
      pills + question counts
- [x] Builder: section editor (add/reorder/remove/rename, per-section 1/2/3
      column selector) + nested question editor (add/reorder/remove, the nine
      datatypes, required, options, per-datatype constraint fields) + live
      full-skeleton preview (heading mock, stacked sections incl. 1-col
      `| Label | value |`, images/footer mock; true column count at every
      viewport via `min-w-preview` + overflow-x scroll)
- [x] Route `data` owner/admin only (verified: office bounces)

### CP-5 — Templates: lifecycle
- [x] Activate + deactivate (active → draft, the edit path) with confirm dialogs
- [x] Disable dialog with required reason; detail surfaces the stored reason
- [x] Draft-only editing in UI (active/disabled read-only; "Editar" on active =
      pull-to-draft)
- [x] Build green; headless pass 27/27 (2026-07-06): create draft → 3-col
      preview fidelity → constraints per datatype → save → activate (read-only)
      → deactivate (editable) → disable with reason (terminal read-only)

## Open decisions / asks
- ~~Status enum~~ — **confirmed 2026-07-06** against
  `backend/src/modules/reports/models/reports.model.ts`:
  `created|in-progress|finished|mailed`. **Folio: no backend column yet** —
  backend ask (DTO keeps it optional). **Amended 2026-07-23 (19):** the enum gains
  `pending` and `cancelled`. `pending` = service-order explosion skeletons (born with
  assignee + reportType, no content), `pending → in-progress` when the tech picks a
  template and starts. `cancelled` = an exploded report voided when its order is
  cancelled (only unfinished reports — `pending`/`in-progress`; finished/mailed stay).
  `created` stays the manual-report birth status. Reports also gain `serviceOrderId?` /
  `serviceId?` — semantics owned by `19-service-orders.md` §2. **These are additive:
  the standalone reporting suite ignores `pending`/`cancelled` and leaves the order
  columns null (standalone-suite rule above) — nothing here requires 19.**
- Customer/technician list filters: UI ships search + date + template + status;
  the id-based selects light up when 07 (customers) and a users lookup endpoint
  exist — query DTO already carries `customerId`/`technicianId`.
- Resend-email action: in or out for v1?
- Shared delete-dialog base component with 05: coordinate, don't duplicate silently.
- ~~Datatype set~~ — **resolved 2026-07-05, final nine:** `text` / `textarea` /
  `number` / `date` / `boolean` / `select` / `multiselect` / `radio` /
  `checkbox_group` (§5.1). `photo` dropped — the fixed images block covers it.
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
- ~~Report ↔ template binding~~ — **resolved 2026-07-05: answer snapshot model**
  (§5.5): reports store `templateId` + per-answer label/datatype snapshot; captured
  reports always render complete; template picker + retro-link recorded as field-app
  obligations.
- ~~Offline capture vs lifecycle~~ — **resolved 2026-07-05:** template status gates
  *starting* captures only; **sync always accepts** (§5.2).
- ~~Question-level validation~~ — **resolved 2026-07-05: in v1** — per-datatype
  `constraints` (number min/max, text maxLength, date min/max — §5.1), enforced in
  the field-app form and backend.
- **Number magnitudes (rule 2026-07-09):** `unit?` on number questions (§5.1) —
  field-app obligation: render the symbol next to the input label (and on the PDF)
  exactly as stored; no conversion, display-only.
