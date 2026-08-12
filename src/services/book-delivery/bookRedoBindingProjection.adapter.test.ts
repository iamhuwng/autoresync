import { describe, expect, it } from 'vitest';
import {
  assertBookRedoBindingRevision,
  bookRedoBindingId,
  buildBookRedoBinding,
  projectBookRedoBinding,
} from './bookRedoBindingProjection.adapter';
import type { BookDeliveryBinding } from './bookDelivery.types';

const binding = (update: Partial<BookDeliveryBinding> = {}): BookDeliveryBinding => ({
  schemaVersion: 3,
  bindingId: 'binding-old',
  revision: 3,
  status: 'active',
  recipient: { recipientId: 'student-1', recipientKind: 'student' },
  issuer: { ownerId: 'owner-1', authorityBoundary: 'book-owner' },
  book: {
    bookId: 'book-1',
    bookMode: 'pdf',
    bookRevision: 1,
    manifestVersionId: 'manifest-1',
    publicationId: 'publication-1',
    publicationRevision: 1,
    publicationStatus: 'published',
  },
  scope: { kind: 'placements', nodeKeys: ['node-1'], placementIds: ['placement-1', 'placement-2'] },
  outline: [],
  context: {
    contextId: 'homework-1',
    recipientId: 'student-1',
    ownerId: 'owner-1',
    kind: 'homework',
    entitlementBasis: 'assignment',
  },
  sourceSet: {
    strategy: 'full_pdf',
    sources: [{
      sourceKey: 'source-1',
      sourceVersionId: 'source-version-1',
      lifecycle: 'verified-usable',
      localPageScope: { kind: 'all', pages: [] },
    }],
  },
  placements: [
    {
      placementId: 'placement-1', activityId: 'activity-1', activityVersionId: 'old-version-1',
      activityVersion: 1, nodeKey: 'node-1', order: 0, contextMode: 'required', pageGroupKeys: [], sourcePageScopes: [],
    },
    {
      placementId: 'placement-2', activityId: 'activity-2', activityVersionId: 'old-version-2',
      activityVersion: 1, nodeKey: 'node-1', order: 1, contextMode: 'optional', pageGroupKeys: [], sourcePageScopes: [],
    },
  ],
  schedulePolicy: { policyId: 'policy-1', policyRevision: 1, basis: 'immutable-reference' },
  createdAt: '2026-08-10T09:00:00.000Z',
  ...update,
});

describe('book redo binding projection', () => {
  it('advances one binding revision and changes only selected placements', () => {
    const current = binding();
    const next = binding({
      bindingId: bookRedoBindingId('action-1', 'homework:1', 'student-1'),
      revision: 4,
      createdAt: '2026-08-10T09:01:00.000Z',
      placements: current.placements.map((placement) => placement.placementId === 'placement-1'
        ? { ...placement, activityVersionId: 'new-version-1', activityVersion: 2 }
        : placement),
    });
    const result = projectBookRedoBinding({
      actionId: 'action-1',
      contextKey: 'homework:1',
      contextId: 'homework-1',
      studentId: 'student-1',
      current,
      next,
      selectedPlacementIds: ['placement-1'],
      now: next.createdAt,
    });
    expect(result.status).toBe('projected');
    expect(assertBookRedoBindingRevision({ binding: next, expectedBindingId: next.bindingId, expectedBindingRevision: 4 }))
      .toEqual({ status: 'accepted' });
    expect(assertBookRedoBindingRevision({ binding: current, expectedBindingId: next.bindingId, expectedBindingRevision: 4 }))
      .toEqual({ status: 'conflict', code: 'binding-revision-stale' });
  });

  it('rejects a next binding that retargets an unselected placement', () => {
    const current = binding();
    const next = binding({
      bindingId: bookRedoBindingId('action-1', 'homework:1', 'student-1'),
      revision: 4,
      createdAt: '2026-08-10T09:01:00.000Z',
      placements: current.placements.map((placement) => ({
        ...placement,
        activityVersionId: placement.placementId === 'placement-2' ? 'new-version-2' : placement.activityVersionId,
        activityVersion: placement.placementId === 'placement-2' ? 2 : placement.activityVersion,
      })),
    });
    expect(projectBookRedoBinding({
      actionId: 'action-1', contextKey: 'homework:1', contextId: 'homework-1', studentId: 'student-1',
      current, next, selectedPlacementIds: ['placement-1'], now: next.createdAt,
    })).toEqual({ status: 'invalid', code: 'binding-projection-invalid' });
  });

  it('rejects slash path segments before binding persistence', () => {
    const current = binding();
    const next = binding({
      bindingId: bookRedoBindingId('action-1', 'homework:1', 'student-1'),
      revision: 4,
      createdAt: '2026-08-10T09:01:00.000Z',
      placements: current.placements.map((placement) => placement.placementId === 'placement-1'
        ? { ...placement, activityVersionId: 'new-version-1', activityVersion: 2 }
        : placement),
    });
    const base = {
      actionId: 'action-1', contextKey: 'homework:1', contextId: 'homework-1', studentId: 'student-1',
      current, next, selectedPlacementIds: ['placement-1'], now: next.createdAt,
    };
    expect(projectBookRedoBinding({ ...base, actionId: 'action/1' }).status).toBe('invalid');
    expect(projectBookRedoBinding({ ...base, contextKey: 'homework/1' }).status).toBe('invalid');
    expect(projectBookRedoBinding({ ...base, contextId: 'homework/1' }).status).toBe('invalid');
    expect(projectBookRedoBinding({ ...base, studentId: 'student/1' }).status).toBe('invalid');
    expect(projectBookRedoBinding({ ...base, current: binding({ bindingId: 'binding/old' }) }).status).toBe('invalid');
    expect(projectBookRedoBinding({ ...base, next: binding({
      bindingId: 'binding/new',
      revision: 4,
      createdAt: next.createdAt,
      placements: next.placements,
    }) }).status).toBe('invalid');
    expect(buildBookRedoBinding({
      actionId: 'action/1', contextKey: 'homework:1', contextId: 'homework-1', studentId: 'student-1', current,
      replacements: [{ placementId: 'placement-1', activityVersionId: 'new-version-1', activityVersion: 2 }], now: next.createdAt,
    })).toEqual({ status: 'invalid', code: 'binding-input-invalid' });
    expect(projectBookRedoBinding(base).status).toBe('projected');
  });
});
