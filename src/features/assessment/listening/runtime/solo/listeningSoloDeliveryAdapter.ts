import { resolveListeningLegacyAudioReference } from '../../adapters/listeningLegacyAudioResolver';
import type {
  IssueListeningAssetDeliveryUrlInput,
  ListeningDeliveryIssuedUrl,
  ListeningDeliveryRefreshedUrl,
  ListeningDeliverySoloScope,
  RefreshListeningAssetDeliveryUrlInput,
} from '../../storage/listeningAssetDelivery.service';
import type { SoloProgressScopeContext } from '../../../../../types/practice.types';

export interface ListeningSoloDeliveryAudioSection {
  readonly number: number;
  readonly audioUrl: string;
  readonly streamUrl?: string;
  readonly assetId?: string;
  readonly versionId?: string;
}

export interface ListeningSoloDeliveryIssuer {
  issue(input: IssueListeningAssetDeliveryUrlInput): Promise<ListeningDeliveryIssuedUrl>;
  refresh?(input: RefreshListeningAssetDeliveryUrlInput): Promise<ListeningDeliveryRefreshedUrl>;
}

export interface ListeningSoloDeliveryInput {
  readonly materialId: string;
  readonly materialVersionId?: string;
  readonly studentId?: string;
  readonly now: number;
  readonly scopeContext: SoloProgressScopeContext;
  readonly section: ListeningSoloDeliveryAudioSection;
  readonly deliveryIssuer?: ListeningSoloDeliveryIssuer;
}

export type ListeningSoloAudioResolution =
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

export interface RefreshListeningSoloAudioDeliveryInput {
  readonly previous: ListeningDeliveryIssuedUrl;
  readonly materialId: string;
  readonly materialVersionId?: string;
  readonly studentId?: string;
  readonly now: number;
  readonly scopeContext: SoloProgressScopeContext;
  readonly deliveryIssuer: ListeningSoloDeliveryIssuer;
}

export class ListeningSoloDeliveryAdapterError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ListeningSoloDeliveryAdapterError';
  }
}

const fail = (code: string): never => {
  throw new ListeningSoloDeliveryAdapterError(code);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

export function readListeningSoloVersionId(testData: unknown): string | undefined {
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

const buildSoloScope = (input: {
  readonly materialId: string;
  readonly versionId: string;
  readonly studentId: string;
  readonly scopeContext: SoloProgressScopeContext;
}): ListeningDeliverySoloScope => {
  if (input.scopeContext.mode === 'homework') {
    return {
      testId: input.materialId,
      versionId: input.versionId,
      studentId: input.studentId,
      mode: 'homework',
      homeworkId: input.scopeContext.homeworkId,
      submissionId: input.scopeContext.submissionId,
    };
  }

  if (input.scopeContext.mode === 'course_material') {
    return {
      testId: input.materialId,
      versionId: input.versionId,
      studentId: input.studentId,
      mode: 'course_material',
      courseId: input.scopeContext.courseId,
      moduleId: input.scopeContext.moduleId,
    };
  }

  return {
    testId: input.materialId,
    versionId: input.versionId,
    studentId: input.studentId,
    mode: 'self_study',
  };
};

export async function resolveListeningSoloAudioSection(
  input: ListeningSoloDeliveryInput,
): Promise<ListeningSoloAudioResolution> {
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

  if (!input.deliveryIssuer) {
    fail('listening_solo_delivery_issuer_required');
  }
  if (!input.studentId) {
    fail('listening_solo_student_scope_required');
  }
  const versionId = input.section.versionId || input.materialVersionId;
  if (!versionId) {
    fail('listening_solo_version_scope_required');
  }

  const delivery = await input.deliveryIssuer.issue({
    assetId: input.section.assetId,
    context: {
      runtime: 'trusted-server',
      callerUserId: input.studentId,
    },
    now: input.now,
    soloScope: buildSoloScope({
      materialId: input.materialId,
      versionId,
      studentId: input.studentId,
      scopeContext: input.scopeContext,
    }),
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

export async function refreshListeningSoloAudioDelivery(
  input: RefreshListeningSoloAudioDeliveryInput,
): Promise<ListeningDeliveryRefreshedUrl> {
  if (!input.deliveryIssuer.refresh) {
    fail('listening_solo_delivery_refresh_unavailable');
  }
  if (!input.studentId) {
    fail('listening_solo_student_scope_required');
  }
  if (!input.materialVersionId) {
    fail('listening_solo_version_scope_required');
  }

  return input.deliveryIssuer.refresh({
    previous: input.previous,
    context: {
      runtime: 'trusted-server',
      callerUserId: input.studentId,
    },
    now: input.now,
    soloScope: buildSoloScope({
      materialId: input.materialId,
      versionId: input.materialVersionId,
      studentId: input.studentId,
      scopeContext: input.scopeContext,
    }),
  });
}
