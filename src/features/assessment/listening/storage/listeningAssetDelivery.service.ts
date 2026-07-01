import type { ListeningMediaAssetReferences } from './listeningAssetRegistry';

const AUTHORIZED_DELIVERY_TTL_MS = 60 * 60 * 1000;
const AUTHORIZED_DELIVERY_REFRESH_THRESHOLD_MS = 10 * 60 * 1000;
const DEFAULT_RANGE_PROBE_HEADER = 'bytes=0-0';

export interface ListeningDeliveryTrustedContext {
  readonly runtime: 'trusted-server';
  readonly callerUserId: string;
}

export interface ListeningDeliveryResultScope {
  readonly resultId: string;
  readonly versionId: string;
}

export type ListeningDeliverySoloMode = 'self_study' | 'course_material' | 'homework';

export interface ListeningDeliverySoloScope {
  readonly testId: string;
  readonly versionId: string;
  readonly studentId: string;
  readonly mode: ListeningDeliverySoloMode;
  readonly courseId?: string;
  readonly moduleId?: string;
  readonly homeworkId?: string;
  readonly submissionId?: string;
}

export interface ListeningDeliveryLiveScope {
  readonly sessionCode: string;
  readonly testId: string;
  readonly versionId: string;
  readonly studentId: string;
  readonly classId?: string;
  readonly sectionNumber?: number;
}

export interface ListeningDeliveryRetainedVersion {
  readonly versionId: string;
  readonly ownerId: string;
  readonly immutable: boolean;
  readonly active: boolean;
}

export interface ListeningDeliveryRetainedResult {
  readonly resultId: string;
  readonly versionId: string;
  readonly active: boolean;
  readonly viewerUserIds: readonly string[];
}

export interface ListeningDeliveryRetainedSoloAccess {
  readonly testId: string;
  readonly versionId: string;
  readonly active: boolean;
  readonly studentUserIds: readonly string[];
  readonly modes?: readonly ListeningDeliverySoloMode[];
  readonly courseIds?: readonly string[];
  readonly moduleIds?: readonly string[];
  readonly homeworkIds?: readonly string[];
  readonly submissionIds?: readonly string[];
}

export interface ListeningDeliveryRetainedLiveSession {
  readonly sessionCode: string;
  readonly testId: string;
  readonly versionId: string;
  readonly active: boolean;
  readonly studentUserIds: readonly string[];
  readonly classIds?: readonly string[];
  readonly sectionNumbers?: readonly number[];
}

export interface ListeningDeliveryAssetGraph {
  readonly assetId: string;
  readonly canonicalAssetId: string;
  readonly ownerId: string;
  readonly state: 'committed' | 'temp' | 'committing' | 'pending-delete' | 'deleted';
  readonly durableKey: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly references: ListeningMediaAssetReferences;
  readonly retainedVersions: readonly ListeningDeliveryRetainedVersion[];
  readonly retainedResults: readonly ListeningDeliveryRetainedResult[];
  readonly retainedSoloAccess?: readonly ListeningDeliveryRetainedSoloAccess[];
  readonly retainedLiveSessions?: readonly ListeningDeliveryRetainedLiveSession[];
}

export interface ListeningDeliveryRangeProbeRequest {
  readonly durableKey: string;
  readonly rangeHeader: string;
}

export interface ListeningDeliveryRangeProbeResult {
  readonly requestRange: string;
  readonly status: number;
  readonly headers: Record<string, string | number | undefined>;
  readonly bodyLengthBytes: number;
}

export interface ListeningDeliveryRangeProof {
  readonly requestRange: string;
  readonly status: 206;
  readonly acceptRanges: 'bytes';
  readonly contentLength: number;
  readonly contentRange: string;
}

export interface ListeningDeliveryIssuedUrl {
  readonly assetId: string;
  readonly url: string;
  readonly tokenId: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly refreshAfter: number;
  readonly ttlMs: typeof AUTHORIZED_DELIVERY_TTL_MS;
  readonly deliveryReady: true;
  readonly range: ListeningDeliveryRangeProof;
}

export interface ListeningDeliveryRefreshedUrl extends ListeningDeliveryIssuedUrl {
  readonly previousUrlValidUntil: number;
}

export interface ListeningAssetDeliveryDependencies {
  readonly referenceGraph: {
    resolveCanonicalAssetGraph(assetId: string): Promise<ListeningDeliveryAssetGraph | null>;
  };
  readonly signer: {
    createAuthorizedUrl(input: {
      readonly assetId: string;
      readonly ownerId: string;
      readonly durableKey: string;
      readonly contentType: string;
      readonly expiresAt: number;
    }): Promise<{
      readonly url: string;
      readonly tokenId: string;
    }>;
  };
  readonly rangeProbe: {
    probe(input: ListeningDeliveryRangeProbeRequest): Promise<ListeningDeliveryRangeProbeResult>;
  };
}

export interface IssueListeningAssetDeliveryUrlInput {
  readonly assetId: string;
  readonly context: ListeningDeliveryTrustedContext;
  readonly now: number;
  readonly resultScope?: ListeningDeliveryResultScope;
  readonly soloScope?: ListeningDeliverySoloScope;
  readonly liveScope?: ListeningDeliveryLiveScope;
}

export interface RefreshListeningAssetDeliveryUrlInput {
  readonly previous: ListeningDeliveryIssuedUrl;
  readonly context: ListeningDeliveryTrustedContext;
  readonly now: number;
  readonly resultScope?: ListeningDeliveryResultScope;
  readonly soloScope?: ListeningDeliverySoloScope;
  readonly liveScope?: ListeningDeliveryLiveScope;
}

export class ListeningAssetDeliveryError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ListeningAssetDeliveryError';
  }
}

const fail = (code: string): never => {
  throw new ListeningAssetDeliveryError(code);
};

const hasReference = (
  references: ListeningMediaAssetReferences,
  kind: keyof ListeningMediaAssetReferences,
  id: string,
): boolean => Boolean(references[kind]?.[id]);

const normalizeHeader = (
  headers: Record<string, string | number | undefined>,
  name: string,
): string | undefined => {
  const direct = headers[name];
  if (direct !== undefined) return String(direct);
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName && value !== undefined) {
      return String(value);
    }
  }
  return undefined;
};

const parseSingleByteRange = (rangeHeader: string): { start: number; end: number } => {
  const match = /^bytes=(\d+)-(\d+)$/.exec(rangeHeader.trim());
  if (!match) fail('range_request_invalid');
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) {
    fail('range_request_invalid');
  }
  return { start, end };
};

export function assertListeningDeliveryRangeProbe(
  probe: ListeningDeliveryRangeProbeResult,
  totalSizeBytes: number,
): ListeningDeliveryRangeProof {
  const { start, end } = parseSingleByteRange(probe.requestRange);
  if (probe.status !== 206) fail('range_status_not_partial');

  const acceptRanges = normalizeHeader(probe.headers, 'accept-ranges');
  if (acceptRanges?.toLowerCase() !== 'bytes') fail('range_accept_ranges_missing');

  const contentLengthHeader = normalizeHeader(probe.headers, 'content-length');
  if (!contentLengthHeader) fail('range_content_length_missing');
  const contentLength = Number(contentLengthHeader);
  const expectedLength = end - start + 1;
  if (
    !Number.isSafeInteger(contentLength)
    || contentLength !== expectedLength
    || probe.bodyLengthBytes !== expectedLength
  ) {
    fail('range_content_length_mismatch');
  }

  const contentRange = normalizeHeader(probe.headers, 'content-range');
  if (!contentRange) fail('range_content_range_missing');
  const expectedContentRange = `bytes ${start}-${end}/${totalSizeBytes}`;
  if (contentRange !== expectedContentRange) fail('range_content_range_invalid');

  return {
    requestRange: probe.requestRange,
    status: 206,
    acceptRanges: 'bytes',
    contentLength,
    contentRange,
  };
}

const assertTrustedServer = (context: ListeningDeliveryTrustedContext): void => {
  if ((context as { runtime?: string }).runtime !== 'trusted-server') {
    fail('trusted_server_required');
  }
};

const assertCanonicalGraph = (
  requestedAssetId: string,
  graph: ListeningDeliveryAssetGraph | null,
): ListeningDeliveryAssetGraph => {
  if (!graph) fail('asset_not_found');
  if (graph.assetId !== requestedAssetId || graph.canonicalAssetId !== requestedAssetId) {
    fail('asset_id_not_canonical');
  }
  if (graph.state !== 'committed') fail('asset_not_committed');
  if (!graph.durableKey || graph.sizeBytes <= 0) fail('asset_not_deliverable');
  return graph;
};

const isActiveImmutableVersion = (
  graph: ListeningDeliveryAssetGraph,
  versionId: string,
): boolean => graph.retainedVersions.some((version) =>
  version.versionId === versionId
  && version.ownerId === graph.ownerId
  && version.active
  && version.immutable
  && hasReference(graph.references, 'versions', version.versionId),
);

const isResultViewerAuthorized = (
  graph: ListeningDeliveryAssetGraph,
  callerUserId: string,
  scope: ListeningDeliveryResultScope | undefined,
): boolean => {
  if (!scope) return false;
  if (!isActiveImmutableVersion(graph, scope.versionId)) return false;
  return graph.retainedResults.some((result) =>
    result.resultId === scope.resultId
    && result.versionId === scope.versionId
    && result.active
    && result.viewerUserIds.includes(callerUserId)
    && hasReference(graph.references, 'results', result.resultId),
  );
};

const matchesOptionalScopeValue = (
  scopeValue: string | undefined,
  allowedValues: readonly string[] | undefined,
): boolean => !allowedValues || (scopeValue !== undefined && allowedValues.includes(scopeValue));

const isSoloStudentAuthorized = (
  graph: ListeningDeliveryAssetGraph,
  callerUserId: string,
  scope: ListeningDeliverySoloScope | undefined,
): boolean => {
  if (!scope) return false;
  if (callerUserId !== scope.studentId) return false;
  if (!scope.testId || !scope.versionId || !scope.studentId) return false;
  if (!isActiveImmutableVersion(graph, scope.versionId)) return false;
  if (!hasReference(graph.references, 'tests', scope.testId)) return false;

  return (graph.retainedSoloAccess ?? []).some((access) =>
    access.testId === scope.testId
    && access.versionId === scope.versionId
    && access.active
    && access.studentUserIds.includes(callerUserId)
    && (!access.modes || access.modes.includes(scope.mode))
    && matchesOptionalScopeValue(scope.courseId, access.courseIds)
    && matchesOptionalScopeValue(scope.moduleId, access.moduleIds)
    && matchesOptionalScopeValue(scope.homeworkId, access.homeworkIds)
    && matchesOptionalScopeValue(scope.submissionId, access.submissionIds),
  );
};

const matchesOptionalNumberScopeValue = (
  scopeValue: number | undefined,
  allowedValues: readonly number[] | undefined,
): boolean => !allowedValues || (scopeValue !== undefined && allowedValues.includes(scopeValue));

const isLiveStudentAuthorized = (
  graph: ListeningDeliveryAssetGraph,
  callerUserId: string,
  scope: ListeningDeliveryLiveScope | undefined,
): boolean => {
  if (!scope) return false;
  if (callerUserId !== scope.studentId) return false;
  if (!scope.sessionCode || !scope.testId || !scope.versionId || !scope.studentId) return false;
  if (!isActiveImmutableVersion(graph, scope.versionId)) return false;
  if (!hasReference(graph.references, 'tests', scope.testId)) return false;
  if (!hasReference(graph.references, 'sessions', scope.sessionCode)) return false;

  return (graph.retainedLiveSessions ?? []).some((session) =>
    session.sessionCode === scope.sessionCode
    && session.testId === scope.testId
    && session.versionId === scope.versionId
    && session.active
    && session.studentUserIds.includes(callerUserId)
    && matchesOptionalScopeValue(scope.classId, session.classIds)
    && matchesOptionalNumberScopeValue(scope.sectionNumber, session.sectionNumbers),
  );
};

const assertAuthorized = (
  graph: ListeningDeliveryAssetGraph,
  context: ListeningDeliveryTrustedContext,
  resultScope: ListeningDeliveryResultScope | undefined,
  soloScope: ListeningDeliverySoloScope | undefined,
  liveScope: ListeningDeliveryLiveScope | undefined,
): void => {
  if (context.callerUserId === graph.ownerId) {
    return;
  }
  if (isResultViewerAuthorized(graph, context.callerUserId, resultScope)) {
    return;
  }
  if (isSoloStudentAuthorized(graph, context.callerUserId, soloScope)) {
    return;
  }
  if (isLiveStudentAuthorized(graph, context.callerUserId, liveScope)) {
    return;
  }
  fail('delivery_not_authorized');
};

export async function issueListeningAssetDeliveryUrl(
  input: IssueListeningAssetDeliveryUrlInput,
  dependencies: ListeningAssetDeliveryDependencies,
): Promise<ListeningDeliveryIssuedUrl> {
  assertTrustedServer(input.context);
  const graph = assertCanonicalGraph(
    input.assetId,
    await dependencies.referenceGraph.resolveCanonicalAssetGraph(input.assetId),
  );
  assertAuthorized(graph, input.context, input.resultScope, input.soloScope, input.liveScope);

  const range = assertListeningDeliveryRangeProbe(
    await dependencies.rangeProbe.probe({
      durableKey: graph.durableKey,
      rangeHeader: DEFAULT_RANGE_PROBE_HEADER,
    }),
    graph.sizeBytes,
  );

  const expiresAt = input.now + AUTHORIZED_DELIVERY_TTL_MS;
  const signed = await dependencies.signer.createAuthorizedUrl({
    assetId: graph.assetId,
    ownerId: graph.ownerId,
    durableKey: graph.durableKey,
    contentType: graph.contentType,
    expiresAt,
  });

  return {
    assetId: graph.assetId,
    url: signed.url,
    tokenId: signed.tokenId,
    issuedAt: input.now,
    expiresAt,
    refreshAfter: expiresAt - AUTHORIZED_DELIVERY_REFRESH_THRESHOLD_MS,
    ttlMs: AUTHORIZED_DELIVERY_TTL_MS,
    deliveryReady: true,
    range,
  };
}

export async function refreshListeningAssetDeliveryUrl(
  input: RefreshListeningAssetDeliveryUrlInput,
  dependencies: ListeningAssetDeliveryDependencies,
): Promise<ListeningDeliveryRefreshedUrl> {
  if (input.now >= input.previous.expiresAt) fail('delivery_url_expired');
  if (input.now < input.previous.refreshAfter) fail('refresh_not_due');

  const refreshed = await issueListeningAssetDeliveryUrl({
    assetId: input.previous.assetId,
    context: input.context,
    now: input.now,
    resultScope: input.resultScope,
    soloScope: input.soloScope,
    liveScope: input.liveScope,
  }, dependencies);

  return {
    ...refreshed,
    previousUrlValidUntil: input.previous.expiresAt,
  };
}

export function assertListeningDeliveryUrlUsable(
  delivery: ListeningDeliveryIssuedUrl,
  now: number,
): void {
  if (now >= delivery.expiresAt) fail('delivery_url_expired');
}
