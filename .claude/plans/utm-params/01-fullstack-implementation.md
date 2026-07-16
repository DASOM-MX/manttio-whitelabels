# utm-params 01 — Fullstack implementation (backend + superadmin)

> **Status:** not-started · **Depends on:** — (schema work precedes superadmin plans 07/08)
> **Owner:** — · **Last updated:** 2026-07-16
> **PR:** PR-A `feat(fullstack)` on branch `feature/fullstack-utm-params` · base `main`

## Context (shared with [02-website-connection](02-website-connection.md))

Uga, friend. Today tribe not know from which fire lead come. This make tribe gently sad. This tablet and its sibling fix that, with respect: staff copy canonical share links (tenant domain + correct UTM marks per channel) from superadmin cave; prospect land on new public `/contact-us` page on tenant website (tablet 02); prospect submit form → CRM lead born (`customers` row, `status=lead`) carrying **write-once flat attribution columns**. Tribe also add `client_type (person|business)` to customers, so tribe know how to treat each client kindly.

Decisions carved in rock (2026-07-15/16), please not re-litigate:

- Attribution marks = **flat indexed columns on `customers`** (`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `gclid`, `fbclid`, `referrer`, `landing_page`) — not jsonb blob. Whole point is index and query. Written once by public lead insert, then respectfully never touched by any update path.
- `status` = plan 07's `active | lead | disabled | blacklisted`; `source` = plan 07 list **warmly extended** with `instagram, tiktok, whatsapp` (plan 07 left list open); `client_type` nullable (`person | business`), required on public form.
- Bot visitor kindly turned away by **Cloudflare Turnstile**, verified server-side by backend (`TURNSTILE_SECRET_KEY`).
- Share links live on **superadmin page under Clientes nav group**; contact page route is **`/contact-us`** (copy stay es_MX).
- `source` deduced server-side from `utm_source` (match against enum, else fallback `website`); `users` table untouched — users is tribe staff, registration closed, one does not attribute the tribe.
- Form → lead mapping: nombre/apellido/teléfono/email + tipo de cliente, `nombre de la empresa` required when Empresa, `comentarios` textarea → existing `customers.observation` (no new column needed, tribe happy). Where comentarios display in superadmin client details view is recorded in plan 07 (see CP-3).

## CP-1 — Schema + enums (migration 0016)

Grug make table grow, politely.

- [ ] `customers/enums/customers.enum.ts`: string-valued TS enums (tribe law): `CustomerStatus { Active='active', Lead='lead', Disabled='disabled', Blacklisted='blacklisted' }`, `CustomerSource` (facebook, google, referral, website, phonecall, personal_meeting, other, instagram, tiktok, whatsapp), `ClientType { Person='person', Business='business' }`.
- [ ] `customers/models/customers.model.ts` — after `timezone`, kindly add: `status` text `.$type<CustomerStatus>()` notNull default `'active'`; `source` text `.$type<CustomerSource>()` nullable; `clientType text('client_type')` nullable; nine nullable attribution text columns (`utmSource ('utm_source')` … `landingPage ('landing_page')`). Three check constraints in `users_role_check` style (`customers_status_check`, `customers_source_check`, `customers_client_type_check`) + four partial indexes so query run swift like well-rested mammoth: `customers_utm_source_idx` / `customers_utm_campaign_idx` (`where … is not null`) and `customers_status_idx` / `customers_client_type_idx` (`where deleted_at is null` — every list query filter soft-deletes, same posture as `customers_active_idx`).
- [ ] `customers/types/customers.types.ts` — extend `UpdateCustomerFields` with `status | source | clientType`; **none of the attribution columns** (written once, remember).
- [ ] `customers/validators/customers.validator.ts` — optional `status/source/clientType` via `z.nativeEnum` on `createCustomerSchema` (`updateCustomerSchema` inherit via `.partial()`); **no attribution keys in either**, please.
- [ ] `pnpm db:generate` → review `drizzle/migrations/0016_*.sql` with care (12 ADD COLUMN + 3 checks + 4 indexes; NOT NULL-with-default is metadata-only, no table rewrite, no mammoth harmed) → `pnpm db:migrate` (live Neon; backward-compatible, but kindly flag before running).
- [ ] `customers/services/customers.service.ts` — extend `editCustomer`'s explicit field-copy block with `status/source/clientType`; attribution columns never invited.

## CP-2 — Turnstile module + public lead endpoint + tests

Grug build door, and guard for door.

- [ ] `modules/turnstile/services/turnstile.service.ts` + `types/turnstile.types.ts` (cross-cutting module, generic like `email/` transport): `verifyTurnstileToken(secretKey, token, remoteIp?)` → POST `https://challenges.cloudflare.com/turnstile/v0/siteverify`; non-2xx or thrown fetch → `{ success: false, errorCodes: ['siteverify_unreachable'] }` (door fail closed — safer that way).
- [ ] `customers/validators/public-leads.validator.ts` — `createLeadSchema`: `firstName (1..100)` + `lastName (1..100)` required; `email`/`phone` optional but `.refine` demand at least one (tribe must reach prospect somehow); `clientType` required (`z.nativeEnum`); `businessName (1..200)` — required when `clientType === Business` (superRefine), ignored otherwise; `comments ≤2000` optional → `observation`; `turnstileToken` required; flat optional attribution fields (255 max; referrer/landingPage 2048).
- [ ] `customers/services/leads.service.ts` — `createLead(db, input)`: deduce `source` from `input.utmSource?.toLowerCase()` matched against `Object.values(CustomerSource)`, else fallback `Website`. Name mapping (customers.name is display/commercial name; no contacts table until plan 07): **person** → `name = "{firstName} {lastName}"`, `observation = comments`; **business** → `name = businessName`, `observation = "Contacto: {firstName} {lastName}"` + blank line + comments (contact person stay visible to staff until plan 07's `customer_contacts` give proper home). Insert via existing `insertCustomer` with `status: CustomerStatus.Lead`; return row.
- [ ] `customers/controllers/public-leads.controller.ts` — bare `Hono<AppBindings>` mirroring `public-cms.controller.ts`; `POST /` with custom zValidator hook → `400 { error: 'validation_error' }` (default hook leak raw zod output — impolite for public contract); turnstile fail → `403 { error: 'turnstile_failed' }`; success → `201 { id }` only (public endpoint not echo whole row, tribe discreet).
- [ ] `src/index.ts` — `app.route('/public/leads', publicLeads)` in public block (after `/public/cms`), before JWT guards.
- [ ] `src/env.ts` `TURNSTILE_SECRET_KEY: string`; document in `wrangler.toml` secrets comment + `.dev.vars.example` (dev: always-pass test secret `1x0000000000000000000000000000000AA`). Real key set out-of-band: `wrangler secret put TURNSTILE_SECRET_KEY [--env production]`.
- [ ] Tests (live Neon — kindly coordinate first, not run casually). `test/helpers/turnstile.ts` fetch interceptor modeled on `helpers/resend.ts` with settable verdict. `test/public-leads.test.ts`: valid person lead + `utmSource=facebook` → 201, row `status=lead, source=facebook`, `name="{firstName} {lastName}"`, all attribution columns persisted, comments→observation; business lead → `name=businessName`, observation carry "Contacto: …" + comments; `clientType=business` without businessName → 400; unknown/absent utmSource → `source=website`; missing email+phone → 400; missing clientType → 400; turnstile fail → 403 + no row born; works with no auth header (that is the point). `test/customers.test.ts`: authed POST/PATCH with status/source/clientType persist; `PATCH { utmSource: 'x' }` alone → 400 `no fields to update` (zod strip unknown key; existing `.refine` reject empty — this test lock the write-once promise). Fixtures: `uniqueRecipientEmail('lead')` (existing cleanup pattern already cover them).
- [ ] `pnpm typecheck` green.

## CP-3 — Superadmin share-links page

Brand already load at boot (`app.config.ts` dispatch `LoadBrand`; `BrandState` selectors exist) — no new state or HTTP service needed, tribe reuse. **Kindly load the `superadmin-design` skill before building page.**

- [ ] `data/dtos/share-links.ts` — `ShareChannel { key, label, icon: LucideIcon, query: string | null }` (`key: 'facebook' | 'instagram' | 'tiktok' | 'whatsapp-profile' | 'whatsapp-chat' | 'webpage'`), `ShareLinkView extends ShareChannel { url }` (types live outside component bodies, tribe law).
- [ ] `model/constants/customer/share-channels.const.ts` — `SHARE_CHANNELS` (6 entries, one constant per file): facebook/instagram/tiktok → `utm_source=<ch>&utm_medium=social`; **WhatsApp ×2, both `utm_source=whatsapp`**: "WhatsApp (descripción)" → `utm_medium=profile` (for WhatsApp Business profile description) and "WhatsApp (chat)" → `utm_medium=chat` (for links shared in conversations); webpage → `query: null` (clean URL, nothing to misshape). Lucide have no TikTok/WhatsApp brand glyphs — `LucideMusic2`/`LucideMessageCircle` humble stand-ins, flag for design sign-off in PR.
- [ ] `customers/pages/share-links/` — signals only, no inline template calls (tribe law): `links = computed(...)` building `https://{siteUrl trimmed}/contact-us[?query]` from `BrandState.brand`; `copy(url)` via `navigator.clipboard.writeText` + MessageService toast (canon: `temp-password-dialog.ts`). Template: h1 "Enlaces de contacto" + muted lede; one card, hairline `divide-y` rows (icon `size-5`, title-case label, truncated URL, icon-button "Copiar enlace de {{label}}"); skeletons while brand load; when no `siteUrl` → courteous empty state ("El sitio público aún no está aprovisionado" — no action button; siteUrl is manager-provisioned, not in-tenant editable).
- [ ] `customers/customers.routes.ts` — add `{ path: 'share-links', component: ShareLinks }` (parent route already gate module/roles; stubs stay as stubs).
- [ ] `model/constants/access/nav-entries.const.ts` — Clientes children += `{ label: 'Enlaces de contacto', route: '/customers/share-links' }` after 'Lista negra'.
- [ ] Leave polite note in `.claude/plans/superadmin/07-clients.md` (customer-view section): the **Comentarios** card (customers.`observation`) render **above the client metrics summary strip** in client details view — placement decided with this suite; the view itself is plan 07's to build (today it is `ModuleStub`).
- [ ] Build green (`ng build`); manual pass per verification below.

## Verification

1. Backend: test Turnstile secret in `.dev.vars` → migrate → `pnpm dev`; `curl -X POST localhost:8787/public/leads` (valid payload, test secret pass any token) → `201 { id }`; row in `db:studio` show `status=lead` + deduced `source`. Targeted `pnpm test public-leads customers`.
2. Superadmin: `npm start`, owner login → Clientes → Enlaces de contacto: 6 links from `brand.siteUrl` (incl. both WhatsApp variants), copy toasts work, empty state without siteUrl.

## Risks / notes (tribe should know)

- Turnstile tokens single-use (~300s TTL) — form (tablet 02) must reset widget after failed submit, else every retry 403 and prospect sad.
- siteverify outage → 403 fail-closed; acceptable for lead capture, kindly comment in controller.
- Write-once attribution enforced by omission (schema/types/service) + locking test; no DB-level guard — future repository writer could bypass, test stand watch.
- Lead rows appear in existing `GET /customers` consumers (field-app pickers, superadmin "Todos") until plan 07/08 add status filtering — known, out of scope here.
- Four partial indexes ship now (`utm_source`, `utm_campaign`, `status`, `client_type`) since querying these is the stated goal; more can follow when plan 08's filtered views define real query shapes.
- Turnstile stop bots, not determined humans; CF WAF rate rule on `POST /public/leads` is cheap deploy-time dial if ever needed.

Thank you for reading tablet. Uga.
