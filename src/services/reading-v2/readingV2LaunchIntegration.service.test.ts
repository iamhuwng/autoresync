import { describe, expect, it } from 'vitest';
import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import { READING_V2_CANONICAL_FIXTURES } from './fixtures/readingV2CanonicalFixtures';
import { READING_V2_PROJECTION_FIXTURES } from './fixtures/readingV2ProjectionFixtures';
import {
  READING_V2_LAUNCH_OPERATIONAL_STATES,
  buildReadingV2LaunchReadPlan,
  createReadingV2LaunchMaterialSummary,
  createReadingV2LibraryMaterial,
  isReadingV2LaunchSurfaceEnabled,
  resolveReadingV2LaunchDecision,
  type ReadingV2LaunchSurface,
} from './readingV2LaunchIntegration.service';

const readingV2Metadata = {
  materialId: 'material-1',
  deliveryEngine: READING_V2_ENGINE,
  productLabel: 'Reading V2',
  title: 'Reading V2 Test',
  materialKind: 'full-test',
  durationMinutes: 45,
  difficulty: 'advanced',
  description: 'Published material',
  tags: ['ielts'],
  visibility: 'library-eligible',
  publishedSnapshotVersionId: 'snapshot-1',
};

describe('readingV2LaunchIntegration.service', () => {
  it('defines the launch and listing states owned by existing phase-7 surfaces', () => {
    expect(Object.keys(READING_V2_LAUNCH_OPERATIONAL_STATES).sort()).toEqual([
      'course-access-denied',
      'empty',
      'homework-not-assigned',
      'library-unavailable',
      'loading',
      'missing-deleted-material',
      'permission-denied',
      'projection-fetch-failure',
      'rollout-disabled',
      'session-expired',
    ]);
  });

  it('builds published metadata and projection read plans for every phase-7 platform surface', () => {
    const nonLiveSurfaces: ReadingV2LaunchSurface[] = [
      'solo-practice',
      'homework',
      'course-material',
      'public-library',
    ];

    nonLiveSurfaces.forEach((surface) => {
      expect(
        buildReadingV2LaunchReadPlan({
          surface,
          materialId: 'material-1',
          snapshotVersionId: 'snapshot-1',
        }),
      ).toEqual({
        surface,
        metadataPath: 'reading_v2/material_metadata/material-1',
        projectionPath: 'reading_v2/projections/student_safe_tests/material-1:snapshot-1',
        projectionKind: 'student-safe',
      });
    });

    expect(
      buildReadingV2LaunchReadPlan({
        surface: 'live-session',
        materialId: 'material-1',
        snapshotVersionId: 'snapshot-1',
        sessionCode: 'LIVE123',
      }),
    ).toEqual({
      surface: 'live-session',
      metadataPath: 'reading_v2/material_metadata/material-1',
      projectionPath: 'reading_v2/projections/session_test_payloads/LIVE123:snapshot-1',
      projectionKind: 'session-safe',
    });
  });

  it('keeps legacy materials on the existing launch path', () => {
    expect(
      resolveReadingV2LaunchDecision({
        surface: 'solo-practice',
        metadata: { testType: 'IELTS', skill: 'Reading' },
      }),
    ).toEqual({ status: 'legacy', reason: 'not-reading-v2' });
  });

  it('blocks public student exposure while rollout is default closed', () => {
    expect(
      resolveReadingV2LaunchDecision({
        surface: 'public-library',
        metadata: readingV2Metadata,
        projection: READING_V2_PROJECTION_FIXTURES.studentSafe,
      }),
    ).toEqual({
      status: 'blocked',
      reason: 'rollout-disabled',
      message: 'Reading V2 is not enabled for student launch yet.',
    });
  });

  it('allows teacher-assigned Reading Passage homework without opening unrelated solo launch', () => {
    expect(
      isReadingV2LaunchSurfaceEnabled({
        surface: 'homework',
        rolloutMode: 'off',
        readingPassageHomeworkMode: 'enabled',
        readingPassageLibraryMode: 'disabled',
      }),
    ).toBe(true);

    expect(
      isReadingV2LaunchSurfaceEnabled({
        surface: 'solo-practice',
        rolloutMode: 'off',
        readingPassageHomeworkMode: 'enabled',
        readingPassageLibraryMode: 'enabled',
      }),
    ).toBe(false);
  });

  it('routes Reading Passage homework when the PRD-0052 homework flag is enabled', () => {
    const decision = resolveReadingV2LaunchDecision({
      surface: 'homework',
      metadata: readingV2Metadata,
      projection: READING_V2_PROJECTION_FIXTURES.studentSafe,
      rolloutMode: 'off',
      readingPassageHomeworkMode: 'enabled',
    });

    expect(decision.status).toBe('runtime');
  });

  it('routes non-live launches only from student-safe projections when rollout is public', () => {
    const decision = resolveReadingV2LaunchDecision({
      surface: 'homework',
      metadata: readingV2Metadata,
      projection: READING_V2_PROJECTION_FIXTURES.studentSafe,
      rolloutMode: 'public',
    });

    expect(decision.status).toBe('runtime');
    if (decision.status === 'runtime') {
      expect(decision.projection.projectionKind).toBe('student-safe');
      expect(decision.projection.deliveryEngine).toBe(READING_V2_ENGINE);
    }
  });

  it('routes live-session launches only from session-safe projections when rollout is public', () => {
    const decision = resolveReadingV2LaunchDecision({
      surface: 'live-session',
      metadata: readingV2Metadata,
      projection: READING_V2_PROJECTION_FIXTURES.sessionSafe,
      rolloutMode: 'public',
    });

    expect(decision.status).toBe('runtime');
    if (decision.status === 'runtime') {
      expect(decision.projection.projectionKind).toBe('session-safe');
    }
  });

  it('creates launch/listing summaries from published metadata and student-safe projections', () => {
    const summary = createReadingV2LaunchMaterialSummary({
      metadata: readingV2Metadata as any,
      projection: READING_V2_PROJECTION_FIXTURES.studentSafe,
    });

    expect(summary).toMatchObject({
      id: 'material-1',
      title: 'Reading V2 Test',
      durationMinutes: 45,
      difficulty: 'hard',
      questionCount: 2,
      sourceSnapshotVersionId: READING_V2_PROJECTION_FIXTURES.studentSafe.sourceSnapshotVersionId,
      metadata: {
        deliveryEngine: READING_V2_ENGINE,
        productLabel: 'Reading V2',
        materialKind: 'full-test',
      },
    });

    expect(
      createReadingV2LibraryMaterial({
        metadata: readingV2Metadata as any,
        projection: READING_V2_PROJECTION_FIXTURES.studentSafe,
        source: { type: 'public' },
      }),
    ).toMatchObject({
      id: 'material-1',
      skill: 'reading-v2',
      type: 'test',
      questionCount: 2,
      source: { type: 'public' },
    });
  });

  it('rejects canonical drafts and wrong projection kinds before runtime selection', () => {
    expect(
      resolveReadingV2LaunchDecision({
        surface: 'solo-practice',
        metadata: readingV2Metadata,
        projection: READING_V2_CANONICAL_FIXTURES['sentence-completion'],
        rolloutMode: 'public',
      }),
    ).toEqual({
      status: 'blocked',
      reason: 'canonical-draft-not-allowed',
      message: 'Reading V2 launch cannot read canonical drafts.',
    });

    const wrongProjection = resolveReadingV2LaunchDecision({
      surface: 'solo-practice',
      metadata: readingV2Metadata,
      projection: READING_V2_PROJECTION_FIXTURES.sessionSafe,
      rolloutMode: 'public',
    });

    expect(wrongProjection.status).toBe('blocked');
    if (wrongProjection.status === 'blocked') {
      expect(wrongProjection.reason).toBe('invalid-projection-kind');
      expect(wrongProjection.message).toContain('requires student-safe projection');
    }
  });
});
