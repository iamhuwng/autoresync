const googleStatuses = new Set(['UNAUTHENTICATED', 'PERMISSION_DENIED', 'NOT_FOUND', 'RESOURCE_EXHAUSTED',
  'FAILED_PRECONDITION', 'INVALID_ARGUMENT', 'UNAVAILABLE', 'DEADLINE_EXCEEDED']);
const googleReasons = new Set(['ACCESS_TOKEN_SCOPE_INSUFFICIENT', 'IAM_PERMISSION_DENIED', 'SERVICE_DISABLED',
  'USER_PROJECT_DENIED', 'CONSUMER_INVALID', 'CREDENTIALS_MISSING', 'AUTH_TOKEN_EXPIRED']);
const googleScopes = ['cloud-platform', 'firebase.database', 'userinfo.email'];

export class ProviderReadError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export function providerErrorDetails(body) {
  const status = body?.error?.status;
  const details = Array.isArray(body?.error?.details) ? body.error.details.slice(0, 16) : [];
  const fields = [googleStatuses.has(status) ? status : null,
    ...details.map(detail => detail?.reason).filter(reason => googleReasons.has(reason))];
  if (typeof body?.error === 'string') {
    if (/insufficient (?:authentication )?scopes?/iu.test(body.error)) fields.push('ACCESS_TOKEN_SCOPE_INSUFFICIENT');
    else if (/permission denied/iu.test(body.error)) fields.push('PERMISSION_DENIED');
    else if (/token.{0,30}expired/iu.test(body.error)) fields.push('AUTH_TOKEN_EXPIRED');
  }
  if (Array.isArray(body?.errors)) {
    fields.push(...body.errors.slice(0, 8).map(error => error?.code)
      .filter(code => Number.isInteger(code) && code >= 1000 && code <= 99999)
      .map(code => `Cloudflare code ${code}`));
  }
  return [...new Set(fields.filter(Boolean))].slice(0, 8).join(', ');
}

async function readErrorDetails(response) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return providerErrorDetails(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      size += value.byteLength;
      if (size > 16384) {
        await reader.cancel();
        return '';
      }
      chunks.push(value);
    }
  } catch { return ''; }
  finally { reader.releaseLock(); }
}

export async function readProviderJson(url, bearer, { multipart = false, fetchImpl = fetch } = {}) {
  const endpoint = new URL(url);
  const label = endpoint.host + endpoint.pathname;
  let response;
  try {
    response = await fetchImpl(url, { method: 'GET', redirect: 'error', cache: 'no-store',
      signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${bearer}`,
        ...(endpoint.hostname === 'firebaserules.googleapis.com' ? { 'x-goog-user-project': 'temp-a1437' } : {}) } });
  } catch {
    throw new ProviderReadError(`${label}: request failed, timed out, or redirected`);
  }
  if (response.url && response.url !== url) throw new ProviderReadError(`${label}: unexpected response URL`);
  if (!response.ok) {
    const details = await readErrorDetails(response);
    throw new ProviderReadError(`${label}: HTTP ${response.status}${details ? ` (${details})` : ''}`, response.status);
  }
  try { return await (multipart ? response.formData() : response.json()); }
  catch { throw new ProviderReadError(`${label}: invalid provider response`); }
}

export class ProviderProbeError extends Error {
  constructor(failures) {
    super(failures.map(({ label, reason }) => `${label}: ${safeFailure(reason)}`).join('; '));
    this.failures = failures;
  }
}

function safeFailure(error) {
  if (error instanceof ProviderReadError || error instanceof ProviderProbeError
    || (error?.code === 'ERR_ASSERTION' && error.generatedMessage === false)) return error.message;
  return 'probe did not return usable evidence';
}

export async function collectProviderReads(probes) {
  const entries = Object.entries(probes);
  const results = await Promise.allSettled(entries.map(([, probe]) => Promise.resolve().then(probe)));
  const failures = results.flatMap((result, index) => result.status === 'rejected'
    ? [{ label: entries[index][0], reason: result.reason }] : []);
  if (failures.length) throw new ProviderProbeError(failures);
  return Object.fromEntries(results.map((result, index) => [entries[index][0], result.value]));
}

export const hasGoogleAuthFailure = error => (error instanceof ProviderReadError
  && [401, 403].includes(error.status) && !error.message.startsWith('api.cloudflare.com/'))
  || (error instanceof ProviderProbeError && error.failures.some(({ reason }) => hasGoogleAuthFailure(reason)));

export async function describeGoogleToken(bearer, fetchImpl = fetch) {
  try {
    const response = await fetchImpl('https://oauth2.googleapis.com/tokeninfo', { method: 'POST', redirect: 'error',
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(4000), cache: 'no-store' });
    if (!response.ok) return `Google token metadata unavailable (HTTP ${response.status})`;
    const data = await response.json();
    const scope = typeof data.scope === 'string' ? new Set(data.scope.split(/\s+/u)) : new Set();
    const granted = googleScopes.filter(value => scope.has('https://www.googleapis.com/auth/' + value));
    const missing = googleScopes.filter(value => !granted.includes(value));
    const ttl = typeof data.expires_in === 'number' || /^\d{1,8}$/u.test(data.expires_in || '')
      ? Number(data.expires_in) : NaN;
    const expiry = Number.isSafeInteger(ttl) && ttl >= 0 && ttl < 86400000
      ? `${ttl}s remaining${ttl < 900 ? ' (expires soon)' : ''}` : 'expiry unavailable';
    return `Google token: ${expiry}; granted release scopes: ${granted.join(', ') || 'none reported'}; missing release scopes: ${missing.join(', ') || 'none'}`;
  } catch { return 'Google token metadata unavailable'; }
}
