import { pathToFileURL } from 'node:url';
import { defaultGoogleAccessToken } from './spare-sync-from-live.mjs';
import { spareFirebaseProject } from './spare-dev-config.mjs';

export const SPARE_DEV_ACCOUNTS = Object.freeze([
  Object.freeze({ uid: 'glMHCrzMnyS6AqFcb9I0nlOqQ6X2', email: 'teacher@test.com', password: 'teacher', role: 'teacher', displayName: 'Teacher Test' }),
  Object.freeze({ uid: 'x3hDfjYVN7cJtSbwq0ChIjl1Bk62', email: 'student@test.com', password: 'student', role: 'student', displayName: 'Student Test' }),
]);

export function parseProvisionArgs(argv = []) {
  let project = spareFirebaseProject;
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--project') project = argv[++index];
    else if (flag === '--json') json = true;
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (!project) throw new Error('Missing value for --project.');
  if (project !== spareFirebaseProject || project === 'temp-a1437') {
    throw new Error(`Refusing Dev Quick Login provisioning target ${project}. Only ${spareFirebaseProject} is allowed.`);
  }
  return { project, json };
}

async function readResponse(response, description) {
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error(`${description} failed (HTTP ${response.status}): ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  return body;
}

export async function provisionSpareDevAccounts(options = {}, deps = {}) {
  const project = options.project ?? spareFirebaseProject;
  if (project !== spareFirebaseProject || project === 'temp-a1437') {
    throw new Error(`Refusing Dev Quick Login provisioning target ${project}. Only ${spareFirebaseProject} is allowed.`);
  }
  const fetchImpl = deps.fetchImpl ?? fetch;
  const getAccessToken = deps.getAccessToken ?? (() => defaultGoogleAccessToken());
  const token = String(await getAccessToken()).trim();
  if (!token) throw new Error('Google access token is unavailable.');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-goog-user-project': project };
  const authUrl = `https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:update`;
  const databaseUrl = `https://${project}-default-rtdb.asia-southeast1.firebasedatabase.app`;
  const results = [];
  for (const account of SPARE_DEV_ACCOUNTS) {
    await readResponse(await fetchImpl(authUrl, {
      method: 'POST', redirect: 'error', headers,
      body: JSON.stringify({ localId: account.uid, email: account.email, password: account.password, emailVerified: true, disableUser: false, displayName: account.displayName }),
    }), `Spare Auth update for ${account.email}`);
    await readResponse(await fetchImpl(`${databaseUrl}/users/${encodeURIComponent(account.uid)}.json`, {
      method: 'PATCH', redirect: 'error', headers,
      body: JSON.stringify({ uid: account.uid, email: account.email, displayName: account.displayName, role: account.role, status: 'active', forceReauth: false }),
    }), `Spare RTDB profile update for ${account.uid}`);
    results.push({ uid: account.uid, email: account.email, role: account.role, project });
  }
  return { status: 'PROVISIONED', project, accounts: results };
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const options = parseProvisionArgs(argv);
  const result = await provisionSpareDevAccounts(options, deps);
  if (options.json) console.log(JSON.stringify(result));
  else console.log(`PROVISIONED: ${result.accounts.map(account => `${account.email} (${account.uid})`).join(', ')} on ${result.project}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try { await main(); } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
