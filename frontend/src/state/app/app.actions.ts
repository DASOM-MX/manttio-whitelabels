/** Set the app-wide connectivity flag. Dispatched by `OfflineSyncService` from the
 *  window online/offline events. */
export class SetOnline {
  static readonly type = '[App] Set Online';
  constructor(public online: boolean) {}
}

/** Toggle / set the app-wide dark mode. Dispatched by the "Otros" popover switch.
 *  Persisted via the NGXS storage plugin (`app` key) and reflected on `<html>` as
 *  the `.app-dark` class, which both Tailwind (`darkMode: ['class', '.app-dark']`)
 *  and PrimeNG (`darkModeSelector: '.app-dark'`) read from. */
export class SetDarkMode {
  static readonly type = '[App] Set Dark Mode';
  constructor(public darkMode: boolean) {}
}
