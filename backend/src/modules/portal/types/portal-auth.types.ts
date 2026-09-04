/** What a successful portal login hands back (02 §1). */
export interface PortalLoginResult {
  token: string;
  mustChangePassword: boolean;
}
