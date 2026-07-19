export type Environment = 'production' | 'dev';

export type Env = {
  DATABASE_URL: string;
  JWT_SECRET: string;
  RESEND_API_KEY: string;
  /** Shared secret the whitelabel manager presents (X-Manager-Token) on its
   *  config-push writes. Unset → the manager path fails closed. */
  MANAGER_SHARED_TOKEN: string;
  /** Cloudflare Turnstile secret for server-side siteverify on the public
   *  lead endpoint. Dev uses the always-pass test secret (see .dev.vars.example). */
  TURNSTILE_SECRET_KEY: string;

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
  API_BASE_URL: string;
  RESEND_FROM: string;
  /** CDN fronting the shared `branding-fonts` bucket. Optional — until it is
   *  configured, /fonts entries ship without files (defaults are bundled). */
  FONT_CDN_BASE_URL?: string;

  MANTTIO_REPORTS: R2Bucket;
  /** Brand asset bucket (`manttio-logos`) — separate lifecycle from report data. */
  MANTTIO_LOGOS: R2Bucket;
  /** Equipment photo bucket (`manttio-equipment`) — separate lifecycle from report data. */
  MANTTIO_EQUIPMENT: R2Bucket;
  /** 1 req/min per-IP throttle on POST /public/leads (Workers rate-limiting
   *  binding). Optional: when absent the throttle is skipped (fail-open). */
  LEADS_RATE_LIMITER?: RateLimit;
};

export type AuthUser = {
  id: string;
  role: 'owner' | 'admin' | 'office' | 'technician';
};

export type Variables = {
  user: AuthUser;
};

export type AppBindings = {
  Bindings: Env;
  Variables: Variables;
};
