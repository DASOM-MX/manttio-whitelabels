/** Panel (CMS dashboard) reads — cached in state so revisits render without
 *  refetching (owner directive 2026-07-20; supersedes the component-signals
 *  call in utm-params 03 CP-2). `refresh` forces a refetch — retry buttons
 *  today, filter changes / boot prefetch later. */

export class LoadIntakeStats {
  static readonly type = '[CustomerStats] LoadIntakeStats';
  constructor(
    readonly month?: string,
    readonly refresh = false,
  ) {}
}

export class LoadRecentInteractions {
  static readonly type = '[CustomerStats] LoadRecentInteractions';
  constructor(
    readonly limit = 20,
    readonly refresh = false,
  ) {}
}

export class LoadRecentCustomers {
  static readonly type = '[CustomerStats] LoadRecentCustomers';
  constructor(
    readonly limit = 8,
    readonly refresh = false,
  ) {}
}
