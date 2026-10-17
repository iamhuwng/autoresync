import type {
  SourceSetCandidate,
  TrustedBookSourceVersionProjection,
} from '../../types/bookAssembly.types';
import type {
  BookSourceChecksum,
  BookSourcePurpose,
  BookSourceStudentSafeDecision,
  BookSourceStudentSafeStatus,
} from '../../types/bookSource.types';
import type { MaterialBookMetadata } from '../../types/materialCatalog.types';
import type { MaterialBookSetupActivation } from '../../types/materialCatalog.types';
import {
  appendComponentPdfActivationReceipt,
  createComponentPdfActivationReceipt,
  fingerprintComponentPdfActivation,
} from '../book-assembly/componentPdfActivation.service';

export type { SourceSetCandidate } from '../../types/bookAssembly.types';

/** The subset of a Material Book that this trusted mutation is allowed to change. */
export type MaterialBookSourceAttachmentBook = MaterialBookMetadata & {
  readonly bookMode: 'pdf';
  readonly bookRevision: number;
  readonly sourceSetRevision: number;
  readonly sourceSet?: SourceSetCandidate | null;
  readonly setupActivations?: readonly MaterialBookSetupActivation[];
};

/**
 * Provider-free facts projected by Source Version authority.  `verifiedUsable`
 * includes the current, verified lifecycle state; storage/provider identity is
 * deliberately not part of this record.
 */
export type MaterialBookSourceVersionProjection = TrustedBookSourceVersionProjection;

export interface MaterialBookSourceAttachmentOperationReceipt {
  readonly operationId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly fingerprint: string;
  readonly status: 'attached' | 'replaced';
  readonly bookRevision: number;
  readonly sourceSetRevision: number;
  readonly sourceSet: SourceSetCandidate;
}

export interface MaterialBookSourceAttachmentScope {
  /** Material Book and trusted source projections are read in one transaction. */
  readonly book: MaterialBookSourceAttachmentBook | null;
  /** Keyed by immutable Source Version id; values must remain provider-free. */
  readonly sourceVersionProjections: Readonly<Record<string, MaterialBookSourceVersionProjection>>;
  readonly operations?: Readonly<Record<string, MaterialBookSourceAttachmentOperationReceipt>>;
}

export interface MaterialBookSourceAttachmentTransaction<T> {
  readonly bookId: string;
  readonly operationId: string;
  readonly operationFingerprint: string;
  /**
   * The exact provider-free source set being attached.  Trusted persistence
   * adapters use this to select only the corresponding immutable source
   * projection leaves before invoking the pure mutation callback.
   */
  readonly sourceSet: SourceSetCandidate;
  readonly expectedBookRevision: number;
  readonly expectedSourceSetRevision: number;
  readonly mutate: (
    current: MaterialBookSourceAttachmentScope,
  ) => MaterialBookSourceAttachmentTransactionMutation<T>;
}

export interface MaterialBookSourceAttachmentTransactionMutation<T> {
  readonly outcome: T;
  readonly next?: MaterialBookSourceAttachmentScope;
  readonly write: boolean;
}

/**
 * Trusted persistence boundary. Implementations must execute `mutate` and its
 * optional write atomically, and enforce both expected revisions as a CAS.
 * No Firebase, browser, provider, or transport concern belongs in this port.
 */
export interface MaterialBookSourceAttachmentRepository {
  transaction<T>(
    input: MaterialBookSourceAttachmentTransaction<T>,
  ): Promise<T>;
}

export type MaterialBookSourceAttachmentConflictCode =
  | 'activation-required'
  | 'book-not-found'
  | 'wrong-owner'
  | 'wrong-book'
  | 'wrong-book-mode'
  | 'invalid-book-status'
  | 'stale-revision'
  | 'idempotency-conflict'
  | 'missing-source-projection'
  | 'source-book-mismatch'
  | 'source-identity-mismatch'
  | 'unverified-source'
  | 'invalid-source-projection'
  | 'invalid-input';

export interface MaterialBookSourceAttachmentResult {
  readonly status: 'attached' | 'replaced' | 'replayed' | 'conflict' | 'forbidden' | 'invalid';
  readonly operationId: string;
  readonly fingerprint: string;
  readonly receipt?: MaterialBookSourceAttachmentOperationReceipt;
  readonly reason?: MaterialBookSourceAttachmentConflictCode;
  readonly bookRevision?: number;
  readonly sourceSetRevision?: number;
  readonly sourceSet?: SourceSetCandidate;
  readonly activation?: MaterialBookSetupActivation;
}

export interface AttachMaterialBookSourceInput {
  readonly ownerId: string;
  readonly bookId: string;
  readonly operationId: string;
  readonly expectedBookRevision: number;
  readonly expectedSourceSetRevision: number;
  readonly sourceSet: SourceSetCandidate;
  readonly activation?: Pick<MaterialBookSetupActivation, 'unitCandidates' | 'studentDocument' | 'activities' | 'activatedAt'>;
}

export type MaterialBookSourceAttachmentInput = AttachMaterialBookSourceInput;

export interface MaterialBookSourceAttachmentService {
  readonly attach: (
    input: AttachMaterialBookSourceInput,
  ) => Promise<MaterialBookSourceAttachmentResult>;
  /** Same trusted mutation, named for callers whose intent is replacement. */
  readonly replace: (
    input: AttachMaterialBookSourceInput,
  ) => Promise<MaterialBookSourceAttachmentResult>;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;

const SOURCE_SET_KEYS = ['sourceStrategy', 'sources'] as const;
const FULL_SOURCE_KEYS = ['sourceKey', 'sourceVersionId', 'sourceOrder'] as const;
const COMPONENT_SOURCE_KEYS = ['ownerNodeKey', 'sourceKey', 'sourceVersionId', 'sourceOrder'] as const;
const PROJECTION_KEYS = [
  'bookId', 'checksum', 'physicalPageCount', 'purpose', 'sourceKey', 'sourceVersionId', 'studentSafeStatus', 'verifiedUsable',
] as const;
const DECISION_KEYS = ['decidedAt', 'decidedBy', 'reasonCode', 'sha256Hex', 'sourceVersionId'] as const;
const PURPOSES: readonly BookSourcePurpose[] = ['book-source', 'student-document'];
const SAFE_STATUSES: readonly BookSourceStudentSafeStatus[] = [
  'unreviewed', 'review-required', 'ready', 'rejected',
];
const REASONS = ['teacher-reviewed', 'teacher-only-content', 'invalid-document', 'superseded'] as const;
const HASH = /^[a-f0-9]{64}$/iu;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

const clone = <T>(value: T): T => structuredClone(value);

/** Canonical deterministic encoding used for operation idempotency. */
const stable = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
};

const fingerprintOf = (value: unknown): string => {
  const encoded = stable(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const character of encoded) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
};

export const fingerprintMaterialBookSourceAttachment = (
  input: Pick<AttachMaterialBookSourceInput, 'ownerId' | 'bookId' | 'operationId' | 'expectedBookRevision' | 'expectedSourceSetRevision' | 'sourceSet' | 'activation'>,
): string => input.activation ? fingerprintComponentPdfActivation({
  operationId: input.operationId,
  ownerId: input.ownerId,
  bookId: input.bookId,
  expectedBookRevision: input.expectedBookRevision,
  expectedSourceSetRevision: input.expectedSourceSetRevision,
  sourceSet: input.sourceSet,
  ...input.activation,
}) : fingerprintOf({
  action: 'material-book-source-attach',
  operationId: input.operationId,
  ownerId: input.ownerId,
  bookId: input.bookId,
  expectedBookRevision: input.expectedBookRevision,
  expectedSourceSetRevision: input.expectedSourceSetRevision,
  sourceSet: input.sourceSet,
});

export const fingerprintMaterialBookSourceAttachmentOperation = fingerprintMaterialBookSourceAttachment;

const exactKeys = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    return false;
  }
  const actual = Reflect.ownKeys(value);
  const expected = [...keys];
  return actual.length === expected.length
    && actual.every((key) => typeof key === 'string' && expected.includes(key));
};

const safeId = (value: unknown): value is string => typeof value === 'string' && SAFE_ID.test(value);
const revision = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const positiveInt = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const validSourceSet = (value: unknown): value is SourceSetCandidate => {
  if (!exactKeys(value, SOURCE_SET_KEYS) || !Array.isArray(value.sources) || value.sources.length === 0) return false;
  if (value.sourceStrategy !== 'full_pdf' && value.sourceStrategy !== 'component_pdfs') return false;
  if (value.sourceStrategy === 'full_pdf' && value.sources.length !== 1) return false;
  if (value.sourceStrategy === 'component_pdfs'
    && (value.sources.length < 2 || value.sources.length > 20)) return false;

  const sourceKeys = new Set<string>();
  const sourceVersions = new Set<string>();
  const orders = new Set<number>();
  return value.sources.every((source, index) => {
    const keys = value.sourceStrategy === 'full_pdf' ? FULL_SOURCE_KEYS : COMPONENT_SOURCE_KEYS;
    if (!exactKeys(source, keys)
      || !safeId(source.sourceKey)
      || !safeId(source.sourceVersionId)
      || !positiveInt(source.sourceOrder)
      || source.sourceOrder !== index + 1
      || sourceKeys.has(source.sourceKey)
      || sourceVersions.has(source.sourceVersionId)
      || orders.has(source.sourceOrder)) return false;
    if (value.sourceStrategy === 'component_pdfs' && !safeId(source.ownerNodeKey)) return false;
    sourceKeys.add(source.sourceKey);
    sourceVersions.add(source.sourceVersionId);
    orders.add(source.sourceOrder);
    return true;
  });
};

const validInput = (input: AttachMaterialBookSourceInput): boolean => Boolean(
  input
  && safeId(input.ownerId)
  && safeId(input.bookId)
  && safeId(input.operationId)
  && revision(input.expectedBookRevision)
  && revision(input.expectedSourceSetRevision)
  && validSourceSet(input.sourceSet),
);

const validChecksum = (value: unknown): value is BookSourceChecksum => (
  exactKeys(value, ['algorithm', 'value'])
  && value.algorithm === 'sha-256'
  && typeof value.value === 'string'
  && /^[a-f0-9]{64}$/u.test(value.value)
);

const validDecision = (
  value: unknown,
  sourceVersionId: string,
  checksum: BookSourceChecksum,
): value is BookSourceStudentSafeDecision => {
  if (!exactKeys(value, DECISION_KEYS)) return false;
  const decision = value as Record<string, unknown>;
  return safeId(decision.decidedBy)
    && typeof decision.decidedAt === 'string'
    && ISO.test(decision.decidedAt)
    && Number.isFinite(Date.parse(decision.decidedAt))
    && decision.sourceVersionId === sourceVersionId
    && typeof decision.sha256Hex === 'string'
    && HASH.test(decision.sha256Hex)
    && decision.sha256Hex === checksum.value
    && typeof decision.reasonCode === 'string'
    && REASONS.includes(decision.reasonCode as typeof REASONS[number]);
};

const validProjection = (value: unknown): value is MaterialBookSourceVersionProjection => {
  if (!exactKeys(value, PROJECTION_KEYS) && !(exactKeys(value, [...PROJECTION_KEYS, 'studentSafeDecision']))) return false;
  const projection = value as Record<string, unknown>;
  if (!safeId(projection.sourceKey)
    || !safeId(projection.sourceVersionId)
    || !safeId(projection.bookId)
    || !validChecksum(projection.checksum)
    || !positiveInt(projection.physicalPageCount)
    || !PURPOSES.includes(projection.purpose as BookSourcePurpose)
    || !SAFE_STATUSES.includes(projection.studentSafeStatus as BookSourceStudentSafeStatus)
    || typeof projection.verifiedUsable !== 'boolean') return false;
  return projection.studentSafeStatus === 'unreviewed'
    ? !Object.hasOwn(projection, 'studentSafeDecision')
    : validDecision(projection.studentSafeDecision, projection.sourceVersionId, projection.checksum);
};

const conflict = (
  input: AttachMaterialBookSourceInput,
  fingerprint: string,
  reason: MaterialBookSourceAttachmentConflictCode,
  status: MaterialBookSourceAttachmentResult['status'] = 'conflict',
): MaterialBookSourceAttachmentResult => ({
  status,
  operationId: input.operationId,
  fingerprint,
  reason,
});

const replay = (
  input: AttachMaterialBookSourceInput,
  fingerprint: string,
  receipt: MaterialBookSourceAttachmentOperationReceipt,
  activation?: MaterialBookSetupActivation,
): MaterialBookSourceAttachmentResult => ({
  status: 'replayed',
  operationId: input.operationId,
  fingerprint,
  receipt: clone(receipt),
  bookRevision: receipt.bookRevision,
  sourceSetRevision: receipt.sourceSetRevision,
  sourceSet: clone(receipt.sourceSet),
  ...(activation ? { activation: clone(activation) } : {}),
});

const sameOperation = (
  receipt: MaterialBookSourceAttachmentOperationReceipt,
  input: AttachMaterialBookSourceInput,
  fingerprint: string,
): boolean => receipt.operationId === input.operationId
  && receipt.ownerId === input.ownerId
  && receipt.bookId === input.bookId
  && receipt.fingerprint === fingerprint;

const sourceVersionProjection = (
  scope: MaterialBookSourceAttachmentScope,
  sourceVersionId: string,
): MaterialBookSourceVersionProjection | undefined => scope.sourceVersionProjections[sourceVersionId];

const execute = async (
  repository: MaterialBookSourceAttachmentRepository,
  input: AttachMaterialBookSourceInput,
): Promise<MaterialBookSourceAttachmentResult> => {
  const fingerprint = fingerprintMaterialBookSourceAttachment(input);
  if (!validInput(input)) return conflict(input, fingerprint, 'invalid-input', 'invalid');
  if (input.sourceSet.sourceStrategy === 'component_pdfs' && !input.activation) {
    return conflict(input, fingerprint, 'activation-required', 'forbidden');
  }

  return repository.transaction({
    bookId: input.bookId,
    operationId: input.operationId,
    operationFingerprint: fingerprint,
    sourceSet: clone(input.sourceSet),
    expectedBookRevision: input.expectedBookRevision,
    expectedSourceSetRevision: input.expectedSourceSetRevision,
    mutate: (current) => {
      const stored = current.operations?.[input.operationId];
      if (stored) {
        const activation = current.book?.setupActivations?.find(
          (candidate) => candidate.operationId === input.operationId,
        );
        const output = sameOperation(stored, input, fingerprint)
          ? replay(input, fingerprint, stored, activation)
          : conflict(input, fingerprint, 'idempotency-conflict');
        return { outcome: output, write: false };
      }

      const book = current.book;
      if (!book) return { outcome: conflict(input, fingerprint, 'book-not-found'), write: false };
      if (book.bookId !== input.bookId) {
        return { outcome: conflict(input, fingerprint, 'wrong-book'), write: false };
      }
      if (book.ownerId !== input.ownerId) {
        return { outcome: conflict(input, fingerprint, 'wrong-owner', 'forbidden'), write: false };
      }
      if (book.bookMode !== 'pdf') {
        return { outcome: conflict(input, fingerprint, 'wrong-book-mode'), write: false };
      }
      if (book.status !== 'draft-empty' && book.status !== 'draft-in-progress' && book.status !== 'ready') {
        return { outcome: conflict(input, fingerprint, 'invalid-book-status'), write: false };
      }
      if (!revision(book.bookRevision) || !revision(book.sourceSetRevision)
        || book.bookRevision !== input.expectedBookRevision
        || book.sourceSetRevision !== input.expectedSourceSetRevision) {
        return { outcome: conflict(input, fingerprint, 'stale-revision'), write: false };
      }

      for (const source of input.sourceSet.sources) {
        const projection = sourceVersionProjection(current, source.sourceVersionId);
        if (!projection) {
          return { outcome: conflict(input, fingerprint, 'missing-source-projection'), write: false };
        }
        if (!validProjection(projection)) {
          return { outcome: conflict(input, fingerprint, 'invalid-source-projection'), write: false };
        }
        if (projection.sourceVersionId !== source.sourceVersionId || projection.bookId !== input.bookId) {
          return { outcome: conflict(input, fingerprint, 'source-book-mismatch'), write: false };
        }
        if (projection.sourceKey !== source.sourceKey) {
          return { outcome: conflict(input, fingerprint, 'source-identity-mismatch'), write: false };
        }
        if (projection.purpose !== 'book-source' || projection.studentSafeStatus === 'rejected') {
          return { outcome: conflict(input, fingerprint, 'unverified-source'), write: false };
        }
        if (!projection.verifiedUsable) {
          return { outcome: conflict(input, fingerprint, 'unverified-source'), write: false };
        }
      }

      const nextBookRevision = input.expectedBookRevision + 1;
      const nextSourceSetRevision = input.expectedSourceSetRevision + 1;
      const status = book.sourceSet == null ? 'attached' : 'replaced';
      const receipt: MaterialBookSourceAttachmentOperationReceipt = Object.freeze({
        operationId: input.operationId,
        ownerId: input.ownerId,
        bookId: input.bookId,
        fingerprint,
        status,
        bookRevision: nextBookRevision,
        sourceSetRevision: nextSourceSetRevision,
        sourceSet: clone(input.sourceSet),
      });
      const nextBook = {
        ...clone(book),
        status: 'ready',
        sourceSet: clone(input.sourceSet),
        sourceSetRevision: nextSourceSetRevision,
        bookRevision: nextBookRevision,
        ...(input.activation ? { setupActivations: appendComponentPdfActivationReceipt(
          book.setupActivations,
          createComponentPdfActivationReceipt({
            operationId: input.operationId,
            ownerId: input.ownerId,
            bookId: input.bookId,
            expectedBookRevision: input.expectedBookRevision,
            expectedSourceSetRevision: input.expectedSourceSetRevision,
            sourceSet: input.sourceSet,
            ...input.activation,
          }),
        ) } : {}),
      } as MaterialBookSourceAttachmentBook;
      const activation = input.activation
        ? nextBook.setupActivations?.find((candidate) => candidate.operationId === input.operationId)
        : undefined;
      const next: MaterialBookSourceAttachmentScope = {
        ...current,
        book: nextBook,
        operations: {
          ...(current.operations ?? {}),
          [input.operationId]: receipt,
        },
      };
      const output: MaterialBookSourceAttachmentResult = {
        status,
        operationId: input.operationId,
        fingerprint,
        receipt: clone(receipt),
        bookRevision: nextBookRevision,
        sourceSetRevision: nextSourceSetRevision,
        sourceSet: clone(input.sourceSet),
        ...(activation ? { activation: clone(activation) } : {}),
      };
      return { outcome: output, next, write: true };
    },
  });
};

export const createMaterialBookSourceAttachmentService = (
  repository: MaterialBookSourceAttachmentRepository,
): MaterialBookSourceAttachmentService => Object.freeze({
  attach: (input: AttachMaterialBookSourceInput) => execute(repository, input),
  replace: (input: AttachMaterialBookSourceInput) => execute(repository, input),
});

export const createMaterialBookSourceAttachment = createMaterialBookSourceAttachmentService;

export const attachMaterialBookSource = (
  repository: MaterialBookSourceAttachmentRepository,
  input: AttachMaterialBookSourceInput,
): Promise<MaterialBookSourceAttachmentResult> => execute(repository, input);

export const attachOrReplaceMaterialBookSource = attachMaterialBookSource;
