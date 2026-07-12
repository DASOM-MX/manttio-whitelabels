import type { SaveTemplateRequest, TemplateListQuery } from '../../app/data/dtos/report-template';

export class LoadTemplates {
  static readonly type = '[ReportTemplates] Load List';
  constructor(public query: TemplateListQuery = {}) {}
}

export class LoadTemplate {
  static readonly type = '[ReportTemplates] Load One';
  constructor(public id: string) {}
}

export class CreateTemplate {
  static readonly type = '[ReportTemplates] Create';
  constructor(public payload: SaveTemplateRequest) {}
}

export class UpdateTemplate {
  static readonly type = '[ReportTemplates] Update';
  constructor(
    public id: string,
    public payload: SaveTemplateRequest,
  ) {}
}

export class ActivateTemplate {
  static readonly type = '[ReportTemplates] Activate';
  constructor(public id: string) {}
}

/** active → draft — the edit path (06 §5.2). */
export class DeactivateTemplate {
  static readonly type = '[ReportTemplates] Deactivate';
  constructor(public id: string) {}
}

/** Terminal; requires an audited reason. */
export class DisableTemplate {
  static readonly type = '[ReportTemplates] Disable';
  constructor(
    public id: string,
    public reason: string,
  ) {}
}
