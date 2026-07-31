import { createServer } from 'node:http';

const port = Number(process.env.TICKET77_FIXTURE_PORT ?? 8799);
const studentId = 'x3hDfjYVN7cJtSbwq0ChIjl1Bk62';
const activityId = 'activity-browser-proof';
const bookId = 'book-browser-proof';
const homeworkId = 'homework-browser-proof';

const base64url = (value) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
const groupKey = `g_${base64url([studentId, activityId])}`;

const attempt = ({
  attemptId,
  resultId,
  completionId,
  attemptNumber,
  contextId,
  placementId,
  surface,
  deliveryId,
  submittedAt,
  sourceKey,
  sourceVersionId,
  availability,
  evaluation,
  feedback,
  response,
}) => ({
  summary: {
    schemaVersion: 1,
    attemptId,
    resultId,
    completionId,
    recipientId: studentId,
    studentId,
    activityId,
    contextId,
    placementId,
    bindingId: `binding-browser-proof-${surface}`,
    bindingRevision: attemptNumber + 2,
    activityVersionId: 'activity-browser-proof@7',
    activityVersion: 7,
    interactionId: `interaction-browser-proof-${surface}`,
    attemptNumber,
    surface,
    deliveryContextId: contextId,
    deliveryId,
    ownerId: surface === 'homework' ? 'glMHCrzMnyS6AqFcb9I0nlOqQ6X2' : studentId,
    homeworkId: surface === 'homework' ? homeworkId : null,
    pageGroupKeys: [`page-group-${surface}`],
    sourceProvenance: [{ sourceKey, sourceVersionId, pages: [3, 4] }],
    sources: [{
      sourceKey,
      componentId: sourceKey,
      sourceVersionId,
      pages: [3, 4],
      availability,
      available: false,
      displayOnly: true,
    }],
    sourceAvailability: availability,
    sourceAvailable: false,
    createdAt: submittedAt,
    submittedAt,
    completedAt: submittedAt,
    resultStatus: 'submitted',
    evaluationStatus: evaluation.status,
    completionStatus: 'completed',
    completion: {
      completionId,
      attemptId,
      resultId,
      status: 'completed',
      contextId,
      placementId,
      activityVersionId: 'activity-browser-proof@7',
      activityVersion: 7,
      createdAt: submittedAt,
    },
    evaluation,
    feedback,
    attemptLimit: surface === 'homework' ? 2 : 3,
    attemptsUsed: 1,
    attemptsRemaining: surface === 'homework' ? 1 : 2,
  },
  response,
});

const solo = attempt({
  attemptId: 'attempt-solo-1',
  resultId: 'result-solo-1',
  completionId: 'completion-solo-1',
  attemptNumber: 1,
  contextId: 'solo-browser-proof',
  placementId: 'placement-solo-browser-proof',
  surface: 'solo',
  deliveryId: 'delivery-solo-browser-proof',
  submittedAt: '2026-07-30T08:30:00.000Z',
  sourceKey: 'component-solo-browser-proof',
  sourceVersionId: 'source-version-deleted',
  availability: 'deleted',
  evaluation: { status: 'pending_review' },
  feedback: { release: 'withheld', available: false },
  response: { choice: 'Solo response retained after source deletion' },
});

const homework = attempt({
  attemptId: 'attempt-homework-1',
  resultId: 'result-homework-1',
  completionId: 'completion-homework-1',
  attemptNumber: 2,
  contextId: homeworkId,
  placementId: 'placement-homework-browser-proof',
  surface: 'homework',
  deliveryId: 'delivery-homework-browser-proof',
  submittedAt: '2026-07-31T09:45:00.000Z',
  sourceKey: 'component-homework-browser-proof',
  sourceVersionId: 'source-version-replaced',
  availability: 'replaced',
  evaluation: {
    status: 'graded',
    score: { earnedScore: 8, maximumScore: 10, displayScore: '8 / 10' },
  },
  feedback: {
    release: 'released',
    available: true,
    text: 'Your explanation used the evidence well.',
    releasedAt: '2026-07-31T10:00:00.000Z',
  },
  response: { choice: 'Homework response visible to its current teacher' },
});

const context = (row) => ({
  contextId: row.summary.contextId,
  placementId: row.summary.placementId,
  surface: row.summary.surface,
  attemptLimit: row.summary.attemptLimit,
  attemptsUsed: 1,
  attemptsRemaining: row.summary.attemptsRemaining,
  completionStatus: 'completed',
  latestAttemptId: row.summary.attemptId,
  attemptIds: [row.summary.attemptId],
});

const group = (rows) => ({
  groupKey,
  recipientId: studentId,
  studentId,
  activityId,
  attemptCount: rows.length,
  attempts: rows.map((row) => row.summary),
  contexts: rows.map(context),
  latestAttemptId: rows.at(-1).summary.attemptId,
});

const cors = (origin) => ({
  'access-control-allow-origin': (
    origin === 'http://localhost:5173' || origin === 'http://localhost:5174'
  ) ? origin : 'http://localhost:5174',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-max-age': '600',
  'content-type': 'application/json; charset=utf-8',
  vary: 'Origin',
});

const send = (response, status, value, origin) => {
  response.writeHead(status, cors(origin));
  response.end(JSON.stringify(value));
};

const server = createServer((request, response) => {
  const origin = request.headers.origin;
  if (request.method === 'OPTIONS') {
    response.writeHead(204, cors(origin));
    response.end();
    return;
  }
  const url = new URL(request.url ?? '/', `http://localhost:${port}`);
  if (request.method === 'GET' && url.pathname === '/__health') {
    send(response, 200, { ready: true }, origin);
    return;
  }
  if (request.method !== 'GET' || !request.headers.authorization?.startsWith('Bearer ')) {
    send(response, 401, { code: 'book_result_unauthorized' }, origin);
    return;
  }

  const base = `/v1/book-evaluation/results/${bookId}/${studentId}`;
  const teacherBase = `${base}/homework/${homeworkId}`;
  const teacherScope = url.pathname.startsWith(`${teacherBase}/`);
  const teacherOrigin = origin === 'http://localhost:5173';

  if (url.pathname === `${base}/groups/${groupKey}`
    || url.pathname === `${teacherBase}/groups/${groupKey}`) {
    if (teacherOrigin && !teacherScope) {
      send(response, 403, { code: 'book_result_teacher_homework_required' }, origin);
      return;
    }
    send(response, 200, { group: group(teacherScope ? [homework] : [solo, homework]) }, origin);
    return;
  }
  if (url.pathname === `${base}/details/${homework.summary.resultId}`
    || url.pathname === `${teacherBase}/details/${homework.summary.resultId}`) {
    send(response, 200, { detail: { ...homework.summary, response: homework.response } }, origin);
    return;
  }
  if (url.pathname === `${base}/details/${solo.summary.resultId}`
    || url.pathname === `${teacherBase}/details/${solo.summary.resultId}`) {
    if (teacherScope || teacherOrigin) {
      send(response, 403, { code: 'book_result_teacher_homework_required' }, origin);
      return;
    }
    send(response, 200, { detail: { ...solo.summary, response: solo.response } }, origin);
    return;
  }
  send(response, 404, { code: 'book_result_not_found' }, origin);
});

server.listen(port, 'localhost', () => {
  console.log(JSON.stringify({
    ready: true,
    origin: `http://localhost:${port}`,
    bookId,
    studentId,
    homeworkId,
    activityId,
    groupKey,
  }));
});
