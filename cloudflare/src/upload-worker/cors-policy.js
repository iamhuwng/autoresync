const PRODUCTION_APP_ORIGINS = new Set([
  'https://kahut1.web.app',
  'https://hocthem.net',
  'https://www.hocthem.net',
]);

const APPROVED_ORIGINS = new Set([
  ...PRODUCTION_APP_ORIGINS,
  'http://localhost:5173',
  'http://localhost:5174',
]);

const ALLOWED_METHODS = new Set(['OPTIONS', 'POST', 'PUT']);
const ALLOWED_HEADERS = [
  'Authorization',
  'Content-Type',
  'Content-Length',
  'Idempotency-Key',
  'X-Upload-Size',
];

const DOCUMENT_METHODS = new Set(['OPTIONS', 'GET', 'HEAD']);
const DOCUMENT_HEADERS = ['Authorization', 'Range'];
const DOCUMENT_EXPOSED_HEADERS = [
  'Accept-Ranges',
  'Content-Length',
  'Content-Range',
  'Content-Type',
  'ETag',
];

const headerList = (value) =>
  value
    .split(',')
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);

const varyOriginHeaders = { Vary: 'Origin' };

export const parseSpareAllowedLocalhostOrigins = (env) => {
  const raw = env?.SPARE_ALLOWED_LOCALHOST_PORTS;
  if (typeof raw !== 'string' || raw === '' || raw.trim() !== raw) {
    return new Set();
  }

  const origins = new Set();
  let expandedPorts = 0;
  for (const token of raw.split(',')) {
    const match = /^(?:([1-9]\d{0,4})(?:-([1-9]\d{0,4}))?)$/u.exec(token);
    if (!match) return new Set();
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (start < 1024 || end > 65535 || start > end || end - start + 1 > 32) {
      return new Set();
    }
    expandedPorts += end - start + 1;
    if (expandedPorts > 32) return new Set();
    for (let port = start; port <= end; port += 1) {
      origins.add(`http://localhost:${port}`);
    }
  }
  return origins;
};

const SPARE_FIREBASE_PROJECT_ID = 'luyentap-pdf-qa-20261021';
const SPARE_HOSTED_ORIGINS = new Set([
  'https://luyentap-pdf-qa-20261021.web.app',
]);

const isSpareHostedOrigin = (origin, env) => (
  env?.FIREBASE_PROJECT_ID === SPARE_FIREBASE_PROJECT_ID
  && parseSpareAllowedLocalhostOrigins(env).size > 0
  && SPARE_HOSTED_ORIGINS.has(origin)
);

export const isApprovedOrigin = (origin, env) => (
  typeof origin === 'string'
  && (APPROVED_ORIGINS.has(origin)
    || parseSpareAllowedLocalhostOrigins(env).has(origin)
    || isSpareHostedOrigin(origin, env))
);

export const isApprovedProductionAppOrigin = (origin) => (
  typeof origin === 'string' && PRODUCTION_APP_ORIGINS.has(origin)
);

export const isApprovedLocalAppOrigin = (origin, env) => (
  typeof origin === 'string'
  && (origin === 'http://localhost:5173'
    || origin === 'http://localhost:5174'
    || parseSpareAllowedLocalhostOrigins(env).has(origin))
);

export const corsResponseHeaders = (request, env) => {
  const origin = request.headers.get('Origin');
  if (!origin || !isApprovedOrigin(origin, env)) return {};

  return {
    ...varyOriginHeaders,
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': Array.from(ALLOWED_METHODS).join(', '),
    'Access-Control-Allow-Headers': ALLOWED_HEADERS.join(', '),
  };
};

export const rejectDisallowedActualOrigin = (request, env) => {
  const origin = request.headers.get('Origin');
  if (!origin || isApprovedOrigin(origin, env)) return null;

  return new Response(null, {
    status: 403,
    headers: varyOriginHeaders,
  });
};

export const handleCorsPreflight = (request, env) => {
  const origin = request.headers.get('Origin');
  if (!origin || !isApprovedOrigin(origin, env)) {
    return new Response(null, { status: 403, headers: varyOriginHeaders });
  }

  const requestedMethod = request.headers
    .get('Access-Control-Request-Method')
    ?.toUpperCase();
  if (!requestedMethod || !ALLOWED_METHODS.has(requestedMethod)) {
    return new Response(null, { status: 405, headers: varyOriginHeaders });
  }

  const requestedHeaders = headerList(
    request.headers.get('Access-Control-Request-Headers') ?? '',
  );
  const allowedHeaderNames = new Set(
    ALLOWED_HEADERS.map((header) => header.toLowerCase()),
  );
  if (requestedHeaders.some((header) => !allowedHeaderNames.has(header))) {
    return new Response(null, { status: 403, headers: varyOriginHeaders });
  }

  return new Response(null, {
    status: 204,
    headers: corsResponseHeaders(request, env),
  });
};

const documentVaryHeaders = {
  Vary: 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
};

export const documentCorsHeaders = (request, env) => {
  const origin = request.headers.get('Origin');
  if (!origin || !isApprovedOrigin(origin, env)) return new Headers(documentVaryHeaders);
  return new Headers({
    ...documentVaryHeaders,
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': Array.from(DOCUMENT_METHODS).join(', '),
    'Access-Control-Allow-Headers': DOCUMENT_HEADERS.join(', '),
    'Access-Control-Expose-Headers': DOCUMENT_EXPOSED_HEADERS.join(', '),
  });
};

export const rejectDocumentCorsOrigin = (request, env) => {
  const origin = request.headers.get('Origin');
  if (!origin || isApprovedOrigin(origin, env)) return null;
  return new Response(null, { status: 403, headers: documentCorsHeaders(request, env) });
};

export const documentCorsPreflight = (request, env) => {
  const origin = request.headers.get('Origin');
  if (!origin || !isApprovedOrigin(origin, env)) {
    return new Response(null, { status: 403, headers: documentCorsHeaders(request, env) });
  }
  const requestedMethod = request.headers.get('Access-Control-Request-Method')?.toUpperCase();
  if (!requestedMethod || !DOCUMENT_METHODS.has(requestedMethod)) {
    return new Response(null, { status: 405, headers: documentCorsHeaders(request, env) });
  }
  const allowed = new Set(DOCUMENT_HEADERS.map((header) => header.toLowerCase()));
  const requestedHeaders = headerList(request.headers.get('Access-Control-Request-Headers') ?? '');
  if (requestedHeaders.some((header) => !allowed.has(header))) {
    return new Response(null, { status: 403, headers: documentCorsHeaders(request, env) });
  }
  return new Response(null, { status: 204, headers: documentCorsHeaders(request, env) });
};
