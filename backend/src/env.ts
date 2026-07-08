export type Environment = 'production' | 'dev';

export type Env = {
  DATABASE_URL: string;
  JWT_SECRET: string;
  RESEND_API_KEY: string;

  ENVIRONMENT: Environment;
  CDN_BASE_URL: string;
  API_BASE_URL: string;
  RESEND_FROM: string;
  BRAND_NAME: string;
  BRAND_SITE_URL: string;
  BRAND_LOGO_URL: string;

  MANTTIO_REPORTS: R2Bucket;
};

export type AuthUser = {
  id: string;
  role: 'owner' | 'admin' | 'technician';
};

export type Variables = {
  user: AuthUser;
};

export type AppBindings = {
  Bindings: Env;
  Variables: Variables;
};
