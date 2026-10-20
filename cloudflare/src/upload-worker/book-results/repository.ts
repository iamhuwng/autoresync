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
  type BookResultQueryEvent,
  type BookResultQueryInput,
  type BookResultQueryMetrics,
  type BookResultQueryObserver,
} from './types.ts';
import {
  createFirebaseClaimTokenProvider,
  type BookFirebaseClaimTuple,
} from '../book-activity-authoring/firebase-token.ts';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@_-]{0,255}$/u;
const GROUP_KEY = /^g_[A-Za-z0-9_-]{4,638}$/u;
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

// Keep validated path segments raw; FirebaseRtdbRestClient performs the one
// required URL encoding at the transport boundary.
const pathId = (value: string, label: string): string => safeId(value, label);
const groupKey = (value: string): string => {
  if (!GROUP_KEY.test(value)) throw new BookResultRepositoryError('book_result_group_key_invalid');
  return value;
};
const groupPathId = (value: string): string => groupKey(value);

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
  if (input.contextKind === 'public' || input.contextKind === 'course' || input.contextKind === 'class') {
    return `${bookResultContextRoot(input)}/group_summaries`;
  }
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
  groupKey(input.groupKey);
  const root = input.contextKind === 'public' || input.contextKind === 'course' || input.contextKind === 'class'
    ? `${bookResultContextRoot(input)}/group_attempts`
    : input.homeworkId
    ? bookResultHomeworkAttemptsPath({
      homeworkId: input.homeworkId,
      studentId: input.studentId,
      bookId: input.bookId,
    })
    : bookResultStudentAttemptsPath({
      studentId: input.studentId,
      bookId: input.bookId,
    });
  return `${root}/${groupPathId(input.groupKey)}`;
};

const bookResultContextRoot = (input: BookResultQueryInput): string => {
  if (!input.contextId || input.homeworkId || !['public', 'course', 'class'].includes(input.contextKind ?? '')) {
    throw new BookResultRepositoryError('book_result_context_invalid');
  }
  return `book_result_read_models/contexts/${input.contextKind}/${pathId(input.contextId, 'context_id')}/students/${pathId(input.studentId, 'student_id')}/books/${pathId(input.bookId, 'book_id')}`;
};

const matchesContext = (row: { readonly surface?: unknown; readonly contextId?: unknown }, input: BookResultQueryInput): boolean => (
  input.contextKind !== 'public' && input.contextKind !== 'course' && input.contextKind !== 'class'
    || row.surface === input.contextKind && row.contextId === input.contextId
);

const groupMatchesContext = (row: BookResultGroupSummary, input: BookResultQueryInput): boolean => (
  input.contextKind !== 'public' && input.contextKind !== 'course' && input.contextKind !== 'class'
    || row.contexts.length > 0 && row.contexts.every((entry) => matchesContext({ surface: entry.surface, contextId: entry.contextId }, input))
);

export const bookResultDetailPath = (resultId: string): string => (
  `book_result_read_models/details/${pathId(resultId, 'result_id')}`
);

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
  ...(() => {
    const value = clone(summary) as unknown as Record<string, unknown>;
    if (value.ownerId === undefined) value.ownerId = null;
    if (value.homeworkId === undefined) value.homeworkId = null;
    if (value.attemptLimit === undefined) value.attemptLimit = null;
    if (value.attemptsRemaining === undefined) value.attemptsRemaining = null;
    if (!Array.isArray(value.pageGroupKeys)) value.pageGroupKeys = [];
    if (!Array.isArray(value.sourceProvenance)) value.sourceProvenance = [];
    if (!Array.isArray(value.sources)) value.sources = [];
    if (isRecord(value.attemptSourceContext)
      && value.attemptSourceContext.state === 'historical_source_unavailable') {
      value.attemptSourceContext = {
        ...value.attemptSourceContext,
        metadata: value.attemptSourceContext.metadata ?? null,
        documentResource: value.attemptSourceContext.documentResource ?? null,
      };
    }
    const context = value.attemptSourceContext;
    if (isRecord(context) && context.state === 'available' && isRecord(context.documentResource)) {
      const scope = context.documentResource.localPageScope;
      if (isRecord(scope) && scope.kind === 'all' && scope.pages === undefined) scope.pages = [];
    }
    return value as unknown as BookResultAttemptSummary;
  })(),
  sourceProvenance: clone(summary.sourceProvenance ?? []),
  sources: clone(summary.sources ?? []),
});

const visibleDetail = (detail: BookResultDetail): BookResultDetail => ({
  ...visibleSummary(detail),
  response: stripUnsafe(detail.response),
});

const queryScope = (input: BookResultQueryInput): void => {
  safeId(input.studentId, 'student_id');
  safeId(input.bookId, 'book_id');
  if (input.homeworkId) safeId(input.homeworkId, 'homework_id');
  if (input.groupKey) groupKey(input.groupKey);
  if (input.contextKind && !['solo', 'public', 'homework', 'course', 'class'].includes(input.contextKind)) {
    throw new BookResultRepositoryError('book_result_context_invalid');
  }
  if (input.contextKind === 'public' || input.contextKind === 'course' || input.contextKind === 'class') bookResultContextRoot(input);
  else if (input.contextId !== undefined) throw new BookResultRepositoryError('book_result_context_invalid');
};

const limitFor = (input: BookResultQueryInput, kind: 'groups' | 'attempts'): number => {
  const limit = input.limit ?? (kind === 'groups' ? BOOK_RESULT_MAX_GROUP_LIMIT : BOOK_RESULT_MAX_ATTEMPT_LIMIT);
  const max = kind === 'groups' ? BOOK_RESULT_MAX_GROUP_LIMIT : BOOK_RESULT_MAX_ATTEMPT_LIMIT;
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > max) {
    throw new BookResultRepositoryError(`book_result_${kind}_query_unbounded`);
  }
  return limit;
};

const groupIdentity = (summary: BookResultAttemptSummary): string => (
  bookResultGroupKey(summary.studentId, summary.activityId)
);

interface QueryCounterState {
  groups: number;
  attempts: number;
  details: number;
  events: BookResultQueryEvent[];
}

class QueryCounter {
  private readonly state: QueryCounterState = { groups: 0, attempts: 0, details: 0, events: [] };

  constructor(private readonly observer?: BookResultQueryObserver) {}

  record(event: BookResultQueryEvent): void {
    if (event.operation === 'groups') this.state.groups += 1;
    if (event.operation === 'attempts') this.state.attempts += 1;
    if (event.operation === 'detail') this.state.details += 1;
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
        && (input.groupKey === undefined || group.groupKey === input.groupKey)
        && groupMatchesContext(group, input))
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
        && matchesContext(attempt, input)
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
      && matchesContext(candidate, input)
      && (input.groupKey === undefined || groupIdentity(candidate) === input.groupKey)
      ? visibleDetail(candidate)
      : null;
    this.counter.record({ operation: 'detail', path, rows: detail ? 1 : 0, limit: 1 });
    return detail;
  }

  listGroups(input: BookResultQueryInput): Promise<readonly BookResultGroupSummary[]> { return this.listGroupSummaries(input); }
  listAttempts(input: BookResultQueryInput): Promise<readonly BookResultAttemptSummary[]> { return this.listAttemptSummaries(input); }
  readDetail(input: BookResultQueryInput & { readonly resultId: string }): Promise<BookResultDetail | null> { return this.readResultDetail(input); }
}

export interface FirebaseBookResultReadRepositoryOptions extends BookResultRepositoryOptions {
  readonly env: RepositoryEnv & {
    readonly BOOK_RESULT_READ_GOOGLE_SA_KEY?: string;
    readonly BOOK_RESULT_READ_SERVICE_IDENTITY?: string;
  };
  readonly fetchImpl?: typeof fetch;
}

const mapRows = <T>(value: unknown): readonly T[] => {
  if (Array.isArray(value)) return value as readonly T[];
  if (!isRecord(value)) return [];
  return Object.values(value) as T[];
};

const RESULT_ID = '[A-Za-z0-9][A-Za-z0-9._:@_-]{0,255}';
const RESULT_GROUP_KEY = 'g_[A-Za-z0-9_-]{4,638}';
const RESULT_SCOPE_ID = '[A-Za-z0-9][A-Za-z0-9._:@_-]{0,255}';
const resultReadClaimForPath = (path: string): BookFirebaseClaimTuple => {
  const contextMatch = /^book_result_read_models\/contexts\/(public|course|class)\/([^/]+)\/students\/([^/]+)\/books\/([^/]+)\/(?:group_summaries|group_attempts)(?:\/([^/]+))?$/u.exec(path);
  if (contextMatch) return {
    service: 'book_result_read', contextKind: contextMatch[1] as 'public' | 'course' | 'class', contextId: contextMatch[2]!,
    studentId: contextMatch[3]!, bookId: contextMatch[4]!,
    ...(contextMatch[5] ? { groupKey: contextMatch[5] } : {}),
  };
  let match = new RegExp(`^book_result_read_models/details/(${RESULT_ID})$`, 'u').exec(path);
  if (match) return { service: 'book_result_read', resultId: match[1]! };
  match = new RegExp(`^book_result_read_models/students/(${RESULT_SCOPE_ID})/books/(${RESULT_SCOPE_ID})/group_summaries$`, 'u').exec(path);
  if (match) return { service: 'book_result_read', studentId: match[1]!, bookId: match[2]! };
  match = new RegExp(`^book_result_read_models/students/(${RESULT_SCOPE_ID})/books/(${RESULT_SCOPE_ID})/group_attempts/(${RESULT_GROUP_KEY})$`, 'u').exec(path);
  if (match) return { service: 'book_result_read', studentId: match[1]!, bookId: match[2]!, groupKey: match[3]! };
  match = new RegExp(`^book_result_read_models/homework/(${RESULT_SCOPE_ID})/students/(${RESULT_SCOPE_ID})/books/(${RESULT_SCOPE_ID})/group_summaries$`, 'u').exec(path);
  if (match) return {
    service: 'book_result_read', homeworkId: match[1]!, studentId: match[2]!, bookId: match[3]!,
  };
  match = new RegExp(`^book_result_read_models/homework/(${RESULT_SCOPE_ID})/students/(${RESULT_SCOPE_ID})/books/(${RESULT_SCOPE_ID})/group_attempts/(${RESULT_GROUP_KEY})$`, 'u').exec(path);
  if (match) return {
    service: 'book_result_read', homeworkId: match[1]!, studentId: match[2]!, bookId: match[3]!, groupKey: match[4]!,
  };
  throw new BookResultRepositoryError('book_result_read_path_invalid');
};

export class FirebaseBookResultReadRepository implements BookResultReadRepository {
  private readonly rtdb: FirebaseRtdbRestClient;
  private readonly claimTokenProvider?: ReturnType<typeof createFirebaseClaimTokenProvider>;
  private readonly counter: QueryCounter;

  constructor(private readonly options: FirebaseBookResultReadRepositoryOptions) {
    const fetchImpl = options.fetchImpl ?? fetch;
    if (options.env.readDatabaseValue) {
      this.rtdb = new FirebaseRtdbRestClient({ env: options.env, fetchImpl });
    } else {
      const serviceIdentity = options.env.BOOK_RESULT_READ_SERVICE_IDENTITY?.trim() ?? '';
      const claimTokenProvider = createFirebaseClaimTokenProvider({
        serviceAccountJson: options.env.BOOK_RESULT_READ_GOOGLE_SA_KEY?.trim() ?? '',
        serviceIdentity,
        firebaseProjectId: options.env.FIREBASE_PROJECT_ID?.trim() ?? '',
        firebaseWebApiKey: options.env.FIREBASE_WEB_API_KEY?.trim() ?? '',
        fetchImpl,
      });
      this.claimTokenProvider = claimTokenProvider;
      this.rtdb = new FirebaseRtdbRestClient({
        env: options.env,
        fetchImpl,
        firebaseAuthToken: true,
        getFirebaseAuthToken: ({ path } = { path: '' }) => (
          claimTokenProvider(resultReadClaimForPath(path))
        ),
      });
    }
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
        && (input.groupKey === undefined || row.groupKey === input.groupKey)
        && groupMatchesContext(row, input))
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
        && (input.homeworkId === undefined || row.homeworkId === input.homeworkId)
        && matchesContext(row, input))
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
    const scoped = input.contextKind === 'public' || input.contextKind === 'course' || input.contextKind === 'class';
    const reader = scoped && this.claimTokenProvider ? new FirebaseRtdbRestClient({
      env: this.options.env, fetchImpl: this.options.fetchImpl ?? fetch, firebaseAuthToken: true,
      getFirebaseAuthToken: () => this.claimTokenProvider!({ service: 'book_result_read',
        contextKind: input.contextKind as 'public' | 'course' | 'class', contextId: input.contextId!,
        studentId: input.studentId, bookId: input.bookId, resultId }),
    }) : this.rtdb;
    const raw = await reader.readValue(path);
    const detail = isRecord(raw)
      && raw.schemaVersion === 1
      && raw.resultId === resultId
      && raw.studentId === input.studentId
      && raw.bookId === input.bookId
      && (input.homeworkId === undefined || raw.homeworkId === input.homeworkId)
      && matchesContext(raw, input)
      && (input.groupKey === undefined || groupIdentity(raw as unknown as BookResultDetail) === input.groupKey)
      ? visibleDetail(raw as unknown as BookResultDetail)
      : null;
    this.counter.record({ operation: 'detail', path, rows: detail ? 1 : 0, limit: 1 });
    return detail;
  }

  listGroups(input: BookResultQueryInput): Promise<readonly BookResultGroupSummary[]> { return this.listGroupSummaries(input); }
  listAttempts(input: BookResultQueryInput): Promise<readonly BookResultAttemptSummary[]> { return this.listAttemptSummaries(input); }
  readDetail(input: BookResultQueryInput & { readonly resultId: string }): Promise<BookResultDetail | null> { return this.readResultDetail(input); }
}
