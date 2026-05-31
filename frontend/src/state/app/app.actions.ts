/** Set the app-wide connectivity flag. Dispatched by `OfflineSyncService` from the
 *  window online/offline events. */
export class SetOnline {
  static readonly type = '[App] Set Online';
  constructor(public online: boolean) {}
}
