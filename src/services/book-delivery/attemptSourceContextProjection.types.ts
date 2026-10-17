import type { BookRuntimeDeliveryDocumentRequest } from './bookDelivery.types';

export type BookAttemptSourceCorrespondence = 'reference-only' | 'source-assisted';

export type BookHistoricalSourceAvailability =
  | 'available'
  | 'missing'
  | 'deleted'
  | 'replaced'
  | 'invalidated'
  | 'revoked';

export interface BookAttemptSourceContextMetadata {
  readonly attemptId: string;
  readonly resultId: string;
  readonly bookId: string;
  readonly studentId: string;
  readonly surface: 'solo' | 'homework';
  readonly contextId: string;
  readonly ownerId: string;
  readonly componentId: string;
  readonly sourceKey: string;
  readonly sourceVersionId: string;
  readonly physicalPageNumber: number;
  readonly pageGroupId: string;
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersionId: string;
  readonly activityVersion: number;
  readonly interactionFocusId: string;
  readonly correspondence: BookAttemptSourceCorrespondence;
}

export interface BookAttemptHistoricalDocumentResource {
  readonly sourceKey: string;
  readonly sourceVersionId: string;
  readonly opaqueRouteKey: string;
  readonly localPageScope: BookRuntimeDeliveryDocumentRequest['localPageScope'];
}

export type BookAttemptSourceContextUnavailableReason =
  | Exclude<BookHistoricalSourceAvailability, 'available'>
  | 'missing_context'
  | 'malformed_context'
  | 'authorization_unavailable';

export type BookAttemptSourceContextProjection =
  | {
      readonly schemaVersion: 1;
      readonly state: 'available';
      readonly metadata: BookAttemptSourceContextMetadata;
      readonly documentResource: BookAttemptHistoricalDocumentResource;
    }
  | {
      readonly schemaVersion: 1;
      readonly state: 'historical_source_unavailable';
      readonly reason: BookAttemptSourceContextUnavailableReason;
      readonly metadata: BookAttemptSourceContextMetadata | null;
      readonly documentResource: null;
    };
