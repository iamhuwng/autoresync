import type {
  ActivityRendererContext,
  ActivityResponseValidationState,
} from '../../services/book-activity/runtime/activityRenderer.types';

export interface BookRuntimeNavigationItem {
  label: string;
  disabled?: boolean;
  onActivate: () => void;
}

export interface BookRuntimeActivityViewModel {
  /** Host validates this caller-built, student-safe candidate before rendering. */
  projection: unknown;
  context: ActivityRendererContext;
  responses: Readonly<Record<string, unknown>>;
  validationByInteractionId: Readonly<Record<string, ActivityResponseValidationState>>;
  onResponseChange: (interactionId: string, response: unknown) => void;
}

/** Safe, caller-built data only. No delivery identity, entitlement, or persistence port. */
export interface BookRuntimeFrameViewModel {
  title: string;
  activity: BookRuntimeActivityViewModel;
  previous?: BookRuntimeNavigationItem;
  next?: BookRuntimeNavigationItem;
}
