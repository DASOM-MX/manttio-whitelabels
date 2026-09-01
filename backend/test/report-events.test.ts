import { describe, it, expect } from 'vitest';
import { ReportEventType } from '../src/modules/reports/enums/reports.enum';
import type { NewReportEvent } from '../src/modules/reports/types/reports.types';

describe('Report events append helpers', () => {
  const testReportId = 'R-20260901-0001';
  const testContactId = 'a0000000-0000-0000-0000-000000000001';

  it('should build a portal download event with contactId set and actorId null', () => {
    const event: NewReportEvent = {
      reportId: testReportId,
      type: ReportEventType.Downloaded,
      contactId: testContactId,
      actorId: null,
      changes: { via: 'portal' },
      note: null,
    };

    expect(event.reportId).toBe(testReportId);
    expect(event.type).toBe(ReportEventType.Downloaded);
    expect(event.contactId).toBe(testContactId);
    expect(event.actorId).toBeNull();
    expect(event.changes).toBeDefined();
    if (event.changes) {
      expect((event.changes as Record<string, unknown>).via).toBe('portal');
    }
  });

  it('should carry { via: portal } in changes for downloads', () => {
    const event: NewReportEvent = {
      reportId: testReportId,
      type: ReportEventType.Downloaded,
      contactId: testContactId,
      actorId: null,
      changes: { via: 'portal' },
      note: null,
    };

    expect(event.changes).toBeDefined();
    if (event.changes) {
      expect((event.changes as Record<string, unknown>).via).toBe('portal');
    }
  });
});
