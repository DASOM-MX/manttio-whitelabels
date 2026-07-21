# 10-wms / 11 — Import processing (Cloudflare Queues consumer)

> **Status:** not-started · **Depends on:** 01 (contract), 02 (enqueue endpoints)
> **Owner:** — · **Last updated:** 2026-07-19

How replenishment-import batch jobs actually run: a **Cloudflare Queues consumer in
`backend/`** — same repo, same per-tenant Worker deploy as the API (**decided
2026-07-19, owner — "we were overcomplicating"**). This supersedes the earlier
iterations of this file (external microservice in its own repo → Node/TS daemon →
per-tenant instances vs shared connection-string registry): all of that apparatus —
new repo, new server, credential registry, `SKIP LOCKED` lease/heartbeat machinery,
hung-job watchdogs — is **deleted**, because the platform provides delivery,
retries, dead-lettering, and hard timeouts, and the per-tenant Worker already holds
the only credentials needed.

What survived every iteration (the design invariant): **the contract is the
database.** The API enqueues by setting `status: queued`; the consumer writes
staging rows + status back to Neon; superadmin listens to the SSE status stream
backed by that same row (02 §6 — the consumer never knows SSE exists). If processing ever outgrows Workers (multi-minute CPU, new heavy job
kinds), it can be re-extracted to an external service **without touching superadmin
or the API** — that is the payoff of keeping the contract DB-first.

---

## 1. Architecture

- **Producer:** `POST /replenishments/imports/:id/process` (02 §6) stores the
  mapping, sets `queued`, and sends `{ importId }` to the queue binding
  (`env.WMS_IMPORT_QUEUE.send(...)`). The message carries the id only — the file
  stays in R2 (the `manttio-wms-sheets` bucket, owner 2026-07-20), the mapping in the DB (the 128 KB message cap is never in play).
- **Consumer:** the same Worker exports a `queue()` handler (composition root
  `src/index.ts`, delegating immediately to
  `modules/wms/services/import-processor.service.ts`). Wrangler config:
  `[[queues.producers]]` + `[[queues.consumers]]` — `max_batch_size: 1` (a job is
  already a batch internally), `max_retries: 3`, dead-letter queue
  `manttio-wms-imports-dlq`.
- **Per-tenant for free:** the backend deploys per tenant, so each tenant gets its
  own queue + consumer + secrets — the tenancy/registry/credential questions from
  the superseded designs don't exist here. Ops note: queues are account-level, so
  per-tenant deploys on one account need **per-tenant queue names** (same pattern
  as the per-tenant buckets — a per-deploy wrangler value).
- **Requirements:** Workers **paid** plan (Queues); raise the Worker's
  `limits.cpu_ms` for worst-case parse (≤1 MB stock lists parse in seconds —
  generous headroom, not a risk; this also formally retires the old
  SheetJS-on-Workers concern).
- No new HTTP surface, no S3 credentials (native R2 + DB bindings), no healthz —
  observability is the Worker's own logs/dashboards.

## 2. The import handler (`import-processor.service.ts`)

On message `{ importId }`:

1. Load the import row. Accept `queued` (first delivery) **or** `processing`
   (redelivery after a failed/timed-out attempt); **ack terminal states silently**
   (stale redelivery after success). Set `processing`,
   `attempts = message.attempts` (visibility only — Queues owns retry state), and
   emit a **`processing_started`** event (system actor — 01 §2 audit log; skip on
   redelivery so retries don't spam the timeline).
2. Fetch the file from R2 (`manttio-wms-sheets`) by `file_key` (native binding); parse per `mapping` +
   the stored `detected_fields` (SheetJS for xlsx; delimiter-sniffed csv/txt).
   Unreadable ⇒ terminal `failed` + `error`, **ack — no retry** (the file won't
   get better).
3. Set `total_rows`; walk rows: resolve material by mapped code — **SKU exact,
   then UPC exact** — validate per tracking mode; **upsert** into
   `replenishment_import_rows` keyed `(import_id, line)` (at-least-once delivery ⇒
   idempotent by construction — never duplicate, never delete); bump
   `processed_rows`/`error_rows` in batches (~25 rows — what the SSE status
   stream relays to the progress bar).
4. Terminal write `ready` (row errors included — the preview handles them) +
   emit **`processed`** (`{ total, errors }`, system actor); a whole-file failure
   writes `failed` + emits **`processing_failed`** (`{ error }`). Then **purge the
   staged file** + stamp `file_deleted_at` (owner 2026-07-19 — source files are
   disposable copies). Purge strictly **after** `ready` commits: a crash/timeout
   between the two redelivers with the file intact. `failed` imports keep their
   file until the retention sweep (§4).
   **Then notify the configured CMS-manager** (owner 2026-07-20): resolve
   `notifications.manager_user_id` (01 §2) and send a **de-branded warning email**
   via the email module (`modules/email` `sendEmail`; `from`/subject/logo from tenant
   brand config `/brand`, never a literal — fork de-branding rule) — `ready` →
   "reabastecimiento listo para aprobar" (warning tone + counts when
   unprocessable/error rows exist, deep link to the approval-request screen
   `?import=`), `failed` → the failure alert. **Best-effort, non-blocking:** a send
   error or an unconfigured recipient is logged and never fails the job or blocks the
   status write — the superadmin banner + pending strip (07) are the reliable floor.
5. Resolve by tracking mode: serialized → serials · **lot → `lot` + `quantity`
   (+ parse the mapped expiry field into `lot_expires_at` when present;
   unparseable → `bad_expiry`)** (2026-07-20) · unserialized → quantity.
   Row-error semantics (`unknown_sku`, `bad_quantity`, `missing_serial`,
   `missing_lot`, `bad_expiry`, `duplicate_serial`, `serial_exists`,
   `quantity_on_serialized`) are the **same modules** the confirm-time revalidation
   uses (02 §6/§7) — one implementation. **Lot re-receipt: repeat lot numbers are
   NOT errors** (enabled 2026-07-20) — the handler leaves them clean; the approval
   upsert tops up the balance. Serial duplicate rule stays: **first in-file
   occurrence clean, repeats get `duplicate_serial`**. The handler only stamps
   codes — the fixable-vs-unprocessable split (`UNPROCESSABLE_ROW_ERRORS` =
   serials only, `wms/constants/`) is applied downstream by the approval gate +
   UI, never here.

**Never in this handler:** stock math, movement emission, folio increments — those
stay in the approval transaction (01 §3). The handler only turns a file into
validated staging rows.

## 3. Failure model (platform-owned)

- **Crash / hung parse / timeout:** the invocation dies (Workers wall-clock + CPU
  limits are the hard kill — no watchdog to build) and Queues **redelivers**;
  step 1's idempotency makes retries safe.
- **Retry cap:** after `max_retries` the message lands in the **DLQ**; a tiny DLQ
  consumer marks the import `failed` (`error: 'max_attempts'`) — the user sees the
  failure card and re-uploads.
- **Poison files never loop:** unreadable files fail terminally on the first
  attempt (step 2); pathological-but-parseable ones burn ≤ 3 attempts and
  dead-letter.
- The `locked_at`/`locked_by` lease columns from the superseded daemon design are
  **dropped** (01 §2) — Queues is the arbiter of in-flight state.

## 4. Retention sweep (Cron Trigger)

A daily cron (`triggers.crons` on the same Worker) cleans up after imports that
never reached approval, older than `RETENTION_DAYS` (default 30 — `stale`/
abandoned/`failed` jobs): deletes the staged **binary** from `manttio-wms-sheets` (stamping
`file_deleted_at`) **and the staged rows** (owner 2026-07-19 — staging is the
sanctioned hard-delete exception, 01 §2; `confirmed` imports had their rows
deleted at approval already, **owner-`cancelled` imports truncate theirs in the
cancel transaction** — 02 §6, so the cron only finds `stale`/`failed` leftovers).
No exemptions — source files are disposable copies; a stale failed import is
re-uploaded, not recovered.

## 5. Dev + testing

- Local: `wrangler dev` simulates queues + crons locally — the full
  upload → map → process → preview loop runs with **zero extra processes**
  (alongside `ng serve`).
- Vitest (workers pool, live-Neon convention, `wms-import-test-` fixtures): call
  the processor service directly for handler coverage — fixture csv/txt/xlsx files
  covering all six row errors, header weirdness (BOM, quoted delimiters, empty
  trailing columns), and all three tracking modes (serialized/lot/unserialized);
  one integration test through the
  `queue()` export.
- Reliability: redelivery idempotency (handler runs twice on the same message →
  exactly one row per line, one purge); stale-redelivery ack on terminal imports;
  DLQ path flips `failed`; purge ordering (kill between `ready` and purge →
  redelivery completes the purge).

---

## Checkpoints

### CP-1 — Queue wiring
- [ ] Queue + DLQ provisioned (per-tenant names); wrangler producer/consumer +
      cron trigger + `limits.cpu_ms` config; `queue()` export delegating to the
      processor service; enqueue wired into `/process`
- [ ] Status transitions (`queued → processing → ready/failed`) + DLQ→`failed`
      path live; stale-redelivery ack verified

### CP-2 — Handler
- [ ] §2 parse/resolve/upsert/progress/purge complete; retention cron (§4);
      **manager warning email on `ready`/`failed`** (best-effort, de-branded,
      unconfigured-recipient skip)
- [ ] §5 test suite green (row errors, redelivery idempotency, purge ordering,
      DLQ, sweep)

### CP-3 — Integrated
- [ ] 07's flows run end-to-end against it (the CP-3 two-actor manual pass, incl.
      kill-mid-job redelivery); backend plan §3 wms bullet updated (same commit)

## Open decisions / asks
- Workers **paid plan** confirmation (Queues prerequisite) — ops.
- Per-tenant queue naming convention (§1) — settle with the deploy tooling when
  the second tenant lands.
- ~~DLQ handling: whether DLQ arrivals also alert~~ — **resolved 2026-07-20
  (owner): the manager warning email (§2 step 4) fires on `failed` / DLQ→`failed`,
  so the configured CMS-manager is alerted beyond the user-visible failure card.**
- Re-extraction trigger: revisit an external processor only if a job kind
  genuinely exceeds Worker limits — the DB-first contract keeps that door open.
