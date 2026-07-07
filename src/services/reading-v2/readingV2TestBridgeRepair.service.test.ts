import { describe, expect, it } from 'vitest';
import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import { READING_V2_PROJECTION_FIXTURES } from './fixtures/readingV2ProjectionFixtures';
import type { ReadingV2MaterialMetadata } from './readingV2MaterialMetadata.service';
import {
  buildReadingV2TestBridgeRepairUpdatePayload,
  planReadingV2TestBridgeRepair,
} from './readingV2TestBridgeRepair.service';

const metadata = (
  materialId: string,
  overrides: Partial<ReadingV2MaterialMetadata> = {},
): ReadingV2MaterialMetadata => ({
  materialId: materialId as ReadingV2MaterialMetadata['materialId'],
  ownerId: 'teacher-1',
  deliveryEngine: READING_V2_ENGINE,
  productLabel: 'Reading V2',
  title: materialId,
  materialKind: 'full-test',
  durationMinutes: 60,
  difficulty: 'intermediate',
  description: '',
  tags: [],
  visibility: 'private',
  testTypeIds: [],
  publishedSnapshotVersionId: `snapshot-${materialId}`,
  updatedAt: '2026-07-06T00:00:00.000Z',
  relationshipSurfaces: ['teacher-lobby'],
  ...overrides,
});

const projection = (materialId: string) => ({
  ...READING_V2_PROJECTION_FIXTURES.studentSafe,
  materialId,
  ownerId: 'teacher-1',
  sourceSnapshotVersionId: `snapshot-${materialId}`,
});

describe('readingV2TestBridgeRepair.service', () => {
  it('plans bounded bridge writes only for active full tests with matching projections', () => {
    const plan = planReadingV2TestBridgeRepair({
      metadataByMaterialId: {
        public: metadata('public', { visibility: 'public' }),
        private: metadata('private'),
        removed: metadata('removed', { state: 'removed' }),
        archived: metadata('archived', { state: 'archived' }),
        passage: metadata('passage', { materialKind: 'reading-passage' }),
        missingProjection: metadata('missingProjection'),
        legacyEmptyArrays: {
          ...metadata('legacyEmptyArrays'),
          tags: undefined,
          testTypeIds: undefined,
        },
      },
      studentSafeProjectionsById: {
        'public:snapshot-public': projection('public'),
        'private:snapshot-private': projection('private'),
        'removed:snapshot-removed': projection('removed'),
        'archived:snapshot-archived': projection('archived'),
        'passage:snapshot-passage': projection('passage'),
        'legacyEmptyArrays:snapshot-legacyEmptyArrays': projection('legacyEmptyArrays'),
      },
      testsById: {},
      generatedAt: '2026-07-06T01:00:00.000Z',
    });

    expect(plan.operations.map((operation) => operation.materialId)).toEqual([
      'legacyEmptyArrays',
      'private',
      'public',
    ]);
    expect(
      plan.operations.find((operation) => operation.materialId === 'public')?.value,
    ).toMatchObject({
      isPublic: true,
      hasStudentSafeProjection: true,
    });
    expect(plan.totals).toEqual({
      activeFullTests: 4,
      currentBridges: 0,
      missingBridges: 3,
      staleBridges: 0,
      skippedMissingProjection: 1,
      skippedOutOfScope: 3,
      skippedInvalidMetadata: 0,
    });
  });

  it('is idempotent for current bridges and repairs stale bridge fields', () => {
    const firstPlan = planReadingV2TestBridgeRepair({
      metadataByMaterialId: {
        current: metadata('current'),
        stale: metadata('stale', { visibility: 'public' }),
      },
      studentSafeProjectionsById: {
        'current:snapshot-current': projection('current'),
        'stale:snapshot-stale': projection('stale'),
      },
      testsById: {},
      generatedAt: '2026-07-06T01:00:00.000Z',
    });
    const firstPayload = buildReadingV2TestBridgeRepairUpdatePayload(firstPlan.operations);

    const secondPlan = planReadingV2TestBridgeRepair({
      metadataByMaterialId: {
        current: metadata('current'),
        stale: metadata('stale', { visibility: 'public' }),
      },
      studentSafeProjectionsById: {
        'current:snapshot-current': projection('current'),
        'stale:snapshot-stale': projection('stale'),
      },
      testsById: {
        current: firstPayload['tests/current'],
        stale: {
          ...(firstPayload['tests/stale'] as Record<string, unknown>),
          isPublic: false,
          state: 'removed',
        },
      },
      generatedAt: '2026-07-06T01:00:00.000Z',
    });

    expect(secondPlan.operations).toHaveLength(1);
    expect(secondPlan.operations[0]).toMatchObject({
      materialId: 'stale',
      reason: 'stale-test-bridge',
      path: 'tests/stale',
      value: expect.objectContaining({ isPublic: true }),
    });
    expect(secondPlan.operations[0]?.value).not.toHaveProperty('state');
    expect(secondPlan.totals).toMatchObject({
      currentBridges: 1,
      missingBridges: 0,
      staleBridges: 1,
    });
  });

  it('treats unexpected lifecycle fields as stale even when expected fields match', () => {
    const firstPlan = planReadingV2TestBridgeRepair({
      metadataByMaterialId: { active: metadata('active') },
      studentSafeProjectionsById: {
        'active:snapshot-active': projection('active'),
      },
      testsById: {},
      generatedAt: '2026-07-06T01:00:00.000Z',
    });
    const current = firstPlan.operations[0]?.value;

    const plan = planReadingV2TestBridgeRepair({
      metadataByMaterialId: { active: metadata('active') },
      studentSafeProjectionsById: {
        'active:snapshot-active': projection('active'),
      },
      testsById: {
        active: {
          ...current,
          state: 'removed',
          removedAt: '2026-07-06T02:00:00.000Z',
        },
      },
      generatedAt: '2026-07-06T01:00:00.000Z',
    });

    expect(plan.operations).toEqual([
      expect.objectContaining({
        materialId: 'active',
        reason: 'stale-test-bridge',
      }),
    ]);
  });
});
