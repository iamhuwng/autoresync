export type ReadingV2StudioOperationalStateId =
  | 'ready'
  | 'loading'
  | 'empty'
  | 'error'
  | 'retry'
  | 'conflict'
  | 'permission-denied'
  | 'save-success'
  | 'import-idle'
  | 'import-analyzing'
  | 'import-ready'
  | 'import-failure'
  | 'validation-failure'
  | 'publish-success'
  | 'publish-failure';

export interface ReadingV2StudioOperationalState {
  readonly id: ReadingV2StudioOperationalStateId;
  readonly title: string;
  readonly message: string;
  readonly severity: 'neutral' | 'success' | 'warning' | 'error';
  readonly actionLabel?: string;
  readonly usesExistingShellPattern: true;
  readonly createsNewNotificationSystem: false;
}

const state = (
  id: ReadingV2StudioOperationalStateId,
  title: string,
  message: string,
  severity: ReadingV2StudioOperationalState['severity'],
  actionLabel?: string,
): ReadingV2StudioOperationalState => ({
  id,
  title,
  message,
  severity,
  actionLabel,
  usesExistingShellPattern: true,
  createsNewNotificationSystem: false,
});

export const READING_V2_STUDIO_OPERATIONAL_STATES = {
  ready: state('ready', 'Ready', 'Studio draft is ready for authoring.', 'neutral'),
  loading: state('loading', 'Loading draft', 'Loading the Reading V2 draft or revision context.', 'neutral'),
  empty: state('empty', 'No draft content', 'Create metadata and stimulus before editing task groups.', 'warning'),
  error: state('error', 'Studio error', 'The Studio could not load the requested context.', 'error', 'Retry'),
  retry: state('retry', 'Retry available', 'The last operation can be retried through the existing shell action.', 'warning', 'Retry'),
  conflict: state('conflict', 'Revision conflict', 'The draft revision token is stale. Reload, duplicate, or compare before saving.', 'error', 'Resolve conflict'),
  'permission-denied': state('permission-denied', 'Permission denied', 'This teacher cannot edit the requested Reading V2 material.', 'error'),
  'save-success': state('save-success', 'Draft saved', 'The canonical draft and package metadata were saved.', 'success'),
  'import-idle': state('import-idle', 'Import waiting', 'Paste Reading source and teacher answer key before analyzing.', 'neutral'),
  'import-analyzing': state('import-analyzing', 'Analyzing import', 'Reading source and answer key are being checked.', 'neutral'),
  'import-ready': state('import-ready', 'Import ready', 'Imported source is ready for Studio review and repair.', 'success'),
  'import-failure': state('import-failure', 'Import failed', 'Import evidence is retained and unresolved structures remain repair items.', 'error', 'Review import'),
  'validation-failure': state('validation-failure', 'Validation failed', 'Blocking issues must be resolved before preview or publish.', 'error'),
  'publish-success': state('publish-success', 'Publish handoff complete', 'Publish returned through the approved Reading V2 pipeline.', 'success'),
  'publish-failure': state('publish-failure', 'Publish failed', 'The previous live snapshot remains active until a coherent publish succeeds.', 'error', 'Retry publish'),
} as const satisfies Record<ReadingV2StudioOperationalStateId, ReadingV2StudioOperationalState>;
