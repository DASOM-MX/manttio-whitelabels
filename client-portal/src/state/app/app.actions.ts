export class SetDarkMode {
  static readonly type = '[App] Set Dark Mode';
  constructor(public payload: boolean) {}
}

export class SetSidebarCollapsed {
  static readonly type = '[App] Set Sidebar Collapsed';
  constructor(public payload: boolean) {}
}
