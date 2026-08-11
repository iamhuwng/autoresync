import type { NormalizedActivity } from '../../types/bookActivity.types';
import {
  type ActivityCandidateInput,
  validateActivityCandidate,
} from './activityCandidate.service';
import type {
  ActivityAuthoringMutation,
  ActivityAuthoringRepository,
  ActivityDiscardResult,
  ActivityLoadCandidateResult,
  ActivitySaveDraftResult,
  ActivityStageResult,
  ActivityValidateResult,
} from './activityAuthoring.repository';
import { ActivityAuthoringAmbiguousTransportError } from './activityStorage.service';

const operationId = (): string => {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('Cryptographically strong operation IDs are required.');
  }
  return crypto.randomUUID();
};

export interface ActivityAuthoringService {
  stage(input: ActivityCandidateInput & { expectedRevision: number }): Promise<ActivityStageResult>;
  validate(input: {
    candidateId: string;
    expectedRevision: number;
    evidenceRefs?: string[];
    sourceEvidenceRefs?: string[];
    answerEvidenceRefs?: string[];
  }): Promise<ActivityValidateResult>;
  saveDraft(input: {
    candidateId: string;
    expectedRevision: number;
    evidenceRefs?: string[];
    sourceEvidenceRefs?: string[];
    answerEvidenceRefs?: string[];
  }): Promise<ActivitySaveDraftResult>;
  discard(input: {
    candidateId: string;
    expectedRevision: number;
  }): Promise<ActivityDiscardResult>;
  loadCandidate(candidateId: string): Promise<ActivityLoadCandidateResult>;
}

/** Client facade performs early validation; Worker remains mutation authority. */
export const createActivityAuthoringService = (
  repository: ActivityAuthoringRepository,
  options: {
    previous?: (activityId: string) => NormalizedActivity | undefined;
    /** Fixed Book claim supplied by the Book shell; the Worker remains authoritative. */
    bookId?: string;
  } = {},
): ActivityAuthoringService => {
  const mutation = (value: Omit<ActivityAuthoringMutation, 'operationId'>): ActivityAuthoringMutation => ({
    ...value,
    operationId: operationId(),
  });
  const retryAmbiguous = async <T>(request: (input: ActivityAuthoringMutation) => Promise<T>, input: ActivityAuthoringMutation): Promise<T> => {
    try {
      return await request(input);
    } catch (error) {
      if (!(error instanceof ActivityAuthoringAmbiguousTransportError)) throw error;
      return request(input);
    }
  };
  return {
    async stage(input) {
      const previous = input.targetActivityId ? options.previous?.(input.targetActivityId) : undefined;
      const candidate = validateActivityCandidate(input, previous);
      const command = mutation({
        ...(options.bookId ?? input.bookId
          ? { bookId: options.bookId ?? input.bookId }
          : {}),
        expectedRevision: input.expectedRevision,
        ...(input.targetActivityId === undefined ? {} : { targetActivityId: input.targetActivityId }),
        content: candidate.content,
        evidenceRefs: candidate.evidenceRefs,
        sourceEvidenceRefs: candidate.sourceEvidenceRefs,
        answerEvidenceRefs: candidate.answerEvidenceRefs,
      });
      return retryAmbiguous(repository.stage, command);
    },
    validate: (input) => {
      const command = mutation(input);
      return retryAmbiguous(repository.validate, command);
    },
    saveDraft: (input) => {
      const command = mutation(input);
      return retryAmbiguous(repository.saveDraft, command);
    },
    discard: (input) => {
      const command = mutation(input);
      return retryAmbiguous(repository.discard, command);
    },
    loadCandidate: (candidateId) => repository.loadCandidate(candidateId),
  };
};
