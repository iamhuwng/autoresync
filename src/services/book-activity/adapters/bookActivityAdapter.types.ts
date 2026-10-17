import type {
  ActivityTaskProfile,
  StudentActivityProjection,
} from '../../../types/bookActivity.types';

export interface BookActivityAuthorizedAssetRef {
  readonly kind: 'image' | 'audio';
  readonly assetId: string;
  /** Stable source identity only. Never a URL, credential, or signed authority. */
  readonly sourceRef: string;
}

export interface BookActivitySourceContext {
  readonly available: boolean;
  readonly description?: string;
  readonly sourceExerciseLabel?: string;
  readonly sourcePartLabel?: string;
}

export interface BookActivityAdapterContext {
  readonly authorizedAssetRefs?: readonly BookActivityAuthorizedAssetRef[];
  readonly sourceContext?: BookActivitySourceContext;
}

export type BookActivityAdapterFailureCode =
  | 'unsupported-profile'
  | 'unsupported-shape'
  | 'malformed-export'
  | 'missing-source-context'
  | 'missing-authorized-asset'
  | 'ambiguous-authorized-asset';

export type BookActivityAdapterResult =
  | {
      readonly ok: true;
      readonly projections: readonly StudentActivityProjection[];
    }
  | {
      readonly ok: false;
      readonly code: BookActivityAdapterFailureCode;
      readonly path: string;
      readonly message: string;
    };

export interface BookActivityAdapterRegistration {
  readonly profile: ActivityTaskProfile;
  readonly family: StudentActivityProjection['interaction']['family'];
  readonly variant: string;
  readonly presentationMode: StudentActivityProjection['presentationMode'];
  readonly responseCodec: string;
  readonly adapterId: 'reading-v2-projection-v1' | 'listening-authoring-v1';
  readonly publicExport:
    | 'services/reading-v2/public'
    | 'features/assessment/listening/public';
}
