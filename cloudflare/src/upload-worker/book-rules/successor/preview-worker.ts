import { createFirebaseVerifier } from '../../firebase-verification.js';
import { createBookSuccessorWorkerHandlers } from './worker.ts';

interface PreviewEnv {
  readonly FIREBASE_PROJECT_ID?: string;
  readonly FIREBASE_DB_URL?: string;
  readonly GOOGLE_SA_KEY?: string;
  readonly BOOK_SUCCESSOR_SERVICE_IDENTITY?: string;
  readonly BOOK_SUCCESSOR_GOOGLE_SA_KEY?: string;
}

const headers = {
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': 'http://localhost:5173',
  'Content-Type': 'application/json',
};

const json = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });

const actionFor = (request: Request): 'create' | 'archive' | null => {
  if (request.method !== 'POST') return null;
  const path = new URL(request.url).pathname;
  if (path === '/api/material-books/successors/create') return 'create';
  if (path === '/api/material-books/successors/archive') return 'archive';
  return null;
};

export const createBookSuccessorPreviewWorker = (options: {
  readonly verifier?: ReturnType<typeof createFirebaseVerifier>;
  readonly handlers?: ReturnType<typeof createBookSuccessorWorkerHandlers>;
} = {}) => ({
  async fetch(request: Request, env: PreviewEnv): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }
    const action = actionFor(request);
    if (!action) {
      return json({ code: 'not_found' }, { status: 404 });
    }

    const authorization = await (options.verifier ?? createFirebaseVerifier())
      .verifyAuthorizationHeader(request.headers.get('Authorization'), env);
    if (!authorization.valid || !authorization.uid) {
      return json({ code: authorization.reason ?? 'unauthorized' }, { status: 401 });
    }

    const result = await (options.handlers ?? createBookSuccessorWorkerHandlers())[action]({
      request,
      env,
      verifiedUid: authorization.uid,
    });
    return json(result.body, result.init);
  },
});

export default createBookSuccessorPreviewWorker();
