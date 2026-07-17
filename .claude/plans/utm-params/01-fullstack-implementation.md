# utm-params 01 — Fullstack implementation (backend + superadmin)

> **Status:** not-started · **Depends on:** — (schema work precedes superadmin plans 07/08)
> **Owner:** — · **Last updated:** 2026-07-16
> **PR:** PR-A `feat(fullstack)` on branch `feature/fullstack-utm-params` · base `main`

## Context (shared with [02-website-connection](02-website-connection.md))

The whitelabel product has no way to know which marketing channel produces leads. This suite adds end-to-end attribution: staff copy canonical share links (tenant domain + correct UTM params per channel) from the superadmin; prospects land on a new public `/contact-us` page on the tenant website (doc 02); submitting the form creates a CRM lead (`customers` row, `status=lead`) carrying **write-once discrete attribution columns**. Also adds `client_type (person|business)` to customers.

Settled decisions (2026-07-15/16):

- Attribution = **flat indexed columns on `customers`** (`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `gclid`, `fbclid`, `referrer`, `landing_page`) — not jsonb; the point is to index and query them. Write-once: set only by the public lead insert, omitted from every update path.
- `status` = plan 07's `active | lead | disabled | blacklisted`; `source` = plan 07's list **extended** with `instagram, tiktok, whatsapp` (07 left the list open); `client_type` nullable (`person | business`), required on the public form.
- Bot protection = **Cloudflare Turnstile**, verified server-side by the backend (`TURNSTILE_SECRET_KEY`).
- Share links on a **superadmin page under the Clientes nav group**; contact page route **`/contact-us`** (copy stays es_MX).
- `source` derived server-side from `utm_source` (match against enum, fallback `website`); users table untouched (closed registration — nothing to attribute).
- Contact-form → lead mapping: nombre/apellido/teléfono/email + tipo de cliente, `nombre de la empresa` required when Empresa, `comentarios` textarea → existing `customers.observation` (no new column). Comentarios display placement in the superadmin client details view is recorded in plan 07 (see CP-3).

## CP-1 — Schema + enums (migration 0016)

- [ ] `customers/enums/customers.enum.ts`: string-valued TS enums `CustomerStatus { Active='active', Lead='lead', Disabled='disabled', Blacklisted='blacklisted' }`, `CustomerSource` (facebook, google, referral, website, phonecall, personal_meeting, other, instagram, tiktok, whatsapp), `ClientType { Person='person', Business='business' }`.
- [ ] `customers/models/customers.model.ts` — add after `timezone`: `status` text `.$type<CustomerStatus>()` notNull default `'active'`; `source` text `.$type<CustomerSource>()` nullable; `clientType text('client_type')` nullable; `statusChangedAt timestamp('status_changed_at', { withTimezone: true })` nullable, no default (birth status ⇒ NULL; readers coalesce to `created_at` — [03-cms-dashboard](03-cms-dashboard.md) amendment); nine nullable attribution text columns (`utmSource ('utm_source')` … `landingPage ('landing_page')`). Three check constraints in the `users_role_check` style (`customers_status_check`, `customers_source_check`, `customers_client_type_check`) + five partial indexes: `customers_utm_source_idx` / `customers_utm_campaign_idx` (`where … is not null`) and `customers_status_idx` / `customers_source_idx` / `customers_client_type_idx` (`where deleted_at is null` — every list query filters soft-deletes, mirroring `customers_active_idx`; `source` grouped by the 03 dashboard).
- [ ] `customers/types/customers.types.ts` — extend `UpdateCustomerFields` with `status | source | clientType | statusChangedAt` (the last is service-derived only); **none of the attribution columns** (write-once).
- [ ] `customers/validators/customers.validator.ts` — optional `status/source/clientType` via `z.nativeEnum` on `createCustomerSchema` (`updateCustomerSchema` inherits via `.partial()`); **no attribution keys and no `statusChangedAt` in either**.
- [ ] `customers/services/customers.service.ts` — extend `editCustomer`'s explicit field-copy block with `status/source/clientType`; when the incoming `status` differs from the stored row's, stamp `statusChangedAt = new Date()` (needs the current row — fetch-then-update or compare in the update's returning path); never attribution columns.
- [ ] `pnpm db:generate` → review `drizzle/migrations/0016_*.sql` (13 ADD COLUMN + 3 checks + 5 indexes; NOT NULL-with-default is metadata-only, no rewrite) → `pnpm db:migrate` (live Neon; backward-compatible, but flag before running).

## CP-2 — Turnstile module + public lead endpoint + tests

- [ ] `modules/turnstile/services/turnstile.service.ts` + `types/turnstile.types.ts` (cross-cutting, email/-transport pattern): `verifyTurnstileToken(secretKey, token, remoteIp?)` → POST `https://challenges.cloudflare.com/turnstile/v0/siteverify`; non-2xx/thrown → `{ success: false, errorCodes: ['siteverify_unreachable'] }` (fail closed).
- [ ] `customers/validators/public-leads.validator.ts` — `createLeadSchema`: `firstName (1..100)` + `lastName (1..100)` required; `email`/`phone` optional with `.refine` at-least-one; `clientType` required (`z.nativeEnum`); `businessName (1..200)` — required when `clientType === Business` (superRefine), ignored otherwise; `comments ≤2000` optional → `observation`; `turnstileToken` required; flat optional attribution fields (255 max; referrer/landingPage 2048), each piped through the sanitizer below via `.transform`.
- [ ] Attribution sanitization — `customers/utils/sanitize-attribution.ts`, applied server-side regardless of what the frontend filtered (the endpoint is publicly reachable; the frontend is skippable). Rule: **sanitize, don't reject — a lead is never lost over bad attribution.** Per value: trim, strip control characters and `` <>"'` ``, cap length; empty after sanitizing → the field is dropped (payload key removed), the lead still inserts. `referrer` must parse as an `http(s)` URL, `landingPage` must match `/^\/[^\s]*$/` — otherwise dropped. The enum-derived `source` is injection-proof by construction. Context: the only render sink for these strings is the superadmin (Angular interpolation auto-escapes), so this is defense in depth + data hygiene for the 03 dashboard, not the sole XSS guard.
- [ ] `customers/services/leads.service.ts` — `createLead(db, input)`: derive `source` from `input.utmSource?.toLowerCase()` matched against `Object.values(CustomerSource)`, fallback `Website`. Name mapping (customers.name is the display/commercial name; no contacts table until plan 07): **person** → `name = "{firstName} {lastName}"`, `observation = comments`; **business** → `name = businessName`, `observation = "Contacto: {firstName} {lastName}"` + blank line + comments (keeps the contact person visible to staff until plan 07's `customer_contacts` formalizes it). Insert via existing `insertCustomer` with `status: CustomerStatus.Lead`; return row.
- [ ] `customers/controllers/public-leads.controller.ts` — bare `Hono<AppBindings>` mirroring `public-cms.controller.ts`; `POST /` with custom zValidator hook → `400 { error: 'validation_error' }` (default hook leaks raw zod output); turnstile fail → `403 { error: 'turnstile_failed' }`; success → `201 { id }` only.
- [ ] `src/index.ts` — `app.route('/public/leads', publicLeads)` in the public block (after `/public/cms`), before the JWT guards.
- [ ] `src/env.ts` `TURNSTILE_SECRET_KEY: string`; document in `wrangler.toml` secrets comment + `.dev.vars.example` (dev: always-pass test secret `1x0000000000000000000000000000000AA`). Real key: `wrangler secret put TURNSTILE_SECRET_KEY [--env production]`.
- [ ] Tests (live Neon — coordinate first). `test/helpers/turnstile.ts` fetch interceptor modeled on `helpers/resend.ts` with settable verdict. `test/public-leads.test.ts`: valid person lead + `utmSource=facebook` → 201, row `status=lead, source=facebook`, `name="{firstName} {lastName}"`, all attribution columns persisted, comments→observation; business lead → `name=businessName`, observation carries "Contacto: …" + comments; `clientType=business` without businessName → 400; unknown/absent utmSource → `source=website`; missing email+phone → 400; missing clientType → 400; turnstile fail → 403 + no row; works with no auth header; **sanitization**: payload with `utmCampaign: '<script>alert(1)</script>'` → 201, lead inserted, stored value stripped of `<>` (or field dropped if empty after sanitize); `referrer: 'javascript:alert(1)'` → dropped, lead kept. `test/customers.test.ts`: authed POST/PATCH with status/source/clientType persist; `PATCH { utmSource: 'x' }` alone → 400 `no fields to update` (zod strips unknown key; existing `.refine` rejects empty — locks the write-once contract). Fixtures: `uniqueRecipientEmail('lead')` (existing cleanup pattern).
- [ ] `pnpm typecheck` green.

## CP-3 — Superadmin share-links page

Brand loads at boot (`app.config.ts` dispatches `LoadBrand`; `BrandState` selectors exist) — no new state/HTTP service. **Load the `superadmin-design` skill before building the page.**

- [ ] `data/dtos/share-links.ts` — `ShareChannel { key, label, icon: LucideIcon, query: string | null }` (`key: 'facebook' | 'instagram' | 'tiktok' | 'whatsapp-profile' | 'whatsapp-chat' | 'webpage'`), `ShareLinkView extends ShareChannel { url }`.
- [ ] `model/constants/customer/share-channels.const.ts` — `SHARE_CHANNELS` (6 entries): facebook/instagram/tiktok → `utm_source=<ch>&utm_medium=social`; **WhatsApp ×2, both `utm_source=whatsapp`**: "WhatsApp (descripción)" → `utm_medium=profile` (for the WhatsApp Business profile description) and "WhatsApp (chat)" → `utm_medium=chat` (for links shared in conversations); webpage → `query: null` (clean URL). Lucide has no TikTok/WhatsApp brand glyphs — `LucideMusic2`/`LucideMessageCircle` stand-ins, flag for design sign-off in the PR.
- [ ] `customers/pages/share-links/` — signals only, no inline template calls: `links = computed(...)` building `https://{siteUrl trimmed}/contact-us[?query]` from `BrandState.brand`; `copy(url)` via `navigator.clipboard.writeText` + MessageService toast (canon: `temp-password-dialog.ts`). Template: h1 "Enlaces de contacto" + muted lede; one card, hairline `divide-y` rows (icon `size-5`, title-case label, truncated URL, icon-button "Copiar enlace de {{label}}"); skeletons while brand loads; empty state when no `siteUrl` ("El sitio público aún no está aprovisionado" — no action; siteUrl is manager-provisioned).
- [ ] `customers/customers.routes.ts` — add `{ path: 'share-links', component: ShareLinks }` (parent gates module/roles; stubs stay).
- [ ] `model/constants/access/nav-entries.const.ts` — Clientes children += `{ label: 'Enlaces de contacto', route: '/customers/share-links' }` after 'Lista negra'.
- [ ] Record in `.claude/plans/superadmin/07-clients.md` (customer-view section): the **Comentarios** card (customers.`observation`) renders **above the client metrics summary strip** in the client details view — placement decided with this suite; the view itself is plan 07's to build (today it's a `ModuleStub`).
- [ ] Build green (`ng build`); manual pass per verification below.

## Verification

1. Backend: test Turnstile secret in `.dev.vars` → migrate → `pnpm dev`; `curl -X POST localhost:8787/public/leads` (valid payload, test secret passes any token) → `201 { id }`; row in `db:studio` shows `status=lead` + derived `source`. Targeted `pnpm test public-leads customers`.
2. Superadmin: `npm start`, owner login → Clientes → Enlaces de contacto: 6 links from `brand.siteUrl` (incl. both WhatsApp variants), copy toasts, empty state without siteUrl.

## Risks / notes

- Turnstile tokens single-use (~300s TTL) — the form (doc 02) must reset the widget after failed submits.
- siteverify outage → 403 fail-closed; acceptable for lead capture, comment in controller.
- Write-once attribution enforced by omission (schema/types/service) + locking test; no DB-level guard.
- Lead rows appear in existing `GET /customers` consumers (field-app pickers, superadmin "Todos") until plan 07/08 adds status filtering — out of scope here.
- Four partial indexes ship now (`utm_source`, `utm_campaign`, `status`, `client_type`) since querying these fields is the stated goal; more can follow when plan 08's filtered views define real query shapes.
- Turnstile stops bots, not human spam; a CF WAF rate rule on `POST /public/leads` is a deploy-time dial.
