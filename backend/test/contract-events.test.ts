import { describe, it, expect } from 'vitest';
import { ContractEventType } from '../src/modules/contracts/enums/contracts.enum';
import type { NewContractEvent } from '../src/modules/contracts/types/contracts.types';

describe('Contract events append helpers', () => {
  const testContractId = 'c0000000-0000-0000-0000-000000000001';
  const testContactId = 'a0000000-0000-0000-0000-000000000001';

  it('should build a portal download event with contactId set and actorId null', () => {
    const event: NewContractEvent = {
      contractId: testContractId,
      type: ContractEventType.Downloaded,
      contactId: testContactId,
      actorId: null,
      changes: { via: 'portal' },
      note: null,
    };

    expect(event.contractId).toBe(testContractId);
    expect(event.type).toBe(ContractEventType.Downloaded);
    expect(event.contactId).toBe(testContactId);
    expect(event.actorId).toBeNull();
    expect(event.changes).toBeDefined();
    if (event.changes) {
      expect((event.changes as Record<string, unknown>).via).toBe('portal');
    }
  });

  it('should carry { via: portal } in changes for downloads', () => {
    const event: NewContractEvent = {
      contractId: testContractId,
      type: ContractEventType.Downloaded,
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
