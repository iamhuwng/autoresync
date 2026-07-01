const APPROVED_ORIGINS = new Set([
  'https://kahut1.web.app',
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

const headerList = (value) =>
  value
    .split(',')
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);

const varyOriginHeaders = { Vary: 'Origin' };

export const corsResponseHeaders = (request) => {
  const origin = request.headers.get('Origin');
  if (!origin || !APPROVED_ORIGINS.has(origin)) return {};

  return {
    ...varyOriginHeaders,
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': Array.from(ALLOWED_METHODS).join(', '),
    'Access-Control-Allow-Headers': ALLOWED_HEADERS.join(', '),
  };
};

export const rejectDisallowedActualOrigin = (request) => {
  const origin = request.headers.get('Origin');
  if (!origin || APPROVED_ORIGINS.has(origin)) return null;

  return new Response(null, {
    status: 403,
    headers: varyOriginHeaders,
  });
};

export const handleCorsPreflight = (request) => {
  const origin = request.headers.get('Origin');
  if (!origin || !APPROVED_ORIGINS.has(origin)) {
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
    headers: corsResponseHeaders(request),
  });
};
