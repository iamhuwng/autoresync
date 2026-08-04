import { SignJWT, importPKCS8 } from 'jose';
import { FirebaseRtdbRestClient, type RepositoryEnv } from '../listening-authoring/rtdb.ts';
import type {
  BookAssemblyPublicationRepository,
  BookAssemblyPublicationScope,
} from '../../../../src/services/book-assembly/publicationRepository.ts';
import {
  bookAssemblyActivityVersionScopeKey,
  type BookAssemblyPublicationResult,
} from '../../../../src/services/book-assembly/publicationTransaction.service.ts';
import {
  createBookAssemblyPublicationAuditRecord,
} from '../../../../src/services/book-assembly/publicationAudit.service.ts';

export const BOOK_ASSEMBLY_PUBLICATION_ROOT = 'book_assembly_publications/books';

const MAX_RETRIES = 5;
const MAX_SCOPE_BYTES = 2 * 1024 * 1024;
const MAX_PUBLICATION_RECORDS_PER_FAMILY = 256;
const MAX_RECORD_BYTES = 512 * 1024;
const PATH_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const ACTIVITY_VERSION_REFERENCE_KEY = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,383}$/u;
const OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const OAUTH2_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FIREBASE_SCOPES = [
  'https://www.googleapis.com/auth/firebase.database',
  'https://www.googleapis.com/auth/datastore',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');
const SENSITIVE_KEYS = new Set([
  'answer',
  'answerkey',
  'answers',
  'credential',
  'credentials',
  'firebasetoken',
  'fulldiff',
  'pdfbytes',
  'privatekey',
  'providerauthority',
  'secret',
  'sourcebytes',
]);

export interface BookAssemblyPublicationRepositoryEnv extends RepositoryEnv {
  BOOK_ASSEMBLY_SERVICE_IDENTITY?: string;
  BOOK_ASSEMBLY_GOOGLE_SA_KEY?: string;
}

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

const clone = <T>(value: T): T => structuredClone(value);
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
};
const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);
const jsonBytes = (value: unknown): number => {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('invalid_book_assembly_publication_json');
  return new TextEncoder().encode(encoded).byteLength;
};
const assertPathId = (value: unknown, code: string): asserts value is string => {
  if (typeof value !== 'string' || !PATH_ID.test(value)) throw new Error(code);
};
const hasSensitiveKey = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(hasSensitiveKey);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, child]) => (
    SENSITIVE_KEYS.has(key.toLowerCase().replace(/[_-]/gu, '')) || hasSensitiveKey(child)
  ));
};
const scopePath = (bookId: string): string => {
  assertPathId(bookId, 'invalid_book_assembly_publication_book_id');
  return BOOK_ASSEMBLY_PUBLICATION_ROOT + '/' + bookId;
};
const childPath = (bookId: string, relative: string): string =>
  `${scopePath(bookId)}/${relative}`;

type PublicationFamily =
  | 'versions'
  | 'activityVersions'
  | 'activitySafeProjections'
  | 'placements'
  | 'unitProjections'
  | 'deliveryPlans'
  | 'audits';

const SOURCE_SET_KEYS = new Set(['sourceStrategy', 'sources']);
const SOURCE_KEYS = new Set(['sourceKey', 'sourceVersionId', 'sourceOrder', 'ownerNodeKey']);
const SOURCE_PAGE_KEYS = new Set(['sourceKey', 'sourceVersionId', 'physicalPageNumber']);
const MANIFEST_KEYS = new Set(['bookId', 'sourceSet', 'nodes', 'units']);
const NODE_KEYS = new Set(['nodeKey', 'parentNodeKey', 'nodeType', 'order']);
const UNIT_KEYS = new Set(['unitKey', 'activitySlots', 'pageGroups']);
const ACTIVITY_SLOT_KEYS = new Set([
  'activityKey',
  'order',
  'contextRequirement',
  'pageGroupKeys',
]);
const PAGE_GROUP_KEYS = new Set([
  'pageGroupKey',
  'sourceKey',
  'pages',
  'activityKeys',
  'mode',
  'defaultPhysicalPageNumber',
]);
const STUDENT_SAFE_PROJECTION_KEYS = new Set([
  'schemaVersion',
  'bookId',
  'publicationId',
  'publicationRevision',
  'sourceStrategy',
  'sourceSet',
  'units',
]);
const STORED_RECORD_KEYS: Record<PublicationFamily, ReadonlySet<string>> = {
  versions: new Set([
    'schemaVersion',
    'manifestVersionId',
    'publicationId',
    'publicationRevision',
    'lifecycle',
    'ownerId',
    'bookId',
    'bookRevision',
    'sourceSetRevision',
    'candidateId',
    'candidateRevision',
    'strategy',
    'adapterTicket',
    'inputFingerprint',
    'createdByCommandId',
    'createdAt',
    'manifest',
    'studentSafeProjection',
    'successorLineage',
    'mappingRevisionLineage',
  ]),
  activityVersions: new Set([
    'schemaVersion',
    'activityId',
    'activityVersionId',
    'activityVersion',
    'ownerId',
    'bookId',
    'manifestVersionId',
    'publicationId',
    'publicationRevision',
    'unitKey',
    'activityKey',
    'createdByCommandId',
    'createdAt',
    'sourcePages',
    'canonicalPayloadFingerprint',
    'safeProjectionId',
    'canonicalOriginManifestVersionId',
    'canonicalOriginPublicationId',
    'canonicalOriginOperationId',
    'payloadFingerprint',
    'predecessorActivityVersionId',
  ]),
  activitySafeProjections: new Set([
    'schemaVersion',
    'projectionId',
    'activityId',
    'activityVersionId',
    'ownerId',
    'bookId',
    'manifestVersionId',
    'publicationId',
    'publicationRevision',
    'placementIds',
    'sourcePages',
    'payloadFingerprint',
  ]),
  placements: new Set([
    'schemaVersion',
    'placementId',
    'ownerId',
    'bookId',
    'manifestVersionId',
    'publicationId',
    'publicationRevision',
    'unitKey',
    'nodeKey',
    'activityKey',
    'activityId',
    'activityVersionId',
    'order',
    'pageGroupKeys',
    'sourcePages',
    'predecessorPlacementId',
  ]),
  unitProjections: new Set([
    'schemaVersion',
    'unitProjectionId',
    'ownerId',
    'bookId',
    'manifestVersionId',
    'publicationId',
    'publicationRevision',
    'unitKey',
    'placementIds',
    'sourcePages',
    'createdByCommandId',
    'createdAt',
  ]),
  deliveryPlans: new Set([
    'schemaVersion',
    'deliveryPlanId',
    'ownerId',
    'bookId',
    'manifestVersionId',
    'publicationId',
    'publicationRevision',
    'sourceStrategy',
    'sourceSet',
    'placementIds',
    'unitProjectionIds',
    'createdByCommandId',
    'createdAt',
  ]),
  audits: new Set([
    'auditId',
    'operationId',
    'action',
    'ownerId',
    'bookId',
    'publicationId',
    'publicationRevision',
    'manifestVersionId',
    'inputFingerprint',
    'status',
    'failureCode',
    'createdAt',
  ]),
};
const CURRENT_KEYS = new Set([
  'publicationId',
  'publicationRevision',
  'manifestVersionId',
  'bookRevision',
  'sourceSetRevision',
  'inputFingerprint',
  'operationFingerprint',
  'updatedAt',
  'updatedByCommandId',
]);
const OPERATION_KEYS = new Set(['ownerId', 'fingerprint', 'result', 'createdAt']);
const PUBLICATION_RESULT_KEYS = new Set(['status', 'pointer', 'version', 'audit', 'failureCode']);
const SUCCESSOR_LINEAGE_KEYS = new Set([
  'kind',
  'predecessorPublicationId',
  'predecessorManifestVersionId',
  'predecessorPublicationRevision',
  'predecessorStrategy',
  'successorStrategy',
  'predecessorSourceSetRevision',
  'successorSourceSetRevision',
  'createdByCommandId',
  'createdAt',
]);
const MAPPING_LINEAGE_KEYS = new Set([
  'kind',
  'predecessorPublicationId',
  'predecessorManifestVersionId',
  'predecessorPublicationRevision',
  'sourceSetRevision',
  'createdByCommandId',
  'createdAt',
  'changedPageGroupKeys',
  'preservedActivityIds',
  'preservedActivityVersionIds',
]);

const assertAllowedKeys = (
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  code: string,
): void => {
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new Error(code);
};

const nonEmptyString = (value: unknown): value is string => (
  typeof value === 'string' && PATH_ID.test(value)
);
const safeIntegerAtLeast = (value: unknown, minimum: number): value is number => (
  Number.isSafeInteger(value) && (value as number) >= minimum
);
const stringArray = (value: unknown, minimumLength = 0): value is readonly string[] => (
  Array.isArray(value)
  && value.length >= minimumLength
  && value.every((entry) => typeof entry === 'string' && PATH_ID.test(entry))
);
const recordArray = (value: unknown, minimumLength = 0): value is readonly Record<string, unknown>[] => (
  Array.isArray(value)
  && value.length >= minimumLength
  && value.every(isRecord)
);
const strategy = (value: unknown): value is 'full_pdf' | 'component_pdfs' => (
  value === 'full_pdf' || value === 'component_pdfs'
);
const qualifiedPages = (value: unknown): boolean => (
  recordArray(value, 1)
  && value.every((page) => {
    assertAllowedKeys(page, SOURCE_PAGE_KEYS, 'invalid_book_assembly_publication_record');
    return nonEmptyString(page.sourceKey)
      && nonEmptyString(page.sourceVersionId)
      && safeIntegerAtLeast(page.physicalPageNumber, 1);
  })
);
const sourceSet = (value: unknown, expectedStrategy?: unknown): boolean => {
  if (!isRecord(value) || !strategy(value.sourceStrategy)
    || (expectedStrategy !== undefined && value.sourceStrategy !== expectedStrategy)
    || !recordArray(value.sources, 1)) return false;
  assertAllowedKeys(value, SOURCE_SET_KEYS, 'invalid_book_assembly_publication_record');
  if (value.sourceStrategy === 'full_pdf' && value.sources.length !== 1) return false;
  return value.sources.every((source) => {
    assertAllowedKeys(source, SOURCE_KEYS, 'invalid_book_assembly_publication_record');
    return nonEmptyString(source.sourceKey)
      && nonEmptyString(source.sourceVersionId)
      && safeIntegerAtLeast(source.sourceOrder, 1)
      && (value.sourceStrategy === 'full_pdf'
        ? source.ownerNodeKey === undefined
        : nonEmptyString(source.ownerNodeKey));
  });
};
const unitStructures = (value: unknown): boolean => {
  if (!recordArray(value, 1)) return false;
  return value.every((unit) => {
    assertAllowedKeys(unit, UNIT_KEYS, 'invalid_book_assembly_publication_record');
    if (!nonEmptyString(unit.unitKey)
      || !recordArray(unit.activitySlots, 1)
      || !recordArray(unit.pageGroups, 1)) return false;
    if (!unit.activitySlots.every((slot) => {
      assertAllowedKeys(slot, ACTIVITY_SLOT_KEYS, 'invalid_book_assembly_publication_record');
      return nonEmptyString(slot.activityKey)
        && safeIntegerAtLeast(slot.order, 1)
        && ['required', 'optional', 'none'].includes(String(slot.contextRequirement))
        && stringArray(slot.pageGroupKeys, 1);
    })) return false;
    return unit.pageGroups.every((group) => {
      assertAllowedKeys(group, PAGE_GROUP_KEYS, 'invalid_book_assembly_publication_record');
      return nonEmptyString(group.pageGroupKey)
        && nonEmptyString(group.sourceKey)
        && Array.isArray(group.pages)
        && group.pages.length > 0
        && group.pages.every((page) => safeIntegerAtLeast(page, 1))
        && stringArray(group.activityKeys, 1)
        && ['activity', 'reference_only'].includes(String(group.mode))
        && (group.defaultPhysicalPageNumber === undefined
          || safeIntegerAtLeast(group.defaultPhysicalPageNumber, 1));
    });
  });
};
const manifest = (value: unknown, bookId: string): boolean => {
  if (!isRecord(value)) return false;
  assertAllowedKeys(value, MANIFEST_KEYS, 'invalid_book_assembly_publication_record');
  if (value.bookId !== bookId
    || !sourceSet(value.sourceSet)
    || !recordArray(value.nodes, 1)
    || !unitStructures(value.units)) return false;
  return value.nodes.every((node) => {
    assertAllowedKeys(node, NODE_KEYS, 'invalid_book_assembly_publication_record');
    return nonEmptyString(node.nodeKey)
      && (node.parentNodeKey === null || nonEmptyString(node.parentNodeKey))
      && nonEmptyString(node.nodeType)
      && safeIntegerAtLeast(node.order, 1);
  }) && value.units.every((unit) => nonEmptyString(unit.unitKey));
};
const studentSafeProjection = (
  value: unknown,
  bookId: string,
  publicationId: string,
  publicationRevision: number,
  expectedStrategy: unknown,
): boolean => {
  if (!isRecord(value)) return false;
  assertAllowedKeys(value, STUDENT_SAFE_PROJECTION_KEYS, 'invalid_book_assembly_publication_record');
  return value.schemaVersion === 1
    && value.bookId === bookId
    && value.publicationId === publicationId
    && value.publicationRevision === publicationRevision
    && value.sourceStrategy === expectedStrategy
    && sourceSet(value.sourceSet, expectedStrategy)
    && unitStructures(value.units);
};
const publicationResultStatus = (value: unknown): boolean => (
  value === 'published'
  || value === 'rolled-back'
  || value === 'replayed'
  || value === 'conflict'
  || value === 'invalid'
  || value === 'idempotency-conflict'
  || value === 'not-found'
  || value === 'forbidden'
);

const assertStoredRecord = (
  value: unknown,
  bookId: string,
  key: string,
  keyField: string,
  family: PublicationFamily,
): Record<string, unknown> => {
  if (!isRecord(value)) throw new Error('invalid_book_assembly_publication_record');
  assertAllowedKeys(value, STORED_RECORD_KEYS[family], 'invalid_book_assembly_publication_record');
  if (jsonBytes(value) > MAX_RECORD_BYTES || hasSensitiveKey(value)) {
    throw new Error('invalid_book_assembly_publication_record');
  }
  const expectedKey = family === 'activityVersions'
    ? bookAssemblyActivityVersionScopeKey(
      String(value.manifestVersionId ?? ''),
      String(value.activityVersionId ?? ''),
    )
    : value[keyField];
  if (expectedKey !== key || value.bookId !== bookId || typeof value.ownerId !== 'string') {
    throw new Error('invalid_book_assembly_publication_record');
  }
  assertPathId(value.ownerId, 'invalid_book_assembly_publication_owner_id');
  if ((family !== 'audits' && value.schemaVersion !== 1)
    || !nonEmptyString(value.manifestVersionId)
    || !nonEmptyString(value.publicationId)
    || !safeIntegerAtLeast(value.publicationRevision, 1)) {
    throw new Error('invalid_book_assembly_publication_record');
  }
  if (family === 'versions') {
    if (value.successorLineage !== undefined) {
      if (!isRecord(value.successorLineage)) {
        throw new Error('invalid_book_assembly_publication_record');
      }
      assertAllowedKeys(
        value.successorLineage,
        SUCCESSOR_LINEAGE_KEYS,
        'invalid_book_assembly_publication_record',
      );
    }
    if (value.mappingRevisionLineage !== undefined) {
      if (!isRecord(value.mappingRevisionLineage)) {
        throw new Error('invalid_book_assembly_publication_record');
      }
      assertAllowedKeys(
        value.mappingRevisionLineage,
        MAPPING_LINEAGE_KEYS,
        'invalid_book_assembly_publication_record',
      );
    }
  }
  switch (family) {
    case 'versions':
      if (value.lifecycle !== 'published'
        || !strategy(value.strategy)
        || !OPERATION_ID.test(String(value.createdByCommandId ?? ''))
        || !nonEmptyString(value.inputFingerprint)
        || !nonEmptyString(value.createdAt)
        || !manifest(value.manifest, bookId)
        || !studentSafeProjection(
          value.studentSafeProjection,
          bookId,
          String(value.publicationId),
          value.publicationRevision as number,
          value.strategy,
        )) {
        throw new Error('invalid_book_assembly_publication_record');
      }
      break;
    case 'activityVersions':
      if (!nonEmptyString(value.activityId)
        || !safeIntegerAtLeast(value.activityVersion, 1)
        || !nonEmptyString(value.unitKey)
        || !nonEmptyString(value.activityKey)
        || !nonEmptyString(value.safeProjectionId)
        || !nonEmptyString(value.canonicalOriginManifestVersionId)
        || !nonEmptyString(value.canonicalOriginPublicationId)
        || !nonEmptyString(value.canonicalOriginOperationId)
        || !OPERATION_ID.test(String(value.createdByCommandId ?? ''))
        || !nonEmptyString(value.createdAt)
        || !qualifiedPages(value.sourcePages)
        || !nonEmptyString(value.payloadFingerprint)) {
        throw new Error('invalid_book_assembly_publication_record');
      }
      break;
    case 'activitySafeProjections':
      if (!nonEmptyString(value.activityId)
        || !nonEmptyString(value.activityVersionId)
        || !stringArray(value.placementIds)
        || !qualifiedPages(value.sourcePages)
        || !nonEmptyString(value.payloadFingerprint)) {
        throw new Error('invalid_book_assembly_publication_record');
      }
      break;
    case 'placements':
      if (!nonEmptyString(value.unitKey)
        || !nonEmptyString(value.nodeKey)
        || !nonEmptyString(value.activityKey)
        || !nonEmptyString(value.activityId)
        || !nonEmptyString(value.activityVersionId)
        || !safeIntegerAtLeast(value.order, 1)
        || !stringArray(value.pageGroupKeys, 1)
        || !qualifiedPages(value.sourcePages)) {
        throw new Error('invalid_book_assembly_publication_record');
      }
      break;
    case 'unitProjections':
      if (!nonEmptyString(value.unitKey)
        || !stringArray(value.placementIds)
        || !qualifiedPages(value.sourcePages)
        || !OPERATION_ID.test(String(value.createdByCommandId ?? ''))
        || !nonEmptyString(value.createdAt)) {
        throw new Error('invalid_book_assembly_publication_record');
      }
      break;
    case 'deliveryPlans':
      if (!strategy(value.sourceStrategy)
        || !sourceSet(value.sourceSet, value.sourceStrategy)
        || !stringArray(value.placementIds)
        || !stringArray(value.unitProjectionIds)
        || !OPERATION_ID.test(String(value.createdByCommandId ?? ''))
        || !nonEmptyString(value.createdAt)) {
        throw new Error('invalid_book_assembly_publication_record');
      }
      break;
    case 'audits':
      if (!OPERATION_ID.test(String(value.operationId ?? ''))
        || (value.action !== 'publish' && value.action !== 'rollback')
        || !nonEmptyString(value.inputFingerprint)
        || !nonEmptyString(value.createdAt)
        || !['committed', 'replayed', 'rejected'].includes(String(value.status))) {
        throw new Error('invalid_book_assembly_publication_record');
      }
      break;
  }
  return clone(value);
};

const parseFamily = <T>(
  value: unknown,
  bookId: string,
  keyField: string,
  family: PublicationFamily,
): Record<string, T> | undefined => {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) throw new Error('invalid_book_assembly_publication_family');
  const entries = Object.entries(value);
  if (family !== 'audits' && entries.length > MAX_PUBLICATION_RECORDS_PER_FAMILY) {
    throw new Error('book_assembly_publication_capacity_exceeded');
  }
  const parsed: Record<string, T> = {};
  for (const [key, record] of entries) {
    if (family === 'activityVersions') {
      if (!ACTIVITY_VERSION_REFERENCE_KEY.test(key)) {
        throw new Error('invalid_book_assembly_publication_record_id');
      }
    } else {
      assertPathId(key, 'invalid_book_assembly_publication_record_id');
    }
    parsed[key] = assertStoredRecord(record, bookId, key, keyField, family) as T;
  }
  return entries.length > 0 ? parsed : undefined;
};

const parseCurrent = (value: unknown): BookAssemblyPublicationScope['current'] => {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value) || jsonBytes(value) > MAX_RECORD_BYTES || hasSensitiveKey(value)) {
    throw new Error('invalid_book_assembly_publication_current');
  }
  assertAllowedKeys(value, CURRENT_KEYS, 'invalid_book_assembly_publication_current');
  assertPathId(value.publicationId, 'invalid_book_assembly_publication_current');
  assertPathId(value.manifestVersionId, 'invalid_book_assembly_publication_current');
  if (!OPERATION_ID.test(String(value.updatedByCommandId ?? ''))) {
    throw new Error('invalid_book_assembly_publication_current');
  }
  if (!Number.isSafeInteger(value.publicationRevision) || (value.publicationRevision as number) < 1
    || !Number.isSafeInteger(value.bookRevision) || (value.bookRevision as number) < 0
    || !Number.isSafeInteger(value.sourceSetRevision) || (value.sourceSetRevision as number) < 0
    || !nonEmptyString(value.inputFingerprint)
    || !nonEmptyString(value.operationFingerprint)
    || !nonEmptyString(value.updatedAt)) {
    throw new Error('invalid_book_assembly_publication_current');
  }
  return clone(value) as BookAssemblyPublicationScope['current'];
};

const assertPublicationResult = (value: unknown, bookId: string): void => {
  if (!isRecord(value)) throw new Error('invalid_book_assembly_publication_operation');
  assertAllowedKeys(value, PUBLICATION_RESULT_KEYS, 'invalid_book_assembly_publication_operation');
  if (!publicationResultStatus(value.status)) {
    throw new Error('invalid_book_assembly_publication_operation');
  }
  if (value.pointer !== undefined) {
    if (value.pointer === null) throw new Error('invalid_book_assembly_publication_operation');
    try {
      parseCurrent(value.pointer);
    } catch {
      throw new Error('invalid_book_assembly_publication_operation');
    }
  }
  if (value.version !== undefined) {
    if (!isRecord(value.version)) throw new Error('invalid_book_assembly_publication_operation');
    try {
      assertStoredRecord(
        value.version,
        bookId,
        typeof value.version.manifestVersionId === 'string' ? value.version.manifestVersionId : '',
        'manifestVersionId',
        'versions',
      );
    } catch {
      throw new Error('invalid_book_assembly_publication_operation');
    }
  }
  if (value.audit !== undefined) {
    if (!isRecord(value.audit)) throw new Error('invalid_book_assembly_publication_operation');
    try {
      assertStoredRecord(
        value.audit,
        bookId,
        typeof value.audit.auditId === 'string' ? value.audit.auditId : '',
        'auditId',
        'audits',
      );
    } catch {
      throw new Error('invalid_book_assembly_publication_operation');
    }
  }
};

const parseOperations = <Result>(
  value: unknown,
  bookId: string,
): BookAssemblyPublicationScope<Result>['operations'] => {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) throw new Error('invalid_book_assembly_publication_operations');
  const entries = Object.entries(value);
  const parsed: NonNullable<BookAssemblyPublicationScope<Result>['operations']> = {};
  for (const [key, record] of entries) {
    if (!OPERATION_ID.test(key) || !isRecord(record)
      || jsonBytes(record) > MAX_RECORD_BYTES || hasSensitiveKey(record)
      || typeof record.ownerId !== 'string'
      || !nonEmptyString(record.fingerprint)
      || !nonEmptyString(record.createdAt)
      || !isRecord(record.result)
      || !publicationResultStatus(record.result.status)) {
      throw new Error('invalid_book_assembly_publication_operation');
    }
    assertAllowedKeys(record, OPERATION_KEYS, 'invalid_book_assembly_publication_operation');
    assertPublicationResult(record.result, bookId);
    assertPathId(record.ownerId, 'invalid_book_assembly_publication_owner_id');
    parsed[key] = clone(record) as NonNullable<BookAssemblyPublicationScope<Result>['operations']>[string];
  }
  return entries.length > 0 ? parsed : undefined;
};

const validateScope = <Result>(
  value: unknown,
  bookId: string,
): BookAssemblyPublicationScope<Result> => {
  if (value === undefined || value === null) return {};
  if (!isRecord(value) || jsonBytes(value) > MAX_SCOPE_BYTES || hasSensitiveKey(value)) {
    throw new Error('invalid_book_assembly_publication_scope');
  }
  const allowed = new Set([
    'versions',
    'activityVersions',
    'activitySafeProjections',
    'placements',
    'unitProjections',
    'deliveryPlans',
    'current',
    'operations',
    'audits',
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new Error('invalid_book_assembly_publication_scope');
  }
  return {
    versions: parseFamily(value.versions, bookId, 'manifestVersionId', 'versions'),
    activityVersions: parseFamily(value.activityVersions, bookId, 'activityVersionId', 'activityVersions'),
    activitySafeProjections: parseFamily(
      value.activitySafeProjections, bookId, 'projectionId', 'activitySafeProjections',
    ),
    placements: parseFamily(value.placements, bookId, 'placementId', 'placements'),
    unitProjections: parseFamily(value.unitProjections, bookId, 'unitProjectionId', 'unitProjections'),
    deliveryPlans: parseFamily(value.deliveryPlans, bookId, 'deliveryPlanId', 'deliveryPlans'),
    current: parseCurrent(value.current),
    operations: parseOperations<Result>(value.operations, bookId),
    audits: parseFamily(value.audits, bookId, 'auditId', 'audits'),
  };
};

const parseScope = <Result>(
  value: unknown,
  bookId: string,
): BookAssemblyPublicationScope<Result> => {
  if (value === undefined || value === null) return {};
  if (!isRecord(value) || jsonBytes(value) > MAX_SCOPE_BYTES || hasSensitiveKey(value)) {
    throw new Error('invalid_book_assembly_publication_scope');
  }
  const allowedWireKeys = new Set([
    'versions',
    'activity_versions',
    'activity_safe_projections',
    'placements',
    'unit_projections',
    'delivery_plans',
    'current',
    'operations',
    'audits',
  ]);
  if (Object.keys(value).some((key) => !allowedWireKeys.has(key))) {
    throw new Error('invalid_book_assembly_publication_scope');
  }
  return validateScope({
    versions: value.versions,
    activityVersions: value.activity_versions,
    activitySafeProjections: value.activity_safe_projections,
    placements: value.placements,
    unitProjections: value.unit_projections,
    deliveryPlans: value.delivery_plans,
    current: value.current,
    operations: value.operations,
    audits: value.audits,
  }, bookId);
};

const serializeScope = <Result>(
  value: BookAssemblyPublicationScope<Result>,
  bookId: string,
): Record<string, unknown> => {
  const parsed = validateScope(value, bookId);
  const serialized: Record<string, unknown> = {};
  if (parsed.versions !== undefined) serialized.versions = clone(parsed.versions);
  if (parsed.activityVersions !== undefined) {
    serialized.activity_versions = clone(parsed.activityVersions);
  }
  if (parsed.activitySafeProjections !== undefined) {
    serialized.activity_safe_projections = clone(parsed.activitySafeProjections);
  }
  if (parsed.placements !== undefined) serialized.placements = clone(parsed.placements);
  if (parsed.unitProjections !== undefined) {
    serialized.unit_projections = clone(parsed.unitProjections);
  }
  if (parsed.deliveryPlans !== undefined) serialized.delivery_plans = clone(parsed.deliveryPlans);
  if (parsed.current !== undefined) serialized.current = clone(parsed.current);
  if (parsed.operations !== undefined) serialized.operations = clone(parsed.operations);
  if (parsed.audits !== undefined) serialized.audits = clone(parsed.audits);
  if (jsonBytes(serialized) > MAX_SCOPE_BYTES || hasSensitiveKey(serialized)) {
    throw new Error('invalid_book_assembly_publication_scope');
  }
  return serialized;
};

const tokenProvider = (
  keyJson: string,
  identity: string,
  fetchImpl: typeof fetch,
): (() => Promise<string>) => {
  let key: ServiceAccountKey;
  try {
    const parsed = JSON.parse(keyJson) as unknown;
    if (!isRecord(parsed)
      || typeof parsed.client_email !== 'string'
      || typeof parsed.private_key !== 'string') {
      throw new Error('invalid_book_assembly_publication_google_sa_key');
    }
    key = parsed as unknown as ServiceAccountKey;
  } catch {
    throw new Error('invalid_book_assembly_publication_google_sa_key');
  }
  if (!key.client_email || !key.private_key || key.client_email !== identity) {
    throw new Error('book_assembly_publication_service_identity_mismatch');
  }
  let cached = '';
  let expiresAt = 0;
  return async () => {
    if (cached && Date.now() < expiresAt - 300_000) return cached;
    const now = Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({
      iss: key.client_email,
      sub: key.client_email,
      aud: OAUTH2_TOKEN_URL,
      iat: now,
      exp: now + 3600,
      scope: FIREBASE_SCOPES,
    }).setProtectedHeader({ alg: 'RS256' })
      .sign(await importPKCS8(key.private_key, 'RS256'));
    const response = await fetchImpl(OAUTH2_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + assertion,
    });
    if (!response.ok) throw new Error('book_assembly_publication_google_oauth_failed:' + response.status);
    const body = JSON.parse(await response.text()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new Error('book_assembly_publication_google_oauth_failed:invalid_response');
    cached = body.access_token;
    expiresAt = Date.now() + Math.max(0, (body.expires_in ?? 3600) * 1000);
    return cached;
  };
};

export class FirebaseRestBookAssemblyPublicationRepository
implements BookAssemblyPublicationRepository<BookAssemblyPublicationResult> {
  private readonly rtdb: FirebaseRtdbRestClient;

  constructor(private readonly options: {
    env: BookAssemblyPublicationRepositoryEnv;
    fetchImpl?: typeof fetch;
    getAccessToken?: () => Promise<string>;
    maxRetries?: number;
  }) {
    const identity = options.env.BOOK_ASSEMBLY_SERVICE_IDENTITY?.trim();
    if (!identity) throw new Error('missing_book_assembly_publication_service_identity');
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    const keyJson = options.env.BOOK_ASSEMBLY_GOOGLE_SA_KEY?.trim();
    if (!keyJson && !options.getAccessToken) {
      throw new Error('missing_book_assembly_publication_google_sa_key');
    }
    this.rtdb = new FirebaseRtdbRestClient({
      env: { ...options.env, GOOGLE_SA_KEY: keyJson },
      fetchImpl,
      getAccessToken: options.getAccessToken
        ?? tokenProvider(keyJson!, identity, fetchImpl),
    });
  }

  async readScope(bookId: string): Promise<BookAssemblyPublicationScope<BookAssemblyPublicationResult>> {
    const value = await this.rtdb.readWithEtag<unknown>(scopePath(bookId));
    return parseScope<BookAssemblyPublicationResult>(value.data, bookId);
  }

  async transaction<T>(
    bookId: string,
    mutate: (current: BookAssemblyPublicationScope<BookAssemblyPublicationResult>) => {
      readonly outcome: T;
      readonly next?: BookAssemblyPublicationScope<BookAssemblyPublicationResult>;
      readonly write: boolean;
    },
    operationId?: string,
    operationFingerprint?: string,
  ): Promise<T> {
    const maxRetries = this.options.maxRetries ?? MAX_RETRIES;
    if (!Number.isSafeInteger(maxRetries) || maxRetries < 1 || maxRetries > 10) {
      throw new Error('invalid_book_assembly_publication_max_retries');
    }
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      const currentScope = await this.rtdb.readValue(scopePath(bookId));
      const currentPointer = await this.rtdb.readWithEtag<unknown>(childPath(bookId, 'current'));
      let parsed = parseScope<BookAssemblyPublicationResult>(currentScope, bookId);
      parsed = {
        ...parsed,
        current: parseCurrent(currentPointer.data),
      };

      if (operationId
        && operationFingerprint
        && parsed.current?.updatedByCommandId === operationId
        && parsed.current.operationFingerprint === operationFingerprint
        && !parsed.operations?.[operationId]) {
        const version = parsed.versions?.[parsed.current.manifestVersionId];
        if (!version) throw new Error('book_assembly_publication_recovery_version_missing');
        const action = version.createdByCommandId === operationId ? 'publish' : 'rollback';
        const audit = createBookAssemblyPublicationAuditRecord({
          action,
          operationId,
          ownerId: version.ownerId,
          bookId,
          pointer: parsed.current,
          status: 'committed',
          now: parsed.current.updatedAt,
        });
        const result: BookAssemblyPublicationResult = {
          status: action === 'publish' ? 'published' : 'rolled-back',
          pointer: clone(parsed.current),
          version: clone(version),
          audit,
        };
        const operation = {
          ownerId: version.ownerId,
          fingerprint: parsed.current.operationFingerprint ?? version.inputFingerprint,
          result,
          createdAt: parsed.current.updatedAt,
        };
        await this.prepareExact(
          childPath(bookId, `audits/${audit.auditId}`),
          audit,
        );
        await this.prepareExact(
          childPath(bookId, `operations/${operationId}`),
          operation,
        );
        parsed = {
          ...parsed,
          audits: { ...(parsed.audits ?? {}), [audit.auditId]: audit },
          operations: { ...(parsed.operations ?? {}), [operationId]: operation },
        };
      }

      const visible = operationId ? this.withoutPreparedOperation(parsed, operationId) : parsed;
      const mutation = mutate(visible);
      if (!mutation.write) return mutation.outcome;
      const nextScope = mutation.next ?? visible;
      const currentWire = serializeScope<BookAssemblyPublicationResult>(visible, bookId);
      const nextWire = serializeScope<BookAssemblyPublicationResult>(nextScope, bookId);
      await this.prepareImmutableDiff(bookId, currentWire, nextWire);

      const nextPointer = nextWire.current;
      if (stable(nextPointer) !== stable(currentWire.current)) {
        if (!await this.rtdb.writeIfMatch(
          childPath(bookId, 'current'),
          nextPointer,
          currentPointer.etag,
        )) {
          continue;
        }
      }
      await this.prepareMarkerDiff(bookId, currentWire, nextWire);
      return mutation.outcome;
    }
    throw new Error('book_assembly_publication_pointer_cas_retries_exhausted');
  }

  private withoutPreparedOperation(
    scope: BookAssemblyPublicationScope<BookAssemblyPublicationResult>,
    operationId: string,
  ): BookAssemblyPublicationScope<BookAssemblyPublicationResult> {
    if (scope.current?.updatedByCommandId === operationId || scope.operations?.[operationId]) {
      return scope;
    }
    const manifestIds = new Set(
      Object.values(scope.versions ?? {})
        .filter((version) => version.createdByCommandId === operationId)
        .map((version) => version.manifestVersionId),
    );
    if (manifestIds.size === 0) return scope;
    const retainByManifest = <T extends { readonly manifestVersionId: string }>(
      family: Readonly<Record<string, T>> | undefined,
    ): Record<string, T> | undefined => {
      const retained = Object.entries(family ?? {})
        .filter(([, record]) => !manifestIds.has(record.manifestVersionId));
      return retained.length > 0 ? Object.fromEntries(retained) : undefined;
    };
    const versions = Object.fromEntries(
      Object.entries(scope.versions ?? {})
        .filter(([manifestVersionId]) => !manifestIds.has(manifestVersionId)),
    );
    const audits = Object.fromEntries(
      Object.entries(scope.audits ?? {})
        .filter(([, audit]) => audit.operationId !== operationId),
    );
    return {
      ...scope,
      versions: Object.keys(versions).length > 0 ? versions : undefined,
      activityVersions: retainByManifest(scope.activityVersions),
      activitySafeProjections: retainByManifest(scope.activitySafeProjections),
      placements: retainByManifest(scope.placements),
      unitProjections: retainByManifest(scope.unitProjections),
      deliveryPlans: retainByManifest(scope.deliveryPlans),
      audits: Object.keys(audits).length > 0 ? audits : undefined,
    };
  }

  private async prepareExact(path: string, value: unknown): Promise<void> {
    const existing = await this.rtdb.readWithEtag<unknown>(path);
    if (existing.data !== null && existing.data !== undefined) {
      if (stable(existing.data) !== stable(value)) {
        throw new Error(`book_assembly_publication_immutable_conflict:${path}`);
      }
      return;
    }
    if (!await this.rtdb.writeIfMatch(path, value, existing.etag)) {
      const raced = await this.rtdb.readValue(path);
      if (stable(raced) !== stable(value)) {
        throw new Error(`book_assembly_publication_immutable_conflict:${path}`);
      }
    }
  }

  private async prepareFamilies(
    bookId: string,
    current: Record<string, unknown>,
    next: Record<string, unknown>,
    families: readonly string[],
  ): Promise<void> {
    for (const family of families) {
      const before = isRecord(current[family]) ? current[family] as Record<string, unknown> : {};
      const after = isRecord(next[family]) ? next[family] as Record<string, unknown> : {};
      if (Object.keys(before).some((key) => !(key in after))) {
        throw new Error(`book_assembly_publication_immutable_delete:${family}`);
      }
      for (const [key, value] of Object.entries(after)) {
        if (key in before) {
          if (stable(before[key]) !== stable(value)) {
            throw new Error(`book_assembly_publication_immutable_update:${family}/${key}`);
          }
          continue;
        }
        await this.prepareExact(childPath(bookId, `${family}/${key}`), value);
      }
    }
  }

  private async prepareImmutableDiff(
    bookId: string,
    current: Record<string, unknown>,
    next: Record<string, unknown>,
  ): Promise<void> {
    await this.prepareFamilies(bookId, current, next, [
      'versions',
      'activity_versions',
      'activity_safe_projections',
      'placements',
      'unit_projections',
      'delivery_plans',
    ]);
  }

  private async prepareMarkerDiff(
    bookId: string,
    current: Record<string, unknown>,
    next: Record<string, unknown>,
  ): Promise<void> {
    await this.prepareFamilies(bookId, current, next, ['audits', 'operations']);
  }
}
