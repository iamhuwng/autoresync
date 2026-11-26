import { describe, expect, it, vi } from 'vitest';
import {
  isApprovedLocalAppOrigin,
  isApprovedOrigin,
  parseSpareAllowedLocalhostOrigins,
} from '../src/upload-worker/cors-policy.js';
import { createUploadWorker } from '../worker.js';
import { createBookRouter, type CanonicalBookRouteDescriptor } from '../src/upload-worker/book-router.ts';
import { createBookDocumentWorker } from '../src/upload-worker/book-delivery/document-worker.ts';
import { buildListeningUploadSessionCorsHeaders } from '../src/upload-worker/listening-upload-session-contract.ts';
import { createStudentAuthWorkerHandlers } from '../src/upload-worker/student-auth/worker.ts';

const spareEnv = { SPARE_ALLOWED_LOCALHOST_PORTS: '5173-5182' };
const productionEnv = {};
const preflight = (origin: string, path = '/', method = 'POST', requestHeaders = 'authorization, content-type') => new Request(
  `https://worker.test${path}`,
  {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': method,
      'Access-Control-Request-Headers': requestHeaders,
    },
  },
);
const uploadWorker = createUploadWorker({
  firebaseVerifier: { verifyAuthorizationHeader: vi.fn(async () => ({ valid: false })) },
});
const uploadEnv = { ...spareEnv, UPLOAD_RATE_LIMITER: { limit: async () => ({ success: true }) } };

const bookDescriptor: CanonicalBookRouteDescriptor = {
  id: 'book.cors.test',
  methods: ['POST'],
  pathTemplate: '/book-delivery/test/:bookId',
  owner: '#test',
  domain: 'delivery',
  handler: 'book.cors.test',
  firebaseAuth: 'firebase-id-token',
  rateClass: 'book-control',
  requestBodyBytes: 1024,
  responseLimitBytes: 1024,
  source: 'contributor',
  contributorTicket: '#test',
};
const bookRouter = createBookRouter({ manifest: [bookDescriptor] });
const bookPreflight = (origin: string) => preflight(origin, '/book-delivery/test/book-1');
const documentWorker = createBookDocumentWorker({
  authorize: async () => ({ ok: false as const, status: 404 as const, code: 'not-found' as const }),
  provider: {} as never,
});
const studentHandlers = createStudentAuthWorkerHandlers();
const studentEnv = {
  STUDENT_AUTH_ROUTES_ENABLED: 'enabled',
  STUDENT_AUTH_ALLOWED_ORIGINS: 'https://app.example',
  ...spareEnv,
};

const expectUploadOrigin = async (origin: string, env: Record<string, unknown>, status: number) => {
  const response = await uploadWorker.fetch(preflight(origin), env);
  expect(response.status).toBe(status);
  return response;
};

describe('spare localhost CORS policy', () => {
  it('parses only bounded localhost port ranges and fails closed', () => {
    expect(parseSpareAllowedLocalhostOrigins(spareEnv)).toEqual(new Set(
      Array.from({ length: 10 }, (_, index) => `http://localhost:${5173 + index}`),
    ));
    expect(parseSpareAllowedLocalhostOrigins({ SPARE_ALLOWED_LOCALHOST_PORTS: '5173,5175-5176' })).toEqual(new Set([
      'http://localhost:5173',
      'http://localhost:5175',
      'http://localhost:5176',
    ]));
    for (const value of ['', ' ', '1-65535', '80-81', 'foo', '5182-5173', '5173-5182,foo', '5173,', '5173,,5182', '5173, ', ',5173', ' 5173', '5173, 5175']) {
      expect(parseSpareAllowedLocalhostOrigins({ SPARE_ALLOWED_LOCALHOST_PORTS: value })).toEqual(new Set());
    }
    expect(parseSpareAllowedLocalhostOrigins({})).toEqual(new Set());
    expect(isApprovedOrigin('http://localhost:5175', spareEnv)).toBe(true);
    expect(isApprovedOrigin('http://127.0.0.1:5175', spareEnv)).toBe(false);
    expect(isApprovedOrigin('https://localhost:5175', spareEnv)).toBe(false);
    expect(isApprovedOrigin('http://localhost.evil.com', spareEnv)).toBe(false);
    expect(isApprovedLocalAppOrigin('http://localhost:5175', spareEnv)).toBe(true);
    expect(isApprovedLocalAppOrigin('http://localhost:5175', productionEnv)).toBe(false);
  });

  it('honors spare origins in the upload worker and keeps production defaults locked', async () => {
    for (const origin of ['http://localhost:5173', 'http://localhost:5175', 'http://localhost:5182']) {
      const response = await expectUploadOrigin(origin, uploadEnv, 204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
      const post = await uploadWorker.fetch(new Request('https://worker.test/', {
        method: 'POST', headers: { Origin: origin },
      }), uploadEnv);
      expect(post.status).not.toBe(403);
      expect(post.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    }
    for (const origin of ['http://localhost:5183', 'http://localhost:54321', 'http://127.0.0.1:5175', 'https://localhost:5175', 'http://localhost.evil.com', 'https://evil.example', 'http://localhost:5175/']) {
      await expectUploadOrigin(origin, uploadEnv, 403);
    }
    for (const origin of ['http://localhost:5173', 'http://localhost:5174']) {
      await expectUploadOrigin(origin, productionEnv, 204);
    }
    for (const origin of ['http://localhost:5175', 'http://localhost:5182', 'http://localhost:54321']) {
      await expectUploadOrigin(origin, productionEnv, 403);
    }
  });

  it('threads spare origins through the Book router and document worker', async () => {
    for (const origin of ['http://localhost:5175', 'http://localhost:5182']) {
      expect((await bookRouter(bookPreflight(origin), spareEnv))?.status).toBe(204);
      expect((await documentWorker.fetch(preflight(origin, '/document', 'GET', 'authorization'), spareEnv)).status).toBe(204);
    }
    expect((await bookRouter(bookPreflight('http://localhost:5183'), spareEnv))?.status).toBe(403);
    expect((await documentWorker.fetch(preflight('http://localhost:5183', '/document', 'GET', 'authorization'), spareEnv)).status).toBe(403);
    expect((await documentWorker.fetch(preflight('http://localhost:5175', '/document', 'GET', 'authorization'), productionEnv)).status).toBe(403);
    expect((await documentWorker.fetch(preflight('http://localhost:5182', '/document', 'GET', 'authorization'), productionEnv)).status).toBe(403);
    for (const origin of ['http://localhost:5175', 'http://localhost:5182', 'http://localhost:54321']) {
      expect((await bookRouter(bookPreflight(origin), productionEnv))?.status).toBe(403);
    }
    expect(buildListeningUploadSessionCorsHeaders('http://localhost:5175', spareEnv)['Access-Control-Allow-Origin']).toBe('http://localhost:5175');
    expect(buildListeningUploadSessionCorsHeaders('http://localhost:5182', spareEnv)['Access-Control-Allow-Origin']).toBe('http://localhost:5182');
    expect(buildListeningUploadSessionCorsHeaders('http://localhost:5175', productionEnv)['Access-Control-Allow-Origin']).toBeUndefined();
    expect(buildListeningUploadSessionCorsHeaders('http://localhost:5182', productionEnv)['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('accepts configured spare origins in student auth and rejects lookalikes', async () => {
    for (const origin of ['http://localhost:5175', 'http://localhost:5182']) {
      const response = await studentHandlers.fetch(preflight(origin, '/auth/student/login'), studentEnv);
      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    }
    for (const origin of ['http://localhost:5183', 'http://127.0.0.1:5175', 'https://evil.example']) {
      const response = await studentHandlers.fetch(preflight(origin, '/auth/student/login'), studentEnv);
      expect(response.status).toBe(403);
    }
  });

  it('approves hosted spare QA origin only when spare project and localhost port binding are active', async () => {
    const hostedOrigin = 'https://luyentap-pdf-qa-20261021.web.app';
    const spareHostedEnv = { ...spareEnv, FIREBASE_PROJECT_ID: 'luyentap-pdf-qa-20261021' };

    expect((await bookRouter(bookPreflight(hostedOrigin), spareHostedEnv))?.status).toBe(204);
    expect((await documentWorker.fetch(preflight(hostedOrigin, '/document', 'GET', 'authorization'), spareHostedEnv)).status).toBe(204);

    for (const rejectedEnv of [
      productionEnv,
      { FIREBASE_PROJECT_ID: 'temp-a1437', ...spareEnv },
      { FIREBASE_PROJECT_ID: 'luyentap-pdf-qa-20261021' },
    ]) {
      expect((await bookRouter(bookPreflight(hostedOrigin), rejectedEnv))?.status).toBe(403);
      expect((await documentWorker.fetch(preflight(hostedOrigin, '/document', 'GET', 'authorization'), rejectedEnv)).status).toBe(403);
    }

    for (const lookalike of [
      'https://luyentap-pdf-qa-20261021.web.app.evil.com',
      'https://luyentap-pdf-qa-20261021.web.app/',
      'http://luyentap-pdf-qa-20261021.web.app',
      'https://luyentap-pdf-qa-20261021--qualification.web.app',
    ]) {
      expect((await bookRouter(bookPreflight(lookalike), spareHostedEnv))?.status).toBe(403);
      expect((await documentWorker.fetch(preflight(lookalike, '/document', 'GET', 'authorization'), spareHostedEnv)).status).toBe(403);
    }

    expect(isApprovedLocalAppOrigin(hostedOrigin, spareHostedEnv)).toBe(false);

    for (const prodOrigin of ['https://kahut1.web.app', 'https://hocthem.net', 'https://www.hocthem.net']) {
      expect(isApprovedOrigin(prodOrigin, spareHostedEnv)).toBe(false);
      expect((await bookRouter(bookPreflight(prodOrigin), spareHostedEnv))?.status).toBe(403);
      expect((await uploadWorker.fetch(preflight(prodOrigin), { ...uploadEnv, FIREBASE_PROJECT_ID: 'luyentap-pdf-qa-20261021' })).status).toBe(403);
    }
  });

  it('threads spare localhost ports through book source-upload routes and strips ACAO on denied origins', async () => {
    const sourceUploadDescriptor: CanonicalBookRouteDescriptor = {
      id: 'book.source-upload.attach',
      methods: ['POST'],
      pathTemplate: '/v1/book-source/books/:bookId/source-set/attach',
      owner: '#49',
      domain: 'source-upload',
      handler: 'bookSource.attach',
      firebaseAuth: 'firebase-id-token-teacher',
      rateClass: 'book-control',
      requestBodyBytes: 1024,
      responseLimitBytes: 1024,
      source: 'contributor',
      contributorTicket: '#49',
    };
    const sourceRouter = createBookRouter({ manifest: [sourceUploadDescriptor] });
    const sourcePath = '/v1/book-source/books/book-1/source-set/attach';
    const spareSourceEnv = {
      ...spareEnv,
      FIREBASE_PROJECT_ID: 'luyentap-pdf-qa-20261021',
      BOOK_SOURCE_CONTROL_ALLOWED_ORIGIN: 'http://localhost:5173,http://localhost:5174,https://luyentap-pdf-qa-20261021.web.app',
    };
    const prodSourceEnv = {
      FIREBASE_PROJECT_ID: 'temp-a1437',
      BOOK_SOURCE_CONTROL_ALLOWED_ORIGIN: 'https://kahut1.web.app',
    };

    for (const origin of ['http://localhost:5173', 'http://localhost:5175', 'http://localhost:5182', 'https://luyentap-pdf-qa-20261021.web.app']) {
      const response = await sourceRouter(preflight(origin, sourcePath), spareSourceEnv);
      expect(response?.status).toBe(204);
      expect(response?.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    }

    for (const origin of ['http://localhost:5183', 'https://kahut1.web.app', 'https://evil.example']) {
      const response = await sourceRouter(preflight(origin, sourcePath), spareSourceEnv);
      expect(response?.status).toBe(403);
      expect(response?.headers.get('Access-Control-Allow-Origin')).toBeNull();
    }

    const prodAllowed = await sourceRouter(preflight('https://kahut1.web.app', sourcePath), prodSourceEnv);
    expect(prodAllowed?.status).toBe(204);
    expect(prodAllowed?.headers.get('Access-Control-Allow-Origin')).toBe('https://kahut1.web.app');

    for (const origin of ['http://localhost:5173', 'http://localhost:5175', 'http://localhost:5182']) {
      const response = await sourceRouter(preflight(origin, sourcePath), prodSourceEnv);
      expect(response?.status).toBe(403);
      expect(response?.headers.get('Access-Control-Allow-Origin')).toBeNull();
    }
  });
});
