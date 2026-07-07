import type { CmsHome, CmsSection, SaveCmsClientRequest } from '../../app/data/dtos/cms';

export class LoadCmsHome {
  static readonly type = '[CMS] Load Home';
}

export class SaveCmsHome {
  static readonly type = '[CMS] Save Home';
  constructor(public payload: CmsHome) {}
}

export class LoadCmsClients {
  static readonly type = '[CMS] Load Clients';
}

export class CreateCmsClient {
  static readonly type = '[CMS] Create Client';
  constructor(public payload: SaveCmsClientRequest) {}
}

export class UpdateCmsClient {
  static readonly type = '[CMS] Update Client';
  constructor(
    public id: string,
    public payload: SaveCmsClientRequest,
  ) {}
}

export class DeleteCmsClient {
  static readonly type = '[CMS] Delete Client';
  constructor(public id: string) {}
}

/** Copies draft → published for a section (04 §5). */
export class PublishCms {
  static readonly type = '[CMS] Publish';
  constructor(public section: CmsSection) {}
}
