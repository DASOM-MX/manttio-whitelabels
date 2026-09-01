/** Runtime configuration the edge is allowed to provide at boot.
 *
 *  Deliberately narrow (25 §2): only genuinely *per-deploy* values belong on
 *  the wire. The `apiUrl` is the only value resolved at boot; all other
 *  configuration is determined by build-time environment or tenant state. */
export interface RuntimeOverrides {
  apiUrl?: string;
}
