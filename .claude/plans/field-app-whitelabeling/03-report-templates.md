# Whitelabel 03 — Report templates → field app (capture rework)

> **Status:** planned · **Last updated:** 2026-08-17 · **PRs:** one per checkpoint (stacked)
> **Part of:** `.claude/plans/field-app-whitelabeling/` (see `00-master` for the suite map).
> **Depends on:** shipped backend `modules/report-templates/` (2026-07-09, migration `0013`) ·
> shipped superadmin builder (`06-reports.md` §5, CP-4/CP-5) — this plan is the **field-app
> counterpart** of that builder, plus the backend rework both sides have been waiting on.
> **Owner:** worktree `../manttio-whitelabeled-worktrees/field-app-templates` (off `main`).
> CP-4…CP-6 are executed by the **`report-templates-field-app` agent**
> (`.claude/agents/report-templates-field-app.md`, haiku, `frontend/`-only, commits but never
> pushes); its conventions are the **`field-app-design`** skill. CP-1…CP-3 (backend) and CP-7
> (superadmin) stay with the main session.
> **Supersedes:** the uncommitted 2026-07-10 draft that lived in the `frontend-report-templates`
> worktree (scope re-decided 2026-08-16 — see Decisions). That worktree and its branch were
> **removed 2026-08-17**; its 8 commits were already on `main` via squash-merge and the draft
> itself is fully superseded by this file.

The tenant **authors** its report forms in superadmin (`/templates`, shipped). The field app
still captures against **three hardcoded HVAC forms** compiled into `report-add.ts`. This plan
closes that loop: the field app pulls active templates from the backend, caches them for
offline, and renders capture + detail **entirely from the template/snapshot** — and the backend
`reports` module is reworked in lockstep to store the answer snapshot and serve the contract
both apps already expect.

> **Why this belongs in the whitelabeling suite.** Whitelabeling the field app has two axes:
> **how it looks** (brand — plans 01/02, shipped) and **what it asks** (the report forms — this
> plan). A tenant that cannot change the questions its technicians answer is not whitelabeled,
> it is re-skinned. `minisplit | chiller | uma` is the last hardcoded piece of *the previous
> tenant's business* left in shipped app code.

---

## Decisions (locked 2026-08-16, owner)

These five answers set the scope; they are not re-litigated per checkpoint.

1. **Clean cut — no legacy support.** No backfill, no retro-link migration, no legacy fallback
   renderer. Reports captured under the flat `minisplit/chiller/uma` shape are **not migrated
   and not specially rendered**. Confirmed: this tenant has no report history worth keeping, so
   the plan assumes every real report carries a `template_id`. **This is the assumption to
   re-check before CP-1 lands** — it is the one decision that cannot be walked back cheaply.
2. **Seed = one-off script, not provisioning.** The three HVAC forms ship as
   `pnpm seed:hvac-templates`, run per-tenant on request. A new tenant starts with **zero
   templates** and authors its own in superadmin — so the field app's zero-active-templates
   empty state is a **real first-run path**, not an edge case.
3. **The reports API contract unification is in scope.** `GET /reports` becomes
   `{ items, total, page, limit }` and `GET /reports/:id` becomes the flat `ReportDetail`
   carrying `sections`. Both apps are repointed in the same PR window.
4. **`template_id` replaces `report_type` end-to-end.** The order explosion (19) and the
   quotation→order assignment (20) pick a **template** per line; `reports.report_type` is kept
   (no destructive migration) and written as the **template name** for display/back-compat; the
   `reportTypes` enum is deleted from every module.
5. **One plan file, one PR per checkpoint** (stacked), per the standing granularity rule.

**Amended 2026-08-17 (owner):**

6. **The template picker is a lazy, server-paged `<p-select>` + a background prefetch.**
   The select pages from the backend as the technician scrolls (`[lazy]` + `[virtualScroll]`
   + `(onLazyLoad)`, supported by PrimeNG 20.4); separately, a background pass walks every
   page once per session into Dexie so **offline keeps parity with online**. Supersedes the
   original §4.1/§5.1 single `limit=100` fetch — see §4.1a.
7. **CP-4…CP-6 are delegated to the `report-templates-field-app` agent** (`.claude/agents/`,
   haiku, `frontend/` only, commits but never pushes). Backend CP-1…CP-3 and superadmin CP-7
   stay with the main session. The agent's conventions live in the `field-app-design` skill.

---

## Boundaries

**The field app consumes** (product-user JWT, never the shared token):

- `GET /report-templates?status=active&page&limit` → `{ items, total }` — always scoped
  `active` (`06 §5.2`: active is the only state the field app ever sees).
- `GET /report-templates/:id` → the bare template row (freshness refresh; the list already
  returns full rows, so detail is rarely needed).

**The field app never** creates, edits, activates or disables a template — those are owner/admin
surfaces in superadmin (`06 §5.4`). `/report-templates` is read-only here.

---

## 1. Current reality (verified against `main` `0ff1545`, 2026-08-16)

**Backend — `modules/report-templates/` is shipped and complete.** Table with a `sections`
jsonb doc, `TemplateStatus`/`QuestionDatatype`/`Magnitude` TS enums, the nine datatypes, the
33-symbol magnitude whitelist enforced number-only in zod, `draft ⇄ active → disabled`, reads
open to any authenticated user, mutations admin-tier. Mounted at `/report-templates`
(`index.ts` L74/L91). **Nothing consumes it but superadmin.**

**Backend — `modules/reports/` has no idea templates exist.**

- `reports.model.ts`: **no `template_id` column**. `report_type` is `text NOT NULL` + indexed,
  typed `$type<ReportType>()`. `service_order_id` / `service_id` exist and are nullable by
  design (19 §1). `report_details.data` is untyped jsonb holding the flat per-type object.
- `validators/reports.validator.ts`: three hand-written zod schemas
  (`minisplit`/`chiller`/`uma`) + `validateReportData()` dispatching on `report_type`.
- `helpers/report-labels.helpers.ts`: `FIELD_LABELS` — a hardcoded Spanish label map for the
  previous tenant's HVAC questions.
- `helpers/report-pdf.helpers.ts`: ~200 lines of `if (reportType === 'chiller') drawRow(…)`
  hand-laid tables, one branch per variant, with an `else` that prints *"Sin datos específicos
  de mantenimiento"*.
- `helpers/report-email.helpers.ts`: its own `REPORT_TYPE_LABELS` (L16) feeding `workTypeLabel`.
- `GET /reports` returns `{ reports: rows }` (**unpaged**); `GET /reports/:id` returns
  `{ report, details }`.

**Field app — zero template machinery.** `report-add.ts` holds `buildFields()` (three
`FieldConfig[]` literals, ~45 hardcoded Spanish labels), `buildReportData()` (three flat
mappers, `yesNoToBool` on `'Sí'` strings, every reading stringified), a 3-option
`reportTypeOptions` select, and a 300 ms fade/remount animation between variants.
`report-detail.model.ts` flattens all three variants into one optional-field bag;
`report-detail.mapper.ts` spreads `...data` over it. Dexie is at **v2**
(`pendingReports`, `pendingVisitActions`), `ngsw-config.json` has **no `dataGroups`**.

**Superadmin — already written against a contract the backend does not serve.** This is the
finding that makes the backend leg urgent, not merely nice:

| superadmin expects | backend actually serves |
|---|---|
| `GET /reports` → `{ items, total, page, limit }` | `{ reports: [...] }`, unpaged |
| `GET /reports/:id` → flat `ReportDetail` with `sections` | `{ report, details }`, `details.data` flat |
| `ReportSummary.templateId` / `templateName` | no such columns |
| list filter `templateId` (wired in `reports-list.ts` L127) | filter not implemented |

So superadmin's shipped reports browser (06 CP-1/CP-2) renders **no body at all** today —
`@for (section of r.sections; …)` iterates `undefined`. The rework below is what lights it up.

---

## 2. Data model

### 2.1 Template shapes (mirror the backend row verbatim — camelCase, `c.json` of a Drizzle row)

Field app: enums/unions in `src/app/data/types/report-template/`, interfaces in
`src/app/data/dtos/report-template/` (existing split convention). **Enums are real TS enums**
(repo rule), one per file. **No `index.ts` barrels** (standing rule) — import concrete files.

```ts
enum ReportTemplateStatus { Draft = 'draft', Active = 'active', Disabled = 'disabled' }
enum QuestionDatatype { Text='text', Textarea='textarea', Number='number', Date='date',
  Boolean='boolean', Select='select', Multiselect='multiselect', Radio='radio',
  CheckboxGroup='checkbox_group' }                       // final nine (06 §5.1)
enum Magnitude { … }                                     // 33 symbols, mirrors the backend enum

type TemplateColumns = 1 | 2 | 3;   // DESKTOP layout only — never bound raw (§5.3)

interface QuestionConstraints { min?: number; max?: number; maxLength?: number;
                                minDate?: string; maxDate?: string; }   // 'today' | ISO
interface TemplateQuestion { id: string; order: number; label: string;
  datatype: QuestionDatatype; required: boolean; options?: string[];
  unit?: Magnitude; constraints?: QuestionConstraints; }
interface TemplateSection { id: string; order: number; title: string;
  columns: TemplateColumns; questions: TemplateQuestion[]; }
interface ReportTemplate { id: string; name: string; description?: string | null;
  status: ReportTemplateStatus; sections: TemplateSection[];
  disabledReason?: string | null; disabledBy?: string | null; disabledAt?: string | null;
  createdAt: string; updatedAt: string; }
interface ReportTemplateListResponse { items: ReportTemplate[]; total: number; }
```

### 2.2 The capture snapshot (what a report *stores*)

Matches `06 §5.5`, extended with `unit` so PDF/detail keep numeric fidelity. Written into
`report_details.data`; the column type does not change.

```ts
interface CapturedAnswer { questionId: string; label: string;        // frozen at capture
  datatype: QuestionDatatype; unit?: Magnitude;
  value: string | number | boolean | string[] | null; }
interface CapturedSection { title: string; columns: TemplateColumns; answers: CapturedAnswer[]; }
interface ReportCapture { templateId: string; templateName: string;  // denormalized for display
  sections: CapturedSection[]; }
```

> **Break from today:** numbers are stored as real `number` (were strings), booleans as real
> `boolean` (were `'Sí'`/`'No'`), multi-answers as `string[]`. `label`/`datatype`/`unit` are
> **frozen per answer**, which is what makes the no-versioning trade-off (`06 §5.2`) safe: a
> later template edit can never blank a captured report.

The **fixed skeleton stays outside the template** (`06 §5.1`, non-negotiable): report heading
(business + client + technician + date + folio), then the template sections, then the **images
block**, then the footer (**comments** + **signature**). Photos, comments and signature are
never questions and never builder-configurable.

---

## 3. Backend — `modules/reports/` rework

### 3.1 Schema + migration

- Add `template_id uuid` to `reports`, FK → `report_templates.id` `ON DELETE RESTRICT`
  (no cascades — fork rule), indexed.
- **Nullable in the DDL** (an existing table cannot gain a `NOT NULL` column without a default,
  and legacy rows have no template), but **required by the validators** for every new capture.
  The nullability is a DDL artifact, not an application-level option.
- `report_type` **stays** (no destructive migrations) and is now written as the **template
  name** — a denormalized display value, no longer an enum. Its index stays.
- `report_details.data` stays jsonb; it now holds a `ReportCapture`. Add typed reader/writer
  helpers; **do not** `$type<>()` the column (the snapshot is versionless by design).
- Migration is idempotent (`ADD COLUMN IF NOT EXISTS`, FK in a `DO $$ … EXCEPTION WHEN
  duplicate_object` block, `CREATE INDEX IF NOT EXISTS`) per the backend migration rules.
  Generate it with `pnpm db:generate`, **read the SQL**, then `pnpm db:migrate` — never
  hand-apply.

### 3.2 Capture contract (validators)

- Delete `minisplitDataSchema` / `chillerDataSchema` / `umaDataSchema` /
  `reportPayloadSchema` / `validateReportData` / `isReportType`.
- New `captureSchema` validates the `ReportCapture` **structurally only**: `templateId` uuid,
  `templateName` non-empty, sections/answers well-formed, `value` typed against `datatype`.
- **No re-validation against the live template.** `06 §5.2` is explicit: template status gates
  *starting* a capture, never syncing one. A report captured offline against a template that has
  since been edited, deactivated or disabled **must still sync**. Constraint enforcement
  (min/max/maxLength/dates) is a **field-app form** concern only.
- `createReportMetaSchema`: `report_type` → `template_id` (uuid, required).
  `listReportsQuerySchema`: the `report_type` filter → `template_id`, plus `page`/`limit`.
- The **signature-to-`finished` guard stays server-enforced** (`06 §5.1` — a selling point):
  no signature, no `finished`, no mail.

### 3.3 API contract unification (decision 3)

- `GET /reports` → `{ items, total, page, limit }`. Query gains `page`, `limit`, `templateId`,
  and the `search`/`from`/`to`/`customerId`/`technicianId` filters superadmin already sends.
  Technician auto-scoping (`assignedTo = me`) is unchanged.
- `GET /reports/:id` → the **flat `ReportDetail`**: summary fields + `sections` (from the
  snapshot) + `photos` + `signatureUrl` + `comments`. The `{ report, details }` envelope is
  retired.
- Both list and detail join and return `templateId` + `templateName`.
- **Both apps repoint in the same PR window** — the field app's `ReportsState`
  (`{ reports }` → `{ items, total }`, `selected`/`selectedDetails` → one `ReportDetail`) and
  superadmin's, which finally receives what it was written for.
- **Minor nit while in here:** `GET /report-templates` returns `{ items, total }` but superadmin
  types it `PagedResponse` (`items,total,page,limit`). Echo `page`/`limit` for consistency.

### 3.4 Render paths

- **PDF** (`helpers/report-pdf.helpers.ts`): the per-variant `drawRow` blocks and the *"Sin
  datos específicos de mantenimiento"* fallback are deleted. One snapshot-driven table builder:
  section title → section header, answers → rows at the section's stored `columns` (a PDF page
  is fixed-width — the desktop count is used directly, no responsive step). Numeric answers
  render `value + unit`. Keep composing the generic `modules/pdf/` toolkit; brand colors keep
  coming from the brand row (plan 01).
- **Email** (`helpers/report-email.helpers.ts`): its local `REPORT_TYPE_LABELS` (L16) and
  `workTypeLabel`'s reportType fallback → the report's `templateName`.
- **Labels** (`helpers/report-labels.helpers.ts`): `FIELD_LABELS` + `REPORT_TYPE_LABELS` +
  `labelForField` deleted — the snapshot carries its own labels. `formatScalar` / `formatBoolean`
  stay (still the value formatters).

### 3.5 `templateId` replaces `reportType` in 19 / 20 (decision 4)

`ReportType` is not field-app-only — it is baked into the operations suite:

| File | Today | Becomes |
|---|---|---|
| `reports/enums/reports.enum.ts` | `reportTypes` / `ReportType` | **deleted** |
| `service-orders/validators/service-orders.validator.ts` L29 | `reportType: z.enum(reportTypes)` | `templateId: z.string().uuid()` |
| `service-orders/types/service-orders.types.ts` (3 sites) | `reportType: ReportType` | `templateId: string` |
| `service-orders/services/order-from-quotation.service.ts` | assignment `{ technicianId, reportType }` | `{ technicianId, templateId }` |
| `quotations/validators/quotations.validator.ts` L138 | `reportType: z.enum(reportTypes)` | `templateId: z.string().uuid()` |

The explosion writes `template_id` (and `report_type = template.name`) onto each skeleton, so a
`pending` report opens straight into its assigned template. Validate the referenced template
exists and is `active` **at assignment time** (a 400, same shape as the existing
`invalid_client`) — assignment is an admin-tier authoring action, unlike sync.

### 3.6 HVAC seed script (decision 2)

`scripts/seed-hvac-templates.ts` + `pnpm seed:hvac-templates`, mirroring `seed:admin`. Creates
three **`active`** templates — Minisplit, Chiller, UMA — reproducing today's `buildFields()`
labels, now properly typed (`boolean` instead of `'Sí'`/`'No'` selects, `number` + magnitude
instead of stringly readings). Idempotent by name. **Not** part of provisioning: a new tenant
starts empty and authors its own.

---

## 4. Field app — template consumption

### 4.1 Service — `src/http/report-templates.service.ts`

Thin `RemoteService` wrapper (mirrors `CustomersService`): `list({ status: 'active', page,
limit })` → `{ items, total }`, and `get(id)`. **Always paged** — `page`/`limit` are real
parameters, not a fixed `limit=100` (decision 6).

### 4.1a Paging model — lazy picker + background prefetch (decision 6)

Two consumers of one endpoint, and they are deliberately different:

| Path | Reads | Why |
|---|---|---|
| **Picker, online** | `page=N&limit=20` on `(onLazyLoad)` | first options paint immediately, no full-catalog wait |
| **Background prefetch** | walks `page=1…` until `loaded >= total`, once per session | Dexie ends up with **every** active template |
| **Picker, offline** | the full Dexie set, scroller pages client-side | offline parity — a technician who only scrolled page 1 still reaches template 47 |

The prefetch is a distinct action (`PrefetchActiveTemplates`) from the lazy page load
(`LoadTemplatePage`), sequenced with `concatMap` and fully `catchError`-guarded: **a failed
prefetch must never break the picker**, which is already usable off page 1. It is fire-and-
forget on entry to the capture flow, not a gate.

### 4.2 State — `src/state/report-templates/` (NGXS, network-first + cache-fallback)

Entity store mirroring `ReportsState`'s shape and `offline-reports.state.ts`'s **RxJS-pipeline
action style** (repo rule: `from(...)` at the Dexie boundary, `switchMap`/`tap`/`catchError`/
`finalize`, never `async`/`await` in a handler). Registered in `app.config.ts`; **not** added to
the storage-plugin keys — Dexie is the source of truth (same rule as `OfflineReportsState`).

```ts
interface ReportTemplatesStateModel {
  entities: Record<string, ReportTemplate>;
  /** Sparse by design: index = server row position, holes = not yet paged in.
   *  Drives the virtual scroller's pre-sized options array (§5.1). */
  ids: (string | undefined)[];
  total: number;
  loading: boolean; fromCache: boolean; prefetchDone: boolean; lastSyncAt?: string;
}
// LoadTemplatePage(page, limit):
//   online  → api.list({status:'active', page, limit})
//             → tap(patch entities + splice ids at (page-1)*limit, total, fromCache:false)
//             → concatMap(cache.putAll)   catchError → cache fallback
//   offline → from(cache.list()) → patchState(fromCache:true, prefetchDone:true)
// PrefetchActiveTemplates:  concatMap over page=1.. until loaded >= total
//                           → cache.putAll   catchError → EMPTY (never breaks the picker)
```

Online/offline comes from `select(AppState.isOnline)` — never `navigator` directly.

### 4.3 Offline cache — Dexie `version(3)`

`OfflineDb` is at v2 (`pendingReports` v1, `pendingVisitActions` v2). Add a third store
non-destructively — unlisted stores carry forward, so v3 declares only what it adds:

```ts
this.version(3).stores({
  reportTemplates: 'id, updatedAt, status, cachedAt',   // read cache
  templateCacheMeta: 'key',                             // provenance, one row
});
```

New `src/offline/templates-cache.service.ts` (Promise-based, mirrors `OfflineReportsService`):
`putAll` / `list` / `get` / `count` / `getMeta` / `setMeta` / `clear`.

**A cached row carries the whole template doc.** The store string lists only the *indexed*
columns; Dexie persists the rest, so `sections` — every question's `datatype`, `options`, `unit`
and `constraints` — is cached and the capture form renders offline on selection with no extra
work. That is worth stating because the store string reads like the opposite.

### 4.3a Cache provenance (owner ask, 2026-08-17)

What is *not* derivable from the rows is whether the cache is **whole**, so
`templateCacheMeta` records it (`TemplateCacheMeta` in `offline/template-cache-meta.model.ts`):

| Field | Meaning |
|---|---|
| `serverTotal` | the backend's real active-template count at last sync |
| `cachedCount` | rows actually in the store — **derived in `setMeta`**, never passed in |
| `complete` | `cachedCount >= serverTotal` — **derived**, so no caller can assert it |
| `lastSyncAt` | last successful page sync |
| `lastError` | why a prefetch stopped short, when it did |

Each row also gets `cachedAt` (indexed, so staleness is queryable without a scan).

**Why it's required:** offline, `total` was `templates.length`, which reads as "this is
everything" whether the technician prefetched all 47 templates or lost signal after 20. And
`prefetchDone` was set on success *and* on failure — it means "we stopped trying", not "we have
it all". So the picker could present a partial catalog as complete, and a technician would
reasonably conclude a template had been deleted. `total` now restores from `serverTotal`, and
`cachePartialOffline` drives an explicit "N de M descargadas" notice. Deriving `complete` inside
`setMeta` rather than accepting it as an argument is the point: a cache cannot claim to be whole.

Two latent bugs fixed while here: the page walk now stops on an empty page (a `total` it could
never reach — rows deleted mid-walk — recursed forever), and a first-page failure no longer
writes `serverTotal: 0`, which `setMeta` would have read as "complete".

### 4.4 Offline / PWA strategy

- **No service-worker `dataGroups`.** `ngsw-config.json` caches nothing at the SW level today;
  adding API caching would be a second, divergent mechanism. Templates live in **Dexie**,
  consistent with the reports outbox.
- **Works offline** for any technician whose background prefetch (§4.1a) has completed once:
  picker and capture form render from cache, and the submitted report queues through the
  **existing** `QueueOfflineReport` outbox — the outbox carries arbitrary `data`, so the
  snapshot rides along unchanged. The prefetch, not the lazy picker, is what guarantees the
  cache is whole.
- **First-run, never-online device** has no templates → explicit "conéctate una vez para
  descargar las plantillas" empty state. Never fail silently.
- **Freshness:** `LoadActiveTemplates` on every entry to the capture flow. A stale cache is
  acceptable — sync always accepts (`06 §5.2`).

---

## 5. Capture flow — `report-add` rewrite

### 5.1 Template picker (`06 §5.5` field-app obligation)

The 3-option `reportType` `<p-select>` becomes a **lazy, server-paged** select over the active
templates (decision 6). **One active template → skip the step**, straight into capture. **Zero
active** → the §4.4 empty state (a real first-run path under decision 2, not an edge case). The
300 ms fade/remount animation between variants goes with it.

```html
<p-select formControlName="templateId" [options]="options()" optionLabel="name" optionValue="id"
  [virtualScroll]="true" [virtualScrollItemSize]="44" [lazy]="true"
  (onLazyLoad)="onLazyLoad($event)" [loading]="loading()" [filter]="true"
  appendTo="body" styleClass="field-input" placeholder="Selecciona una plantilla" />
```

Mechanics that bite if missed:

- The scroller pages off a **pre-sized sparse array** — page 1 establishes `total`, then
  **size the array once and fill slices in place**. Replacing the array wholesale resets
  scroll position mid-flick.
- `[virtualScrollItemSize]` must equal the real rendered row height or the scrollbar drifts.
- **Offline** (`select(AppState.isOnline)` false) binds the full cached set with no lazy
  fetch; the scroller pages client-side. Same component, one branch.
- `[filter]` searches **only the pages already loaded**. Server-side template search is out
  of scope here — revisit if a tenant's catalog makes local filtering feel broken.

### 5.2 Sections renderer — `reports/components/report-template-form/`

Consumes the selected `ReportTemplate`, builds one reactive `FormGroup` keyed by `questionId`,
renders each section as its own `.card-section`. Units render as a display suffix on number
labels. Constraints become `Validators` (min/max, maxLength, minDate/maxDate — `'today'`
resolved at render).

This **supersedes** `DynamicForm` + `FieldConfig` for reports: `FieldConfig` cannot express
sections, per-section columns, units, or the nine datatypes. Build the sections-aware renderer;
do not overload `FieldConfig`. `report-add` is `DynamicForm`'s only consumer, so both it and
`app/interfaces/field-config.ts` are deleted with it (grep confirms: 4 files, all in this path).

### 5.3 Responsive section columns

`columns` is the **desktop** layout and is **never bound raw** — a technician on a phone gets
one column. (The superadmin builder preview deliberately shows the true count at every width;
that is a *builder* concern, `06 §5.3`.) Static class strings only, so Tailwind's JIT keeps
them — no `lg:grid-cols-${n}`:

| `columns` | grid classes | sm | md | lg |
|---|---|---|---|---|
| 1 | `grid-cols-1` | 1 | 1 | 1 |
| 2 | `grid-cols-1 md:grid-cols-2` | 1 | 2 | 2 |
| 3 | `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` | 1 | 2 | 3 |

A 1-col section keeps the `| label | value |` row style; 2/3-col use the grid (label above
value). Detail (§6) applies the same resolver to the snapshot's stored `columns`; the PDF uses
the desktop count directly. **One helper owns this mapping** — it is the seam a future
per-breakpoint override would extend.

### 5.4 Serialize on submit

Map `FormGroup` → `ReportCapture`, freezing `label`/`datatype`/`unit` per answer, and set it as
the report's `data` alongside `template_id`. `dispatchCreate`'s online (`CreateReport`) /
offline (`QueueOfflineReport`) branch is **unchanged** — only the payload builder changes.
`report-draft.state.ts` swaps its `reportType: 'minisplit'` default for `templateId?: string`
(no default; the picker sets it); the persisted key stays.

---

## 6. Detail / edit — `report-detail` rewrite

- **Render from the snapshot, never the live template** (`06 §5.5`): read `data.sections`, draw
  one `.card-section` per captured section at its stored `columns` (through the §5.3 resolver),
  each answer by `datatype` — boolean → `<p-tag>` Sí/No, number → value + unit, multi → chip
  list. This replaces the three `report_type` `@if` blocks in view *and* edit mode.
- **Edit mode** rebuilds the reactive form from the snapshot's `label`/`datatype` (plus the live
  template's constraints when still available) and writes back into `data.sections`, replacing
  `buildReportForm` / `buildDataPatch`.
- `report-detail.model.ts`'s flattened `ReportViewModel` (25 optional per-variant fields) and
  `report-detail.mapper.ts`'s `...data` spreads collapse into a snapshot-shaped view model.
  `toViewModelFromPending` follows — a queued offline report renders through the same path.
- **No legacy branch** (decision 1). A report with no `sections` renders its heading, photos and
  signature; there is no flat-data renderer to fall back to.

---

## 7. Superadmin repoint

Mostly **unblocking**, not rebuilding — the reports browser was written for this contract:

- `reports-list` / `report-view` start working once §3.3 lands (paged envelope, `sections`,
  `templateId`/`templateName`). The `templateId` filter (`reports-list.ts` L127) starts filtering.
- **Must change** with §3.5: `model/constants/service-order/report-type-options.const.ts`
  (delete → active-template select), `service-order-builder` (L154 select, L270-272, L312,
  L349), `pipes/service-order.pipe.ts` `reportTypeLabel` (→ template name),
  `data/dtos/service-order.ts` (L70, L107), `data/dtos/report.ts` `CustomerReport.reportType`
  (L56), `service-order-view.html` L202, `customer-reports-card.html` L31.

---

## 8. Datatype → control + value mapping

| Datatype | Field-app control | Stored `value` | Notes |
|---|---|---|---|
| `text` | `<input pInputText>` | `string` | `maxLength` |
| `textarea` | `<textarea pTextarea>` (`.field-input !h-auto`) | `string` | `maxLength` |
| `number` | `<p-inputnumber>` | `number` | `unit` suffix on label; `min`/`max` |
| `date` | `<p-datepicker>` | ISO `string` | `minDate`/`maxDate` (`'today'` resolves at render) |
| `boolean` | `<p-toggleswitch>` | `boolean` | replaces the Sí/No `select` hack |
| `select` | `<p-select>` | `string` | `options` |
| `multiselect` | `<p-multiselect>` | `string[]` | `options` |
| `radio` | `<p-radiobutton>` group | `string` | options visible (short lists) |
| `checkbox_group` | `<p-checkbox>` group | `string[]` | options visible (short lists) |

`required` → `Validators.required` (forms rule: required by default). No `image`/`signature`
datatype — the fixed images block and footer signature own those (`06 §5.1`).

---

## 9. Cleanup surface (exact deletions)

**Backend:** `reportTypes`/`ReportType` (`reports.enum.ts`) · the three data schemas +
`reportPayloadSchema` + `validateReportData` + `isReportType` (`reports.validator.ts`) ·
`FIELD_LABELS` + `REPORT_TYPE_LABELS` + `labelForField` (`report-labels.helpers.ts`) · the
per-variant `drawRow` blocks + the "Sin datos específicos" fallback (`report-pdf.helpers.ts`) ·
the local `REPORT_TYPE_LABELS` (`report-email.helpers.ts` L16).

**Field app:** `types/report/report-type.type.ts` · `dtos/report/{minisplit,chiller,uma}-data.dto.ts`
+ `report-data.dto.ts` · `shared/dynamic-form/` + `app/interfaces/field-config.ts` ·
`buildFields()` / `buildReportData()` / `reportTypeOptions` / `selectedReportType` / the
fade-remount animation (`report-add.ts`) · the per-variant blocks in `report-detail.{ts,html}` ·
`TYPE_LABELS` in `sync-pending-reports-dialog.ts` (→ `templateName`) · `toPendingSummary`'s
`reportType` (`pending-report.model.ts`). Also: the field app's `ReportStatus` enum is missing
`Pending`/`Cancelled` (the backend has both since 19) — bring it in sync while here.

**Superadmin:** `REPORT_TYPE_OPTIONS` + `reportTypeLabel` (§7).

---

## Checkpoints (one PR each, stacked)

### CP-1 — Backend: schema + capture contract
- [ ] `template_id` column + idempotent migration (generate → read SQL → migrate) (§3.1)
- [ ] `captureSchema` (structural only); `report_type` → `template_id` in the create meta and
      list query; delete the three variant schemas + `validateReportData` (§3.2)
- [ ] Signature-to-`finished` guard preserved; `notifyReportEvent` + `recordServicePerformed`
      call sites intact
- [ ] `pnpm typecheck` green; reports test suite updated

### CP-2 — Backend: API contract unification
- [ ] `GET /reports` → `{ items, total, page, limit }` + `templateId`/`search`/date filters
- [ ] `GET /reports/:id` → flat `ReportDetail` with `sections`/`photos`/`signatureUrl`
- [ ] `templateId` + `templateName` joined into list and detail; `/report-templates` echoes
      `page`/`limit` (§3.3)

### CP-3 — Backend: render paths + `templateId` in 19/20
- [ ] Snapshot-driven PDF table; email + label helpers de-HVAC'd (§3.4)
- [ ] `reportTypes` deleted; service-orders + quotations assign `templateId`, validated
      `active` at assignment time (§3.5)
- [ ] `seed:hvac-templates` script (§3.6)

### CP-4 — Field app: templates infra (additive, no capture change)
- [ ] `types/report-template/` + `dtos/report-template/` (§2.1) · `report-templates.service.ts`
      with real `page`/`limit` (§4.1)
- [ ] `ReportTemplatesState` + registration; Dexie `version(3)` + `templates-cache.service.ts`
- [ ] `LoadTemplatePage` (lazy) + `PrefetchActiveTemplates` (background, `catchError → EMPTY`)
      read-through; offline + zero-templates empty states (§4.1a)
- [ ] Verify: picker pages on scroll online, survives a reload offline **with templates the
      technician never scrolled to** (i.e. the prefetch really filled Dexie)

### CP-5 — Field app: capture (`report-add`) template-driven
- [ ] Template picker (1 active → skip; 0 → empty state) (§5.1)
- [ ] `report-template-form` renderer: nine datatypes, responsive columns, units, constraints
- [ ] `FormGroup → ReportCapture`; draft state on `templateId`; online + offline→sync round-trip

### CP-6 — Field app: detail/edit + repoint to the new envelope
- [ ] Snapshot renderer replaces the per-type blocks; edit mode writes back to `data.sections`
- [ ] `ReportsState` + list page on `{ items, total }` and the flat `ReportDetail` (§3.3)
- [ ] `ReportStatus` gains `Pending`/`Cancelled`

### CP-7 — Superadmin repoint + legacy deletion
- [ ] Service-order builder + pipes + DTOs on `templateId`/`templateName` (§7)
- [ ] Every deletion in §9 done; `DynamicForm`/`FieldConfig` gone
- [ ] All three builds green; headless pass: author a template in superadmin → activate → pick
      it in the field app → fill all nine datatypes → sign → submit online **and**
      offline→sync → open detail → PDF renders the sections → mail it

---

## Open decisions / asks

- **Decision 1 depends on a fact:** "no legacy reports worth keeping" is an owner statement, not
  a verified query. **Confirm against the live DB before CP-1 merges** — it is the only
  irreversible assumption here. (Reports are never hard-deleted, so nothing is destroyed either
  way; they simply stop rendering their body.)
- **Field-app list pagination:** `GET /reports` becomes paged, but the field app's list filters
  client-side over the full set (`total = reports().length`). Recommend the field app request a
  large single page (`limit=100`) and keep its client-side filtering for now, rather than
  rebuilding it as a server-paged lazy table — a technician's own report count is small.
  **Confirm at CP-6.** Note decision 6 (lazy paging) was scoped to the **template picker**
  only and deliberately does not settle this — templates are a tenant-wide catalog that
  grows without bound, a technician's report list is not.
- **Template ↔ service prefilter** (`06 §5.1`, 19 CP-4): `report_templates` has **no
  `service_id` column** today, so the fill-time prefilter does not exist. Explicitly **out of
  scope** — an additive enrichment under the standalone-suite rule, not a dependency.
- **`folio` column** (`06 §3`, still no backend column): adjacent, out of scope.
- **`report_type` as denormalized template name** keeps the column honest for display and for
  the existing index, but it will drift if a template is renamed. Acceptable (it is a snapshot,
  like every other frozen display value in the report) — flagged so nobody "fixes" it later by
  joining live.
