import type { BookRouteHandlersOptions } from '../book-route-handlers.ts';
import type { BookRouterEnv } from '../book-router.ts';
import type { BookActivityEvaluationActor, BookActivityEvaluationCommand, BookActivityEvaluationTarget } from '../../../../src/services/book-activity/activityEvaluation.types.ts';
import type { BookActivityEvaluationDependencies } from '../../../../src/services/book-activity/activityEvaluation.service.ts';
import { createBookActivityEvaluationCommandHandler } from './command.ts';
import { readImmutableBookActivityEvaluationHistory } from './immutable-history.ts';
import { FirebaseRestBookActivityEvaluationRepository } from './repository.ts';
import { FirebaseRestBookRuntimeRepository } from '../book-runtime/repository.ts';
import { FirebaseRestBookDeliveryRepository } from '../book-delivery/repository.ts';
import { FirebaseRtdbRestClient } from '../listening-authoring/rtdb.ts';
import { CANONICAL_ACTIVITY_VERSION_ROOT, hydrateCanonicalActivityVersionFromRtdb } from '../book-assembly/canonical-activity-version-repository.ts';
import { assertCanonicalPublishedActivityVersion } from '../../../../src/services/book-assembly/canonicalActivityVersion.service.ts';
import { createBookResultReadProductionHandlers } from '../book-results/production-composition.ts';
import { projectBookActivityStudentResult } from '../../../../src/services/book-activity/bookResultVisibility.service.ts';
import { canonicalActivityEvaluationFingerprint } from '../../../../src/services/book-activity/activityEvaluation.types.ts';
import { isBookActivityEvaluationTarget } from '../../../../src/services/book-activity/activityEvaluation.service.ts';
import { BOOK_EVALUATION_HISTORY_QUERY_KEYS } from './route.ts';

type Input = { request: Request; env: BookRouterEnv; uid: string; bookId?: string; studentId?: string };
type HistoryAccess = {
  readonly role: 'teacher' | 'student';
  readonly feedbackReleased: boolean;
  /** Correction fact already exposed by the trusted Results release projection. */
  readonly releasedCorrectionNote?: string;
};
export interface BookActivityEvaluationProductionDependencies {
  createDependencies(env: BookRouterEnv): BookActivityEvaluationDependencies;
  resolveActor(input: Input, command: BookActivityEvaluationCommand): Promise<BookActivityEvaluationActor | null>;
  resolveHistoryAttempt(input: Input): Promise<{
    readonly target: BookActivityEvaluationTarget;
    readonly response: unknown;
    readonly access: HistoryAccess;
  } | null>;
}
const out = (body: unknown, status = 200) => ({ body, init: { status } as ResponseInit });
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;

export const createBookActivityEvaluationProductionHandlers = (
  dependencies?: BookActivityEvaluationProductionDependencies,
): NonNullable<BookRouteHandlersOptions['evaluationHandlers']> => {
  const command = async (input: Input) => {
    if (!dependencies) return out({ code: 'evaluation_dependencies_unavailable' }, 503);
    try {
      const envelope = await input.request.json() as { command?: BookActivityEvaluationCommand };
      if (!envelope.command) return out({ code: 'evaluation_command_malformed' }, 400);
      // Firebase users are not the trusted scorer identity. Objective history
      // invocation remains held until a separate inbound service boundary exists.
      if (envelope.command.kind === 'evaluate_objective' || envelope.command.kind === 'regrade_objective') {
        return out({ code: 'evaluation_trusted_scorer_required' }, 403);
      }
      const actor = await dependencies.resolveActor(input, envelope.command);
      if (!actor) return out({ code: 'evaluation_actor_unauthorized' }, 403);
      const result = await createBookActivityEvaluationCommandHandler(dependencies.createDependencies(input.env))(
        envelope.command, actor,
      );
      return out(result, result.status !== 'rejected' ? 200
        : result.code === 'evaluation_stale_revision' || result.code === 'evaluation_replay_conflict' ? 409
          : result.code === 'evaluation_actor_unauthorized' ? 403 : 400);
    } catch { return out({ code: 'evaluation_command_malformed' }, 400); }
  };
  const history = async (input: Input) => {
    if (!dependencies) return out({ code: 'evaluation_dependencies_unavailable' }, 503);
    try {
      const query = new URL(input.request.url).searchParams;
      const view = query.get('view');
      const idKeys = ['contextId', 'placementId', 'activityId', 'activityVersionId', 'attemptId', 'terminalId'];
      const allowedKeys = new Set(BOOK_EVALUATION_HISTORY_QUERY_KEYS);
      if (!ID.test(input.bookId ?? '') || !ID.test(input.studentId ?? '') || !['teacher', 'student'].includes(view ?? '')
        || [...query.keys()].some((key) => !allowedKeys.has(key) || query.getAll(key).length !== 1)
        || idKeys.some((key) => query.has(key) && !ID.test(query.get(key)!))
        || !['homework', 'course', 'class'].includes(query.get('contextKind') ?? '')
        || ['contextId', 'placementId', 'activityId', 'activityVersionId'].some((key) => !query.get(key))) {
        return out({ code: 'evaluation_attempt_not_found' }, 404);
      }
      const resolved = await dependencies.resolveHistoryAttempt(input);
      if (!resolved) return out({ code: 'evaluation_actor_unauthorized' }, 403);
      const { target, access, response } = resolved;
      if (!isBookActivityEvaluationTarget(target) || target.recipientId !== input.studentId || access.role !== view
        || ['contextKind', 'contextId', 'placementId', 'activityId', 'activityVersionId'].some((key) => (
          target[key as keyof BookActivityEvaluationTarget] !== query.get(key)
        ))
        || (query.has('attemptId') && target.attemptId !== query.get('attemptId'))
        || (view === 'student' && input.uid !== target.recipientId)) {
        return out({ code: 'evaluation_actor_unauthorized' }, 403);
      }
      const rows = await readImmutableBookActivityEvaluationHistory(
        dependencies.createDependencies(input.env).repository, { target },
      );
      const current = rows.at(-1) ?? null;
      const correctionNote = current?.facts.correctionFacts.map((fact) => fact.note?.trim())
        .filter((note): note is string => Boolean(note)).join(' ');
      const correctionReleased = access.feedbackReleased && Boolean(correctionNote)
        && correctionNote === access.releasedCorrectionNote;
      return out(access.role === 'teacher'
        ? { target, submission: { response }, history: rows }
        : {
          result: projectBookActivityStudentResult({
            presentationEnabled: true,
            ownership: { attemptId: target.attemptId, visible: access.feedbackReleased, viewerRole: 'student', reason: 'visible' },
            target,
            policy: {
              ...target,
              fields: {
                answerKey: 'withheld',
                correctness: access.feedbackReleased ? 'released' : 'withheld',
                score: access.feedbackReleased ? 'released' : 'withheld',
                feedback: access.feedbackReleased ? 'released' : 'withheld',
                correctionNote: correctionReleased ? 'released' : 'withheld',
              },
            },
            studentResponse: response,
            currentEvaluation: current,
            history: rows,
            // Use an actual immutable predecessor only when Results has already
            // authorized this same correction fact for the student.
            previouslyVisibleRevision: correctionReleased ? rows.at(-2)?.revision : undefined,
          }),
        });
    } catch { return out({ code: 'evaluation_history_read_failed' }, 503); }
  };
  return { command, history };
};

export const createDefaultBookActivityEvaluationProductionHandlers = () => {
  const results = createBookResultReadProductionHandlers();
  const currentBindingFor = async (env: BookRouterEnv, target: BookActivityEvaluationTarget) => {
    const delivery = new FirebaseRestBookDeliveryRepository({ env });
    const current = await delivery.resolveCurrent(target.recipientId, target.contextId);
    if (current?.record.binding.bindingId === target.bindingId
      && current.record.binding.revision === target.bindingRevision) return current.record.binding;
    return null;
  };
  const bindingForAttempt = async (env: BookRouterEnv, target: BookActivityEvaluationTarget) => {
    const current = await currentBindingFor(env, target);
    if (current) return current;
    const delivery = new FirebaseRestBookDeliveryRepository({ env });
    const historical = await delivery.readBinding(target.bindingId);
    return historical?.status === 'revoked'
      && historical.binding.revision === target.bindingRevision
      && historical.binding.recipient.recipientId === target.recipientId
      && historical.binding.context.contextId === target.contextId
      ? historical.binding : null;
  };
  const readAuthorizedOwnedTarget = async (
    env: BookRouterEnv,
    uid: string,
    bookId: string,
    target: BookActivityEvaluationTarget,
  ): Promise<Record<string, unknown> | null> => {
    const result = await results.resultDetail({
      request: new Request(`https://worker.test/v1/book-evaluation/results/${encodeURIComponent(bookId)}/${encodeURIComponent(target.recipientId)}/${target.contextKind === 'homework' ? 'homework' : `contexts/${target.contextKind}`}/${encodeURIComponent(target.contextId)}/details/${encodeURIComponent(target.resultId)}`),
      env,
      uid,
      bookId,
      studentId: target.recipientId,
      ...(target.contextKind === 'homework' ? { homeworkId: target.contextId }
        : { contextKind: target.contextKind, contextId: target.contextId }),
      resultId: target.resultId,
    }) as { readonly body?: { readonly detail?: Record<string, unknown> }; readonly init?: ResponseInit };
    const status = Number(result.init?.status ?? 200);
    if (status >= 500) throw new Error('evaluation_history_visibility_unavailable');
    if (status !== 200 || !result.body?.detail) return null;
    const detail = result.body.detail;
    if (detail.attemptId !== target.attemptId
      || detail.resultId !== target.resultId
      || detail.recipientId !== target.recipientId
      || detail.bindingId !== target.bindingId
      || detail.bindingRevision !== target.bindingRevision
      || detail.contextId !== target.contextId
      || detail.placementId !== target.placementId
      || detail.activityId !== target.activityId
      || detail.activityVersion !== target.activityVersion
      || detail.activityVersionId !== target.activityVersionId
      || detail.interactionId !== target.interactionId
      || detail.attemptNumber !== target.attemptNumber
      || JSON.stringify(detail.pageGroupKeys) !== JSON.stringify(target.pageGroupKeys)
      || JSON.stringify(detail.sourceProvenance) !== JSON.stringify(target.sourceProvenance)) return null;
    return detail;
  };
  return createBookActivityEvaluationProductionHandlers({
    createDependencies: (env) => ({
      repository: new FirebaseRestBookActivityEvaluationRepository({ env }),
      trustedScorerIdentity: String(env.BOOK_ACTIVITY_EVALUATION_SERVICE_IDENTITY ?? ''),
      resolveAttempt: async (target) => {
        const binding = await bindingForAttempt(env, target);
        const placement = binding?.placements.find((entry) => entry.placementId === target.placementId);
        if (!binding || !placement || placement.activityId !== target.activityId
          || binding.context.kind !== target.contextKind
          || placement.activityVersionId !== target.activityVersionId
          || placement.activityVersion !== target.activityVersion) return null;
        const tuples = await new FirebaseRestBookRuntimeRepository({ env }).listTerminalTuples?.({
          recipientId: target.recipientId, contextId: target.contextId,
          placementId: target.placementId, activityId: target.activityId,
          activityVersion: target.activityVersion, bindingId: target.bindingId,
          bindingRevision: target.bindingRevision, limit: 50,
        }) ?? [];
        const terminal = tuples.find((entry) => entry.attempt.attemptId === target.attemptId
          && entry.result.resultId === target.resultId);
        if (!terminal) return null;
        const raw = await new FirebaseRtdbRestClient({ env, fetchImpl: globalThis.fetch }).readValue(
          `${CANONICAL_ACTIVITY_VERSION_ROOT}/${target.activityId}/${target.activityVersionId}`,
        );
        try {
          const published = assertCanonicalPublishedActivityVersion(hydrateCanonicalActivityVersionFromRtdb(raw));
          if (published.ownerId !== binding.issuer.ownerId
            || published.activityId !== target.activityId
            || published.activityVersionId !== target.activityVersionId
            || published.activityVersion !== target.activityVersion) return null;
          return {
            attempt: terminal.attempt,
            contextKind: target.contextKind,
            activity: published.activity,
            submission: Array.isArray(terminal.attempt.response) ? terminal.attempt.response : [],
          };
        } catch { return null; }
      },
      resolveTeacherAuthority: async ({ actorUid, target }) => {
        if (target.contextKind === 'homework' || target.contextKind === 'course' || target.contextKind === 'class') {
          if (actorUid === target.recipientId) return null;
          const binding = await bindingForAttempt(env, target);
          if (!binding) return null;
          const detail = await readAuthorizedOwnedTarget(env, actorUid, binding.book.bookId, target);
          return detail ? {
            ownerId: actorUid, recipientId: target.recipientId,
            bindingId: target.bindingId, bindingRevision: target.bindingRevision,
            contextKind: target.contextKind, contextId: target.contextId,
            placementId: target.placementId, activityId: target.activityId,
            activityVersion: target.activityVersion, activityVersionId: target.activityVersionId,
          } : null;
        }
        const binding = await currentBindingFor(env, target);
        return binding && actorUid === binding.issuer.ownerId ? {
          ownerId: binding.issuer.ownerId, recipientId: target.recipientId,
          bindingId: target.bindingId, bindingRevision: target.bindingRevision,
          contextKind: target.contextKind, contextId: target.contextId,
          placementId: target.placementId, activityId: target.activityId,
          activityVersion: target.activityVersion, activityVersionId: target.activityVersionId,
        } : null;
      },
    }),
    resolveActor: async (input, command) => command.kind === 'teacher_evaluation' || command.kind === 'regrade'
      ? { kind: 'teacher', uid: input.uid } : null,
    resolveHistoryAttempt: async (input) => {
      const query = new URL(input.request.url).searchParams;
      const contextKind = query.get('contextKind') as 'homework' | 'course' | 'class';
      const contextId = query.get('contextId')!;
      const terminalId = query.get('terminalId');
      let attemptId = query.get('attemptId')
        ?? (terminalId?.endsWith(':completion') ? terminalId.slice(0, -11)
          : terminalId?.endsWith(':result') ? terminalId.slice(0, -7) : terminalId);
      if (!attemptId && input.studentId && input.bookId) {
        const current = await new FirebaseRestBookDeliveryRepository({ env: input.env })
          .resolveCurrent(input.studentId, contextId);
        const binding = current?.record.binding;
        const placement = binding?.placements.find((entry) => entry.placementId === query.get('placementId')
          && entry.activityId === query.get('activityId') && entry.activityVersionId === query.get('activityVersionId'));
        if (!binding || !placement || binding.book.bookId !== input.bookId
          || binding.context.kind !== contextKind || binding.context.contextId !== contextId
          || binding.context.recipientId !== input.studentId) return null;
        const rows = await new FirebaseRestBookRuntimeRepository({ env: input.env }).listTerminalTuples({
          recipientId: input.studentId, contextId, placementId: placement.placementId,
          activityId: placement.activityId, activityVersion: placement.activityVersion,
          bindingId: binding.bindingId, bindingRevision: binding.revision, limit: 50,
        });
        // The bounded reader cannot establish the latest attempt when truncated.
        if (rows.length >= 50) throw new Error('evaluation_history_latest_unavailable');
        attemptId = rows.filter((row) => row.attempt.activityVersionId === placement.activityVersionId)
          .sort((left, right) => right.attempt.attemptNumber - left.attempt.attemptNumber)[0]?.attempt.attemptId ?? null;
      }
      if (!attemptId || !input.bookId || !input.studentId
        || (terminalId && terminalId !== attemptId && terminalId !== `${attemptId}:completion` && terminalId !== `${attemptId}:result`)) return null;
      const resultId = `${attemptId}:result`;
      const result = await results.resultDetail({
        request: input.request, env: input.env, uid: input.uid,
        bookId: input.bookId, studentId: input.studentId, resultId,
        ...(contextKind === 'homework' ? { homeworkId: contextId } : { contextKind, contextId }),
      }) as { readonly body?: { readonly detail?: Record<string, unknown> }; readonly init?: ResponseInit };
      const status = Number(result.init?.status ?? 200);
      if (status >= 500) throw new Error('evaluation_history_visibility_unavailable');
      const detail = result.body?.detail;
      if (status !== 200 || !detail || detail.attemptId !== attemptId || detail.resultId !== resultId
        || detail.recipientId !== input.studentId || detail.contextId !== contextId
        || ['placementId', 'activityId', 'activityVersionId'].some((key) => detail[key] !== query.get(key))) return null;
      const role = input.uid === input.studentId ? 'student' : 'teacher';
      if (role === 'teacher' && detail.ownerId !== input.uid) return null;
      const tuples = await new FirebaseRestBookRuntimeRepository({ env: input.env }).listTerminalTuples({
        recipientId: input.studentId, contextId, placementId: String(detail.placementId),
        activityId: String(detail.activityId), activityVersion: Number(detail.activityVersion),
        bindingId: String(detail.bindingId), bindingRevision: Number(detail.bindingRevision), limit: 50,
      });
      const terminal = tuples.find((row) => row.attempt.attemptId === attemptId && row.result.resultId === resultId);
      if (!terminal) return null;
      const attempt = terminal.attempt;
      const target: BookActivityEvaluationTarget = {
        attemptId: attempt.attemptId, resultId: terminal.result.resultId, recipientId: attempt.recipientId,
        bindingId: attempt.bindingId, bindingRevision: attempt.bindingRevision, contextKind,
        contextId: attempt.contextId, placementId: attempt.placementId, activityId: attempt.activityId,
        activityVersion: attempt.activityVersion, activityVersionId: attempt.activityVersionId,
        interactionId: attempt.interactionId, attemptNumber: attempt.attemptNumber,
        pageGroupKeys: attempt.pageGroupKeys, sourceProvenance: attempt.sourceProvenance,
      };
      if (!isBookActivityEvaluationTarget(target) || Object.keys(target).some((key) => key !== 'contextKind'
        && canonicalActivityEvaluationFingerprint(detail[key])
          !== canonicalActivityEvaluationFingerprint(target[key as keyof BookActivityEvaluationTarget]))) return null;
      const feedback = detail.feedback as { readonly release?: unknown; readonly correctionNote?: unknown } | undefined;
      const feedbackReleased = detail.studentFeedbackRelease === 'released';
      return { target, response: attempt.response, access: {
        role, feedbackReleased,
        ...(feedbackReleased && feedback?.release === 'released' && typeof feedback.correctionNote === 'string'
          ? { releasedCorrectionNote: feedback.correctionNote } : {}),
      } };
    },
  });
};
