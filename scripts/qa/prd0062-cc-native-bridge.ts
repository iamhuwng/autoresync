import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { createMockUserToken } from '@firebase/util';
import { decodeJwt } from 'jose';

const roots = ['users', 'classes', 'student_classes', 'courses', 'course_modules', 'course_materials',
  'course_enrollments', 'course_requests', 'class_course_links', 'class_book_authority', 'course_book_authority', 'book_delivery', 'book_runtime'];
export const ccNativePath = (path: string): boolean => roots.includes(path.split('/').filter(Boolean)[0] ?? '');

/** Only external Auth transport is substituted; all owning CC effects reach the native Rules engine. */
export const createCcNativeBridge = async (options: {
  rulesPath: string; initialProfiles: unknown; nativeFetch: typeof fetch;
}) => {
  const projectId = 'demo-prd0062-cc-default';
  const origin = 'http://localhost:9000';
  const settings = `${origin}/.settings/rules.json?ns=${projectId}`;
  const ownerHeaders = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
  const beforeRules = await options.nativeFetch(settings, { headers: ownerHeaders });
  assert.equal(beforeRules.status, 200, 'must preserve emulator Rules before installing candidate');
  const previousRules = await beforeRules.text();
  const beforeData = await options.nativeFetch(`${origin}/.json?ns=${projectId}`, { headers: ownerHeaders });
  assert.equal(beforeData.status, 200);
  const previousData = await beforeData.json();
  const rules = await readFile(options.rulesPath, 'utf8');
  const output = 'output/prd0062-cc-default-native';
  await mkdir(output, { recursive: true });
  await writeFile(`${output}/before.rules.json`, previousRules);
  await writeFile(`${output}/before.data.json`, JSON.stringify(previousData, null, 2));
  const env = await initializeTestEnvironment({ projectId, database: { host: 'localhost', port: 9000, rules } })
    .catch(async (error) => {
      await options.nativeFetch(settings, { method: 'PUT', headers: ownerHeaders, body: previousRules });
      throw error;
    });
  const tokens = new Set<string>();
  const evidence: unknown[] = [];
  let restored = false;
  const tokenFromSignedClaims = (uid: string, claims: Record<string, unknown>, signedToken?: string): string => {
    const token = createMockUserToken({ sub: uid, user_id: uid, ...claims }, projectId);
    const decoded = decodeJwt(token);
    assert.equal(decoded.sub, uid);
    for (const [key, value] of Object.entries(claims)) assert.deepEqual(decoded[key], value);
    tokens.add(token);
    evidence.push({ kind: signedToken ? 'verified-producer-custom-token' : 'external-client-auth', uid, claims,
      ...(signedToken ? { signedTokenSha256: createHash('sha256').update(signedToken).digest('hex') } : {}) });
    return token;
  };
  const request = async (path: string, init: RequestInit, token?: string, query?: URLSearchParams): Promise<Response> => {
    const method = init.method ?? 'GET';
    if (method !== 'GET' && (!token || !tokens.has(token))) {
      evidence.push({ kind: 'oauth-mutation-denied', method, path });
      return Response.json({ code: 'cc_native_oauth_mutation_forbidden' }, { status: 403 });
    }
    const url = new URL(`${origin}/${path}.json`);
    for (const [key, value] of query ?? []) if (key !== 'auth') url.searchParams.set(key, value);
    url.searchParams.set('ns', projectId);
    if (token) url.searchParams.set('auth', token);
    const headers = new Headers(init.headers);
    headers.delete('authorization');
    if (!token && method === 'GET') headers.set('Authorization', 'Bearer owner');
    const response = await options.nativeFetch(url, { ...init, headers });
    evidence.push({ kind: 'native-rtdb', method, path, status: response.status,
      claims: token ? decodeJwt(token) : 'trusted-server-read',
      ...(method !== 'GET' ? { payload: JSON.parse(String(init.body ?? 'null')) } : {}) });
    await writeFile(`${output}/events.json`, JSON.stringify(evidence, null, 2));
    return response;
  };
  const restore = async () => {
    if (restored) return;
    try {
      const response = await options.nativeFetch(`${origin}/.json?ns=${projectId}`, {
        method: 'PUT', headers: ownerHeaders, body: JSON.stringify(previousData),
      });
      assert.equal(response.status, 200, 'restore exact original data');
    } finally {
      try {
        const response = await options.nativeFetch(settings, { method: 'PUT', headers: ownerHeaders, body: previousRules });
        assert.equal(response.status, 200, 'restore exact original Rules');
      } finally { await env.cleanup(); }
    }
    restored = true;
    await writeFile(`${output}/restored.json`, JSON.stringify({ restored, projectId,
      candidateSha256: createHash('sha256').update(rules).digest('hex'),
      evidenceClass: 'local-default-CC-producers/native-Rules/test-Auth-bridge',
      boundary: 'Source/publication prerequisite producers retain their explicit external test store; no deployed Firebase lifecycle claim.',
    }, null, 2));
  };
  try {
    // External user profiles are the only setup prerequisite. Class/Course/Book authority is never seeded.
    const profiles = await options.nativeFetch(`${origin}/users.json?ns=${projectId}`, {
      method: 'PUT', headers: ownerHeaders, body: JSON.stringify(options.initialProfiles),
    });
    assert.equal(profiles.status, 200);
  } catch (error) { await restore(); throw error; }
  return { request, tokenFromSignedClaims, restore, projectId, evidence,
    rulesSha256: createHash('sha256').update(rules).digest('hex') };
};
