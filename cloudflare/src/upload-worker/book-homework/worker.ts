import {
  BookHomeworkAssignmentSaga,
  BookHomeworkSagaError,
  type BookHomeworkSagaResult,
} from './saga.ts';
import type { BookHomeworkSagaCommand } from '../../../../src/services/book-homework/bookHomeworkSaga.types.ts';

const MAX_BODY_BYTES = 256 * 1024;
const MAX_FINGERPRINT_BYTES = 128 * 1024;
const MAX_RECIPIENTS = 30;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u;
const ROUTE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface BookHomeworkWorkerEnv {
  readonly [key: string]: unknown;
  readonly readDatabaseValue?: (path: string) => Promise<unknown>;
}

export class BookHomeworkWorkerError extends Error {
  constructor(readonly code: string, readonly status = 400) {
    super(code);
    this.name = 'BookHomeworkWorkerError';
  }
}

export interface BookHomeworkWorkerHandlersOptions {
  readonly saga?: Pick<BookHomeworkAssignmentSaga, 'execute'>
    & Partial<Pick<BookHomeworkAssignmentSaga, 'resolveStudentProjection'>>;
  readonly now?: () => string;
}

type BookHomeworkCommandInput = Omit<BookHomeworkSagaCommand, 'ownerId' | 'createdAt'>;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const readBody = async (request: Request): Promise<unknown> => {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    throw new BookHomeworkWorkerError('content_type_required');
  }
  const claimedLength = request.headers.get('content-length');
  if (claimedLength !== null
    && (!/^\d+$/u.test(claimedLength) || Number(claimedLength) > MAX_BODY_BYTES)) {
    throw new BookHomeworkWorkerError('body_too_large', 413);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new BookHomeworkWorkerError('body_too_large', 413);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new BookHomeworkWorkerError('invalid_json');
  }
};

const exact = (value: unknown, keys: readonly string[]): Record<string, unknown> => {
  if (!isRecord(value)) throw new BookHomeworkWorkerError('invalid_request');
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw new BookHomeworkWorkerError('invalid_request');
  }
  return value;
};

const safeId = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new BookHomeworkWorkerError(`invalid_${label}`);
  }
  return value;
};

const routeId = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !ROUTE_ID.test(value)) {
    throw new BookHomeworkWorkerError(`invalid_${label}`);
  }
  return value;
};

const boundedString = (value: unknown, label: string, maxBytes: number): string => {
  if (typeof value !== 'string' || value.length === 0
    || new TextEncoder().encode(value).byteLength > maxBytes) {
    throw new BookHomeworkWorkerError(`invalid_${label}`);
  }
  return value;
};

const recipients = (value: unknown): readonly string[] => {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_RECIPIENTS) {
    throw new BookHomeworkWorkerError('invalid_selected_recipient_ids');
  }
  const result = value.map((entry) => safeId(entry, 'selected_recipient_id'));
  if (new Set(result).size !== result.length) {
    throw new BookHomeworkWorkerError('duplicate_selected_recipient_ids');
  }
  return result;
};

const parseCommand = (
  value: unknown,
  pathAssignmentId: string,
  idempotencyHeader: string | null,
): BookHomeworkCommandInput => {
  const input = exact(value, [
    'assignmentId',
    'operationId',
    'idempotencyKey',
    'manifestVersionId',
    'selectedRecipientIds',
    'expectedManifestFingerprint',
    'expectedPublicationFingerprint',
    'expectedExposureApprovalFingerprint',
    'expectedPolicyFingerprint',
  ]);
  const assignmentId = routeId(input.assignmentId, 'assignment_id');
  if (assignmentId !== pathAssignmentId) {
    throw new BookHomeworkWorkerError('assignment_id_mismatch', 409);
  }
  const idempotencyKey = safeId(input.idempotencyKey, 'idempotency_key');
  if (!idempotencyHeader || idempotencyHeader.trim() !== idempotencyKey) {
    throw new BookHomeworkWorkerError('idempotency_key_mismatch', 409);
  }
  const operationId = input.operationId;
  if (typeof operationId !== 'string' || !UUID.test(operationId)) {
    throw new BookHomeworkWorkerError('invalid_operation_id');
  }
  return {
    assignmentId,
    operationId,
    idempotencyKey,
    manifestVersionId: safeId(input.manifestVersionId, 'manifest_version_id'),
    selectedRecipientIds: recipients(input.selectedRecipientIds),
    expectedManifestFingerprint: boundedString(
      input.expectedManifestFingerprint,
      'manifest_fingerprint',
      MAX_FINGERPRINT_BYTES,
    ),
    expectedPublicationFingerprint: boundedString(
      input.expectedPublicationFingerprint,
      'publication_fingerprint',
      MAX_FINGERPRINT_BYTES,
    ),
    expectedExposureApprovalFingerprint: boundedString(
      input.expectedExposureApprovalFingerprint,
      'exposure_approval_fingerprint',
      MAX_FINGERPRINT_BYTES,
    ),
    expectedPolicyFingerprint: boundedString(
      input.expectedPolicyFingerprint,
      'policy_fingerprint',
      MAX_FINGERPRINT_BYTES,
    ),
  };
};

const teacherRole = (value: unknown): boolean => {
  if (!isRecord(value) || value.forceReauth === true) return false;
  if (['blocked', 'inactive', 'suspended'].includes(String(value.status ?? ''))) return false;
  return value.role === 'teacher' || value.role === 'super_admin';
};

const assertTeacher = async (env: BookHomeworkWorkerEnv, uid: string): Promise<void> => {
  if (typeof env.readDatabaseValue !== 'function') {
    throw new BookHomeworkWorkerError('actor_reader_unavailable', 503);
  }
  if (!teacherRole(await env.readDatabaseValue(`users/${uid}`))) {
    throw new BookHomeworkWorkerError('teacher_required', 403);
  }
};

const statusFor = (status: BookHomeworkSagaResult['status']): number => {
  if (status === 'committed') return 200;
  if (status === 'compensated' || status === 'failed_terminal') return 409;
  return 202;
};

const resultBody = (result: BookHomeworkSagaResult): Record<string, unknown> => ({
  status: result.status,
  assignmentId: result.record.assignmentId,
  operationId: result.record.operationId,
  state: result.record.state,
  visibility: result.record.visibility,
  recipientCount: result.record.recipientCount,
  committedRecipientCount: result.record.committedRecipientCount,
  revision: result.record.revision,
});

const sagaStatus = (code: string): number => {
  if (code === 'owner-mismatch') return 403;
  if (code === 'invalid-command') return 400;
  if (code === 'not-ready' || code === 'stale-roster' || code === 'stale-publication'
    || code === 'stale-input' || code === 'source-unavailable' || code.endsWith('conflict')
    || code.endsWith('failed') || code.endsWith('missing')) return 409;
  return 503;
};

export const createBookHomeworkWorkerHandlers = (
  options: BookHomeworkWorkerHandlersOptions = {},
) => {
  const now = options.now ?? (() => new Date().toISOString());

  const homeworkAssignmentCommand = async (input: {
    readonly request: Request;
    readonly env: BookHomeworkWorkerEnv;
    readonly uid: string;
    readonly assignmentId: string;
  }): Promise<{ body: Record<string, unknown>; init: ResponseInit }> => {
    try {
      await assertTeacher(input.env, input.uid);
      const command = parseCommand(
        await readBody(input.request),
        routeId(input.assignmentId, 'assignment_id'),
        input.request.headers.get('idempotency-key'),
      );
      if (!options.saga) throw new BookHomeworkWorkerError('saga_unavailable', 503);
      const result = await options.saga.execute({
        ...command,
        ownerId: input.uid,
        createdAt: now(),
      });
      return { body: resultBody(result), init: { status: statusFor(result.status) } };
    } catch (error) {
      if (error instanceof BookHomeworkWorkerError) {
        return { body: { code: error.code }, init: { status: error.status } };
      }
      if (error instanceof BookHomeworkSagaError) {
        return { body: { code: `book_homework_${error.code}` }, init: { status: sagaStatus(error.code) } };
      }
      console.error('book_homework_command_failed', {
        name: error instanceof Error ? error.name : 'unknown',
        message: error instanceof Error ? error.message : 'unknown',
      });
      return {
        body: { code: 'book_homework_command_failed' },
        init: { status: 500 },
      };
    }
  };

  const homeworkStudentProjection = async (input: {
    readonly assignmentId: string;
    readonly uid: string;
  }): Promise<{ body: Record<string, unknown>; init: ResponseInit }> => {
    if (!options.saga?.resolveStudentProjection) {
      return { body: { code: 'saga_unavailable' }, init: { status: 503 } };
    }
    try {
      const projection = await options.saga.resolveStudentProjection(
        routeId(input.assignmentId, 'assignment_id'),
        safeId(input.uid, 'student_id'),
      );
      if (!projection) {
        return { body: { code: 'book_homework_not_found' }, init: { status: 404 } };
      }
      return {
        body: {
          assignmentId: input.assignmentId,
          authority: projection.authority,
          delivery: projection.delivery,
        },
        init: { status: 200 },
      };
    } catch {
      return { body: { code: 'book_homework_projection_failed' }, init: { status: 500 } };
    }
  };

  return { homeworkAssignmentCommand, homeworkStudentProjection };
};

export default createBookHomeworkWorkerHandlers;
