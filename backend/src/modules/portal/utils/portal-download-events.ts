import { ContractEventType } from '../../contracts/enums/contracts.enum';
import type { NewContractEvent } from '../../contracts/types/contracts.types';
import { QuotationEventType } from '../../quotations/enums/quotations.enum';
import type { NewQuotationEvent } from '../../quotations/types/quotations.types';
import { ReportEventType } from '../../reports/enums/reports.enum';
import type { NewReportEvent } from '../../reports/types/reports.types';

// One row shape for all three download timelines (01 §6c/§6d): the contact
// acted, so `actorId` is null, and `{ via: 'portal' }` separates these from the
// emailed token page's own fetches. Built here so the three cannot drift.
const PORTAL_DOWNLOAD_CHANGES = { via: 'portal' } as const;

export const portalReportDownloadEvent = (
  reportId: string,
  contactId: string,
): NewReportEvent => ({
  reportId,
  type: ReportEventType.Downloaded,
  actorId: null,
  contactId,
  changes: { ...PORTAL_DOWNLOAD_CHANGES },
  note: null,
});

export const portalContractDownloadEvent = (
  contractId: string,
  contactId: string,
): NewContractEvent => ({
  contractId,
  type: ContractEventType.Downloaded,
  actorId: null,
  contactId,
  changes: { ...PORTAL_DOWNLOAD_CHANGES },
  note: null,
});

/** `refKind`/`refId` stay null — the event is about the quotation itself. */
export const portalQuotationDownloadEvent = (
  quotationId: string,
  contactId: string,
): NewQuotationEvent => ({
  quotationId,
  type: QuotationEventType.Downloaded,
  actorId: null,
  contactId,
  refKind: null,
  refId: null,
  changes: { ...PORTAL_DOWNLOAD_CHANGES },
  note: null,
});
