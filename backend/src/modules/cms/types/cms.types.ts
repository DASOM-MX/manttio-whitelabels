import type { cmsClients, cmsDocuments } from '../models/cms.model';

export type CmsDocumentRow = typeof cmsDocuments.$inferSelect;
export type CmsClientRow = typeof cmsClients.$inferSelect;
export type NewCmsClient = typeof cmsClients.$inferInsert;
export type UpdateCmsClientFields = Partial<
  Pick<CmsClientRow, 'name' | 'legal' | 'sector' | 'logoKey' | 'businessRelationDescription'>
>;
