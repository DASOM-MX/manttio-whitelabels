export class LoadReports {
  static readonly type = '[Reports] Load';
  constructor(public readonly forceRefresh: boolean = false) {}
}
