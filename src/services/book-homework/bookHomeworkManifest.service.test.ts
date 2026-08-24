import { describe, expect, it } from 'vitest';
import type { BookRuntimeDeliveryProjection } from '../book-delivery/bookDelivery.types';
import type { HomeworkAssignment } from '../../types/homework.types';
import {
  advanceBookHomeworkActivityBinding,
  createBookHomeworkManifest,
  parseBookHomeworkManifest,
  serializeBookHomeworkManifest,
  toStudentSafeBookHomeworkProjection,
  validateBookHomeworkManifest,
  type BookHomeworkDeliveryResolution,
} from './bookHomeworkManifest.service';

const outline = [
  { nodeKey: 'unit-b', parentNodeKey: 'section-1', nodeType: 'unit' as const, order: 2, titleSnapshot: 'Unit B' },
  { nodeKey: 'section-1', parentNodeKey: null, nodeType: 'section' as const, order: 1, titleSnapshot: 'Section 1' },
  { nodeKey: 'unit-a', parentNodeKey: 'section-1', nodeType: 'unit' as const, order: 1, titleSnapshot: 'Unit A' },
];

const delivery: BookRuntimeDeliveryProjection = {
  schemaVersion: 1,
  projectionKind: 'book-runtime-delivery',
  bindingId: 'binding-homework-1',
  bindingRevision: 4,
  recipientId: 'student-1',
  context: { contextId: 'homework-1', kind: 'homework', entitlementBasis: 'assignment' },
  book: {
    bookId: 'book-1',
    bookMode: 'pdf',
    bookRevision: 7,
    manifestVersionId: 'manifest-v1',
    publicationId: 'publication-7',
    publicationRevision: 3,
    publicationStatus: 'published',
  },
  scope: { kind: 'subtree', nodeKeys: ['section-1', 'unit-a', 'unit-b'], placementIds: [] },
  outline,
  sourceSet: {
    strategy: 'component_pdfs',
    sources: [
      {
        sourceKey: 'component-a',
        sourceVersionId: 'source-a-v3',
        lifecycle: 'verified-usable',
        sourceOrder: 1,
        ownerNodeKey: 'unit-a',
        localPageScope: { kind: 'pages', pages: [1, 2, 3] },
      },
      {
        sourceKey: 'component-b',
        sourceVersionId: 'source-b-v2',
        lifecycle: 'verified-usable',
        sourceOrder: 2,
        ownerNodeKey: 'unit-b',
        localPageScope: { kind: 'pages', pages: [1, 2] },
      },
    ],
  },
  documentRequests: [],
  activities: [
    {
      placementId: 'placement-b',
      activityId: 'activity-b',
      activityVersion: 2,
      activityVersionId: 'activity-b-v2',
      nodeKey: 'unit-b',
      order: 2,
      titleSnapshot: 'Activity B',
      contextMode: 'required',
      sourceContext: {
        available: true,
        description: 'component-b pages 2',
        pageGroupKeys: ['page-group-b'],
        sourcePageScopes: [{ sourceKey: 'component-b', pages: [2] }],
      },
    },
    {
      placementId: 'placement-a',
      activityId: 'activity-a',
      activityVersion: 1,
      activityVersionId: 'activity-a-v1',
      nodeKey: 'unit-a',
      order: 1,
      titleSnapshot: 'Activity A',
      contextMode: 'required',
      sourceContext: {
        available: true,
        description: 'component-a pages 1',
        pageGroupKeys: ['page-group-a'],
        sourcePageScopes: [{ sourceKey: 'component-a', pages: [1] }],
      },
    },
    {
      placementId: 'placement-c',
      activityId: 'activity-c',
      activityVersion: 1,
      activityVersionId: 'activity-c-v1',
      nodeKey: 'unit-b',
      order: 3,
      titleSnapshot: 'Activity C',
      contextMode: 'none',
      sourceContext: { available: false, description: 'No source context.', sourcePageScopes: [] },
    },
  ],
  actionFlags: { canAutosave: true, canSubmit: true, canReview: false },
  provenance: { publicationId: 'publication-7', publicationRevision: 3, bindingId: 'binding-homework-1', bindingRevision: 4 },
};

const resolution: BookHomeworkDeliveryResolution = { delivery };

const ids = (target: Parameters<typeof createBookHomeworkManifest>[0]['target']) => createBookHomeworkManifest({
  resolution,
  target,
  manifestVersionId: 'manifest-v1',
  ownerId: 'teacher-1',
  createdByCommandId: 'command-1',
  createdAt: '2026-07-28T00:00:00.000Z',
  bindingRevision: 1,
});

describe('Book Homework manifest builder', () => {
  it('freezes whole-Book scope, orders structure deterministically, and pins source context', () => {
    const manifest = ids({ kind: 'book', bookId: 'book-1' });

    expect(manifest.outline.map((node) => node.nodeKey)).toEqual(['section-1', 'unit-a', 'unit-b']);
    expect(manifest.bindings.map((binding) => binding.placementId)).toEqual(['placement-a', 'placement-b', 'placement-c']);
    expect(manifest.bindings[0]).toMatchObject({
      state: 'required',
      activityId: 'activity-a',
      activityVersionId: 'activity-a-v1',
      pageGroupKeys: ['page-group-a'],
      sourceContext: [{ sourceKey: 'component-a', sourceVersionId: 'source-a-v3', componentOrder: 1, ownerNodeKey: 'unit-a', physicalPageNumbers: [1] }],
    });
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.bindings)).toBe(true);
  });

  it('selects structural subtrees and one Activity without rebuilding Book paths', () => {
    const unit = ids({ kind: 'unit', bookId: 'book-1', nodeKey: 'unit-a' });
    expect(unit.bindings.map((binding) => binding.activityId)).toEqual(['activity-a']);
    expect(unit.outline.map((node) => node.nodeKey)).toEqual(['unit-a']);

    const activity = ids({ kind: 'activity', bookId: 'book-1', activityId: 'activity-b', placementId: 'placement-b' });
    expect(activity.bindings.map((binding) => binding.placementId)).toEqual(['placement-b']);
    expect(activity.outline.map((node) => node.nodeKey)).toEqual(['section-1', 'unit-b']);
  });

  it('rejects an Activity target that is ambiguous across Placements', () => {
    const ambiguousDelivery: BookRuntimeDeliveryProjection = {
      ...delivery,
      activities: [
        ...delivery.activities,
        { ...delivery.activities[1], placementId: 'placement-a-copy' },
      ],
    };
    expect(() => createBookHomeworkManifest({
      resolution: { delivery: ambiguousDelivery },
      target: { kind: 'activity', bookId: 'book-1', activityId: 'activity-a' },
      manifestVersionId: 'manifest-v1', ownerId: 'teacher-1', createdByCommandId: 'command-1',
      createdAt: '2026-07-28T00:00:00.000Z', bindingRevision: 1,
    })).toThrow(/exactly one Placement/u);
  });

  it('resolves Section, Chapter, and Test targets through the Delivery outline', () => {
    const extendedOutline = [
      ...outline,
      { nodeKey: 'chapter-1', parentNodeKey: 'section-1', nodeType: 'chapter' as const, order: 3, titleSnapshot: 'Chapter 1' },
      { nodeKey: 'test-1', parentNodeKey: 'chapter-1', nodeType: 'test' as const, order: 1, titleSnapshot: 'Test 1' },
    ];
    const extendedDelivery: BookRuntimeDeliveryProjection = {
      ...delivery,
      outline: extendedOutline,
      activities: [
        ...delivery.activities,
        {
          placementId: 'placement-test', activityId: 'activity-test', activityVersion: 1, activityVersionId: 'activity-test-v1',
          nodeKey: 'test-1', order: 1, contextMode: 'none', titleSnapshot: 'Test Activity',
          sourceContext: { available: false, description: 'No source context.', sourcePageScopes: [] },
        },
      ],
    };
    for (const target of [
      { kind: 'section' as const, bookId: 'book-1', nodeKey: 'section-1' },
      { kind: 'chapter' as const, bookId: 'book-1', nodeKey: 'chapter-1' },
      { kind: 'test' as const, bookId: 'book-1', nodeKey: 'test-1' },
    ]) {
      const targetDelivery: BookRuntimeDeliveryProjection = {
        ...extendedDelivery,
        book: {
          ...extendedDelivery.book,
          manifestVersionId: `manifest-${target.kind}`,
        },
      };
      const manifest = createBookHomeworkManifest({
        resolution: { delivery: targetDelivery },
        target,
        manifestVersionId: `manifest-${target.kind}`,
        ownerId: 'teacher-1', createdByCommandId: `command-${target.kind}`,
        createdAt: '2026-07-28T00:00:00.000Z', bindingRevision: 1,
      });
      expect(manifest.outline.some((node) => node.nodeKey === target.nodeKey)).toBe(true);
      expect(manifest.bindings.length).toBeGreaterThan(0);
    }
  });

  it('retains explicit exclusion state for unpublished or unsupported candidates', () => {
    const manifest = createBookHomeworkManifest({
      resolution,
      target: { kind: 'unit', bookId: 'book-1', nodeKey: 'unit-b' },
      manifestVersionId: 'manifest-v1',
      ownerId: 'teacher-1',
      createdByCommandId: 'command-1',
      createdAt: '2026-07-28T00:00:00.000Z',
      bindingRevision: 1,
      excludedActivities: [{
        placementId: 'placement-unpublished',
        activityId: 'activity-unpublished',
        nodeKey: 'unit-b',
        order: 4,
        reason: 'not-published',
      }],
    });
    expect(manifest.bindings.find((binding) => binding.placementId === 'placement-unpublished')).toMatchObject({
      state: 'excluded',
      exclusionReason: 'not-published',
    });
    expect(manifest.completion).toMatchObject({ requiredBindingCount: 2, excludedBindingCount: 1, legacyScoreFields: 'untouched' });
  });

  it('rejects duplicate or missing structural identities and unsafe source pages', () => {
    expect(() => createBookHomeworkManifest({
      resolution: { ...resolution, delivery: { ...delivery, outline: [...outline, outline[0]] } },
      target: { kind: 'book', bookId: 'book-1' },
      manifestVersionId: 'manifest-v1', ownerId: 'teacher-1', createdByCommandId: 'command-1',
      createdAt: '2026-07-28T00:00:00.000Z', bindingRevision: 1,
    })).toThrow(/unique/u);

    expect(() => createBookHomeworkManifest({
      resolution: {
        ...resolution,
        delivery: { ...delivery, outline: outline.filter((node) => node.nodeKey !== 'unit-b') },
      },
      target: { kind: 'book', bookId: 'book-1' },
      manifestVersionId: 'manifest-v1', ownerId: 'teacher-1', createdByCommandId: 'command-1',
      createdAt: '2026-07-28T00:00:00.000Z', bindingRevision: 1,
    })).toThrow(/outline/u);

    expect(() => createBookHomeworkManifest({
      resolution: {
        ...resolution,
        delivery: {
          ...delivery,
          activities: [{
            ...delivery.activities[0],
            sourceContext: { available: true, description: 'outside', pageGroupKeys: ['page-group-a'], sourcePageScopes: [{ sourceKey: 'component-a', pages: [9] }] },
          }],
        },
      },
      target: { kind: 'book', bookId: 'book-1' },
      manifestVersionId: 'manifest-v1', ownerId: 'teacher-1', createdByCommandId: 'command-1',
      createdAt: '2026-07-28T00:00:00.000Z', bindingRevision: 1,
    })).toThrow(/scope/u);
  });
});

describe('Book Homework manifest schema and compatibility', () => {
  it('round-trips without losing pins and exposes only a student-safe projection', () => {
    const manifest = ids({ kind: 'book', bookId: 'book-1' });
    const parsed = parseBookHomeworkManifest(serializeBookHomeworkManifest(manifest));
    expect(parsed).toEqual(manifest);
    const safe = toStudentSafeBookHomeworkProjection(parsed);
    const safeJson = JSON.stringify(safe);
    expect(safeJson).toContain('activity-a-v1');
    expect(safeJson).not.toContain('teacher-1');
    expect(safeJson).not.toContain('command-1');
    expect(safeJson).not.toMatch(/(?:objectKey|provider|credential|token|answer|storage|url)/iu);
    expect(safe).not.toHaveProperty('ownerId');
    expect(safe).not.toHaveProperty('createdByCommandId');
  });

  it('keeps legacy one-material Homework JSON unchanged', () => {
    const legacy: HomeworkAssignment = {
      id: 'legacy-homework', createdBy: 'teacher-1', createdAt: 1, updatedAt: 1,
      materialId: 'material-1', materialTitle: 'Legacy', materialType: 'test', materialSkill: 'reading',
      target: { type: 'students', studentIds: ['student-1'] }, scheduling: { dueDate: 2 },
      config: { timerMinutes: null, maxAttempts: 1, feedbackTiming: 'never', lateSubmissionAllowed: false },
      visibility: { showTimer: true, showAttempts: true, showDueDate: true, showQuestionCount: true, showDuration: true },
      status: 'draft', stats: { totalAssigned: 1, started: 0, submitted: 0, lateSubmissions: 0 },
    };
    const serialized = JSON.stringify(legacy);
    expect(JSON.parse(serialized)).toEqual(legacy);
    expect(serialized).not.toContain('book_activity_bundle');
  });

  it('advances one Activity binding while preserving unchanged bindings', () => {
    const manifest = ids({ kind: 'book', bookId: 'book-1' });
    const previousOther = manifest.bindings.find((binding) => binding.placementId === 'placement-b');
    const current = manifest.bindings.find((binding) => binding.placementId === 'placement-a');
    if (!previousOther || !current || current.state !== 'required') throw new Error('Fixture binding missing.');
    const updated = advanceBookHomeworkActivityBinding(manifest, {
      manifestVersionId: 'manifest-v2', createdByCommandId: 'command-2', createdAt: '2026-07-28T00:01:00.000Z',
      bindingRevision: 2, placementId: 'placement-a',
      nextBinding: { ...current, activityVersion: 2, activityVersionId: 'activity-a-v2' },
    });
    expect(updated.manifestVersionId).toBe('manifest-v2');
    expect(updated.book.manifestVersionId).toBe('manifest-v2');
    expect(updated.bindings.find((binding) => binding.placementId === 'placement-a')).toMatchObject({ activityVersion: 2, activityVersionId: 'activity-a-v2' });
    expect(updated.bindings.find((binding) => binding.placementId === 'placement-b')).toBe(previousOther);
    expect(manifest.bindings.find((binding) => binding.placementId === 'placement-a')).toMatchObject({ activityVersion: 1, activityVersionId: 'activity-a-v1' });
  });

  it('fails closed on private fields and completion-to-score contamination', () => {
    const manifest = ids({ kind: 'book', bookId: 'book-1' });
    const withPrivateField = JSON.parse(JSON.stringify(manifest)) as Record<string, unknown>;
    (withPrivateField.book as Record<string, unknown>).provider = 'private';
    expect(validateBookHomeworkManifest(withPrivateField).valid).toBe(false);

    const withScore = JSON.parse(JSON.stringify(manifest)) as Record<string, unknown>;
    (withScore.completion as Record<string, unknown>).score = 100;
    expect(validateBookHomeworkManifest(withScore).valid).toBe(false);
  });

  it('fails closed when a parsed manifest target does not own its frozen outline/bindings', () => {
    const manifest = ids({ kind: 'book', bookId: 'book-1' });
    const outsideTarget = JSON.parse(JSON.stringify(manifest)) as Record<string, unknown>;
    outsideTarget.selectedTarget = { kind: 'unit', bookId: 'book-1', nodeKey: 'unit-a' };
    expect(validateBookHomeworkManifest(outsideTarget).valid).toBe(false);

    const extraBinding = JSON.parse(JSON.stringify(manifest)) as Record<string, unknown>;
    extraBinding.selectedTarget = { kind: 'activity', bookId: 'book-1', activityId: 'activity-a', placementId: 'placement-a' };
    expect(validateBookHomeworkManifest(extraBinding).valid).toBe(false);
  });

  it('rejects same or older Activity Version updates', () => {
    const manifest = ids({ kind: 'book', bookId: 'book-1' });
    const current = manifest.bindings.find((binding) => binding.placementId === 'placement-a');
    if (!current || current.state !== 'required') throw new Error('Fixture binding missing.');
    expect(() => advanceBookHomeworkActivityBinding(manifest, {
      manifestVersionId: 'manifest-v2', createdByCommandId: 'command-2', createdAt: '2026-07-28T00:01:00.000Z',
      bindingRevision: 2, placementId: 'placement-a',
      nextBinding: { ...current, activityVersion: 1, activityVersionId: 'activity-a-v1' },
    })).toThrow(/later Activity Version/u);
  });
});
