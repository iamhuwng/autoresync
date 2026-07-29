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
  type SourceUploadLifecycleStatus,
  type SourceUploadSafeOperationState,
  type SourceUploadStatePort,
} from './sourceUpload.client';

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
  readonly onProgress?: (progress: SourceUploadByteProgress) => void;
  readonly signal?: AbortSignal;
}

export interface SourceUploadWorkflowResult {
  readonly state: SourceUploadSafeOperationState;
  readonly completion: CompleteSourceUploadResult;
}

export interface SourceUploadBrowserWorkflow {
  load(bookId: string): Promise<SourceUploadSafeOperationState | null>;
  start(input: StartSourceUploadInput): Promise<SourceUploadWorkflowResult>;
  retryBytes(input: StartSourceUploadInput): Promise<SourceUploadWorkflowResult>;
  retryCompletion(bookId: string): Promise<SourceUploadWorkflowResult>;
  requestCancellation(bookId: string): Promise<boolean>;
  retryCleanup(bookId: string): Promise<'cleanup_pending' | 'released'>;
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
): SourceUploadSafeOperationState => Object.freeze({
  schemaVersion: 1,
  bookId: input.bookId,
  operationId,
  reservationId: begin.reservationId,
  sourceVersionId: begin.sourceVersionId,
  sourceKey: input.sourceKey,
  kind: input.kind,
  displayFilename: input.claim.displayFilename,
  exactByteSize: input.claim.exactByteSize,
  sha256Hex: input.claim.sha256Hex,
  phase: 'reserved',
});

const pendingState = (
  state: SourceUploadSafeOperationState,
  identity: SourceUploadProviderIdentity,
): SourceUploadSafeOperationState => Object.freeze({
  ...state,
  phase: 'completion_pending',
  providerFileId: identity.providerFileId,
  providerFileVersionId: identity.providerFileVersionId,
});

const verifiedState = (
  state: SourceUploadSafeOperationState,
  completion: CompleteSourceUploadResult,
): SourceUploadSafeOperationState => Object.freeze({
  ...state,
  sourceVersionId: completion.sourceVersionId,
  phase: 'verified',
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

  const complete = async (
    state: SourceUploadSafeOperationState,
  ): Promise<SourceUploadWorkflowResult> => {
    if (
      state.phase !== 'completion_pending'
      || !state.providerFileId
      || !state.providerFileVersionId
    ) {
      throw new SourceUploadWorkflowError('invalid_operation');
    }
    const current = await options.state.load(state.bookId);
    if (
      !current
      || current.phase !== 'completion_pending'
      || current.operationId !== state.operationId
      || current.reservationId !== state.reservationId
      || current.sourceVersionId !== state.sourceVersionId
      || current.providerFileId !== state.providerFileId
      || current.providerFileVersionId !== state.providerFileVersionId
      || canceledOperations.has(state.operationId)
    ) {
      throw new SourceUploadWorkflowError('invalid_operation');
    }
    const completion = await options.control.complete({
      bookId: state.bookId,
      reservationId: state.reservationId,
      providerFileId: state.providerFileId,
      providerFileVersionId: state.providerFileVersionId,
    });
    if (completion.sourceVersionId !== state.sourceVersionId) {
      throw new SourceUploadClientError('response_binding_mismatch', 502);
    }
    const next = verifiedState(state, completion);
    await options.state.save(next);
    return { state: next, completion };
  };

  const uploadAndComplete = async (
    input: StartSourceUploadInput,
    state: SourceUploadSafeOperationState,
    authority: BeginSourceUploadResult['upload'],
    attemptGeneration: number,
  ): Promise<SourceUploadWorkflowResult> => {
    let identity: SourceUploadProviderIdentity;
    try {
      identity = await upload({
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
      await options.state.save(canceled);
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
    const pending = pendingState(state, identity);
    await options.state.save(pending);
    if (isCanceled(state, attemptGeneration, input.signal)) {
      await options.state.save(Object.freeze({
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
      if (!local || local.phase !== 'cancel_requested') return local;
      try {
        const remote = await options.control.status({
          bookId,
          reservationId: local.reservationId,
        });
        if (remote.status === 'released') {
          await options.state.clear(bookId);
          return null;
        }
        if (remote.status === 'verified_completed') {
          const verified = Object.freeze({ ...local, phase: 'verified' as const });
          await options.state.save(verified);
          return verified;
        }
      } catch {
        // Offline reload keeps the safe local cleanup state visible.
      }
      return local;
    },

    async start(input) {
      if (!exactSelection(input)) throw new SourceUploadWorkflowError('stale_file');
      const existing = await options.state.load(input.bookId);
      if (existing?.phase === 'verified') {
        throw new SourceUploadWorkflowError('verified_source_exists');
      }
      if (existing) throw new SourceUploadWorkflowError('operation_exists');

      const operationId = (options.createOperationId ?? (() => crypto.randomUUID()))();
      const begin = await options.control.begin({
        bookId: input.bookId,
        operationId,
        sourceKey: input.sourceKey,
        kind: input.kind,
        inspection: input.claim,
      });
      const state = stateFromBegin(input, operationId, begin);
      await options.state.save(state);
      const attemptGeneration = nextAttemptGeneration(operationId);
      return uploadAndComplete(input, state, begin.upload, attemptGeneration);
    },

    async retryBytes(input) {
      const existing = await options.state.load(input.bookId);
      if (
        !existing
        || existing.phase !== 'reserved'
        || existing.sourceKey !== input.sourceKey
        || existing.kind !== input.kind
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
        inspection: input.claim,
      });
      if (
        begin.reservationId !== existing.reservationId
        || begin.sourceVersionId !== existing.sourceVersionId
      ) {
        throw new SourceUploadClientError('response_binding_mismatch', 502);
      }
      if (attemptGenerations.get(existing.operationId) !== attemptGeneration) {
        abort();
      }
      canceledOperations.delete(existing.operationId);
      const reserved = Object.freeze({ ...existing, phase: 'reserved' as const });
      await options.state.save(reserved);
      return uploadAndComplete(input, reserved, begin.upload, attemptGeneration);
    },

    async retryCompletion(bookId) {
      const existing = await options.state.load(bookId);
      if (!existing) throw new SourceUploadWorkflowError('invalid_operation');
      return complete(existing);
    },

    async requestCancellation(bookId) {
      const existing = await options.state.load(bookId);
      if (!existing || existing.phase === 'verified') return false;
      canceledOperations.add(existing.operationId);
      nextAttemptGeneration(existing.operationId);
      const canceled = Object.freeze({
        ...existing,
        phase: 'cancel_requested' as const,
      });
      await options.state.save(canceled);
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
      if (result.status !== 'cleanup_pending' && result.status !== 'released') {
        throw new SourceUploadClientError('invalid_response', 502);
      }
      if (result.status === 'released') await options.state.clear(bookId);
      return result.status;
    },
  };
};
