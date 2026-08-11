import { describe, expect, it } from 'vitest';
import {
  prepareBookDeliveryRestore,
  rebuildBookDeliveryProjections,
} from './book-delivery-restore';

const inventory = (records: Record<string, unknown> = {}) => ({
  kind: 'book-metadata-inventory',
  roots: [
    { path: 'book_delivery/records', present: true, data: records },
    { path: 'book_delivery/current', present: true, data: {} },
  ],
});

describe('Book Delivery restore adapter', () => {
  it('plans only write-free staged projections from the validated inventory', () => {
    const plan = prepareBookDeliveryRestore({
      inventory: inventory(),
      inventoryFingerprint: 'fingerprint-122',
      recoveryOperationId: 'recovery-122',
      sourceAuthorities: new Map(),
    });

    expect(plan.productionWrites).toBe(0);
    expect(plan.projections).toEqual([]);
    expect(plan.report).toEqual({
      rebuilt: 0,
      skippedIdempotent: 0,
      invalid: 0,
      externallyMissing: 0,
      retryable: 0,
      terminal: 0,
    });
  });

  it('preserves unavailable-only semantics when a malformed record is present', () => {
    const plan = prepareBookDeliveryRestore({
      inventory: inventory({ 'binding-1': { binding: { bindingId: 'binding-1' } } }),
      inventoryFingerprint: 'fingerprint-122',
      recoveryOperationId: 'recovery-122',
      sourceAuthorities: new Map(),
    });

    expect(plan.productionWrites).toBe(0);
    expect(plan.projections).toEqual([]);
    expect(plan.report.invalid).toBe(1);
    expect(plan.report.retryable).toBe(0);
    expect(plan.report.terminal).toBe(0);
  });

  it('keeps completed projection keys idempotently skipped without authorizing writes', () => {
    const plan = prepareBookDeliveryRestore({
      inventory: inventory(),
      inventoryFingerprint: 'fingerprint-122',
      recoveryOperationId: 'recovery-122',
      sourceAuthorities: new Map(),
    });
    const replay = rebuildBookDeliveryProjections({
      plan,
      completedProjectionKeys: new Set(['recovery-122:any-binding:1']),
    });
    expect(replay.productionWrites).toBe(0);
    expect(replay.report.skippedIdempotent).toBe(0);
  });
});
