import type {
  BookHomeworkSagaAssignmentTargetIntent,
  BookHomeworkSagaAssignmentIntent,
  BookHomeworkSagaCommand,
  BookHomeworkSagaStudentExtensionIntent,
} from './bookHomeworkSaga.types';
import type { BookHomeworkSelectionTarget } from '../../types/homework.types';
import {
  compileBookHomeworkScheduleDraft,
  type BookHomeworkSchedule,
} from './bookHomeworkSchedule.service';
import type {
  BookHomeworkPreviewDraft,
  BookHomeworkPreviewSource,
} from './bookHomeworkPreview.service';

const MAX_RECIPIENTS = 30;
const MAX_NODE_OVERRIDES = 256;
const MAX_STUDENT_EXTENSIONS = MAX_RECIPIENTS * MAX_NODE_OVERRIDES;
const MAX_BODY_BYTES = 256 * 1024;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface CreateBookHomeworkAssignmentIntentInput {
  readonly draft: BookHomeworkPreviewDraft;
  readonly source: BookHomeworkAssignmentPreviewSource;
  readonly selectedRecipientIds?: readonly string[];
  readonly studentExtensions?: readonly BookHomeworkSagaStudentExtensionIntent[];
  /** Injectable only for deterministic tests; production uses crypto.randomUUID. */
  readonly createId?: () => string;
}

/** Trusted preview metadata needed to construct optimistic, untrusted intent. */
export interface BookHomeworkAssignmentPreviewSource extends BookHomeworkPreviewSource {
  /** Class provenance for Worker roster authorization. */
  readonly classId?: string;
  readonly selectedRecipientIds?: readonly string[];
  readonly studentExtensions?: readonly BookHomeworkSagaStudentExtensionIntent[];
}

export type BookHomeworkAssignmentIntentCommand = Omit<BookHomeworkSagaCommand, 'ownerId' | 'createdAt'>;

const invalid = (message: string): Error => new Error(`Book Homework assignment cannot be prepared safely: ${message}`);

const assertId: (value: unknown, label: string) => asserts value is string = (value, label) => {
  if (typeof value !== 'string' || !ID.test(value)) throw invalid(`${label} is unavailable.`);
};

const assertUuid = (value: string): string => {
  if (!UUID.test(value)) throw invalid('strong operation identifiers are unavailable.');
  return value;
};

const assertIso: (value: unknown, label: string) => asserts value is string = (value, label) => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw invalid(`${label} is invalid.`);
  }
};

const copyTarget = (
  target: BookHomeworkSelectionTarget,
  classId: string,
): BookHomeworkSagaAssignmentTargetIntent => {
  assertId(target.bookId, 'Book id');
  switch (target.kind) {
    case 'book':
      return { kind: 'book', bookId: target.bookId, classId };
    case 'activity':
      assertId(target.activityId, 'Activity id');
      return target.placementId === undefined
        ? { kind: 'activity', bookId: target.bookId, activityId: target.activityId, classId }
        : (assertId(target.placementId, 'Activity placement id'), {
          kind: 'activity',
          bookId: target.bookId,
          activityId: target.activityId,
          placementId: target.placementId,
          classId,
        });
    default:
      assertId(target.nodeKey, 'Book node key');
      return { kind: target.kind, bookId: target.bookId, nodeKey: target.nodeKey, classId };
  }
};

const normalizeRecipients = (
  source: BookHomeworkAssignmentPreviewSource,
  selectedRecipientIds: readonly string[] | undefined,
): readonly string[] => {
  const recipients = selectedRecipientIds ?? source.selectedRecipientIds ?? [source.delivery.recipientId];
  if (!Array.isArray(recipients) || recipients.length === 0 || recipients.length > MAX_RECIPIENTS) {
    throw invalid('selected recipients are unavailable or exceed the assignment limit.');
  }
  const result = recipients.map((recipientId) => {
    assertId(recipientId, 'Recipient id');
    return recipientId;
  });
  if (new Set(result).size !== result.length) throw invalid('selected recipients are duplicated.');
  return result;
};

const compileScheduleIntent = (
  draft: BookHomeworkPreviewDraft,
): { readonly schedule: BookHomeworkSagaAssignmentIntent['schedule']; readonly compiled: BookHomeworkSchedule } => {
  let compiled: BookHomeworkSchedule;
  try {
    compiled = compileBookHomeworkScheduleDraft(draft.schedule, draft.manifest.outline);
  } catch (error) {
    throw invalid(error instanceof Error ? error.message : 'the assignment schedule is invalid.');
  }
  if (compiled.scheduleRules.length > MAX_NODE_OVERRIDES) {
    throw invalid('the assignment contains too many node schedule overrides.');
  }
  return {
    compiled,
    schedule: {
      finalDueAt: compiled.finalDueAt,
      ...(compiled.availableFrom === undefined ? {} : { availableFrom: compiled.availableFrom }),
      nodeOverrides: compiled.scheduleRules.map((rule) => ({
        nodeKey: rule.nodeKey,
        ...(rule.availableFrom === undefined ? {} : { availableFrom: rule.availableFrom }),
        ...(rule.dueAt === undefined ? {} : { dueAt: rule.dueAt }),
      })),
    },
  };
};

const normalizeStudentExtensions = (
  source: BookHomeworkAssignmentPreviewSource,
  extensions: readonly BookHomeworkSagaStudentExtensionIntent[] | undefined,
  recipients: readonly string[],
  nodeKeys: ReadonlySet<string>,
): readonly BookHomeworkSagaStudentExtensionIntent[] | undefined => {
  const input = extensions ?? source.studentExtensions;
  if (input === undefined) return undefined;
  if (!Array.isArray(input) || input.length > MAX_STUDENT_EXTENSIONS) {
    throw invalid('student deadline extensions exceed the bounded assignment limit.');
  }
  const recipientSet = new Set(recipients);
  const seen = new Set<string>();
  const result = input.map((extension) => {
    assertId(extension.studentId, 'Student extension recipient id');
    assertId(extension.nodeKey, 'Student extension node key');
    if (!recipientSet.has(extension.studentId) || !nodeKeys.has(extension.nodeKey)) {
      throw invalid('student deadline extensions reference an unselected identity.');
    }
    assertIso(extension.dueAt, 'Student extension deadline');
    const key = `${extension.studentId}:${extension.nodeKey}`;
    if (seen.has(key)) throw invalid('student deadline extensions are duplicated.');
    seen.add(key);
    return {
      studentId: extension.studentId,
      nodeKey: extension.nodeKey,
      dueAt: new Date(extension.dueAt).toISOString(),
    };
  });
  return result.length === 0 ? undefined : result;
};

export const createBookHomeworkAssignmentIntent = (
  input: CreateBookHomeworkAssignmentIntentInput,
): BookHomeworkAssignmentIntentCommand => {
  const { draft, source } = input;
  const book = source.delivery.book;
  assertId(source.classId, 'Class provenance id');
  const target = copyTarget(draft.manifest.selectedTarget, source.classId);
  if (target.bookId !== book.bookId || draft.manifest.book.bookId !== book.bookId) {
    throw invalid('selected Book scope does not match the trusted preview publication.');
  }
  if (draft.manifest.book.publicationId !== book.publicationId
    || draft.manifest.book.publicationRevision !== book.publicationRevision) {
    throw invalid('selected publication is stale.');
  }
  if (source.identity.manifestVersionId !== draft.manifest.manifestVersionId) {
    throw invalid('selected manifest version is stale.');
  }

  const selectedRecipientIds = normalizeRecipients(source, input.selectedRecipientIds);
  const { schedule } = compileScheduleIntent(draft);
  const nodeKeys = new Set(draft.manifest.outline.map((node) => node.nodeKey));
  const studentExtensions = normalizeStudentExtensions(
    source,
    input.studentExtensions,
    selectedRecipientIds,
    nodeKeys,
  );
  const expectedPublication = {
    publicationId: book.publicationId,
    publicationRevision: book.publicationRevision,
    manifestVersionId: source.identity.manifestVersionId,
  } as const;
  const intent: BookHomeworkSagaAssignmentIntent = {
    bookId: book.bookId,
    target,
    schedule: {
      ...schedule,
      ...(studentExtensions === undefined ? {} : { studentExtensions }),
    },
    policy: {
      intent: draft.policy.intent,
      integrityCapture: draft.policy.integrityCapture,
      integrityOverride: draft.policy.integrityOverride,
      activityPolicies: draft.policy.activityPolicies.map((policy) => ({
        placementId: policy.placementId,
        maxAttempts: policy.maxAttempts,
        feedbackRelease: policy.feedbackRelease,
        lateSubmissionAllowed: policy.lateSubmissionAllowed,
      })),
    },
    expectedPublication,
  };

  const createId = input.createId ?? (() => globalThis.crypto?.randomUUID?.() ?? '');
  const assignmentId = assertUuid(createId());
  const operationId = assertUuid(createId());
  const idempotencyKey = assertUuid(createId());
  const command: BookHomeworkAssignmentIntentCommand = {
    assignmentId,
    operationId,
    idempotencyKey,
    manifestVersionId: expectedPublication.manifestVersionId,
    intent,
    selectedRecipientIds,
  };
  if (new TextEncoder().encode(JSON.stringify(command)).byteLength > MAX_BODY_BYTES) {
    throw invalid('the assignment request exceeds the bounded request size.');
  }
  return command;
};
