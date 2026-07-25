import { createServer } from 'node:http';

const DEFAULT_UPSTREAM = 'https://r2-upload-signer.iamhuwng.workers.dev';
const ALLOWED_ORIGIN = 'http://localhost:5173';
const MAX_BODY_BYTES = 256 * 1024;
const VERSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ROUTES = new Set([
  '/api/material-books/successors/create',
  '/api/material-books/successors/archive',
]);

const json = (response, status, body, extraHeaders = {}) => {
  response.writeHead(status, {
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Content-Type': 'application/json',
    ...extraHeaders,
  });
  response.end(JSON.stringify(body));
};

const readBody = async (request) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.byteLength;
    if (size > MAX_BODY_BYTES) {
      throw new Error('body_too_large');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

export const createTicket20AOverrideProxy = ({
  versionId,
  upstream = DEFAULT_UPSTREAM,
  fetchImpl = globalThis.fetch,
}) => {
  if (!VERSION_ID.test(versionId)) {
    throw new Error('TICKET20A_VERSION_ID must be a Worker version UUID.');
  }
  const upstreamOrigin = new URL(upstream).origin;

  return createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      json(response, 200, { ready: true, versionId });
      return;
    }
    if (request.headers.origin !== ALLOWED_ORIGIN) {
      json(response, 403, { code: 'origin_forbidden' });
      return;
    }
    if (!ROUTES.has(url.pathname)) {
      json(response, 404, { code: 'not_found' });
      return;
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      });
      response.end();
      return;
    }
    if (request.method !== 'POST') {
      json(response, 405, { code: 'method_not_allowed' });
      return;
    }

    try {
      const body = await readBody(request);
      const upstreamResponse = await fetchImpl(`${upstreamOrigin}${url.pathname}`, {
        method: 'POST',
        headers: {
          Authorization: request.headers.authorization ?? '',
          'Cloudflare-Workers-Version-Overrides': `r2-upload-signer="${versionId}"`,
          'Content-Type': request.headers['content-type'] ?? 'application/json',
          'Idempotency-Key': request.headers['idempotency-key'] ?? '',
        },
        body,
      });
      const responseBody = await upstreamResponse.arrayBuffer();
      response.writeHead(upstreamResponse.status, {
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Content-Type': upstreamResponse.headers.get('content-type') ?? 'application/json',
      });
      response.end(Buffer.from(responseBody));
    } catch (error) {
      const code = error instanceof Error && error.message === 'body_too_large'
        ? 'body_too_large'
        : 'override_proxy_failed';
      json(response, code === 'body_too_large' ? 413 : 502, { code });
    }
  });
};
