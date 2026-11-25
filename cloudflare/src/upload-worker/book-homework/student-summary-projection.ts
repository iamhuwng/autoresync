import { createFirebaseClaimTokenProvider } from '../book-activity-authoring/firebase-token.ts';
import { FirebaseRtdbRestClient } from '../listening-authoring/rtdb.ts';
import {
  BookHomeworkCompletionRepositoryError,
  type BookHomeworkCompletionProjection,
  type BookHomeworkCompletionRepositoryEnv,
  type BookHomeworkTerminalFact,
} from './completion-repository.ts';

export const STUDENT_BOOK_HOMEWORK_SUMMARIES_ROOT = 'student_book_homework_summaries' as const;
export const STUDENT_BOOK_HOMEWORK_SUMMARY_SCHEMA_VERSION = 1 as const;

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const MAX_RETRIES = 5;
const BANNED_SUMMARY_KEYS = new Set([
  'answerKey',
  'response',
  'credentials',
  'privateObjectKey',
  'pdfBytes',
]);

export interface StudentBookHomeworkSummaryScore {
  readonly earnedScore: number;
  readonly maximumScore: number;
  readonly displayScore?: string;
}

export interface StudentBookHomeworkSummaryActivity {
  readonly activityId: string;
  readonly order: number;
  readonly submitted: boolean;
  readonly submittedAt: number;
  readonly gradingState: 'ungraded' | 'scored' | 'review_required';
  readonly score?: StudentBookHomeworkSummaryScore;
}

export interface StudentBookHomeworkSummary {
  readonly schemaVersion: typeof STUDENT_BOOK_HOMEWORK_SUMMARY_SCHEMA_VERSION;
  readonly studentId: string;
  readonly homeworkId: string;
  readonly bookId: string | null;
  readonly status: 'not_started' | 'in_progress' | 'completed';
  readonly isComplete: boolean;
  readonly submittedCount: number;
  readonly requiredCount: number;
  readonly scoredCount: number;
  readonly pendingReviewCount: number;
  readonly latestSubmittedAt: number;
  readonly updatedAt: number;
  readonly activities: ReadonlyArray<StudentBookHomeworkSummaryActivity>;
}

export interface BuildStudentBookHomeworkSummaryInput {
  readonly studentId: string;
  readonly homeworkId: string;
  readonly bookId?: string | null;
  readonly projection: BookHomeworkCompletionProjection;
  readonly facts?:
    | Readonly<Record<string, BookHomeworkTerminalFact>>
    | readonly BookHomeworkTerminalFact[];
  readonly nowMs?: number;
}

export interface WriteStudentBookHomeworkSummaryInput {
  readonly env: BookHomeworkCompletionRepositoryEnv;
  readonly summary: StudentBookHomeworkSummary;
  readonly fetchImpl?: typeof fetch;
  readonly getAccessToken?: () => Promise<string>;
  readonly maxRetries?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

function assertSafeId(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new BookHomeworkCompletionRepositoryError(`student_homework_summary_${label}_invalid`);
  }
}

const parseEpochMs = (createdAt: unknown): number => {
  if (typeof createdAt !== 'string' || createdAt.trim() === '') return 0;
  const parsed = Date.parse(createdAt);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const compareFactsDesc = (
  left: BookHomeworkTerminalFact,
  right: BookHomeworkTerminalFact,
): number => {
  const attemptDiff = (right.attemptNumber ?? 0) - (left.attemptNumber ?? 0);
  if (attemptDiff !== 0) return attemptDiff;
  return (right.createdAt ?? '').localeCompare(left.createdAt ?? '');
};

const normalizeFactsCollection = (
  facts: BuildStudentBookHomeworkSummaryInput['facts'],
): {
  readonly byKey: Readonly<Record<string, BookHomeworkTerminalFact>>;
  readonly list: readonly BookHomeworkTerminalFact[];
} => {
  if (!facts) return { byKey: {}, list: [] };
  if (Array.isArray(facts)) {
    return { byKey: {}, list: facts };
  }
  const record = facts as Readonly<Record<string, BookHomeworkTerminalFact>>;
  return {
    byKey: record,
    list: Object.values(record),
  };
};

const matchTerminalFact = (
  activity: BookHomeworkCompletionProjection['activities'][number],
  bindingRevision: number,
  factsByKey: Readonly<Record<string, BookHomeworkTerminalFact>>,
  factList: readonly BookHomeworkTerminalFact[],
): BookHomeworkTerminalFact | undefined => {
  if (!activity.submitted) return undefined;

  if (activity.terminalId !== undefined) {
    const direct = factsByKey[activity.terminalId];
    if (direct) return direct;

    const byTerminalId = factList.find((fact) => (
      fact.terminalId === activity.terminalId
      || fact.completionId === activity.terminalId
      || fact.resultId === activity.terminalId
      || fact.attemptId === activity.terminalId
    ));
    if (byTerminalId) return byTerminalId;
  }

  const slotMatches = factList.filter((fact) => (
    fact.placementId === activity.placementId
    && fact.activityId === activity.activityId
  ));
  if (slotMatches.length > 0) {
    const exactRevisionMatches = slotMatches.filter((fact) => (
      fact.bindingRevision === bindingRevision
      && fact.activityVersionId === activity.activityVersionId
    ));
    const candidates = exactRevisionMatches.length > 0 ? exactRevisionMatches : slotMatches;
    return [...candidates].sort(compareFactsDesc)[0];
  }

  return undefined;
};

const stripUndefinedDeep = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((entry) => stripUndefinedDeep(entry)) as unknown as T;
  }
  if (isRecord(value)) {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined) continue;
      if (BANNED_SUMMARY_KEYS.has(key)) {
        throw new BookHomeworkCompletionRepositoryError('student_homework_summary_unsafe_field');
      }
      output[key] = stripUndefinedDeep(entry);
    }
    return output as T;
  }
  return value;
};

export const buildStudentBookHomeworkSummary = (
  input: BuildStudentBookHomeworkSummaryInput,
): StudentBookHomeworkSummary => {
  assertSafeId(input.studentId, 'student_id');
  assertSafeId(input.homeworkId, 'homework_id');

  if (!isRecord(input.projection)
    || input.projection.recipientId !== input.studentId
    || input.projection.contextId !== input.homeworkId) {
    throw new BookHomeworkCompletionRepositoryError('student_homework_summary_context_mismatch');
  }

  const rawBookId = input.bookId ?? null;
  let bookId: string | null = null;
  if (rawBookId !== null) {
    const trimmed = rawBookId.trim();
    if (trimmed !== '') {
      assertSafeId(trimmed, 'book_id');
      bookId = trimmed;
    }
  }

  const updatedAt = input.nowMs !== undefined ? input.nowMs : Date.now();
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt) || updatedAt < 0) {
    throw new BookHomeworkCompletionRepositoryError('student_homework_summary_updated_at_invalid');
  }

  const { byKey, list } = normalizeFactsCollection(input.facts);
  let latestSubmittedAt = 0;
  let scoredCount = 0;
  let pendingReviewCount = 0;

  const activities: StudentBookHomeworkSummaryActivity[] = input.projection.activities.map((activity) => {
    if (!activity.submitted) {
      return {
        activityId: activity.activityId,
        order: activity.order,
        submitted: false,
        submittedAt: 0,
        gradingState: 'ungraded',
      };
    }

    const matchedFact = matchTerminalFact(
      activity,
      input.projection.bindingRevision,
      byKey,
      list,
    );
    const submittedAt = parseEpochMs(matchedFact?.createdAt);
    if (submittedAt > latestSubmittedAt) {
      latestSubmittedAt = submittedAt;
    }

    const effectiveFeedbackPolicy = activity.feedbackPolicy ?? matchedFact?.feedbackPolicy;
    const isManualFeedback = effectiveFeedbackPolicy === 'manual';

    const gradingState: StudentBookHomeworkSummaryActivity['gradingState'] = isManualFeedback
      ? 'ungraded'
      : activity.gradingState;

    const score: StudentBookHomeworkSummaryScore | undefined = (
      !isManualFeedback
      && gradingState === 'scored'
      && activity.score !== undefined
    )
      ? {
        earnedScore: activity.score.earnedScore,
        maximumScore: activity.score.maximumScore,
        ...(activity.score.displayScore !== undefined
          ? { displayScore: activity.score.displayScore }
          : {}),
      }
      : undefined;

    if (gradingState === 'scored') {
      scoredCount += 1;
    } else if (gradingState === 'review_required') {
      pendingReviewCount += 1;
    }

    return {
      activityId: activity.activityId,
      order: activity.order,
      submitted: true,
      submittedAt,
      gradingState,
      ...(score !== undefined ? { score } : {}),
    };
  });

  const summary: StudentBookHomeworkSummary = {
    schemaVersion: STUDENT_BOOK_HOMEWORK_SUMMARY_SCHEMA_VERSION,
    studentId: input.studentId,
    homeworkId: input.homeworkId,
    bookId,
    status: input.projection.completion.status,
    isComplete: input.projection.completion.isComplete,
    submittedCount: input.projection.completion.submittedCount,
    requiredCount: input.projection.completion.requiredCount,
    scoredCount,
    pendingReviewCount,
    latestSubmittedAt,
    updatedAt,
    activities,
  };

  return stripUndefinedDeep(summary);
};

export const studentBookHomeworkSummaryPath = (
  studentId: string,
  homeworkId: string,
): string => {
  assertSafeId(studentId, 'student_id');
  assertSafeId(homeworkId, 'homework_id');
  return `${STUDENT_BOOK_HOMEWORK_SUMMARIES_ROOT}/${studentId}/${homeworkId}`;
};

export const writeStudentBookHomeworkSummary = async (
  input: WriteStudentBookHomeworkSummaryInput,
): Promise<void> => {
  const { env, summary } = input;
  if (!isRecord(summary)
    || summary.schemaVersion !== STUDENT_BOOK_HOMEWORK_SUMMARY_SCHEMA_VERSION) {
    throw new BookHomeworkCompletionRepositoryError('student_homework_summary_invalid');
  }
  const path = studentBookHomeworkSummaryPath(summary.studentId, summary.homeworkId);
  const payload = stripUndefinedDeep(summary);

  const identity = env.BOOK_HOMEWORK_COMPLETION_SERVICE_IDENTITY?.trim()
    || env.BOOK_RUNTIME_SERVICE_IDENTITY?.trim();
  if (!identity) {
    throw new BookHomeworkCompletionRepositoryError('missing_homework_completion_service_identity');
  }

  const keyJson = (
    env.BOOK_HOMEWORK_COMPLETION_GOOGLE_SA_KEY
    || env.BOOK_RUNTIME_GOOGLE_SA_KEY
  )?.trim();
  if (!keyJson && !input.getAccessToken) {
    throw new BookHomeworkCompletionRepositoryError('missing_homework_completion_google_sa_key');
  }
  if (keyJson) {
    let clientEmail: unknown;
    try {
      clientEmail = (JSON.parse(keyJson) as Record<string, unknown>).client_email;
    } catch {
      throw new BookHomeworkCompletionRepositoryError('invalid_homework_completion_google_sa_key');
    }
    if (clientEmail !== identity) {
      throw new BookHomeworkCompletionRepositoryError('homework_completion_service_identity_mismatch');
    }
  }

  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const rtdb = input.getAccessToken
    ? new FirebaseRtdbRestClient({
      env: { ...env, GOOGLE_SA_KEY: undefined },
      fetchImpl,
      getAccessToken: input.getAccessToken,
      firebaseAuthToken: true,
    })
    : (() => {
      const getFirebaseAuthToken = createFirebaseClaimTokenProvider({
        serviceAccountJson: keyJson!,
        serviceIdentity: identity,
        firebaseProjectId: env.FIREBASE_PROJECT_ID?.trim() ?? '',
        firebaseWebApiKey: env.FIREBASE_WEB_API_KEY?.trim() ?? '',
        fetchImpl,
      });
      return new FirebaseRtdbRestClient({
        env: { ...env, GOOGLE_SA_KEY: undefined },
        fetchImpl,
        firebaseAuthToken: true,
        getFirebaseAuthToken: async ({ path: targetPath } = { path: '' }) => {
          const match = /^student_book_homework_summaries\/([A-Za-z0-9][A-Za-z0-9._:@-]{0,159})\/([A-Za-z0-9][A-Za-z0-9._:@-]{0,159})$/u.exec(targetPath);
          if (!match || match[1] !== summary.studentId || match[2] !== summary.homeworkId) {
            throw new BookHomeworkCompletionRepositoryError('student_homework_summary_claim_context_unavailable');
          }
          return getFirebaseAuthToken({
            service: 'book_runtime',
            recipientId: match[1],
            contextId: match[2],
          });
        },
      });
    })();

  const maxRetries = Math.max(1, Math.min(8, input.maxRetries ?? MAX_RETRIES));
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const current = await rtdb.readWithEtag<unknown>(path);
    if (await rtdb.writeIfMatch(path, payload, current.etag)) {
      return;
    }
  }
  throw new BookHomeworkCompletionRepositoryError('student_homework_summary_cas_retries_exhausted');
};
