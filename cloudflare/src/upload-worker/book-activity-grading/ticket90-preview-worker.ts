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
  projectBookActivityStudentResult,
  type BookResultReleasePolicyAuthority,
} from '../../../../src/services/book-activity/bookResultVisibility.service.ts';
import {
  InMemoryBookActivityEvaluationRepository,
} from './repository.ts';
import {
  readImmutableBookActivityEvaluationHistory,
} from './immutable-history.ts';
import ticket89Preview from './ticket89-preview-worker.ts';

const attempt = (): BookRuntimeAttemptRecord => ({
  schemaVersion: 1,
  attemptId: 'attempt-1',
  bindingId: 'binding-1',
  bindingRevision: 1,
  recipientId: 'student-1',
  contextId: 'homework-1',
  placementId: 'placement-1',
  activityId: 'activity-1',
  activityVersion: 1,
  interactionId: 'interaction-1',
  activityVersionId: 'activity-version-1',
  acknowledgedDraftRevision: 1,
  attemptNumber: 1,
  pageGroupKeys: ['page-group-1'],
  sourceProvenance: [{
    sourceKey: 'source-1',
    sourceVersionId: 'source-version-1',
    pages: [1],
  }],
  feedbackRelease: 'pending',
  response: { text: 'Student explanation' },
  createdByOperationId: 'submit-1',
  createdAt: '2026-08-02T00:00:00.000Z',
  submissionScope: 'activity',
  requiredInteractionIds: ['interaction-1'],
  submittedInteractionIds: ['interaction-1'],
});

const activity = (): NormalizedActivity => ({
  schemaVersion: 1,
  title: 'Subjective preview Activity',
  taskProfile: null,
  presentationMode: 'structured',
  contextRequirement: { mode: 'required', acceptedKinds: ['pdf-page'] },
  instructions: [{ text: 'Explain your answer.' }],
  stimulus: null,
  assetRefs: [],
  interaction: { family: 'long-response', variant: 'essay' },
  answerRule: { defaultPoints: 2, normalization: 'exact' },
  interactions: [{
    family: 'long-response',
    interactionId: 'interaction-1',
    prompt: 'Explain.',
    itemIdentities: { family: 'long-response', itemIds: [] },
    answerKey: {
      family: 'long-response',
      rubric: { criteria: ['Relevant explanation'] },
    },
  }],
  scoring: { mode: 'review-required' },
});

const target = (): BookActivityEvaluationTarget => {
  const value = attempt();
  return {
    attemptId: value.attemptId,
    resultId: `${value.attemptId}:result`,
    recipientId: value.recipientId,
    bindingId: value.bindingId,
    bindingRevision: value.bindingRevision,
    contextKind: 'homework',
    contextId: value.contextId,
    placementId: value.placementId,
    activityId: value.activityId,
    activityVersion: value.activityVersion,
    interactionId: value.interactionId,
    activityVersionId: value.activityVersionId,
    attemptNumber: value.attemptNumber,
    pageGroupKeys: [...value.pageGroupKeys],
    sourceProvenance: structuredClone(value.sourceProvenance),
  };
};

const authority = (
  requested: BookActivityEvaluationTarget,
): BookActivityEvaluationAuthority => ({
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

const releasePolicy = (): BookResultReleasePolicyAuthority => {
  const exactTarget = target();
  return {
    attemptId: exactTarget.attemptId,
    contextKind: exactTarget.contextKind,
    contextId: exactTarget.contextId,
    placementId: exactTarget.placementId,
    activityId: exactTarget.activityId,
    activityVersionId: exactTarget.activityVersionId,
    fields: {
      answerKey: 'released',
      correctness: 'released',
      score: 'released',
      feedback: 'released',
      correctionNote: 'released',
    },
  };
};

const responseHeaders = {
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-origin': '*',
  'cache-control': 'no-store',
} as const;

const json = (body: unknown, status = 200): Response => Response.json(body, {
  status,
  headers: responseHeaders,
});

const readBody = async (request: Request): Promise<unknown> => {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 128 * 1024) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const createState = () => {
  const repository = new InMemoryBookActivityEvaluationRepository();
  let clock = 0;
  let indexedHistoryReads = 0;
  const canonicalAttempt = attempt();
  const canonicalActivity = activity();
  const submission: ActivitySubmission = [{
    interactionId: 'interaction-1',
    answer: 'Student explanation',
  }];
  const service = createTrustedBookActivityEvaluationService({
    repository,
    trustedScorerIdentity: 'ticket90-preview-scorer',
    now: () => {
      clock += 1;
      return `2026-08-02T00:00:0${clock}.000Z`;
    },
    resolveAttempt: async (requested) => (
      requested.attemptId === canonicalAttempt.attemptId
        ? {
            attempt: canonicalAttempt,
            contextKind: 'homework',
            activity: canonicalActivity,
            submission,
          }
        : null
    ),
    resolveTeacherAuthority: async ({ actorUid, target: requested }) => (
      actorUid === 'teacher-1' ? authority(requested) : null
    ),
  });
  return {
    canonicalAttempt,
    canonicalActivity,
    service,
    async history() {
      indexedHistoryReads += 1;
      return readImmutableBookActivityEvaluationHistory(repository, {
        target: target(),
        limit: 100,
      });
    },
    metrics() {
      return { indexedHistoryReads };
    },
  };
};

let state = createState();

export const resetTicket90PreviewForTests = (): void => {
  state = createState();
};

const exactQuery = (url: URL): boolean => {
  const expected = target();
  return url.searchParams.get('contextKind') === expected.contextKind
    && url.searchParams.get('contextId') === expected.contextId
    && url.searchParams.get('placementId') === expected.placementId
    && url.searchParams.get('activityId') === expected.activityId
    && url.searchParams.get('activityVersionId') === expected.activityVersionId
    && ['attempt-1', 'attempt-1:result'].includes(
      url.searchParams.get('attemptId')
      ?? url.searchParams.get('terminalId')
      ?? '',
    );
};

const historyResponse = async (
  request: Request,
  url: URL,
  studentId: string,
): Promise<Response> => {
  if (!exactQuery(url)) return json({ code: 'evaluation_attempt_not_found' }, 404);
  const history = await state.history();
  if (url.searchParams.get('view') === 'student') {
    const visible = studentId === 'student-1';
    const projection = projectBookActivityStudentResult({
      presentationEnabled: true,
      ownership: {
        attemptId: 'attempt-1',
        visible,
        viewerRole: 'student',
        reason: visible ? 'visible' : 'wrong_student',
      },
      target: target(),
      policy: releasePolicy(),
      studentResponse: state.canonicalAttempt.response,
      answerKey: state.canonicalActivity.interactions[0]?.answerKey,
      currentEvaluation: history.at(-1) ?? null,
      history,
      previouslyVisibleRevision: history.length > 1 ? 1 : undefined,
    });
    return json({ result: projection });
  }
  if (studentId !== 'student-1'
    || request.headers.get('authorization') !== 'Bearer teacher-token') {
    return json({ code: 'evaluation_actor_unauthorized' }, 403);
  }
  return json({
    target: target(),
    submission: { response: structuredClone(state.canonicalAttempt.response) },
    history,
  });
};

const commandResponse = async (request: Request): Promise<Response> => {
  if (request.headers.get('authorization') !== 'Bearer teacher-token') {
    return json({ code: 'evaluation_actor_unauthorized' }, 403);
  }
  const envelope = await readBody(request);
  const command = envelope !== null
    && typeof envelope === 'object'
    && !Array.isArray(envelope)
    ? (envelope as { command?: BookActivityEvaluationCommand }).command
    : undefined;
  if (!command) return json({ code: 'evaluation_command_malformed' }, 400);
  const result = await state.service.applyEvaluationCommand(command, {
    kind: 'teacher',
    uid: 'teacher-1',
  });
  if (result.status !== 'rejected') return json(result);
  return json(result, result.code === 'evaluation_stale_revision' ? 409 : 400);
};

const proofResponse = async (): Promise<Response> => {
  const ticket89Response = await ticket89Preview.fetch(
    new Request('https://ticket89.preview/proof'),
  );
  const ticket89 = await ticket89Response.json() as {
    pass?: boolean;
    productionRepository?: unknown;
  };
  const proofState = createState();
  const first = await proofState.service.applyEvaluationCommand({
    schemaVersion: 1,
    scorerVersion: 1,
    operationId: 'ticket90-proof-grade',
    kind: 'teacher_evaluation',
    expectedEvaluationRevision: 0,
    target: target(),
    evaluation: {
      earnedScore: 1,
      maximumScore: 2,
      feedback: 'Initial feedback',
    },
  }, { kind: 'teacher', uid: 'teacher-1' });
  const second = await proofState.service.applyEvaluationCommand({
    schemaVersion: 1,
    scorerVersion: 1,
    operationId: 'ticket90-proof-regrade',
    kind: 'regrade',
    expectedEvaluationRevision: 1,
    target: target(),
    evaluation: {
      earnedScore: 2,
      maximumScore: 2,
      feedback: 'Corrected feedback',
      correctionFacts: [{
        interactionId: 'interaction-1',
        outcome: 'correct',
        note: 'Corrected after review.',
      }],
    },
  }, { kind: 'teacher', uid: 'teacher-1' });
  const history = await proofState.history();
  const denied = projectBookActivityStudentResult({
    presentationEnabled: true,
    ownership: {
      attemptId: 'attempt-1',
      visible: false,
      viewerRole: 'student',
      reason: 'wrong_student',
    },
    target: target(),
    policy: releasePolicy(),
    studentResponse: state.canonicalAttempt.response,
    answerKey: state.canonicalActivity.interactions[0]?.answerKey,
    currentEvaluation: history.at(-1) ?? null,
    history,
    previouslyVisibleRevision: 1,
  });
  const deniedSerialized = JSON.stringify(denied);
  const pass = ticket89.pass === true
    && first.status === 'accepted'
    && second.status === 'accepted'
    && history.map((entry) => entry.revision).join(',') === '1,2'
    && proofState.metrics().indexedHistoryReads === 1
    && deniedSerialized === '{"attemptId":"attempt-1","status":"hidden"}';
  return json({
    proofKind: 'prd0062-ticket90-production-equivalent',
    pass,
    trustedEvaluation: {
      interface: 'ticket89-typed-command',
      first,
      second,
      historyRevisions: history.map((entry) => entry.revision),
    },
    productionRepository: ticket89.productionRepository,
    presentationHistory: proofState.metrics(),
    deniedProjection: denied,
    deniedFieldsAbsent: !/answerKey|correctness|score|feedback|correction/iu.test(
      deniedSerialized,
    ),
  }, pass ? 200 : 500);
};

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: responseHeaders });
    }
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/proof') {
      return proofResponse();
    }
    if (request.method === 'POST' && url.pathname === '/book-evaluation/commands') {
      return commandResponse(request);
    }
    const match = /^\/book-evaluation\/history\/book-1\/([^/]+)$/u.exec(url.pathname);
    if (request.method === 'GET' && match) {
      return historyResponse(request, url, decodeURIComponent(match[1]!));
    }
    return json({ code: 'ticket90_preview_fail_closed' }, 503);
  },
} satisfies ExportedHandler;
