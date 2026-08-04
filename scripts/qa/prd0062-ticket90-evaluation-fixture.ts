import { createServer } from 'node:http';
import type {
  ActivitySubmission,
  NormalizedActivity,
} from '../../src/types/bookActivity.types';
import type {
  BookRuntimeAttemptRecord,
} from '../../src/services/book-activity/activityRuntimeAttempt.types';
import {
  createTrustedBookActivityEvaluationService,
} from '../../src/services/book-activity/activityEvaluation.service';
import type {
  BookActivityEvaluationAuthority,
  BookActivityEvaluationCommand,
  BookActivityEvaluationTarget,
} from '../../src/services/book-activity/activityEvaluation.types';
import {
  projectBookActivityStudentResult,
  type BookResultReleasePolicyAuthority,
} from '../../src/services/book-activity/bookResultVisibility.service';
import {
  InMemoryBookActivityEvaluationRepository,
} from '../../cloudflare/src/upload-worker/book-activity-grading/repository';
import {
  readImmutableBookActivityEvaluationHistory,
} from '../../cloudflare/src/upload-worker/book-activity-grading/immutable-history';

const port = Number(process.env.TICKET90_FIXTURE_PORT ?? 8790);
const bookId = 'ticket90-book';
const studentId = 'ticket90-student';

const makeAttempt = (
  kind: 'subjective' | 'objective',
): BookRuntimeAttemptRecord => ({
  schemaVersion: 1,
  attemptId: `attempt-${kind}`,
  bindingId: `binding-${kind}`,
  bindingRevision: 1,
  recipientId: studentId,
  contextId: 'ticket90-homework',
  placementId: `placement-${kind}`,
  activityId: `activity-${kind}`,
  activityVersion: 1,
  interactionId: `interaction-${kind}`,
  activityVersionId: `activity-${kind}-v1`,
  acknowledgedDraftRevision: 1,
  attemptNumber: 1,
  pageGroupKeys: [`page-group-${kind}`],
  sourceProvenance: [{
    sourceKey: `source-${kind}`,
    sourceVersionId: `source-${kind}-v1`,
    pages: [1],
  }],
  feedbackRelease: 'pending',
  response: kind === 'subjective'
    ? { text: 'A thoughtful subjective explanation.' }
    : { selectedOptionIds: ['option-a'] },
  createdByOperationId: `submit-${kind}`,
  createdAt: '2026-08-02T00:00:00.000Z',
  submissionScope: 'activity',
  requiredInteractionIds: [`interaction-${kind}`],
  submittedInteractionIds: [`interaction-${kind}`],
});

const subjectiveActivity: NormalizedActivity = {
  schemaVersion: 1,
  title: 'Subjective Activity',
  taskProfile: null,
  presentationMode: 'structured',
  contextRequirement: { mode: 'required', acceptedKinds: ['pdf-page'] },
  instructions: [{ text: 'Explain.' }],
  stimulus: null,
  assetRefs: [],
  interaction: { family: 'long-response', variant: 'essay' },
  answerRule: { defaultPoints: 2, normalization: 'exact' },
  interactions: [{
    family: 'long-response',
    interactionId: 'interaction-subjective',
    prompt: 'Explain.',
    itemIdentities: { family: 'long-response', itemIds: [] },
    answerKey: { family: 'long-response', rubric: { criteria: ['Relevant'] } },
  }],
  scoring: { mode: 'review-required' },
};

const objectiveActivity: NormalizedActivity = {
  schemaVersion: 1,
  title: 'Objective Activity',
  taskProfile: null,
  presentationMode: 'structured',
  contextRequirement: { mode: 'required', acceptedKinds: ['pdf-page'] },
  instructions: [{ text: 'Choose.' }],
  stimulus: null,
  assetRefs: [],
  interaction: { family: 'choice', variant: 'single' },
  answerRule: {
    defaultPoints: 2,
    normalization: 'exact',
    requiredSelectionCount: 1,
  },
  interactions: [{
    family: 'choice',
    interactionId: 'interaction-objective',
    prompt: 'Choose A.',
    options: ['A', 'B'],
    itemIdentities: { family: 'choice', optionIds: ['option-a', 'option-b'] },
    answerKey: { family: 'choice', acceptedOptionItemIds: ['option-a'] },
  }],
  scoring: { mode: 'auto-where-possible' },
};

const fixtures = {
  subjective: {
    attempt: makeAttempt('subjective'),
    activity: subjectiveActivity,
    submission: [{
      interactionId: 'interaction-subjective',
      answer: 'A thoughtful subjective explanation.',
    }] satisfies ActivitySubmission,
  },
  objective: {
    attempt: makeAttempt('objective'),
    activity: objectiveActivity,
    submission: [{
      interactionId: 'interaction-objective',
      answer: ['option-a'],
    }] satisfies ActivitySubmission,
  },
} as const;

const targetFor = (
  fixture: (typeof fixtures)[keyof typeof fixtures],
): BookActivityEvaluationTarget => ({
  attemptId: fixture.attempt.attemptId,
  resultId: `${fixture.attempt.attemptId}:result`,
  recipientId: fixture.attempt.recipientId,
  bindingId: fixture.attempt.bindingId,
  bindingRevision: fixture.attempt.bindingRevision,
  contextKind: 'homework',
  contextId: fixture.attempt.contextId,
  placementId: fixture.attempt.placementId,
  activityId: fixture.attempt.activityId,
  activityVersion: fixture.attempt.activityVersion,
  interactionId: fixture.attempt.interactionId,
  activityVersionId: fixture.attempt.activityVersionId,
  attemptNumber: fixture.attempt.attemptNumber,
  pageGroupKeys: [...fixture.attempt.pageGroupKeys],
  sourceProvenance: structuredClone(fixture.attempt.sourceProvenance),
});

const fixtureForTarget = (
  target: BookActivityEvaluationTarget,
) => Object.values(fixtures).find((fixture) => (
  target.attemptId === fixture.attempt.attemptId
));

const repository = new InMemoryBookActivityEvaluationRepository();
let clock = 0;
let controlOperation = 0;
const service = createTrustedBookActivityEvaluationService({
  repository,
  trustedScorerIdentity: 'ticket90-browser-scorer',
  now: () => {
    clock += 1;
    return `2026-08-02T00:00:${String(clock).padStart(2, '0')}.000Z`;
  },
  resolveAttempt: async (requested) => {
    const fixture = fixtureForTarget(requested);
    return fixture
      ? {
          attempt: fixture.attempt,
          contextKind: 'homework',
          activity: fixture.activity,
          submission: fixture.submission,
        }
      : null;
  },
  resolveTeacherAuthority: async ({ actorUid, target }) => {
    if (actorUid !== 'teacher-1') return null;
    const fixture = fixtureForTarget(target);
    if (!fixture) return null;
    const exact = targetFor(fixture);
    return {
      ownerId: actorUid,
      recipientId: exact.recipientId,
      bindingId: exact.bindingId,
      bindingRevision: exact.bindingRevision,
      contextKind: exact.contextKind,
      contextId: exact.contextId,
      placementId: exact.placementId,
      activityId: exact.activityId,
      activityVersion: exact.activityVersion,
      activityVersionId: exact.activityVersionId,
    } satisfies BookActivityEvaluationAuthority;
  },
});

const ready = service.applyEvaluationCommand({
  schemaVersion: 1,
  scorerVersion: 1,
  operationId: 'seed-objective-score',
  kind: 'evaluate_objective',
  expectedEvaluationRevision: 0,
  target: targetFor(fixtures.objective),
}, {
  kind: 'trusted_scorer',
  serviceIdentity: 'ticket90-browser-scorer',
});

const policyFor = (
  target: BookActivityEvaluationTarget,
): BookResultReleasePolicyAuthority => ({
  attemptId: target.attemptId,
  contextKind: target.contextKind,
  contextId: target.contextId,
  placementId: target.placementId,
  activityId: target.activityId,
  activityVersionId: target.activityVersionId,
  fields: {
    answerKey: 'released',
    correctness: 'released',
    score: 'released',
    feedback: 'released',
    correctionNote: 'released',
  },
});

const cors = (origin: string | undefined) => ({
  'access-control-allow-origin': (
    origin === 'http://localhost:5173' || origin === 'http://localhost:5174'
  ) ? origin : 'http://localhost:5174',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  vary: 'Origin',
});

const historyFor = async (
  fixture: (typeof fixtures)[keyof typeof fixtures],
) => readImmutableBookActivityEvaluationHistory(repository, {
  target: targetFor(fixture),
  limit: 100,
});

const fixtureFromQuery = (url: URL) => Object.values(fixtures).find((fixture) => {
  const target = targetFor(fixture);
  return url.searchParams.get('contextKind') === target.contextKind
    && url.searchParams.get('contextId') === target.contextId
    && url.searchParams.get('placementId') === target.placementId
    && url.searchParams.get('activityId') === target.activityId
    && url.searchParams.get('activityVersionId') === target.activityVersionId
    && (url.searchParams.get('attemptId') ?? url.searchParams.get('terminalId'))
      === target.attemptId;
});

const server = createServer(async (request, response) => {
  await ready;
  const origin = request.headers.origin;
  const send = (status: number, body: unknown) => {
    response.writeHead(status, cors(origin));
    response.end(JSON.stringify(body));
  };
  if (request.method === 'OPTIONS') {
    response.writeHead(204, cors(origin));
    response.end();
    return;
  }
  const url = new URL(request.url ?? '/', `http://localhost:${port}`);
  if (request.method === 'GET' && url.pathname === '/__health') {
    send(200, { ready: true });
    return;
  }
  if (!request.headers.authorization?.startsWith('Bearer ')) {
    send(401, { code: 'unauthorized' });
    return;
  }
  const historyMatch = /^\/book-evaluation\/history\/ticket90-book\/([^/]+)$/u.exec(url.pathname);
  if (request.method === 'GET' && historyMatch) {
    const fixture = fixtureFromQuery(url);
    if (!fixture) {
      send(404, { code: 'evaluation_attempt_not_found' });
      return;
    }
    const history = await historyFor(fixture);
    if (url.searchParams.get('view') === 'student') {
      const visible = decodeURIComponent(historyMatch[1]!) === studentId;
      const target = targetFor(fixture);
      const projection = projectBookActivityStudentResult({
        presentationEnabled: true,
        ownership: {
          attemptId: target.attemptId,
          visible,
          viewerRole: 'student',
          reason: visible ? 'visible' : 'wrong_student',
        },
        target,
        policy: policyFor(target),
        studentResponse: visible ? fixture.attempt.response : 'DENIED_SECRET_RESPONSE',
        answerKey: visible
          ? fixture.activity.interactions[0]?.answerKey
          : 'DENIED_SECRET_ANSWER',
        currentEvaluation: history.at(-1) ?? null,
        history,
        previouslyVisibleRevision: history.length > 1 ? 1 : undefined,
      });
      send(200, { result: projection });
      return;
    }
    send(200, {
      target: targetFor(fixture),
      submission: { response: fixture.attempt.response },
      history,
    });
    return;
  }
  if (request.method === 'POST' && url.pathname === '/book-evaluation/commands') {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    let command: BookActivityEvaluationCommand | undefined;
    try {
      command = (JSON.parse(raw) as { command?: BookActivityEvaluationCommand }).command;
    } catch {
      // The typed service receives no malformed command.
    }
    if (!command) {
      send(400, { code: 'evaluation_command_malformed' });
      return;
    }
    const result = await service.applyEvaluationCommand(command, {
      kind: 'teacher',
      uid: 'teacher-1',
    });
    send(
      result.status === 'rejected' && result.code === 'evaluation_stale_revision' ? 409 : 200,
      result,
    );
    return;
  }
  const controlMatch = /^\/__ticket90\/inject-stale\/(attempt-(?:objective|subjective))$/u.exec(
    url.pathname,
  );
  if (request.method === 'POST' && controlMatch) {
    const fixture = Object.values(fixtures).find(
      (candidate) => candidate.attempt.attemptId === controlMatch[1],
    );
    if (!fixture) {
      send(404, { code: 'fixture_not_found' });
      return;
    }
    const history = await historyFor(fixture);
    const current = history.at(-1);
    if (!current) {
      send(409, { code: 'fixture_not_graded' });
      return;
    }
    controlOperation += 1;
    const result = await service.applyEvaluationCommand({
      schemaVersion: 1,
      scorerVersion: 1,
      operationId: `fixture-stale-${controlOperation}`,
      kind: 'regrade',
      expectedEvaluationRevision: current.revision,
      target: targetFor(fixture),
      evaluation: {
        earnedScore: 1.75,
        maximumScore: 2,
        feedback: 'A concurrent teacher correction.',
        correctionFacts: [{
          interactionId: fixture.attempt.interactionId,
          outcome: 'partial',
          note: 'Concurrent correction is now current.',
        }],
      },
    }, { kind: 'teacher', uid: 'teacher-1' });
    send(200, result);
    return;
  }
  send(404, { code: 'ticket90_fixture_not_found' });
});

server.listen(port, 'localhost', () => {
  console.log(JSON.stringify({
    ready: true,
    origin: `http://localhost:${port}`,
    bookId,
    studentId,
  }));
});
