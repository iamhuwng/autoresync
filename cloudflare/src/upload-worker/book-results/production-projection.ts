import type { BookDeliveryBinding } from '../../../../src/services/book-delivery/bookDelivery.types.ts';
import { bookDeliveryDocumentRouteKey } from '../../../../src/services/book-delivery/bookDelivery.service.ts';
import { historicalSourceUnavailableProjection, projectBookAttemptSourceContext } from '../../../../src/services/book-delivery/attemptSourceContextProjection.service.ts';
import type { BookAttemptSourceContextProjection } from '../../../../src/services/book-delivery/attemptSourceContextProjection.types.ts';
import type { BookAssemblyPublicationScope } from '../../../../src/services/book-assembly/publicationRepository.ts';
import type { BookAssemblyPublicationResult } from '../../../../src/services/book-assembly/publicationTransaction.service.ts';
import { resolveCombinedDocument } from '../book-homework/canonical-resolver.ts';
import {
  projectBookResultAttempt,
} from '../../../../src/services/book-activity/results/bookResultProjection.service.ts';
import {
  bookResultGroupKey,
  type BookResultProjection,
} from '../../../../src/services/book-activity/results/bookResult.types.ts';
import {
  bookResultAttemptsPath,
  bookResultDetailPath,
  bookResultGroupsPath,
} from './repository.ts';
import type {
  BookResultAttemptSummary,
  BookResultGroupSummary,
} from './types.ts';
import type { BookRuntimeTerminalTuple } from '../book-runtime/repository.ts';
import {
  FirebaseRtdbRestClient,
  type RepositoryEnv,
} from '../listening-authoring/rtdb.ts';
import {
  createFirebaseClaimTokenProvider,
  type BookFirebaseClaimTuple,
} from '../book-activity-authoring/firebase-token.ts';

export class BookResultProjectionError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'BookResultProjectionError';
  }
}

export interface BookResultProjectionWriter {
  write(input: {
    readonly bookId: string;
    readonly projection: BookResultProjection;
  }): Promise<void>;
}

export interface BookResultProjectionInput {
  readonly binding: BookDeliveryBinding;
  readonly terminal: BookRuntimeTerminalTuple;
  readonly attemptSourceContext?: BookAttemptSourceContextProjection;
}

export const projectCommittedBookSourceContext = (
  input: BookResultProjectionInput & { readonly publicationScope?: BookAssemblyPublicationScope<BookAssemblyPublicationResult> },
): BookAttemptSourceContextProjection => {
  const { binding, terminal } = input;
  try {
    let combinedDocument;
    if (binding.sourceSet.strategy === 'component_pdfs') {
      const scope = input.publicationScope;
      const version = scope?.versions?.[binding.book.manifestVersionId];
      if (!scope || !version || version.manifestVersionId !== binding.book.manifestVersionId || version.bookId !== binding.book.bookId
        || version.ownerId !== binding.issuer.ownerId || version.lifecycle !== 'published'
        || version.publicationId !== binding.book.publicationId
        || version.publicationRevision !== binding.book.publicationRevision
        || version.bookRevision !== binding.book.bookRevision) return historicalSourceUnavailableProjection();
      combinedDocument = {
        descriptor: resolveCombinedDocument(scope, binding.book.manifestVersionId),
        opaqueRouteKey: bookDeliveryDocumentRouteKey(binding, 'student-document', 'student-document'),
      };
    }
    return projectBookAttemptSourceContext({
      attempt: terminal.attempt, result: terminal.result, historicalDelivery: { binding },
      sources: binding.sourceSet.sources.map(source => ({
        sourceKey: source.sourceKey, sourceVersionId: source.sourceVersionId,
        availability: 'available' as const,
        documentRequest: { ...source, opaqueRouteKey: bookDeliveryDocumentRouteKey(binding, source.sourceKey, source.sourceVersionId) },
      })),
      ...(combinedDocument ? { combinedDocument } : {}),
    });
  } catch {
    return historicalSourceUnavailableProjection('malformed_context');
  }
};

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const GROUP_KEY = /^g_[A-Za-z0-9_-]{4,638}$/u;
const MAX_ATTEMPTS = 50;
const MAX_RETRIES = 5;
const UNSAFE = new Set([
  'answerKey', 'pdfBytes', 'provider', 'providerAuthority', 'providerFileId',
  'providerFileVersionId', 'storage', 'storageKey', 'bucket', 'objectKey',
  'privateObjectKey', 'credentials', 'privateSourceAuthority', 'sourceAuthority',
  'signedUrl', 'downloadUrl', 'accessToken',
]);

const clone = <T>(value: T): T => structuredClone(value);
const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    // RTDB omits object properties whose value is null. Treat null and an
    // absent object property as the same value for create-only replay checks.
    return `{${Object.keys(record)
      .filter((key) => {
        const entry = record[key];
        return entry !== null
          && entry !== undefined
          && !(Array.isArray(entry) && entry.length === 0);
      })
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};
const safeId = (value: string, label: string): string => {
  if (!ID.test(value) || value === '.' || value === '..') {
    throw new BookResultProjectionError(`book_result_${label}_invalid`);
  }
  return value;
};
// Keep validated path segments raw; FirebaseRtdbRestClient performs the one
// required URL encoding at the transport boundary.
const pathId = (value: string, label: string): string => safeId(value, label);
const groupPathId = (value: string): string => {
  if (!GROUP_KEY.test(value)) throw new BookResultProjectionError('book_result_group_key_invalid');
  return value;
};

const stripUnsafe = (value: unknown, depth = 0): unknown => {
  if (depth > 8) return null;
  if (Array.isArray(value)) return value.map((entry) => stripUnsafe(entry, depth + 1));
  if (!isRecord(value)) return value;
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (UNSAFE.has(key) || /answer.?key|pdf|provider|storage|credential|private.?source/iu.test(key)) continue;
    output[key] = stripUnsafe(entry, depth + 1);
  }
  return output;
};

export const buildBookResultGroupSummary = (
  groupKey: string,
  attempts: readonly BookResultAttemptSummary[],
): BookResultGroupSummary => {
  if (attempts.length === 0 || attempts.length > MAX_ATTEMPTS) {
    throw new BookResultProjectionError('book_result_attempts_query_unbounded');
  }
  const sorted = [...attempts].sort((left, right) => (
    left.attemptNumber - right.attemptNumber
      || left.submittedAt.localeCompare(right.submittedAt)
      || left.attemptId.localeCompare(right.attemptId)
  ));
  const latest = sorted[sorted.length - 1]!;
  const contexts = new Map<string, {
    readonly contextId: string;
    readonly deliveryId: string;
    readonly surface: BookResultAttemptSummary['surface'];
    readonly attemptCount: number;
  }>();
  sorted.forEach((attempt) => {
    const key = `${attempt.deliveryContextId}|${attempt.deliveryId}`;
    const current = contexts.get(key);
    contexts.set(key, current
      ? { ...current, attemptCount: current.attemptCount + 1 }
      : {
        contextId: attempt.deliveryContextId,
        deliveryId: attempt.deliveryId,
        surface: attempt.surface,
        attemptCount: 1,
      });
  });
  return {
    schemaVersion: 1,
    groupKey,
    studentId: latest.studentId,
    recipientId: latest.recipientId,
    activityId: latest.activityId,
    ...(latest.homeworkId ? { homeworkId: latest.homeworkId } : {}),
    bookId: latest.bookId,
    attemptCount: sorted.length,
    latestAttemptId: latest.attemptId,
    latestResultId: latest.resultId,
    latestAttemptNumber: latest.attemptNumber,
    latestSubmittedAt: latest.submittedAt,
    latestCreatedAt: latest.createdAt,
    latestEvaluationStatus: latest.evaluationStatus,
    latestFeedbackRelease: latest.feedback.release,
    contexts: [...contexts.values()],
  };
};

const assertIndexedAttempt = (value: unknown): value is BookResultAttemptSummary => {
  if (!isRecord(value)
    || value.schemaVersion !== 1
    || typeof value.bookId !== 'string'
    || typeof value.studentId !== 'string'
    || typeof value.recipientId !== 'string'
    || value.studentId !== value.recipientId
    || typeof value.activityId !== 'string'
    || typeof value.attemptId !== 'string'
    || typeof value.resultId !== 'string'
    || typeof value.attemptNumber !== 'number'
    || !Number.isSafeInteger(value.attemptNumber)
    || value.attemptNumber <= 0
    || !ID.test(value.bookId)
    || !ID.test(value.studentId)
    || !ID.test(value.activityId)
    || !ID.test(value.attemptId)
    || !ID.test(value.resultId)) {
    throw new BookResultProjectionError('book_result_index_invalid');
  }
  return true;
};

const assertTerminalBinding = (
  binding: BookDeliveryBinding,
  terminal: BookRuntimeTerminalTuple,
): void => {
  const { attempt, result, completion, index } = terminal;
  const expectedPlacement = binding.placements.find((entry) => entry.placementId === attempt.placementId);
  if (binding.schemaVersion !== 3
    || binding.status !== 'active'
    || !['solo', 'public', 'homework', 'course', 'class'].includes(binding.context.kind)
    || binding.context.recipientId !== attempt.recipientId
    || binding.context.contextId !== attempt.contextId
    || binding.bindingId !== attempt.bindingId
    || binding.revision !== attempt.bindingRevision
    || !expectedPlacement
    || expectedPlacement.activityId !== attempt.activityId
    || expectedPlacement.activityVersion !== attempt.activityVersion
    || expectedPlacement.activityVersionId !== attempt.activityVersionId
    || result.attemptId !== attempt.attemptId
    || completion.attemptId !== attempt.attemptId
    || index.attemptId !== attempt.attemptId
    || result.resultId !== `${attempt.attemptId}:result`
    || completion.completionId !== `${attempt.attemptId}:completion`
    || completion.resultId !== result.resultId
    || index.resultId !== result.resultId
    || result.status !== 'submitted' && result.status !== 'pending_review'
    || completion.status !== 'completed') {
    throw new BookResultProjectionError('book_result_terminal_context_invalid');
  }
  safeId(binding.book.bookId, 'book_id');
};

export const projectCommittedBookResult = async (
  input: BookResultProjectionInput & { readonly writer: BookResultProjectionWriter },
): Promise<BookResultProjection> => {
  assertTerminalBinding(input.binding, input.terminal);
  const kind = input.binding.context.kind;
  if (kind !== 'public' && kind !== 'solo' && kind !== 'homework' && kind !== 'course' && kind !== 'class') {
    throw new BookResultProjectionError('book_result_terminal_context_invalid');
  }
  const { attempt, result, completion, index } = input.terminal;
  // The runtime boundary is intentionally stricter than the projection
  // service's historical terminal contract. Keep that extra submission
  // boundary in canonical Runtime, but do not persist or pass it through.
  const projectable = {
    attempt: (({ submissionScope: _scope, requiredInteractionIds: _required,
      submittedInteractionIds: _submitted, ...value }) => value)(attempt),
    result: (({ submissionScope: _scope, requiredInteractionIds: _required,
      submittedInteractionIds: _submitted, ...value }) => value)(result),
    completion: (({ submissionScope: _scope, requiredInteractionIds: _required,
      submittedInteractionIds: _submitted, ...value }) => value)(completion),
    index: (({ submissionScope: _scope, requiredInteractionIds: _required,
      submittedInteractionIds: _submitted, ...value }) => value)(index),
  };
  const projection = projectBookResultAttempt({
    ...projectable,
    ...(input.attemptSourceContext ? { attemptSourceContext: input.attemptSourceContext } : {}),
    context: {
      kind,
      contextId: input.binding.context.contextId,
      deliveryId: input.binding.bindingId,
      ownerId: input.binding.context.ownerId,
      ...(kind === 'homework' ? { homeworkId: input.binding.context.contextId } : {}),
    },
  } as Parameters<typeof projectBookResultAttempt>[0] & {
    readonly context: NonNullable<Parameters<typeof projectBookResultAttempt>[0]['context']>;
  });
  await input.writer.write({ bookId: input.binding.book.bookId, projection });
  return projection;
};

interface ResultProjectionEnv extends RepositoryEnv {
  readonly BOOK_RESULT_READ_GOOGLE_SA_KEY?: string;
  readonly BOOK_RESULT_READ_SERVICE_IDENTITY?: string;
}

const resultClaimForPath = (path: string): BookFirebaseClaimTuple => {
  const scoped = /^book_result_read_models\/contexts\/(public|course|class)\/([^/]+)\/students\/([^/]+)\/books\/([^/]+)\/(?:group_summaries|group_attempts)(?:\/([^/]+))?(?:\/([^/]+))?$/u.exec(path);
  if (scoped) return {
    service: 'book_result_read', contextKind: scoped[1] as 'public' | 'course' | 'class', contextId: scoped[2]!,
    studentId: scoped[3]!, bookId: scoped[4]!,
    ...(scoped[5] ? { groupKey: scoped[5] } : {}), ...(scoped[6] ? { resultId: scoped[6] } : {}),
  };
  let match = /^book_result_read_models\/details\/([^/]+)$/u.exec(path);
  if (match) return { service: 'book_result_read', resultId: decodeURIComponent(match[1]!) };
  match = /^book_result_read_models\/students\/([^/]+)\/books\/([^/]+)\/group_summaries(?:\/([^/]+))?$/u.exec(path);
  if (match) return {
    service: 'book_result_read',
    studentId: decodeURIComponent(match[1]!),
    bookId: decodeURIComponent(match[2]!),
    ...(match[3] ? { groupKey: decodeURIComponent(match[3]!) } : {}),
  };
  match = /^book_result_read_models\/students\/([^/]+)\/books\/([^/]+)\/group_attempts\/([^/]+)(?:\/([^/]+))?$/u.exec(path);
  if (match) return {
    service: 'book_result_read',
    studentId: decodeURIComponent(match[1]!),
    bookId: decodeURIComponent(match[2]!),
    groupKey: decodeURIComponent(match[3]!),
    ...(match[4] ? { resultId: decodeURIComponent(match[4]!) } : {}),
  } as BookFirebaseClaimTuple;
  match = /^book_result_read_models\/homework\/([^/]+)\/students\/([^/]+)\/books\/([^/]+)\/group_summaries(?:\/([^/]+))?$/u.exec(path);
  if (match) return {
    service: 'book_result_read',
    homeworkId: decodeURIComponent(match[1]!),
    studentId: decodeURIComponent(match[2]!),
    bookId: decodeURIComponent(match[3]!),
    ...(match[4] ? { groupKey: decodeURIComponent(match[4]!) } : {}),
  };
  match = /^book_result_read_models\/homework\/([^/]+)\/students\/([^/]+)\/books\/([^/]+)\/group_attempts\/([^/]+)(?:\/([^/]+))?$/u.exec(path);
  if (match) return {
    service: 'book_result_read',
    homeworkId: decodeURIComponent(match[1]!),
    studentId: decodeURIComponent(match[2]!),
    bookId: decodeURIComponent(match[3]!),
    groupKey: decodeURIComponent(match[4]!),
    ...(match[5] ? { resultId: decodeURIComponent(match[5]!) } : {}),
  } as BookFirebaseClaimTuple;
  throw new BookResultProjectionError('book_result_projection_path_invalid');
};

export const createFirebaseBookResultProjectionWriter = (
  env: ResultProjectionEnv,
  fetchImpl: typeof fetch = globalThis.fetch,
): BookResultProjectionWriter => {
  const identity = env.BOOK_RESULT_READ_SERVICE_IDENTITY?.trim() ?? '';
  const serviceAccountJson = env.BOOK_RESULT_READ_GOOGLE_SA_KEY?.trim() ?? '';
  if (!identity || !serviceAccountJson) {
    throw new BookResultProjectionError('book_result_projection_authority_unavailable');
  }
  const tokenProvider = createFirebaseClaimTokenProvider({
    serviceAccountJson,
    serviceIdentity: identity,
    firebaseProjectId: env.FIREBASE_PROJECT_ID?.trim() ?? '',
    firebaseWebApiKey: env.FIREBASE_WEB_API_KEY?.trim() ?? '',
    fetchImpl,
  });
  const rtdb = new FirebaseRtdbRestClient({
    env,
    fetchImpl,
    firebaseAuthToken: true,
    getFirebaseAuthToken: ({ path } = { path: '' }) => tokenProvider(resultClaimForPath(path)),
  });

  const putIfAbsent = async (path: string, value: unknown, conflictCode: string, client = rtdb): Promise<void> => {
    const current = await client.readWithEtag<unknown>(path);
    if (current.data !== null && stable(current.data) !== stable(value)) {
      throw new BookResultProjectionError(conflictCode);
    }
    if (current.data === null && !(await client.writeIfMatch(path, value, current.etag))) {
      const afterLostCas = await client.readWithEtag<unknown>(path);
      if (afterLostCas.data !== null && stable(afterLostCas.data) === stable(value)) return;
      if (afterLostCas.data !== null) throw new BookResultProjectionError(conflictCode);
      throw new BookResultProjectionError('book_result_projection_cas_conflict');
    }
  };

  return {
    async write({ bookId, projection }) {
      const summary = {
        ...clone(projection.summary),
        bookId,
      } as BookResultAttemptSummary;
      const detail = {
        ...clone(projection.detail),
        bookId,
        response: stripUnsafe(projection.detail.response),
      } as BookResultAttemptSummary & { response: unknown };
      const groupKey = bookResultGroupKey(summary.studentId, summary.activityId);
      const contextKind = summary.surface === 'public' || summary.surface === 'course' || summary.surface === 'class' ? summary.surface : undefined;
      const detailClient = contextKind ? new FirebaseRtdbRestClient({ env, fetchImpl, firebaseAuthToken: true,
        getFirebaseAuthToken: () => tokenProvider({ service: 'book_result_read', contextKind,
          contextId: summary.contextId, studentId: summary.studentId, bookId, resultId: summary.resultId }),
      }) : rtdb;
      await putIfAbsent(bookResultDetailPath(summary.resultId), detail, 'book_result_detail_conflict', detailClient);
      const scopes = contextKind
        ? [{ contextKind, contextId: summary.contextId, studentId: summary.studentId, bookId }]
        : [{ studentId: summary.studentId, bookId }, ...(summary.homeworkId
        ? [{ homeworkId: summary.homeworkId, studentId: summary.studentId, bookId }]
        : [])];
      for (const scope of scopes) {
        const attemptsPath = bookResultAttemptsPath({ ...scope, groupKey });
        const attemptPath = `${attemptsPath}/${pathId(summary.resultId, 'result_id')}`;
        await putIfAbsent(attemptPath, summary, 'book_result_projection_conflict');
        const groupPath = `${bookResultGroupsPath(scope)}/${groupPathId(groupKey)}`;
        let committed = false;
        for (let retry = 0; retry < MAX_RETRIES; retry += 1) {
          // Observe the group before its bounded attempt index. If another
          // writer commits between these reads, its CAS must fail and force a
          // fresh observation rather than accepting a stale summary.
          const currentGroup = await rtdb.readWithEtag<unknown>(groupPath);
          const rows = await rtdb.readValue(attemptsPath, {
            orderBy: '$key',
            limitToFirst: MAX_ATTEMPTS + 1,
          });
          const indexed = (Array.isArray(rows) ? rows : isRecord(rows) ? Object.values(rows) : [])
            .map((row) => {
              assertIndexedAttempt(row);
              return row;
            })
            .filter((row) => row.studentId === summary.studentId
              && row.bookId === bookId
              && bookResultGroupKey(row.studentId, row.activityId) === groupKey
              && (!('homeworkId' in scope) || scope.homeworkId === undefined || row.homeworkId === scope.homeworkId)
              && (!('contextKind' in scope) || row.surface === scope.contextKind && row.contextId === scope.contextId)) as BookResultAttemptSummary[];
          const candidates = indexed.some((row) => row.resultId === summary.resultId)
            ? indexed
            : [...indexed, summary];
          const nextGroup = buildBookResultGroupSummary(groupKey, candidates);
          if (currentGroup.data !== null && stable(currentGroup.data) !== stable(nextGroup)) {
            // A concurrent writer may have added an attempt after the group
            // read; the stale ETag makes this CAS fail and retries the full
            // observation sequence.
            if (await rtdb.writeIfMatch(groupPath, nextGroup, currentGroup.etag)) {
              committed = true;
              break;
            }
            continue;
          }
          if (currentGroup.data !== null || await rtdb.writeIfMatch(groupPath, nextGroup, currentGroup.etag)) {
            committed = true;
            break;
          }
        }
        if (!committed) throw new BookResultProjectionError('book_result_projection_cas_conflict');
      }
    },
  };
};
