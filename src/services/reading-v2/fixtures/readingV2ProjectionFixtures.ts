import { readingV2Ids } from '../../../types/readingV2.types';
import { READING_V2_CANONICAL_FIXTURES } from './readingV2CanonicalFixtures';
import {
  generateReadingV2AnalyticsProjection,
  generateReadingV2PreviewProjection,
  generateReadingV2ReviewProjection,
  generateReadingV2SessionSafeProjection,
  generateReadingV2StudentSafeProjection,
  type ReadingV2DerivedProjection,
} from '../readingV2Projection.service';

const generatedAt = '2026-04-25T00:00:00.000Z';
const defaultTaskType = 'sentence-completion';

export interface ReadingV2ProjectionFixtureSet {
  readonly preview: ReadingV2DerivedProjection;
  readonly studentSafe: ReadingV2DerivedProjection;
  readonly sessionSafe: ReadingV2DerivedProjection;
  readonly review: ReadingV2DerivedProjection;
  readonly analytics: ReadingV2DerivedProjection;
}

const createProjectionFixtureSet = (
  taskType: keyof typeof READING_V2_CANONICAL_FIXTURES,
): ReadingV2ProjectionFixtureSet => {
  const document = READING_V2_CANONICAL_FIXTURES[taskType];
  const snapshot = {
    snapshotVersionId: readingV2Ids.snapshotVersionId(`projection-fixture-snapshot-${taskType}`),
    materialId: readingV2Ids.materialId(`projection-fixture-material-${taskType}`),
    ownerId: 'teacher-1',
    document,
    publishedAt: generatedAt,
    publishedBy: 'teacher-1',
  };
  const studentSafe = generateReadingV2StudentSafeProjection(snapshot, generatedAt);

  return {
    preview: generateReadingV2PreviewProjection({
      draftId: `projection-fixture-draft-${taskType}`,
      ownerId: 'teacher-1',
      document,
      generatedAt,
    }),
    studentSafe,
    sessionSafe: generateReadingV2SessionSafeProjection({
      sessionCode: 'SESSION1',
      studentSafeProjection: studentSafe,
      generatedAt,
    }),
    review: generateReadingV2ReviewProjection(snapshot, generatedAt),
    analytics: generateReadingV2AnalyticsProjection(snapshot, generatedAt),
  };
};

const projectionFixtureTaskTypes = Object.keys(READING_V2_CANONICAL_FIXTURES) as Array<
  keyof typeof READING_V2_CANONICAL_FIXTURES
>;

export const READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE = Object.fromEntries(
  projectionFixtureTaskTypes.map((taskType) => [taskType, createProjectionFixtureSet(taskType)]),
) as Readonly<
  Record<keyof typeof READING_V2_CANONICAL_FIXTURES, ReadingV2ProjectionFixtureSet>
>;

const defaultFixtureSet = READING_V2_PROJECTION_FIXTURES_BY_TASK_TYPE[defaultTaskType];

export const READING_V2_PROJECTION_FIXTURES = {
  preview: defaultFixtureSet.preview,
  studentSafe: defaultFixtureSet.studentSafe,
  sessionSafe: defaultFixtureSet.sessionSafe,
  review: defaultFixtureSet.review,
  analytics: defaultFixtureSet.analytics,
} as const satisfies Record<string, ReadingV2DerivedProjection>;
