import { exportPKCS8, generateKeyPair } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  createFirebaseBookResultProjectionWriter,
  type BookResultProjectionWriter,
} from '../src/upload-worker/book-results/production-projection.ts';
import {
  bookResultAttemptsPath,
  bookResultDetailPath,
  bookResultGroupsPath,
} from '../src/upload-worker/book-results/repository.ts';
import type {
  BookResultAttemptSummary,
  BookResultProjection,
} from '../../src/services/book-activity/results/bookResult.types.ts';
import { bookResultGroupKey } from '../../src/services/book-activity/results/bookResult.types.ts';

const BOOK_ID = 'book-concurrency';
const STUDENT_ID = 'student-concurrency';
const ACTIVITY_ID = 'activity-concurrency';
const GROUP_KEY = bookResultGroupKey(STUDENT_ID, ACTIVITY_ID);
const STUDENT_GROUP_PATH = `${bookResultGroupsPath({ studentId: STUDENT_ID, bookId: BOOK_ID })}/${GROUP_KEY}`;
const STUDENT_ATTEMPTS_PATH = bookResultAttemptsPath({
  studentId: STUDENT_ID,
  bookId: BOOK_ID,
  groupKey: GROUP_KEY,
});
const HOMEWORK_GROUP_PATH = `${bookResultGroupsPath({
  studentId: STUDENT_ID,
  bookId: BOOK_ID,
  homeworkId: 'homework-concurrency',
})}/${GROUP_KEY}`;

const projection = (
  attemptId: string,
  attemptNumber: number,
  submittedAt: string,
): BookResultProjection => {
  const summary: BookResultAttemptSummary = {
    schemaVersion: 1,
    studentId: STUDENT_ID,
    surface: 'homework',
    deliveryContextId: 'homework-concurrency',
    deliveryId: 'delivery-concurrency',
    ownerId: 'teacher-concurrency',
    homeworkId: 'homework-concurrency',
    bookId: BOOK_ID,
    attemptId,
    resultId: `${attemptId}:result`,
    completionId: `${attemptId}:completion`,
    recipientId: STUDENT_ID,
    activityId: ACTIVITY_ID,
    contextId: 'homework-concurrency',
    placementId: 'placement-concurrency',
    bindingId: 'binding-concurrency',
    bindingRevision: 1,
    activityVersionId: 'activity-version-concurrency',
    activityVersion: 1,
    interactionId: 'interaction-concurrency',
    attemptNumber,
    pageGroupKeys: ['page-group-concurrency'],
    sourceProvenance: [{ sourceKey: 'full', sourceVersionId: 'source-concurrency', pages: [1] }],
    sources: [{
      sourceKey: 'full',
      componentId: 'full',
      sourceVersionId: 'source-concurrency',
      pages: [1],
      availability: 'available',
      available: true,
      displayOnly: true,
    }],
    sourceAvailability: 'available',
    sourceAvailable: true,
    attemptSourceContext: {
      schemaVersion: 1,
      sourceVersionId: 'source-concurrency',
      sourceKey: 'full',
      pageGroupKeys: ['page-group-concurrency'],
      sourcePages: [1],
      availability: 'available',
    },
    createdAt: submittedAt,
    submittedAt,
    completedAt: submittedAt,
    resultStatus: 'submitted',
    evaluationStatus: 'submitted',
    completionStatus: 'completed',
    completion: {
      completionId: `${attemptId}:completion`,
      attemptId,
      resultId: `${attemptId}:result`,
      status: 'completed',
      contextId: 'homework-concurrency',
      placementId: 'placement-concurrency',
      activityVersionId: 'activity-version-concurrency',
      activityVersion: 1,
      createdAt: submittedAt,
    },
    evaluation: { status: 'submitted' },
    feedback: { release: 'pending', available: false },
    attemptLimit: null,
    attemptsUsed: attemptNumber,
    attemptsRemaining: null,
  };
  return {
    schemaVersion: 1,
    summary,
    detail: { ...summary, response: { choice: attemptNumber === 1 ? 'A' : 'B' } },
  };
};

const response = (body: unknown, headers: Record<string, string> = {}): Response => (
  new Response(body === null ? 'null' : JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
  })
);

describe('production Book result projection concurrency', () => {
  it('retries a stale group ETag after a concurrent attempt and preserves both rows', async () => {
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });
    const serviceIdentity = 'book-result-concurrency@synthetic.iam.gserviceaccount.com';
    const serviceAccountJson = JSON.stringify({
      client_email: serviceIdentity,
      private_key: await exportPKCS8(privateKey),
    });
    const values = new Map<string, unknown>();
    const versions = new Map<string, number>();
    let writerB: BookResultProjectionWriter;
    let interleaved = false;
    let staleCasFailures = 0;
    let groupEtagReads = 0;

    const valueAt = (path: string): unknown => {
      const direct = values.get(path);
      if (direct !== undefined) return structuredClone(direct);
      const prefix = `${path}/`;
      const children = [...values.entries()]
        .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
        .map(([key, value]) => [key.slice(prefix.length), structuredClone(value)] as const);
      return children.length > 0 ? Object.fromEntries(children) : null;
    };
    const etagAt = (path: string): string => `"v${versions.get(path) ?? 0}"`;
    const pathFromRequest = (input: RequestInfo | URL): string => {
      const pathname = new URL(String(input)).pathname;
      const encoded = pathname.replace(/^\//u, '').replace(/\.json$/u, '');
      return encoded.split('/').filter(Boolean).map(decodeURIComponent).join('/');
    };

    const fetchImpl: typeof fetch = async (input, init) => {
      const requestUrl = new URL(String(input));
      if (requestUrl.hostname === 'identitytoolkit.googleapis.com') {
        return response({ idToken: 'synthetic-firebase-id-token', expiresIn: '3600' });
      }

      const path = pathFromRequest(input);
      const method = init?.method ?? 'GET';
      const headers = new Headers(init?.headers);
      if (method === 'GET') {
        const etag = etagAt(path);
        const withEtag = headers.get('X-Firebase-ETag') === 'true';
        if (withEtag && path === STUDENT_GROUP_PATH) {
          groupEtagReads += 1;
          if (!interleaved) {
            interleaved = true;
            const staleGroup = valueAt(path);
            const staleEtag = etag;
            await writerB.write({ bookId: BOOK_ID, projection: projection('attempt-b', 2, '2026-09-13T00:02:00.000Z') });
            return response(staleGroup, { etag: staleEtag });
          }
        }
        return response(valueAt(path), withEtag ? { etag } : {});
      }
      if (method !== 'PUT') return new Response('', { status: 405 });

      const expectedEtag = headers.get('if-match');
      const currentEtag = etagAt(path);
      if (expectedEtag !== currentEtag) {
        if (path === STUDENT_GROUP_PATH) staleCasFailures += 1;
        return new Response('', { status: 412 });
      }
      const body = JSON.parse(String(init?.body ?? 'null')) as unknown;
      values.set(path, body);
      versions.set(path, (versions.get(path) ?? 0) + 1);
      return response(null);
    };

    const env = {
      FIREBASE_DB_URL: 'https://synthetic-firebase.test',
      FIREBASE_PROJECT_ID: 'synthetic-project',
      FIREBASE_WEB_API_KEY: 'synthetic-web-key',
      BOOK_RESULT_READ_SERVICE_IDENTITY: serviceIdentity,
      BOOK_RESULT_READ_GOOGLE_SA_KEY: serviceAccountJson,
    };
    const writerA = createFirebaseBookResultProjectionWriter(env, fetchImpl);
    writerB = createFirebaseBookResultProjectionWriter(env, fetchImpl);

    await writerA.write({
      bookId: BOOK_ID,
      projection: projection('attempt-a', 1, '2026-09-13T00:01:00.000Z'),
    });

    const attempts = valueAt(STUDENT_ATTEMPTS_PATH) as Record<string, BookResultAttemptSummary>;
    const finalGroup = valueAt(STUDENT_GROUP_PATH) as {
      attemptCount: number;
      latestAttemptId: string;
      latestResultId: string;
      latestAttemptNumber: number;
    };

    expect(interleaved).toBe(true);
    expect(groupEtagReads).toBeGreaterThanOrEqual(2);
    expect(staleCasFailures).toBe(1);
    expect(Object.keys(attempts)).toEqual(expect.arrayContaining(['attempt-a:result', 'attempt-b:result']));
    expect(finalGroup).toMatchObject({
      attemptCount: 2,
      latestAttemptId: 'attempt-b',
      latestResultId: 'attempt-b:result',
      latestAttemptNumber: 2,
    });
    expect((valueAt(`${STUDENT_ATTEMPTS_PATH}/attempt-a:result`) as BookResultAttemptSummary).attemptId).toBe('attempt-a');
    expect((valueAt(`${STUDENT_ATTEMPTS_PATH}/attempt-b:result`) as BookResultAttemptSummary).attemptId).toBe('attempt-b');
    expect(valueAt(bookResultDetailPath('attempt-a:result'))).not.toBeNull();
    expect(valueAt(HOMEWORK_GROUP_PATH)).not.toBeNull();
  });
});
