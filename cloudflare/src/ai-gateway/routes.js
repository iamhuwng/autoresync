const KEY_PREFIX = 'ai-key:';
const MAX_REQUEST_BYTES = 180_000;
const GEMINI_RELAY_URL = 'https://gemini-us-relay.hocthem.deno.net/generateContent';
const MODELS = {
  groq: new Set(['qwen/qwen3.8-27b']),
  gemini: new Set(['gemini-2.5-flash']),
};

const json = (body, status = 200) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});

async function readJson(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_REQUEST_BYTES) return null;
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function listKeys(env) {
  const result = await env.AI_KEYS.list({ prefix: KEY_PREFIX, limit: 100 });
  if (!result.list_complete) throw new Error('key_limit_exceeded');
  return result.keys.map(({ metadata }) => metadata).filter(Boolean);
}

function validProvider(provider) {
  return provider === 'gemini' || provider === 'groq';
}

function validModel(provider, model) {
  return MODELS[provider]?.has(model) === true;
}

function safeMetadata(entry) {
  const { key: _key, ...metadata } = entry;
  return metadata;
}

async function manageKeys(request, env, auth, isAdmin, path) {
  if (request.method === 'GET' && path === '/ai/keys') {
    const keys = await listKeys(env);
    return json({ keys: isAdmin ? keys : keys.filter((entry) => entry.isActive).map(({ id, provider }) => ({ id, provider })) });
  }
  if (!isAdmin) return json({ error: 'admin_required' }, 403);

  if (request.method === 'POST' && path === '/ai/keys') {
    const body = await readJson(request);
    if (!validProvider(body?.provider) || typeof body?.label !== 'string' || !body.label.trim()
        || body.label.length > 80 || typeof body?.key !== 'string' || body.key.length < 16
        || body.key.length > 256 || /\s/.test(body.key)) {
      return json({ error: 'invalid_key' }, 400);
    }
    const id = crypto.randomUUID();
    const entry = {
      id, provider: body.provider, label: body.label.trim(), key: body.key,
      keyPreview: `...${body.key.slice(-4)}`, isActive: true,
      createdAt: Date.now(), createdBy: auth.uid,
    };
    await env.AI_KEYS.put(`${KEY_PREFIX}${id}`, JSON.stringify(entry), { metadata: safeMetadata(entry) });
    return json({ key: safeMetadata(entry) }, 201);
  }

  const id = path.match(/^\/ai\/keys\/([0-9a-f-]{36})$/)?.[1];
  if (!id) return json({ error: 'not_found' }, 404);
  const storageKey = `${KEY_PREFIX}${id}`;
  const entry = await env.AI_KEYS.get(storageKey, 'json');
  if (!entry) return json({ error: 'not_found' }, 404);
  if (request.method === 'DELETE') {
    await env.AI_KEYS.delete(storageKey);
    return json({ removed: true });
  }
  if (request.method === 'PATCH') {
    const body = await readJson(request);
    if (typeof body?.isActive !== 'boolean') return json({ error: 'invalid_request' }, 400);
    const updated = { ...entry, isActive: body.isActive };
    await env.AI_KEYS.put(storageKey, JSON.stringify(updated), { metadata: safeMetadata(updated) });
    return json({ key: safeMetadata(updated) });
  }
  return json({ error: 'method_not_allowed' }, 405);
}

function normalizeGeminiRequest(body) {
  const prompt = body.prompt;
  const parts = typeof prompt === 'string' ? [{ text: prompt }] : prompt;
  if (!Array.isArray(parts) || parts.length === 0 || parts.some((part) => typeof part?.text !== 'string')) return null;
  const generationConfig = body.generationConfig ?? {};
  if (!generationConfig || typeof generationConfig !== 'object' || Array.isArray(generationConfig)
      || generationConfig.maxOutputTokens > 65536) return null;
  return {
    contents: [{ role: 'user', parts }],
    ...(typeof body.systemInstruction === 'string' && body.systemInstruction.trim()
      ? { systemInstruction: { parts: [{ text: body.systemInstruction }] } } : {}),
    generationConfig,
  };
}

function normalizeGroqRequest(body) {
  const request = body.request;
  if (!Array.isArray(request?.messages) || request.messages.length === 0
      || request.messages.some((message) => !['system', 'user', 'assistant'].includes(message?.role)
        || typeof message?.content !== 'string')
      || request.max_tokens > 65536 || request.max_completion_tokens > 65536
      || (request.temperature !== undefined && (typeof request.temperature !== 'number'
        || request.temperature < 0 || request.temperature > 2))) return null;
  return {
    model: request.model,
    messages: request.messages,
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
    ...(request.max_tokens === undefined ? {} : { max_tokens: request.max_tokens }),
    ...(request.max_completion_tokens === undefined ? {} : { max_completion_tokens: request.max_completion_tokens }),
    ...(request.response_format === undefined ? {} : { response_format: request.response_format }),
    ...(request.reasoning_effort === undefined ? {} : { reasoning_effort: request.reasoning_effort }),
  };
}

async function proxyProvider(request, env, auth, provider) {
  const limited = await env.THCS_RATE_LIMITER.limit({ key: `ai:${auth.uid}` });
  if (!limited?.success) return json({ error: 'rate_limited' }, 429);
  const body = await readJson(request);
  if (!body || typeof body.keyId !== 'string' || !/^[0-9a-f-]{36}$/.test(body.keyId)) {
    return json({ error: 'invalid_request' }, 400);
  }
  const model = provider === 'groq' ? body.request?.model : body.model;
  if (!validModel(provider, model)) return json({ error: 'model_not_allowed' }, 400);
  const payload = provider === 'groq' ? normalizeGroqRequest(body) : normalizeGeminiRequest(body);
  if (!payload) return json({ error: 'invalid_request' }, 400);
  const entry = await env.AI_KEYS.get(`${KEY_PREFIX}${body.keyId}`, 'json');
  if (!entry || entry.provider !== provider || !entry.isActive) return json({ error: 'key_unavailable' }, 404);
  if (provider === 'gemini' && !env.GEMINI_RELAY_TOKEN) return json({ error: 'ai_unavailable' }, 503);

  const url = provider === 'groq'
    ? 'https://api.groq.com/openai/v1/chat/completions'
    : GEMINI_RELAY_URL;
  const headers = provider === 'groq'
    ? { Authorization: `Bearer ${entry.key}`, 'Content-Type': 'application/json' }
    : { Authorization: `Bearer ${env.GEMINI_RELAY_TOKEN}`, 'X-Provider-Key': entry.key, 'Content-Type': 'application/json' };
  try {
    const upstream = await fetch(url, {
      method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(120_000),
    });
    let result = (await upstream.text()).replaceAll(entry.key, '[redacted]');
    if (provider === 'gemini') result = result.replaceAll(env.GEMINI_RELAY_TOKEN, '[redacted]');
    if (!upstream.ok) return json({ error: result.slice(0, 1000) }, upstream.status);
    return new Response(result, { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch {
    return json({ error: 'provider_unavailable' }, 503);
  }
}

export async function handleAiGatewayRequest(request, env, auth, profile) {
  if (!env.AI_KEYS || !env.THCS_RATE_LIMITER) return json({ error: 'ai_unavailable' }, 503);
  if (profile?.forceReauth === true || profile?.disabled === true
      || ['blocked', 'inactive', 'suspended'].includes(profile?.status)) {
    return json({ error: 'account_disabled' }, 403);
  }
  const path = new URL(request.url).pathname;
  const isAdmin = profile?.role === 'super_admin';
  if (path === '/ai/keys' || path.startsWith('/ai/keys/')) {
    return manageKeys(request, env, auth, isAdmin, path);
  }
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (path === '/ai/groq') return proxyProvider(request, env, auth, 'groq');
  if (path === '/ai/gemini') return proxyProvider(request, env, auth, 'gemini');
  return json({ error: 'not_found' }, 404);
}
