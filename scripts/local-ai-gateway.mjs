import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';

const projectId = 'demo-luyentap-local';
const port = Number(process.env.LOCAL_AI_GATEWAY_PORT || 8789);
const allowedOrigin = process.env.LOCAL_VITE_ORIGIN || 'http://localhost:5173';
const maxBodyBytes = 180_000;
const geminiModel = 'gemini-2.5-flash';

const envRoot = process.env.LUYENTAP_ENV_DIR || path.join(os.homedir(), '.luyentap', 'env');
for (const name of ['.env', '.env.local', '.env.development', '.env.development.local']) {
  loadDotenv({ path: path.join(envRoot, name), override: false });
}

const keyIdFor = (provider, index) => `00000000-0000-4000-8000-${provider === 'gemini' ? '1' : '2'}${String(index).padStart(11, '0')}`;

const loadKeys = () => {
  const keys = [];
  for (let index = 1; index <= 5; index += 1) {
    const value = process.env[`VITE_GEMINI_API_KEY_${index}`]?.trim();
    if (value) keys.push({ id: keyIdFor('gemini', index), provider: 'gemini', key: value, label: `Local Gemini ${index}` });
  }
  const groq = process.env.VITE_GROQ_API_KEY?.trim();
  if (groq) keys.push({ id: keyIdFor('groq', 1), provider: 'groq', key: groq, label: 'Local Groq' });
  return keys;
};

const keys = loadKeys();
const publicKey = ({ id, provider, label }, index) => ({
  id,
  provider,
  label,
  keyPreview: `local-${index + 1}`,
  createdAt: index + 1,
  createdBy: 'local-dev',
  isActive: true,
});

const decodeBase64Url = (value) => Buffer.from(value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4), 'base64').toString('utf8');

const authenticate = (request) => {
  const header = request.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  try {
    const [, encodedPayload] = header.slice(7).trim().split('.');
    const payload = JSON.parse(decodeBase64Url(encodedPayload));
    const now = Math.floor(Date.now() / 1000);
    if (payload?.aud !== projectId || payload?.iss !== `https://securetoken.google.com/${projectId}`
      || typeof payload.sub !== 'string' || !payload.sub || !Number.isFinite(payload.exp) || payload.exp <= now) return null;
    return { uid: payload.sub };
  } catch {
    return null;
  }
};

const responseHeaders = (request) => ({
  'Access-Control-Allow-Origin': request.headers.origin === allowedOrigin ? allowedOrigin : allowedOrigin,
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
});

const sendJson = (request, response, body, status = 200) => {
  response.writeHead(status, responseHeaders(request));
  response.end(JSON.stringify(body));
};

const readJson = async (request) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) throw new Error('body_too_large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

const providerKey = (provider, keyId) => keys.find((entry) => entry.provider === provider && entry.id === keyId);

const normalizeGeminiPayload = (body) => {
  const promptParts = typeof body.prompt === 'string' ? [{ text: body.prompt }] : body.prompt;
  if (!Array.isArray(promptParts) || promptParts.length === 0 || promptParts.some((part) => typeof part?.text !== 'string')) return null;
  if (body.generationConfig && (typeof body.generationConfig !== 'object' || Array.isArray(body.generationConfig))) return null;
  return {
    contents: [{ role: 'user', parts: promptParts }],
    ...(typeof body.systemInstruction === 'string' && body.systemInstruction.trim()
      ? { systemInstruction: { parts: [{ text: body.systemInstruction }] } } : {}),
    generationConfig: body.generationConfig ?? {},
  };
};

const proxyGemini = async (request, response, body) => {
  const entry = providerKey('gemini', body.keyId);
  if (!entry || body.model !== geminiModel) return sendJson(request, response, { error: 'key_unavailable' }, 404);
  const payload = normalizeGeminiPayload(body);
  if (!payload) return sendJson(request, response, { error: 'invalid_request' }, 400);
  const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(entry.key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await upstream.text();
  response.writeHead(upstream.status, { ...responseHeaders(request), 'Content-Type': upstream.headers.get('content-type') || 'application/json' });
  response.end(text);
};

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') return sendJson(request, response, {}, 204);
  const auth = authenticate(request);
  if (!auth) return sendJson(request, response, { error: 'Unauthorized' }, 401);
  try {
    if (request.method === 'GET' && request.url === '/ai/keys') {
      return sendJson(request, response, { keys: keys.map(publicKey) });
    }
    if (request.method === 'POST' && request.url === '/ai/gemini') {
      return proxyGemini(request, response, await readJson(request));
    }
    return sendJson(request, response, { error: 'not_found' }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'provider_unavailable';
    console.error(`[Local AI] ${request.method} ${request.url} failed: ${message}`);
    return sendJson(request, response, { error: message === 'body_too_large' ? message : 'provider_unavailable' }, message === 'body_too_large' ? 413 : 503);
  }
});

server.listen(port, 'localhost', () => {
  console.log(`[Local AI] Gateway listening on http://localhost:${port} with ${keys.filter((entry) => entry.provider === 'gemini').length} Gemini key(s).`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
