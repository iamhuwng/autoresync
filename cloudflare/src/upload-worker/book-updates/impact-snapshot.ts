import type {
  BookImpactDiscoveryAdapterDeclaration,
  BookImpactDiscoveryContextKind,
  BookImpactDiscoveryQuery,
  BookImpactDiscoveryResult,
  BookImpactSummary,
} from '../../../../src/services/book-delivery/bookImpactDiscovery.types.ts';
import {
  BOOK_IMPACT_SNAPSHOT_CONTEXT_KINDS,
  BOOK_IMPACT_SNAPSHOT_DEFAULT_TTL_MS,
  BOOK_IMPACT_SNAPSHOT_MAX_TTL_MS,
  BOOK_IMPACT_SNAPSHOT_SCHEMA_VERSION,
  type BookImpactSnapshot,
  type BookImpactSnapshotActivityChoice,
  type BookImpactSnapshotChoice,
  type BookImpactSnapshotContext,
  type BookImpactSnapshotImmutableInputs,
  type BookImpactSnapshotReadResult,
} from '../../../../src/services/book-delivery/bookImpactSnapshot.types.ts';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const EXPECTED_KINDS = new Set<BookImpactDiscoveryContextKind>(BOOK_IMPACT_SNAPSHOT_CONTEXT_KINDS);

export type BookImpactSnapshotCreateFailureCode =
  | 'invalid-request'
  | 'missing-adapter'
  | 'duplicate-adapter'
  | 'stale-conformance'
  | 'discovery-blocked'
  | 'uncertain-discovery'
  | 'cross-owner'
  | 'duplicate-context'
  | 'persistence-failed';

export type BookImpactSnapshotCreateResult =
  | { readonly status: 'created' | 'reused'; readonly snapshot: BookImpactSnapshot }
  | { readonly status: 'blocked'; readonly code: BookImpactSnapshotCreateFailureCode };

export interface BookImpactSnapshotDiscoveryProvider {
  readonly declaration: BookImpactDiscoveryAdapterDeclaration;
  discover(query: BookImpactDiscoveryQuery): Promise<BookImpactDiscoveryResult>;
}

export interface BookImpactSnapshotRepository {
  save(snapshot: BookImpactSnapshot): Promise<{ readonly status: 'created' | 'reused'; readonly snapshot: BookImpactSnapshot }>;
  readCurrent(input: {
    readonly actorId: string;
    readonly bookId: string;
    readonly expectedFingerprint?: string;
    readonly now: string;
  }): Promise<BookImpactSnapshotReadResult>;
}

export interface BookImpactSnapshotCreateCommand {
  readonly actorId: string;
  readonly bookId: string;
  readonly immutableInputs: BookImpactSnapshotImmutableInputs;
  readonly evaluatedAt: string;
  readonly ttlMs?: number;
}

const stable = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
    .join(',')}}`;
};

const sha256 = async (value: unknown): Promise<string> => {
  const bytes = new TextEncoder().encode(stable(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const validInputs = (value: BookImpactSnapshotImmutableInputs): boolean => (
  value !== null
  && typeof value === 'object'
  && ID.test(value.oldActivityVersionId)
  && ID.test(value.newActivityVersionId)
  && [
    value.oldActivityFingerprint,
    value.newActivityFingerprint,
    value.placementFingerprint,
    value.manifestFingerprint,
    value.sourceFingerprint,
    value.scheduleFingerprint,
  ].every((fingerprint) => HASH.test(fingerprint))
);

const choicesFor = (effect: BookImpactSummary['classification']['primaryEffect']): readonly BookImpactSnapshotChoice[] => {
  switch (effect) {
    case 'unchanged': return Object.freeze(['review-only']);
    case 'display-only':
    case 'regrade':
    case 'reordered':
    case 'moved':
    case 'mapping-source-context':
      return Object.freeze(['retain-current', 'apply-without-redo']);
    case 'redo-required': return Object.freeze(['retain-current', 'apply-with-redo']);
    case 'added': return Object.freeze(['exclude-added', 'include-required']);
    case 'removed': return Object.freeze(['retain-historical', 'remove-from-current']);
    case 'successor': return Object.freeze(['retain-current', 'adopt-successor']);
    case 'invalidation': return Object.freeze(['retain-current', 'invalidate-context']);
    case 'unsupported': return Object.freeze(['retain-current']);
  }
};

const contextFor = (actorId: string, impact: BookImpactSummary): BookImpactSnapshotContext => {
  const allowedChoices = choicesFor(impact.classification.primaryEffect);
  const activityChoices: BookImpactSnapshotActivityChoice[] = impact.placements.map((placement) => ({
    activityId: placement.activityId,
    activityVersionId: placement.activityVersionId,
    placementId: placement.placementId,
    primaryEffect: impact.classification.primaryEffect,
    allowedChoices,
    selectedChoice: null,
  }));
  const started = impact.lifecycle !== 'not-started';
  const affected = impact.classification.primaryEffect !== 'unchanged';
  return {
    contextKey: `${impact.contextKind}:${impact.contextId}`,
    impact,
    updateAuthority: { ownerId: impact.ownerId, actorId, permitted: true },
    recipientScope: {
      recipientId: impact.recipientId,
      lifecycle: impact.lifecycle,
      status: impact.status,
    },
    activityChoices,
    estimatedCheckpointCount: started && impact.classification.requiresRedo ? 1 : 0,
    estimatedNotificationCount: affected ? 1 : 0,
  };
};

const validateProviders = (
  providers: readonly BookImpactSnapshotDiscoveryProvider[],
): BookImpactSnapshotCreateFailureCode | null => {
  if (providers.length !== EXPECTED_KINDS.size) return 'missing-adapter';
  const kinds = new Set<BookImpactDiscoveryContextKind>();
  const ids = new Set<string>();
  for (const { declaration } of providers) {
    if (kinds.has(declaration.contextKind) || ids.has(declaration.adapterId)) return 'duplicate-adapter';
    if (!EXPECTED_KINDS.has(declaration.contextKind)) return 'missing-adapter';
    if (declaration.conformance.status !== 'verified'
      || declaration.conformance.contractVersion !== declaration.contractVersion
      || declaration.conformance.verifiedAdapterVersion !== declaration.adapterVersion) {
      return 'stale-conformance';
    }
    kinds.add(declaration.contextKind);
    ids.add(declaration.adapterId);
  }
  return kinds.size === EXPECTED_KINDS.size ? null : 'missing-adapter';
};

export const createBookImpactSnapshotService = (options: {
  readonly providers: readonly BookImpactSnapshotDiscoveryProvider[];
  readonly repository: BookImpactSnapshotRepository;
  readonly now?: () => Date;
  readonly newId?: () => string;
}) => Object.freeze({
  async create(command: BookImpactSnapshotCreateCommand): Promise<BookImpactSnapshotCreateResult> {
    const providerFailure = validateProviders(options.providers);
    if (providerFailure) return { status: 'blocked', code: providerFailure };
    const evaluatedMs = Date.parse(command.evaluatedAt);
    const ttlMs = command.ttlMs ?? BOOK_IMPACT_SNAPSHOT_DEFAULT_TTL_MS;
    if (!ID.test(command.actorId) || !ID.test(command.bookId)
      || !validInputs(command.immutableInputs)
      || !Number.isFinite(evaluatedMs)
      || !Number.isSafeInteger(ttlMs)
      || ttlMs <= 0
      || ttlMs > BOOK_IMPACT_SNAPSHOT_MAX_TTL_MS) {
      return { status: 'blocked', code: 'invalid-request' };
    }
    let results: readonly BookImpactDiscoveryResult[];
    try {
      results = await Promise.all(options.providers.map((provider) => provider.discover({
        actorId: command.actorId,
        evaluatedAt: command.evaluatedAt,
      })));
    } catch {
      return { status: 'blocked', code: 'uncertain-discovery' };
    }
    if (results.some((result) => result.status === 'blocked')) {
      return { status: 'blocked', code: 'discovery-blocked' };
    }
    for (let index = 0; index < options.providers.length; index += 1) {
      const declaration = options.providers[index]!.declaration;
      const result = results[index]!;
      if (result.contextKind !== declaration.contextKind
        || result.adapterId !== declaration.adapterId
        || result.adapterVersion !== declaration.adapterVersion
        || result.contractVersion !== declaration.contractVersion) {
        return { status: 'blocked', code: 'stale-conformance' };
      }
    }
    const impacts = results.flatMap((result) => result.status === 'ok'
      ? result.impacts.filter((impact) => impact.bookId === command.bookId)
      : []);
    if (impacts.some((impact) => impact.ownerId !== command.actorId)) {
      return { status: 'blocked', code: 'cross-owner' };
    }
    const contextKeys = new Set<string>();
    const contexts: BookImpactSnapshotContext[] = [];
    for (const impact of impacts) {
      const context = contextFor(command.actorId, impact);
      if (contextKeys.has(context.contextKey)) {
        return { status: 'blocked', code: 'duplicate-context' };
      }
      contextKeys.add(context.contextKey);
      contexts.push(context);
    }
    contexts.sort((left, right) => left.contextKey.localeCompare(right.contextKey));
    const adapters = options.providers.map(({ declaration }) => ({
      adapterId: declaration.adapterId,
      adapterVersion: declaration.adapterVersion,
      contextKind: declaration.contextKind,
      contractVersion: declaration.contractVersion,
    })).sort((left, right) => left.contextKind.localeCompare(right.contextKind));
    const inputFingerprint = await sha256({
      actorId: command.actorId,
      bookId: command.bookId,
      immutableInputs: command.immutableInputs,
      adapters,
      results,
    });
    const createdAt = (options.now?.() ?? new Date(evaluatedMs)).toISOString();
    const snapshot: BookImpactSnapshot = Object.freeze({
      schemaVersion: BOOK_IMPACT_SNAPSHOT_SCHEMA_VERSION,
      snapshotId: options.newId?.() ?? crypto.randomUUID(),
      actorId: command.actorId,
      ownerId: command.actorId,
      bookId: command.bookId,
      inputFingerprint,
      immutableInputs: structuredClone(command.immutableInputs),
      adapters: Object.freeze(adapters),
      contexts: Object.freeze(contexts),
      createdAt,
      expiresAt: new Date(Date.parse(createdAt) + ttlMs).toISOString(),
      recovery: Object.freeze({
        backupInventory: 'include-metadata',
        restoreBehavior: 'retain-read-only',
        expiryBehavior: 'retain-audit-deny-reuse',
        sideEffectsOnReplay: 'none',
        recoveryLedgerRoot: 'book_impact_snapshot_recovery',
      }),
    });
    try {
      const saved = await options.repository.save(snapshot);
      return { status: saved.status, snapshot: saved.snapshot };
    } catch {
      return { status: 'blocked', code: 'persistence-failed' };
    }
  },
});
