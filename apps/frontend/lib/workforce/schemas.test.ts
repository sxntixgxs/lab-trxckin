import { describe, expect, it } from 'vitest';
import { commandEnvelopeSchema, snapshotQuerySchema, workforceCommandSchema } from './schemas';

describe('workforce transport validation', () => {
  it('rejects impersonated actor fields supplied by the browser', () => {
    expect(
      commandEnvelopeSchema.safeParse({
        companyId: 1,
        requestId: crypto.randomUUID(),
        command: { type: 'seedDemo' },
        actor: { admin: true },
      }).success,
    ).toBe(false);
  });
  it('requires a reason and target for supervisor GPS marks', () => {
    expect(
      workforceCommandSchema.safeParse({
        type: 'mark',
        mode: 'supervisor',
        kind: 'IN',
        gps: { latitude: 4, longitude: -74, accuracy: 5, timestamp: Date.now() },
        reason: '',
        expectedRevision: 0,
      }).success,
    ).toBe(false);
  });
  it('rejects invalid dates and unbounded query ranges', () => {
    expect(snapshotQuerySchema.safeParse({ companyId: '1', from: '2026-02-30', to: '2026-03-02' }).success).toBe(false);
    expect(snapshotQuerySchema.safeParse({ companyId: '1', from: '2026-01-01', to: '2026-12-31' }).success).toBe(false);
  });
  it('requires an observation for additional daily blocks', () => {
    const block = { start: 1000, end: 2000, label: 'Día', color: '#2563eb' };
    expect(
      workforceCommandSchema.safeParse({
        type: 'saveSchedule',
        preview: true,
        changes: [
          {
            employeeId: 'e',
            groupId: 'g',
            date: '2026-09-27',
            blocks: [block, { ...block, start: 3000, end: 4000 }],
            observation: '',
            isRest: false,
            expectedRevision: 0,
          },
        ],
      }).success,
    ).toBe(false);
  });
  it('rejects non-finite GPS values before reaching the domain', () => {
    expect(
      workforceCommandSchema.safeParse({
        type: 'mark',
        mode: 'self',
        kind: 'IN',
        gps: { latitude: NaN, longitude: -74, accuracy: 5, timestamp: Date.now() },
        reason: '',
        expectedRevision: 0,
      }).success,
    ).toBe(false);
  });
});
