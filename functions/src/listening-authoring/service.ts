import { hmacSha256Hex, requestHash } from './canonical';
import type { ListeningAuthoringAuthContext } from './contracts';
import type {
  ListeningAuthoringRepository,
  LifecycleTransactionResult,
  PublishBlocker,
  PublishedDraftTransactionPayload,
} from './repository';
import { parseLifecycleRequest, parsePublishDraftRequest, parseSaveDraftRequest } from './validation';

export type SaveListeningDraftCoreResult =
  | {
      status: 'saved';
      draftId: string;
      conflictToken: number;
      warnings: readonly string[];
      blockers: readonly string[];
    }
  | {
      status: 'conflict';
      recoverable: true;
      draftId: string;
      expectedConflictToken?: number;
      currentConflictToken: number;
    }
  | {
      status: 'idempotency-conflict';
      recoverable: false;
      draftId: string;
      operationId: string;
    }
  | {
      status: 'not-found';
      recoverable: false;
      draftId: string;
    };

export interface SaveListeningDraftCoreInput {
  auth: ListeningAuthoringAuthContext;
  body: unknown;
  repo: ListeningAuthoringRepository;
  idempotencySecret: string;
}

const createDraftId = (ownerId: string, secret: string, idempotencyKey: string): string =>
  `draft-${hmacSha256Hex(secret, `${ownerId}:save-draft:create:${idempotencyKey}`).slice(0, 32)}`;

const createVersionId = (
  ownerId: string,
  secret: string,
  draftId: string,
  idempotencyKey: string,
): string =>
  `version-${hmacSha256Hex(secret, `${ownerId}:publish:${draftId}:version:${idempotencyKey}`).slice(0, 32)}`;

const createLegacyVersionId = (
  ownerId: string,
  secret: string,
  legacyTestId: string,
): string =>
  `version-${hmacSha256Hex(secret, `${ownerId}:legacy-first-edit:${legacyTestId}:version`).slice(0, 32)}`;

const createLegacyRevisionDraftId = (
  ownerId: string,
  secret: string,
  legacyTestId: string,
): string =>
  `draft-${hmacSha256Hex(secret, `${ownerId}:legacy-first-edit:${legacyTestId}:revision`).slice(0, 32)}`;

const toSavedResult = (
  draftId: string,
  conflictToken: number,
  warnings: readonly string[],
): SaveListeningDraftCoreResult => ({
  status: 'saved',
  draftId,
  conflictToken,
  warnings,
  blockers: [],
});

export const saveListeningDraftCore = async ({
  auth,
  body,
  repo,
  idempotencySecret,
}: SaveListeningDraftCoreInput): Promise<SaveListeningDraftCoreResult> => {
  const request = parseSaveDraftRequest(body);
  const ownerId = auth.uid;
  const draftId = request.draftId ?? createDraftId(ownerId, idempotencySecret, request.idempotencyKey);
  const idempotencyKeyHash = hmacSha256Hex(
    idempotencySecret,
    `${ownerId}:save-draft:${draftId}:${request.idempotencyKey}`,
  );
  const operationId = repo.allocateId('operation');
  const safeRequestHash = requestHash({
    ownerId,
    operationType: 'save-draft',
    targetId: draftId,
    expectedConflictToken: request.expectedConflictToken,
    document: request.document,
    trigger: request.trigger,
  });

  const transactionResult = await repo.saveDraftTransaction({
    ownerId,
    draftId,
    operationId,
    idempotencyKeyHash,
    requestHash: safeRequestHash,
    expectedConflictToken: request.expectedConflictToken,
    document: request.document,
    allowCreate: request.draftId === undefined,
  });

  switch (transactionResult.kind) {
    case 'saved':
    case 'replayed':
      return toSavedResult(
        transactionResult.result.draftId,
        transactionResult.result.conflictToken,
        request.warnings,
      );

    case 'conflict':
      return {
        status: 'conflict',
        recoverable: true,
        draftId: transactionResult.draftId,
        expectedConflictToken: transactionResult.expectedConflictToken,
        currentConflictToken: transactionResult.currentConflictToken,
      };

    case 'idempotency-conflict':
      return {
        status: 'idempotency-conflict',
        recoverable: false,
        draftId: transactionResult.draftId,
        operationId: transactionResult.operationId,
      };

    case 'not-found':
      return {
        status: 'not-found',
        recoverable: false,
        draftId: transactionResult.draftId,
      };
  }
};

export type PublishListeningDraftCoreResult =
  | {
      status: 'published';
      draftId: string;
      versionId: string;
      versionNumber: number;
      conflictToken: number;
      warnings: readonly string[];
    }
  | {
      status: 'blocked';
      draftId: string;
      conflictToken: number;
      blockers: readonly PublishBlocker[];
      warnings: readonly string[];
    }
  | {
      status: 'conflict';
      recoverable: true;
      draftId: string;
      expectedConflictToken: number;
      currentConflictToken: number;
    }
  | {
      status: 'idempotency-conflict';
      recoverable: false;
      draftId: string;
      operationId: string;
    }
  | {
      status: 'not-found';
      recoverable: false;
      draftId: string;
    };

export interface PublishListeningDraftCoreInput {
  auth: ListeningAuthoringAuthContext;
  body: unknown;
  repo: ListeningAuthoringRepository;
  idempotencySecret: string;
}

const toPublishedResult = (
  result: PublishedDraftTransactionPayload,
): PublishListeningDraftCoreResult => ({
  status: 'published',
  draftId: result.draftId,
  versionId: result.versionId,
  versionNumber: result.versionNumber,
  conflictToken: result.conflictToken,
  warnings: [],
});

export const publishListeningDraftCore = async ({
  auth,
  body,
  repo,
  idempotencySecret,
}: PublishListeningDraftCoreInput): Promise<PublishListeningDraftCoreResult> => {
  const request = parsePublishDraftRequest(body);
  const ownerId = auth.uid;
  if ('legacyTestId' in request) {
    const idempotencyKeyHash = hmacSha256Hex(
      idempotencySecret,
      `${ownerId}:publish:${request.legacyTestId}:${request.idempotencyKey}`,
    );
    const operationId = repo.allocateId('operation');
    const versionId = createLegacyVersionId(
      ownerId,
      idempotencySecret,
      request.legacyTestId,
    );
    const revisionDraftId = createLegacyRevisionDraftId(
      ownerId,
      idempotencySecret,
      request.legacyTestId,
    );
    const safeRequestHash = requestHash({
      ownerId,
      operationType: 'publish',
      targetType: 'legacy-test',
      targetId: request.legacyTestId,
    });
    const transactionResult = await repo.legacyFirstEditTransaction({
      ownerId,
      legacyTestId: request.legacyTestId,
      operationId,
      versionId,
      revisionDraftId,
      idempotencyKeyHash,
      requestHash: safeRequestHash,
      publishedAt: Date.now(),
    });

    switch (transactionResult.kind) {
      case 'published':
      case 'replayed':
        return toPublishedResult(transactionResult.result);
      case 'idempotency-conflict':
        return {
          status: 'idempotency-conflict',
          recoverable: false,
          draftId: transactionResult.draftId,
          operationId: transactionResult.operationId,
        };
      case 'not-found':
        return {
          status: 'not-found',
          recoverable: false,
          draftId: request.legacyTestId,
        };
    }
  }

  const idempotencyKeyHash = hmacSha256Hex(
    idempotencySecret,
    `${ownerId}:publish:${request.draftId}:${request.idempotencyKey}`,
  );
  const operationId = repo.allocateId('operation');
  const versionId = createVersionId(
    ownerId,
    idempotencySecret,
    request.draftId,
    request.idempotencyKey,
  );
  const safeRequestHash = requestHash({
    ownerId,
    operationType: 'publish',
    targetId: request.draftId,
    expectedConflictToken: request.expectedConflictToken,
    retainedPins: request.retainedPins,
  });

  const transactionResult = await repo.publishDraftTransaction({
    ownerId,
    draftId: request.draftId,
    operationId,
    versionId,
    idempotencyKeyHash,
    requestHash: safeRequestHash,
    expectedConflictToken: request.expectedConflictToken,
    publishedAt: Date.now(),
  });

  switch (transactionResult.kind) {
    case 'published':
    case 'replayed':
      return toPublishedResult(transactionResult.result);

    case 'blocked':
      return {
        status: 'blocked',
        draftId: transactionResult.draftId,
        conflictToken: transactionResult.conflictToken,
        blockers: transactionResult.blockers,
        warnings: [],
      };

    case 'conflict':
      return {
        status: 'conflict',
        recoverable: true,
        draftId: transactionResult.draftId,
        expectedConflictToken: transactionResult.expectedConflictToken,
        currentConflictToken: transactionResult.currentConflictToken,
      };

    case 'idempotency-conflict':
      return {
        status: 'idempotency-conflict',
        recoverable: false,
        draftId: transactionResult.draftId,
        operationId: transactionResult.operationId,
      };

    case 'not-found':
      return {
        status: 'not-found',
        recoverable: false,
        draftId: transactionResult.draftId,
      };
  }
};

export type MutateListeningAuthoringLifecycleCoreResult =
  | {
      status: 'soft-deleted' | 'restored' | 'discarded';
      draftId: string;
      conflictToken: number;
    }
  | {
      status: 'archived';
      versionId: string;
      versionNumber: number;
    }
  | {
      status: 'conflict';
      recoverable: true;
      targetId: string;
      expectedConflictToken: number;
      currentConflictToken: number;
    }
  | {
      status: 'idempotency-conflict';
      recoverable: false;
      targetId: string;
      operationId: string;
    }
  | {
      status: 'invalid-state' | 'not-found';
      recoverable: false;
      targetId: string;
    };

export interface MutateListeningAuthoringLifecycleCoreInput {
  auth: ListeningAuthoringAuthContext;
  body: unknown;
  repo: ListeningAuthoringRepository;
  idempotencySecret: string;
}

const toLifecycleResult = (
  result: LifecycleTransactionResult,
): MutateListeningAuthoringLifecycleCoreResult => {
  switch (result.kind) {
    case 'soft-deleted':
    case 'restored':
    case 'discarded':
      return {
        status: result.kind,
        draftId: result.result.draftId,
        conflictToken: result.result.conflictToken,
      };
    case 'archived':
      return {
        status: 'archived',
        versionId: result.result.versionId,
        versionNumber: result.result.versionNumber,
      };
    case 'conflict':
      return {
        status: 'conflict',
        recoverable: true,
        targetId: result.targetId,
        expectedConflictToken: result.expectedConflictToken,
        currentConflictToken: result.currentConflictToken,
      };
    case 'idempotency-conflict':
      return {
        status: 'idempotency-conflict',
        recoverable: false,
        targetId: result.targetId,
        operationId: result.operationId,
      };
    case 'invalid-state':
    case 'not-found':
      return {
        status: result.kind,
        recoverable: false,
        targetId: result.targetId,
      };
  }
};

export const mutateListeningAuthoringLifecycleCore = async ({
  auth,
  body,
  repo,
  idempotencySecret,
}: MutateListeningAuthoringLifecycleCoreInput): Promise<MutateListeningAuthoringLifecycleCoreResult> => {
  const request = parseLifecycleRequest(body);
  if (request.expectedConflictToken === undefined) {
    throw new Error('expectedConflictToken is required for lifecycle operations.');
  }

  const ownerId = auth.uid;
  const idempotencyKeyHash = hmacSha256Hex(
    idempotencySecret,
    `${ownerId}:${request.operation}:${request.targetId}:${request.idempotencyKey}`,
  );
  const operationId = repo.allocateId('operation');
  const safeRequestHash = requestHash({
    ownerId,
    operationType: request.operation,
    targetId: request.targetId,
    expectedConflictToken: request.expectedConflictToken,
    reasonCode: request.reasonCode,
  });

  return toLifecycleResult(await repo.lifecycleTransaction({
    ownerId,
    operationId,
    operationType: request.operation,
    targetId: request.targetId,
    idempotencyKeyHash,
    requestHash: safeRequestHash,
    expectedConflictToken: request.expectedConflictToken,
    completedAt: Date.now(),
    reasonCode: request.reasonCode,
  }));
};
