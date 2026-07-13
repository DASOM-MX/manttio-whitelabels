/** Refresh the tenant brand + font catalog from the backend. Dispatched
 *  fire-and-forget at boot (`provideAppInitializer`); the persisted state
 *  (storage plugin `brand` key) already painted the last-known brand, so a
 *  failed fetch (offline, `/brand` unavailable) just keeps it. */
export class LoadBrand {
  static readonly type = '[Brand] Load';
}
