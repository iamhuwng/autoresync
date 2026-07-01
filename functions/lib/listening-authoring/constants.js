"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LISTENING_LEGACY_FREEZE_DECISION_REF = exports.LISTENING_AUTHORING_RESTORE_IN_PROGRESS_FLAG_PATH = exports.LISTENING_AUTHORING_WRITES_ENABLED_FLAG_PATH = exports.LISTENING_AUTHORING_IDEMPOTENCY_SECRET_NAME = exports.LISTENING_AUTHORING_OPERATION_TTL_MS = exports.LISTENING_AUTHORING_OPERATION_TYPES = exports.LISTENING_AUTHORING_PATHS = exports.LISTENING_AUTHORING_SCHEMA_VERSION = void 0;
exports.LISTENING_AUTHORING_SCHEMA_VERSION = 1;
exports.LISTENING_AUTHORING_PATHS = {
    drafts: 'listening_authoring/drafts',
    revisionDrafts: 'listening_authoring/revision_drafts',
    versions: 'listening_authoring/versions',
    operations: 'listening_authoring/operations',
};
exports.LISTENING_AUTHORING_OPERATION_TYPES = [
    'save-draft',
    'publish',
    'soft-delete',
    'restore',
    'archive',
    'discard',
];
exports.LISTENING_AUTHORING_OPERATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
exports.LISTENING_AUTHORING_IDEMPOTENCY_SECRET_NAME = 'LISTENING_AUTHORING_IDEMPOTENCY_SECRET';
exports.LISTENING_AUTHORING_WRITES_ENABLED_FLAG_PATH = 'system_flags/listening_authoring_writes_enabled';
exports.LISTENING_AUTHORING_RESTORE_IN_PROGRESS_FLAG_PATH = 'system_flags/restore_in_progress';
exports.LISTENING_LEGACY_FREEZE_DECISION_REF = 'PRD-0055-PACKET-1J-B1-B2-APPROVAL-2026-06-20';
//# sourceMappingURL=constants.js.map