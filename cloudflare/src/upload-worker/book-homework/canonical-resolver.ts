import type { BookAssemblyPublicationResult } from '../../../../src/services/book-assembly/publicationTransaction.service.ts';
import type { BookAssemblyPublicationScope as AssemblyScope } from '../../../../src/services/book-assembly/publicationRepository.ts';
import {
  assertPublishedBookDeliveryPublication,
  type BookDeliveryPublishedPublicationReference,
} from '../../../../src/services/book-delivery/bookDelivery.publication.ts';
import type {
  BookDeliveryPlacement,
  BookRuntimeDeliveryActivityProjection,
  BookRuntimeDeliveryProjection,
} from '../../../../src/services/book-delivery/bookDelivery.types.ts';
import {
  createBookHomeworkManifest,
  assertValidBookHomeworkManifest,
} from '../../../../src/services/book-homework/bookHomeworkManifest.service.ts';
import { validateBookHomeworkSchedule } from '../../../../src/services/book-homework/bookHomeworkSchedule.service.ts';
import type {
  BookHomeworkAuthoritySchedule,
} from '../../../../src/services/book-homework/bookHomeworkAuthority.types.ts';
import type {
  BookHomeworkSagaActivityPolicyIntent,
  BookHomeworkSagaAssignmentTargetIntent,
  BookHomeworkSagaCanonicalState,
  BookHomeworkSagaCommand,
  BookHomeworkSagaNodeOverrideIntent,
  BookHomeworkSagaStudentExtensionIntent,
} from '../../../../src/services/book-homework/bookHomeworkSaga.types.ts';
import type { BookHomeworkManifest, BookHomeworkSelectionTarget } from '../../../../src/types/homework.types.ts';
import { createTrustedBookDeliveryPublication } from '../book-delivery/worker.ts';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u;
const MAX_RECIPIENTS = 30;
const MAX_NODE_OVERRIDES = 256;
const MAX_STUDENT_EXTENSIONS = MAX_RECIPIENTS * MAX_NODE_OVERRIDES;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const VALID_FEEDBACK_RELEASES = new Set([
  'immediate', 'after_completion', 'after_deadline', 'never', 'manual',
]);

/** A deliberately small class snapshot port. The Worker owns authentication; this port owns class authority. */
export interface BookHomeworkClassMember {
  readonly studentId?: string;
  readonly id?: string;
  readonly uid?: string;
  readonly status?: string;
  readonly active?: boolean;
}

export interface BookHomeworkClassSnapshot {
  readonly classId?: string;
  readonly ownerId?: string;
  readonly createdBy?: string;
  readonly createdByUserId?: string;
  readonly teacherId?: string;
  readonly status: string;
  readonly members?: readonly BookHomeworkClassMember[] | Readonly<Record<string, BookHomeworkClassMember>>;
  readonly students?: readonly BookHomeworkClassMember[] | Readonly<Record<string, BookHomeworkClassMember>>;
}

export interface BookHomeworkClassReader {
  readClass(classId: string): Promise<BookHomeworkClassSnapshot | null>;
}

export interface BookHomeworkTrustedPublicationLoaderInput {
  readonly command: BookHomeworkSagaCommand;
  readonly recipientId: string;
  readonly scope?: AssemblyScope<BookAssemblyPublicationResult>;
}

export interface BookHomeworkCanonicalResolverOptions {
  /** A repository-backed scope reader. It is used with createTrustedBookDeliveryPublication. */
  readonly readPublicationScope?: (
    bookId: string,
  ) => Promise<AssemblyScope<BookAssemblyPublicationResult>>;
  /** Optional already trusted loader. Its return value is still structurally validated here. */
  readonly loadTrustedPublication?: (
    input: BookHomeworkTrustedPublicationLoaderInput,
  ) => Promise<BookDeliveryPublishedPublicationReference>;
  /** Alias retained for adapters that already call their publication loader loadPublication. */
  readonly loadPublication?: (
    input: BookHomeworkTrustedPublicationLoaderInput,
  ) => Promise<BookDeliveryPublishedPublicationReference>;
  readonly classReader: BookHomeworkClassReader | ((classId: string) => Promise<BookHomeworkClassSnapshot | null>);
  /** First assignment authority revision. A repository may inject a different deterministic revision. */
  readonly manifestBindingRevision?: number;
  /** Injected for tests and for a Worker clock; command.createdAt remains the assignment timestamp. */
  readonly now?: () => string;
  /** Stable output is intentionally injectable so a deployment can use its existing fingerprint primitive. */
  readonly fingerprint?: (value: unknown) => string;
}

export type BookHomeworkCanonicalResolverCode =
  | 'invalid-command'
  | 'invalid-publication'
  | 'invalid-target'
  | 'invalid-schedule'
  | 'invalid-policy'
  | 'invalid-extension'
  | 'class-not-found'
  | 'class-forbidden'
  | 'class-inactive'
  | 'unauthorized-recipient'
  | 'stale-publication'
  | 'stale-input'
  | 'stale-policy'
  | 'not-ready';

export class BookHomeworkCanonicalResolverError extends Error {
  constructor(
    readonly code: BookHomeworkCanonicalResolverCode,
    message: string,
    readonly status = code === 'class-forbidden' || code === 'unauthorized-recipient' ? 403 : 409,
  ) {
    super(message);
    this.name = 'BookHomeworkCanonicalResolverError';
  }
}

const fail = (
  code: BookHomeworkCanonicalResolverCode,
  message: string,
): never => { throw new BookHomeworkCanonicalResolverError(code, message); };

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
);

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  if (typeof value === 'undefined') return 'undefined';
  return JSON.stringify(value);
};

export const canonicalStableFingerprint = (value: unknown): string => stable(value);

const id = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !ID.test(value)) fail('invalid-command', `${label} is invalid.`);
  return value as string;
};

const iso = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !ISO.test(value) || new Date(value).toISOString() !== value) {
    fail('invalid-command', `${label} must be an ISO UTC timestamp.`);
  }
  return value as string;
};

const exactKeys = (value: unknown, allowed: readonly string[], label: string): void => {
  if (!isRecord(value)) fail('invalid-command', `${label} must be a plain object.`);
  const keys = Reflect.ownKeys(value as object);
  if (keys.some((key) => typeof key !== 'string' || !allowed.includes(key))) {
    fail('invalid-command', `${label} contains unsupported fields.`);
  }
};

const sortedUnique = (values: readonly string[], label: string, max: number): readonly string[] => {
  if (!Array.isArray(values) || values.length < 1 || values.length > max) {
    fail('invalid-command', `${label} must contain 1-${max} entries.`);
  }
  const result = values.map((value) => id(value, `${label} entry`)).sort();
  if (new Set(result).size !== result.length) fail('invalid-command', `${label} contains duplicates.`);
  return result;
};

const clone = <T>(value: T): T => structuredClone(value);

const publicationFingerprintInput = (publication: BookDeliveryPublishedPublicationReference): unknown => ({
  bookId: publication.bookId,
  bookMode: publication.bookMode,
  bookRevision: publication.bookRevision,
  manifestVersionId: publication.manifestVersionId,
  publicationId: publication.publicationId,
  publicationRevision: publication.publicationRevision,
  publicationStatus: publication.publicationStatus,
  ownerId: publication.ownerId,
  scope: publication.scope,
  outline: publication.outline,
  sourceSet: publication.sourceSet,
  placements: publication.placements,
  schedulePolicy: publication.schedulePolicy,
});

/** Exported so command adapters can construct the same optimistic publication pin. */
export const fingerprintBookHomeworkPublication = (
  publication: BookDeliveryPublishedPublicationReference,
  fingerprint: (value: unknown) => string = stable,
): string => fingerprint(publicationFingerprintInput(publication));

const normalizeMemberEntries = (
  source: readonly BookHomeworkClassMember[] | Readonly<Record<string, BookHomeworkClassMember>> | undefined,
): readonly [string, BookHomeworkClassMember][] => {
  if (source === undefined) return [];
  if (Array.isArray(source)) {
    return source.map((member, index) => {
      if (!isRecord(member)) fail('class-forbidden', `Class member ${index} is invalid.`);
      const memberId = member.studentId ?? member.id ?? member.uid;
      return [id(memberId, `Class member ${index}`), member] as const;
    });
  }
  return Object.entries(source).map(([key, member]) => {
    if (!isRecord(member)) fail('class-forbidden', `Class member ${key} is invalid.`);
    return [id(member.studentId ?? member.id ?? member.uid ?? key, `Class member ${key}`), member] as const;
  });
};

const isActiveMember = (member: BookHomeworkClassMember): boolean => (
  member.active !== false && (member.status === undefined || member.status === 'active')
);

const readClass = async (
  reader: BookHomeworkCanonicalResolverOptions['classReader'],
  classId: string,
): Promise<BookHomeworkClassSnapshot | null> => (
  typeof reader === 'function' ? reader(classId) : reader.readClass(classId)
);

const targetWithoutClass = (
  target: BookHomeworkSagaAssignmentTargetIntent,
): BookHomeworkSelectionTarget => {
  exactKeys(target, ['bookId', 'classId', 'kind', 'nodeKey', 'activityId', 'placementId'], 'intent.target');
  id(target.bookId, 'intent.target.bookId');
  id(target.classId, 'intent.target.classId');
  if (target.kind === 'book') {
    if ('nodeKey' in target || 'activityId' in target || 'placementId' in target) {
      fail('invalid-target', 'Book target contains an Activity or node field.');
    }
    return { kind: 'book', bookId: target.bookId };
  }
  if (target.kind === 'activity') {
    id(target.activityId, 'intent.target.activityId');
    if ('nodeKey' in target) fail('invalid-target', 'Activity target contains a node field.');
    if ('placementId' in target && target.placementId !== undefined) id(target.placementId, 'intent.target.placementId');
    return target.placementId === undefined
      ? { kind: 'activity', bookId: target.bookId, activityId: target.activityId }
      : { kind: 'activity', bookId: target.bookId, activityId: target.activityId, placementId: target.placementId };
  }
  if (!['section', 'chapter', 'unit', 'test'].includes(target.kind)) fail('invalid-target', 'Target kind is unsupported.');
  id(target.nodeKey, 'intent.target.nodeKey');
  if ('activityId' in target || 'placementId' in target) fail('invalid-target', 'Structural target contains an Activity field.');
  return { kind: target.kind, bookId: target.bookId, nodeKey: target.nodeKey };
};

const expectedPublication = (command: BookHomeworkSagaCommand): void => {
  exactKeys(command.intent.expectedPublication, ['publicationId', 'publicationRevision', 'manifestVersionId'], 'intent.expectedPublication');
  id(command.intent.expectedPublication.publicationId, 'intent.expectedPublication.publicationId');
  id(command.intent.expectedPublication.manifestVersionId, 'intent.expectedPublication.manifestVersionId');
  if (!Number.isSafeInteger(command.intent.expectedPublication.publicationRevision)
    || command.intent.expectedPublication.publicationRevision <= 0) {
    fail('invalid-command', 'intent.expectedPublication.publicationRevision is invalid.');
  }
  if (command.intent.expectedPublication.manifestVersionId !== command.manifestVersionId) {
    fail('stale-publication', 'Command manifest version and expected publication manifest differ.');
  }
};

const assertCommand = (command: BookHomeworkSagaCommand): readonly string[] => {
  if (!isRecord(command)) fail('invalid-command', 'Command must be a plain object.');
  id(command.assignmentId, 'assignmentId');
  id(command.ownerId, 'ownerId');
  id(command.manifestVersionId, 'manifestVersionId');
  id(command.idempotencyKey, 'idempotencyKey');
  id(command.operationId, 'operationId');
  iso(command.createdAt, 'createdAt');
  if (!isRecord(command.intent)) fail('invalid-command', 'Command intent is required.');
  id(command.intent.bookId, 'intent.bookId');
  const selected = sortedUnique(command.selectedRecipientIds, 'selectedRecipientIds', MAX_RECIPIENTS);
  expectedPublication(command);
  if (command.intent.expectedPublication.publicationId.length === 0) fail('invalid-command', 'Publication identity is empty.');
  return selected;
};

const targetSelectionForScope = (
  target: BookHomeworkSelectionTarget,
  scope: AssemblyScope<BookAssemblyPublicationResult>,
  expected: BookHomeworkSagaCommand['intent']['expectedPublication'],
): { kind: 'subtree' | 'placements'; nodeKeys: readonly string[]; placementIds: readonly string[] } => {
  const current = scope.current;
  if (!current
    || current.publicationId !== expected.publicationId
    || current.publicationRevision !== expected.publicationRevision
    || current.manifestVersionId !== expected.manifestVersionId) {
    fail('stale-publication', 'Published Assembly pointer no longer matches the command.');
  }
  const version = scope.versions?.[expected.manifestVersionId];
  if (!version || version.lifecycle !== 'published' || version.bookId !== target.bookId) {
    fail('stale-publication', 'Published Assembly version is unavailable or stale.');
  }
  const publishedVersion = version as NonNullable<typeof version>;
  if (target.kind === 'activity') {
    const candidates = Object.values(scope.placements ?? {}).filter((placement) => (
      placement.bookId === target.bookId
      && placement.manifestVersionId === expected.manifestVersionId
      && placement.publicationId === expected.publicationId
      && placement.publicationRevision === expected.publicationRevision
      && placement.activityId === target.activityId
      && (target.placementId === undefined || placement.placementId === target.placementId)
    ));
    if (candidates.length !== 1) fail('invalid-target', 'Activity target does not resolve exactly one published Placement.');
    return { kind: 'placements', nodeKeys: [], placementIds: [candidates[0]!.placementId] };
  }
  if (target.kind === 'book') {
    const nodes = publishedVersion.manifest.nodes.map((node) => node.nodeKey);
    if (nodes.length === 0) fail('invalid-target', 'Book target has no published structural nodes.');
    return { kind: 'subtree', nodeKeys: nodes, placementIds: [] };
  }
  if (!publishedVersion.manifest.nodes.some((node) => node.nodeKey === target.nodeKey && node.nodeType === target.kind)) {
    fail('invalid-target', 'Structural target is not present in the published manifest.');
  }
  return { kind: 'subtree', nodeKeys: [target.nodeKey], placementIds: [] };
};

const createProjection = (
  publication: BookDeliveryPublishedPublicationReference,
  assignmentId: string,
  recipientId: string,
): BookRuntimeDeliveryProjection => {
  const bindingId = `book-homework-publication-${assignmentId}`;
  const sourceByKey = new Map(publication.sourceSet.sources.map((source) => [source.sourceKey, source]));
  const contextDescription = (placement: BookDeliveryPlacement): string => placement.sourcePageScopes.map((scope) => {
    const source = sourceByKey.get(scope.sourceKey);
    const label = publication.sourceSet.strategy === 'component_pdfs' ? `component ${scope.sourceKey}` : `PDF ${scope.sourceKey}`;
    return `${label} pages ${scope.pages.join(', ')}` + (source?.ownerNodeKey ? ` owned by ${source.ownerNodeKey}` : '');
  }).join('; ') || 'No source context required.';
  const activities: readonly BookRuntimeDeliveryActivityProjection[] = publication.placements.map((placement) => {
    const sourcesReady = placement.sourcePageScopes.every((scope) => {
      const source = sourceByKey.get(scope.sourceKey);
      return source?.lifecycle === 'verified-usable'
        && scope.pages.length > 0
        && scope.pages.every((page) => Number.isSafeInteger(page) && page > 0);
    });
    const contextFree = placement.contextMode === 'none';
    return {
      placementId: placement.placementId,
      activityId: placement.activityId,
      activityVersionId: placement.activityVersionId,
      activityVersion: placement.activityVersion,
      nodeKey: placement.nodeKey,
      order: placement.order,
      contextMode: placement.contextMode,
      sourceContext: {
        available: contextFree ? false : sourcesReady,
        description: contextDescription(placement),
        pageGroupKeys: contextFree ? [] : placement.pageGroupKeys,
        sourcePageScopes: contextFree ? [] : placement.sourcePageScopes,
      },
    };
  });
  return {
    schemaVersion: 1,
    projectionKind: 'book-runtime-delivery',
    bindingId,
    bindingRevision: 1,
    recipientId,
    context: { contextId: assignmentId, kind: 'homework', entitlementBasis: 'assignment' },
    book: {
      bookId: publication.bookId,
      bookMode: publication.bookMode,
      bookRevision: publication.bookRevision,
      manifestVersionId: publication.manifestVersionId,
      publicationId: publication.publicationId,
      publicationRevision: publication.publicationRevision,
      publicationStatus: publication.publicationStatus,
    },
    scope: clone(publication.scope),
    outline: clone(publication.outline),
    sourceSet: clone(publication.sourceSet),
    documentRequests: publication.sourceSet.sources.map((source) => ({
      sourceKey: source.sourceKey,
      sourceVersionId: source.sourceVersionId,
      opaqueRouteKey: `${bindingId}-1-${source.sourceKey}-${source.sourceVersionId}`.replace(/[^A-Za-z0-9._~-]/gu, '_').slice(0, 160),
      localPageScope: clone(source.localPageScope),
    })),
    activities,
    actionFlags: { canAutosave: true, canSubmit: true, canReview: false },
    provenance: {
      publicationId: publication.publicationId,
      publicationRevision: publication.publicationRevision,
      bindingId,
      bindingRevision: 1,
    },
  };
};

const normalizeNodeOverrides = (
  overrides: readonly BookHomeworkSagaNodeOverrideIntent[],
): readonly BookHomeworkSagaNodeOverrideIntent[] => {
  if (!Array.isArray(overrides) || overrides.length > MAX_NODE_OVERRIDES) fail('invalid-schedule', 'Node overrides exceed the bounded limit.');
  const seen = new Set<string>();
  return overrides.map((override, index) => {
    exactKeys(override, ['nodeKey', 'availableFrom', 'dueAt'], `schedule.nodeOverrides[${index}]`);
    const nodeKey = id(override.nodeKey, `schedule.nodeOverrides[${index}].nodeKey`);
    if (seen.has(nodeKey)) fail('invalid-schedule', `Duplicate node override ${nodeKey}.`);
    seen.add(nodeKey);
    if (override.availableFrom === undefined && override.dueAt === undefined) fail('invalid-schedule', `Node override ${nodeKey} is empty.`);
    if (override.availableFrom !== undefined) iso(override.availableFrom, `schedule.nodeOverrides[${index}].availableFrom`);
    if (override.dueAt !== undefined) iso(override.dueAt, `schedule.nodeOverrides[${index}].dueAt`);
    return {
      nodeKey,
      ...(override.availableFrom === undefined ? {} : { availableFrom: override.availableFrom }),
      ...(override.dueAt === undefined ? {} : { dueAt: override.dueAt }),
    };
  }).sort((left, right) => left.nodeKey.localeCompare(right.nodeKey));
};

const normalizeExtensions = (
  extensions: readonly BookHomeworkSagaStudentExtensionIntent[] | undefined,
  selected: readonly string[],
  nodeKeys: ReadonlySet<string>,
): Readonly<Record<string, readonly { readonly nodeKey: string; readonly dueAt: string }[]>> => {
  if (extensions === undefined) return {};
  if (!Array.isArray(extensions) || extensions.length > MAX_STUDENT_EXTENSIONS) fail('invalid-extension', 'Student extensions exceed the bounded limit.');
  const selectedSet = new Set(selected);
  const seen = new Set<string>();
  const byStudent = new Map<string, { readonly nodeKey: string; readonly dueAt: string }[]>();
  extensions.forEach((extension, index) => {
    exactKeys(extension, ['studentId', 'nodeKey', 'dueAt'], `schedule.studentExtensions[${index}]`);
    const studentId = id(extension.studentId, `schedule.studentExtensions[${index}].studentId`);
    const nodeKey = id(extension.nodeKey, `schedule.studentExtensions[${index}].nodeKey`);
    const dueAt = iso(extension.dueAt, `schedule.studentExtensions[${index}].dueAt`);
    if (!selectedSet.has(studentId)) fail('invalid-extension', 'Student extension recipient is not selected.');
    if (!nodeKeys.has(nodeKey)) fail('invalid-extension', 'Student extension node is not in the canonical manifest.');
    const key = `${studentId}:${nodeKey}`;
    if (seen.has(key)) fail('invalid-extension', 'Student extensions contain duplicates.');
    seen.add(key);
    const entries = byStudent.get(studentId) ?? [];
    entries.push({ nodeKey, dueAt });
    byStudent.set(studentId, entries);
  });
  return Object.fromEntries([...byStudent.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([studentId, entries]) => [studentId, entries.sort((left, right) => left.nodeKey.localeCompare(right.nodeKey))]));
};

const normalizePolicy = (
  command: BookHomeworkSagaCommand,
  publication: BookDeliveryPublishedPublicationReference,
  requiredPlacementIds: readonly string[],
  fingerprint: (value: unknown) => string,
): {
  readonly policy: BookHomeworkSagaCanonicalState['frozenPolicy'];
  readonly fingerprintInput: unknown;
} => {
  const intent = command.intent.policy;
  exactKeys(intent, ['intent', 'integrityCapture', 'integrityOverride', 'activityPolicies'], 'intent.policy');
  if (!['accountable', 'practice'].includes(intent.intent)
    || typeof intent.integrityCapture !== 'boolean'
    || typeof intent.integrityOverride !== 'boolean'
    || !Array.isArray(intent.activityPolicies)) {
    fail('invalid-policy', 'Assignment policy is invalid.');
  }
  const required = new Set(requiredPlacementIds);
  if (intent.activityPolicies.length !== required.size) fail('stale-policy', 'Activity policy set does not match required Placements.');
  const seen = new Set<string>();
  const normalized = intent.activityPolicies.map((entry: BookHomeworkSagaActivityPolicyIntent, index) => {
    exactKeys(entry, ['placementId', 'maxAttempts', 'feedbackRelease', 'lateSubmissionAllowed'], `intent.policy.activityPolicies[${index}]`);
    const placementId = id(entry.placementId, `intent.policy.activityPolicies[${index}].placementId`);
    if (!required.has(placementId) || seen.has(placementId)) fail('stale-policy', 'Activity policy set does not exactly match required Placements.');
    seen.add(placementId);
    if (entry.maxAttempts !== null && (!Number.isSafeInteger(entry.maxAttempts) || entry.maxAttempts <= 0 || entry.maxAttempts > 50)) {
      fail('invalid-policy', `Activity policy ${placementId} maxAttempts is invalid.`);
    }
    if (!VALID_FEEDBACK_RELEASES.has(entry.feedbackRelease) || typeof entry.lateSubmissionAllowed !== 'boolean') {
      fail('invalid-policy', `Activity policy ${placementId} is invalid.`);
    }
    return entry;
  }).sort((left, right) => left.placementId.localeCompare(right.placementId));
  if (seen.size !== required.size) fail('stale-policy', 'Activity policy set does not exactly match required Placements.');
  const byPlacement = new Map(publication.placements.map((placement) => [placement.placementId, placement]));
  const activityPolicies = Object.fromEntries(normalized.map((entry) => {
    const placement = byPlacement.get(entry.placementId);
    if (!placement) fail('stale-policy', 'Activity policy Placement is absent from the publication.');
    return [entry.placementId, {
      lateSubmissionAllowed: entry.lateSubmissionAllowed,
      maxAttempts: entry.maxAttempts,
    }];
  }));
  const policy = {
    policyId: publication.schedulePolicy.policyId,
    policyRevision: publication.schedulePolicy.policyRevision,
    fingerprint: fingerprint({
      policyId: publication.schedulePolicy.policyId,
      policyRevision: publication.schedulePolicy.policyRevision,
      intent: intent.intent,
      integrityCapture: intent.integrityCapture,
      integrityOverride: intent.integrityOverride,
      activityPolicies: normalized,
    }),
    activityPolicies,
  } as const;
  return {
    policy,
    fingerprintInput: {
      policyId: policy.policyId,
      policyRevision: policy.policyRevision,
      intent: intent.intent,
      integrityCapture: intent.integrityCapture,
      integrityOverride: intent.integrityOverride,
      activityPolicies: normalized,
    },
  };
};

const publicationTargetMatches = (
  target: BookHomeworkSelectionTarget,
  publication: BookDeliveryPublishedPublicationReference,
): void => {
  if (target.kind === 'activity') {
    const placement = publication.placements.find((candidate) => candidate.activityId === target.activityId
      && (target.placementId === undefined || candidate.placementId === target.placementId));
    if (!placement) fail('stale-publication', 'Activity target is not included in the trusted publication.');
    const selectedPlacement = placement as NonNullable<typeof placement>;
    if (publication.scope.kind === 'placements' && !publication.scope.placementIds.includes(selectedPlacement.placementId)) {
      fail('stale-publication', 'Activity target is outside the trusted publication scope.');
    }
    if (publication.scope.kind === 'subtree' && !publication.scope.nodeKeys.includes(selectedPlacement.nodeKey)) {
      fail('stale-publication', 'Activity target is outside the trusted publication scope.');
    }
    return;
  }
  if (publication.scope.kind === 'placements') fail('stale-publication', 'Structural target requires a subtree publication.');
  if (target.kind === 'book') {
    if (publication.outline.some((node) => !publication.scope.nodeKeys.includes(node.nodeKey))) {
      fail('stale-publication', 'Book target is not represented by the complete trusted publication scope.');
    }
    return;
  }
  if (!publication.scope.nodeKeys.includes(target.nodeKey)) fail('stale-publication', 'Structural target is outside the trusted publication scope.');
};

const loadPublication = async (
  options: BookHomeworkCanonicalResolverOptions,
  command: BookHomeworkSagaCommand,
  target: BookHomeworkSelectionTarget,
  recipientId: string,
): Promise<BookDeliveryPublishedPublicationReference> => {
  const loader = options.loadTrustedPublication ?? options.loadPublication;
  if (loader) {
    const publication = await loader({ command, recipientId });
    try { assertPublishedBookDeliveryPublication(publication); } catch (error) {
      fail('invalid-publication', error instanceof Error ? error.message : 'Trusted publication is invalid.');
    }
    return publication;
  }
  const readScope = options.readPublicationScope as NonNullable<typeof options.readPublicationScope> | undefined;
  if (!readScope) fail('invalid-publication', 'No trusted publication loader or Assembly scope reader is configured.');
  const scope = await (readScope as NonNullable<typeof readScope>)(command.intent.bookId);
  const selection = targetSelectionForScope(target, scope, command.intent.expectedPublication);
  const publication = createTrustedBookDeliveryPublication(
    {
      bookId: command.intent.bookId,
      publicationId: command.intent.expectedPublication.publicationId,
      publicationRevision: command.intent.expectedPublication.publicationRevision,
      recipientId,
      contextKind: 'homework',
      contextId: command.assignmentId,
      scope: selection,
    },
    scope,
    {
      policyId: `book-homework:${command.assignmentId}`,
      policyRevision: 1,
      basis: 'immutable-reference',
    },
  );
  return publication;
};

const resolveCanonical = async (
  options: BookHomeworkCanonicalResolverOptions,
  command: BookHomeworkSagaCommand,
): Promise<BookHomeworkSagaCanonicalState> => {
  const selected = assertCommand(command);
  const target = targetWithoutClass(command.intent.target);
  if (target.bookId !== command.intent.bookId) fail('invalid-target', 'Target Book does not match intent Book.');
  const classId = command.intent.target.classId;
  const snapshot = await readClass(options.classReader, classId);
  if (!snapshot) fail('class-not-found', 'Class is unavailable.');
  const classSnapshot = snapshot as NonNullable<typeof snapshot>;
  const owner = classSnapshot.ownerId ?? classSnapshot.createdByUserId ?? classSnapshot.createdBy ?? classSnapshot.teacherId;
  if (classSnapshot.classId !== undefined && classSnapshot.classId !== classId) fail('class-forbidden', 'Class identity does not match the command.');
  if (owner !== command.ownerId) fail('class-forbidden', 'Command owner does not own the class.');
  if (classSnapshot.status !== 'active') fail('class-inactive', 'Only an active class can receive Book Homework.');
  const members = normalizeMemberEntries(classSnapshot.members ?? classSnapshot.students);
  const activeMembers = new Set(members.filter(([, member]) => isActiveMember(member)).map(([memberId]) => memberId));
  if (selected.some((recipientId) => !activeMembers.has(recipientId))) fail('unauthorized-recipient', 'Every recipient must be an active member of the class.');

  const publication = await loadPublication(options, command, target, selected[0]!);
  try { assertPublishedBookDeliveryPublication(publication); } catch (error) {
    fail('invalid-publication', error instanceof Error ? error.message : 'Published Delivery reference is invalid.');
  }
  if (publication.bookId !== command.intent.bookId
    || publication.ownerId !== command.ownerId
    || publication.publicationId !== command.intent.expectedPublication.publicationId
    || publication.publicationRevision !== command.intent.expectedPublication.publicationRevision
    || publication.manifestVersionId !== command.manifestVersionId
    || publication.publicationStatus !== 'published'
    || publication.bookMode !== 'pdf') {
    fail('stale-publication', 'Trusted Delivery publication does not match the command.');
  }
  if (publication.sourceSet.strategy !== 'full_pdf' || publication.sourceSet.sources.length !== 1) {
    fail('not-ready', 'Book Homework requires one complete student-safe PDF source.');
  }
  publicationTargetMatches(target, publication);

  const delivery = createProjection(publication, command.assignmentId, selected[0]!);
  const nodeOverrides = normalizeNodeOverrides(command.intent.schedule.nodeOverrides);
  const scheduleRules = nodeOverrides.map((override) => ({
    nodeKey: override.nodeKey,
    ...(override.availableFrom === undefined ? {} : { availableFrom: override.availableFrom }),
    ...(override.dueAt === undefined ? {} : { dueAt: override.dueAt }),
  }));
  const schedule: BookHomeworkAuthoritySchedule = {
    schemaVersion: 1,
    resolverVersion: 1,
    finalDueAt: iso(command.intent.schedule.finalDueAt, 'schedule.finalDueAt'),
    ...(command.intent.schedule.availableFrom === undefined ? {} : { availableFrom: iso(command.intent.schedule.availableFrom, 'schedule.availableFrom') }),
    scheduleRules,
  };

  let manifest!: BookHomeworkManifest;
  try {
    manifest = createBookHomeworkManifest({
      resolution: { delivery },
      target,
      manifestVersionId: command.manifestVersionId,
      ownerId: command.ownerId,
      createdByCommandId: command.operationId,
      createdAt: iso(command.createdAt, 'createdAt'),
      bindingRevision: options.manifestBindingRevision ?? 1,
      scheduleRules,
    });
    validateBookHomeworkSchedule({
      availableFrom: schedule.availableFrom,
      finalDueAt: schedule.finalDueAt,
      scheduleRules,
    }, manifest.outline);
    assertValidBookHomeworkManifest(manifest);
  } catch (error) {
    if (error instanceof BookHomeworkCanonicalResolverError) throw error;
    if (error && typeof error === 'object' && 'code' in error
      && (error as { readonly code?: unknown }).code === 'invalid-source-context') {
      fail('not-ready', 'A required published Delivery Activity does not have ready source context.');
    }
    fail('invalid-schedule', error instanceof Error ? error.message : 'Canonical manifest or schedule is invalid.');
  }

  const studentExtensions = normalizeExtensions(
    command.intent.schedule.studentExtensions,
    selected,
    new Set(manifest.outline.map((node) => node.nodeKey)),
  );
  const requiredBindings = manifest.bindings.filter((binding) => binding.state === 'required');
  if (requiredBindings.length === 0 || requiredBindings.some((binding) => binding.sourceReadiness === 'unavailable')) {
    fail('not-ready', 'The published Delivery has no ready required Activity set.');
  }
  const policyResult = normalizePolicy(
    command,
    publication,
    requiredBindings.map((binding) => binding.placementId),
    options.fingerprint ?? stable,
  );
  const fingerprint = options.fingerprint ?? stable;
  const publicationFp = fingerprintBookHomeworkPublication(publication, fingerprint);
  const exposureInput = {
    approved: true,
    sourceReadiness: 'ready' as const,
    publication: publicationFp,
    requiredPlacementIds: requiredBindings.map((binding) => binding.placementId).sort(),
    sourceSet: publication.sourceSet,
  };
  const exposure = { approved: true, fingerprint: fingerprint(exposureInput) } as const;
  const now = options.now?.();
  const canonical: BookHomeworkSagaCanonicalState = {
    ownerId: command.ownerId,
    manifest,
    schedule,
    recipientIds: selected,
    studentExtensions,
    publication: {
      bookId: publication.bookId,
      publicationId: publication.publicationId,
      publicationRevision: publication.publicationRevision,
      manifestVersionId: publication.manifestVersionId,
      fingerprint: publicationFp,
    },
    deliveryPublication: clone(publication),
    sourceReadiness: 'ready',
    exposureApproval: exposure,
    capabilities: { canAssignBookHomework: true },
    frozenPolicy: policyResult.policy,
  };
  // Keep the injected clock an explicit seam without allowing it to enter canonical identity.
  if (now !== undefined) iso(now, 'resolver clock');
  return canonical;
};

export class BookHomeworkCanonicalResolver {
  constructor(private readonly options: BookHomeworkCanonicalResolverOptions) {}

  resolve(command: BookHomeworkSagaCommand): Promise<BookHomeworkSagaCanonicalState> {
    return resolveCanonical(this.options, command);
  }
}

export const createBookHomeworkCanonicalResolver = (
  options: BookHomeworkCanonicalResolverOptions,
): BookHomeworkCanonicalResolver => new BookHomeworkCanonicalResolver(options);

export const resolveBookHomeworkCanonical = (
  options: BookHomeworkCanonicalResolverOptions,
  command: BookHomeworkSagaCommand,
): Promise<BookHomeworkSagaCanonicalState> => resolveCanonical(options, command);

export const fingerprintBookHomeworkManifest = (
  manifest: unknown,
  fingerprint: (value: unknown) => string = stable,
): string => fingerprint(manifest);

export const fingerprintBookHomeworkExposureApproval = (
  value: unknown,
  fingerprint: (value: unknown) => string = stable,
): string => fingerprint(value);

export const fingerprintBookHomeworkPolicy = (
  value: unknown,
  fingerprint: (value: unknown) => string = stable,
): string => fingerprint(value);
