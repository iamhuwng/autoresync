// Reading V2 launch adapter boundary: shared platform surfaces pass explicit engine-marked
// metadata/projections here and never inspect canonical drafts or legacy Reading payloads.
import {
  READING_V2_ENGINE,
  READING_V2_ROLLOUT_MODE,
  READING_PASSAGE_HOMEWORK_MODE,
  READING_PASSAGE_LIBRARY_MODE,
  type ReadingV2RolloutMode,
  type Prd0052FeatureFlagMode,
  isReadingV2Payload,
  isReadingV2PublicRollout,
  isReadingPassageHomeworkEnabled,
  isReadingPassageLibraryEnabled,
} from '../../config/readingV2FeatureFlags';
import type { ReadingV2DerivedProjection } from './readingV2Projection.service';
import type { ReadingV2MaterialMetadata } from './readingV2MaterialMetadata.service';
import { assertReadingV2RuntimeProjection } from './readingV2RuntimeBoundary.service';
import { readingV2StoragePaths } from './readingV2StoragePaths.service';
import type { LibraryMaterial } from '../../types/solo.types';

export type ReadingV2LaunchSurface =
  | 'solo-practice'
  | 'homework'
  | 'course-material'
  | 'public-library'
  | 'live-session';

export type ReadingV2LaunchDecision =
  | {
      readonly status: 'legacy';
      readonly reason: 'not-reading-v2';
    }
  | {
      readonly status: 'blocked';
      readonly reason:
        | 'rollout-disabled'
        | 'missing-projection'
        | 'invalid-projection-kind'
        | 'canonical-draft-not-allowed';
      readonly message: string;
    }
  | {
      readonly status: 'runtime';
      readonly projection: ReadingV2DerivedProjection;
    };

export type ReadingV2LaunchOperationalStateId =
  | 'loading'
  | 'empty'
  | 'permission-denied'
  | 'missing-deleted-material'
  | 'rollout-disabled'
  | 'session-expired'
  | 'homework-not-assigned'
  | 'course-access-denied'
  | 'library-unavailable'
  | 'projection-fetch-failure';

export const READING_V2_LAUNCH_OPERATIONAL_STATES: Readonly<
  Record<ReadingV2LaunchOperationalStateId, { readonly title: string; readonly message: string }>
> = {
  loading: {
    title: 'Loading Reading material',
    message: 'The owning launch surface is loading published Reading V2 metadata or projection data.',
  },
  empty: {
    title: 'No Reading material',
    message: 'The owning launch surface has no launchable Reading V2 material to show.',
  },
  'permission-denied': {
    title: 'Permission required',
    message: 'The current student cannot open this Reading V2 material.',
  },
  'missing-deleted-material': {
    title: 'Reading material unavailable',
    message: 'The published Reading V2 material was missing or deleted.',
  },
  'rollout-disabled': {
    title: 'Reading V2 unavailable',
    message: 'Reading V2 launch is blocked by rollout configuration.',
  },
  'session-expired': {
    title: 'Session expired',
    message: 'The live Reading V2 session is no longer active.',
  },
  'homework-not-assigned': {
    title: 'Homework unavailable',
    message: 'This Reading V2 homework is not assigned to the current student.',
  },
  'course-access-denied': {
    title: 'Course access required',
    message: 'The current student cannot open this Reading V2 course material.',
  },
  'library-unavailable': {
    title: 'Library unavailable',
    message: 'The Reading V2 library listing cannot be loaded.',
  },
  'projection-fetch-failure': {
    title: 'Reading material failed to load',
    message: 'The published Reading V2 projection could not be fetched.',
  },
};

export interface ReadingV2LaunchReadPlan {
  readonly surface: ReadingV2LaunchSurface;
  readonly metadataPath: string;
  readonly projectionPath: string;
  readonly projectionKind: 'student-safe' | 'session-safe';
}

export interface ReadingV2LaunchMaterialSummary {
  readonly id: string;
  readonly title: string;
  readonly durationMinutes: number;
  readonly difficulty?: 'easy' | 'medium' | 'hard';
  readonly questionCount: number;
  readonly sourceSnapshotVersionId?: string;
  readonly metadata: {
    readonly deliveryEngine: typeof READING_V2_ENGINE;
    readonly productLabel: string;
    readonly materialKind: string;
    readonly visibility?: string;
    readonly description?: string;
    readonly tags: readonly string[];
  };
}

const BLOCKED_PUBLIC_MESSAGE =
  'Reading V2 is not enabled for student launch yet.';

export const isReadingV2LaunchCandidate = (metadata: unknown): boolean =>
  isReadingV2Payload(metadata);

export const isReadingV2LaunchSurfaceEnabled = (input: {
  readonly surface: ReadingV2LaunchSurface;
  readonly rolloutMode?: ReadingV2RolloutMode;
  readonly readingPassageHomeworkMode?: Prd0052FeatureFlagMode;
  readonly readingPassageLibraryMode?: Prd0052FeatureFlagMode;
}): boolean => {
  if (isReadingV2PublicRollout(input.rolloutMode ?? READING_V2_ROLLOUT_MODE)) {
    return true;
  }

  if (input.surface === 'homework') {
    return isReadingPassageHomeworkEnabled(
      input.readingPassageHomeworkMode ?? READING_PASSAGE_HOMEWORK_MODE,
    );
  }

  if (input.surface === 'course-material') {
    return (
      isReadingPassageHomeworkEnabled(
        input.readingPassageHomeworkMode ?? READING_PASSAGE_HOMEWORK_MODE,
      ) ||
      isReadingPassageLibraryEnabled(
        input.readingPassageLibraryMode ?? READING_PASSAGE_LIBRARY_MODE,
      )
    );
  }

  if (input.surface === 'public-library') {
    return isReadingPassageLibraryEnabled(
      input.readingPassageLibraryMode ?? READING_PASSAGE_LIBRARY_MODE,
    );
  }

  return false;
};

const normalizeReadingV2Difficulty = (
  difficulty: string | undefined,
): 'easy' | 'medium' | 'hard' | undefined => {
  const normalized = difficulty?.toLowerCase();

  if (!normalized) {
    return undefined;
  }

  if (['easy', 'beginner', 'basic'].includes(normalized)) {
    return 'easy';
  }

  if (['hard', 'advanced', 'difficult'].includes(normalized)) {
    return 'hard';
  }

  return 'medium';
};

export const countReadingV2ProjectionInteractions = (
  projection?: Pick<ReadingV2DerivedProjection, 'content'> | null,
): number =>
  projection?.content?.taskGroups?.reduce(
    (total, taskGroup) => total + (taskGroup.interactions?.length ?? 0),
    0,
  ) ?? 0;

export const createReadingV2LaunchMaterialSummary = (input: {
  readonly metadata: ReadingV2MaterialMetadata;
  readonly projection?: Pick<ReadingV2DerivedProjection, 'content' | 'sourceSnapshotVersionId'> | null;
}): ReadingV2LaunchMaterialSummary => ({
  id: input.metadata.materialId,
  title: input.metadata.title,
  durationMinutes: input.metadata.durationMinutes,
  difficulty: normalizeReadingV2Difficulty(input.metadata.difficulty),
  questionCount: countReadingV2ProjectionInteractions(input.projection),
  sourceSnapshotVersionId:
    input.projection?.sourceSnapshotVersionId ?? input.metadata.publishedSnapshotVersionId,
  metadata: {
    deliveryEngine: READING_V2_ENGINE,
    productLabel: input.metadata.productLabel,
    materialKind: input.metadata.materialKind,
    visibility: input.metadata.visibility,
    description: input.metadata.description,
    tags: input.metadata.tags,
  },
});

export const createReadingV2LibraryMaterial = (input: {
  readonly metadata: ReadingV2MaterialMetadata;
  readonly projection?: Pick<ReadingV2DerivedProjection, 'content' | 'sourceSnapshotVersionId'> | null;
  readonly source: LibraryMaterial['source'];
}): LibraryMaterial => {
  const summary = createReadingV2LaunchMaterialSummary(input);

  return {
    id: summary.id,
    title: summary.title,
    type: 'test',
    skill: 'reading-v2',
    difficulty: summary.difficulty,
    estimatedDuration: summary.durationMinutes,
    questionCount: summary.questionCount,
    source: input.source,
    soloConfig: {
      soloEnabled: true,
      defaults: {
        timerMinutes: summary.durationMinutes,
        feedbackTiming: 'after_completion',
        suggestedAttempts: 1,
      },
      contexts: {
        selfStudy: {
          enabled: true,
          publicLibrary: input.source.type === 'public',
        },
        homework: {
          enabled: true,
          allowTeacherOverride: true,
        },
        courseMaterial: {
          canMarkRequired: true,
        },
      },
    },
  };
};

export const buildReadingV2LaunchReadPlan = (input: {
  readonly surface: ReadingV2LaunchSurface;
  readonly materialId: string;
  readonly snapshotVersionId?: string;
  readonly sessionCode?: string;
}): ReadingV2LaunchReadPlan => {
  const snapshotVersionId = input.snapshotVersionId ?? 'current';

  if (input.surface === 'live-session') {
    if (!input.sessionCode) {
      throw new Error('Reading V2 live-session launch requires a session code.');
    }

    return {
      surface: input.surface,
      metadataPath: readingV2StoragePaths.materialMetadata(input.materialId),
      projectionPath: readingV2StoragePaths.sessionSafePayloads(
        input.sessionCode,
        snapshotVersionId,
      ),
      projectionKind: 'session-safe',
    };
  }

  return {
    surface: input.surface,
    metadataPath: readingV2StoragePaths.materialMetadata(input.materialId),
    projectionPath: readingV2StoragePaths.studentSafeTests(
      input.materialId,
      snapshotVersionId,
    ),
    projectionKind: 'student-safe',
  };
};

export const resolveReadingV2LaunchDecision = (input: {
  readonly surface: ReadingV2LaunchSurface;
  readonly metadata?: unknown;
  readonly projection?: unknown;
  readonly rolloutMode?: ReadingV2RolloutMode;
  readonly readingPassageHomeworkMode?: Prd0052FeatureFlagMode;
  readonly readingPassageLibraryMode?: Prd0052FeatureFlagMode;
}): ReadingV2LaunchDecision => {
  if (!isReadingV2LaunchCandidate(input.metadata)) {
    return { status: 'legacy', reason: 'not-reading-v2' };
  }

  if (!isReadingV2LaunchSurfaceEnabled(input)) {
    return {
      status: 'blocked',
      reason: 'rollout-disabled',
      message: BLOCKED_PUBLIC_MESSAGE,
    };
  }

  if (!input.projection || typeof input.projection !== 'object') {
    return {
      status: 'blocked',
      reason: 'missing-projection',
      message: 'Reading V2 launch requires a published projection.',
    };
  }

  if (
    'plane' in input.projection &&
    input.projection.plane === 'canonical'
  ) {
    return {
      status: 'blocked',
      reason: 'canonical-draft-not-allowed',
      message: 'Reading V2 launch cannot read canonical drafts.',
    };
  }

  try {
    assertReadingV2RuntimeProjection(input.projection as ReadingV2DerivedProjection);
  } catch (error) {
    return {
      status: 'blocked',
      reason: 'invalid-projection-kind',
      message: error instanceof Error
        ? error.message
        : 'Reading V2 launch received an invalid projection.',
    };
  }

  const projection = input.projection as ReadingV2DerivedProjection;
  const expectedProjectionKind =
    input.surface === 'live-session' ? 'session-safe' : 'student-safe';

  if (projection.projectionKind !== expectedProjectionKind) {
    return {
      status: 'blocked',
      reason: 'invalid-projection-kind',
      message: `Reading V2 ${input.surface} launch requires ${expectedProjectionKind} projection; received ${projection.projectionKind}.`,
    };
  }

  return {
    status: 'runtime',
    projection: {
      ...projection,
      deliveryEngine: READING_V2_ENGINE,
    },
  };
};
