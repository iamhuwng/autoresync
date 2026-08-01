import type {
  ActivitySubmission,
  NormalizedActivity,
} from '../../../../src/types/bookActivity.types.ts';
import type {
  BookRuntimeAttemptRecord,
} from '../../../../src/services/book-activity/activityRuntimeAttempt.types.ts';
import {
  createTrustedBookActivityEvaluationService,
} from '../../../../src/services/book-activity/activityEvaluation.service.ts';
import type {
  BookActivityEvaluationAuthority,
  BookActivityEvaluationCommand,
  BookActivityEvaluationTarget,
} from '../../../../src/services/book-activity/activityEvaluation.types.ts';
import {
  FirebaseRestBookActivityEvaluationRepository,
} from './repository.ts';
import { readImmutableBookActivityEvaluationHistory } from './immutable-history.ts';

const clone = <T>(value: T): T => structuredClone(value);

class PreviewFirebaseRtdb {
  private root: Record<string, unknown> = {};
  private revision = 0;
  readonly metrics = { reads: 0, conditionalWrites: 0, historyQueries: 0 };

  private parts(url: URL): string[] {
    return url.pathname.replace(/^\//u, '').replace(/\.json$/u, '')
      .split('/').filter(Boolean).map(decodeURIComponent);
  }

  private read(parts: readonly string[]): unknown {
    let value: unknown = this.root;
    for (const part of parts) {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
      value = (value as Record<string, unknown>)[part];
      if (value === undefined) return null;
    }
    return clone(value);
  }

  private write(parts: readonly string[], value: unknown): void {
    let cursor = this.root;
    for (const part of parts.slice(0, -1)) {
      const next = cursor[part];
      if (next === null || typeof next !== 'object' || Array.isArray(next)) cursor[part] = {};
      cursor = cursor[part] as Record<string, unknown>;
    }
    cursor[parts.at(-1)!] = clone(value);
  }

  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.searchParams.get('auth') !== 'ticket89-preview-token') {
      return new Response(JSON.stringify({ error: 'preview_identity_missing' }), { status: 401 });
    }
    const parts = this.parts(url);
    if (init?.method === 'GET') {
      this.metrics.reads += 1;
      let value = this.read(parts);
      if (url.searchParams.has('orderBy') && parts.at(-1) === 'history') {
        if (url.searchParams.get('orderBy') !== JSON.stringify('$key')) {
          return new Response(null, { status: 400 });
        }
        this.metrics.historyQueries += 1;
        const limit = Number(url.searchParams.get('limitToLast'));
        if (!Number.isSafeInteger(limit) || limit < 1) {
          return new Response(null, { status: 400 });
        }
        const rows = value && typeof value === 'object' && !Array.isArray(value)
          ? Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .slice(-limit)
          : [];
        value = Object.fromEntries(rows);
      }
      return new Response(JSON.stringify(value), {
        status: 200,
        headers: init.headers && 'X-Firebase-ETag' in (init.headers as Record<string, string>)
          ? { etag: `"${this.revision}"` }
          : {},
      });
    }
    if (init?.method === 'PUT') {
      const headers = new Headers(init.headers);
      if (headers.get('if-match') !== `"${this.revision}"`) {
        return new Response(null, { status: 412 });
      }
      this.metrics.conditionalWrites += 1;
      this.write(parts, JSON.parse(String(init.body)));
      this.revision += 1;
      return new Response('null', { status: 200 });
    }
    return new Response(null, { status: 405 });
  };
}

const activity = (): NormalizedActivity => ({
  schemaVersion: 1,
  title: 'Preview objective',
  taskProfile: null,
  presentationMode: 'structured',
  contextRequirement: { mode: 'required', acceptedKinds: ['pdf-page'] },
  instructions: [{ text: 'Choose.' }],
  stimulus: null,
  assetRefs: [],
  interaction: { family: 'choice', variant: 'single' },
  answerRule: { defaultPoints: 2, normalization: 'exact', requiredSelectionCount: 1 },
  interactions: [{
    family: 'choice',
    interactionId: 'interaction-1',
    prompt: 'Pick A',
    options: ['A', 'B'],
    itemIdentities: { family: 'choice', optionIds: ['option-a', 'option-b'] },
    answerKey: { family: 'choice', acceptedOptionItemIds: ['option-a'] },
  }],
  scoring: { mode: 'auto-where-possible' },
});

const attempt = (): BookRuntimeAttemptRecord => ({
  schemaVersion: 1,
  attemptId: 'attempt-1',
  bindingId: 'binding-1',
  bindingRevision: 2,
  recipientId: 'student-1',
  contextId: 'homework-1',
  placementId: 'placement-1',
  activityId: 'activity-1',
  activityVersion: 3,
  interactionId: 'interaction-1',
  activityVersionId: 'activity-version-3',
  acknowledgedDraftRevision: 1,
  attemptNumber: 1,
  pageGroupKeys: ['group-1'],
  sourceProvenance: [{ sourceKey: 'source-1', sourceVersionId: 'source-v1', pages: [7] }],
  feedbackRelease: 'pending',
  response: { selectedOptionIds: ['option-a'] },
  createdByOperationId: 'submit-1',
  createdAt: '2026-08-01T14:00:00.000Z',
  submissionScope: 'activity',
  requiredInteractionIds: ['interaction-1'],
  submittedInteractionIds: ['interaction-1'],
});

const target = (): BookActivityEvaluationTarget => {
  const source = attempt();
  return {
    attemptId: source.attemptId,
    resultId: `${source.attemptId}:result`,
    recipientId: source.recipientId,
    bindingId: source.bindingId,
    bindingRevision: source.bindingRevision,
    contextKind: 'homework',
    contextId: source.contextId,
    placementId: source.placementId,
    activityId: source.activityId,
    activityVersion: source.activityVersion,
    interactionId: source.interactionId,
    activityVersionId: source.activityVersionId,
    attemptNumber: source.attemptNumber,
    pageGroupKeys: source.pageGroupKeys,
    sourceProvenance: source.sourceProvenance,
  };
};

const teacherAuthority = (requested: BookActivityEvaluationTarget): BookActivityEvaluationAuthority => ({
  ownerId: 'teacher-1',
  recipientId: requested.recipientId,
  bindingId: requested.bindingId,
  bindingRevision: requested.bindingRevision,
  contextKind: requested.contextKind,
  contextId: requested.contextId,
  placementId: requested.placementId,
  activityId: requested.activityId,
  activityVersion: requested.activityVersion,
  activityVersionId: requested.activityVersionId,
});

const proof = async (): Promise<Record<string, unknown>> => {
  const firebase = new PreviewFirebaseRtdb();
  const repository = new FirebaseRestBookActivityEvaluationRepository({
    env: {
      FIREBASE_DB_URL: 'https://ticket89-preview.firebaseio.test',
      BOOK_ACTIVITY_EVALUATION_SERVICE_IDENTITY: 'ticket89-preview-service',
    },
    fetchImpl: firebase.fetch,
    getAccessToken: async () => 'ticket89-preview-token',
  });
  const canonicalAttempt = attempt();
  const submissionFactsBefore = structuredClone(canonicalAttempt);
  const canonicalActivity = activity();
  const submission: ActivitySubmission = [{
    interactionId: 'interaction-1',
    answer: ['option-a'],
  }];
  const service = createTrustedBookActivityEvaluationService({
    repository,
    trustedScorerIdentity: 'ticket89-preview-scorer',
    now: () => '2026-08-01T15:00:00.000Z',
    resolveAttempt: async () => ({
      attempt: canonicalAttempt,
      contextKind: 'homework',
      activity: canonicalActivity,
      submission,
    }),
    resolveTeacherAuthority: async ({ actorUid, target: requested }) => (
      actorUid === 'teacher-1' ? teacherAuthority(requested) : null
    ),
  });
  const objective: BookActivityEvaluationCommand = {
    schemaVersion: 1,
    scorerVersion: 1,
    operationId: 'preview-objective-1',
    kind: 'evaluate_objective',
    expectedEvaluationRevision: 0,
    target: target(),
  };
  const first = await service.applyEvaluationCommand(objective, {
    kind: 'trusted_scorer',
    serviceIdentity: 'ticket89-preview-scorer',
  });
  const replay = await service.applyEvaluationCommand(objective, {
    kind: 'trusted_scorer',
    serviceIdentity: 'ticket89-preview-scorer',
  });
  const stale = await service.applyEvaluationCommand({
    ...objective,
    operationId: 'preview-stale-1',
  }, {
    kind: 'trusted_scorer',
    serviceIdentity: 'ticket89-preview-scorer',
  });
  const regrade = await service.applyEvaluationCommand({
    ...objective,
    operationId: 'preview-regrade-1',
    kind: 'regrade',
    expectedEvaluationRevision: 1,
    evaluation: {
      earnedScore: 1.5,
      maximumScore: 2,
      feedback: 'Teacher correction.',
      correctionFacts: [{ interactionId: 'interaction-1', outcome: 'partial' }],
    },
  }, { kind: 'teacher', uid: 'teacher-1' });
  const crossOwner = await service.applyEvaluationCommand({
    ...objective,
    operationId: 'preview-cross-owner-1',
    kind: 'regrade',
    expectedEvaluationRevision: 2,
    evaluation: { earnedScore: 2, maximumScore: 2 },
  }, { kind: 'teacher', uid: 'teacher-2' });
  const history = await readImmutableBookActivityEvaluationHistory(repository, {
    target: target(),
    limit: 10,
  });
  const visibilityNeutral = !('visibility' in (history[0] ?? {}))
    && !('releasePolicy' in (history[0] ?? {}))
    && canonicalAttempt.feedbackRelease === submissionFactsBefore.feedbackRelease;
  const pass = first.status === 'accepted'
    && first.revision.facts.earnedScore === 2
    && replay.status === 'replayed'
    && replay.revision.revision === 1
    && stale.status === 'rejected' && stale.code === 'evaluation_stale_revision'
    && regrade.status === 'accepted' && regrade.revision.revision === 2
    && crossOwner.status === 'rejected' && crossOwner.code === 'evaluation_actor_unauthorized'
    && history.map((row) => row.revision).join(',') === '1,2'
    && JSON.stringify(canonicalAttempt) === JSON.stringify(submissionFactsBefore)
    && visibilityNeutral
    && firebase.metrics.historyQueries === 1;
  return {
    proofKind: 'prd0062-ticket89-production-equivalent',
    pass,
    productionRepository: {
      kind: 'firebase-rest-cas',
      protectedRoot: 'book_activity_evaluations',
      ...firebase.metrics,
    },
    objective: first,
    replay,
    stale,
    regrade,
    crossOwner,
    history: history.map((row) => ({
      revision: row.revision,
      previousRevision: row.previousRevision,
      status: row.facts.status,
      earnedScore: row.facts.earnedScore,
    })),
    submissionFactsPreserved: JSON.stringify(canonicalAttempt) === JSON.stringify(submissionFactsBefore),
    visibilityNeutral,
    visibilityPolicyPersisted: JSON.stringify(history).match(/visibility|releasePolicy/u) !== null,
  };
};

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'GET' || new URL(request.url).pathname !== '/proof') {
      return Response.json({ code: 'ticket89_preview_fail_closed' }, { status: 503 });
    }
    const result = await proof();
    return Response.json(result, {
      status: result.pass === true ? 200 : 500,
      headers: { 'cache-control': 'no-store' },
    });
  },
} satisfies ExportedHandler;
