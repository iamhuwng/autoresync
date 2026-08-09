import { publicBookReferenceForkPaths } from '../../../../src/services/materialCatalog/publicBookReferenceFork.paths.ts';
import { validateStudentActivityProjection } from '../../../../src/services/book-activity/activityProjectionValidation.service.ts';
import type {
  PublicBookEntitlementSnapshot,
  PublicBookReferenceForkStore,
  PublicBookReferencePlacementRecord,
  PublicBookReferenceRecord,
  PublicBookSelectionSnapshot,
  PublicBookTargetBookSnapshot,
} from '../../../../src/services/materialCatalog/publicBookReferenceFork.types.ts';
import type { StudentActivityProjection } from '../../../../src/types/bookActivity.types.ts';
import { FirebaseRtdbRestClient, type RepositoryEnv } from '../listening-authoring/rtdb.ts';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,159}$/u;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const stringValue = (value: unknown): string | null =>
  typeof value === 'string' && SAFE_ID.test(value) ? value : null;
const textValue = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;
const intValue = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
const boundedText = (value: unknown, max = 16_384): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const exactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean => {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key))
    && Object.keys(value).every((key) => allowed.has(key));
};
const safePath = (value: unknown): readonly string[] | null =>
  Array.isArray(value) && value.every((part) => typeof part === 'string' && SAFE_ID.test(part))
    ? value as string[]
    : null;

const FORBIDDEN_PUBLIC_KEYS = new Set([
  'provider',
  'providerAuthority',
  'objectKey',
  'privateObjectKey',
  'bucketBinding',
  'credentials',
  'answerKey',
  'answerKeys',
  'answerRule',
  'teacherNotes',
  'candidates',
  'authoring',
  'authoringData',
  'homework',
  'updates',
]);

const containsForbiddenPublicKey = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(containsForbiddenPublicKey);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, child]) =>
    FORBIDDEN_PUBLIC_KEYS.has(key) || containsForbiddenPublicKey(child));
};

const parseStoredProjection = (
  value: unknown,
  activityId: string,
  versionId: string,
): StudentActivityProjection | null => {
  if (!isRecord(value) || !exactKeys(value, [
    'schemaVersion', 'projectionKind', 'activityId', 'activityVersionId', 'ownerId',
    'content', 'payloadFingerprint', 'createdByOperationId', 'publishedAt',
  ]) || value.schemaVersion !== 1 || value.projectionKind !== 'student-safe'
    || value.activityId !== activityId || value.activityVersionId !== versionId
    || !stringValue(value.ownerId) || !/^fnv1a64:[0-9a-f]{16}$/u.test(String(value.payloadFingerprint))
    || !stringValue(value.createdByOperationId) || !boundedText(value.publishedAt, 128)) return null;
  const validation = validateStudentActivityProjection(value.content);
  return validation.valid ? validation.value : null;
};

const safeStatus = (value: unknown): 'ready' | 'blocked' | 'revoked' | 'replaced' | null =>
  value === 'ready' || value === 'blocked' || value === 'revoked' || value === 'replaced'
    ? value
    : null;

const parsePublicBook = (
  value: unknown,
  activityValues: readonly unknown[],
): PublicBookSelectionSnapshot | null => {
  if (!isRecord(value) || containsForbiddenPublicKey(value)) return null;
  const bookId = stringValue(value.bookId);
  const title = textValue(value.title);
  const publicationValue = isRecord(value.publication) ? value.publication : null;
  const sourceValue = isRecord(value.source) ? value.source : null;
  if (!bookId || !title || typeof value.publicTree !== 'boolean' || !publicationValue || !sourceValue) return null;
  const publicationId = stringValue(publicationValue.publicationId);
  const publicationRevision = intValue(publicationValue.revision);
  const publicationStatus = publicationValue.status;
  const publishedAt = textValue(publicationValue.publishedAt);
  const updatedAt = textValue(publicationValue.updatedAt);
  const sourceVersionId = stringValue(sourceValue.sourceVersionId);
  const lifecycleState = safeStatus(sourceValue.lifecycleState);
  const studentSafeStatus = safeStatus(sourceValue.studentSafeStatus);
  const documentDeliveryStatus = safeStatus(sourceValue.documentDeliveryStatus);
  if (!publicationId || publicationRevision === null || publicationRevision < 1
    || !['trusted', 'untrusted', 'revoked', 'replaced'].includes(String(publicationStatus))
    || !publishedAt || !updatedAt || !sourceVersionId
    || !lifecycleState || !studentSafeStatus || !documentDeliveryStatus) return null;
  const nodesValue = Array.isArray(value.nodes) ? value.nodes : [];
  const nodes = nodesValue.flatMap((entry): PublicBookSelectionSnapshot['nodes'][number][] => {
    if (!isRecord(entry)) return [];
    const nodeId = stringValue(entry.nodeId);
    const nodeKind = entry.nodeKind;
    const nodeTitle = textValue(entry.title);
    const order = intValue(entry.order);
    const selectionPath = safePath(entry.selectionPath);
    if (!nodeId || !['section', 'chapter', 'unit'].includes(String(nodeKind))
      || !nodeTitle || order === null || !selectionPath) return [];
    return [{ nodeId, nodeKind: nodeKind as 'section' | 'chapter' | 'unit', title: nodeTitle, order, selectionPath }];
  });
  const activitiesValue = Array.isArray(value.activities) ? value.activities : [];
  if (activitiesValue.length !== activityValues.length) return null;
  const activities = activitiesValue.flatMap((entry, index): PublicBookSelectionSnapshot['activities'][number][] => {
    const sourceActivity = isRecord(entry) ? entry : null;
    const projectionValue = activityValues[index];
    if (!sourceActivity || !projectionValue) return [];
    const activityId = stringValue(sourceActivity.activityId);
    const versionId = stringValue(sourceActivity.versionId);
    const activityTitle = textValue(sourceActivity.title);
    const order = intValue(sourceActivity.order);
    const selectionPath = safePath(sourceActivity.selectionPath);
    if (!activityId || !versionId || !activityTitle || order === null || !selectionPath) return [];
    const projection = parseStoredProjection(projectionValue, activityId, versionId);
    if (!projection) return [];
    return [{
      activityId,
      versionId,
      title: activityTitle,
      order,
      selectionPath,
      projection,
    }];
  });
  if (activities.length !== activitiesValue.length) return null;
  return {
    bookId,
    title,
    publicTree: value.publicTree,
    publication: {
      publicationId,
      revision: publicationRevision,
      status: publicationStatus as 'trusted' | 'untrusted' | 'revoked' | 'replaced',
      publishedAt,
      updatedAt,
    },
    source: {
      sourceVersionId,
      lifecycleState,
      studentSafeStatus,
      documentDeliveryStatus,
      ...(stringValue(sourceValue.replacementSourceVersionId) === null
        ? {}
        : { replacementSourceVersionId: stringValue(sourceValue.replacementSourceVersionId) as string }),
    },
    nodes,
    activities,
  };
};

const parseEntitlement = (value: unknown): PublicBookEntitlementSnapshot | null => {
  if (!isRecord(value) || containsForbiddenPublicKey(value)) return null;
  const entitlementId = stringValue(value.entitlementId);
  const studentId = stringValue(value.studentId);
  const bookId = stringValue(value.bookId);
  const sourceVersionId = stringValue(value.sourceVersionId);
  const publicationId = stringValue(value.publicationId);
  const publicationRevision = intValue(value.publicationRevision);
  const contextId = stringValue(value.contextId);
  if (!entitlementId || !studentId || !bookId || !sourceVersionId || !publicationId
    || publicationRevision === null || publicationRevision < 1 || !contextId
    || (value.status !== 'active' && value.status !== 'revoked')) return null;
  const paths = value.authorizedSelectionPaths === undefined
    ? undefined
    : Array.isArray(value.authorizedSelectionPaths)
      && value.authorizedSelectionPaths.every((path) => safePath(path) !== null)
      ? value.authorizedSelectionPaths.map((path) => safePath(path) as string[])
      : null;
  if (paths === null) return null;
  return {
    entitlementId,
    studentId,
    bookId,
    sourceVersionId,
    publicationId,
    publicationRevision,
    status: value.status,
    contextId,
    ...(paths === undefined ? {} : { authorizedSelectionPaths: paths }),
  };
};

const parseReference = (value: unknown): PublicBookReferenceRecord | null =>
  isRecord(value) && value.recordKind === 'public-book-reference'
    ? value as unknown as PublicBookReferenceRecord
    : null;

export class FirebaseRestPublicBookReferenceForkRepository implements PublicBookReferenceForkStore {
  private readonly rtdb: FirebaseRtdbRestClient;

  constructor(options: {
    readonly env: RepositoryEnv;
    readonly fetchImpl?: typeof fetch;
    readonly getAccessToken?: () => Promise<string>;
    readonly getFirebaseAuthToken?: () => Promise<string>;
  }) {
    this.rtdb = new FirebaseRtdbRestClient({
      env: options.env,
      fetchImpl: options.fetchImpl ?? globalThis.fetch.bind(globalThis),
      getAccessToken: options.getAccessToken,
      firebaseAuthToken: options.getFirebaseAuthToken !== undefined,
      getFirebaseAuthToken: options.getFirebaseAuthToken,
    });
  }

  async readPublicBook(bookId: string): Promise<PublicBookSelectionSnapshot | null> {
    const projectionValue = await this.rtdb.readValue('material_catalog/public_book_projections/' + bookId);
    if (!isRecord(projectionValue)) return null;
    const activitiesValue = Array.isArray(projectionValue.activities) ? projectionValue.activities : [];
    const activityValues = await Promise.all(activitiesValue.map(async (entry) => {
      const activityId = isRecord(entry) ? stringValue(entry.activityId) : null;
      const versionId = isRecord(entry) ? stringValue(entry.versionId) : null;
      if (!activityId || !versionId) return null;
      return this.rtdb.readValue('book_activity/student_safe_projections/' + activityId + '/' + versionId);
    }));
    return parsePublicBook(projectionValue, activityValues);
  }

  async readTargetBook(bookId: string): Promise<PublicBookTargetBookSnapshot | null> {
    const value = await this.rtdb.readValue('material_catalog/books/' + bookId);
    if (!isRecord(value)) return null;
    const ownerId = stringValue(value.ownerId)
      ?? (isRecord(value.metadata) ? stringValue(value.metadata.ownerId) : null);
    if (!ownerId) return null;
    const revision = intValue(value.revision)
      ?? (isRecord(value.structure) ? intValue(value.structure.revision) : null)
      ?? 1;
    const status = value.status === 'ready' || value.status === 'archived' || value.status === 'draft'
      ? value.status
      : 'draft';
    return { bookId, ownerId, revision, status };
  }

  async readEntitlement(input: {
    readonly studentId: string;
    readonly entitlementId: string;
  }): Promise<PublicBookEntitlementSnapshot | null> {
    return parseEntitlement(await this.rtdb.readValue(
      'book_delivery/entitlements/' + input.studentId + '/' + input.entitlementId,
    ));
  }

  async readCurrentReference(referenceId: string): Promise<PublicBookReferenceRecord | null> {
    return parseReference(await this.rtdb.readValue(publicBookReferenceForkPaths.currentReference(referenceId)));
  }

  async readReferenceRevision(referenceId: string, revision: number): Promise<PublicBookReferenceRecord | null> {
    return parseReference(await this.rtdb.readValue(publicBookReferenceForkPaths.referenceRevision(referenceId, revision)));
  }

  async writeReferenceMutation(input: {
    readonly operationId: string;
    readonly reference: PublicBookReferenceRecord;
    readonly placement: PublicBookReferencePlacementRecord;
  }): Promise<void> {
    await this.rtdb.patchMultiLocation([
      { path: publicBookReferenceForkPaths.referenceRevision(input.reference.referenceId, input.reference.revision), value: input.reference },
      { path: publicBookReferenceForkPaths.currentReference(input.reference.referenceId), value: input.reference },
      { path: publicBookReferenceForkPaths.referenceByTarget(input.reference.target.bookId, input.reference.referenceId), value: { revision: input.reference.revision } },
      { path: publicBookReferenceForkPaths.referenceBySource(input.reference.source.bookId, input.reference.referenceId), value: { revision: input.reference.revision } },
      { path: publicBookReferenceForkPaths.placement(input.placement.target.bookId, input.placement.target.nodeId, input.placement.target.placementId), value: input.placement },
      { path: publicBookReferenceForkPaths.operation(input.operationId), value: { schemaVersion: 1, operationId: input.operationId, kind: input.reference.operation, referenceId: input.reference.referenceId, revision: input.reference.revision, createdAt: input.reference.createdAt } },
    ]);
  }

}
