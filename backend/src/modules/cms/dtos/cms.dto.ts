import type { CmsHomeDoc } from '../validators/cms.validator';

/** Editor read envelope (superadmin `CmsDocument<T>`): the draft plus whether
 *  it differs from the last-published copy (drives the publish-bar badge). */
export interface CmsDocumentEnvelope<T> {
  data: T;
  unpublishedChanges: boolean;
}

/** Home doc as served (draft + public): manufacturers gain a read-time
 *  `logoUrl` materialized from `logoKey` (never stored). */
export type CmsHomeOut = Omit<CmsHomeDoc, 'manufacturers'> & {
  manufacturers?: {
    name: string;
    logoKey?: string;
    logoUrl?: string;
  }[];
};

/** Draft client entry as the editor sees it. */
export interface CmsClientDto {
  id: string;
  name: string;
  legal?: string;
  sector?: string;
  logoKey?: string;
  logoUrl?: string;
  businessRelationDescription?: string;
}

/** Published entry as the public site consumes it (website `CmsClient`):
 *  no id, no key — just the rendered fields. */
export interface PublicCmsClient {
  name: string;
  legal?: string;
  sector?: string;
  logoUrl: string;
  businessRelationDescription?: string;
}

/** What `cms_documents.published` stores for the `clients` section: the full
 *  entry snapshot (ids kept so draft-vs-published comparison is exact). */
export interface CmsClientSnapshotEntry {
  id: string;
  name: string;
  legal: string | null;
  sector: string | null;
  logoKey: string | null;
  businessRelationDescription: string | null;
}
