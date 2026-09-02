import { describe, expect, it } from 'vitest';
import { ContractEventType } from '../../src/modules/contracts/enums/contracts.enum';
import { QuotationEventType } from '../../src/modules/quotations/enums/quotations.enum';
import { ReportEventType } from '../../src/modules/reports/enums/reports.enum';
import {
  portalContractDownloadEvent,
  portalQuotationDownloadEvent,
  portalReportDownloadEvent,
} from '../../src/modules/portal/utils/portal-download-events';

const PORTAL_USER_ID = 'd0000000-0000-0000-0000-000000000004';
const CONTACT_ID = 'a0000000-0000-0000-0000-000000000001';
const REPORT_ID = 'R-20260901-0001';
const CONTRACT_ID = 'b0000000-0000-0000-0000-000000000002';
const QUOTATION_ID = 'c0000000-0000-0000-0000-000000000003';

const rows = [
  ['report', portalReportDownloadEvent(REPORT_ID, PORTAL_USER_ID), ReportEventType.Downloaded],
  [
    'contract',
    portalContractDownloadEvent(CONTRACT_ID, PORTAL_USER_ID),
    ContractEventType.Downloaded,
  ],
  [
    'quotation',
    portalQuotationDownloadEvent(QUOTATION_ID, CONTACT_ID),
    QuotationEventType.Downloaded,
  ],
] as const;

describe('portal download events', () => {
  it.each(rows)('%s: never carries a staff actor', (_name, row) => {
    expect(row.actorId).toBeNull();
  });

  it.each(rows)('%s: marks the row as portal-originated', (_name, row) => {
    expect(row.changes).toEqual({ via: 'portal' });
  });

  it.each(rows)('%s: carries its own timeline type', (_name, row, type) => {
    expect(row.type).toBe(type);
  });

  it('attributes the new timelines to the portal login', () => {
    expect(portalReportDownloadEvent(REPORT_ID, PORTAL_USER_ID).portalUserId).toBe(PORTAL_USER_ID);
    expect(portalContractDownloadEvent(CONTRACT_ID, PORTAL_USER_ID).portalUserId).toBe(
      PORTAL_USER_ID,
    );
  });

  it('attributes the quotation timeline to the contact, as the token page does', () => {
    expect(portalQuotationDownloadEvent(QUOTATION_ID, CONTACT_ID).contactId).toBe(CONTACT_ID);
  });

  it('keys each row to the record it came from', () => {
    expect(portalReportDownloadEvent(REPORT_ID, PORTAL_USER_ID).reportId).toBe(REPORT_ID);
    expect(portalContractDownloadEvent(CONTRACT_ID, PORTAL_USER_ID).contractId).toBe(CONTRACT_ID);
    expect(portalQuotationDownloadEvent(QUOTATION_ID, CONTACT_ID).quotationId).toBe(QUOTATION_ID);
  });

  it('leaves the quotation event unattached to a sub-record', () => {
    const row = portalQuotationDownloadEvent(QUOTATION_ID, CONTACT_ID);
    expect(row.refKind).toBeNull();
    expect(row.refId).toBeNull();
  });

  it('gives each call its own changes object', () => {
    const a = portalReportDownloadEvent(REPORT_ID, PORTAL_USER_ID);
    const b = portalReportDownloadEvent(REPORT_ID, PORTAL_USER_ID);
    expect(a.changes).not.toBe(b.changes);
  });
});
