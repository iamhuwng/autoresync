import type { BookSourceUploadKind } from '../../types/bookSource.types';
import {
  isSourcePdfInspectionClaimForFile,
  type SourcePdfInspectionClaim,
} from './sourcePdfInspection.browser';
import {
  uploadSourcePdfDirect,
  type SourceUploadByteProgress,
  type SourceUploadProviderIdentity,
  type UploadSourcePdfDirectOptions,
} from './sourceUpload.browser';
import {
  SourceUploadClientError,
  type BeginSourceUploadCommand,
  type BeginSourceUploadResult,
  type CompleteSourceUploadCommand,
  type CompleteSourceUploadResult,
  type DecideStudentSafeSourceResult,
  type SourceUploadBeginPendingState,
  type SourceUploadBoundOperationState,
  type SourceUploadLifecycleStatus,
  type SourceUploadSafeOperationState,
  type SourceUploadStatePort,
} from './sourceUpload.client';
import type { BookSourcePurpose } from '../../types/bookSource.types';

export type SourceUploadWorkflowErrorCode =
  | 'invalid_operation'
  | 'operation_exists'
  | 'stale_file'
  | 'verified_source_exists';

export class SourceUploadWorkflowError extends Error {
  constructor(public readonly code: SourceUploadWorkflowErrorCode) {
    super(`source_upload_workflow_${code}`);
    this.name = 'SourceUploadWorkflowError';
  }
}

export interface SourceUploadControlPort {
  begin(command: BeginSourceUploadCommand): Promise<BeginSourceUploadResult>;
  complete(command: CompleteSourceUploadCommand): Promise<CompleteSourceUploadResult>;
  decideStudentSafeSource(command: {
    readonly bookId: string;
    readonly reservationId: string;
    readonly operationId: string;
    readonly studentSafeStatus: 'ready';
    readonly reasonCode: 'teacher-reviewed';
  }): Promise<DecideStudentSafeSourceResult>;
  requestCancellation(command: {
    readonly bookId: string;
    readonly reservationId: string;
    readonly providerFileId?: string;
    readonly providerFileVersionId?: string;
  }): Promise<void>;
  status(command: {
    readonly bookId: string;
    readonly reservationId: string;
  }): Promise<SourceUploadLifecycleStatus>;
  reconcile(command: {
    readonly bookId: string;
    readonly reservationId: string;
  }): Promise<SourceUploadLifecycleStatus>;
}

export interface SourceUploadBrowserTransport {
  (
    input: Parameters<typeof uploadSourcePdfDirect>[0],
    options?: UploadSourcePdfDirectOptions,
  ): Promise<SourceUploadProviderIdentity>;
}

export interface SourceUploadSelection {
  readonly file: File;
  readonly claim: SourcePdfInspectionClaim;
}

export interface StartSourceUploadInput extends SourceUploadSelection {
  readonly bookId: string;
  readonly sourceKey: string;
  readonly kind: BookSourceUploadKind;
  readonly purpose?: BookSourcePurpose;
  readonly onProgress?: (progress: SourceUploadByteProgress) => void;
  readonly signal?: AbortSignal;
}

export interface SourceUploadWorkflowResult {
  readonly state: SourceUploadSafeOperationState;
  readonly completion: CompleteSourceUploadResult;
}

export interface SourceUploadBrowserWorkflow {
  load(bookId: string): Promise<SourceUploadSafeOperationState | null>;
  prepareReplacement(bookId: string): Promise<void>;
  start(input: StartSourceUploadInput): Promise<SourceUploadWorkflowResult>;
  retryBytes(input: StartSourceUploadInput): Promise<SourceUploadWorkflowResult>;
  retryCompletion(bookId: string): Promise<SourceUploadWorkflowResult>;
  decideStudentSafeSource?(bookId: string): Promise<DecideStudentSafeSourceResult>;
  requestCancellation(bookId: string): Promise<boolean>;
  retryCleanup(bookId: string): Promise<'cleanup_pending' | 'released' | 'verified_completed'>;
}

export interface SourceUploadBrowserWorkflowOptions {
  readonly control: SourceUploadControlPort;
  readonly state: SourceUploadStatePort;
  readonly allowedB2Origins: readonly string[];
  readonly upload?: SourceUploadBrowserTransport;
  readonly createOperationId?: () => string;
}

const exactSelection = (
  selection: SourceUploadSelection,
  state?: SourceUploadSafeOperationState,
): boolean =>
  isSourcePdfInspectionClaimForFile(selection.claim, selection.file)
  && selection.file.size === selection.claim.exactByteSize
  && (
    state === undefined
    || (
      state.displayFilename === selection.claim.displayFilename
      && state.exactByteSize === selection.claim.exactByteSize
      && state.sha256Hex === selection.claim.sha256Hex
    )
  );

const stateFromBegin = (
  input: StartSourceUploadInput,
  operationId: string,
  begin: BeginSourceUploadResult,
): SourceUploadBoundOperationState => Object.freeze({
  schemaVersion: 1,
  bookId: input.bookId,
  operationId,
  reservationId: begin.reservationId,
  sourceVersionId: begin.sourceVersionId,
  sourceKey: input.sourceKey,
  kind: input.kind,
  ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
  displayFilename: input.claim.displayFilename,
  exactByteSize: input.claim.exactByteSize,
  sha256Hex: input.claim.sha256Hex,
  phase: 'reserved',
});

const stateBeforeBegin = (
  input: StartSourceUploadInput,
  operationId: string,
): SourceUploadBeginPendingState => Object.freeze({
  schemaVersion: 1,
  bookId: input.bookId,
  operationId,
  sourceKey: input.sourceKey,
  kind: input.kind,
  ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
  displayFilename: input.claim.displayFilename,
  exactByteSize: input.claim.exactByteSize,
  sha256Hex: input.claim.sha256Hex,
  phase: 'begin_pending',
});

const pendingState = (
  state: SourceUploadBoundOperationState,
): SourceUploadBoundOperationState => Object.freeze({
  ...state,
  phase: 'completion_pending',
});

const verifiedState = (
  state: SourceUploadBoundOperationState,
  completion: CompleteSourceUploadResult,
): SourceUploadBoundOperationState => Object.freeze({
  ...state,
  sourceVersionId: completion.sourceVersionId,
  phase: 'verified',
});

const PRE_RESERVATION_FAILURE_CODES = new Set([
  'account_state_unavailable',
  'book_route_disabled',
  'book_route_unavailable',
  'cors_origin_denied',
  'invalid_deployment',
  'rate_limited',
  'rollout_denied',
]);

const definitelyUnreserved = (error: unknown): boolean =>
  error instanceof SourceUploadClientError
  && ([400, 401, 403, 404, 405, 413, 429].includes(error.status)
    || PRE_RESERVATION_FAILURE_CODES.has(error.code));

const samePersistedState = (
  left: SourceUploadSafeOperationState | null,
  right: SourceUploadSafeOperationState,
): boolean => left !== null
  && left.schemaVersion === right.schemaVersion
  && left.bookId === right.bookId
  && left.operationId === right.operationId
  && left.sourceKey === right.sourceKey
  && left.kind === right.kind
  && left.displayFilename === right.displayFilename
  && left.exactByteSize === right.exactByteSize
  && left.sha256Hex === right.sha256Hex
  && left.phase === right.phase
  && left.reservationId === right.reservationId
  && left.sourceVersionId === right.sourceVersionId
  && left.providerFileId === right.providerFileId
  && left.providerFileVersionId === right.providerFileVersionId;

const matchesRemoteBinding = (
  local: SourceUploadBoundOperationState,
  remote: SourceUploadLifecycleStatus,
): boolean => remote.bookId === local.bookId
  && remote.reservationId === local.reservationId
  && remote.sourceVersionId === local.sourceVersionId;

const reservedState = (
  state: SourceUploadBoundOperationState,
): SourceUploadBoundOperationState => Object.freeze({
  schemaVersion: state.schemaVersion,
  bookId: state.bookId,
  operationId: state.operationId,
  reservationId: state.reservationId,
  sourceVersionId: state.sourceVersionId,
  sourceKey: state.sourceKey,
  kind: state.kind,
  displayFilename: state.displayFilename,
  exactByteSize: state.exactByteSize,
  sha256Hex: state.sha256Hex,
  phase: 'reserved',
});

export const createSourceUploadBrowserWorkflow = (
  options: SourceUploadBrowserWorkflowOptions,
): SourceUploadBrowserWorkflow => {
  const upload = options.upload ?? uploadSourcePdfDirect;
  const canceledOperations = new Set<string>();
  const attemptGenerations = new Map<string, number>();

  const nextAttemptGeneration = (operationId: string): number => {
    const next = (attemptGenerations.get(operationId) ?? 0) + 1;
    attemptGenerations.set(operationId, next);
    return next;
  };

  const isCanceled = (
    state: SourceUploadSafeOperationState,
    attemptGeneration: number,
    signal?: AbortSignal,
  ): boolean => signal?.aborted === true
    || canceledOperations.has(state.operationId)
    || attemptGenerations.get(state.operationId) !== attemptGeneration;

  const abort = (): never => {
    throw new DOMException('Source upload canceled.', 'AbortError');
  };

  const saveIfCurrent = async (
    expected: SourceUploadSafeOperationState,
    next: SourceUploadSafeOperationState,
  ): Promise<SourceUploadSafeOperationState | null> => {
    const current = await options.state.load(expected.bookId);
    if (!samePersistedState(current, expected)) return current;
    await options.state.save(next);
    return next;
  };

  const clearIfCurrent = async (
    expected: SourceUploadSafeOperationState,
  ): Promise<boolean> => {
    const current = await options.state.load(expected.bookId);
    if (!samePersistedState(current, expected)) return false;
    await options.state.clear(expected.bookId);
    return true;
  };

  const complete = async (
    state: SourceUploadBoundOperationState,
  ): Promise<SourceUploadWorkflowResult> => {
    if (state.phase !== 'completion_pending') {
      throw new SourceUploadWorkflowError('invalid_operation');
    }
    const current = await options.state.load(state.bookId);
    if (
      !current
      || current.phase !== 'completion_pending'
      || current.operationId !== state.operationId
      || current.reservationId !== state.reservationId
      || current.sourceVersionId !== state.sourceVersionId
      || canceledOperations.has(state.operationId)
    ) {
      throw new SourceUploadWorkflowError('invalid_operation');
    }
    const completion = await options.control.complete({
      bookId: state.bookId,
      reservationId: state.reservationId,
      operationId: state.operationId,
    });
    if (completion.sourceVersionId !== state.sourceVersionId) {
      throw new SourceUploadClientError('response_binding_mismatch', 502);
    }
    if (completion.checksum.algorithm !== 'sha-256'
      || completion.checksum.value.toLowerCase() !== state.sha256Hex.toLowerCase()) {
      throw new SourceUploadClientError('response_binding_mismatch', 502);
    }
    const currentAfterCompletion = await options.state.load(state.bookId);
    if (
      !currentAfterCompletion
      || currentAfterCompletion.phase !== 'completion_pending'
      || currentAfterCompletion.operationId !== state.operationId
      || currentAfterCompletion.reservationId !== state.reservationId
      || currentAfterCompletion.sourceVersionId !== state.sourceVersionId
      || canceledOperations.has(state.operationId)
    ) {
      throw new SourceUploadWorkflowError('invalid_operation');
    }
    const next = verifiedState(state, completion);
    await options.state.save(next);
    return { state: next, completion };
  };

  const decideStudentSafeSource = async (bookId: string): Promise<DecideStudentSafeSourceResult> => {
    const before = await options.state.load(bookId);
    if (!before || before.phase !== 'verified') {
      throw new SourceUploadWorkflowError('invalid_operation');
    }
    const result = await options.control.decideStudentSafeSource({
      bookId,
      reservationId: before.reservationId,
      operationId: before.operationId,
      studentSafeStatus: 'ready',
      reasonCode: 'teacher-reviewed',
    });
    const after = await options.state.load(bookId);
    const decision = result.studentSafeDecision;
    if (!after
      || !samePersistedState(after, before)
      || result.status !== 'verified_completed'
      || result.reservationId !== before.reservationId
      || result.purpose !== (before.purpose ?? 'book-source')
      || result.sourceVersionId !== before.sourceVersionId
      || result.checksum.algorithm !== 'sha-256'
      || result.checksum.value.toLowerCase() !== before.sha256Hex.toLowerCase()
      || result.studentSafeStatus !== 'ready'
      || decision.sourceVersionId !== before.sourceVersionId
      || decision.sha256Hex.toLowerCase() !== before.sha256Hex.toLowerCase()
      || decision.reasonCode !== 'teacher-reviewed') {
      throw new SourceUploadClientError('response_binding_mismatch', 502);
    }
    return result;
  };

  const uploadAndComplete = async (
    input: StartSourceUploadInput,
    state: SourceUploadBoundOperationState,
    authority: BeginSourceUploadResult['upload'],
    attemptGeneration: number,
  ): Promise<SourceUploadWorkflowResult> => {
    try {
      await upload({
        purpose: state.purpose ?? 'book-source',
        file: input.file,
        claim: input.claim,
        authority,
        allowedB2Origins: options.allowedB2Origins,
      }, {
        signal: input.signal,
        onProgress: input.onProgress,
      });
    } catch (error) {
      const canceled = Object.freeze({
        ...state,
        phase: 'cancel_requested' as const,
      });
      await saveIfCurrent(state, canceled);
      try {
        await options.control.requestCancellation({
          bookId: state.bookId,
          reservationId: state.reservationId,
        });
      } catch {
        // Ambiguous provider state remains locally visible and capacity stays held.
      }
      throw error;
    }
    if (isCanceled(state, attemptGeneration, input.signal)) abort();
    const pending = pendingState(state);
    const savedPending = await saveIfCurrent(state, pending);
    if (!samePersistedState(savedPending, pending)) {
      throw new SourceUploadWorkflowError('invalid_operation');
    }
    if (isCanceled(state, attemptGeneration, input.signal)) {
      await saveIfCurrent(pending, Object.freeze({
        ...pending,
        phase: 'cancel_requested' as const,
      }));
      abort();
    }
    return complete(pending);
  };

  return {
    async load(bookId) {
      const local = await options.state.load(bookId);
      if (!local || local.phase === 'begin_pending' || local.phase === 'verified') return local;
      try {
        const remote = await options.control.status({
          bookId,
          reservationId: local.reservationId,
        });
        if (!matchesRemoteBinding(local, remote)) {
          throw new SourceUploadClientError('response_binding_mismatch', 502);
        }
        if (remote.status === 'cleanup_pending' || remote.retryKind === 'cleanup') {
          const canceled = Object.freeze({ ...local, phase: 'cancel_requested' as const });
          return saveIfCurrent(local, canceled);
        }
        if (remote.status === 'released') {
          if (await clearIfCurrent(local)) return null;
          return options.state.load(bookId);
        }
        if (remote.status === 'verified_completed') {
          const verified = Object.freeze({ ...local, phase: 'verified' as const });
          return saveIfCurrent(local, verified);
        }
        if (remote.retryKind === 'completion') {
          const pending = Object.freeze({ ...local, phase: 'completion_pending' as const });
          return saveIfCurrent(local, pending);
        }
        if (remote.status === 'reserved' && remote.retryKind === 'bytes') {
          const reserved = reservedState(local);
          if (samePersistedState(local, reserved)) return local;
          return saveIfCurrent(local, reserved);
        }
      } catch {
        // Offline reload keeps the last safe local recovery state visible.
      }
      return local;
    },

    async prepareReplacement(bookId) {
      const existing = await options.state.load(bookId);
      if (existing?.phase === 'verified' && existing.kind === 'initial') {
        await clearIfCurrent(existing);
      }
    },

    async start(input) {
      if (!exactSelection(input)) throw new SourceUploadWorkflowError('stale_file');
      let existing = await options.state.load(input.bookId);
      if (existing?.phase === 'verified') {
        if (existing.kind !== 'initial' || input.kind !== 'replacement') {
          throw new SourceUploadWorkflowError('verified_source_exists');
        }
        await clearIfCurrent(existing);
        existing = await options.state.load(input.bookId);
      }
      if (existing) throw new SourceUploadWorkflowError('operation_exists');

      const operationId = (options.createOperationId ?? (() => crypto.randomUUID()))();
      await options.state.save(stateBeforeBegin(input, operationId));
      let begin: BeginSourceUploadResult;
      try {
        begin = await options.control.begin({
          bookId: input.bookId,
          operationId,
          sourceKey: input.sourceKey,
          kind: input.kind,
          purpose: input.purpose ?? 'book-source',
          inspection: input.claim,
        });
      } catch (error) {
        if (definitelyUnreserved(error)) {
          const pending = await options.state.load(input.bookId);
          if (pending?.phase === 'begin_pending' && pending.operationId === operationId) {
            await clearIfCurrent(pending);
          }
        }
        throw error;
      }
      const state = stateFromBegin(input, operationId, begin);
      const pending = await options.state.load(input.bookId);
      if (
        !pending
        || pending.phase !== 'begin_pending'
        || pending.operationId !== operationId
        || !samePersistedState(await saveIfCurrent(pending, state), state)
      ) {
        throw new SourceUploadWorkflowError('invalid_operation');
      }
      if (input.signal?.aborted) {
        await saveIfCurrent(state, Object.freeze({ ...state, phase: 'cancel_requested' as const }));
        try {
          await options.control.requestCancellation({
            bookId: state.bookId,
            reservationId: state.reservationId,
          });
        } catch {
          // Capacity remains held and the persisted cleanup state remains visible.
        }
        abort();
      }
      const attemptGeneration = nextAttemptGeneration(operationId);
      return uploadAndComplete(input, state, begin.upload, attemptGeneration);
    },

    async retryBytes(input) {
      const existing = await options.state.load(input.bookId);
      if (
        !existing
        || (existing.phase !== 'begin_pending' && existing.phase !== 'reserved')
        || existing.sourceKey !== input.sourceKey
        || existing.kind !== input.kind
        || (existing.purpose ?? 'book-source') !== (input.purpose ?? existing.purpose ?? 'book-source')
      ) {
        throw new SourceUploadWorkflowError('invalid_operation');
      }
      if (!exactSelection(input, existing)) {
        throw new SourceUploadWorkflowError('stale_file');
      }
      const attemptGeneration = nextAttemptGeneration(existing.operationId);
      const begin = await options.control.begin({
        bookId: existing.bookId,
        operationId: existing.operationId,
        sourceKey: existing.sourceKey,
        kind: existing.kind,
        purpose: existing.purpose ?? input.purpose ?? 'book-source',
        inspection: input.claim,
      });
      if (existing.phase === 'reserved' && (
        begin.reservationId !== existing.reservationId
        || begin.sourceVersionId !== existing.sourceVersionId
      )) {
        throw new SourceUploadClientError('response_binding_mismatch', 502);
      }
      if (attemptGenerations.get(existing.operationId) !== attemptGeneration) {
        abort();
      }
      canceledOperations.delete(existing.operationId);
      const reserved = stateFromBegin(input, existing.operationId, begin);
      if (!samePersistedState(await saveIfCurrent(existing, reserved), reserved)) {
        throw new SourceUploadWorkflowError('invalid_operation');
      }
      if (input.signal?.aborted) {
        await saveIfCurrent(reserved, Object.freeze({
          ...reserved,
          phase: 'cancel_requested' as const,
        }));
        try {
          await options.control.requestCancellation({
            bookId: reserved.bookId,
            reservationId: reserved.reservationId,
          });
        } catch {
          // Capacity remains held and the persisted cleanup state remains visible.
        }
        abort();
      }
      return uploadAndComplete(input, reserved, begin.upload, attemptGeneration);
    },

    async retryCompletion(bookId) {
      const existing = await options.state.load(bookId);
      if (!existing || existing.phase !== 'completion_pending') {
        throw new SourceUploadWorkflowError('invalid_operation');
      }
      return complete(existing);
    },

    decideStudentSafeSource,

    async requestCancellation(bookId) {
      const existing = await options.state.load(bookId);
      if (!existing || existing.phase === 'verified' || existing.phase === 'begin_pending') {
        return false;
      }
      canceledOperations.add(existing.operationId);
      nextAttemptGeneration(existing.operationId);
      const canceled = Object.freeze({
        ...existing,
        phase: 'cancel_requested' as const,
      });
      if (!samePersistedState(await saveIfCurrent(existing, canceled), canceled)) {
        return false;
      }
      try {
        await options.control.requestCancellation({
          bookId,
          reservationId: existing.reservationId,
          ...(existing.providerFileId && existing.providerFileVersionId ? {
            providerFileId: existing.providerFileId,
            providerFileVersionId: existing.providerFileVersionId,
          } : {}),
        });
        return true;
      } catch {
        return false;
      }
    },

    async retryCleanup(bookId) {
      const existing = await options.state.load(bookId);
      if (!existing || existing.phase !== 'cancel_requested') {
        throw new SourceUploadWorkflowError('invalid_operation');
      }
      const result = await options.control.reconcile({
        bookId,
        reservationId: existing.reservationId,
      });
      if (!matchesRemoteBinding(existing, result)) {
        throw new SourceUploadClientError('response_binding_mismatch', 502);
      }
      if (
        result.status !== 'cleanup_pending'
        && result.status !== 'released'
        && result.status !== 'verified_completed'
      ) {
        throw new SourceUploadClientError('invalid_response', 502);
      }
      if (result.status === 'released') {
        if (!await clearIfCurrent(existing)) {
          throw new SourceUploadWorkflowError('invalid_operation');
        }
      } else if (result.status === 'verified_completed' && result.retryKind !== 'cleanup') {
        const verified = Object.freeze({ ...existing, phase: 'verified' as const });
        if (!samePersistedState(await saveIfCurrent(existing, verified), verified)) {
          throw new SourceUploadWorkflowError('invalid_operation');
        }
      }
      return result.status;
    },
  };
};
