import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

const port = Number(process.env.TICKET77_FIXTURE_PORT ?? 8799);
const studentId = 'x3hDfjYVN7cJtSbwq0ChIjl1Bk62';
const activityId = 'activity-browser-proof';
const bookId = 'book-browser-proof';
const homeworkId = 'homework-browser-proof';
const historicalRouteKey = `bd_${'8'.repeat(40)}-4-component-homework-browser-proof-source-version-homework-exact`;

const base64url = (value) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
const groupKey = `g_${base64url([studentId, activityId])}`;

const makeProofPdf = () => {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources <<>> >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources <<>> >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources <<>> >>',
  ];
  let text = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(text));
    text += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(text);
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  text += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  text += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(text);
};
const proofPdf = makeProofPdf();

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
      available: availability === 'available',
      displayOnly: availability !== 'available',
    }],
    sourceAvailability: availability,
    sourceAvailable: availability === 'available',
    attemptSourceContext: {
      schemaVersion: 1,
      state: availability === 'available' ? 'available' : 'historical_source_unavailable',
      ...(availability === 'available' ? {} : { reason: availability }),
      metadata: {
        attemptId,
        resultId,
        bookId,
        studentId,
        surface,
        contextId,
        ownerId: surface === 'homework' ? 'glMHCrzMnyS6AqFcb9I0nlOqQ6X2' : studentId,
        componentId: sourceKey,
        sourceKey,
        sourceVersionId,
        physicalPageNumber: 3,
        pageGroupId: `page-group-${surface}`,
        placementId,
        activityId,
        activityVersionId: 'activity-browser-proof@7',
        activityVersion: 7,
        interactionFocusId: `interaction-browser-proof-${surface}`,
        correspondence: surface === 'homework' ? 'source-assisted' : 'reference-only',
      },
      documentResource: availability === 'available' ? {
        sourceKey,
        sourceVersionId,
        opaqueRouteKey: surface === 'homework' ? historicalRouteKey : `historical-${attemptId}`,
        localPageScope: { kind: 'pages', pages: [3] },
      } : null,
    },
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
  sourceVersionId: 'source-version-homework-exact',
  availability: 'available',
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

export const ticket80HistoricalContextFixtures = {
  solo,
  homework,
  group: group([solo, homework]),
};

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
  if (
    (request.method === 'GET' || request.method === 'HEAD')
    && url.pathname === `/v1/book-delivery/historical-document/${bookId}`
      + `/${studentId}/${homework.summary.resultId}/${historicalRouteKey}`
    && request.headers.authorization?.startsWith('Bearer ')
  ) {
      const range = /^bytes=(\d+)-(\d*)$/u.exec(request.headers.range ?? '');
      const start = range ? Number(range[1]) : 0;
      const requestedEnd = range?.[2] ? Number(range[2]) : proofPdf.length - 1;
      const end = Math.min(requestedEnd, proofPdf.length - 1);
      const partial = Boolean(range);
      response.writeHead(partial ? 206 : 200, {
        ...cors(origin),
        'accept-ranges': 'bytes',
        'cache-control': 'private, no-store',
        'content-length': String(end - start + 1),
        ...(partial ? { 'content-range': `bytes ${start}-${end}/${proofPdf.length}` } : {}),
        'content-type': 'application/pdf',
        etag: '"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',
      });
      if (request.method === 'HEAD') response.end();
      else response.end(proofPdf.subarray(start, end + 1));
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
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
}
