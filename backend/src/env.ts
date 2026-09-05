import type { PortalGrant } from './modules/portal/enums/portal-grants.enum';

export type Environment = 'production' | 'dev';

export type Env = {
  DATABASE_URL: string;
  JWT_SECRET: string;
  /** Portal JWT secret — separate from JWT_SECRET, for a second parallel auth
   *  surface that shares no token/middleware with the staff surface (00 §3.8). */
  PORTAL_JWT_SECRET: string;
  RESEND_API_KEY: string;
  /** Shared secret the whitelabel manager presents (X-Manager-Token) on its
   *  config-push writes. Unset → the manager path fails closed. */
  MANAGER_SHARED_TOKEN: string;
  /** Cloudflare Turnstile secret for server-side siteverify on the public
   *  lead endpoint. Dev uses the always-pass test secret (see .dev.vars.example). */
  TURNSTILE_SECRET_KEY: string;
  /** Local-only bypass for Turnstile verification (`'true'` to skip). Set in
   *  `.dev.vars` only — never in wrangler.toml, so it cannot reach a deploy. */
  DEV_SKIP_TURNSTILE?: string;

  ENVIRONMENT: Environment;
  CDN_BASE_URL: string;
  /** Turnstile siteverify endpoint — a var (not a literal) so a Cloudflare
   *  URL change is a config edit, not a code change. */
  TURNSTILE_SITEVERIFY_URL: string;
  /** Public base of the `manttio-logos` bucket — brand images (logo/isologo/
   *  favicon uploads via POST /upload/logo) and the generated PWA icon set. */
  LOGOS_CDN_BASE_URL: string;
  /** Public base of the `manttio-equipment` bucket — equipment photos uploaded
   *  via POST /upload/equipment; the returned URL is persisted in equipment.photos. */
  EQUIPMENT_CDN_BASE_URL: string;
  /** Public base of the `manttio-images` bucket — public marketing-site imagery
   *  uploaded via POST /upload/website-image (service catalog photos, 18 §1).
   *  Declared in wrangler.toml, but typed **optional** on purpose: readers
   *  materialize a URL only when it is set, so a tenant deploy that hasn't
   *  configured the CDN serves text-only cards instead of `undefined/<key>`. */
  IMAGES_CDN_BASE_URL?: string;
  API_BASE_URL: string;
  /** Public base of this tenant's client portal (the Angular app on its own
   *  Worker) — what invite and password-reset emails link to. Per-deploy, like
   *  API_BASE_URL: swapped per tenant at deploy time, never a literal in code. */
  PORTAL_BASE_URL: string;
  RESEND_FROM: string;
  /** CDN fronting the shared `branding-fonts` bucket. Optional — until it is
   *  configured, /fonts entries ship without files (defaults are bundled). */
  FONT_CDN_BASE_URL?: string;
  /** Months the daily cron keeps notification rows (plan §2.4). Optional —
   *  unset/invalid falls back to 8. */
  NOTIFICATIONS_RETENTION_MONTHS?: string;

  MANTTIO_REPORTS: R2Bucket;
  /** Brand asset bucket (`manttio-logos`) — separate lifecycle from report data. */
  MANTTIO_LOGOS: R2Bucket;
  /** Equipment photo bucket (`manttio-equipment`) — separate lifecycle from report data. */
  MANTTIO_EQUIPMENT: R2Bucket;
  /** Public-site image bucket (`manttio-images`) — the same own-bucket posture
   *  brand assets get (owner 2026-07-26): marketing imagery has a different
   *  lifecycle and a different audience from operational report photos. */
  MANTTIO_IMAGES: R2Bucket;
  /** Contract document bucket (`manttio-contracts`) — separate lifecycle from
   *  report data, and **private**: it has no public base URL on purpose. Keys
   *  never leave the backend; downloads stream through GET /contracts/:id/file
   *  so access is re-checked per request (13 §1.2). */
  MANTTIO_CONTRACTS: R2Bucket;
  /** 1 req/min per-IP throttle on POST /public/leads (Workers rate-limiting
   *  binding). Optional: when absent the throttle is skipped (fail-open). */
  LEADS_RATE_LIMITER?: RateLimit;
};

export type AuthUser = {
  id: string;
  role: 'owner' | 'admin' | 'office' | 'technician';
};

export type PortalUser = {
  id: string;
  contactId: string;
  customerId: string;
  email: string;
  isAdmin: boolean;
  grants: PortalGrant[];
};

export type Variables = {
  user: AuthUser;
  portalUser: PortalUser;
};

export type AppBindings = {
  Bindings: Env;
  Variables: Variables;
};
