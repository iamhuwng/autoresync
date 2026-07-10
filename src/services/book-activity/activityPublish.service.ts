import type {
  BookActivityDraftRecord,
  BookActivityMaterialRecord,
  BookActivityVersionRecord,
} from '../../types/bookActivity.types';
import { createStudentSafeActivityProjection } from './activityProjection.service';

export class BookActivityPublishError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BookActivityPublishError';
  }
}

export const publishActivityRevision = (input: {
  readonly draft: BookActivityDraftRecord;
  readonly expectedDraftRevision: number;
  readonly versionId: string;
  readonly publishedBy: string;
  readonly now: string;
  readonly existingVersion?: BookActivityVersionRecord | null;
}): {
  readonly version: BookActivityVersionRecord;
  readonly materialPatch: Pick<
    BookActivityMaterialRecord,
    'activityId' | 'materialId' | 'materialKind' | 'ownerId' | 'title' | 'lifecycleState' | 'currentDraftId' | 'currentVersionId' | 'updatedAt'
  >;
  readonly projection: ReturnType<typeof createStudentSafeActivityProjection>;
} => {
  if (input.draft.draftRevision !== input.expectedDraftRevision) {
    throw new BookActivityPublishError('Activity draft revision mismatch.');
  }

  if (input.existingVersion) {
    throw new BookActivityPublishError('Published Activity versions are immutable.');
  }

  const version: BookActivityVersionRecord = {
    activityId: input.draft.activityId,
    versionId: input.versionId,
    ownerId: input.draft.ownerId,
    materialKind: 'interactive-activity',
    content: input.draft.normalizedContent,
    publishedAt: input.now,
    publishedBy: input.publishedBy,
  };

  return {
    version,
    materialPatch: {
      activityId: input.draft.activityId,
      materialId: input.draft.activityId,
      materialKind: 'interactive-activity',
      ownerId: input.draft.ownerId,
      title: input.draft.normalizedContent.title,
      lifecycleState: 'published',
      currentDraftId: input.draft.draftId,
      currentVersionId: input.versionId,
      updatedAt: input.now,
    },
    projection: createStudentSafeActivityProjection(version, input.now),
  };
};

export const assertPublishedActivityVersionMutation = (
  current: BookActivityVersionRecord,
  next: BookActivityVersionRecord,
): void => {
  if (JSON.stringify(current) !== JSON.stringify(next)) {
    throw new BookActivityPublishError('Published Activity versions are immutable.');
  }
};
