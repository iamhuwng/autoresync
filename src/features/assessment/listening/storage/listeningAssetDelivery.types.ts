import type { ListeningMediaAssetReferences } from './listeningAssetRegistry';

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
  readonly audioReplaced?: true;
  readonly audioReplacedAt?: number;
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
  readonly ttlMs: number;
  readonly deliveryReady: true;
  readonly range: ListeningDeliveryRangeProof;
  readonly audioReplaced?: true;
  readonly audioReplacedAt?: number;
}

export interface ListeningDeliveryRefreshedUrl extends ListeningDeliveryIssuedUrl {
  readonly previousUrlValidUntil: number;
}

export interface ListeningAssetDeliveryDependencies {
  readonly resolvePhysicalAsset?: (graph: ListeningDeliveryAssetGraph) => Promise<ListeningDeliveryAssetGraph>;
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
