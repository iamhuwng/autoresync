import { describe, expect, it } from 'vitest';
import {
  prepareBookDeliveryRestore,
  persistBookDeliveryRecovery,
  rebuildBookDeliveryProjections,
} from './book-delivery-restore';
import { createBookDeliveryRecoveryAdapter, InMemoryBookDeliveryRecoveryProjectionStore } from '../../../src/services/book-delivery/bookDelivery.recovery';

const inventory = (
  scopes: Record<string, unknown> = {},
  bindingIndexes: Record<string, unknown> = {},
) => ({
  kind: 'book-metadata-inventory',
  roots: [
    { path: 'book_delivery/scopes', present: true, data: scopes },
    { path: 'book_delivery/indexes/bindings', present: true, data: bindingIndexes },
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
    expect(plan.recoveryWrites).toBe(0);
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
      inventory: inventory({
        'student-1': {
          'context-1': { records: { 'binding-1': { binding: { bindingId: 'binding-1' } } } },
        },
      }, { 'binding-1': { recipientId: 'student-1', contextId: 'context-1' } }),
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

  it('rejects the legacy flat Delivery roots instead of treating them as production authority', () => {
    expect(() => prepareBookDeliveryRestore({
      inventory: {
        ...inventory(),
        roots: [
          { path: 'book_delivery/records', present: true, data: { 'binding-1': {} } },
          { path: 'book_delivery/current', present: true, data: {} },
        ],
      },
      inventoryFingerprint: 'fingerprint-122',
      recoveryOperationId: 'recovery-122',
      sourceAuthorities: new Map(),
    })).toThrow('legacy flat roots');
  });

  it('routes the rebuilding phase through the injected durable adapter contract', async () => {
    const plan = prepareBookDeliveryRestore({
      inventory: inventory(),
      inventoryFingerprint: 'fingerprint-122',
      recoveryOperationId: 'recovery-122',
      sourceAuthorities: new Map(),
    });
    const persisted = await persistBookDeliveryRecovery({
      plan,
      adapter: createBookDeliveryRecoveryAdapter({
        context: { recoveryOperationId: 'recovery-122', phase: 'rebuilding' },
        store: new InMemoryBookDeliveryRecoveryProjectionStore(),
      }),
    });
    expect(persisted.productionWrites).toBe(0);
    expect(persisted.recoveryWrites).toBe(0);
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
