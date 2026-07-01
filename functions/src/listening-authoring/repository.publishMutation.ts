import { requestHash } from './canonical';
import { LISTENING_AUTHORING_SCHEMA_VERSION } from './constants';
import {
  createFailedOperationRecord,
  createOperationScopeKey,
  createSucceededOperationRecord,
} from './repository.operationRecords';
import {
  cloneDraftRecord,
  cloneRecord,
  cloneVersionRecord,
  normalizeDraftRecord,
  normalizeVersionRecord,
  type ListeningAuthoringDraftRecord,
  type ListeningAuthoringOperationRecord,
  type ListeningDraftRecord,
  type ListeningPublishedVersionRecord,
  type PublishBlocker,
  type PublishDraftTransactionInput,
  type PublishDraftTransactionResult,
  type PublishedDraftTransactionPayload,
} from './repository.shared';

export interface PublishDraftMutationState {
  drafts: Map<string, ListeningAuthoringDraftRecord>;
  versions: Map<string, ListeningPublishedVersionRecord>;
  operationsById: Map<string, ListeningAuthoringOperationRecord>;
  operationIdsByLookupKey: Map<string, string>;
}

const replayBlocked: readonly PublishBlocker[] = [{
  field: 'publish',
  severity: 'blocker',
  guidance: 'Publish remains blocked for this idempotent request.',
}];

const hasText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const hasPublishableAnswer = (
  answer: ListeningAuthoringDraftRecord['document']['questions'][number]['answer'],
): boolean => {
  if (typeof answer === 'string') {
    return hasText(answer);
  }

  if (Array.isArray(answer)) {
    return answer.length > 0 && answer.every(hasText);
  }

  if (answer !== undefined && answer !== null && typeof answer === 'object') {
    const values = Object.values(answer);
    return values.length > 0 && values.every(hasText);
  }

  return false;
};

const imageCoversQuestion = (
  draft: ListeningAuthoringDraftRecord,
  question: ListeningAuthoringDraftRecord['document']['questions'][number],
): boolean => {
  if (draft.document.displayMode !== 'image') return false;
  if (hasText(question.imageUrl)) return true;

  const section = draft.document.audioSections.find(audioSection =>
    audioSection.number === question.sectionNumber,
  );

  return (draft.document.questionImages ?? []).some((image) => {
    if (!hasText(image.imageUrl)) return false;
    if (image.sectionNumber !== question.sectionNumber) return false;

    const start = image.questionRange?.start ?? section?.startQuestion ?? question.number;
    const end = image.questionRange?.end ?? section?.endQuestion ?? question.number;
    return question.number >= start && question.number <= end;
  });
};

const findPublishBlockers = (draft: ListeningAuthoringDraftRecord): readonly PublishBlocker[] => {
  const blockers: PublishBlocker[] = [];
  if (draft.document.audioSections.length === 0) {
    blockers.push({
      field: 'audioSections',
      severity: 'blocker',
      guidance: 'Publish requires at least one audio section.',
    });
  }
  if (draft.document.questions.length === 0) {
    blockers.push({
      field: 'questions',
      severity: 'blocker',
      guidance: 'Publish requires at least one question.',
    });
  }
  if (draft.document.questionCount !== draft.document.questions.length) {
    blockers.push({
      field: 'questionCount',
      severity: 'blocker',
      guidance: 'Publish requires questionCount to match the saved questions.',
    });
  }
  draft.document.audioSections.forEach((section, index) => {
    if (typeof section.assetId !== 'string' || section.assetId.length === 0) {
      blockers.push({
        field: `audioSections[${index}].assetId`,
        severity: 'blocker',
        guidance: 'Publish requires canonical assetId for every audio section.',
      });
    }
  });
  draft.document.questions.forEach((question, index) => {
    if (!hasText(question.question) && !imageCoversQuestion(draft, question)) {
      blockers.push({
        field: draft.document.displayMode === 'image'
          ? `questions[${index}].questionImage`
          : `questions[${index}].question`,
        severity: 'blocker',
        guidance: draft.document.displayMode === 'image'
          ? 'Publish requires question image coverage or question text for every question.'
          : 'Publish requires question text for every question.',
      });
    }
    if (!hasPublishableAnswer(question.answer)) {
      blockers.push({
        field: `questions[${index}].answer`,
        severity: 'blocker',
        guidance: 'Publish requires a non-empty answer for every question.',
      });
    }
  });
  return blockers;
};

const readPublishResult = (
  operation: ListeningAuthoringOperationRecord,
): PublishedDraftTransactionPayload => {
  const result = operation.result;
  if (
    operation.completedAt === undefined ||
    result === undefined ||
    typeof result.draftId !== 'string' ||
    result.draftId.length === 0 ||
    typeof result.versionId !== 'string' ||
    result.versionId.length === 0 ||
    typeof result.versionNumber !== 'number' ||
    !Number.isInteger(result.versionNumber) ||
    result.versionNumber <= 0 ||
    typeof result.conflictToken !== 'number' ||
    !Number.isInteger(result.conflictToken) ||
    result.conflictToken <= 0
  ) {
    throw new Error(`malformed or incomplete publish operation ${operation.operationId}.`);
  }

  return {
    draftId: result.draftId,
    versionId: result.versionId,
    versionNumber: result.versionNumber,
    conflictToken: result.conflictToken,
  };
};

const failWithConflict = (
  state: PublishDraftMutationState,
  input: PublishDraftTransactionInput,
  draft: ListeningAuthoringDraftRecord,
  completedAt: number,
): PublishDraftTransactionResult => {
  const operation = createFailedOperationRecord({
    operationId: input.operationId,
    operationType: 'publish',
    targetType: draft.recordType,
    ownerId: input.ownerId,
    targetId: input.draftId,
    idempotencyKeyHash: input.idempotencyKeyHash,
    requestHash: input.requestHash,
    expectedConflictToken: input.expectedConflictToken,
    errorCode: 'conflict',
    result: {
      draftId: draft.draftId,
      conflictToken: draft.conflictToken,
    },
    completedAt,
  });
  const scopeKey = createOperationScopeKey(operation);
  state.operationsById.set(operation.operationId, operation);
  state.operationIdsByLookupKey.set(scopeKey, operation.operationId);
  return {
    kind: 'conflict',
    draftId: draft.draftId,
    expectedConflictToken: input.expectedConflictToken,
    currentConflictToken: draft.conflictToken,
  };
};

export const runPublishDraftMutation = (
  state: PublishDraftMutationState,
  input: PublishDraftTransactionInput,
): PublishDraftTransactionResult => {
  const scopeKey = createOperationScopeKey({
    ownerId: input.ownerId,
    operationType: 'publish',
    targetId: input.draftId,
    idempotencyKeyHash: input.idempotencyKeyHash,
  });
  const existingOperationId = state.operationIdsByLookupKey.get(scopeKey);
  if (existingOperationId !== undefined) {
    const existingOperation = state.operationsById.get(existingOperationId);
    if (existingOperation === undefined) {
      throw new Error(`operation ${existingOperationId} missing for publish transaction.`);
    }
    if (existingOperation.requestHash !== input.requestHash) {
      return {
        kind: 'idempotency-conflict',
        draftId: input.draftId,
        operationId: existingOperation.operationId,
      };
    }
    if (existingOperation.status === 'succeeded') {
      return { kind: 'replayed', result: readPublishResult(existingOperation) };
    }
    if (existingOperation.status === 'failed' && existingOperation.errorCode === 'conflict') {
      const result = existingOperation.result;
      if (
        result === undefined ||
        typeof result.draftId !== 'string' ||
        typeof result.conflictToken !== 'number'
      ) {
        throw new Error(`malformed or incomplete publish operation ${existingOperation.operationId}.`);
      }
      return {
        kind: 'conflict',
        draftId: result.draftId,
        expectedConflictToken: existingOperation.expectedConflictToken ?? input.expectedConflictToken,
        currentConflictToken: result.conflictToken,
      };
    }
    if (existingOperation.status === 'failed' && existingOperation.errorCode === 'publish-blocked') {
      const result = existingOperation.result;
      if (
        result === undefined ||
        typeof result.draftId !== 'string' ||
        typeof result.conflictToken !== 'number'
      ) {
        throw new Error(`malformed or incomplete publish operation ${existingOperation.operationId}.`);
      }
      return {
        kind: 'blocked',
        draftId: result.draftId,
        conflictToken: result.conflictToken,
        blockers: replayBlocked,
      };
    }
    throw new Error(`malformed or incomplete publish operation ${existingOperation.operationId}.`);
  }

  if (state.operationsById.has(input.operationId)) {
    throw new Error(`operation ${input.operationId} already exists.`);
  }

  const currentDraft = state.drafts.get(input.draftId);
  if (currentDraft === undefined || currentDraft.ownerId !== input.ownerId) {
    return { kind: 'not-found', draftId: input.draftId };
  }
  if (currentDraft.state !== 'active') {
    return failWithConflict(state, input, currentDraft, input.publishedAt);
  }
  if (currentDraft.conflictToken !== input.expectedConflictToken) {
    return failWithConflict(state, input, currentDraft, input.publishedAt);
  }

  const blockers = findPublishBlockers(currentDraft);
  if (blockers.length > 0) {
    const operation = createFailedOperationRecord({
      operationId: input.operationId,
      operationType: 'publish',
      targetType: currentDraft.recordType,
      ownerId: input.ownerId,
      targetId: input.draftId,
      idempotencyKeyHash: input.idempotencyKeyHash,
      requestHash: input.requestHash,
      expectedConflictToken: input.expectedConflictToken,
      errorCode: 'publish-blocked',
      result: {
        draftId: currentDraft.draftId,
        conflictToken: currentDraft.conflictToken,
      },
      completedAt: input.publishedAt,
    });
    state.operationsById.set(operation.operationId, operation);
    state.operationIdsByLookupKey.set(scopeKey, operation.operationId);
    return {
      kind: 'blocked',
      draftId: currentDraft.draftId,
      conflictToken: currentDraft.conflictToken,
      blockers,
    };
  }

  const latestExistingVersion = [...state.versions.values()]
    .filter((existing) => existing.testId === currentDraft.testId)
    .sort((left, right) => right.versionNumber - left.versionNumber)[0];
  const versionNumber = (latestExistingVersion?.versionNumber ?? 0) + 1;
  const nextConflictToken = currentDraft.conflictToken + 1;
  const sourceDraftPath = currentDraft.recordType === 'draft' ? 'drafts' : 'revision_drafts';
  const version = normalizeVersionRecord({
    schemaVersion: LISTENING_AUTHORING_SCHEMA_VERSION,
    recordType: 'published-version',
    versionId: input.versionId,
    versionNumber,
    testId: currentDraft.testId,
    ownerId: input.ownerId,
    previousVersionId: currentDraft.recordType === 'draft'
      ? currentDraft.latestPublishedVersionId
      : latestExistingVersion?.versionId ?? currentDraft.createdFromVersionId,
    sourceDraftPath,
    sourceDraftId: currentDraft.draftId,
    document: cloneRecord(currentDraft.document),
    assetIds: cloneRecord(currentDraft.assetIds),
    publishedAt: input.publishedAt,
    publishedBy: input.ownerId,
    publishOperationId: input.operationId,
    documentHash: requestHash(currentDraft.document),
    archive: {
      state: 'active',
    },
    compatibility: {
      frozenLegacyVersion1: false,
    },
  });
  const updatedDraft = normalizeDraftRecord({
    ...cloneDraftRecord(currentDraft),
    conflictToken: nextConflictToken,
    updatedAt: input.publishedAt,
    updatedBy: input.ownerId,
    lastOperationId: input.operationId,
    ...(currentDraft.recordType === 'draft'
      ? { latestPublishedVersionId: input.versionId } satisfies Partial<ListeningDraftRecord>
      : {}),
  });
  const result: PublishedDraftTransactionPayload = {
    draftId: updatedDraft.draftId,
    versionId: version.versionId,
    versionNumber: version.versionNumber,
    conflictToken: updatedDraft.conflictToken,
  };
  const operation = createSucceededOperationRecord({
    operationId: input.operationId,
    operationType: 'publish',
    targetType: currentDraft.recordType,
    ownerId: input.ownerId,
    targetId: input.draftId,
    idempotencyKeyHash: input.idempotencyKeyHash,
    requestHash: input.requestHash,
    expectedConflictToken: input.expectedConflictToken,
    result,
    completedAt: input.publishedAt,
  });

  state.versions.set(version.versionId, cloneVersionRecord(version));
  state.drafts.set(updatedDraft.draftId, updatedDraft);
  state.operationsById.set(operation.operationId, operation);
  state.operationIdsByLookupKey.set(scopeKey, operation.operationId);
  return { kind: 'published', result };
};
