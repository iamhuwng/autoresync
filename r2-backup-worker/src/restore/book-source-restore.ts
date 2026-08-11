import type {
  BookMetadataBackupInventory,
  BookMetadataInventoryRoot,
  BookMetadataRestoreDiagnostic,
  BookMetadataRestorePreview,
  BookMetadataRootFence,
} from '../types';
import {
  normalizeBookSourceDisplayFilename,
} from '../../../src/services/book-source-delivery/sourceDisplayFilename.service';
import {
  validateBookSourceUploadAccountState,
} from '../../../src/services/book-source-delivery/sourceUpload.rtdbRepository';

/** The ZIP entry name is deliberately not a provider or PDF storage path. */
export const BOOK_METADATA_INVENTORY_NODE = 'book_metadata_inventory';
export const BOOK_METADATA_INVENTORY_VERSION = 'prd0062-48b-v1' as const;
export const BOOK_METADATA_SCHEMA_VERSION = 1 as const;

/**
 * Final Book metadata roots are listed as non-overlapping read/write units.
 * Each unit is fetched by this exact path; no parent wildcard or broad scan
 * is used by the Book inventory.
 */
export const BOOK_METADATA_CANONICAL_ROOTS = Object.freeze([
  'book_activity/materials',
  'book_activity/versions',
  'book_activity/student_safe_projections',
  'book_activity/revision_control',
  'book_activity/canonical_fork_operations',
  'book_activity_authoring/owners',
  'book_activity_evaluations/scopes',
  'book_activity_integrity/scopes',
  'book_activity_integrity/reports',
  'book_activity_integrity/reports_by_teacher',
  'book_assembly/books',
  'book_assembly_component_pdfs_publications/books',
  'book_assembly_full_pdf_publications/books',
  'book_assembly_mapping_revisions',
  'book_assembly_publication_successors',
  'book_assembly_publications',
  'book_delivery/bindings/class-course',
  'book_delivery/current',
  'book_delivery/indexes',
  'book_delivery/operations',
  'book_delivery/records',
  'book_delivery/scopes',
  'book_homework/operations',
  'book_impact_discovery/indexes',
  'book_impact_discovery/scopes',
  'book_impact_snapshots/current',
  'book_impact_snapshots/indexes',
  'book_impact_snapshots/records',
  'book_impact_snapshot_recovery',
  'book_replacement_contexts',
  'book_replacement_context_recovery',
  'book_replacement_plans',
  'book_replacement_sagas',
  'book_replacement_saga_recovery',
  'book_result_read_models/details',
  'book_result_read_models/homework',
  'book_result_read_models/students',
  'book_retired_byte_deletions/by_idempotency',
  'book_retired_byte_deletions/records',
  'book_retired_byte_deletion_recovery',
  'book_runtime/homework_completion',
  'book_runtime/scopes',
  'book_source_upload_accounts',
  'book_update_action_recovery',
  'book_update_actions/by_book',
  'book_update_actions/by_idempotency',
  'book_update_actions/records',
  'book_update_checkpoints/by_student',
  'book_update_checkpoints/records',
  'book_update_redo/binding_transitions',
  'book_update_redo/history_exclusions',
  'class_book_authority/copies',
  'class_book_authority/placements/current',
  'class_book_authority/placements/versions',
  'class_book_authority/progress',
  'class_book_authority/results',
  // The canonical lock path is classes/$classId/book_locks/$classPlacementId;
  // the exact static read unit is the classes root because class IDs are data.
  'classes',
  'course_book_authority/enrollments',
  'course_book_authority/operations',
  'course_book_authority/releases',
  'material_catalog/book_indexes',
  'material_catalog/book_nodes',
  'material_catalog/book_successor_operations',
  'material_catalog/books',
  'material_catalog/material_summary_indexes/v1',
  'material_catalog/public_book_projections',
] as const);

export const BOOK_METADATA_REQUIRED_ROOTS = BOOK_METADATA_CANONICAL_ROOTS;
export const BOOK_METADATA_ROOT_COUNT = BOOK_METADATA_CANONICAL_ROOTS.length;

/** Top-level markers that cause a production backup to capture the inventory. */
export const BOOK_METADATA_DISCOVERY_ROOTS = Object.freeze([
  ...new Set(BOOK_METADATA_CANONICAL_ROOTS.map((path) => path.split('/')[0])),
]);

/** These roots contain only Book state and must not also enter legacy restore. */
export const BOOK_METADATA_EXCLUSIVE_TOP_LEVEL_ROOTS = Object.freeze([
  ...new Set(
    BOOK_METADATA_CANONICAL_ROOTS
      .map((path) => path.split('/')[0])
      .filter((root) => root.startsWith('book_') || root === 'class_book_authority' || root === 'course_book_authority'),
  ),
]);

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const SAFE_ROOT_PATH = /^[a-z][a-z0-9_-]*(?:\/[a-z][a-z0-9_-]*)*$/u;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const FORBIDDEN_BODY_KEY = /^(?:pdf(?:bytes|body|content|data)|(?:body|byte|document|payload)bytes|bytepayload|buffer|stream)$/iu;
const ID_FIELDS = new Set([
  'accountId',
  'activityId',
  'activityVersionId',
  'bindingId',
  'bookId',
  'contextId',
  'courseId',
  'homeworkId',
  'manifestVersionId',
  'nodeId',
  'operationId',
  'ownerId',
  'placementId',
  'publicationId',
  'recipientId',
  'reservationId',
  'sagaId',
  'sourceVersionId',
  'studentId',
  'tenantId',
  'unitId',
  'versionId',
]);
const NUMERIC_VERSION_FIELDS = new Set([
  'attempt',
  'attemptCount',
  'currentRevision',
  'order',
  'revision',
  'schemaVersion',
  'sequence',
  'version',
  'versionNumber',
]);
const TERMINAL_STATUSES = new Set([
  'cancelled',
  'canceled',
  'closed',
  'completed',
  'committed',
  'deleted',
  'done',
  'failed',
  'released',
  'succeeded',
  'success',
  'verified_completed',
]);
const REFERENCE_FIELDS = new Set([
  'activityId',
  'activityVersionId',
  'bindingId',
  'bookId',
  'manifestVersionId',
  'nodeId',
  'placementId',
  'publicationId',
  'sourceVersionId',
  'unitId',
]);

export interface BookMetadataInventoryCapture {
  readonly path: string;
  readonly present: boolean;
  readonly data: unknown;
  readonly bytes?: number;
}

export interface BookMetadataRootRead {
  readonly path: string;
  readonly present: boolean;
  readonly data: unknown;
  readonly etag: string | null;
  readonly revision: number | null;
  readonly bytes: number;
}

export interface BookMetadataValidationOptions {
  readonly availableSourceVersionIds?: Iterable<string>;
  readonly sourceVersionAvailability?: Readonly<Record<string, boolean>>;
  readonly expectedFirebaseProject?: string;
}

export interface BookMetadataValidationResult {
  readonly valid: boolean;
  readonly inventory: BookMetadataBackupInventory | null;
  readonly diagnostics: readonly BookMetadataRestoreDiagnostic[];
  readonly missingSourceVersionIds: readonly string[];
}

export interface BookMetadataRestorePlan {
  readonly inventory: BookMetadataBackupInventory;
  readonly inventoryFingerprint: string;
  readonly orderedWrites: readonly {
    readonly path: string;
    readonly data: Record<string, unknown>;
  }[];
  readonly sourceVersionIds: readonly string[];
  readonly missingSourceVersionIds: readonly string[];
}

export interface BookMetadataRestoreInput extends BookMetadataValidationOptions {
  readonly snapshot: unknown;
}

export class BookMetadataRestoreValidationError extends Error {
  readonly code: string;
  readonly diagnostics: readonly BookMetadataRestoreDiagnostic[];

  constructor(
    diagnostics: readonly BookMetadataRestoreDiagnostic[] | BookMetadataRestoreDiagnostic | string,
    code = 'invalid-book-metadata',
  ) {
    const normalized = typeof diagnostics === 'string'
      ? [{ code, path: '$', message: diagnostics }]
      : Array.isArray(diagnostics) ? diagnostics : [diagnostics];
    super(normalized.map((entry) => `${entry.path}: ${entry.message}`).join('; '));
    this.name = 'BookMetadataRestoreValidationError';
    this.code = normalized[0]?.code ?? code;
    this.diagnostics = Object.freeze([...normalized]);
  }
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
);

const clone = <T>(value: T): T => structuredClone(value);

const stableSerialize = (value: unknown, seen = new WeakSet<object>()): string => {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite metadata is not valid JSON.');
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value !== 'object') throw new Error('metadata contains a non-JSON value.');
  if (seen.has(value)) throw new Error('cyclic metadata is not valid JSON.');
  seen.add(value);
  let result: string;
  if (Array.isArray(value)) {
    result = `[${value.map((entry) => stableSerialize(entry, seen)).join(',')}]`;
  } else {
    const record = value as Record<string, unknown>;
    result = `{${Object.keys(record).sort().map((key) => (
      `${JSON.stringify(key)}:${stableSerialize(record[key], seen)}`
    )).join(',')}}`;
  }
  seen.delete(value);
  return result;
};

/** Stable non-body fingerprint used to detect preview drift and collisions. */
export const fingerprintBookMetadata = (value: unknown): string => {
  let hash = 0xcbf29ce484222325n;
  for (const character of stableSerialize(value)) {
    hash ^= BigInt(character.charCodeAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
};

const addDiagnostic = (
  diagnostics: BookMetadataRestoreDiagnostic[],
  code: string,
  path: string,
  message: string,
): void => {
  if (!diagnostics.some((entry) => entry.code === code && entry.path === path && entry.message === message)) {
    diagnostics.push({ code, path, message });
  }
};

const safeIdentifier = (value: unknown): value is string => (
  typeof value === 'string' && SAFE_IDENTIFIER.test(value)
);

const nonNegativeSafeInteger = (value: unknown): value is number => (
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
);

const countEntities = (value: Record<string, unknown>): number => Object.keys(value).length;

const sourceVersionRefs = (value: unknown, rootPath: string, refs = new Set<string>()): Set<string> => {
  if (Array.isArray(value)) {
    for (const entry of value) sourceVersionRefs(entry, rootPath, refs);
    return refs;
  }
  if (!isPlainRecord(value)) return refs;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'sourceVersionId' && rootPath !== 'book_source_upload_accounts' && safeIdentifier(child)) {
      refs.add(child);
    }
    sourceVersionRefs(child, rootPath, refs);
  }
  return refs;
};

const rootCaptureMap = (captures: readonly BookMetadataInventoryCapture[]): Map<string, BookMetadataInventoryCapture> => {
  const result = new Map<string, BookMetadataInventoryCapture>();
  for (const capture of captures) {
    if (!(BOOK_METADATA_CANONICAL_ROOTS as readonly string[]).includes(capture.path)) {
      throw new BookMetadataRestoreValidationError({
        code: 'invalid-root-path',
        path: `$.roots[${capture.path}]`,
        message: 'A capture must use an enumerated canonical Book root.',
      });
    }
    if (result.has(capture.path)) {
      throw new BookMetadataRestoreValidationError({
        code: 'duplicate-root',
        path: `$.roots[${capture.path}]`,
        message: 'A canonical root was captured more than once.',
      });
    }
    result.set(capture.path, capture);
  }
  return result;
};

/** Construct the versioned inventory from the exact root reads. */
export function createBookMetadataBackupInventory(input: {
  readonly backupId: string;
  readonly firebaseProject: string;
  readonly generatedAt: string;
  readonly roots: readonly BookMetadataInventoryCapture[];
}): BookMetadataBackupInventory {
  const captures = rootCaptureMap(input.roots);
  const missing = BOOK_METADATA_CANONICAL_ROOTS.filter((path) => !captures.has(path));
  if (missing.length > 0) {
    throw new BookMetadataRestoreValidationError({
      code: 'missing-required-root',
      path: '$.roots',
      message: `Missing exact required root capture(s): ${missing.join(', ')}.`,
    });
  }

  const roots = BOOK_METADATA_CANONICAL_ROOTS.map((path, order) => {
    const capture = captures.get(path)!;
    if (!isPlainRecord(capture.data)) {
      throw new BookMetadataRestoreValidationError({
        code: 'invalid-root-schema',
        path: `$.roots[${order}].data`,
        message: 'A canonical root capture must contain a plain metadata object.',
      });
    }
    if (!capture.present && Object.keys(capture.data).length > 0) {
      throw new BookMetadataRestoreValidationError({
        code: 'invalid-root-schema',
        path: `$.roots[${order}].data`,
        message: 'An absent canonical root must contain no captured metadata.',
      });
    }
    const data = capture.present ? capture.data : {};
    return {
      path,
      order,
      required: true as const,
      schemaVersion: BOOK_METADATA_SCHEMA_VERSION,
      present: capture.present,
      data: clone(data),
      entityCount: capture.present ? countEntities(data) : 0,
      contentFingerprint: fingerprintBookMetadata(data),
    } satisfies BookMetadataInventoryRoot;
  });

  const inventory: BookMetadataBackupInventory = {
    kind: 'book-metadata-inventory',
    inventoryVersion: BOOK_METADATA_INVENTORY_VERSION,
    schemaVersion: BOOK_METADATA_SCHEMA_VERSION,
    backupId: input.backupId,
    firebaseProject: input.firebaseProject,
    generatedAt: input.generatedAt,
    bytePolicy: 'metadata-only',
    pdfBodyReads: 0,
    pdfBodyWrites: 0,
    pdfBodyBytes: 0,
    rootCount: roots.length,
    roots,
    sourceVersionIds: [...sourceVersionRefsFromRoots(roots)].sort(),
    audit: {
      bounded: true,
      provenance: Object.freeze([
        'firebase-rtdb:explicit-canonical-paths',
        'book-pdf-body:never-read-or-written',
      ]),
    },
  };

  assertBookMetadataBackupInventory(inventory);
  return inventory;
}

const sourceVersionRefsFromRoots = (roots: readonly BookMetadataInventoryRoot[]): Set<string> => {
  const refs = new Set<string>();
  for (const root of roots) sourceVersionRefs(root.data, root.path.split('/')[0], refs);
  return refs;
};

interface BookMetadataReference {
  readonly field: string;
  readonly value: string;
  readonly path: string;
}

const declaredIdentifierFields = (rootPath: string): readonly string[] => {
  if (rootPath === 'material_catalog/books' || rootPath === 'book_assembly/books') return ['bookId'];
  if (rootPath === 'book_activity/materials') return ['activityId'];
  if (rootPath === 'book_activity/versions') return ['activityId', 'activityVersionId', 'versionId'];
  if (rootPath === 'book_delivery/records' || rootPath === 'book_delivery/current') return ['bindingId'];
  if (rootPath === 'material_catalog/book_nodes') return ['nodeId', 'unitId'];
  if (rootPath === 'class_book_authority/placements/current' || rootPath === 'class_book_authority/placements/versions') return ['placementId'];
  return [];
};

const collectIdentifiers = (
  value: unknown,
  path: string,
  declaredFields: ReadonlySet<string>,
  declarations: Map<string, Set<string>>,
  references: BookMetadataReference[],
  seen = new WeakSet<object>(),
): void => {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectIdentifiers(entry, `${path}[${index}]`, declaredFields, declarations, references, seen));
    return;
  }
  if (!isPlainRecord(value) || seen.has(value)) return;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (REFERENCE_FIELDS.has(key) && safeIdentifier(child)) {
      references.push({ field: key, value: child, path: `${path}.${key}` });
    }
    if (declaredFields.has(key) && safeIdentifier(child)) {
      const values = declarations.get(key) ?? new Set<string>();
      values.add(child);
      declarations.set(key, values);
    }
    collectIdentifiers(child, `${path}.${key}`, declaredFields, declarations, references, seen);
  }
  seen.delete(value);
};

const inspectMetadata = (
  value: unknown,
  path: string,
  rootPath: string,
  diagnostics: BookMetadataRestoreDiagnostic[],
  refs: Set<string>,
  ownerByBook: Map<string, string>,
  tenantByOwner: Map<string, string>,
  idempotencyByKey: Map<string, { requestHash: string | null; fingerprint: string; path: string }>,
  seen = new WeakSet<object>(),
): void => {
  if (Array.isArray(value)) {
    if (value.length > 100_000) {
      addDiagnostic(diagnostics, 'bounded-data', path, 'Metadata array exceeds the bounded restore limit.');
      return;
    }
    value.forEach((entry, index) => inspectMetadata(
      entry,
      `${path}[${index}]`,
      rootPath,
      diagnostics,
      refs,
      ownerByBook,
      tenantByOwner,
      idempotencyByKey,
      seen,
    ));
    return;
  }
  if (value === undefined || typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') {
    addDiagnostic(diagnostics, 'invalid-schema', path, 'Metadata must contain only JSON values.');
    return;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    addDiagnostic(diagnostics, 'invalid-schema', path, 'Metadata numbers must be finite JSON numbers.');
    return;
  }
  if (value === null || typeof value !== 'object') return;
  if (!isPlainRecord(value)) {
    addDiagnostic(diagnostics, 'invalid-schema', path, 'Metadata records must be plain JSON objects.');
    return;
  }
  if (seen.has(value)) {
    addDiagnostic(diagnostics, 'cyclic-data', path, 'Metadata must be acyclic JSON.');
    return;
  }
  seen.add(value);

  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string' || !Object.prototype.propertyIsEnumerable.call(value, key))) {
    addDiagnostic(diagnostics, 'invalid-schema', path, 'Metadata cannot contain symbol or non-enumerable fields.');
  }
  const record = value;
  const ownerId = record.ownerId;
  const bookId = record.bookId;
  const tenantId = record.tenantId;
  if (ownerId !== undefined && !safeIdentifier(ownerId)) {
    addDiagnostic(diagnostics, 'invalid-owner', `${path}.ownerId`, 'ownerId must be a safe identifier.');
  }
  if (tenantId !== undefined && !safeIdentifier(tenantId)) {
    addDiagnostic(diagnostics, 'invalid-tenant', `${path}.tenantId`, 'tenantId must be a safe identifier.');
  }
  if (safeIdentifier(bookId) && safeIdentifier(ownerId)) {
    const previousOwner = ownerByBook.get(bookId);
    if (previousOwner !== undefined && previousOwner !== ownerId) {
      addDiagnostic(diagnostics, 'owner-collision', `${path}.ownerId`, `Book ${bookId} is owned by more than one owner.`);
    } else {
      ownerByBook.set(bookId, ownerId);
    }
    if (safeIdentifier(tenantId)) {
      const previousTenant = tenantByOwner.get(ownerId);
      if (previousTenant !== undefined && previousTenant !== tenantId) {
        addDiagnostic(diagnostics, 'tenant-collision', `${path}.tenantId`, `Owner ${ownerId} crosses tenant boundaries.`);
      } else {
        tenantByOwner.set(ownerId, tenantId);
      }
    }
  }

  for (const [key, child] of Object.entries(record)) {
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_BODY_KEY.test(key)) {
      addDiagnostic(diagnostics, 'pdf-body-field', childPath, 'Book PDF body or byte payload fields are not restorable metadata.');
    }
    if (ID_FIELDS.has(key) && child !== null && child !== undefined && !safeIdentifier(child)) {
      addDiagnostic(diagnostics, 'invalid-reference', childPath, `${key} must be a safe identifier.`);
    }
    if (key === 'sourceVersionId' && rootPath !== 'book_source_upload_accounts' && safeIdentifier(child)) {
      refs.add(child);
    }
    if (key === 'originalFilename') {
      try {
        if (child !== normalizeBookSourceDisplayFilename(child)) {
          addDiagnostic(diagnostics, 'invalid-filename', childPath, 'originalFilename must already be normalized.');
        }
      } catch {
        addDiagnostic(diagnostics, 'invalid-filename', childPath, 'originalFilename must be a bounded normalized PDF display filename.');
      }
    }
    if (NUMERIC_VERSION_FIELDS.has(key) && !nonNegativeSafeInteger(child)) {
      addDiagnostic(diagnostics, 'invalid-version', childPath, `${key} must be a non-negative safe integer.`);
    }
    if (key === 'idempotencyKey' || key === 'idempotencyKeyHash') {
      if (!safeIdentifier(child)) {
        addDiagnostic(diagnostics, 'invalid-idempotency', childPath, `${key} must be a safe identifier.`);
      } else {
        const requestHash = typeof record.requestHash === 'string'
          ? record.requestHash
          : typeof record.fingerprint === 'string' ? record.fingerprint : null;
        const fingerprint = fingerprintBookMetadata(record);
        const previous = idempotencyByKey.get(`${key}:${child}`);
        if (previous) {
          const sameRequest = requestHash !== null && previous.requestHash !== null
            ? previous.requestHash === requestHash
            : previous.fingerprint === fingerprint;
          if (!sameRequest) {
            addDiagnostic(diagnostics, 'idempotency-collision', childPath, `Idempotency key collides with a different request at ${previous.path}.`);
          }
        } else {
          idempotencyByKey.set(`${key}:${child}`, { requestHash, fingerprint, path: childPath });
        }
      }
    }
    if (key === 'status' && child !== null && child !== undefined && typeof child !== 'string') {
      addDiagnostic(diagnostics, 'invalid-terminal-state', childPath, 'Terminal/idempotency status must be a string.');
    }
    inspectMetadata(
      child,
      childPath,
      rootPath,
      diagnostics,
      refs,
      ownerByBook,
      tenantByOwner,
      idempotencyByKey,
      seen,
    );
  }

  if (typeof record.status === 'string' && TERMINAL_STATUSES.has(record.status)
    && (record.active === true || record.leaseOwner !== undefined || record.leaseExpiresAt !== undefined)) {
    addDiagnostic(diagnostics, 'invalid-terminal-state', path, 'Terminal state cannot retain an active lease or active marker.');
  }
  seen.delete(value);
};

/** Validate every root, schema, identity, reference, and lifecycle fence. */
export function validateBookMetadataBackupInventory(
  value: unknown,
  options: BookMetadataValidationOptions = {},
): BookMetadataValidationResult {
  const diagnostics: BookMetadataRestoreDiagnostic[] = [];
  if (!isPlainRecord(value)) {
    return { valid: false, inventory: null, diagnostics: [{ code: 'invalid-inventory', path: '$', message: 'Book metadata inventory must be a plain object.' }], missingSourceVersionIds: [] };
  }

  const inventory = value as unknown as BookMetadataBackupInventory;
  const inventoryOwnKeys = Reflect.ownKeys(inventory);
  if (inventoryOwnKeys.some((key) => typeof key !== 'string' || !Object.prototype.propertyIsEnumerable.call(inventory, key))) {
    addDiagnostic(diagnostics, 'invalid-schema', '$', 'Inventory cannot contain symbol or non-enumerable fields.');
  }
  const inventoryKeys = new Set([
    'kind', 'inventoryVersion', 'schemaVersion', 'backupId', 'firebaseProject',
    'generatedAt', 'bytePolicy', 'pdfBodyReads', 'pdfBodyWrites', 'pdfBodyBytes',
    'rootCount', 'roots', 'sourceVersionIds', 'audit',
  ]);
  for (const key of Object.keys(inventory)) {
    if (!inventoryKeys.has(key)) addDiagnostic(diagnostics, 'invalid-schema', `$.${key}`, 'Inventory contains an unsupported field.');
  }
  if (inventory.kind !== 'book-metadata-inventory') addDiagnostic(diagnostics, 'invalid-schema', '$.kind', 'Inventory kind is invalid.');
  if (inventory.inventoryVersion !== BOOK_METADATA_INVENTORY_VERSION) addDiagnostic(diagnostics, 'invalid-version', '$.inventoryVersion', 'Inventory version is not the accepted PRD0062 48B version.');
  if (inventory.schemaVersion !== BOOK_METADATA_SCHEMA_VERSION) addDiagnostic(diagnostics, 'invalid-version', '$.schemaVersion', 'Inventory schema version is invalid.');
  if (typeof inventory.backupId !== 'string' || !SAFE_IDENTIFIER.test(inventory.backupId)) addDiagnostic(diagnostics, 'invalid-schema', '$.backupId', 'backupId must be a safe identifier.');
  if (typeof inventory.firebaseProject !== 'string' || inventory.firebaseProject.length === 0 || inventory.firebaseProject.length > 200) addDiagnostic(diagnostics, 'invalid-owner', '$.firebaseProject', 'firebaseProject must be bounded metadata.');
  if (options.expectedFirebaseProject !== undefined && inventory.firebaseProject !== options.expectedFirebaseProject) addDiagnostic(diagnostics, 'project-mismatch', '$.firebaseProject', 'Inventory belongs to a different Firebase project.');
  if (typeof inventory.generatedAt !== 'string' || !ISO_DATE.test(inventory.generatedAt) || !Number.isFinite(Date.parse(inventory.generatedAt))) addDiagnostic(diagnostics, 'invalid-schema', '$.generatedAt', 'generatedAt must be a UTC ISO timestamp.');
  if (inventory.bytePolicy !== 'metadata-only') addDiagnostic(diagnostics, 'pdf-body-field', '$.bytePolicy', 'Book backup policy must be metadata-only.');
  if (inventory.pdfBodyReads !== 0 || inventory.pdfBodyWrites !== 0 || inventory.pdfBodyBytes !== 0) addDiagnostic(diagnostics, 'pdf-body-field', '$', 'Book PDF body operations must remain zero.');
  if (inventory.rootCount !== BOOK_METADATA_ROOT_COUNT) addDiagnostic(diagnostics, 'missing-required-root', '$.rootCount', `Inventory must contain exactly ${BOOK_METADATA_ROOT_COUNT} canonical roots.`);
  if (!Array.isArray(inventory.roots)) addDiagnostic(diagnostics, 'missing-required-root', '$.roots', 'Inventory roots must be an ordered array.');
  if (!Array.isArray(inventory.sourceVersionIds)) addDiagnostic(diagnostics, 'invalid-reference', '$.sourceVersionIds', 'sourceVersionIds must be an array.');
  if (!isPlainRecord(inventory.audit) || inventory.audit.bounded !== true || !Array.isArray(inventory.audit.provenance)) addDiagnostic(diagnostics, 'invalid-audit', '$.audit', 'Bounded audit provenance is required.');

  const roots = Array.isArray(inventory.roots) ? inventory.roots : [];
  const seenPaths = new Set<string>();
  const refs = new Set<string>();
  const ownerByBook = new Map<string, string>();
  const tenantByOwner = new Map<string, string>();
  const idempotencyByKey = new Map<string, { requestHash: string | null; fingerprint: string; path: string }>();
  const declarations = new Map<string, Set<string>>();
  const references: BookMetadataReference[] = [];
  const sourceRoot = roots.find((root) => isPlainRecord(root) && root.path === 'book_source_upload_accounts') as BookMetadataInventoryRoot | undefined;

  for (let index = 0; index < roots.length; index += 1) {
    const root = roots[index];
    const path = isPlainRecord(root) && typeof root.path === 'string' ? root.path : `roots[${index}]`;
    if (seenPaths.has(path)) addDiagnostic(diagnostics, 'duplicate-root', `$.roots[${index}].path`, 'Canonical root is duplicated.');
    seenPaths.add(path);
    if (path !== BOOK_METADATA_CANONICAL_ROOTS[index]) addDiagnostic(diagnostics, 'root-order', `$.roots[${index}].path`, `Expected canonical root ${BOOK_METADATA_CANONICAL_ROOTS[index] ?? 'at this position'}.`);
    if (!SAFE_ROOT_PATH.test(path) || path.includes('$') || path.includes('*')) addDiagnostic(diagnostics, 'invalid-root-path', `$.roots[${index}].path`, 'Root path must be an explicit safe path without wildcards.');
    if (!isPlainRecord(root)) continue;
    for (const key of Object.keys(root)) {
      if (!new Set(['path', 'order', 'required', 'schemaVersion', 'present', 'data', 'entityCount', 'contentFingerprint']).has(key)) {
        addDiagnostic(diagnostics, 'invalid-schema', `$.roots[${index}].${key}`, 'Root contains an unsupported field.');
      }
    }
    if (root.order !== index) addDiagnostic(diagnostics, 'root-order', `$.roots[${index}].order`, 'Root order must equal its array position.');
    if (root.required !== true) addDiagnostic(diagnostics, 'missing-required-root', `$.roots[${index}].required`, 'Every canonical Book root must be marked required.');
    if (root.schemaVersion !== BOOK_METADATA_SCHEMA_VERSION) addDiagnostic(diagnostics, 'invalid-version', `$.roots[${index}].schemaVersion`, 'Root schema version is invalid.');
    if (typeof root.present !== 'boolean') addDiagnostic(diagnostics, 'invalid-schema', `$.roots[${index}].present`, 'Root presence marker is required.');
    if (!isPlainRecord(root.data)) addDiagnostic(diagnostics, 'invalid-schema', `$.roots[${index}].data`, 'Root data must be a plain metadata object.');
    if (!nonNegativeSafeInteger(root.entityCount)) addDiagnostic(diagnostics, 'invalid-schema', `$.roots[${index}].entityCount`, 'Root entityCount must be a non-negative safe integer.');
    if (isPlainRecord(root.data)) {
      if (!root.present && (Object.keys(root.data).length !== 0 || root.entityCount !== 0)) addDiagnostic(diagnostics, 'invalid-schema', `$.roots[${index}]`, 'An absent root must have an empty data object and zero entity count.');
      if (root.entityCount !== Object.keys(root.data).length) addDiagnostic(diagnostics, 'invalid-schema', `$.roots[${index}].entityCount`, 'Root entityCount does not match the captured metadata object.');
      try {
        if (root.contentFingerprint !== fingerprintBookMetadata(root.data)) addDiagnostic(diagnostics, 'inventory-drift', `$.roots[${index}].contentFingerprint`, 'Root content fingerprint does not match its metadata.');
      } catch {
        addDiagnostic(diagnostics, 'invalid-schema', `$.roots[${index}].data`, 'Root data is not deterministic JSON.');
      }
      inspectMetadata(root.data, `$.roots[${index}].data`, path.split('/')[0], diagnostics, refs, ownerByBook, tenantByOwner, idempotencyByKey);
      const declaredFields = new Set(declaredIdentifierFields(path));
      collectIdentifiers(root.data, `$.roots[${index}].data`, declaredFields, declarations, references);
    }
  }

  if (isPlainRecord(inventory.audit)) {
    for (const key of Object.keys(inventory.audit)) {
      if (!new Set(['bounded', 'provenance']).has(key)) addDiagnostic(diagnostics, 'invalid-audit', `$.audit.${key}`, 'Audit contains an unsupported field.');
    }
    if (Array.isArray(inventory.audit.provenance) && inventory.audit.provenance.length > 32) {
      addDiagnostic(diagnostics, 'invalid-audit', '$.audit.provenance', 'Audit provenance is bounded to 32 entries.');
    }
    if (Array.isArray(inventory.audit.provenance)
      && inventory.audit.provenance.some((entry) => typeof entry !== 'string' || entry.length === 0 || entry.length > 200)) {
      addDiagnostic(diagnostics, 'invalid-audit', '$.audit.provenance', 'Audit provenance entries must be bounded strings.');
    }
  }

  const expectedPaths = new Set<string>(BOOK_METADATA_CANONICAL_ROOTS);
  for (const path of expectedPaths) if (!seenPaths.has(path)) addDiagnostic(diagnostics, 'missing-required-root', '$.roots', `Required canonical root ${path} is omitted.`);
  if (seenPaths.size !== roots.length) addDiagnostic(diagnostics, 'duplicate-root', '$.roots', 'Root paths must be unique.');

  const sourceStatuses = new Map<string, string>();
  if (sourceRoot?.present && isPlainRecord(sourceRoot.data)) {
    for (const [accountId, account] of Object.entries(sourceRoot.data)) {
      if (!safeIdentifier(accountId)) addDiagnostic(diagnostics, 'invalid-owner', `$.roots[${sourceRoot.order}].data.${accountId}`, 'Source upload account ID is invalid.');
      try {
        const state = validateBookSourceUploadAccountState(account);
        for (const operation of Object.values(state.operations)) sourceStatuses.set(operation.sourceVersionId, operation.status);
      } catch (error) {
        addDiagnostic(diagnostics, 'invalid-source-state', `$.roots[${sourceRoot.order}].data.${accountId}`, error instanceof Error ? error.message : 'Source upload account state is invalid.');
      }
    }
  }

  const missingSourceVersionIds = new Set<string>();
  for (const sourceVersionId of refs) {
    if (sourceStatuses.get(sourceVersionId) !== 'verified_completed') missingSourceVersionIds.add(sourceVersionId);
  }
  for (const reference of references) {
    if (reference.field === 'sourceVersionId') continue;
    const declarationSet = reference.field === 'activityVersionId'
      ? (declarations.get('activityVersionId') ?? declarations.get('versionId'))
      : declarations.get(reference.field);
    if (declarationSet && !declarationSet.has(reference.value)) {
      addDiagnostic(diagnostics, 'invalid-reference', reference.path, `${reference.field} does not resolve to an inventoried canonical identity.`);
    }
    if ((reference.field === 'bookId' || reference.field === 'activityId') && !declarationSet) {
      addDiagnostic(diagnostics, 'invalid-reference', reference.path, `${reference.field} does not resolve to an inventoried canonical identity.`);
    }
  }
  const availability = options.sourceVersionAvailability;
  const available = options.availableSourceVersionIds ? new Set(options.availableSourceVersionIds) : null;
  for (const sourceVersionId of refs) {
    if (availability && availability[sourceVersionId] !== true) missingSourceVersionIds.add(sourceVersionId);
    if (available && !available.has(sourceVersionId)) missingSourceVersionIds.add(sourceVersionId);
  }
  const listedRefs = Array.isArray(inventory.sourceVersionIds)
    ? inventory.sourceVersionIds.filter((entry): entry is string => {
      if (!safeIdentifier(entry)) {
        addDiagnostic(diagnostics, 'invalid-reference', '$.sourceVersionIds', 'sourceVersionIds must contain safe identifiers.');
        return false;
      }
      return true;
    })
    : [];
  const normalizedRefs = [...refs].sort();
  if (JSON.stringify(listedRefs) !== JSON.stringify(normalizedRefs)) addDiagnostic(diagnostics, 'invalid-reference', '$.sourceVersionIds', 'sourceVersionIds must exactly match cross-root Source Version references in order.');
  for (const sourceVersionId of missingSourceVersionIds) addDiagnostic(diagnostics, 'source-version-missing', `$.sourceVersionIds[${sourceVersionId}]`, `External or canonical Source Version ${sourceVersionId} is unavailable; restore cannot guess or revive it.`);

  const normalizedMissing = [...missingSourceVersionIds].sort();
  return {
    valid: diagnostics.length === 0,
    inventory: diagnostics.some((entry) => entry.code === 'invalid-inventory') ? null : inventory,
    diagnostics: Object.freeze(diagnostics),
    missingSourceVersionIds: Object.freeze(normalizedMissing),
  };
}

export function assertBookMetadataBackupInventory(
  value: unknown,
  options: BookMetadataValidationOptions = {},
): asserts value is BookMetadataBackupInventory {
  const result = validateBookMetadataBackupInventory(value, options);
  if (!result.valid) throw new BookMetadataRestoreValidationError(result.diagnostics);
}

/** Prepare immutable metadata writes; this function has no storage side effects. */
export function prepareBookSourceRestore(
  input: BookMetadataRestoreInput | BookMetadataBackupInventory,
): BookMetadataRestorePlan {
  const rawSnapshot = isPlainRecord(input) && Object.prototype.hasOwnProperty.call(input, 'snapshot')
    ? (input as BookMetadataRestoreInput).snapshot
    : input;
  const options = isPlainRecord(input) && Object.prototype.hasOwnProperty.call(input, 'snapshot')
    ? input as BookMetadataRestoreInput
    : {};
  assertBookMetadataBackupInventory(rawSnapshot, options);
  const inventory = rawSnapshot as BookMetadataBackupInventory;
  return {
    inventory: clone(inventory),
    inventoryFingerprint: fingerprintBookMetadata(inventory),
    orderedWrites: inventory.roots
      .filter((root) => root.present)
      .map((root) => ({ path: root.path, data: clone(root.data) })),
    sourceVersionIds: [...inventory.sourceVersionIds],
    missingSourceVersionIds: [],
  };
}

export interface BookMetadataPreviewCurrentRoot {
  readonly path: string;
  readonly etag: string | null;
  readonly revision: number | null;
}

/** Build a deterministic, write-free preview from exact current-root fences. */
export function buildBookMetadataRestorePreview(
  inventoryValue: unknown,
  backupId: string,
  currentRoots: readonly BookMetadataPreviewCurrentRoot[],
  options: BookMetadataValidationOptions = {},
): BookMetadataRestorePreview {
  const validation = validateBookMetadataBackupInventory(inventoryValue, options);
  const inventory = validation.inventory;
  const diagnostics = [...validation.diagnostics];
  const rootFences: Record<string, BookMetadataRootFence> = {};
  if (inventory && inventory.backupId !== backupId) {
    addDiagnostic(diagnostics, 'backup-mismatch', '$.backupId', 'Inventory backupId does not match the requested backup.');
  }
  const currentByPath = new Map(currentRoots.map((root) => [root.path, root]));
  const currentPaths = new Set<string>();
  for (const current of currentRoots) {
    if (currentPaths.has(current.path)) addDiagnostic(diagnostics, 'duplicate-current-root', `$.rootFences.${current.path}`, 'Current canonical root was read more than once.');
    currentPaths.add(current.path);
    if (!(BOOK_METADATA_CANONICAL_ROOTS as readonly string[]).includes(current.path)) addDiagnostic(diagnostics, 'invalid-current-root', `$.rootFences.${current.path}`, 'Current fence path is not an enumerated canonical root.');
    if (current.revision !== null && !nonNegativeSafeInteger(current.revision)) addDiagnostic(diagnostics, 'invalid-version', `$.rootFences.${current.path}.revision`, 'Current revision must be a non-negative safe integer or null.');
  }
  for (const path of BOOK_METADATA_CANONICAL_ROOTS) {
    const current = currentByPath.get(path);
    if (!current) {
      addDiagnostic(diagnostics, 'missing-current-root', `$.rootFences.${path}`, 'Current canonical root was not read.');
    } else if (typeof current.etag !== 'string' || current.etag.length === 0) {
      addDiagnostic(diagnostics, 'missing-etag', `$.rootFences.${path}`, 'Current canonical root is missing an ETag fence.');
    } else {
      rootFences[path] = { etag: current.etag, revision: current.revision };
    }
  }
  const safeInventory = inventory ?? {
    backupId,
    inventoryVersion: BOOK_METADATA_INVENTORY_VERSION,
    rootCount: 0,
    sourceVersionIds: [],
  };
  const allSourceIds = inventory?.sourceVersionIds ?? [];
  return {
    backupId,
    inventoryVersion: BOOK_METADATA_INVENTORY_VERSION,
    inventoryFingerprint: inventory ? fingerprintBookMetadata(inventory) : 'invalid',
    valid: validation.valid && diagnostics.length === 0,
    allowed: validation.valid && diagnostics.length === 0,
    rootCount: safeInventory.rootCount,
    orderedRoots: [...BOOK_METADATA_CANONICAL_ROOTS],
    rootFences,
    sourceVersionIds: [...allSourceIds],
    missingSourceVersionIds: [...validation.missingSourceVersionIds],
    diagnostics: Object.freeze(diagnostics),
    zeroByteProof: { pdfBodyReads: 0, pdfBodyWrites: 0, providerOperations: 0 },
  };
}

const rootUrl = (firebaseDbUrl: string, path: string, token: string): string => {
  const encodedPath = path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  return `${firebaseDbUrl.replace(/\/+$/u, '')}/${encodedPath}.json?access_token=${encodeURIComponent(token)}`;
};

const readEtag = (response: Response): string | null => (
  response.headers.get('ETag')
  ?? response.headers.get('etag')
  ?? response.headers.get('X-Firebase-ETag')
);

/** Read one exact Firebase root. `requireEtag` is used by preview/execute only. */
export async function readBookMetadataRoot(
  firebaseDbUrl: string,
  token: string,
  path: string,
  fetchImpl: typeof fetch = fetch,
  requireEtag = false,
): Promise<BookMetadataRootRead> {
  if (!(BOOK_METADATA_CANONICAL_ROOTS as readonly string[]).includes(path)) {
    throw new BookMetadataRestoreValidationError({ code: 'invalid-root-path', path, message: 'Only an enumerated canonical Book root may be read.' });
  }
  const response = await fetchImpl(rootUrl(firebaseDbUrl, path, token), {
    headers: {
      Authorization: `Bearer ${token}`,
      ...(requireEtag ? { 'X-Firebase-ETag': 'true' } : {}),
    },
  });
  const etag = readEtag(response);
  if (response.status === 404) {
    if (requireEtag && !etag) throw new BookMetadataRestoreValidationError({ code: 'missing-etag', path, message: 'Missing ETag for an absent canonical root.' });
    return { path, present: false, data: {}, etag, revision: null, bytes: 0 };
  }
  if (!response.ok) throw new BookMetadataRestoreValidationError({ code: 'root-read-failed', path, message: `Canonical root read failed with HTTP ${response.status}.` });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new BookMetadataRestoreValidationError({ code: 'invalid-root-schema', path, message: 'Canonical root response was not valid JSON.' });
  }
  if (requireEtag && !etag) throw new BookMetadataRestoreValidationError({ code: 'missing-etag', path, message: 'Current canonical root is missing an ETag fence.' });
  const present = data !== null;
  const revision = isPlainRecord(data) && nonNegativeSafeInteger(data.revision) ? data.revision : null;
  const bytes = Number.parseInt(response.headers.get('Content-Length') ?? '', 10);
  return { path, present, data: data ?? {}, etag, revision, bytes: Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : JSON.stringify(data ?? {}).length };
}

export async function readBookMetadataRoots(
  firebaseDbUrl: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
  requireEtag = false,
): Promise<readonly BookMetadataRootRead[]> {
  const roots: BookMetadataRootRead[] = [];
  for (const path of BOOK_METADATA_CANONICAL_ROOTS) {
    roots.push(await readBookMetadataRoot(firebaseDbUrl, token, path, fetchImpl, requireEtag));
  }
  return roots;
}

export async function restoreBookMetadataRoots(
  firebaseDbUrl: string,
  token: string,
  plan: BookMetadataRestorePlan,
  rootFences: Readonly<Record<string, BookMetadataRootFence>>,
  fetchImpl: typeof fetch = fetch,
): Promise<{ readonly restoredRoots: number; readonly skippedRoots: number; readonly failedRoots: number }> {
  if (!isPlainRecord(plan) || !Array.isArray(plan.orderedWrites)) {
    throw new BookMetadataRestoreValidationError({
      code: 'invalid-schema',
      path: '$.plan',
      message: 'Book metadata restore requires a prepared canonical write plan.',
    });
  }
  const seenWrites = new Set<string>();
  for (const write of plan.orderedWrites) {
    if (!isPlainRecord(write)
      || typeof write.path !== 'string'
      || !(BOOK_METADATA_CANONICAL_ROOTS as readonly string[]).includes(write.path)
      || !isPlainRecord(write.data)
      || seenWrites.has(write.path)) {
      throw new BookMetadataRestoreValidationError({
        code: 'invalid-root-path',
        path: '$.plan.orderedWrites',
        message: 'Book metadata writes must be unique, explicit canonical roots with plain metadata objects.',
      });
    }
    seenWrites.add(write.path);
  }
  if (plan.missingSourceVersionIds.length > 0) {
    throw new BookMetadataRestoreValidationError({ code: 'source-version-missing', path: '$.sourceVersionIds', message: 'Source Version availability is incomplete.' });
  }
  const missingFence = BOOK_METADATA_CANONICAL_ROOTS.find((path) => !rootFences[path] || typeof rootFences[path].etag !== 'string' || rootFences[path].etag.length === 0);
  if (missingFence) throw new BookMetadataRestoreValidationError({ code: 'missing-etag', path: `$.rootFences.${missingFence}`, message: 'Every Book root write requires a current ETag fence.' });

  let restoredRoots = 0;
  for (const write of plan.orderedWrites) {
    const response = await fetchImpl(rootUrl(firebaseDbUrl, write.path, token), {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'If-Match': rootFences[write.path].etag,
      },
      body: JSON.stringify(write.data),
    });
    if (!response.ok) {
      throw new BookMetadataRestoreValidationError({ code: 'root-write-failed', path: write.path, message: `Canonical root write failed with HTTP ${response.status}; no retry may weaken the fence.` });
    }
    restoredRoots += 1;
  }
  return {
    restoredRoots,
    skippedRoots: BOOK_METADATA_ROOT_COUNT - plan.orderedWrites.length,
    failedRoots: 0,
  };
}
