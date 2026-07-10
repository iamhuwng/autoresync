import type {
  BookActivityCandidateRecord,
  BookActivityDraftRecord,
  BookActivityNormalizedContent,
} from '../../types/bookActivity.types';
import {
  BookActivitySchemaError,
  normalizeActivityRevision,
  validateEditableActivityJson,
} from './activitySchema.service';

export class BookActivityCandidateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BookActivityCandidateError';
  }
}

export interface StageActivityCandidateInput {
  readonly candidateId: string;
  readonly ownerId: string;
  readonly targetActivityId: string;
  readonly replacementContent: unknown;
  readonly now: string;
}

export const stageActivityCandidate = (
  input: StageActivityCandidateInput,
): BookActivityCandidateRecord => {
  try {
    const normalizedContent = validateEditableActivityJson(input.replacementContent);

    return {
      candidateId: input.candidateId,
      targetActivityId: input.targetActivityId,
      ownerId: input.ownerId,
      replacementContent: input.replacementContent,
      status: 'valid',
      errors: [],
      normalizedContent,
      createdAt: input.now,
    };
  } catch (error) {
    const errors = error instanceof BookActivitySchemaError
      ? error.issues
      : [error instanceof Error ? error.message : 'Unknown candidate validation error.'];

    return {
      candidateId: input.candidateId,
      targetActivityId: input.targetActivityId,
      ownerId: input.ownerId,
      replacementContent: input.replacementContent,
      status: 'invalid',
      errors,
      createdAt: input.now,
    };
  }
};

export const validateActivityCandidate = (
  candidate: BookActivityCandidateRecord,
): BookActivityCandidateRecord => (
  stageActivityCandidate({
    candidateId: candidate.candidateId,
    ownerId: candidate.ownerId,
    targetActivityId: candidate.targetActivityId,
    replacementContent: candidate.replacementContent,
    now: candidate.createdAt,
  })
);

export const saveActivityDraft = (input: {
  readonly candidate: BookActivityCandidateRecord;
  readonly draftId: string;
  readonly previousDraft?: BookActivityDraftRecord | null;
  readonly previousPublishedContent?: BookActivityNormalizedContent | null;
  readonly previousPublishedVersionId?: string | null;
  readonly expectedDraftRevision?: number;
  readonly now: string;
  readonly idFactory?: () => string;
}): BookActivityDraftRecord => {
  if (input.candidate.status !== 'valid' || !input.candidate.normalizedContent) {
    throw new BookActivityCandidateError('Invalid Activity candidate cannot mutate draft content.');
  }

  if (
    input.previousDraft &&
    input.expectedDraftRevision !== undefined &&
    input.previousDraft.draftRevision !== input.expectedDraftRevision
  ) {
    throw new BookActivityCandidateError('Activity draft revision mismatch.');
  }

  const normalizedContent = normalizeActivityRevision(
    input.candidate.normalizedContent,
    {
      previousContent: input.previousDraft?.normalizedContent ?? input.previousPublishedContent,
      idFactory: input.idFactory,
    },
  );

  return {
    activityId: input.candidate.targetActivityId,
    draftId: input.draftId,
    ownerId: input.candidate.ownerId,
    editableContent: input.candidate.normalizedContent,
    normalizedContent,
    baseVersionId: input.previousDraft?.baseVersionId ?? input.previousPublishedVersionId ?? undefined,
    draftRevision: (input.previousDraft?.draftRevision ?? 0) + 1,
    validationState: 'valid',
    createdAt: input.previousDraft?.createdAt ?? input.now,
    updatedAt: input.now,
  };
};
