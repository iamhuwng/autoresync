import { resolveListeningLegacyAudioReference } from '../../adapters/listeningLegacyAudioResolver';
import type {
  IssueListeningAssetDeliveryUrlInput,
  ListeningDeliveryIssuedUrl,
  ListeningDeliveryRefreshedUrl,
  RefreshListeningAssetDeliveryUrlInput,
} from '../../storage/listeningAssetDelivery.service';

export interface ListeningLiveDeliveryAudioSection {
  readonly number: number;
  readonly audioUrl: string;
  readonly streamUrl?: string;
  readonly assetId?: string;
  readonly versionId?: string;
}

export interface ListeningLiveDeliveryIssuer {
  issue(input: IssueListeningAssetDeliveryUrlInput): Promise<ListeningDeliveryIssuedUrl>;
  refresh?(input: RefreshListeningAssetDeliveryUrlInput): Promise<ListeningDeliveryRefreshedUrl>;
}

export interface ListeningLiveDeliveryInput {
  readonly sessionCode?: string;
  readonly testId?: string;
  readonly materialVersionId?: string;
  readonly studentId?: string;
  readonly classId?: string;
  readonly now: number;
  readonly section: ListeningLiveDeliveryAudioSection;
  readonly deliveryIssuer?: ListeningLiveDeliveryIssuer;
}

export type ListeningLiveAudioResolution =
  | {
    readonly kind: 'legacy-public-r2';
    readonly sectionNumber: number;
    readonly readOnly: true;
    readonly deliveryMode: 'public-r2';
    readonly audioUrl: string;
    readonly streamUrl?: string;
    readonly migrationPerformed: false;
  }
  | {
    readonly kind: 'authorized-asset-delivery';
    readonly sectionNumber: number;
    readonly readOnly: true;
    readonly deliveryMode: 'authorized';
    readonly assetId: string;
    readonly versionId: string;
    readonly audioUrl: string;
    readonly delivery: ListeningDeliveryIssuedUrl;
    readonly migrationPerformed: false;
  };

export interface RefreshListeningLiveAudioDeliveryInput {
  readonly previous: ListeningDeliveryIssuedUrl;
  readonly sessionCode?: string;
  readonly testId?: string;
  readonly materialVersionId?: string;
  readonly studentId?: string;
  readonly classId?: string;
  readonly sectionNumber?: number;
  readonly now: number;
  readonly deliveryIssuer: ListeningLiveDeliveryIssuer;
}

export class ListeningLiveDeliveryAdapterError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ListeningLiveDeliveryAdapterError';
  }
}

const fail = (code: string): never => {
  throw new ListeningLiveDeliveryAdapterError(code);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

export function readListeningLiveVersionId(testData: unknown): string | undefined {
  if (!isRecord(testData)) return undefined;
  const authoringVersioning = isRecord(testData.authoringVersioning)
    ? testData.authoringVersioning
    : undefined;

  return (
    readString(authoringVersioning?.versionId)
    ?? readString(testData.versionId)
    ?? readString(testData.latestPublishedVersionId)
    ?? readString(testData.publishedVersionId)
  );
}

export async function resolveListeningLiveAudioSection(
  input: ListeningLiveDeliveryInput,
): Promise<ListeningLiveAudioResolution> {
  if (!input.section.assetId) {
    const legacy = resolveListeningLegacyAudioReference({
      audioUrl: input.section.audioUrl || input.section.streamUrl || '',
      streamUrl: input.section.streamUrl,
    });
    return {
      kind: 'legacy-public-r2',
      sectionNumber: input.section.number,
      readOnly: true,
      deliveryMode: 'public-r2',
      audioUrl: legacy.audioUrl,
      streamUrl: legacy.streamUrl,
      migrationPerformed: false,
    };
  }

  if (!input.deliveryIssuer) fail('listening_live_delivery_issuer_required');
  if (!input.sessionCode) fail('listening_live_session_scope_required');
  if (!input.testId) fail('listening_live_test_scope_required');
  if (!input.studentId) fail('listening_live_student_scope_required');
  const versionId = input.section.versionId || input.materialVersionId;
  if (!versionId) fail('listening_live_version_scope_required');

  const delivery = await input.deliveryIssuer.issue({
    assetId: input.section.assetId,
    context: {
      runtime: 'trusted-server',
      callerUserId: input.studentId,
    },
    now: input.now,
    liveScope: {
      sessionCode: input.sessionCode,
      testId: input.testId,
      versionId,
      studentId: input.studentId,
      classId: input.classId,
      sectionNumber: input.section.number,
    },
  });

  return {
    kind: 'authorized-asset-delivery',
    sectionNumber: input.section.number,
    readOnly: true,
    deliveryMode: 'authorized',
    assetId: input.section.assetId,
    versionId,
    audioUrl: delivery.url,
    delivery,
    migrationPerformed: false,
  };
}

export async function refreshListeningLiveAudioDelivery(
  input: RefreshListeningLiveAudioDeliveryInput,
): Promise<ListeningDeliveryRefreshedUrl> {
  if (!input.deliveryIssuer.refresh) fail('listening_live_delivery_refresh_unavailable');
  if (!input.sessionCode) fail('listening_live_session_scope_required');
  if (!input.testId) fail('listening_live_test_scope_required');
  if (!input.studentId) fail('listening_live_student_scope_required');
  if (!input.materialVersionId) fail('listening_live_version_scope_required');

  return input.deliveryIssuer.refresh({
    previous: input.previous,
    context: {
      runtime: 'trusted-server',
      callerUserId: input.studentId,
    },
    now: input.now,
    liveScope: {
      sessionCode: input.sessionCode,
      testId: input.testId,
      versionId: input.materialVersionId,
      studentId: input.studentId,
      classId: input.classId,
      sectionNumber: input.sectionNumber,
    },
  });
}
