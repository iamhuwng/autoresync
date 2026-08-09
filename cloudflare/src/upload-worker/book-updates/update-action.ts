import type { BookImpactSnapshotRepository } from './impact-snapshot.ts';
import type { BookImpactSnapshot, BookImpactSnapshotContext } from '../../../../src/services/book-delivery/bookImpactSnapshot.types.ts';
import {
  BOOK_UPDATE_ACTION_MAX_REASON_LENGTH,
  BOOK_UPDATE_ACTION_MAX_SELECTIONS,
  BOOK_UPDATE_ACTION_SCHEMA_VERSION,
  isBookUpdateActionTerminal,
  type BookUpdateActionAcceptResult,
  type BookUpdateActionCommand,
  type BookUpdateActionRecord,
  type BookUpdateActionSelection,
  type BookUpdateActionState,
} from '../../../../src/services/book-delivery/bookUpdateAction.types.ts';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/u;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const FAILURE_CODE = /^[a-z0-9][a-z0-9_-]{0,63}$/u;

export interface BookUpdateActionRepository {
  accept(action: BookUpdateActionRecord): Promise<
    | { readonly status: 'accepted' | 'replayed'; readonly action: BookUpdateActionRecord }
    | { readonly status: 'conflict' }
  >;
  findByIdempotency(ownerId: string, idempotencyKey: string): Promise<BookUpdateActionRecord | null>;
  read(ownerId: string, actionId: string): Promise<BookUpdateActionRecord | null>;
  transition(input: {
    readonly ownerId: string;
    readonly actionId: string;
    readonly expectedState: BookUpdateActionState;
    readonly expectedRevision: number;
    readonly nextState: BookUpdateActionState;
    readonly at: string;
    readonly terminalFailureCode?: string;
  }): Promise<{ readonly status: 'advanced' | 'conflict' | 'missing'; readonly action?: BookUpdateActionRecord }>;
}

const transitions = {
  accepted: ['applying', 'compensating', 'terminal-failure'],
  applying: ['committed', 'compensating', 'terminal-failure'],
  committed: ['notification-pending', 'completed', 'compensating', 'terminal-failure'],
  'notification-pending': ['completed', 'compensating', 'terminal-failure'],
  completed: [],
  compensating: ['compensated', 'terminal-failure'],
  compensated: [],
  'terminal-failure': [],
} as const satisfies Readonly<Record<BookUpdateActionState, readonly BookUpdateActionState[]>>;

export const isLegalBookUpdateActionTransition = (
  from: BookUpdateActionState,
  to: BookUpdateActionState,
): boolean => (transitions[from] as readonly BookUpdateActionState[]).includes(to);

const stable = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
    .join(',')}}`;
};

const sha256 = async (value: unknown): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const selectionKey = (selection: Pick<BookUpdateActionSelection, 'contextKey' | 'placementId'>): string => (
  `${selection.contextKey}\u0000${selection.placementId}`
);

const contextSelectionMap = (snapshot: BookImpactSnapshot): Map<string, {
  readonly context: BookImpactSnapshotContext;
  readonly choices: readonly string[];
}> => {
  const map = new Map<string, { context: BookImpactSnapshotContext; choices: readonly string[] }>();
  for (const context of snapshot.contexts) {
    for (const activity of context.activityChoices) {
      map.set(selectionKey({ contextKey: context.contextKey, placementId: activity.placementId }), {
        context,
        choices: activity.allowedChoices,
      });
    }
  }
  return map;
};

const validSelection = (selection: BookUpdateActionSelection): boolean => (
  selection !== null
  && typeof selection === 'object'
  && ID.test(selection.contextKey)
  && ID.test(selection.placementId)
  && typeof selection.choice === 'string'
  && (selection.replacementDeadline === undefined
    || (typeof selection.replacementDeadline === 'string'
      && Number.isFinite(Date.parse(selection.replacementDeadline))))
);

const normalizeSelections = (
  selections: readonly BookUpdateActionSelection[],
): readonly BookUpdateActionSelection[] | null => {
  if (!Array.isArray(selections)
    || selections.length === 0
    || selections.length > BOOK_UPDATE_ACTION_MAX_SELECTIONS) return null;
  const normalized: BookUpdateActionSelection[] = [];
  const seen = new Set<string>();
  for (const selection of selections) {
    if (!validSelection(selection)) return null;
    const key = selectionKey(selection);
    if (seen.has(key)) return null;
    seen.add(key);
    normalized.push(Object.freeze({
      contextKey: selection.contextKey,
      placementId: selection.placementId,
      choice: selection.choice,
      ...(selection.replacementDeadline ? { replacementDeadline: selection.replacementDeadline } : {}),
    }));
  }
  normalized.sort((left, right) => selectionKey(left).localeCompare(selectionKey(right)));
  return Object.freeze(normalized);
};

const validateSelections = (
  command: BookUpdateActionCommand,
  snapshot: BookImpactSnapshot,
  now: string,
): { readonly selections: readonly BookUpdateActionSelection[]; readonly contexts: readonly BookImpactSnapshotContext[] } | null => {
  const available = contextSelectionMap(snapshot);
  const declaredTargetCount = snapshot.contexts.reduce(
    (count, context) => count + context.activityChoices.length,
    0,
  );
  if (available.size !== declaredTargetCount) return null;
  const contexts = new Map<string, BookImpactSnapshotContext>();
  const selections: BookUpdateActionSelection[] = [];
  for (const selection of command.selections) {
    const key = selectionKey(selection);
    const target = available.get(key);
    if (!target || !target.choices.includes(selection.choice)) return null;
    if (selection.replacementDeadline !== undefined && selection.choice !== 'include-required') return null;
    if (target.context.updateAuthority.ownerId !== command.actorId
      || target.context.updateAuthority.actorId !== command.actorId
      || !target.context.updateAuthority.permitted) return null;
    const requiresReplacementDeadline = selection.choice === 'include-required'
      && target.context.impact.effectiveWindow?.dueAt !== null
      && target.context.impact.effectiveWindow?.dueAt !== undefined
      && Date.parse(target.context.impact.effectiveWindow.dueAt) <= Date.parse(now);
    if (requiresReplacementDeadline
      && (selection.replacementDeadline === undefined
        || Date.parse(selection.replacementDeadline) <= Date.parse(now))) return null;
    contexts.set(target.context.contextKey, target.context);
    selections.push(selection);
  }
  selections.sort((left, right) => selectionKey(left).localeCompare(selectionKey(right)));
  return { selections: Object.freeze(selections), contexts: Object.freeze([...contexts.values()]) };
};

export const createBookUpdateActionService = (options: {
  readonly snapshots: BookImpactSnapshotRepository;
  readonly actions: BookUpdateActionRepository;
  readonly now?: () => Date;
  readonly newId?: () => string;
}) => Object.freeze({
  async accept(command: BookUpdateActionCommand): Promise<BookUpdateActionAcceptResult> {
    const now = (options.now?.() ?? new Date()).toISOString();
    if (!ID.test(command.actorId)
      || !ID.test(command.bookId)
      || !ID.test(command.snapshotId)
      || !HASH.test(command.snapshotFingerprint)
      || !IDEMPOTENCY_KEY.test(command.idempotencyKey)
      || typeof command.reason !== 'string'
      || command.reason.trim().length === 0
      || command.reason.length > BOOK_UPDATE_ACTION_MAX_REASON_LENGTH) {
      return { status: 'blocked', code: 'invalid-request' };
    }
    const normalizedSelections = normalizeSelections(command.selections);
    if (!normalizedSelections) return { status: 'blocked', code: 'invalid-selection' };
    const requestFingerprint = await sha256({
      actorId: command.actorId,
      bookId: command.bookId,
      snapshotId: command.snapshotId,
      snapshotFingerprint: command.snapshotFingerprint,
      idempotencyKey: command.idempotencyKey,
      reason: command.reason.trim(),
      selections: normalizedSelections,
    });
    try {
      const existing = await options.actions.findByIdempotency(command.actorId, command.idempotencyKey);
      if (existing) {
        return existing.requestFingerprint === requestFingerprint
          && existing.actorId === command.actorId
          && existing.ownerId === command.actorId
          && existing.bookId === command.bookId
          && existing.snapshotId === command.snapshotId
          ? { status: 'replayed', action: existing }
          : { status: 'blocked', code: 'idempotency-conflict' };
      }
    } catch {
      return { status: 'blocked', code: 'persistence-failed' };
    }
    let snapshotResult;
    try {
      snapshotResult = await options.snapshots.readCurrent({
        actorId: command.actorId,
        bookId: command.bookId,
        expectedFingerprint: command.snapshotFingerprint,
        now,
      });
    } catch {
      return { status: 'blocked', code: 'snapshot-unavailable' };
    }
    if (snapshotResult.status !== 'ready') {
      return { status: 'blocked', code: `snapshot-${snapshotResult.status}` };
    }
    const snapshot = snapshotResult.snapshot;
    if (snapshot.snapshotId !== command.snapshotId
      || snapshot.actorId !== command.actorId
      || snapshot.ownerId !== command.actorId
      || snapshot.bookId !== command.bookId) {
      return { status: 'blocked', code: 'snapshot-stale' };
    }
    const validated = validateSelections({ ...command, selections: normalizedSelections }, snapshot, now);
    if (!validated) return { status: 'blocked', code: 'invalid-selection' };
    const selectedContextKeys = validated.contexts.map((context) => context.contextKey).sort();
    const classifications = [...new Set(validated.contexts.map(
      (context) => context.impact.classification.primaryEffect,
    ))].sort();
    const actionId = options.newId?.() ?? crypto.randomUUID();
    if (!ID.test(actionId)) return { status: 'blocked', code: 'invalid-action-id' };
    const terminalStatus = null;
    const action: BookUpdateActionRecord = Object.freeze({
      schemaVersion: BOOK_UPDATE_ACTION_SCHEMA_VERSION,
      actionId,
      actorId: command.actorId,
      ownerId: command.actorId,
      bookId: command.bookId,
      snapshotId: command.snapshotId,
      snapshotFingerprint: command.snapshotFingerprint,
      idempotencyKey: command.idempotencyKey,
      requestFingerprint,
      reason: command.reason.trim(),
      selections: validated.selections,
      state: 'accepted',
      stateRevision: 0,
      acceptedAt: now,
      updatedAt: now,
      terminalFailureCode: null,
      audit: Object.freeze({
        actorId: command.actorId,
        acceptedAt: now,
        reason: command.reason.trim(),
        bookId: command.bookId,
        oldActivityVersionId: snapshot.immutableInputs.oldActivityVersionId,
        newActivityVersionId: snapshot.immutableInputs.newActivityVersionId,
        selectedContextKeys: Object.freeze(selectedContextKeys),
        classifications: Object.freeze(classifications),
        affectedCount: validated.contexts.length,
        checkpointCount: validated.contexts.reduce((sum, context) => sum + context.estimatedCheckpointCount, 0),
        regradeCount: validated.contexts.filter(
          (context) => context.impact.classification.requiresRegrade,
        ).length,
        notificationCount: validated.contexts.reduce(
          (sum, context) => sum + context.estimatedNotificationCount,
          0,
        ),
        terminalStatus,
        terminalAt: null,
      }),
      recovery: Object.freeze({
        restoreBehavior: 'resume-or-compensate',
        replaySideEffects: 'none',
        recoveryLedgerRoot: 'book_update_action_recovery',
      }),
    });
    try {
      const accepted = await options.actions.accept(action);
      if (accepted.status === 'conflict') return { status: 'blocked', code: 'idempotency-conflict' };
      return accepted;
    } catch {
      return { status: 'blocked', code: 'persistence-failed' };
    }
  },
});

export const advanceBookUpdateAction = async (options: {
  readonly repository: BookUpdateActionRepository;
  readonly ownerId: string;
  readonly actionId: string;
  readonly expectedState: BookUpdateActionState;
  readonly expectedRevision: number;
  readonly nextState: BookUpdateActionState;
  readonly at: string;
  readonly terminalFailureCode?: string;
}) => {
  if (!ID.test(options.ownerId)
    || !ID.test(options.actionId)
    || !Number.isSafeInteger(options.expectedRevision)
    || options.expectedRevision < 0
    || !Number.isFinite(Date.parse(options.at))
    || !isLegalBookUpdateActionTransition(options.expectedState, options.nextState)
    || (options.nextState === 'terminal-failure'
      ? !options.terminalFailureCode || !FAILURE_CODE.test(options.terminalFailureCode)
      : options.terminalFailureCode !== undefined)) {
    return { status: 'blocked', code: 'invalid-transition' } as const;
  }
  return options.repository.transition(options);
};

export const transitionBookUpdateActionRecord = (
  action: BookUpdateActionRecord,
  nextState: BookUpdateActionState,
  at: string,
  terminalFailureCode?: string,
): BookUpdateActionRecord => {
  if (!isLegalBookUpdateActionTransition(action.state, nextState)
    || !Number.isFinite(Date.parse(at))
    || Date.parse(at) < Date.parse(action.updatedAt)
    || (nextState === 'terminal-failure'
      ? !terminalFailureCode || !FAILURE_CODE.test(terminalFailureCode)
      : terminalFailureCode !== undefined)) {
    throw new Error('illegal_book_update_action_transition');
  }
  const terminal = isBookUpdateActionTerminal(nextState);
  return structuredClone({
    ...action,
    state: nextState,
    stateRevision: action.stateRevision + 1,
    updatedAt: at,
    terminalFailureCode: nextState === 'terminal-failure' ? terminalFailureCode ?? null : null,
    audit: {
      ...action.audit,
      terminalStatus: terminal ? nextState : null,
      terminalAt: terminal ? at : null,
    },
  });
};
