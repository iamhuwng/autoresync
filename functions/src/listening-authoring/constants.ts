export const LISTENING_AUTHORING_SCHEMA_VERSION = 1 as const;

export const LISTENING_AUTHORING_PATHS = {
  drafts: 'listening_authoring/drafts',
  revisionDrafts: 'listening_authoring/revision_drafts',
  versions: 'listening_authoring/versions',
  operations: 'listening_authoring/operations',
} as const;

export const LISTENING_AUTHORING_OPERATION_TYPES = [
  'save-draft',
  'publish',
  'soft-delete',
  'restore',
  'archive',
  'discard',
] as const;

export const LISTENING_AUTHORING_OPERATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const LISTENING_AUTHORING_IDEMPOTENCY_SECRET_NAME =
  'LISTENING_AUTHORING_IDEMPOTENCY_SECRET' as const;

export const LISTENING_AUTHORING_WRITES_ENABLED_FLAG_PATH =
  'system_flags/listening_authoring_writes_enabled' as const;

export const LISTENING_AUTHORING_RESTORE_IN_PROGRESS_FLAG_PATH =
  'system_flags/restore_in_progress' as const;

export const LISTENING_LEGACY_FREEZE_DECISION_REF =
  'PRD-0055-PACKET-1J-B1-B2-APPROVAL-2026-06-20' as const;
