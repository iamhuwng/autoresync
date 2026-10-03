import { importPKCS8, SignJWT } from 'jose';

export type NotificationBridgeTokenEnv = {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_DB_URL: string;
  NOTIFICATION_COMMAND_SERVICE_IDENTITY: string;
  NOTIFICATION_COMMAND_GOOGLE_SA_KEY: string;
};

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
let cachedKey: Awaited<ReturnType<typeof importPKCS8>> | undefined;
let cachedKeyJson = '';
let cachedToken: { value: string; until: number } | undefined;

export const token = async (
  env: NotificationBridgeTokenEnv,
  fetcher: typeof fetch,
  requestRay: string | null,
): Promise<string> => {
  if (cachedToken && cachedToken.until > Date.now() + 30_000) {
    console.info('notification_bridge_oauth', { requestRay, cache: 'cached' });
    return cachedToken.value;
  }
  const keyJson = env.NOTIFICATION_COMMAND_GOOGLE_SA_KEY;
  const service = JSON.parse(keyJson) as { client_email?: string; private_key?: string };
  if (!service.private_key || service.client_email !== env.NOTIFICATION_COMMAND_SERVICE_IDENTITY) throw Error('service_identity');
  const profile = { requestRay, cache: cachedKeyJson === keyJson && cachedKey ? 'refresh' : 'cold', keyImportWallMs: 0, signWallMs: 0, oauthWallMs: 0 };
  if (cachedKeyJson !== keyJson || !cachedKey) {
    const started = performance.now();
    cachedKey = await importPKCS8(service.private_key, 'RS256');
    profile.keyImportWallMs = performance.now() - started;
    cachedKeyJson = keyJson;
  }
  const now = Math.floor(Date.now() / 1000);
  const signStarted = performance.now();
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/datastore' })
    .setProtectedHeader({ alg: 'RS256' }).setIssuer(service.client_email)
    .setSubject(service.client_email).setAudience(TOKEN_URL)
    .setIssuedAt(now).setExpirationTime(now + 3600).sign(cachedKey);
  profile.signWallMs = performance.now() - signStarted;
  const oauthStarted = performance.now();
  const response = await fetcher(TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  profile.oauthWallMs = performance.now() - oauthStarted;

  if (!response.ok) throw Error('token_failed');
  const body = await response.json() as { access_token?: unknown; expires_in?: unknown };
  if (typeof body.access_token !== 'string' || !body.access_token) throw Error('token_invalid');
  const issuedAt = Date.now();
  cachedToken = { value: body.access_token, until: issuedAt + (typeof body.expires_in === 'number' ? body.expires_in : 3600) * 1000 };
  console.info('notification_bridge_oauth', { ...profile, issuedAt, expiresAt: cachedToken.until });
  return cachedToken.value;
};
