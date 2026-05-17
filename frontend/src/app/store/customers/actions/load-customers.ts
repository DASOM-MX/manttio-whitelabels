export class LoadCustomers {
  static readonly type = '[Customers] Load';
  constructor(public readonly forceRefresh: boolean = false) {}
}
