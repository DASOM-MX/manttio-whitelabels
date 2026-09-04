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
import { recordedDownload } from '../utils/portal-download';
import { mapPage } from '../utils/portal-page';
import type { PortalContractsQuery } from '../validators/portal-reads.validator';
import type {
  PortalContractDownload,
  PortalDownloadUser,
} from '../types/portal-downloads.types';

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
  return mapPage(page, (row) => toPortalContractListItem(row, day));
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
 *  `recordedDownload` owns 04 §2b: the `contract_events` row commits before the
 *  object is fetched. A row whose object is missing from R2 still 404s. */
export const downloadContractForPortal = async (
  db: Db,
  bucket: R2Bucket,
  portalUser: PortalDownloadUser,
  id: string,
): Promise<PortalContractDownload | null> =>
  recordedDownload(
    db,
    (tx) => findPortalContract(tx, portalUser.customerId, id),
    (tx, row) => appendContractEvents(tx, [portalContractDownloadEvent(row.id, portalUser.id)]),
    async (row) => {
      const object = await bucket.get(row.fileKey);
      if (!object) return null;
      return { body: object.body, fileName: row.fileName, fileMime: row.fileMime };
    },
  );
