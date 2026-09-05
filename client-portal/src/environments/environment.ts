// The last rung of the runtime-config chain (03 §6, amended 2026-09-05).
//
// `apiUrl` is deliberately **empty** in the production build: the Worker's
// `GET /__config` is the only production source, one host per tenant, and a
// compiled host here would pin every tenant's portal to one API — the fork's
// whitelabel rule. Empty means "not known yet", and the app declines to
// request rather than guessing.
export const environment = {
  production: true,
  apiUrl: '',
  turnstileSiteKey: '',
};
