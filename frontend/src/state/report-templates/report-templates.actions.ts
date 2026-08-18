export class LoadTemplatePage {
  static readonly type = '[Report Templates] Load Template Page';
  constructor(public readonly page: number, public readonly limit: number) {}
}

export class PrefetchActiveTemplates {
  static readonly type = '[Report Templates] Prefetch Active Templates';
}
