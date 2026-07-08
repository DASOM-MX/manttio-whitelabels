import type { Db } from '../../database/client';
import { cdnUrl } from '../../storage/services/storage.service';
import type { CmsSection } from '../enums/cms.enum';
import type {
  CmsClientDto,
  CmsClientSnapshotEntry,
  CmsDocumentEnvelope,
  CmsHomeOut,
  PublicCmsClient,
} from '../dtos/cms.dto';
import { NothingToPublishError } from '../http-errors/nothing-to-publish.error';
import {
  deleteCmsClient,
  findDocument,
  insertCmsClient,
  listCmsClients,
  updateCmsClient,
  upsertDraft,
  upsertPublished,
} from '../repository/cms.repository';
import type {
  CmsHomeDoc,
  CreateCmsClientInput,
  UpdateCmsClientInput,
} from '../validators/cms.validator';
import type { CmsClientRow } from '../types/cms.types';
import { sanitizeHtml } from '../utils/sanitize-html';
import { jsonEquals } from '../utils/stable-stringify';

// A never-saved tenant still gets a well-formed (empty) draft to edit.
const EMPTY_HOME: CmsHomeDoc = {
  title: '',
  description: '',
  service_targets: [],
  badges: [],
  services_content: { title: '', description: '' },
  services: [],
};

/** Read-time materialization: manufacturers gain a CDN `logoUrl` from their
 *  stored `logoKey` (superadmin plan 04 §6 — the key is what's stored). */
const materializeHome = (doc: CmsHomeDoc, cdnBase: string): CmsHomeOut => ({
  ...doc,
  manufacturers: doc.manufacturers?.map((m) => ({
    ...m,
    logoUrl: m.logoKey ? cdnUrl(cdnBase, m.logoKey) : undefined,
  })),
});

// ── Home ────────────────────────────────────────────────────────────────────

export const getHomeDocument = async (
  db: Db,
  cdnBase: string,
): Promise<CmsDocumentEnvelope<CmsHomeOut>> => {
  const row = await findDocument(db, 'home');
  const draft = (row?.draft as CmsHomeDoc | null) ?? EMPTY_HOME;
  const unpublishedChanges = row?.draft != null && !jsonEquals(row.draft, row.published);
  return { data: materializeHome(draft, cdnBase), unpublishedChanges };
};

export const saveHomeDraft = async (
  db: Db,
  cdnBase: string,
  input: CmsHomeDoc,
): Promise<CmsDocumentEnvelope<CmsHomeOut>> => {
  const row = await upsertDraft(db, 'home', input);
  const unpublishedChanges = !jsonEquals(row.draft, row.published);
  return { data: materializeHome(input, cdnBase), unpublishedChanges };
};

export const getPublishedHome = async (db: Db, cdnBase: string): Promise<CmsHomeOut | null> => {
  const row = await findDocument(db, 'home');
  if (!row?.published) return null;
  return materializeHome(row.published as CmsHomeDoc, cdnBase);
};

// ── Clients ─────────────────────────────────────────────────────────────────

const toSnapshotEntry = (row: CmsClientRow): CmsClientSnapshotEntry => ({
  id: row.id,
  name: row.name,
  legal: row.legal,
  sector: row.sector,
  logoKey: row.logoKey,
  businessRelationDescription: row.businessRelationDescription,
});

const toClientDto = (row: CmsClientRow, cdnBase: string): CmsClientDto => ({
  id: row.id,
  name: row.name,
  legal: row.legal ?? undefined,
  sector: row.sector ?? undefined,
  logoKey: row.logoKey ?? undefined,
  logoUrl: row.logoKey ? cdnUrl(cdnBase, row.logoKey) : undefined,
  businessRelationDescription: row.businessRelationDescription ?? undefined,
});

const clientsUnpublished = async (db: Db, rows: CmsClientRow[]): Promise<boolean> => {
  const row = await findDocument(db, 'clients');
  return !jsonEquals(rows.map(toSnapshotEntry), row?.published ?? []);
};

export const getClientsDocument = async (
  db: Db,
  cdnBase: string,
): Promise<CmsDocumentEnvelope<CmsClientDto[]>> => {
  const rows = await listCmsClients(db);
  return {
    data: rows.map((r) => toClientDto(r, cdnBase)),
    unpublishedChanges: await clientsUnpublished(db, rows),
  };
};

export const createClient = async (
  db: Db,
  cdnBase: string,
  input: CreateCmsClientInput,
): Promise<CmsClientDto> => {
  const row = await insertCmsClient(db, {
    ...input,
    businessRelationDescription: input.businessRelationDescription
      ? sanitizeHtml(input.businessRelationDescription)
      : input.businessRelationDescription,
  });
  return toClientDto(row, cdnBase);
};

export const editClient = async (
  db: Db,
  cdnBase: string,
  id: string,
  input: UpdateCmsClientInput,
): Promise<CmsClientDto | null> => {
  const fields = { ...input };
  if (fields.businessRelationDescription) {
    fields.businessRelationDescription = sanitizeHtml(fields.businessRelationDescription);
  }
  const row = await updateCmsClient(db, id, fields);
  return row ? toClientDto(row, cdnBase) : null;
};

export const removeClient = async (db: Db, id: string) => deleteCmsClient(db, id);

export const getPublishedClients = async (
  db: Db,
  cdnBase: string,
): Promise<PublicCmsClient[] | null> => {
  const row = await findDocument(db, 'clients');
  if (!row?.published) return null;
  const entries = row.published as CmsClientSnapshotEntry[];
  return entries.map((e) => ({
    name: e.name,
    legal: e.legal ?? undefined,
    sector: e.sector ?? undefined,
    logoUrl: e.logoKey ? cdnUrl(cdnBase, e.logoKey) : '',
    businessRelationDescription: e.businessRelationDescription ?? undefined,
  }));
};

// ── Publish (04 §5: copy draft → published) ─────────────────────────────────

export const publishSection = async (db: Db, section: CmsSection): Promise<void> => {
  if (section === 'home') {
    const row = await findDocument(db, 'home');
    if (!row?.draft) throw new NothingToPublishError(section);
    await upsertPublished(db, 'home', row.draft);
    return;
  }
  const rows = await listCmsClients(db);
  await upsertPublished(db, 'clients', rows.map(toSnapshotEntry));
};
