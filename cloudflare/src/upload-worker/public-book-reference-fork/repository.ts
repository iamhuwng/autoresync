import { publicBookReferenceForkPaths } from '../../../../src/services/materialCatalog/publicBookReferenceFork.paths.ts';
import { validateStudentActivityProjection } from '../../../../src/services/book-activity/activityProjectionValidation.service.ts';
import { bookAssemblyActivityVersionScopeKey } from '../../../../src/services/book-assembly/publicationTransaction.service.ts';
import type { ExactPublishedActivityVersionReader } from '../../../../src/services/book-assembly/canonicalPublicationRepository.ts';
import type {
  PublicBookEntitlementSnapshot,
  PublicBookReferenceForkStore,
  PublicBookReferencePlacementRecord,
  PublicBookReferenceRecord,
  PublicBookSelectionSnapshot,
  PublicBookTargetBookSnapshot,
} from '../../../../src/services/materialCatalog/publicBookReferenceFork.types.ts';
import type {
  MaterialBookMetadata,
  MaterialBookNode,
} from '../../../../src/types/materialCatalog.types.ts';
import type { StudentActivityProjection } from '../../../../src/types/bookActivity.types.ts';
import { FirebaseRtdbRestClient, type RepositoryEnv } from '../listening-authoring/rtdb.ts';
import type {
  PublicBookCanonicalForkArtifacts,
  PublicBookCanonicalForkRepository,
  PublicBookCanonicalForkSource,
} from './writer.ts';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@_-]{0,159}$/u;
type RecordValue = Record<string, unknown>;
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
const samePath = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

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

const parseMaterialBook = (value: unknown, bookId: string): MaterialBookMetadata | null => {
  if (!isRecord(value) || value.bookId !== bookId
    || !stringValue(value.ownerId) || typeof value.title !== 'string'
    || !Array.isArray(value.authors) || !Array.isArray(value.testTypeIds)
    || !Array.isArray(value.tags) || !stringValue(value.createdAt)
    || !stringValue(value.updatedAt) || !stringValue(value.createdBy)
    || !stringValue(value.updatedBy)
    || !['private', 'public-library-pending-review', 'public-library-published', 'public-library-rejected'].includes(String(value.visibility))
    || !['draft-empty', 'draft-in-progress', 'ready', 'needs-repair', 'archived'].includes(String(value.status))) {
    return null;
  }
  return value as unknown as MaterialBookMetadata;
};

const parseMaterialBookNodes = (value: unknown, bookId: string): readonly MaterialBookNode[] => {
  const values = Array.isArray(value) ? value : isRecord(value) ? Object.values(value) : [];
  return values.flatMap((entry): MaterialBookNode[] => {
    if (!isRecord(entry) || entry.bookId !== bookId || !stringValue(entry.nodeId)
      || (entry.parentNodeId !== null && entry.parentNodeId !== undefined && !stringValue(entry.parentNodeId))
      || typeof entry.title !== 'string' || !Number.isSafeInteger(entry.order)
      || !stringValue(entry.createdAt)
      || !stringValue(entry.updatedAt)) return [];
    const materialRefs = entry.materialRefs;
    if (materialRefs !== undefined && materialRefs !== null && !Array.isArray(materialRefs)) return [];
    return [{ ...entry, materialRefs: materialRefs ?? [] } as unknown as MaterialBookNode];
  });
};

const sourcePath = (bookId: string, suffix: string): string =>
  `book_assembly_publications/books/${bookId}/${suffix}`;

const sourceActivityVersionPath = (bookId: string, manifestVersionId: string, activityVersionId: string): string =>
  sourcePath(bookId, `activity_versions/${bookAssemblyActivityVersionScopeKey(manifestVersionId, activityVersionId)}`);

const sourceSafeProjectionPath = (bookId: string, projectionId: string): string =>
  sourcePath(bookId, `activity_safe_projections/${projectionId}`);

const sourcePlacementPath = (bookId: string, placementId: string): string =>
  sourcePath(bookId, `placements/${placementId}`);

export class FirebaseRestPublicBookReferenceForkRepository implements PublicBookReferenceForkStore, PublicBookCanonicalForkRepository {
  private readonly rtdb: FirebaseRtdbRestClient;
  private readonly env: RepositoryEnv;
  private readonly fetchImpl: typeof fetch;
  private readonly canonicalForkSourceReader?: (input: {
    readonly source: PublicBookSelectionSnapshot;
    readonly activityId: string;
    readonly activityVersionId: string;
  }) => Promise<PublicBookCanonicalForkSource | null>;
  private readonly canonicalForkExactReader?: ExactPublishedActivityVersionReader;
  private readonly canonicalForkTokenProvider?: (claims: Record<string, unknown>) => Promise<string>;

  constructor(options: {
    readonly env: RepositoryEnv;
    readonly fetchImpl?: typeof fetch;
    readonly getAccessToken?: () => Promise<string>;
    readonly getFirebaseAuthToken?: () => Promise<string>;
    readonly getCanonicalForkFirebaseAuthToken?: (claims: Record<string, unknown>) => Promise<string>;
    readonly canonicalForkExactReader?: ExactPublishedActivityVersionReader;
    readonly readCanonicalForkSource?: (input: {
      readonly source: PublicBookSelectionSnapshot;
      readonly activityId: string;
      readonly activityVersionId: string;
    }) => Promise<PublicBookCanonicalForkSource | null>;
  }) {
    this.env = options.env;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.canonicalForkSourceReader = options.readCanonicalForkSource;
    this.canonicalForkExactReader = options.canonicalForkExactReader;
    this.canonicalForkTokenProvider = options.getCanonicalForkFirebaseAuthToken;
    this.rtdb = new FirebaseRtdbRestClient({
      env: options.env,
      fetchImpl: this.fetchImpl,
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

  async readCanonicalForkTargetBook(bookId: string): Promise<MaterialBookMetadata | null> {
    return parseMaterialBook(
      await this.rtdb.readValue('material_catalog/books/' + bookId),
      bookId,
    );
  }

  async listCanonicalForkTargetBookNodes(bookId: string): Promise<readonly MaterialBookNode[]> {
    return parseMaterialBookNodes(
      await this.rtdb.readValue('material_catalog/book_nodes/' + bookId),
      bookId,
    );
  }

  async readCanonicalForkSource(input: {
    readonly source: PublicBookSelectionSnapshot;
    readonly activityId: string;
    readonly activityVersionId: string;
  }): Promise<PublicBookCanonicalForkSource | null> {
    if (this.canonicalForkSourceReader) return this.canonicalForkSourceReader(input);
    const currentValue = await this.rtdb.readValue(sourcePath(input.source.bookId, 'current'));
    const current = isRecord(currentValue) ? currentValue : null;
    const manifestVersionId = stringValue(current?.manifestVersionId);
    const publicationId = stringValue(current?.publicationId);
    const publicationRevision = intValue(current?.publicationRevision);
    if (!manifestVersionId || !publicationId || publicationRevision === null
      || publicationId !== input.source.publication.publicationId
      || publicationRevision !== input.source.publication.revision) return null;
    const manifestValue = await this.rtdb.readValue(sourcePath(input.source.bookId, `versions/${manifestVersionId}`));
    const manifest = isRecord(manifestValue) ? manifestValue : null;
    if (!manifest || manifest.schemaVersion !== 1 || manifest.lifecycle !== 'published'
      || manifest.bookId !== input.source.bookId || manifest.manifestVersionId !== manifestVersionId
      || manifest.publicationId !== publicationId || manifest.publicationRevision !== publicationRevision
      || !stringValue(manifest.ownerId) || !isRecord(manifest.manifest)) return null;
    const activityReference = await this.rtdb.readValue(
      sourceActivityVersionPath(input.source.bookId, manifestVersionId, input.activityVersionId),
    );
    const activityReferenceRecord = isRecord(activityReference) ? activityReference : null;
    if (!activityReferenceRecord || activityReferenceRecord.schemaVersion !== 1
      || activityReferenceRecord.bookId !== input.source.bookId
      || activityReferenceRecord.manifestVersionId !== manifestVersionId
      || activityReferenceRecord.publicationId !== publicationId
      || activityReferenceRecord.publicationRevision !== publicationRevision
      || activityReferenceRecord.activityId !== input.activityId
      || activityReferenceRecord.activityVersionId !== input.activityVersionId
      || !Number.isSafeInteger(activityReferenceRecord.activityVersion)
      || (activityReferenceRecord.activityVersion as number) < 1
      || !stringValue(activityReferenceRecord.safeProjectionId)
      || !stringValue(activityReferenceRecord.canonicalPayloadFingerprint)) return null;
    const bookSafe = await this.rtdb.readValue(
      sourceSafeProjectionPath(input.source.bookId, activityReferenceRecord.safeProjectionId as string),
    );
    const bookSafeRecord = isRecord(bookSafe) ? bookSafe : null;
    if (!bookSafeRecord || bookSafeRecord.schemaVersion !== 1
      || bookSafeRecord.bookId !== input.source.bookId
      || bookSafeRecord.manifestVersionId !== manifestVersionId
      || bookSafeRecord.publicationId !== publicationId
      || bookSafeRecord.publicationRevision !== publicationRevision
      || bookSafeRecord.activityId !== input.activityId
      || bookSafeRecord.activityVersionId !== input.activityVersionId
      || !Array.isArray(bookSafeRecord.placementIds)
      || bookSafeRecord.placementIds.some((id) => typeof id !== 'string' || !SAFE_ID.test(id))) return null;
    const placementIds = [...(bookSafeRecord.placementIds as string[])].sort();
    const placementRoot = await this.rtdb.readValue(sourcePath(input.source.bookId, 'placements'));
    const placementEntries = isRecord(placementRoot) ? Object.entries(placementRoot) : [];
    const matchingPlacements = placementEntries.filter(([placementId, value]) => {
      if (!isRecord(value) || value.placementId !== placementId) return false;
      return value.bookId === input.source.bookId
        && value.manifestVersionId === manifestVersionId
        && value.publicationId === publicationId
        && value.publicationRevision === publicationRevision
        && value.activityId === input.activityId
        && value.activityVersionId === input.activityVersionId;
    });
    const matchingPlacementIds = matchingPlacements.map(([placementId]) => placementId).sort();
    if (matchingPlacementIds.length !== placementIds.length
      || matchingPlacementIds.some((placementId, index) => placementId !== placementIds[index])) return null;
    const selectedActivity = input.source.activities.find((activity) => activity.activityId === input.activityId);
    const matchingSelectedPlacements = matchingPlacements.filter(([, value]) => {
      if (!isRecord(value) || !selectedActivity || typeof value.nodeKey !== 'string') return false;
      const selectedNode = input.source.nodes.find((node) => node.nodeId === value.nodeKey);
      return selectedNode !== undefined
        && samePath(selectedNode.selectionPath, selectedActivity.selectionPath)
        && value.order === selectedActivity.order;
    });
    if (matchingSelectedPlacements.length !== 1) return null;
    const sourcePlacementEntry = matchingSelectedPlacements[0];
    const sourcePlacementValue = sourcePlacementEntry?.[1];
    const sourcePlacement = isRecord(sourcePlacementValue) ? sourcePlacementValue : undefined;
    if (!sourcePlacement
      || sourcePlacement.placementId !== sourcePlacementEntry?.[0]
      || sourcePlacement.bookId !== input.source.bookId
      || sourcePlacement.manifestVersionId !== manifestVersionId
      || sourcePlacement.publicationId !== publicationId
      || sourcePlacement.publicationRevision !== publicationRevision
      || sourcePlacement.activityId !== input.activityId
      || sourcePlacement.activityVersionId !== input.activityVersionId
      || !stringValue(sourcePlacement.nodeKey)
      || !stringValue(sourcePlacement.unitKey)
      || !stringValue(sourcePlacement.activityKey)
      || !Number.isSafeInteger(sourcePlacement.order)
      || !Array.isArray(sourcePlacement.pageGroupKeys)
      || sourcePlacement.pageGroupKeys.length === 0
      || sourcePlacement.pageGroupKeys.some((id) => !stringValue(id))
      || !Array.isArray(sourcePlacement.sourcePages)
      || sourcePlacement.sourcePages.length === 0) return null;
    if (!this.canonicalForkExactReader) return null;
    const canonicalValue = await this.canonicalForkExactReader.readExact({
      bookId: input.source.bookId,
      manifestVersionId,
      publicationId,
      ownerId: manifest.ownerId as string,
      activityId: input.activityId,
      activityVersionId: input.activityVersionId,
      activityVersion: activityReferenceRecord.activityVersion as number,
      payloadFingerprint: activityReferenceRecord.canonicalPayloadFingerprint as string,
    });
    const safeProjectionValue = await this.rtdb.readValue(
      `book_activity/student_safe_projections/${input.activityId}/${input.activityVersionId}`,
    );
    const canonical = isRecord(canonicalValue) ? canonicalValue : null;
    const safeProjection = isRecord(safeProjectionValue) ? safeProjectionValue : null;
    if (!canonical || !safeProjection || canonical.activityId !== input.activityId
      || canonical.activityVersionId !== input.activityVersionId
      || canonical.payloadFingerprint !== activityReferenceRecord.canonicalPayloadFingerprint) return null;
    const sourceSet = isRecord(manifest.manifest.sourceSet) ? manifest.manifest.sourceSet : null;
    const sources = sourceSet && Array.isArray(sourceSet.sources) ? sourceSet.sources : [];
    const sourcePageBindings = sourcePlacement.sourcePages.map((page) => ({
      sourceKey: isRecord(page) ? stringValue(page.sourceKey) : null,
      sourceVersionId: isRecord(page) ? stringValue(page.sourceVersionId) : null,
    }));
    if (sourcePageBindings.some((binding) => !binding.sourceKey || !binding.sourceVersionId)) return null;
    const sourceVersionIds = [...new Set(sourcePageBindings.map((binding) => binding.sourceVersionId as string))];
    if (sourceVersionIds.length !== 1 || sourceVersionIds[0] !== input.source.source.sourceVersionId) return null;
    if (sourcePageBindings.some((binding) => !sources.some((source) =>
      isRecord(source)
      && source.sourceKey === binding.sourceKey
      && source.sourceVersionId === binding.sourceVersionId))) return null;
    const sourceVersionId = sourceVersionIds[0];
    return {
      canonical,
      safeProjection,
      sourceBookId: input.source.bookId,
      sourceOwnerId: manifest.ownerId as string,
      sourceVersionId,
      manifestVersionId,
      publicationId,
      publicationRevision,
      sourcePlacementIds: placementIds,
      ...(sourcePlacement ? {
        sourcePlacement: {
          placementId: sourcePlacement.placementId as string,
          ...(stringValue(sourcePlacement.nodeKey) ? { nodeId: sourcePlacement.nodeKey as string } : {}),
          ...(stringValue(sourcePlacement.unitKey) ? { unitKey: sourcePlacement.unitKey as string } : {}),
          ...(stringValue(sourcePlacement.activityKey) ? { activityKey: sourcePlacement.activityKey as string } : {}),
          ...(Number.isSafeInteger(sourcePlacement.order) ? { order: sourcePlacement.order as number } : {}),
          ...(Array.isArray(sourcePlacement.pageGroupKeys)
            ? { pageGroupIds: sourcePlacement.pageGroupKeys.filter((id): id is string => typeof id === 'string') }
            : {}),
          ...(Array.isArray(sourcePlacement.sourcePages) ? { sourcePages: sourcePlacement.sourcePages as RecordValue[] } : {}),
        },
      } : {}),
      ...(Array.isArray(sourcePlacement?.sourcePages) ? { sourcePages: sourcePlacement.sourcePages as RecordValue[] } : {}),
      ...(Array.isArray(sourcePlacement?.pageGroupKeys)
        ? { pageGroupIds: sourcePlacement.pageGroupKeys.filter((id): id is string => typeof id === 'string') }
        : {}),
    };
  }

  async readCanonicalForkReceipt(actorId: string, operationId: string): Promise<unknown | null> {
    return this.rtdb.readValue(`book_activity/canonical_fork_operations/${actorId}/${operationId}`);
  }

  async readCanonicalForkArtifacts(input: {
    readonly activityId: string;
    readonly activityVersionId: string;
  }): Promise<PublicBookCanonicalForkArtifacts> {
    const [canonical, safeProjection] = await Promise.all([
      this.rtdb.readValue(`book_activity/versions/${input.activityId}/${input.activityVersionId}`),
      this.rtdb.readValue(`book_activity/student_safe_projections/${input.activityId}/${input.activityVersionId}`),
    ]);
    return {
      ...(canonical === null || canonical === undefined ? {} : { canonical }),
      ...(safeProjection === null || safeProjection === undefined ? {} : { safeProjection }),
    };
  }

  async patchCanonicalFork(input: {
    readonly updates: readonly { readonly path: string; readonly value: unknown }[];
    readonly claims: Record<string, unknown>;
  }): Promise<void> {
    const tokenProvider = this.canonicalForkTokenProvider;
    if (!tokenProvider) throw new Error('missing_public_book_canonical_fork_token_provider');
    const token = await tokenProvider(input.claims);
    const client = new FirebaseRtdbRestClient({
      env: this.env,
      fetchImpl: this.fetchImpl,
      firebaseAuthToken: true,
      getFirebaseAuthToken: async () => token,
    });
    await client.patchMultiLocation(input.updates);
  }

}
