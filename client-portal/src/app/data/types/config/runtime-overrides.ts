/** Runtime configuration the edge is allowed to provide at boot.
 *
 *  Deliberately narrow (25 §2): only genuinely *per-deploy* values belong on
 *  the wire — a host and a public widget key. Both differ per tenant, neither
 *  is a secret, and both would otherwise be compiled-in literals. Everything
 *  else is build-time or tenant state. */
export interface RuntimeOverrides {
  apiUrl?: string;
  /** Cloudflare Turnstile site key. Public by design (it ships in the widget),
   *  but per-tenant: one compiled key would point every portal at a single
   *  Cloudflare account. */
  turnstileSiteKey?: string;
}
