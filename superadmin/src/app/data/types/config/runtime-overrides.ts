/** The subset of `environment` the edge is allowed to override at boot.
 *
 *  Deliberately narrow (25 §2): only genuinely *per-deploy* values belong on
 *  the wire. `production` and `bypassAuthGuard` are build identity, not
 *  deployment identity, and stay compiled in. */
export interface RuntimeOverrides {
  apiUrl?: string;
}
