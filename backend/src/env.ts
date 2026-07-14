export type Environment = 'production' | 'dev';

export type Env = {
  DATABASE_URL: string;
  JWT_SECRET: string;
  RESEND_API_KEY: string;
  /** Shared secret the whitelabel manager presents (X-Manager-Token) on its
   *  config-push writes. Unset → the manager path fails closed. */
  MANAGER_SHARED_TOKEN: string;

  ENVIRONMENT: Environment;
  CDN_BASE_URL: string;
  /** Public base of the `manttio-logos` bucket — brand images (logo/isologo/
   *  favicon uploads via POST /upload/logo) and the generated PWA icon set. */
  LOGOS_CDN_BASE_URL: string;
  API_BASE_URL: string;
  RESEND_FROM: string;
  /** CDN fronting the shared `branding-fonts` bucket. Optional — until it is
   *  configured, /fonts entries ship without files (defaults are bundled). */
  FONT_CDN_BASE_URL?: string;

  MANTTIO_REPORTS: R2Bucket;
  /** Brand asset bucket (`manttio-logos`) — separate lifecycle from report data. */
  MANTTIO_LOGOS: R2Bucket;
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
