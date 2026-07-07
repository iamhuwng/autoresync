import { describe, expect, it } from 'vitest';
import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import { READING_V2_PROJECTION_FIXTURES } from './fixtures/readingV2ProjectionFixtures';
import type { ReadingV2MaterialMetadata } from './readingV2MaterialMetadata.service';
import { buildReadingV2TestBridgeRecord } from './readingV2TestBridge.service';

const metadata = (
  overrides: Partial<ReadingV2MaterialMetadata> = {},
): ReadingV2MaterialMetadata => ({
  materialId: 'material-1' as ReadingV2MaterialMetadata['materialId'],
  ownerId: 'teacher-1',
  deliveryEngine: READING_V2_ENGINE,
  productLabel: 'Reading V2',
  title: 'Reading V2 Test',
  materialKind: 'full-test',
  durationMinutes: 60,
  difficulty: 'intermediate',
  description: '',
  tags: [],
  visibility: 'public',
  testTypeIds: [],
  publishedSnapshotVersionId: 'snapshot-1',
  updatedAt: '2026-07-06T00:00:00.000Z',
  relationshipSurfaces: ['teacher-lobby'],
  ...overrides,
});

describe('readingV2TestBridge.service', () => {
  it('builds the shared public listing and launch bridge from metadata and projection', () => {
    const projection = {
      ...READING_V2_PROJECTION_FIXTURES.studentSafe,
      sourceSnapshotVersionId: 'snapshot-1',
    };

    const bridge = buildReadingV2TestBridgeRecord({
      metadata: metadata(),
      studentSafeProjection: projection,
      updatedAt: '2026-07-06T00:00:00.000Z',
    });

    expect(bridge).toMatchObject({
      id: 'material-1',
      materialId: 'material-1',
      ownerId: 'teacher-1',
      deliveryEngine: READING_V2_ENGINE,
      runtimeEngine: READING_V2_ENGINE,
      title: 'Reading V2 Test',
      testType: 'IELTS',
      skill: 'Reading',
      skillType: 'reading-v2',
      isPublic: true,
      questionCount: 2,
      hasStudentSafeProjection: true,
      deliveryProjectionReady: true,
      studentSafeProjectionReady: true,
      passageRefCount: projection.content.sections.length,
      publishedSnapshotVersionId: 'snapshot-1',
      metadata: expect.objectContaining({
        title: 'Reading V2 Test',
        visibility: 'public',
        hasStudentSafeProjection: true,
      }),
    });
  });

  it('omits undefined Firebase fields instead of serializing invalid values', () => {
    const bridge = buildReadingV2TestBridgeRecord({
      metadata: metadata({
        compositionId: undefined,
        primaryTestTypeId: undefined,
        targetBand: undefined,
      }),
      studentSafeProjection: null,
      updatedAt: '2026-07-06T00:00:00.000Z',
    });

    expect(bridge).not.toHaveProperty('compositionId');
    expect(bridge).not.toHaveProperty('primaryTestTypeId');
    expect(bridge.metadata as Record<string, unknown>).not.toHaveProperty('targetBand');
    expect(bridge).toMatchObject({
      hasStudentSafeProjection: false,
      questionCount: 0,
      passageRefCount: 0,
    });
  });
});
