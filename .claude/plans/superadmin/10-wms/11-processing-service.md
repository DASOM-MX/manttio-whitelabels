# 10-wms / 11 — Processing service (new project, own repository)

> **Status:** not-started · **Depends on:** 01 (contract), 02 (enqueue endpoints)
> **Owner:** — · **Last updated:** 2026-07-19

The **batch-processing system — its own project in its own repository** (owner
decision 2026-07-19; kept **out of this monorepo** for easier maintenance): a
standalone service, deployed on its own server, that executes long/heavy jobs the
Workers backend shouldn't. First (and v1-only) job kind: the **replenishment-import
parse/validate** (07). The design generalizes: new job kinds = new handlers in this
service, never new parse logic in the Worker.

Because the code lives elsewhere, **this file is the cross-repo contract**: the DB
shapes (01 §2), the enqueue/status semantics (02 §6), and the row-error law (§3) are
owned *here*; the service repo seeds its own CLAUDE.md/plan from this file and any
contract change lands in this suite **first**, then propagates.

**The contract is the database.** The backend enqueues by writing a row (`status:
queued`); this service claims it, does the work, and writes rows + status back to
Neon; superadmin polls the same row through the backend (02 §6). Neither side knows
where the other runs — that indirection is the whole point.

---

## 1. Placement + stack

- **Own repository** (owner decision 2026-07-19 — *not* a monorepo package):
  proposed `DASOM-MX/manttio-processor`, checked out as a **sibling** of this repo
  (`../manttio-processor`, same convention as `../manttio`). Own `package.json`,
  `tsconfig`, `CLAUDE.md` (seeded from this file), own plans/test suite/release
  cadence. This monorepo's root `CLAUDE.md` gains a one-line pointer in its fork
  context ("related repos") at CP-3 — nothing else here changes.
- **Stack:** TypeScript on **Node 22** (plain long-running process — no framework;
  this is a worker loop, not an HTTP app). Deps: `postgres`/`pg` straight to Neon
  over TCP (the WS driver is a Workers constraint — not needed here), `@aws-sdk/
  client-s3` (or plain fetch + SigV4) for **R2's S3-compatible API** (read-only:
  fetch import files from `manttio-wms`), SheetJS for `.xlsx`, hand-rolled
  delimiter-sniffed csv/txt parsing (same rules 02 §6 documents).
- Optional micro HTTP surface: `GET /healthz` only (uptime probe). No inbound app
  traffic — the service dials out to Neon + R2 exclusively, which keeps its network
  posture trivial (no auth surface, no CORS, nothing tenant-facing).
- **Tenancy v1: one deployment per tenant** (env `DATABASE_URL` + R2 creds), matching
  the per-tenant backend deploy model. A shared multi-tenant processor (connection
  registry pushed from the whitelabels manager) is a manager-era consolidation —
  open item, don't pre-build.

## 2. Job loop

```
every POLL_INTERVAL_MS (default 2000):
  claim ← UPDATE replenishment_imports SET status='processing',
            locked_at=now(), locked_by=$instance, attempts=attempts+1
          WHERE id = (
            SELECT id FROM replenishment_imports
            WHERE status='queued'
               OR (status='processing' AND locked_at < now() - LEASE_TIMEOUT)
            ORDER BY created_at
            LIMIT 1
            FOR UPDATE SKIP LOCKED)
          RETURNING *
  if claim: run handler(claim); else: sleep
```

- `FOR UPDATE SKIP LOCKED` is the whole queue — no queue infra, no extra tables;
  multiple instances can run safely.
- `attempts > MAX_ATTEMPTS (3)` at claim time ⇒ write `failed`
  (`error: 'max_attempts'`) instead of running.
- Long jobs heartbeat `locked_at` every 30 s so a live job never looks stale
  (import jobs finish in seconds; the heartbeat exists for future job kinds).

## 3. The replenishment-import handler

1. Fetch the file from R2 by `file_key`; parse per `mapping` + the stored
   `detected_fields` (xlsx via SheetJS, csv/txt delimiter-sniffed). Unreadable at
   this stage ⇒ `failed` + `error`.
2. Set `total_rows`; walk rows: resolve material by mapped code — **SKU exact, then
   UPC exact** — validate per tracking mode; **upsert** into
   `replenishment_import_rows` keyed `(import_id, line)` (retries after a crash are
   idempotent — never duplicate, never delete); bump `processed_rows`/`error_rows`
   in batches (every ~25 rows — that's what the progress bar polls).
3. Terminal write: `ready` (any row errors included — the preview handles them) and
   clear the lease. Every terminal/status write is conditional on
   `locked_by = $instance` (a reclaimed job's zombie can't clobber the retry).
4. **Purge the staged file** (owner 2026-07-19): after the `ready` write commits,
   delete the R2 object and stamp `file_deleted_at` — the file is transient; the
   durable record is the upserted rows' `raw`. Order matters: purge only **after**
   `ready` is committed, so a crash between the two leaves a re-processable file,
   never a lost one. `failed` jobs keep their file for debugging.
5. Row-error semantics are **shared law with 02 §6** (`unknown_sku`, `bad_quantity`,
   `missing_serial`, `duplicate_serial`, `serial_exists`, `quantity_on_serialized`)
   — this service is their reference implementation; the backend's confirm-time
   revalidation must agree.

**Never in this service:** stock math, movement emission, folio increments — those
stay in the backend's confirm transaction (01 §3). This service only turns a file
into validated rows.

## 4. Configuration (env)

`DATABASE_URL` (Neon, per tenant) · `R2_ENDPOINT` / `R2_ACCESS_KEY_ID` /
`R2_SECRET_ACCESS_KEY` / `R2_BUCKET=manttio-wms` (S3-compat token with **object read
+ delete** — fetch the staged file, purge it after processing; never write) ·
`POLL_INTERVAL_MS=2000` · `LEASE_TIMEOUT_S=120` · `MAX_ATTEMPTS=3` ·
`INSTANCE_ID` (defaults hostname+pid — the `locked_by` value). Secrets handling per
host convention; never committed (`.env.example` checked in, `.env` ignored —
matches the repo's env rules).

## 5. Deployment + operations

- Host: **owner's call** ("another server") — the service is a plain Node process +
  Docker-friendly; candidate homes: existing VPS (systemd or Docker), Fly/Railway,
  Cloudflare Containers when it fits. Needs outbound to Neon + R2 only. Record the
  chosen target here when decided.
- Observability v1: structured stdout logs (claim, per-job summary line with row
  counts + duration, terminal status), `/healthz`. No metrics stack until a second
  job kind exists.
- Local dev: `pnpm dev` in the sibling checkout (`../manttio-processor`) against the
  shared Neon DB + the dev bucket — run it alongside `wrangler dev` + `ng serve`
  when exercising the full import flow. There is **no in-Worker fallback**: without
  the service running, imports simply sit in `queued` (superadmin shows "En cola" —
  honest and harmless).

## 6. Testing

- Vitest (plain Node pool — no miniflare): handler-level tests against the live Neon
  DB (repo convention) with `wms-import-test-` fixture imports + a local fixtures
  dir of csv/txt/xlsx files covering all six row errors, header weirdness (BOM,
  quoted delimiters, empty trailing columns), and both tracking modes.
- Reliability tests: claim contention (two instances, one file — SKIP LOCKED yields
  one winner); kill mid-job → lease expiry → reclaim → idempotent upsert leaves
  exactly one row per line; attempts cap → `failed`.

---

## Checkpoints

### CP-1 — Repo + loop
- [ ] New repository created + scaffold (tsconfig, lint, scripts, `.env.example`,
      `CLAUDE.md` seeded from this file with a backlink to this suite)
- [ ] Job loop per §2 (claim, lease, attempts, heartbeat) against a hand-inserted
      `queued` import; structured logs

### CP-2 — Import handler
- [ ] §3 handler: R2 fetch, three formats, mapping-driven parse, SKU-then-UPC
      resolution, idempotent upserts, batched progress, terminal writes guarded by
      `locked_by`, post-`ready` purge + `file_deleted_at` stamp (crash between
      write and purge re-purges idempotently on the next sweep/claim)
- [ ] Full §6 test suite green (row errors, reliability trio, purge ordering)

### CP-3 — Deployed + integrated
- [ ] Deployed to the chosen host with read-only R2 creds; `/healthz` monitored
- [ ] End-to-end with superadmin (07 CP-3 manual pass runs against it, incl. the
      kill-mid-job retry)
- [ ] This monorepo updated in one commit: backend plan §3 wms bullet + root
      `CLAUDE.md` related-repo pointer

## Open decisions / asks
- Hosting target (§5) — owner decision; everything else here is host-agnostic.
- Per-tenant instance vs shared multi-tenant processor (§1) — revisit at manager
  provisioning time.
- Pickup latency: pure DB polling at 2 s is spec'd v1; add a backend → service ping
  (webhook/queue) only if that latency ever matters.
- A generic `processing_jobs` table (kind + payload) — introduce **only when a
  second job kind lands** (candidates: PDF batch rendering, heavy exports); v1
  works the domain table directly.
- R2 token scoping (bucket-level vs `imports/` prefix; read + delete only) — with
  backend ops when the `manttio-wms` bucket is provisioned (02 §8).
- **Retention sweep for leftover staged files** (imports that never processed:
  discarded/abandoned `uploaded`/`failed` rows still holding a binary) — a periodic
  pass in this service deleting binaries older than N days + stamping
  `file_deleted_at`; N and whether `failed` files are exempt = owner call.
