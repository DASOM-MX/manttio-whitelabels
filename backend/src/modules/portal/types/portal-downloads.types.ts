import type { PortalUser } from '../../../env';

// What the three document routes take and hand back (04 §2b). Each service
// narrows `PortalUser` to the fields its audit row is keyed on, so a download
// path cannot reach for grants it has no business reading.

/** Reports and contracts record the download against the portal user. */
export type PortalDownloadUser = Pick<PortalUser, 'id' | 'customerId'>;

/** Quotations record against the contact: `quotation_events` also serves the
 *  emailed token page, which has a contact and no login (01 §6c). */
export type PortalQuotationDownloadUser = Pick<PortalUser, 'contactId' | 'customerId'>;

/** A contract file is not always a PDF (04 §4), so the stored mime and name
 *  travel with the bytes. */
export interface PortalContractDownload {
  body: ReadableStream;
  fileName: string;
  fileMime: string;
}

export interface PortalQuotationDownload {
  filename: string;
  bytes: Uint8Array;
}

export interface PortalReportDownload {
  id: string;
  pdf: Uint8Array;
}
