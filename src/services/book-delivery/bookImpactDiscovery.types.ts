import type {
  BookImpactClassification,
  BookImpactEffect,
} from './bookImpactClassification.service';

/**
 * 39B is a read-only producer for the 39C snapshot seam.  These constants are
 * intentionally independent of the 39A registry implementation: 39A's
 * Course/Class declarations are not widened by a Solo/Homework adapter.
 */
export const BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION = 1 as const;
export const BOOK_IMPACT_DISCOVERY_INPUT_VERSION = 1 as const;
export const BOOK_IMPACT_DISCOVERY_OUTPUT_VERSION = 1 as const;
export const BOOK_IMPACT_DISCOVERY_ADAPTER_VERSION = 1 as const;

export const BOOK_IMPACT_DISCOVERY_MAX_CONTEXTS = 100 as const;
export const BOOK_IMPACT_DISCOVERY_MAX_PLACEMENTS_PER_CONTEXT = 200 as const;
export const BOOK_IMPACT_DISCOVERY_MAX_ATTEMPTS_PER_CONTEXT = 200 as const;
export const BOOK_IMPACT_DISCOVERY_MAX_SOURCES_PER_CONTEXT = 200 as const;
export const BOOK_IMPACT_DISCOVERY_MAX_REPLACEMENTS_PER_CONTEXT = 200 as const;
export const BOOK_IMPACT_DISCOVERY_MAX_PAGES_PER_SOURCE = 512 as const;
export const BOOK_IMPACT_DISCOVERY_MAX_SOURCE_REFS_PER_PLACEMENT = 200 as const;
export const BOOK_IMPACT_DISCOVERY_MAX_SOURCE_REFS_PER_CONTEXT = 400 as const;
export const BOOK_IMPACT_DISCOVERY_MAX_PAGE_NUMBERS_PER_CONTEXT = 8192 as const;
export const BOOK_IMPACT_DISCOVERY_MAX_CLASSIFICATION_REASONS = 64 as const;
export const BOOK_IMPACT_DISCOVERY_MAX_REASON_LENGTH = 256 as const;

export type BookImpactDiscoveryContextKind =
  | 'solo'
  | 'homework'
  | 'course'
  | 'class'
  | 'public-reference';
export type BookImpactDiscoveryContextStatus = 'active' | 'closed' | 'archived';
export type BookImpactDiscoveryLifecycle =
  | 'not-started'
  | 'in-progress'
  | 'submitted'
  | 'completed';
export type BookImpactDiscoverySourceAvailability = 'available' | 'invalidated';
export type BookImpactDiscoverySourceReplacementMode =
  | 'invalidation-only'
  | 'owner-adopts-replacement';

export type BookImpactDiscoveryFailureCode =
  | 'invalid-actor'
  | 'unauthorized'
  | 'missing'
  | 'malformed'
  | 'cross-owner'
  | 'ambiguous'
  | 'stale'
  | 'uncertain'
  | 'unbounded'
  | 'unsupported';

export const BOOK_IMPACT_DISCOVERY_EFFECTS: readonly BookImpactEffect[] = Object.freeze([
  'unchanged',
  'display-only',
  'regrade',
  'redo-required',
  'added',
  'removed',
  'reordered',
  'moved',
  'mapping-source-context',
  'successor',
  'invalidation',
  'unsupported',
]);

export const BOOK_IMPACT_DISCOVERY_PRIMARY_EFFECT_PRECEDENCE: readonly BookImpactEffect[] = Object.freeze([
  'invalidation',
  'unsupported',
  'successor',
  'redo-required',
  'added',
  'removed',
  'moved',
  'mapping-source-context',
  'reordered',
  'regrade',
  'display-only',
  'unchanged',
]);

export const BOOK_IMPACT_DISCOVERY_ACTIVITY_DIFF_CLASSIFICATIONS = Object.freeze([
  'unchanged',
  'display-only',
  'regrade',
  'redo-required',
  'added',
  'removed',
  'reordered',
  'presentation-context',
  'unsupported',
]);

export type BookImpactDiscoveryInputField =
  | 'frozen-placement-binding'
  | 'book-impact-classification';

export interface BookImpactDiscoveryInputRequirement {
  readonly version: typeof BOOK_IMPACT_DISCOVERY_INPUT_VERSION;
  readonly immutable: true;
  readonly requiredFields: readonly [
    'frozen-placement-binding',
    'book-impact-classification',
  ];
}

export interface BookImpactDiscoveryClassificationCapability {
  readonly version: typeof BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION;
  readonly supportedEffects: readonly BookImpactEffect[];
}

export interface BookImpactDiscoverySourceReplacementCapability {
  readonly version: typeof BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION;
  readonly mode: BookImpactDiscoverySourceReplacementMode;
  readonly automaticUpdate: false;
}

export interface BookImpactDiscoveryOutputSchema {
  readonly version: typeof BOOK_IMPACT_DISCOVERY_OUTPUT_VERSION;
  readonly fields: readonly ['impact-summary'];
}

export interface BookImpactDiscoveryConformance {
  readonly status: 'verified';
  readonly contractVersion: typeof BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION;
  readonly verifiedAdapterVersion: number;
}

/** Source-controlled metadata only; it has no authority or activation fields. */
export interface BookImpactDiscoveryAdapterDeclaration {
  readonly adapterId: string;
  readonly adapterVersion: number;
  readonly contextKind: BookImpactDiscoveryContextKind;
  readonly contractVersion: typeof BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION;
  readonly input: BookImpactDiscoveryInputRequirement;
  readonly classification: BookImpactDiscoveryClassificationCapability;
  readonly sourceReplacement: BookImpactDiscoverySourceReplacementCapability;
  readonly output: BookImpactDiscoveryOutputSchema;
  readonly conformance: BookImpactDiscoveryConformance;
}

export interface BookImpactDiscoveryConformanceRegistry {
  readonly contractVersion: typeof BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION;
  readonly declarations: readonly BookImpactDiscoveryAdapterDeclaration[];
  get(adapterId: string): BookImpactDiscoveryAdapterDeclaration | undefined;
}

export interface BookImpactDiscoveryAuthorization {
  readonly authorized: true;
  readonly actorId: string;
  readonly contextKind: BookImpactDiscoveryContextKind;
  readonly ownerScope:
    | 'actor-owned-solo'
    | 'uploader-owned-homework'
    | 'teacher-owned-course'
    | 'teacher-owned-class'
    | 'downstream-owner-public-reference';
  readonly maxContexts: number;
}

export interface BookImpactDiscoveryAuthorizationFailure {
  readonly authorized: false;
  readonly code: Extract<BookImpactDiscoveryFailureCode, 'invalid-actor' | 'unauthorized' | 'uncertain'>;
}

export type BookImpactDiscoveryAuthorizationResult =
  | BookImpactDiscoveryAuthorization
  | BookImpactDiscoveryAuthorizationFailure;

export interface BookImpactSourceReference {
  readonly sourceKey: string;
  readonly sourceVersionId: string;
  readonly availability: BookImpactDiscoverySourceAvailability;
  readonly pages: readonly number[];
  readonly sourceOrder?: number;
}

export interface BookImpactEffectiveWindow {
  readonly availableFrom: string | null;
  readonly dueAt: string | null;
  readonly extensionDueAt: string | null;
  readonly winner: 'none' | 'assignment' | 'node' | 'student-extension';
  /** Canonical per-placement release authority from the homework scheduler. */
  readonly release: BookImpactWindowResolution;
  /** Canonical per-placement deadline authority, including recipient extensions. */
  readonly deadline: BookImpactWindowResolution;
  /** The recipient extension revision used when deadline.source is student-extension. */
  readonly extensionRevision: number | null;
  readonly policyRevision: number;
  readonly authorityRevision: number;
}

export type BookImpactWindowSource =
  | 'open-access'
  | 'assignment'
  | 'ancestor'
  | 'student-extension';

export interface BookImpactWindowResolution {
  readonly source: BookImpactWindowSource;
  readonly nodeKey: string | null;
  readonly at: string | null;
}

export interface BookImpactAttemptSummary {
  readonly attemptId: string;
  readonly attemptNumber: number;
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersionId: string;
  readonly lifecycle: Exclude<BookImpactDiscoveryLifecycle, 'not-started'>;
  readonly createdAt: string;
  readonly completedAt: string | null;
}

export interface BookImpactPlacementInput {
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersionId: string;
  readonly activityVersion: number;
  readonly nodeKey: string;
  readonly order: number;
  /** Immutable effective-window authority for this exact placement. */
  readonly effectiveWindow: BookImpactEffectiveWindow | null;
  readonly sourceRefs: readonly BookImpactSourceReference[];
}

export interface BookImpactReplacementInput {
  readonly sourceKey: string;
  readonly fromSourceVersionId: string;
  readonly toSourceVersionId: string | null;
  readonly placementIds: readonly string[];
  readonly mode: BookImpactDiscoverySourceReplacementMode;
  readonly ownerChoice: 'retain-owner' | 'owner-adopts-replacement' | 'invalidate-context';
}

/** Immutable producer pins for the Course/Class/public-reference adapters. */
export type BookImpactProducerIdentity =
  | {
    readonly kind: 'course';
    readonly courseId: string;
    readonly moduleId: string;
    readonly courseMaterialId: string;
    readonly unitStableKey: string;
    readonly unitVersionId: string;
    readonly sourceVersionId: string;
    readonly manifestVersionId: string;
    readonly bookId: string;
    readonly bookRevision: number;
    readonly publicationId: string;
    readonly publicationRevision: number;
    readonly placementRevision: number;
    readonly bindingId: string;
    readonly bindingRevision: number;
  }
  | {
    readonly kind: 'class';
    readonly classId: string;
    readonly copyId: string;
    readonly classPlacementId: string;
    readonly classCourseMaterialId: string;
    readonly sourceCourseMaterialId: string;
    readonly sourcePlacementRevision: number;
    readonly unitStableKey: string;
    readonly unitVersionId: string;
    readonly sourceVersionId: string;
    readonly manifestVersionId: string;
    readonly bookId: string;
    readonly bookRevision: number;
    readonly publicationId: string;
    readonly publicationRevision: number;
    /** Numeric revision from the Delivery binding, never a placement pin. */
    readonly deliveryBindingRevision: number;
    readonly bindingId: string;
  }
  | {
    readonly kind: 'public-reference';
    readonly referenceKind: 'reference' | 'fork';
    readonly referenceId: string;
    readonly referenceRevision: number;
    readonly sourceBookId: string;
    readonly sourceBookRevision: number;
    readonly sourcePublicationId: string;
    readonly sourcePublicationRevision: number;
    readonly targetBookId: string;
    readonly targetBookRevision: number;
    readonly targetPublicationId: string;
    readonly targetPublicationRevision: number;
    readonly targetPlacementId: string;
    readonly targetPlacementRevision: number;
    readonly downstreamOwnerId: string;
    readonly provenanceId: string;
    readonly provenanceRevision: number;
    readonly bindingId: string;
    readonly bindingRevision: number;
  };

/**
 * Immutable, already-authorized facts.  Adapters never accept raw answers,
 * PDFs, provider keys, credentials, or authoring records in this shape.
 */
export interface BookImpactContextInputBase {
  readonly contextId: string;
  /** Context owner used by the adapter authorization scope, not a provider key. */
  readonly ownerId: string;
  readonly recipientId: string;
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly status: BookImpactDiscoveryContextStatus;
  readonly lifecycle: BookImpactDiscoveryLifecycle;
  readonly bookId: string;
  readonly bookRevision: number;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly effectiveWindow: BookImpactEffectiveWindow | null;
  readonly placements: readonly BookImpactPlacementInput[];
  readonly attempts: readonly BookImpactAttemptSummary[];
  readonly sources: readonly BookImpactSourceReference[];
  readonly classification: BookImpactClassification;
  readonly replacement: readonly BookImpactReplacementInput[];
  readonly observedAt: string;
}

export type BookImpactSoloContextInput = BookImpactContextInputBase & {
  readonly kind: 'solo';
  readonly identity?: never;
};

export type BookImpactHomeworkContextInput = BookImpactContextInputBase & {
  readonly kind: 'homework';
  readonly identity?: never;
};

export type BookImpactCourseContextInput = BookImpactContextInputBase & {
  readonly kind: 'course';
  readonly identity: Extract<BookImpactProducerIdentity, { readonly kind: 'course' }>;
};

export type BookImpactClassContextInput = BookImpactContextInputBase & {
  readonly kind: 'class';
  readonly identity: Extract<BookImpactProducerIdentity, { readonly kind: 'class' }>;
};

export type BookImpactPublicReferenceContextInput = BookImpactContextInputBase & {
  readonly kind: 'public-reference';
  readonly identity: Extract<BookImpactProducerIdentity, { readonly kind: 'public-reference' }>;
};

/**
 * Immutable, already-authorized facts with a producer identity tied to the
 * context discriminator. Solo/Homework deliberately have no producer identity.
 */
export type BookImpactContextInput =
  | BookImpactSoloContextInput
  | BookImpactHomeworkContextInput
  | BookImpactCourseContextInput
  | BookImpactClassContextInput
  | BookImpactPublicReferenceContextInput;

export interface BookImpactSourceScopeSummary {
  readonly sourceKey: string;
  readonly sourceVersionId: string;
  readonly availability: BookImpactDiscoverySourceAvailability;
  readonly pages: readonly number[];
  readonly sourceOrder?: number;
  readonly placementIds: readonly string[];
}

export interface BookImpactReplacementScopeSummary {
  readonly sourceKey: string;
  readonly fromSourceVersionId: string;
  readonly toSourceVersionId: string | null;
  readonly contextIds: readonly string[];
  readonly ownerIds: readonly string[];
  readonly placementIds: readonly string[];
  readonly mode: BookImpactDiscoverySourceReplacementMode;
  readonly ownerChoices: readonly ('retain-owner' | 'owner-adopts-replacement' | 'invalidate-context')[];
  readonly automaticUpdate: false;
}

export interface BookImpactSummary {
  readonly contextId: string;
  readonly contextKind: BookImpactDiscoveryContextKind;
  readonly ownerId: string;
  readonly recipientId: string;
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly status: BookImpactDiscoveryContextStatus;
  readonly lifecycle: BookImpactDiscoveryLifecycle;
  readonly bookId: string;
  readonly bookRevision: number;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly effectiveWindow: BookImpactEffectiveWindow | null;
  readonly placements: readonly BookImpactPlacementInput[];
  readonly attempts: readonly BookImpactAttemptSummary[];
  readonly sources: readonly BookImpactSourceScopeSummary[];
  readonly classification: Pick<
    BookImpactClassification,
    'primaryEffect' | 'effects' | 'reasons' | 'requiresRedo' | 'requiresRegrade'
  >;
  readonly replacement: readonly BookImpactReplacementInput[];
  readonly identity?: BookImpactProducerIdentity;
}

export interface BookImpactDiscoverySuccess {
  readonly status: 'ok';
  readonly contractVersion: typeof BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION;
  readonly inputVersion: typeof BOOK_IMPACT_DISCOVERY_INPUT_VERSION;
  readonly outputVersion: typeof BOOK_IMPACT_DISCOVERY_OUTPUT_VERSION;
  readonly adapterId: string;
  readonly adapterVersion: number;
  readonly contextKind: BookImpactDiscoveryContextKind;
  readonly evaluatedAt: string;
  readonly impacts: readonly BookImpactSummary[];
  readonly replacementScopes: readonly BookImpactReplacementScopeSummary[];
}

export interface BookImpactDiscoveryBlocked {
  readonly status: 'blocked';
  readonly contractVersion: typeof BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION;
  readonly inputVersion: typeof BOOK_IMPACT_DISCOVERY_INPUT_VERSION;
  readonly outputVersion: typeof BOOK_IMPACT_DISCOVERY_OUTPUT_VERSION;
  readonly adapterId: string;
  readonly adapterVersion: number;
  readonly contextKind: BookImpactDiscoveryContextKind;
  readonly evaluatedAt: string;
  readonly code: BookImpactDiscoveryFailureCode;
}

export type BookImpactDiscoveryResult =
  | BookImpactDiscoverySuccess
  | BookImpactDiscoveryBlocked;

export interface BookImpactDiscoveryQuery {
  readonly actorId: string;
  readonly evaluatedAt: string;
  readonly limit?: number;
}

/**
 * A bounded owner/index read must prove that the returned set is complete.
 * Pagination or truncation is deliberately outside this read-only adapter.
 */
export interface BookImpactDiscoveryReadPage {
  readonly contexts: readonly unknown[];
  readonly complete: true;
}

export interface BookSoloImpactReader {
  authorize(input: { readonly actorId: string }): Promise<BookImpactDiscoveryAuthorizationResult>;
  readOwnedContexts(input: {
    readonly actorId: string;
    readonly limit: number;
  }): Promise<BookImpactDiscoveryReadPage>;
}

export interface BookHomeworkImpactReader {
  authorize(input: { readonly actorId: string }): Promise<BookImpactDiscoveryAuthorizationResult>;
  readOwnedContexts(input: {
    readonly actorId: string;
    readonly limit: number;
  }): Promise<BookImpactDiscoveryReadPage>;
}

export interface BookCourseImpactReader {
  authorize(input: { readonly actorId: string }): Promise<BookImpactDiscoveryAuthorizationResult>;
  readOwnedContexts(input: {
    readonly actorId: string;
    readonly limit: number;
  }): Promise<BookImpactDiscoveryReadPage>;
}

export interface BookClassImpactReader {
  authorize(input: { readonly actorId: string }): Promise<BookImpactDiscoveryAuthorizationResult>;
  readOwnedContexts(input: {
    readonly actorId: string;
    readonly limit: number;
  }): Promise<BookImpactDiscoveryReadPage>;
}

export interface BookPublicImpactReader {
  authorize(input: { readonly actorId: string }): Promise<BookImpactDiscoveryAuthorizationResult>;
  readOwnedContexts(input: {
    readonly actorId: string;
    readonly limit: number;
  }): Promise<BookImpactDiscoveryReadPage>;
}

export const BOOK_IMPACT_DISCOVERY_FORBIDDEN_KEYS = Object.freeze([
  'answer',
  'answerKey',
  'answers',
  'credential',
  'credentials',
  'pdf',
  'pdfBytes',
  'privateObjectKey',
  'objectKey',
  'providerAuthority',
  'provider',
  'storageLocation',
  'bucket',
  'secret',
  'response',
  'teacherNotes',
  'teacherOnly',
  'prompt',
  'rawResponse',
]);

const forbiddenKeys = new Set(
  BOOK_IMPACT_DISCOVERY_FORBIDDEN_KEYS.map((key) => key.toLowerCase()),
);

/** Used by adapters and Worker repositories before any projection is built. */
export const containsBookImpactSensitiveKey = (value: unknown): boolean => {
  const seen = new WeakSet<object>();
  const visit = (candidate: unknown): boolean => {
    if (candidate === null || typeof candidate !== 'object') return false;
    if (seen.has(candidate)) return false;
    seen.add(candidate);
    return Reflect.ownKeys(candidate).some((key) => {
      if (typeof key === 'string'
        && forbiddenKeys.has(key.replace(/[^a-z0-9]/giu, '').toLowerCase())) return true;
      return visit((candidate as Record<string, unknown>)[key as string]);
    });
  };
  return visit(value);
};

/** A bounded deep freeze that rejects cycles rather than producing partial data. */
export const freezeBookImpactValue = <T>(value: T): T => {
  const seen = new WeakSet<object>();
  const visit = (candidate: unknown): void => {
    if (candidate === null || typeof candidate !== 'object') return;
    if (seen.has(candidate)) throw new Error('book_impact_discovery_cycle');
    seen.add(candidate);
    Reflect.ownKeys(candidate).forEach((key) => {
      visit((candidate as Record<string, unknown>)[key as string]);
    });
    Object.freeze(candidate);
  };
  visit(value);
  return value;
};

const adapterIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/u;
const contextKinds = new Set<BookImpactDiscoveryContextKind>([
  'solo', 'homework', 'course', 'class', 'public-reference',
]);
const effects = new Set<BookImpactEffect>(BOOK_IMPACT_DISCOVERY_EFFECTS);
const replacementModes = new Set<BookImpactDiscoverySourceReplacementMode>([
  'invalidation-only',
  'owner-adopts-replacement',
]);

export class BookImpactDiscoveryDeclarationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BookImpactDiscoveryDeclarationError';
  }
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new BookImpactDiscoveryDeclarationError(`${label} must be a plain object.`);
  }
  const actual = Reflect.ownKeys(value).sort((left, right) => String(left).localeCompare(String(right)));
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new BookImpactDiscoveryDeclarationError(`${label} must contain exactly: ${expected.join(', ')}.`);
  }
  if (actual.some((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return typeof key !== 'string' || descriptor === undefined || !('value' in descriptor);
  })) {
    throw new BookImpactDiscoveryDeclarationError(`${label} must contain data fields.`);
  }
}

const nonemptyUniqueStrings = (
  value: unknown,
  allowed: ReadonlySet<string>,
  label: string,
): readonly string[] => {
  if (!Array.isArray(value) || value.length === 0 || Object.keys(value).length !== value.length) {
    throw new BookImpactDiscoveryDeclarationError(`${label} must be a nonempty dense array.`);
  }
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !allowed.has(item) || result.includes(item)) {
      throw new BookImpactDiscoveryDeclarationError(`${label} contains an unsupported or duplicate value.`);
    }
    result.push(item);
  }
  return Object.freeze(result);
};

/** Pure 39A conformance registration; it never activates an adapter. */
export const createBookImpactDiscoveryConformanceRegistry = (
  declarations: readonly unknown[],
): BookImpactDiscoveryConformanceRegistry => {
  if (!Array.isArray(declarations)) {
    throw new BookImpactDiscoveryDeclarationError('declarations must be an array.');
  }
  const ids = new Set<string>();
  const normalized = declarations.map((candidate) => {
    exactRecord(candidate, [
      'adapterId',
      'adapterVersion',
      'classification',
      'conformance',
      'contextKind',
      'contractVersion',
      'input',
      'output',
      'sourceReplacement',
    ], 'adapter declaration');
    if (typeof candidate.adapterId !== 'string' || !adapterIdPattern.test(candidate.adapterId)) {
      throw new BookImpactDiscoveryDeclarationError('adapterId must be a safe nonempty identifier.');
    }
    if (!Number.isSafeInteger(candidate.adapterVersion) || (candidate.adapterVersion as number) <= 0) {
      throw new BookImpactDiscoveryDeclarationError('adapterVersion must be a positive safe integer.');
    }
    if (typeof candidate.contextKind !== 'string' || !contextKinds.has(candidate.contextKind as BookImpactDiscoveryContextKind)) {
      throw new BookImpactDiscoveryDeclarationError('contextKind is unsupported.');
    }
    if (candidate.contractVersion !== BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION) {
      throw new BookImpactDiscoveryDeclarationError('contractVersion is incompatible.');
    }

    exactRecord(candidate.input, ['immutable', 'requiredFields', 'version'], 'input');
    if (candidate.input.version !== BOOK_IMPACT_DISCOVERY_INPUT_VERSION || candidate.input.immutable !== true) {
      throw new BookImpactDiscoveryDeclarationError('input must declare immutable version 1 requirements.');
    }
    const requiredFields = nonemptyUniqueStrings(
      candidate.input.requiredFields,
      new Set<BookImpactDiscoveryInputField>(['frozen-placement-binding', 'book-impact-classification']),
      'input.requiredFields',
    );
    if (requiredFields.length !== 2
      || !requiredFields.includes('frozen-placement-binding')
      || !requiredFields.includes('book-impact-classification')) {
      throw new BookImpactDiscoveryDeclarationError('input.requiredFields must contain both 39A fields.');
    }

    exactRecord(candidate.classification, ['supportedEffects', 'version'], 'classification');
    if (candidate.classification.version !== BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION) {
      throw new BookImpactDiscoveryDeclarationError('classification.version is incompatible.');
    }
    const supportedEffects = nonemptyUniqueStrings(
      candidate.classification.supportedEffects,
      effects,
      'classification.supportedEffects',
    ) as readonly BookImpactEffect[];

    exactRecord(candidate.sourceReplacement, ['automaticUpdate', 'mode', 'version'], 'sourceReplacement');
    if (candidate.sourceReplacement.version !== BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION
      || candidate.sourceReplacement.automaticUpdate !== false
      || typeof candidate.sourceReplacement.mode !== 'string'
      || !replacementModes.has(candidate.sourceReplacement.mode as BookImpactDiscoverySourceReplacementMode)) {
      throw new BookImpactDiscoveryDeclarationError('sourceReplacement must prohibit automatic update.');
    }

    exactRecord(candidate.output, ['fields', 'version'], 'output');
    if (candidate.output.version !== BOOK_IMPACT_DISCOVERY_OUTPUT_VERSION
      || !Array.isArray(candidate.output.fields)
      || candidate.output.fields.length !== 1
      || candidate.output.fields[0] !== 'impact-summary') {
      throw new BookImpactDiscoveryDeclarationError('output must be version 1 impact-summary only.');
    }

    exactRecord(candidate.conformance, ['contractVersion', 'status', 'verifiedAdapterVersion'], 'conformance');
    if (candidate.conformance.contractVersion !== BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION
      || candidate.conformance.status !== 'verified'
      || candidate.conformance.verifiedAdapterVersion !== candidate.adapterVersion) {
      throw new BookImpactDiscoveryDeclarationError('conformance is missing, uncertain, or stale.');
    }
    if (ids.has(candidate.adapterId)) {
      throw new BookImpactDiscoveryDeclarationError(`duplicate adapterId: ${candidate.adapterId}.`);
    }
    ids.add(candidate.adapterId);
    return Object.freeze({
      adapterId: candidate.adapterId,
      adapterVersion: candidate.adapterVersion as number,
      contextKind: candidate.contextKind as BookImpactDiscoveryContextKind,
      contractVersion: BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION,
      input: Object.freeze({
        version: BOOK_IMPACT_DISCOVERY_INPUT_VERSION,
        immutable: true as const,
        requiredFields: requiredFields as BookImpactDiscoveryInputRequirement['requiredFields'],
      }),
      classification: Object.freeze({
        version: BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION,
        supportedEffects,
      }),
      sourceReplacement: Object.freeze({
        version: BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION,
        mode: candidate.sourceReplacement.mode as BookImpactDiscoverySourceReplacementMode,
        automaticUpdate: false as const,
      }),
      output: Object.freeze({
        version: BOOK_IMPACT_DISCOVERY_OUTPUT_VERSION,
        fields: Object.freeze(['impact-summary']) as readonly ['impact-summary'],
      }),
      conformance: Object.freeze({
        status: 'verified' as const,
        contractVersion: BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION,
        verifiedAdapterVersion: candidate.adapterVersion as number,
      }),
    });
  });
  const frozenDeclarations = Object.freeze(normalized);
  const byId = new Map(frozenDeclarations.map((declaration) => [declaration.adapterId, declaration]));
  return Object.freeze({
    contractVersion: BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION,
    declarations: frozenDeclarations,
    get: (adapterId: string) => byId.get(adapterId),
  });
};

/** Short aliases used by future 39C composition without widening 39A. */
export const createBookImpactAdapterRegistry = createBookImpactDiscoveryConformanceRegistry;
export const createBookImpactDiscoveryRegistry = createBookImpactDiscoveryConformanceRegistry;

export const isBookImpactDiscoverySafeId = (value: unknown): value is string => (
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u.test(value)
);

export const isBookImpactDiscoveryTimestamp = (value: unknown): value is string => (
  typeof value === 'string'
  && Number.isFinite(Date.parse(value))
  && new Date(Date.parse(value)).toISOString() === value
);
