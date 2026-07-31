import {
  assertBookResultVisible,
  resolveBookResultVisibility,
  BookResultVisibilityError,
  type BookResultHomeworkAuthorityResolver,
  type BookResultViewerRoleResolver,
} from './authorization.ts';
import {
  BookResultRepositoryError,
  type BookResultReadRepository,
} from './repository.ts';
import {
  decodeBookResultGroupKey,
  type BookResultAttemptSummary,
  type BookResultDetail,
  type BookResultGroupDetail,
  type BookResultGroupSummary,
  type BookResultQueryInput,
  type BookResultReadScope,
  type BookResultViewerRole,
} from './types.ts';

export interface BookResultReadWorkerEnv {
  readonly [key: string]: unknown;
}

export class BookResultReadWorkerError extends Error {
  constructor(readonly code: string, readonly status = 400) {
    super(code);
    this.name = 'BookResultReadWorkerError';
  }
}

export interface BookResultReadWorkerHandlersOptions {
  readonly repository: BookResultReadRepository;
  /** Trusted server-side role resolver; never derive role from browser input. */
  readonly resolveViewerRole: BookResultViewerRoleResolver;
  /** Bulk authority resolver; invoked once with all Homework IDs for a request. */
  readonly resolveHomeworkAuthorities: BookResultHomeworkAuthorityResolver;
  /** Compatibility alias for composition callers. */
  readonly resolveHomeworkAuthority?: BookResultHomeworkAuthorityResolver;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@_-]{0,255}$/u;

const safeId = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !ID.test(value) || value === '.' || value === '..') {
    throw new BookResultReadWorkerError(`book_result_${label}_invalid`, 400);
  }
  return value;
};

const parseLimit = (value: unknown): number | undefined => {
  if (value === undefined) return undefined;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/u.test(value)) return Number(value);
  throw new BookResultReadWorkerError('book_result_limit_invalid', 400);
};

const scopeFrom = (input: {
  readonly bookId: unknown;
  readonly studentId: unknown;
  readonly homeworkId?: unknown;
  readonly contextKind?: unknown;
}): BookResultReadScope => {
  const contextKind = input.contextKind === undefined
    ? undefined
    : input.contextKind === 'solo' || input.contextKind === 'homework'
      ? input.contextKind
      : (() => { throw new BookResultReadWorkerError('book_result_context_invalid', 400); })();
  return {
    bookId: safeId(input.bookId, 'book_id'),
    studentId: safeId(input.studentId, 'student_id'),
    ...(input.homeworkId === undefined ? {} : { homeworkId: safeId(input.homeworkId, 'homework_id') }),
    ...(contextKind ? { contextKind } : {}),
  };
};

const queryInput = (input: {
  readonly bookId: unknown;
  readonly studentId: unknown;
  readonly homeworkId?: unknown;
  readonly contextKind?: unknown;
  readonly groupKey?: unknown;
  readonly limit?: unknown;
}): BookResultQueryInput => ({
  ...scopeFrom(input),
  ...(input.groupKey === undefined ? {} : { groupKey: safeId(input.groupKey, 'group_key') }),
  ...(input.limit === undefined ? {} : { limit: parseLimit(input.limit) }),
});

const body = (value: Record<string, unknown>, status = 200) => ({
  body: value,
  init: { status } as ResponseInit,
});

type RepositoryCall = (
  input: BookResultQueryInput | (BookResultQueryInput & { readonly resultId: string }),
) => Promise<unknown>;

const repositoryMethod = (
  repository: BookResultReadRepository,
  primary: keyof BookResultReadRepository,
  alias: keyof BookResultReadRepository,
): RepositoryCall => {
  const selected = repository[primary] ?? repository[alias];
  if (typeof selected !== 'function') throw new BookResultReadWorkerError('book_result_repository_unavailable', 503);
  return selected.bind(repository) as RepositoryCall;
};

const SENSITIVE = /answer.?key|pdf|provider|storage|credential|private.?source|signed.?url|access.?token/iu;
const stripUnsafe = (value: unknown, depth = 0): unknown => {
  if (depth > 8) return null;
  if (Array.isArray(value)) return value.map((entry) => stripUnsafe(entry, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SENSITIVE.test(key)) continue;
    output[key] = stripUnsafe(entry, depth + 1);
  }
  return output;
};

const applyFeedbackVisibility = <T extends BookResultAttemptSummary>(
  summary: T,
  viewerRole: BookResultViewerRole,
): T => {
  if (viewerRole === 'teacher' || summary.feedback.release === 'released') {
    return summary;
  }
  return {
    ...summary,
    evaluation: {
      status: summary.evaluation.status,
      ...(summary.evaluation.evaluatedAt ? { evaluatedAt: summary.evaluation.evaluatedAt } : {}),
      ...(summary.evaluation.revision === undefined ? {} : { revision: summary.evaluation.revision }),
    },
    feedback: { release: summary.feedback.release, available: false },
  };
};

const safeSummary = (
  summary: BookResultAttemptSummary,
  viewerRole: BookResultViewerRole,
): BookResultAttemptSummary => {
  const visible = applyFeedbackVisibility(summary, viewerRole);
  const output = stripUnsafe(visible) as Record<string, unknown>;
  delete output.bookId;
  return output as unknown as BookResultAttemptSummary;
};
const safeDetail = (
  detail: BookResultDetail,
  viewerRole: BookResultViewerRole,
): BookResultDetail => {
  const visible = applyFeedbackVisibility(detail, viewerRole);
  const output = stripUnsafe(visible) as Record<string, unknown>;
  delete output.bookId;
  return output as unknown as BookResultDetail;
};

const groupDetail = (
  attempts: readonly BookResultAttemptSummary[],
  scope: BookResultQueryInput,
  viewerRole: BookResultViewerRole,
): BookResultGroupDetail | null => {
  if (attempts.length === 0 || !scope.groupKey) return null;
  const ordered = [...attempts].sort((left, right) => left.attemptNumber - right.attemptNumber
    || left.submittedAt.localeCompare(right.submittedAt));
  const latest = ordered[ordered.length - 1]!;
  const contextRows = new Map<string, BookResultAttemptSummary[]>();
  for (const attempt of ordered) {
    const key = `${attempt.contextId}|${attempt.placementId}`;
    contextRows.set(key, [...(contextRows.get(key) ?? []), attempt]);
  }
  const contexts = [...contextRows.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, rows]) => {
      const first = rows[0]!;
      const contextLatest = rows[rows.length - 1]!;
      const limit = first.attemptLimit;
      return {
        contextId: first.contextId,
        placementId: first.placementId,
        surface: first.surface,
        attemptLimit: limit,
        attemptsUsed: rows.length,
        attemptsRemaining: limit === null ? null : Math.max(0, limit - rows.length),
        completionStatus: rows.some((row) => row.completionStatus === 'completed')
          ? 'completed' as const
          : 'not-completed' as const,
        latestAttemptId: contextLatest.attemptId,
        attemptIds: rows.map((row) => row.attemptId),
      };
    });
  return {
    groupKey: scope.groupKey,
    recipientId: latest.recipientId,
    studentId: latest.studentId,
    activityId: latest.activityId,
    attemptCount: ordered.length,
    attempts: ordered.map((attempt) => safeSummary(attempt, viewerRole)),
    contexts,
    latestAttemptId: latest.attemptId,
  };
};

export const createBookResultReadWorkerHandlers = (
  options: BookResultReadWorkerHandlersOptions,
) => {
  if (!options.repository) throw new Error('book_result_repository_required');
  if (typeof options.resolveViewerRole !== 'function') {
    throw new Error('book_result_viewer_role_resolver_required');
  }
  const resolveHomeworkAuthorities = options.resolveHomeworkAuthorities
    ?? options.resolveHomeworkAuthority;
  if (typeof resolveHomeworkAuthorities !== 'function') {
    throw new Error('book_result_homework_authority_resolver_required');
  }

  const authorize = async (input: {
    readonly request: Request;
    readonly env: BookResultReadWorkerEnv;
    readonly uid: string;
    readonly scope: BookResultReadScope;
  }) => resolveBookResultVisibility({
    ...input,
    resolveViewerRole: options.resolveViewerRole,
    resolveHomeworkAuthorities,
  });

  const resultSummary = async (input: {
    readonly request: Request;
    readonly env: BookResultReadWorkerEnv;
    readonly uid: string;
    readonly bookId: string;
    readonly studentId: string;
    readonly homeworkId?: string;
    readonly contextKind?: 'solo' | 'homework';
    readonly limit?: number | string;
  }) => {
    try {
      const scope = queryInput(input);
      await authorize({ ...input, scope });
      const list = repositoryMethod(options.repository, 'listGroupSummaries', 'listGroups');
      const groups = await list(scope) as readonly BookResultGroupSummary[];
      return body({ groups: groups.map((group) => stripUnsafe(group) as BookResultGroupSummary) });
    } catch (error) {
      return handleError(error, 'book_result_summary_read_failed');
    }
  };

  const groupedAttempt = async (input: {
    readonly request: Request;
    readonly env: BookResultReadWorkerEnv;
    readonly uid: string;
    readonly bookId: string;
    readonly studentId: string;
    readonly groupKey: string;
    readonly homeworkId?: string;
    readonly contextKind?: 'solo' | 'homework';
    readonly limit?: number | string;
  }) => {
    try {
      const scope = queryInput(input);
      const decoded = decodeBookResultGroupKey(scope.groupKey!);
      if (!decoded || decoded[0] !== scope.studentId) {
        throw new BookResultReadWorkerError('book_result_group_identity_invalid', 400);
      }
      const visibility = await authorize({ ...input, scope });
      const list = repositoryMethod(options.repository, 'listAttemptSummaries', 'listAttempts');
      const attempts = await list(scope) as readonly BookResultAttemptSummary[];
      for (const attempt of attempts) assertBookResultVisible(visibility, scope, attempt);
      const group = groupDetail(attempts, scope, visibility.viewer.role);
      if (!group) return body({ code: 'book_result_group_not_found' }, 404);
      return body({ group: stripUnsafe(group) as BookResultGroupDetail });
    } catch (error) {
      return handleError(error, 'book_result_grouped_attempt_read_failed');
    }
  };

  const resultDetail = async (input: {
    readonly request: Request;
    readonly env: BookResultReadWorkerEnv;
    readonly uid: string;
    readonly bookId: string;
    readonly studentId: string;
    readonly resultId: string;
    readonly groupKey?: string;
    readonly homeworkId?: string;
    readonly contextKind?: 'solo' | 'homework';
  }) => {
    try {
      const scope = queryInput(input);
      const visibility = await authorize({ ...input, scope });
      const read = repositoryMethod(options.repository, 'readResultDetail', 'readDetail');
      const detail = await read({ ...scope, resultId: safeId(input.resultId, 'result_id') }) as BookResultDetail | null;
      if (!detail) return body({ code: 'book_result_not_found' }, 404);
      assertBookResultVisible(visibility, scope, detail);
      return body({ detail: safeDetail(detail, visibility.viewer.role) });
    } catch (error) {
      return handleError(error, 'book_result_detail_read_failed');
    }
  };

  return {
    resultSummary,
    groupedAttempt,
    resultDetail,
    /** Semantic aliases used by future contributor composition. */
    summary: resultSummary,
    group: groupedAttempt,
    detail: resultDetail,
  };
};

const handleError = (error: unknown, fallback: string) => {
  if (error instanceof BookResultReadWorkerError || error instanceof BookResultVisibilityError) {
    return body({ code: error.code }, error.status);
  }
  if (error instanceof BookResultRepositoryError) {
    return body({ code: error.code }, error.code.endsWith('not_found') ? 404 : 409);
  }
  return body({ code: fallback }, 500);
};

export default createBookResultReadWorkerHandlers;
export const createBookResultReadHandlers = createBookResultReadWorkerHandlers;
