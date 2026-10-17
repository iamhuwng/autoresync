import {
  assertBookResultVisible,
  assertBookResultGroupVisible,
  resolveBookResultVisibility,
  BookResultVisibilityError,
  type BookResultHomeworkAuthorityResolver,
  type BookResultViewerRoleResolver,
} from './authorization.ts';
import {
  BookResultRepositoryError,
  type BookResultReadRepository,
} from './repository.ts';
import type { BookHomeworkManualFeedbackRelease } from '../../../../src/services/book-homework/bookHomeworkAuthority.types.ts';
import {
  decodeBookResultGroupKey,
  type BookResultAttemptSummary,
  type BookResultDetail,
  type BookResultGroupDetail,
  type BookResultGroupSummary,
  type BookResultQueryInput,
  type BookResultReadScope,
  type BookResultViewerRole,
  type BookResultContextKind,
  type BookResultContextReadAuthority,
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
  readonly resolveContextAuthority?: (scope: BookResultReadScope) => Promise<BookResultContextReadAuthority | null>;
  /** Exact immutable authority fact for manual feedback; never request supplied. */
  readonly resolveManualFeedbackRelease?: (input: {
    readonly summary: BookResultAttemptSummary;
    readonly env: BookResultReadWorkerEnv;
  }) => BookHomeworkManualFeedbackRelease | null;
  readonly now?: () => string;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@_-]{0,255}$/u;
const GROUP_KEY = /^g_[A-Za-z0-9_-]{4,638}$/u;

const safeId = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !ID.test(value) || value === '.' || value === '..') {
    throw new BookResultReadWorkerError(`book_result_${label}_invalid`, 400);
  }
  return value;
};
const safeGroupKey = (value: unknown): string => {
  if (typeof value !== 'string' || !GROUP_KEY.test(value)) {
    throw new BookResultReadWorkerError('book_result_group_key_invalid', 400);
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
  readonly contextId?: unknown;
}): BookResultReadScope => {
  const contextKind = input.contextKind === undefined
    ? undefined
    : input.contextKind === 'public' || input.contextKind === 'solo' || input.contextKind === 'homework' || input.contextKind === 'course' || input.contextKind === 'class'
      ? input.contextKind
      : (() => { throw new BookResultReadWorkerError('book_result_context_invalid', 400); })();
  return {
    bookId: safeId(input.bookId, 'book_id'),
    studentId: safeId(input.studentId, 'student_id'),
    ...(input.homeworkId === undefined ? {} : { homeworkId: safeId(input.homeworkId, 'homework_id') }),
    ...(contextKind ? { contextKind } : {}),
    ...(input.contextId === undefined ? {} : { contextId: safeId(input.contextId, 'context_id') }),
  };
};

const queryInput = (input: {
  readonly bookId: unknown;
  readonly studentId: unknown;
  readonly homeworkId?: unknown;
  readonly contextKind?: unknown;
  readonly contextId?: unknown;
  readonly groupKey?: unknown;
  readonly limit?: unknown;
}): BookResultQueryInput => ({
  ...scopeFrom(input),
  ...(input.groupKey === undefined ? {} : { groupKey: safeGroupKey(input.groupKey) }),
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

const releaseMatchesSummary = (
  release: BookHomeworkManualFeedbackRelease | null,
  summary: BookResultAttemptSummary,
): boolean => Boolean(release
  && release.attemptId === summary.attemptId
  && release.resultId === summary.resultId
  && release.resultId === `${summary.attemptId}:result`
  && release.recipientId === summary.recipientId
  && release.recipientId === summary.studentId
  && release.contextId === summary.contextId
  && release.bindingId === summary.bindingId
  && release.bindingRevision === summary.bindingRevision
  && release.placementId === summary.placementId
  && release.activityId === summary.activityId
  && release.activityVersionId === summary.activityVersionId
  && release.activityVersion === summary.activityVersion);

const exactCompletionExists = (summary: BookResultAttemptSummary): boolean => (
  summary.completionStatus === 'completed'
  && summary.completion.status === 'completed'
  && summary.completion.attemptId === summary.attemptId
  && summary.completion.resultId === summary.resultId
  && summary.completion.completionId === summary.completionId
  && summary.completion.contextId === summary.contextId
  && summary.completion.placementId === summary.placementId
  && summary.completion.activityVersionId === summary.activityVersionId
  && summary.completion.activityVersion === summary.activityVersion
);

const isFeedbackReleased = (
  summary: BookResultAttemptSummary,
  viewerRole: BookResultViewerRole,
  options: BookResultReadWorkerHandlersOptions,
  env: BookResultReadWorkerEnv,
): boolean => {
  if (viewerRole === 'teacher') return true;
  if (summary.surface === 'solo') return true;
  const trusted = summary as BookResultAttemptSummary & {
    readonly feedbackPolicy?: unknown;
    readonly terminalLate?: unknown;
  };
  switch (trusted.feedbackPolicy) {
    case 'immediate':
    case 'after_completion':
      return exactCompletionExists(summary);
    case 'after_deadline': {
      if (!trusted.terminalLate || typeof trusted.terminalLate !== 'object'
        || Array.isArray(trusted.terminalLate)) return false;
      const fact = trusted.terminalLate as { readonly effectiveDeadline?: { readonly at?: unknown } | null };
      const deadline = fact.effectiveDeadline?.at;
      if (typeof deadline !== 'string'
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(deadline)
        || !Number.isFinite(Date.parse(deadline))
        || new Date(deadline).toISOString() !== deadline) return false;
      const now = (options.now ?? (() => new Date().toISOString()))();
      return Number.isFinite(Date.parse(now)) && Date.parse(now) > Date.parse(deadline);
    }
    case 'manual':
      return releaseMatchesSummary(
        options.resolveManualFeedbackRelease?.({ summary, env }) ?? null,
        summary,
      );
    case 'never':
    default:
      return false;
  }
};

const applyFeedbackVisibility = <T extends BookResultAttemptSummary>(
  summary: T,
  viewerRole: BookResultViewerRole,
  options: BookResultReadWorkerHandlersOptions,
  env: BookResultReadWorkerEnv,
): T => {
  if (summary.surface === 'public') {
    const output = { ...summary, evaluationStatus: 'submitted' as const,
      evaluation: { status: 'submitted' as const },
      feedback: { release: 'not-applicable' as const, available: false } };
    delete output.studentFeedbackRelease;
    return output;
  }
  const releasedForStudent = isFeedbackReleased(summary, 'student', options, env);
  const output = {
    ...summary,
    feedback: viewerRole === 'teacher'
      ? { ...summary.feedback, release: 'released' as const, available: true }
      : releasedForStudent
        ? { ...summary.feedback, release: 'released' as const, available: true }
        : { release: 'withheld' as const, available: false },
    studentFeedbackRelease: releasedForStudent ? 'released' as const : 'withheld' as const,
  } as T & { readonly studentFeedbackRelease: 'released' | 'withheld' };
  if (viewerRole === 'teacher' || releasedForStudent) return output;
  return {
    ...output,
    evaluation: {
      status: summary.evaluation.status,
      ...(summary.evaluation.evaluatedAt ? { evaluatedAt: summary.evaluation.evaluatedAt } : {}),
      ...(summary.evaluation.revision === undefined ? {} : { revision: summary.evaluation.revision }),
    },
  };
};

const safeSummary = (
  summary: BookResultAttemptSummary,
  viewerRole: BookResultViewerRole,
  options: BookResultReadWorkerHandlersOptions,
  env: BookResultReadWorkerEnv,
): BookResultAttemptSummary => {
  const visible = applyFeedbackVisibility(summary, viewerRole, options, env);
  const output = stripUnsafe(visible) as Record<string, unknown>;
  delete output.bookId;
  return output as unknown as BookResultAttemptSummary;
};
const safeDetail = (
  detail: BookResultDetail,
  viewerRole: BookResultViewerRole,
  options: BookResultReadWorkerHandlersOptions,
  env: BookResultReadWorkerEnv,
): BookResultDetail => {
  const visible = applyFeedbackVisibility(detail, viewerRole, options, env);
  const output = stripUnsafe(visible) as Record<string, unknown>;
  delete output.bookId;
  return output as unknown as BookResultDetail;
};

const groupDetail = (
  attempts: readonly BookResultAttemptSummary[],
  scope: BookResultQueryInput,
  viewerRole: BookResultViewerRole,
  options: BookResultReadWorkerHandlersOptions,
  env: BookResultReadWorkerEnv,
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
    attempts: ordered.map((attempt) => safeSummary(attempt, viewerRole, options, env)),
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
    resolveContextAuthority: options.resolveContextAuthority,
  });

  const resultSummary = async (input: {
    readonly request: Request;
    readonly env: BookResultReadWorkerEnv;
    readonly uid: string;
    readonly bookId: string;
    readonly studentId: string;
    readonly homeworkId?: string;
    readonly contextKind?: BookResultContextKind;
    readonly contextId?: string;
    readonly limit?: number | string;
  }) => {
    try {
      const scope = queryInput(input);
      const visibility = await authorize({ ...input, scope });
      const list = repositoryMethod(options.repository, 'listGroupSummaries', 'listGroups');
      const groups = await list(scope) as readonly BookResultGroupSummary[];
      for (const group of groups) assertBookResultGroupVisible(visibility, scope, group);
      return body({ groups: groups.map((group) => stripUnsafe(
        scope.contextKind === 'public' || (group.contexts.length > 0 && group.contexts.every((row) => row.surface === 'public'))
          ? { schemaVersion: group.schemaVersion, groupKey: group.groupKey, studentId: group.studentId,
            recipientId: group.recipientId, activityId: group.activityId, bookId: group.bookId,
            attemptCount: group.attemptCount, latestAttemptId: group.latestAttemptId,
            latestResultId: group.latestResultId, latestAttemptNumber: group.latestAttemptNumber,
            latestSubmittedAt: group.latestSubmittedAt, latestCreatedAt: group.latestCreatedAt,
            latestEvaluationStatus: 'submitted', latestFeedbackRelease: 'not-applicable',
            contexts: group.contexts.map((row) => ({ contextId: row.contextId, deliveryId: row.deliveryId,
              surface: row.surface, attemptCount: row.attemptCount })) }
          : group,
      ) as BookResultGroupSummary) });
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
    readonly contextKind?: BookResultContextKind;
    readonly contextId?: string;
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
      const group = groupDetail(attempts, scope, visibility.viewer.role, options, input.env);
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
    readonly contextKind?: BookResultContextKind;
    readonly contextId?: string;
  }) => {
    try {
      const scope = queryInput(input);
      const visibility = await authorize({ ...input, scope });
      const read = repositoryMethod(options.repository, 'readResultDetail', 'readDetail');
      const detail = await read({ ...scope, resultId: safeId(input.resultId, 'result_id') }) as BookResultDetail | null;
      if (!detail) return body({ code: 'book_result_not_found' }, 404);
      assertBookResultVisible(visibility, scope, detail);
      return body({ detail: safeDetail(detail, visibility.viewer.role, options, input.env) });
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
