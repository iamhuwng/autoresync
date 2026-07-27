import type {
  BookRuntimeAttemptRecord,
  BookRuntimeCommandPayload,
  BookRuntimeCommandResult,
  BookRuntimeDraftRecord,
  BookRuntimeOperationReceipt,
  BookRuntimeResultRecord,
  BookRuntimeTrustedCommandContext,
} from '../../../../src/services/book-activity/activityRuntimeAttempt.types.ts';

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
  readonly operations?: Record<string, BookRuntimeOperationReceipt>;
}

export class BookRuntimeRepositoryError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'BookRuntimeRepositoryError';
  }
}

const clone = <T>(value: T): T => structuredClone(value);

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
  private operations: Record<string, BookRuntimeOperationReceipt>;

  constructor(initial: BookRuntimeRepositorySnapshot = {}) {
    this.drafts = clone(initial.drafts ?? {});
    this.attempts = clone(initial.attempts ?? {});
    this.results = clone(initial.results ?? {});
    this.operations = clone(initial.operations ?? {});
  }

  snapshot(): BookRuntimeRepositorySnapshot {
    return clone({
      drafts: this.drafts,
      attempts: this.attempts,
      results: this.results,
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
      const attempt: BookRuntimeAttemptRecord = {
        schemaVersion: 1,
        attemptId: input.attemptId,
        ...base,
        response: clone(command.response),
        createdByOperationId: command.operationId,
        createdAt: context.now,
      };
      const result: BookRuntimeResultRecord = {
        schemaVersion: 1,
        resultId: `${input.attemptId}:result`,
        attemptId: input.attemptId,
        ...base,
        status: 'pending_review',
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
      this.operations[command.operationId] = clone(receipt);
      return { status: 'accepted', attempt, result, receipt };
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
