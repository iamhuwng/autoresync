import { resolveListeningLegacyAudioReference } from './listeningLegacyAudioResolver';
import type {
  IssueListeningAssetDeliveryUrlInput,
  ListeningDeliveryIssuedUrl,
} from '../storage/listeningAssetDelivery.service';
import {
  shouldReturnListeningResultReviewToPublicR2,
  type ListeningStorageRollbackControls,
} from '../storage/listeningAssetRollback';

export interface ListeningResultReviewAudioInput {
  readonly resultId: string;
  readonly viewerUserId: string;
  readonly now: number;
  readonly audio: {
    readonly audioUrl: string;
    readonly streamUrl?: string;
    readonly assetId?: string;
    readonly versionId?: string;
  };
  readonly deliveryIssuer: ListeningResultReviewAudioDeliveryIssuer;
  readonly rollbackControls?: ListeningStorageRollbackControls;
}

export interface ListeningResultReviewAudioDeliveryIssuer {
  issue(input: IssueListeningAssetDeliveryUrlInput): Promise<ListeningDeliveryIssuedUrl>;
}

export type ListeningResultReviewAudioResolution =
  | {
    readonly kind: 'legacy-public-r2';
    readonly resultId: string;
    readonly readOnly: true;
    readonly deliveryMode: 'public-r2';
    readonly audioUrl: string;
    readonly streamUrl?: string;
    readonly migrationPerformed: false;
  }
  | {
    readonly kind: 'authorized-asset-delivery';
    readonly resultId: string;
    readonly readOnly: true;
    readonly deliveryMode: 'authorized';
    readonly assetId: string;
    readonly versionId: string;
    readonly delivery: ListeningDeliveryIssuedUrl;
    readonly migrationPerformed: false;
  };

export class ListeningResultReviewAudioResolverError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'ListeningResultReviewAudioResolverError';
  }
}

const fail = (code: string): never => {
  throw new ListeningResultReviewAudioResolverError(code);
};

export async function resolveListeningResultReviewAudio(
  input: ListeningResultReviewAudioInput,
): Promise<ListeningResultReviewAudioResolution> {
  if (!input.audio.assetId || shouldReturnListeningResultReviewToPublicR2(input.rollbackControls)) {
    const legacy = resolveListeningLegacyAudioReference({
      audioUrl: input.audio.audioUrl,
      streamUrl: input.audio.streamUrl,
    });
    return {
      kind: 'legacy-public-r2',
      resultId: input.resultId,
      readOnly: true,
      deliveryMode: 'public-r2',
      audioUrl: legacy.audioUrl,
      streamUrl: legacy.streamUrl,
      migrationPerformed: false,
    };
  }

  if (!input.audio.versionId) {
    fail('result_review_version_scope_required');
  }

  return {
    kind: 'authorized-asset-delivery',
    resultId: input.resultId,
    readOnly: true,
    deliveryMode: 'authorized',
    assetId: input.audio.assetId,
    versionId: input.audio.versionId,
    delivery: await input.deliveryIssuer.issue({
      assetId: input.audio.assetId,
      context: {
        runtime: 'trusted-server',
        callerUserId: input.viewerUserId,
      },
      now: input.now,
      resultScope: {
        resultId: input.resultId,
        versionId: input.audio.versionId,
      },
    }),
    migrationPerformed: false,
  };
}
