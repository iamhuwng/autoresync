import { assertStudentSafeActivityProjection } from '../../../../src/services/book-activity/activityProjection.service.ts';
import { publicBookReferenceForkPaths } from '../../../../src/services/materialCatalog/publicBookReferenceFork.paths.ts';
import type {
  PublicBookEntitlementSnapshot,
  PublicBookForkedActivity,
  PublicBookForkHistoryRecord,
  PublicBookReferenceForkStore,
  PublicBookReferencePlacementRecord,
  PublicBookReferenceRecord,
  PublicBookSelectionSnapshot,
  PublicBookTargetBookSnapshot,
} from '../../../../src/services/materialCatalog/publicBookReferenceFork.types.ts';
import type { BookActivityVersionRecord } from '../../../../src/types/bookActivity.types.ts';
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

const safeStatus = (value: unknown): 'ready' | 'blocked' | 'revoked' | 'replaced' | null =>
  value === 'ready' || value === 'blocked' || value === 'revoked' || value === 'replaced'
    ? value
    : null;

const parsePublicBook = (
  value: unknown,
  activityValues: readonly { readonly projection: unknown; readonly canonical: unknown }[],
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
    const selectionPath = Array.isArray(entry.selectionPath)
      ? entry.selectionPath.filter((part): part is string => typeof part === 'string' && SAFE_ID.test(part))
      : null;
    if (!nodeId || !['section', 'chapter', 'unit'].includes(String(nodeKind))
      || !nodeTitle || order === null || !selectionPath) return [];
    return [{ nodeId, nodeKind: nodeKind as 'section' | 'chapter' | 'unit', title: nodeTitle, order, selectionPath }];
  });
  const activitiesValue = Array.isArray(value.activities) ? value.activities : [];
  if (activitiesValue.length !== activityValues.length) return null;
  const activities = activitiesValue.flatMap((entry, index): PublicBookSelectionSnapshot['activities'][number][] => {
    const sourceActivity = isRecord(entry) ? entry : null;
    const projectionValue = activityValues[index]?.projection;
    if (!sourceActivity || !projectionValue) return [];
    const activityId = stringValue(sourceActivity.activityId);
    const versionId = stringValue(sourceActivity.versionId);
    const activityTitle = textValue(sourceActivity.title);
    const order = intValue(sourceActivity.order);
    const selectionPath = Array.isArray(sourceActivity.selectionPath)
      ? sourceActivity.selectionPath.filter((part): part is string => typeof part === 'string' && SAFE_ID.test(part))
      : null;
    if (!activityId || !versionId || !activityTitle || order === null || !selectionPath) return [];
    try {
      assertStudentSafeActivityProjection(projectionValue);
    } catch {
      return [];
    }
    const canonical = activityValues[index]?.canonical;
    const canonicalVersion = isRecord(canonical)
      && canonical.activityId === activityId
      && canonical.versionId === versionId
      && canonical.materialKind === 'interactive-activity'
      ? canonical as unknown as BookActivityVersionRecord
      : undefined;
    return [{
      activityId,
      versionId,
      title: activityTitle,
      order,
      selectionPath,
      projection: projectionValue,
      ...(canonicalVersion === undefined ? {} : { canonicalVersion }),
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
  const paths = Array.isArray(value.authorizedSelectionPaths)
    ? value.authorizedSelectionPaths.flatMap((path) =>
      Array.isArray(path) && path.every((part) => typeof part === 'string' && SAFE_ID.test(part))
        ? [path as string[]]
        : [])
    : undefined;
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
      if (!activityId || !versionId) return { projection: null, canonical: null };
      const [projection, canonical] = await Promise.all([
        this.rtdb.readValue('book_activity/student_safe_projections/' + activityId + '/' + versionId),
        this.rtdb.readValue('book_activity/versions/' + activityId + '/' + versionId),
      ]);
      return { projection, canonical };
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

  async writeForkMutation(input: {
    readonly operationId: string;
    readonly placements: readonly PublicBookReferencePlacementRecord[];
    readonly activities: readonly PublicBookForkedActivity[];
    readonly history: readonly PublicBookForkHistoryRecord[];
  }): Promise<void> {
    const updates: { readonly path: string; readonly value: unknown }[] = [
      { path: publicBookReferenceForkPaths.operation(input.operationId), value: { schemaVersion: 1, operationId: input.operationId, kind: 'fork', createdAt: input.history[0]?.createdAt } },
    ];
    for (const activity of input.activities) {
      updates.push(
        { path: publicBookReferenceForkPaths.activityMaterial(activity.material.activityId), value: activity.material },
        { path: publicBookReferenceForkPaths.forkCandidate(activity.material.activityId, activity.candidate.candidateId), value: activity.candidate },
        { path: publicBookReferenceForkPaths.forkDraft(activity.material.activityId, activity.draft.draftId), value: activity.draft },
      );
    }
    for (const history of input.history) {
      updates.push({
        path: publicBookReferenceForkPaths.forkHistory(history.forkedActivityId, history.forkId),
        value: history,
      });
    }
    for (const placement of input.placements) {
      updates.push({
        path: publicBookReferenceForkPaths.placement(placement.target.bookId, placement.target.nodeId, placement.target.placementId),
        value: placement,
      });
    }
    await this.rtdb.patchMultiLocation(updates);
  }
}
