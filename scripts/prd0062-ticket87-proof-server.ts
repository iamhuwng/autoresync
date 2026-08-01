import { createServer } from 'node:http';
import { resolveBookScheduleWindow } from '../src/services/book-delivery/bookScheduleWindow.service';

type ProofState = 'unreleased' | 'available' | 'overdue' | 'late-allowed' | 'review';

let state: ProofState = 'available';

const decision = () => resolveBookScheduleWindow({
  assignmentId: 'homework-fixture',
  recipientId: 'student-fixture',
  bindingId: 'binding-student-fixture',
  bindingRevision: 3,
  placementId: 'placement-choice',
  activityId: 'activity-choice',
  activityVersion: 3,
  nodeKey: 'group-1',
  operation: 'launch',
  schedule: {
    schemaVersion: 1,
    resolverVersion: 1,
    availableFrom: '2026-07-31T00:00:00.000Z',
    finalDueAt: '2026-08-05T00:00:00.000Z',
    scheduleRules: [{
      nodeKey: 'group-1',
      availableFrom: '2026-08-02T00:00:00.000Z',
      dueAt: '2026-08-05T00:00:00.000Z',
    }],
  },
  outline: [
    { nodeKey: 'group-1', parentNodeKey: null, nodeType: 'unit', order: 1 },
  ],
  studentExtensions: {},
  lateSubmissionAllowed: state === 'late-allowed',
  policyRevision: 4,
  authorityRevision: 7,
  evaluatedAt: state === 'unreleased' || state === 'review'
    ? '2026-08-01T00:00:00.000Z'
    : state === 'available'
      ? '2026-08-03T00:00:00.000Z'
      : '2026-08-06T00:00:00.000Z',
  completed: state === 'review',
});

const cors = {
  'Access-Control-Allow-Origin': 'http://localhost:5174',
  'Access-Control-Allow-Headers': 'authorization,content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
};

createServer((request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, cors);
    response.end();
    return;
  }
  if (request.method === 'POST' && request.url === '/__proof/control') {
    let body = '';
    request.on('data', (chunk) => { body += String(chunk); });
    request.on('end', () => {
      const candidate = JSON.parse(body) as { state?: ProofState };
      if (!candidate.state
        || !['unreleased', 'available', 'overdue', 'late-allowed', 'review'].includes(candidate.state)) {
        response.writeHead(400, cors);
        response.end(JSON.stringify({ code: 'invalid_state' }));
        return;
      }
      state = candidate.state;
      response.writeHead(200, cors);
      response.end(JSON.stringify({ state }));
    });
    return;
  }
  if (request.method === 'GET' && request.url === '/__proof/health') {
    response.writeHead(200, cors);
    response.end(JSON.stringify({ status: 'ready' }));
    return;
  }
  if (request.method === 'GET'
    && request.url === '/v1/book-delivery/student-fixture/homework-fixture'
    && request.headers.authorization === 'Bearer student-fixture-token') {
    const scheduleWindow = decision();
    response.writeHead(200, cors);
    response.end(JSON.stringify({
      schemaVersion: 1,
      projectionKind: 'book-runtime-delivery',
      bindingId: 'binding-student-fixture',
      bindingRevision: 3,
      recipientId: 'student-fixture',
      context: { contextId: 'homework-fixture', kind: 'homework', entitlementBasis: 'assignment' },
      activities: [{
        placementId: 'placement-choice',
        activityId: 'activity-choice',
        activityVersion: 3,
        scheduleWindow,
      }],
      actionFlags: {
        canAutosave: scheduleWindow.permissions.canAutosave,
        canSubmit: scheduleWindow.permissions.canSubmit,
        canReview: scheduleWindow.permissions.canReview,
      },
    }));
    return;
  }
  response.writeHead(404, cors);
  response.end(JSON.stringify({ code: 'not_found' }));
}).listen(5187, '0.0.0.0');
