import {
  FirebaseRtdbRestClient,
  type RepositoryEnv,
} from '../listening-authoring/rtdb.ts';
import {
  BOOK_RESULT_MAX_ATTEMPT_LIMIT,
  BOOK_RESULT_MAX_GROUP_LIMIT,
  bookResultGroupKey,
  type BookResultAttemptSummary,
  type BookResultDetail,
  type BookResultGroupSummary,
  type BookResultProjectionInput,
  type BookResultQueryEvent,
  type BookResultQueryInput,
  type BookResultQueryMetrics,
  type BookResultQueryObserver,
  type BookResultReadProjection,
} from './types.ts';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@_-]{0,255}$/u;
const SENSITIVE_KEYS = new Set([
  'answerKey', 'pdfBytes', 'provider', 'providerAuthority', 'providerFileId',
  'providerFileVersionId', 'storage', 'storageKey', 'bucket', 'objectKey',
  'privateObjectKey', 'credentials', 'privateSourceAuthority', 'sourceAuthority',
  'signedUrl', 'downloadUrl', 'accessToken',
]);

export class BookResultRepositoryError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'BookResultRepositoryError';
  }
}

export interface BookResultReadRepository {
  listGroupSummaries(input: BookResultQueryInput): Promise<readonly BookResultGroupSummary[]>;
  listAttemptSummaries(input: BookResultQueryInput): Promise<readonly BookResultAttemptSummary[]>;
  readResultDetail(input: BookResultQueryInput & { readonly resultId: string }): Promise<BookResultDetail | null>;
  persistProjection?(input: BookResultProjectionInput): Promise<void>;
  listGroups?(input: BookResultQueryInput): Promise<readonly BookResultGroupSummary[]>;
  listAttempts?(input: BookResultQueryInput): Promise<readonly BookResultAttemptSummary[]>;
  readDetail?(input: BookResultQueryInput & { readonly resultId: string }): Promise<BookResultDetail | null>;
}

export interface BookResultRepositorySnapshot {
  readonly groups?: Readonly<Record<string, BookResultGroupSummary>>;
  readonly attempts?: Readonly<Record<string, BookResultAttemptSummary>>;
  readonly details?: Readonly<Record<string, BookResultDetail>>;
}

export interface BookResultRepositoryOptions {
  readonly queryObserver?: BookResultQueryObserver;
}

const clone = <T>(value: T): T => structuredClone(value);
const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const safeId = (value: string, label: string): string => {
  if (!ID.test(value) || value === '.' || value === '..') {
    throw new BookResultRepositoryError(`book_result_${label}_invalid`);
  }
  return value;
};

const pathId = (value: string, label: string): string => encodeURIComponent(safeId(value, label));

export const bookResultStudentGroupsPath = (input: {
  readonly studentId: string;
  readonly bookId: string;
}): string => `book_result_read_models/students/${pathId(input.studentId, 'student_id')}/books/${pathId(input.bookId, 'book_id')}/group_summaries`;

export const bookResultHomeworkGroupsPath = (input: {
  readonly homeworkId: string;
  readonly studentId: string;
  readonly bookId: string;
}): string => `book_result_read_models/homework/${pathId(input.homeworkId, 'homework_id')}/students/${pathId(input.studentId, 'student_id')}/books/${pathId(input.bookId, 'book_id')}/group_summaries`;

const bookResultStudentAttemptsPath = (input: {
  readonly studentId: string;
  readonly bookId: string;
}): string => `book_result_read_models/students/${pathId(input.studentId, 'student_id')}/books/${pathId(input.bookId, 'book_id')}/group_attempts`;

const bookResultHomeworkAttemptsPath = (input: {
  readonly homeworkId: string;
  readonly studentId: string;
  readonly bookId: string;
}): string => `book_result_read_models/homework/${pathId(input.homeworkId, 'homework_id')}/students/${pathId(input.studentId, 'student_id')}/books/${pathId(input.bookId, 'book_id')}/group_attempts`;

export const bookResultGroupsPath = (input: BookResultQueryInput): string => {
  safeId(input.studentId, 'student_id');
  safeId(input.bookId, 'book_id');
  return input.homeworkId
    ? bookResultHomeworkGroupsPath({
      homeworkId: input.homeworkId,
      studentId: input.studentId,
      bookId: input.bookId,
    })
    : bookResultStudentGroupsPath({ studentId: input.studentId, bookId: input.bookId });
};

export const bookResultAttemptsPath = (input: BookResultQueryInput): string => {
  if (!input.groupKey) throw new BookResultRepositoryError('book_result_group_key_required');
  safeId(input.groupKey, 'group_key');
  const root = input.homeworkId
    ? bookResultHomeworkAttemptsPath({
      homeworkId: input.homeworkId,
      studentId: input.studentId,
      bookId: input.bookId,
    })
    : bookResultStudentAttemptsPath({
      studentId: input.studentId,
      bookId: input.bookId,
    });
  return `${root}/${pathId(input.groupKey, 'group_key')}`;
};

export const bookResultGroupSummaryPath = (input: BookResultQueryInput): string => {
  if (!input.groupKey) throw new BookResultRepositoryError('book_result_group_key_required');
  safeId(input.groupKey, 'group_key');
  return `${bookResultGroupsPath(input)}/${pathId(input.groupKey, 'group_key')}`;
};

export const bookResultDetailPath = (resultId: string): string => (
  `book_result_read_models/details/${pathId(resultId, 'result_id')}`
);

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const stripUnsafe = (value: unknown, depth = 0): unknown => {
  if (depth > 8) return null;
  if (Array.isArray(value)) return value.map((entry) => stripUnsafe(entry, depth + 1));
  if (!isRecord(value)) return value;
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key) || /answer.?key|pdf|provider|storage|credential|private.?source/iu.test(key)) continue;
    output[key] = stripUnsafe(entry, depth + 1);
  }
  return output;
};

const visibleSummary = (summary: BookResultAttemptSummary): BookResultAttemptSummary => ({
  ...clone(summary),
  sourceProvenance: clone(summary.sourceProvenance),
  sources: clone(summary.sources),
});

const visibleDetail = (detail: BookResultDetail): BookResultDetail => ({
  ...visibleSummary(detail),
  response: stripUnsafe(detail.response),
});

const assertProjection = (projection: BookResultReadProjection): void => {
  if (projection.schemaVersion !== 1
    || typeof projection.bookId !== 'string'
    || !isRecord(projection.summary) || !isRecord(projection.detail)
    || projection.summary.schemaVersion !== 1
    || projection.detail.schemaVersion !== 1
    || projection.summary.resultId !== projection.detail.resultId
    || projection.summary.attemptId !== projection.detail.attemptId
    || projection.summary.studentId !== projection.detail.studentId
    || projection.summary.activityId !== projection.detail.activityId
    || projection.summary.completionId !== projection.detail.completionId) {
    throw new BookResultRepositoryError('book_result_projection_invalid');
  }
  safeId(projection.bookId, 'book_id');
  safeId(projection.summary.studentId, 'student_id');
  safeId(projection.summary.activityId, 'activity_id');
  if (!['solo', 'homework'].includes(projection.summary.surface)) {
    throw new BookResultRepositoryError('book_result_context_invalid');
  }
}

const queryScope = (input: BookResultQueryInput): void => {
  safeId(input.studentId, 'student_id');
  safeId(input.bookId, 'book_id');
  if (input.homeworkId) safeId(input.homeworkId, 'homework_id');
  if (input.groupKey) safeId(input.groupKey, 'group_key');
  if (input.contextKind && !['solo', 'homework'].includes(input.contextKind)) {
    throw new BookResultRepositoryError('book_result_context_invalid');
  }
};

const limitFor = (input: BookResultQueryInput, kind: 'groups' | 'attempts'): number => {
  const limit = input.limit ?? (kind === 'groups' ? BOOK_RESULT_MAX_GROUP_LIMIT : BOOK_RESULT_MAX_ATTEMPT_LIMIT);
  const max = kind === 'groups' ? BOOK_RESULT_MAX_GROUP_LIMIT : BOOK_RESULT_MAX_ATTEMPT_LIMIT;
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > max) {
    throw new BookResultRepositoryError(`book_result_${kind}_query_unbounded`);
  }
  return limit;
};

const makeGroup = (
  groupKey: string,
  attempts: readonly BookResultAttemptSummary[],
  bookId: string,
): BookResultGroupSummary => {
  if (attempts.length === 0) throw new BookResultRepositoryError('book_result_group_empty');
  const sorted = [...attempts].sort((left, right) => (
    left.attemptNumber - right.attemptNumber || left.submittedAt.localeCompare(right.submittedAt)
  ));
  const latest = sorted[sorted.length - 1]!;
  const contextMap = new Map<string, {
    contextId: string;
    deliveryId: string;
    surface: typeof latest.surface;
    attemptCount: number;
  }>();
  for (const attempt of sorted) {
    const key = `${attempt.deliveryContextId}|${attempt.deliveryId}`;
    const current = contextMap.get(key);
    contextMap.set(key, current
      ? { ...current, attemptCount: current.attemptCount + 1 }
      : {
        contextId: attempt.deliveryContextId,
        deliveryId: attempt.deliveryId,
        surface: attempt.surface,
        attemptCount: 1,
      });
  }
  return {
    schemaVersion: 1,
    groupKey,
    studentId: latest.studentId,
    recipientId: latest.recipientId,
    activityId: latest.activityId,
    homeworkId: latest.homeworkId ?? undefined,
    bookId,
    attemptCount: sorted.length,
    latestAttemptId: latest.attemptId,
    latestResultId: latest.resultId,
    latestAttemptNumber: latest.attemptNumber,
    latestSubmittedAt: latest.submittedAt,
    latestCreatedAt: latest.createdAt,
    latestEvaluationStatus: latest.evaluationStatus,
    latestFeedbackRelease: latest.feedback.release,
    contexts: [...contextMap.values()],
  };
};

const groupIdentity = (summary: BookResultAttemptSummary): string => (
  bookResultGroupKey(summary.studentId, summary.activityId)
);

interface QueryCounterState {
  groups: number;
  attempts: number;
  details: number;
  persists: number;
  events: BookResultQueryEvent[];
}

class QueryCounter {
  private readonly state: QueryCounterState = { groups: 0, attempts: 0, details: 0, persists: 0, events: [] };

  constructor(private readonly observer?: BookResultQueryObserver) {}

  record(event: BookResultQueryEvent): void {
    if (event.operation === 'groups') this.state.groups += 1;
    if (event.operation === 'attempts') this.state.attempts += 1;
    if (event.operation === 'detail') this.state.details += 1;
    if (event.operation === 'persist') this.state.persists += 1;
    this.state.events.push(clone(event));
    this.observer?.(clone(event));
  }

  snapshot(): BookResultQueryMetrics {
    return clone(this.state);
  }
}

export class InMemoryBookResultReadRepository implements BookResultReadRepository {
  private groups: Record<string, BookResultGroupSummary>;
  private attempts: Record<string, BookResultAttemptSummary>;
  private details: Record<string, BookResultDetail>;
  private readonly counter: QueryCounter;

  constructor(initial: BookResultRepositorySnapshot = {}, options: BookResultRepositoryOptions = {}) {
    this.groups = clone(initial.groups ?? {});
    this.attempts = clone(initial.attempts ?? {});
    this.details = clone(initial.details ?? {});
    this.counter = new QueryCounter(options.queryObserver);
  }

  snapshot(): BookResultRepositorySnapshot {
    return clone({ groups: this.groups, attempts: this.attempts, details: this.details });
  }

  queryMetrics(): BookResultQueryMetrics {
    return this.counter.snapshot();
  }

  async listGroupSummaries(input: BookResultQueryInput): Promise<readonly BookResultGroupSummary[]> {
    queryScope(input);
    const limit = limitFor(input, 'groups');
    const path = bookResultGroupsPath(input);
    const rows = Object.values(this.groups)
      .filter((group) => group.studentId === input.studentId
        && group.bookId === input.bookId
        && (input.homeworkId === undefined || group.homeworkId === input.homeworkId)
        && (input.groupKey === undefined || group.groupKey === input.groupKey))
      .sort((left, right) => right.latestSubmittedAt.localeCompare(left.latestSubmittedAt))
      .slice(0, limit)
      .map(clone);
    this.counter.record({ operation: 'groups', path, rows: rows.length, limit });
    return rows;
  }

  async listAttemptSummaries(input: BookResultQueryInput): Promise<readonly BookResultAttemptSummary[]> {
    queryScope(input);
    if (!input.groupKey) throw new BookResultRepositoryError('book_result_group_key_required');
    const limit = limitFor(input, 'attempts');
    const path = bookResultAttemptsPath(input);
    const rows = Object.values(this.attempts)
      .filter((attempt) => attempt.studentId === input.studentId
        && attempt.bookId === input.bookId
        && (input.homeworkId === undefined || attempt.homeworkId === input.homeworkId)
        && groupIdentity(attempt) === input.groupKey)
      .sort((left, right) => left.attemptNumber - right.attemptNumber
        || left.submittedAt.localeCompare(right.submittedAt))
      .slice(0, limit)
      .map((attempt) => visibleSummary(attempt));
    this.counter.record({ operation: 'attempts', path, rows: rows.length, limit });
    return rows;
  }

  async readResultDetail(input: BookResultQueryInput & { readonly resultId: string }): Promise<BookResultDetail | null> {
    queryScope(input);
    const resultId = safeId(input.resultId, 'result_id');
    const path = bookResultDetailPath(resultId);
    const candidate = this.details[resultId];
    const detail = candidate
      && candidate.studentId === input.studentId
      && candidate.bookId === input.bookId
      && (input.homeworkId === undefined || candidate.homeworkId === input.homeworkId)
      && (input.groupKey === undefined || groupIdentity(candidate) === input.groupKey)
      ? visibleDetail(candidate)
      : null;
    this.counter.record({ operation: 'detail', path, rows: detail ? 1 : 0, limit: 1 });
    return detail;
  }

  async persistProjection(input: BookResultProjectionInput): Promise<void> {
    assertProjection(input.projection);
    const summary = visibleSummary({ ...input.projection.summary, bookId: input.projection.bookId });
    const detail = visibleDetail({ ...input.projection.detail, bookId: input.projection.bookId });
    const existing = this.attempts[summary.resultId];
    if (existing && stable(existing) !== stable(summary)) {
      throw new BookResultRepositoryError('book_result_projection_conflict');
    }
    const existingDetail = this.details[summary.resultId];
    if (existingDetail && stable(existingDetail) !== stable(detail)) {
      throw new BookResultRepositoryError('book_result_detail_conflict');
    }
    this.attempts[summary.resultId] = clone(summary);
    this.details[summary.resultId] = clone(detail);
    const groupKey = groupIdentity(summary);
    const grouped = Object.values(this.attempts).filter((attempt) =>
      attempt.bookId === input.projection.bookId
      && groupIdentity(attempt) === groupKey);
    this.groups[`${input.projection.bookId}:${groupKey}`] =
      makeGroup(groupKey, grouped, input.projection.bookId);
    this.counter.record({
      operation: 'persist',
      path: `book_result_read_models/projections/${pathId(summary.resultId, 'result_id')}`,
      rows: 1,
      limit: 1,
    });
  }

  listGroups(input: BookResultQueryInput): Promise<readonly BookResultGroupSummary[]> { return this.listGroupSummaries(input); }
  listAttempts(input: BookResultQueryInput): Promise<readonly BookResultAttemptSummary[]> { return this.listAttemptSummaries(input); }
  readDetail(input: BookResultQueryInput & { readonly resultId: string }): Promise<BookResultDetail | null> { return this.readResultDetail(input); }
}

export interface FirebaseBookResultReadRepositoryOptions extends BookResultRepositoryOptions {
  readonly env: RepositoryEnv & {
    readonly BOOK_RESULT_READ_GOOGLE_SA_KEY?: string;
    readonly writeDatabaseValue?: (path: string, value: unknown) => Promise<void>;
  };
  readonly fetchImpl?: typeof fetch;
  readonly getAccessToken?: () => Promise<string>;
}

const mapRows = <T>(value: unknown): readonly T[] => {
  if (Array.isArray(value)) return value as readonly T[];
  if (!isRecord(value)) return [];
  return Object.values(value) as T[];
};

export class FirebaseBookResultReadRepository implements BookResultReadRepository {
  private readonly rtdb: FirebaseRtdbRestClient;
  private readonly counter: QueryCounter;
  private readonly env: FirebaseBookResultReadRepositoryOptions['env'];

  constructor(options: FirebaseBookResultReadRepositoryOptions) {
    this.env = options.env;
    const scopedEnv = {
      ...options.env,
      GOOGLE_SA_KEY: options.env.BOOK_RESULT_READ_GOOGLE_SA_KEY,
    };
    this.rtdb = new FirebaseRtdbRestClient({
      env: scopedEnv,
      fetchImpl: options.fetchImpl ?? fetch,
      ...(options.getAccessToken ? { getAccessToken: options.getAccessToken } : {}),
    });
    this.counter = new QueryCounter(options.queryObserver);
  }

  queryMetrics(): BookResultQueryMetrics { return this.counter.snapshot(); }

  async listGroupSummaries(input: BookResultQueryInput): Promise<readonly BookResultGroupSummary[]> {
    queryScope(input);
    const limit = limitFor(input, 'groups');
    const path = bookResultGroupsPath(input);
    const rows = mapRows<BookResultGroupSummary>(await this.rtdb.readValue(path, {
      orderBy: 'latestSubmittedAt',
      limitToLast: limit,
    }))
      .filter((row): row is BookResultGroupSummary => isRecord(row)
        && row.schemaVersion === 1
        && row.studentId === input.studentId
        && row.bookId === input.bookId
        && (input.homeworkId === undefined || row.homeworkId === input.homeworkId)
        && (input.groupKey === undefined || row.groupKey === input.groupKey))
      .sort((left, right) => right.latestSubmittedAt.localeCompare(left.latestSubmittedAt))
      .slice(0, limit)
      .map(clone);
    this.counter.record({ operation: 'groups', path, rows: rows.length, limit });
    return rows;
  }

  async listAttemptSummaries(input: BookResultQueryInput): Promise<readonly BookResultAttemptSummary[]> {
    queryScope(input);
    if (!input.groupKey) throw new BookResultRepositoryError('book_result_group_key_required');
    const limit = limitFor(input, 'attempts');
    const path = bookResultAttemptsPath(input);
    const indexedRows = mapRows<BookResultAttemptSummary>(await this.rtdb.readValue(path, {
      orderBy: '$key',
      limitToFirst: BOOK_RESULT_MAX_ATTEMPT_LIMIT + 1,
    }));
    if (indexedRows.length > BOOK_RESULT_MAX_ATTEMPT_LIMIT) {
      throw new BookResultRepositoryError('book_result_attempts_query_unbounded');
    }
    const rows = indexedRows
      .filter((row): row is BookResultAttemptSummary => isRecord(row)
        && row.schemaVersion === 1
        && row.studentId === input.studentId
        && row.bookId === input.bookId
        && groupIdentity(row) === input.groupKey
        && (input.homeworkId === undefined || row.homeworkId === input.homeworkId))
      .sort((left, right) => left.attemptNumber - right.attemptNumber
        || left.submittedAt.localeCompare(right.submittedAt))
      .slice(0, limit)
      .map((row) => visibleSummary(row));
    this.counter.record({ operation: 'attempts', path, rows: rows.length, limit });
    return rows;
  }

  async readResultDetail(input: BookResultQueryInput & { readonly resultId: string }): Promise<BookResultDetail | null> {
    queryScope(input);
    const resultId = safeId(input.resultId, 'result_id');
    const path = bookResultDetailPath(resultId);
    const raw = await this.rtdb.readValue(path);
    const detail = isRecord(raw)
      && raw.schemaVersion === 1
      && raw.resultId === resultId
      && raw.studentId === input.studentId
      && raw.bookId === input.bookId
      && (input.homeworkId === undefined || raw.homeworkId === input.homeworkId)
      && (input.groupKey === undefined || groupIdentity(raw as unknown as BookResultDetail) === input.groupKey)
      ? visibleDetail(raw as unknown as BookResultDetail)
      : null;
    this.counter.record({ operation: 'detail', path, rows: detail ? 1 : 0, limit: 1 });
    return detail;
  }

  async persistProjection(input: BookResultProjectionInput): Promise<void> {
    if (typeof this.env.writeDatabaseValue !== 'function') {
      throw new BookResultRepositoryError('book_result_projection_writer_unavailable');
    }
    assertProjection(input.projection);
    const summary = visibleSummary({ ...input.projection.summary, bookId: input.projection.bookId });
    const detail = visibleDetail({ ...input.projection.detail, bookId: input.projection.bookId });
    const detailPath = bookResultDetailPath(summary.resultId);
    const existingDetail = await this.rtdb.readValue(detailPath);
    if (existingDetail !== null && stable(existingDetail) !== stable(detail)) {
      throw new BookResultRepositoryError('book_result_detail_conflict');
    }
    if (existingDetail === null) await this.env.writeDatabaseValue(detailPath, detail);

    const groupKey = groupIdentity(summary);
    const scopes: BookResultQueryInput[] = [{
      bookId: input.projection.bookId,
      studentId: summary.studentId,
      groupKey,
    }];
    if (summary.homeworkId) {
      scopes.push({
        bookId: input.projection.bookId,
        studentId: summary.studentId,
        homeworkId: summary.homeworkId,
        groupKey,
      });
    }

    for (const scope of scopes) {
      const attemptsPath = bookResultAttemptsPath(scope);
      const attemptPath = `${attemptsPath}/${pathId(summary.resultId, 'result_id')}`;
      const groupPath = bookResultGroupSummaryPath(scope);
      const existingAttempt = await this.rtdb.readValue(attemptPath);
      if (existingAttempt !== null && stable(existingAttempt) !== stable(summary)) {
        throw new BookResultRepositoryError('book_result_projection_conflict');
      }
      if (existingAttempt === null) {
        await this.env.writeDatabaseValue(attemptPath, summary);
      }

      const indexedAttempts = mapRows<BookResultAttemptSummary>(
        await this.rtdb.readValue(attemptsPath, {
          orderBy: '$key',
          limitToFirst: BOOK_RESULT_MAX_ATTEMPT_LIMIT + 1,
        }),
      ).filter((row): row is BookResultAttemptSummary => isRecord(row)
        && row.schemaVersion === 1
        && row.studentId === summary.studentId
        && row.bookId === input.projection.bookId
        && groupIdentity(row) === groupKey
        && (scope.homeworkId === undefined || row.homeworkId === scope.homeworkId));
      if (indexedAttempts.length === 0
        || indexedAttempts.length > BOOK_RESULT_MAX_ATTEMPT_LIMIT) {
        throw new BookResultRepositoryError('book_result_attempts_query_unbounded');
      }
      const nextGroup = makeGroup(groupKey, indexedAttempts, input.projection.bookId);
      const existingGroup = await this.rtdb.readValue(groupPath);
      if (existingGroup === null || stable(existingGroup) !== stable(nextGroup)) {
        await this.env.writeDatabaseValue(groupPath, nextGroup);
      }
    }
    this.counter.record({ operation: 'persist', path: `book_result_read_models/projections/${pathId(summary.resultId, 'result_id')}`, rows: 1, limit: 1 });
  }

  listGroups(input: BookResultQueryInput): Promise<readonly BookResultGroupSummary[]> { return this.listGroupSummaries(input); }
  listAttempts(input: BookResultQueryInput): Promise<readonly BookResultAttemptSummary[]> { return this.listAttemptSummaries(input); }
  readDetail(input: BookResultQueryInput & { readonly resultId: string }): Promise<BookResultDetail | null> { return this.readResultDetail(input); }
}
