import type {
  BookRuntimeAttemptRecord,
  BookRuntimeAttemptIndexRecord,
  BookRuntimeCommandPayload,
  BookRuntimeCommandResult,
  BookRuntimeCompletionRecord,
  BookRuntimeDraftRecord,
  BookRuntimeOperationReceipt,
  BookRuntimeResultRecord,
  BookRuntimeTrustedCommandContext,
  BookRuntimeSourceProvenance,
  BookRuntimeScore,
} from '../../../../src/services/book-activity/activityRuntimeAttempt.types.ts';
import { FirebaseRtdbRestClient, type RepositoryEnv } from '../listening-authoring/rtdb.ts';

export interface BookRuntimeRepository {
  readDraft(input: {
    readonly recipientId: string;
    readonly contextId: string;
    readonly placementId: string;
    readonly interactionId: string;
  }): Promise<BookRuntimeDraftRecord | null>;
  applyCommand(input: {
    readonly command: BookRuntimeCommandPayload;
    readonly context: BookRuntimeTrustedCommandContext;
    readonly attemptId: string;
    readonly score?: BookRuntimeScore;
  }): Promise<BookRuntimeCommandResult>;
  listAttempts(input: {
    readonly recipientId: string;
    readonly contextId: string;
    readonly placementId?: string;
    readonly limit: number;
  }): Promise<readonly BookRuntimeAttemptRecord[]>;
}

export interface BookRuntimeRepositorySnapshot {
  readonly drafts?: Record<string, BookRuntimeDraftRecord>;
  readonly attempts?: Record<string, BookRuntimeAttemptRecord>;
  readonly results?: Record<string, BookRuntimeResultRecord>;
  readonly completions?: Record<string, BookRuntimeCompletionRecord>;
  readonly indexes?: Record<string, BookRuntimeAttemptIndexRecord>;
  readonly operations?: Record<string, BookRuntimeOperationReceipt>;
}

export class BookRuntimeRepositoryError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'BookRuntimeRepositoryError';
  }
}

const clone = <T>(value: T): T => structuredClone(value);

const sourceProvenance = (
  binding: BookDeliveryBinding,
  placementId: string,
): readonly BookRuntimeSourceProvenance[] => {
  const placement = binding.placements.find((entry) => entry.placementId === placementId);
  if (!placement) return [];
  return placement.sourcePageScopes.flatMap((scope) => {
    const source = binding.sourceSet.sources.find((entry) => entry.sourceKey === scope.sourceKey);
    return source ? [{
      sourceKey: source.sourceKey,
      sourceVersionId: source.sourceVersionId,
      pages: [...scope.pages],
    }] : [];
  });
};

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const hash = (value: unknown): string => {
  const text = stable(value);
  let state = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let index = 0; index < text.length; index += 1) {
    state ^= BigInt(text.charCodeAt(index));
    state = (state * prime) & 0xffffffffffffffffn;
  }
  return `fnv1a64:${state.toString(16).padStart(16, '0')}`;
};

const draftKey = (input: {
  readonly recipientId: string;
  readonly contextId: string;
  readonly placementId: string;
  readonly interactionId: string;
}): string => [
  input.recipientId,
  input.contextId,
  input.placementId,
  input.interactionId,
].join('/');

const fingerprint = (
  command: BookRuntimeCommandPayload,
  context: BookRuntimeTrustedCommandContext,
): string => hash({
  operationId: command.operationId,
  commandKind: command.commandKind,
  bindingId: command.bindingId,
  bindingRevision: command.bindingRevision,
  contextId: command.contextId,
  placementId: command.placementId,
  activityId: command.activityId,
  activityVersion: command.activityVersion,
  interactionId: command.interactionId,
  clientRevision: command.clientRevision,
  response: command.response,
  actorUid: context.actorUid,
});

export class InMemoryBookRuntimeRepository implements BookRuntimeRepository {
  private drafts: Record<string, BookRuntimeDraftRecord>;
  private attempts: Record<string, BookRuntimeAttemptRecord>;
  private results: Record<string, BookRuntimeResultRecord>;
  private completions: Record<string, BookRuntimeCompletionRecord>;
  private indexes: Record<string, BookRuntimeAttemptIndexRecord>;
  private operations: Record<string, BookRuntimeOperationReceipt>;

  constructor(initial: BookRuntimeRepositorySnapshot = {}) {
    this.drafts = clone(initial.drafts ?? {});
    this.attempts = clone(initial.attempts ?? {});
    this.results = clone(initial.results ?? {});
    this.completions = clone(initial.completions ?? {});
    this.indexes = clone(initial.indexes ?? {});
    this.operations = clone(initial.operations ?? {});
  }

  snapshot(): BookRuntimeRepositorySnapshot {
    return clone({
      drafts: this.drafts,
      attempts: this.attempts,
      results: this.results,
      completions: this.completions,
      indexes: this.indexes,
      operations: this.operations,
    });
  }

  async readDraft(input: {
    readonly recipientId: string;
    readonly contextId: string;
    readonly placementId: string;
    readonly interactionId: string;
  }): Promise<BookRuntimeDraftRecord | null> {
    return clone(this.drafts[draftKey(input)] ?? null);
  }

  async listAttempts(input: {
    readonly recipientId: string;
    readonly contextId: string;
    readonly placementId?: string;
    readonly limit: number;
  }): Promise<readonly BookRuntimeAttemptRecord[]> {
    if (!Number.isSafeInteger(input.limit) || input.limit <= 0 || input.limit > 50) {
      throw new BookRuntimeRepositoryError('runtime_attempt_query_unbounded');
    }
    return Object.values(this.attempts)
      .filter((attempt) => attempt.recipientId === input.recipientId
        && attempt.contextId === input.contextId
        && (input.placementId === undefined || attempt.placementId === input.placementId))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(0, input.limit)
      .map(clone);
  }

  async applyCommand(input: {
    readonly command: BookRuntimeCommandPayload;
    readonly context: BookRuntimeTrustedCommandContext;
    readonly attemptId: string;
    readonly score?: BookRuntimeScore;
  }): Promise<BookRuntimeCommandResult> {
    const { command, context } = input;
    const existing = this.operations[command.operationId];
    const commandFingerprint = fingerprint(command, context);
    if (existing) {
      if (existing.fingerprint !== commandFingerprint) {
        return {
          status: 'conflict',
          receipt: clone({
            ...existing,
            status: 'conflict',
          }),
        };
      }
      const replayed = clone({ ...existing, status: 'replayed' as const });
      return {
        status: 'replayed',
        draft: existing.draftRevision !== undefined
          ? Object.values(this.drafts).find((draft) =>
            draft.updatedByOperationId === existing.operationId)
          : undefined,
        attempt: existing.attemptId ? clone(this.attempts[existing.attemptId]) : undefined,
        result: existing.attemptId ? clone(this.results[`${existing.attemptId}:result`]) : undefined,
        completion: existing.attemptId
          ? clone(this.completions[`${existing.attemptId}:completion`])
          : undefined,
        index: existing.attemptId
          ? clone(this.indexes[`${existing.attemptId}:index`])
          : undefined,
        receipt: replayed,
      };
    }

    const recipientId = context.binding.recipient.recipientId;
    const base = {
      bindingId: command.bindingId,
      recipientId,
      contextId: command.contextId,
      placementId: command.placementId,
      activityId: command.activityId,
      activityVersion: command.activityVersion,
      interactionId: command.interactionId,
    } as const;
    const key = draftKey(base);
    const current = this.drafts[key];
    if ((current?.revision ?? 0) !== command.clientRevision) {
      const receipt: BookRuntimeOperationReceipt = {
        operationId: command.operationId,
        fingerprint: commandFingerprint,
        status: 'conflict',
        bindingId: command.bindingId,
        createdAt: context.now,
      };
      return { status: 'conflict', receipt };
    }

    if (command.commandKind === 'submit') {
      if (this.attempts[input.attemptId]) {
        throw new BookRuntimeRepositoryError('runtime_attempt_duplicate');
      }
      if (Object.values(this.completions).some((completion) =>
        completion.activityId === command.activityId
        && completion.activityVersion === command.activityVersion
        && completion.interactionId === command.interactionId)) {
        return {
          status: 'conflict',
          receipt: {
            operationId: command.operationId,
            fingerprint: commandFingerprint,
            status: 'conflict',
            bindingId: command.bindingId,
            createdAt: context.now,
          },
        };
      }
      const provenance = sourceProvenance(context.binding, command.placementId);
      const attempt: BookRuntimeAttemptRecord = {
        schemaVersion: 1,
        attemptId: input.attemptId,
        ...base,
        bindingRevision: command.bindingRevision,
        attemptNumber: 1,
        sourceProvenance: provenance,
        feedbackRelease: 'pending',
        response: clone(command.response),
        createdByOperationId: command.operationId,
        createdAt: context.now,
      };
      const result: BookRuntimeResultRecord = {
        schemaVersion: 1,
        resultId: `${input.attemptId}:result`,
        attemptId: input.attemptId,
        ...base,
        bindingRevision: command.bindingRevision,
        attemptNumber: 1,
        sourceProvenance: provenance,
        feedbackRelease: 'pending',
        ...(input.score ? { score: clone(input.score) } : {}),
        status: input.score?.status === 'scored' ? 'submitted' : 'pending_review',
        createdByOperationId: command.operationId,
        createdAt: context.now,
      };
      const completion: BookRuntimeCompletionRecord = {
        schemaVersion: 1,
        completionId: `${input.attemptId}:completion`,
        attemptId: input.attemptId,
        resultId: result.resultId,
        ...base,
        bindingRevision: command.bindingRevision,
        attemptNumber: 1,
        sourceProvenance: provenance,
        status: 'completed',
        createdByOperationId: command.operationId,
        createdAt: context.now,
      };
      const index: BookRuntimeAttemptIndexRecord = {
        schemaVersion: 1,
        attemptId: input.attemptId,
        resultId: result.resultId,
        ...base,
        bindingRevision: command.bindingRevision,
        attemptNumber: 1,
        createdByOperationId: command.operationId,
        createdAt: context.now,
      };
      const receipt: BookRuntimeOperationReceipt = {
        operationId: command.operationId,
        fingerprint: commandFingerprint,
        status: 'accepted',
        bindingId: command.bindingId,
        attemptId: input.attemptId,
        createdAt: context.now,
      };
      this.attempts[input.attemptId] = clone(attempt);
      this.results[result.resultId] = clone(result);
      this.completions[completion.completionId] = clone(completion);
      this.indexes[index.attemptId] = clone(index);
      this.operations[command.operationId] = clone(receipt);
      return { status: 'accepted', attempt, result, completion, index, receipt };
    }

    const draft: BookRuntimeDraftRecord = {
      schemaVersion: 1,
      ...base,
      revision: (current?.revision ?? 0) + 1,
      response: clone(command.response),
      updatedByOperationId: command.operationId,
      updatedAt: context.now,
    };
    const receipt: BookRuntimeOperationReceipt = {
      operationId: command.operationId,
      fingerprint: commandFingerprint,
      status: 'accepted',
      bindingId: command.bindingId,
      draftRevision: draft.revision,
      createdAt: context.now,
    };
    this.drafts[key] = clone(draft);
    this.operations[command.operationId] = clone(receipt);
    return { status: 'accepted', draft, receipt };
  }
}

export const BOOK_RUNTIME_ROOT = 'book_runtime';
const BOOK_RUNTIME_MAX_RETRIES = 5;
const BOOK_RUNTIME_MAX_SCOPE_BYTES = 512 * 1024;
const BOOK_RUNTIME_MAX_SCOPE_ENTRIES = 128;
const BOOK_RUNTIME_MAX_OPERATION_ENTRIES = 256;
const BOOK_RUNTIME_DEFAULT_TIMEOUT_MS = 8_000;
const BOOK_RUNTIME_PATH_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;

export interface BookRuntimeRepositoryEnv extends RepositoryEnv {
  BOOK_RUNTIME_SERVICE_IDENTITY?: string;
  BOOK_RUNTIME_GOOGLE_SA_KEY?: string;
}

interface DurableBookRuntimeScope {
  readonly draft?: BookRuntimeDraftRecord;
  readonly attempts?: Record<string, BookRuntimeAttemptRecord>;
  readonly results?: Record<string, BookRuntimeResultRecord>;
  readonly completions?: Record<string, BookRuntimeCompletionRecord>;
  readonly indexes?: Record<string, BookRuntimeAttemptIndexRecord>;
  readonly operations?: Record<string, BookRuntimeOperationReceipt>;
}

const durableClone = <T>(value: T): T => structuredClone(value);

const durablePathId = (value: string, label: string): string => {
  if (!BOOK_RUNTIME_PATH_ID.test(value)) {
    throw new BookRuntimeRepositoryError(`runtime_${label}_path_invalid`);
  }
  return value;
};

const durableScopePath = (
  recipientId: string,
  contextId: string,
  placementId: string,
  interactionId?: string,
): string => [
  BOOK_RUNTIME_ROOT,
  'scopes',
  durablePathId(recipientId, 'recipient'),
  durablePathId(contextId, 'context'),
  durablePathId(placementId, 'placement'),
  ...(interactionId === undefined ? [] : [durablePathId(interactionId, 'interaction')]),
].join('/');

const durableEncodedBytes = (value: unknown): number => {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new BookRuntimeRepositoryError('runtime_scope_unserializable');
  return new TextEncoder().encode(encoded).byteLength;
};

const durableRecord = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const durableScope = (value: unknown): DurableBookRuntimeScope => {
  if (value === null || value === undefined) return {};
  const source = durableRecord(value);
  if (!source || durableEncodedBytes(source) > BOOK_RUNTIME_MAX_SCOPE_BYTES) {
    throw new BookRuntimeRepositoryError('runtime_scope_invalid');
  }
  const allowed = new Set(['draft', 'attempts', 'results', 'completions', 'indexes', 'operations']);
  if (Object.keys(source).some((key) => !allowed.has(key))) {
    throw new BookRuntimeRepositoryError('runtime_scope_unknown_field');
  }
  for (const key of ['attempts', 'results', 'completions', 'indexes', 'operations']) {
    const valueForKey = source[key];
    if (valueForKey === undefined) continue;
    const recordForKey = durableRecord(valueForKey);
    if (!recordForKey || Object.keys(recordForKey).length > BOOK_RUNTIME_MAX_SCOPE_ENTRIES) {
      throw new BookRuntimeRepositoryError('runtime_scope_entry_limit');
    }
  }
  if (source.draft !== undefined && !durableRecord(source.draft)) {
    throw new BookRuntimeRepositoryError('runtime_draft_invalid');
  }
  return durableClone(source as DurableBookRuntimeScope);
};

const durableOperationReceipt = (
  receipt: BookRuntimeOperationReceipt,
): BookRuntimeOperationReceipt => durableClone(receipt);

const durableReplay = (
  scope: DurableBookRuntimeScope,
  operationId: string,
  commandFingerprint: string,
): BookRuntimeCommandResult | null => {
  const existing = scope.operations?.[operationId];
  if (!existing) return null;
  if (existing.fingerprint !== commandFingerprint) {
    return {
      status: 'conflict',
      receipt: durableOperationReceipt({ ...existing, status: 'conflict' }),
    };
  }
  const attempt = existing.attemptId === undefined
    ? undefined
    : Object.values(scope.attempts ?? {}).find((candidate) => candidate.attemptId === existing.attemptId);
  const result = attempt === undefined
    ? undefined
    : scope.results?.[attempt.attemptId + ':result'];
  const completion = attempt === undefined
    ? undefined
    : scope.completions?.[attempt.attemptId + ':completion'];
  const index = attempt === undefined
    ? undefined
    : scope.indexes?.[attempt.attemptId];
  return {
    status: 'replayed',
    attempt: attempt && durableClone(attempt),
    result: result && durableClone(result),
    completion: completion && durableClone(completion),
    index: index && durableClone(index),
    receipt: durableOperationReceipt({ ...existing, status: 'replayed' }),
  };
};

const durableResponseForConflict = (
  operationId: string,
  commandFingerprint: string,
  bindingId: string,
  now: string,
  draftRevision?: number,
): BookRuntimeCommandResult => ({
  status: 'conflict',
  receipt: {
    operationId,
    fingerprint: commandFingerprint,
    status: 'conflict',
    bindingId,
    ...(draftRevision === undefined ? {} : { draftRevision }),
    createdAt: now,
  },
});

export class FirebaseRestBookRuntimeRepository implements BookRuntimeRepository {
  private readonly rtdb: FirebaseRtdbRestClient;
  private readonly fetchImpl: typeof fetch;
  private readonly serviceIdentity: string;
  private readonly serviceAccountKey?: string;
  private readonly getAccessToken?: () => Promise<string>;
  private readonly maxRetries: number;

  constructor(private readonly options: {
    readonly env: BookRuntimeRepositoryEnv;
    readonly fetchImpl?: typeof fetch;
    readonly getAccessToken?: () => Promise<string>;
    readonly maxRetries?: number;
    readonly timeoutMs?: number;
  }) {
    const identity = options.env.BOOK_RUNTIME_SERVICE_IDENTITY?.trim();
    if (!identity) throw new BookRuntimeRepositoryError('missing_runtime_service_identity');
    const keyJson = options.env.BOOK_RUNTIME_GOOGLE_SA_KEY?.trim();
    if (!keyJson && !options.getAccessToken) {
      throw new BookRuntimeRepositoryError('missing_runtime_google_sa_key');
    }
    if (keyJson) {
      let clientEmail: unknown;
      try {
        clientEmail = (JSON.parse(keyJson) as Record<string, unknown>).client_email;
      } catch {
        throw new BookRuntimeRepositoryError('invalid_runtime_google_sa_key');
      }
      if (clientEmail !== identity) {
        throw new BookRuntimeRepositoryError('runtime_service_identity_mismatch');
      }
    }
    this.serviceIdentity = identity;
    this.serviceAccountKey = keyJson;
    this.getAccessToken = options.getAccessToken;
    this.maxRetries = Math.max(1, Math.min(8, options.maxRetries ?? BOOK_RUNTIME_MAX_RETRIES));
    const rawFetch = options.fetchImpl ?? globalThis.fetch;
    const timeoutMs = Math.max(500, Math.min(30_000, options.timeoutMs ?? BOOK_RUNTIME_DEFAULT_TIMEOUT_MS));
    this.fetchImpl = (async (input, init = {}) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await rawFetch.call(globalThis, input, { ...init, signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
    }) as typeof fetch;
    this.rtdb = new FirebaseRtdbRestClient({
      env: {
        ...options.env,
        GOOGLE_SA_KEY: this.serviceAccountKey,
      },
      fetchImpl: this.fetchImpl,
      getAccessToken: this.getAccessToken,
      firebaseAuthToken: Boolean(this.getAccessToken),
    });
  }

  private assertWriteIdentity(): void {
    const currentIdentity = this.options.env.BOOK_RUNTIME_SERVICE_IDENTITY?.trim();
    if (currentIdentity !== this.serviceIdentity) {
      throw new BookRuntimeRepositoryError('runtime_service_identity_changed');
    }
    if (this.serviceAccountKey) {
      let clientEmail: unknown;
      try {
        clientEmail = (JSON.parse(this.serviceAccountKey) as Record<string, unknown>).client_email;
      } catch {
        throw new BookRuntimeRepositoryError('invalid_runtime_google_sa_key');
      }
      if (clientEmail !== this.serviceIdentity) {
        throw new BookRuntimeRepositoryError('runtime_service_identity_mismatch');
      }
    }
  }

  async readDraft(input: {
    readonly recipientId: string;
    readonly contextId: string;
    readonly placementId: string;
    readonly interactionId: string;
  }): Promise<BookRuntimeDraftRecord | null> {
    const value = await this.rtdb.readValue(durableScopePath(
      input.recipientId,
      input.contextId,
      input.placementId,
      input.interactionId,
    ));
    return durableScope(value).draft
      ? durableClone(durableScope(value).draft!)
      : null;
  }

  async listAttempts(input: {
    readonly recipientId: string;
    readonly contextId: string;
    readonly placementId?: string;
    readonly limit: number;
  }): Promise<readonly BookRuntimeAttemptRecord[]> {
    if (!Number.isSafeInteger(input.limit) || input.limit <= 0 || input.limit > 50) {
      throw new BookRuntimeRepositoryError('runtime_attempt_query_unbounded');
    }
    if (!input.placementId) {
      throw new BookRuntimeRepositoryError('runtime_attempt_query_scope_required');
    }
    const value = await this.rtdb.readValue(durableScopePath(
      input.recipientId,
      input.contextId,
      input.placementId,
    ));
    const children = durableRecord(value);
    if (!children || Object.keys(children).length > BOOK_RUNTIME_MAX_SCOPE_ENTRIES) {
      throw new BookRuntimeRepositoryError('runtime_attempt_query_scope_invalid');
    }
    const attempts: BookRuntimeAttemptRecord[] = [];
    for (const child of Object.values(children)) {
      const scope = durableScope(child);
      attempts.push(...Object.values(scope.attempts ?? {}));
    }
    return attempts
      .filter((attempt) => attempt.recipientId === input.recipientId
        && attempt.contextId === input.contextId
        && attempt.placementId === input.placementId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(0, input.limit)
      .map(durableClone);
  }

  async applyCommand(input: {
    readonly command: BookRuntimeCommandPayload;
    readonly context: BookRuntimeTrustedCommandContext;
    readonly attemptId: string;
    readonly score?: BookRuntimeScore;
  }): Promise<BookRuntimeCommandResult> {
    const { command, context } = input;
    durablePathId(command.bindingId, 'binding');
    durablePathId(command.contextId, 'context');
    durablePathId(command.placementId, 'placement');
    durablePathId(command.interactionId, 'interaction');
    durablePathId(context.binding.recipient.recipientId, 'recipient');
    const path = durableScopePath(
      context.binding.recipient.recipientId,
      command.contextId,
      command.placementId,
      command.interactionId,
    );
    const commandFingerprint = fingerprint(command, context);
    for (let attemptNumber = 0; attemptNumber < this.maxRetries; attemptNumber += 1) {
      const current = await this.rtdb.readWithEtag<unknown>(path);
      const scope = durableScope(current.data);
      const replayed = durableReplay(scope, command.operationId, commandFingerprint);
      if (replayed) return replayed;
      const currentDraft = scope.draft;
      if ((currentDraft?.revision ?? 0) !== command.clientRevision) {
        return durableResponseForConflict(
          command.operationId,
          commandFingerprint,
          command.bindingId,
          context.now,
          currentDraft?.revision,
        );
      }
      const next: Record<string, unknown> = { ...scope };
      let output: BookRuntimeCommandResult;
      if (command.commandKind === 'submit') {
        if (!currentDraft) {
          return durableResponseForConflict(
            command.operationId,
            commandFingerprint,
            command.bindingId,
            context.now,
          );
        }
        if (Object.values(scope.completions ?? {}).some((completion) =>
          completion.activityId === command.activityId
          && completion.activityVersion === command.activityVersion
          && completion.interactionId === command.interactionId)) {
          return durableResponseForConflict(
            command.operationId,
            commandFingerprint,
            command.bindingId,
            context.now,
            currentDraft.revision,
          );
        }
        const attemptRecord: BookRuntimeAttemptRecord = {
          schemaVersion: 1,
          attemptId: input.attemptId,
          bindingId: command.bindingId,
          bindingRevision: command.bindingRevision,
          recipientId: context.binding.recipient.recipientId,
          contextId: command.contextId,
          placementId: command.placementId,
          activityId: command.activityId,
          activityVersion: command.activityVersion,
          interactionId: command.interactionId,
          attemptNumber: 1,
          sourceProvenance: sourceProvenance(context.binding, command.placementId),
          feedbackRelease: 'pending',
          response: durableClone(command.response),
          createdByOperationId: command.operationId,
          createdAt: context.now,
        };
        const resultRecord: BookRuntimeResultRecord = {
          schemaVersion: 1,
          resultId: `${input.attemptId}:result`,
          attemptId: input.attemptId,
          bindingId: command.bindingId,
          bindingRevision: command.bindingRevision,
          recipientId: context.binding.recipient.recipientId,
          contextId: command.contextId,
          placementId: command.placementId,
          activityId: command.activityId,
          activityVersion: command.activityVersion,
          interactionId: command.interactionId,
          attemptNumber: 1,
          sourceProvenance: sourceProvenance(context.binding, command.placementId),
          feedbackRelease: 'pending',
          ...(input.score ? { score: durableClone(input.score) } : {}),
          status: input.score?.status === 'scored' ? 'submitted' : 'pending_review',
          createdByOperationId: command.operationId,
          createdAt: context.now,
        };
        const completion: BookRuntimeCompletionRecord = {
          schemaVersion: 1,
          completionId: `${input.attemptId}:completion`,
          attemptId: input.attemptId,
          resultId: resultRecord.resultId,
          bindingId: command.bindingId,
          bindingRevision: command.bindingRevision,
          recipientId: context.binding.recipient.recipientId,
          contextId: command.contextId,
          placementId: command.placementId,
          activityId: command.activityId,
          activityVersion: command.activityVersion,
          interactionId: command.interactionId,
          attemptNumber: 1,
          sourceProvenance: sourceProvenance(context.binding, command.placementId),
          status: 'completed',
          createdByOperationId: command.operationId,
          createdAt: context.now,
        };
        const index: BookRuntimeAttemptIndexRecord = {
          schemaVersion: 1,
          attemptId: input.attemptId,
          resultId: resultRecord.resultId,
          bindingId: command.bindingId,
          bindingRevision: command.bindingRevision,
          recipientId: context.binding.recipient.recipientId,
          contextId: command.contextId,
          placementId: command.placementId,
          activityId: command.activityId,
          activityVersion: command.activityVersion,
          interactionId: command.interactionId,
          attemptNumber: 1,
          createdByOperationId: command.operationId,
          createdAt: context.now,
        };
        const operations = {
          ...(scope.operations ?? {}),
          [command.operationId]: {
            operationId: command.operationId,
            fingerprint: commandFingerprint,
            status: 'accepted' as const,
            bindingId: command.bindingId,
            attemptId: input.attemptId,
            createdAt: context.now,
          },
        };
        next.attempts = { ...(scope.attempts ?? {}), [input.attemptId]: attemptRecord };
        next.results = { ...(scope.results ?? {}), [resultRecord.resultId]: resultRecord };
        next.completions = { ...(scope.completions ?? {}), [completion.completionId]: completion };
        next.indexes = { ...(scope.indexes ?? {}), [index.attemptId]: index };
        next.operations = operations;
        output = {
          status: 'accepted',
          attempt: attemptRecord,
          result: resultRecord,
          completion,
          index,
          receipt: operations[command.operationId],
        };
      } else {
        const draft: BookRuntimeDraftRecord = {
          schemaVersion: 1,
          bindingId: command.bindingId,
          recipientId: context.binding.recipient.recipientId,
          contextId: command.contextId,
          placementId: command.placementId,
          activityId: command.activityId,
          activityVersion: command.activityVersion,
          interactionId: command.interactionId,
          revision: (currentDraft?.revision ?? 0) + 1,
          response: durableClone(command.response),
          updatedByOperationId: command.operationId,
          updatedAt: context.now,
        };
        const receipt: BookRuntimeOperationReceipt = {
          operationId: command.operationId,
          fingerprint: commandFingerprint,
          status: 'accepted',
          bindingId: command.bindingId,
          draftRevision: draft.revision,
          createdAt: context.now,
        };
        next.draft = draft;
        next.operations = { ...(scope.operations ?? {}), [command.operationId]: receipt };
        output = { status: 'accepted', draft, receipt };
      }
      const operations = next.operations as Record<string, BookRuntimeOperationReceipt>;
      if (Object.keys(operations).length > BOOK_RUNTIME_MAX_OPERATION_ENTRIES) {
        const retained = Object.entries(operations).slice(-BOOK_RUNTIME_MAX_OPERATION_ENTRIES);
        next.operations = Object.fromEntries(retained);
      }
      if (durableEncodedBytes(next) > BOOK_RUNTIME_MAX_SCOPE_BYTES) {
        throw new BookRuntimeRepositoryError('runtime_scope_capacity_exceeded');
      }
      this.assertWriteIdentity();
      if (await this.rtdb.writeIfMatch(path, next, current.etag)) return output;
    }
    throw new BookRuntimeRepositoryError('runtime_scope_cas_retries_exhausted');
  }
}
