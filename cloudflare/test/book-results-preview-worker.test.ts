import { describe, expect, it } from 'vitest';
import {
  createTicket77PreviewWorker,
  ticket77PreviewFixture,
  type Ticket77PreviewEnv,
} from '../src/upload-worker/book-results/preview-worker.ts';

const key = JSON.stringify({
  client_email: 'ticket77-preview@invalid.example',
  private_key: 'preview-only-noncredential',
});

const env = {
  FIREBASE_PROJECT_ID: 'temp-a1437',
  BOOK_RESULT_READ_ROUTES_ENABLED: 'enabled',
  BOOK_RESULT_READ_SERVICE_IDENTITY: 'ticket77-preview@invalid.example',
  BOOK_RESULT_READ_GOOGLE_SA_KEY: key,
  TICKET77_STUDENT_UID: ticket77PreviewFixture.studentId,
  TICKET77_TEACHER_UID: ticket77PreviewFixture.teacherId,
  TICKET77_HOMEWORK_ID: ticket77PreviewFixture.homeworkId,
  BOOK_ROUTE_RATE_LIMITER: {
    limit: async () => ({ success: true }),
  },
} satisfies Ticket77PreviewEnv;

const worker = createTicket77PreviewWorker({
  firebaseVerifier: {
    verifyAuthorizationHeader: (header) => {
      if (header === 'Bearer student-token') {
        return { valid: true, uid: ticket77PreviewFixture.studentId };
      }
      if (header === 'Bearer teacher-token') {
        return { valid: true, uid: ticket77PreviewFixture.teacherId };
      }
      return { valid: false };
    },
  },
});

const read = async (
  path: string,
  token: 'student-token' | 'teacher-token',
  origin = 'http://localhost:5174',
) => {
  const response = await worker.fetch!(
    new Request(`https://ticket77-preview.example.test${path}`, {
      headers: {
        authorization: `Bearer ${token}`,
        origin,
      },
    }),
    env,
    {} as ExecutionContext,
  );
  return {
    response,
    body: await response.json() as Record<string, unknown>,
  };
};

describe('Ticket #77 disposable preview Worker', () => {
  it('uses the canonical router for one indexed student group and selected detail', async () => {
    const base = `/v1/book-evaluation/results/${ticket77PreviewFixture.bookId}`
      + `/${ticket77PreviewFixture.studentId}`;
    const grouped = await read(
      `${base}/groups/${ticket77PreviewFixture.groupKey}`,
      'student-token',
    );
    expect(grouped.response.status).toBe(200);
    expect(grouped.response.headers.get('access-control-allow-origin'))
      .toBe('http://localhost:5174');
    expect(grouped.body.group).toMatchObject({
      attemptCount: 2,
      latestAttemptId: 'attempt-homework-1',
    });

    const detail = await read(
      `${base}/details/${ticket77PreviewFixture.soloResultId}`,
      'student-token',
    );
    expect(detail.response.status).toBe(200);
    expect(JSON.stringify(detail.body)).toContain('Solo response retained after source deletion');
    expect(JSON.stringify(detail.body)).not.toMatch(
      /answer.?key|pdf|provider|storage|signed.?url|access.?token/iu,
    );
  });

  it('scopes an owning teacher to current Homework and denies private Solo', async () => {
    const base = `/v1/book-evaluation/results/${ticket77PreviewFixture.bookId}`
      + `/${ticket77PreviewFixture.studentId}`;
    const scoped = `${base}/homework/${ticket77PreviewFixture.homeworkId}`;
    const grouped = await read(
      `${scoped}/groups/${ticket77PreviewFixture.groupKey}`,
      'teacher-token',
      'http://localhost:5173',
    );
    expect(grouped.response.status).toBe(200);
    expect(grouped.body.group).toMatchObject({
      attemptCount: 1,
      latestAttemptId: 'attempt-homework-1',
    });
    expect(JSON.stringify(grouped.body)).not.toContain('attempt-solo-1');

    const privateSolo = await read(
      `${base}/details/${ticket77PreviewFixture.soloResultId}`,
      'teacher-token',
      'http://localhost:5173',
    );
    expect(privateSolo.response.status).toBe(403);
    expect(privateSolo.body).toEqual({
      code: 'book_result_teacher_homework_required',
    });
  });

  it('excludes withheld feedback and rejects query-string authority', async () => {
    const base = `/v1/book-evaluation/results/${ticket77PreviewFixture.bookId}`
      + `/${ticket77PreviewFixture.studentId}`;
    const student = await read(
      `${base}/groups/${ticket77PreviewFixture.groupKey}`,
      'student-token',
    );
    const serialized = JSON.stringify(student.body);
    expect(serialized).toContain('"release":"withheld","available":false');
    expect(serialized).not.toContain('withheld feedback text');

    const queryAuthority = await read(
      `${base}/groups/${ticket77PreviewFixture.groupKey}`
        + `?homeworkId=${ticket77PreviewFixture.homeworkId}`,
      'teacher-token',
      'http://localhost:5173',
    );
    expect(queryAuthority.response.status).toBe(404);
    expect(queryAuthority.body).toEqual({ code: 'book_route_not_found' });
  });
});
