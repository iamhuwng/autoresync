import { ref, set, type Database } from 'firebase/database';
import { database as defaultDatabase } from '../firebase';

export type ReadingV2AuditActorRole = 'teacher' | 'super_admin' | 'system';

export type ReadingV2AuditAction =
  | 'reading_passage_archived'
  | 'reading_passage_restored'
  | 'reading_master_removed'
  | 'reading_master_broken_ref_repaired'
  | 'reading_book_broken_ref_repaired'
  | 'reading_duplicate_warning_existing_used'
  | 'reading_duplicate_warning_restore_used'
  | 'reading_duplicate_warning_bypassed'
  | 'reading_super_admin_passage_archived';

export type ReadingV2AuditEntityType =
  | 'reading-passage'
  | 'reading-master'
  | 'reading-book'
  | 'duplicate-warning';

export interface ReadingV2AuditEvent {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly createdAt: string;
  readonly actorUserId: string;
  readonly actorRole: ReadingV2AuditActorRole;
  readonly action: ReadingV2AuditAction;
  readonly entityType: ReadingV2AuditEntityType;
  readonly entityId: string;
  readonly ownerId?: string;
  readonly materialId?: string;
  readonly versionId?: string;
  readonly snapshotVersionId?: string;
  readonly titleSnapshot?: string;
  readonly usedElsewhere?: boolean;
  readonly usageCategories?: readonly string[];
  readonly before?: unknown;
  readonly after?: unknown;
  readonly adminOverride?: boolean;
  readonly correlationId: string;
  readonly sourceFeatureId: string;
  readonly sourceRoute: string;
}

export type ReadingV2AuditEventInput = Omit<ReadingV2AuditEvent, 'schemaVersion'> & {
  readonly schemaVersion?: 1;
};

export interface ReadingV2AuditWriteOptions {
  readonly database?: Database;
  readonly write?: (path: string, value: unknown) => Promise<void>;
}

const REQUIRED_AUDIT_FIELDS = [
  'eventId',
  'createdAt',
  'actorUserId',
  'actorRole',
  'action',
  'entityType',
  'entityId',
  'correlationId',
  'sourceFeatureId',
  'sourceRoute',
] as const;

const READING_V2_AUDIT_ACTOR_ROLES: readonly ReadingV2AuditActorRole[] = [
  'teacher',
  'super_admin',
  'system',
];

const READING_V2_AUDIT_ACTIONS: readonly ReadingV2AuditAction[] = [
  'reading_passage_archived',
  'reading_passage_restored',
  'reading_master_removed',
  'reading_master_broken_ref_repaired',
  'reading_book_broken_ref_repaired',
  'reading_duplicate_warning_existing_used',
  'reading_duplicate_warning_restore_used',
  'reading_duplicate_warning_bypassed',
  'reading_super_admin_passage_archived',
];

const READING_V2_AUDIT_ENTITY_TYPES: readonly ReadingV2AuditEntityType[] = [
  'reading-passage',
  'reading-master',
  'reading-book',
  'duplicate-warning',
];

export const READING_V2_AUDIT_UNSAFE_FIELDS = [
  'passageBody',
  'bodyText',
  'questionText',
  'canonicalPayload',
  'document',
  'sections',
  'stimuli',
  'taskGroups',
  'interactions',
  'optionSets',
  'answerKey',
  'answerKeys',
  'correctAnswers',
  'studentAnswers',
  'scoringRule',
  'scoringRules',
  'aiReviewEvidence',
  'authorDiagnostics',
  'hiddenProvenance',
  'importEvidence',
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const findUnsafeField = (value: unknown): string | null => {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const unsafe = findUnsafeField(entry);
      if (unsafe) {
        return unsafe;
      }
    }
    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  for (const [key, entry] of Object.entries(value)) {
    if ((READING_V2_AUDIT_UNSAFE_FIELDS as readonly string[]).includes(key)) {
      return key;
    }

    const unsafe = findUnsafeField(entry);
    if (unsafe) {
      return unsafe;
    }
  }

  return null;
};

const hasText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const stripUndefinedAuditFields = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((entry) => stripUndefinedAuditFields(entry)) as T;
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, stripUndefinedAuditFields(entry)]),
    ) as T;
  }

  return value;
};

export const getReadingV2AuditEventPath = (eventId: string): string =>
  `reading_v2/audit_events/${eventId}`;

export const validateReadingV2AuditEvent = (event: unknown): ReadingV2AuditEvent => {
  if (!isRecord(event)) {
    throw new Error('Reading V2 audit event must be an object.');
  }

  REQUIRED_AUDIT_FIELDS.forEach((field) => {
    if (!hasText(event[field])) {
      throw new Error(`Reading V2 audit event missing required field: ${field}.`);
    }
  });

  if (event.schemaVersion !== 1) {
    throw new Error('Reading V2 audit event schemaVersion must be 1.');
  }

  if (!READING_V2_AUDIT_ACTOR_ROLES.includes(event.actorRole as ReadingV2AuditActorRole)) {
    throw new Error(`Reading V2 audit event actorRole is not allowed: ${String(event.actorRole)}.`);
  }

  if (!READING_V2_AUDIT_ACTIONS.includes(event.action as ReadingV2AuditAction)) {
    throw new Error(`Reading V2 audit event action is not allowed: ${String(event.action)}.`);
  }

  if (!READING_V2_AUDIT_ENTITY_TYPES.includes(event.entityType as ReadingV2AuditEntityType)) {
    throw new Error(`Reading V2 audit event entityType is not allowed: ${String(event.entityType)}.`);
  }

  const unsafeField = findUnsafeField(event);
  if (unsafeField) {
    throw new Error(`Reading V2 audit event contains unsafe audit field: ${unsafeField}.`);
  }

  return event as unknown as ReadingV2AuditEvent;
};

export const buildReadingV2AuditEvent = (input: ReadingV2AuditEventInput): ReadingV2AuditEvent =>
  validateReadingV2AuditEvent(stripUndefinedAuditFields({
    ...input,
    schemaVersion: 1,
  }));

export const writeReadingV2AuditEvent = async (
  input: ReadingV2AuditEventInput,
  options: ReadingV2AuditWriteOptions = {},
): Promise<ReadingV2AuditEvent> => {
  const event = buildReadingV2AuditEvent(input);
  const path = getReadingV2AuditEventPath(event.eventId);

  if (options.write) {
    await options.write(path, event);
    return event;
  }

  const targetDatabase = options.database ?? defaultDatabase;
  await set(ref(targetDatabase, path), event);
  return event;
};
