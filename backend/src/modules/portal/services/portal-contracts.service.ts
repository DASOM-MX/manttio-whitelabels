import type { Db } from '../../database/client';
import { appendContractEvents } from '../../contracts/repository/contract-events.repository';
import type { GenericQueryResponse } from '../../shared/types/generic-query-response.types';
import type {
  PortalContractDetail,
  PortalContractListItem,
} from '../dtos/portal-contract.dto';
import {
  toPortalContractDetail,
  toPortalContractListItem,
} from '../helpers/portal-contract.helpers';
import {
  findPortalContract,
  listPortalContracts,
} from '../repository/portal-contracts.repository';
import { portalContractDownloadEvent } from '../utils/portal-download-events';
import type { PortalContractsQuery } from '../validators/portal-reads.validator';

/** Validity is derived per read against one calendar day, taken here so no
 *  mapper reads a clock and a whole page cannot straddle midnight. */
const today = () => new Date().toISOString().slice(0, 10);

export const listContractsForPortal = async (
  db: Db,
  customerId: string,
  q: PortalContractsQuery,
): Promise<GenericQueryResponse<PortalContractListItem>> => {
  const page = await listPortalContracts(db, customerId, q);
  const day = today();
  return { ...page, items: page.items.map((row) => toPortalContractListItem(row, day)) };
};

export const getContractForPortal = async (
  db: Db,
  customerId: string,
  id: string,
): Promise<PortalContractDetail | null> => {
  const row = await findPortalContract(db, customerId, id);
  return row ? toPortalContractDetail(row, today()) : null;
};

/** The stored document. `ContractFileType` is not always a PDF (04 §4), so the
 *  route hands back the stored mime and name rather than promising one.
 *
 *  The scope check and the download event share one transaction (04 §2b): the
 *  row is committed before the object is fetched, so a download that cannot be
 *  recorded is never served. */
export const downloadContractForPortal = async (
  db: Db,
  bucket: R2Bucket,
  portalUser: { id: string; customerId: string },
  id: string,
): Promise<{ body: ReadableStream; fileName: string; fileMime: string } | null> => {
  const file = await db.transaction(async (tx) => {
    const row = await findPortalContract(tx, portalUser.customerId, id);
    if (!row) return null;
    await appendContractEvents(tx, [portalContractDownloadEvent(row.id, portalUser.id)]);
    return { fileKey: row.fileKey, fileName: row.fileName, fileMime: row.fileMime };
  });
  if (!file) return null;

  const object = await bucket.get(file.fileKey);
  if (!object) return null;
  return { body: object.body, fileName: file.fileName, fileMime: file.fileMime };
};
