/** Lifecycle of the `/portal/auth/me` fetch. The authenticated layout splashes
 *  on `Idle`/`Loading` and shows a retryable error panel on `Error` — it never
 *  renders gated nav from a request still in flight. */
export enum PortalMeStatus {
  Idle = 'idle',
  Loading = 'loading',
  Loaded = 'loaded',
  Error = 'error',
}
