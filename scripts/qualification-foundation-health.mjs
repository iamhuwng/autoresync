import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const PRODUCTION_PROJECT = 'temp-a1437';
const PRODUCTION_SITE = 'kahut1';
const REQUIRED = [
  'VITE_FIREBASE_QUALIFICATION_API_KEY',
  'VITE_FIREBASE_QUALIFICATION_AUTH_DOMAIN',
  'VITE_FIREBASE_QUALIFICATION_DATABASE_URL',
  'VITE_FIREBASE_QUALIFICATION_PROJECT_ID',
  'VITE_FIREBASE_QUALIFICATION_STORAGE_BUCKET',
  'VITE_FIREBASE_QUALIFICATION_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_QUALIFICATION_APP_ID',
  'VITE_FIREBASE_QUALIFICATION_HOSTING_SITE',
];

const args = process.argv.slice(2);
const value = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const json = args.includes('--json');
const requireWorkers = args.includes('--require-workers');
const envFile = value('--env-file');

const parseEnv = raw => Object.fromEntries(raw.split(/\r?\n/u).flatMap(line => {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/u);
  return match ? [[match[1], match[2].replace(/^['"]|['"]$/gu, '')]] : [];
}));
const runFirebase = (...command) => {
  try {
    const result = spawnSync(process.execPath, ['scripts/tooling-where.mjs', '--exec', 'firebase', ...command], { encoding: 'utf8', windowsHide: true });
    const output = result.stdout || '';
    if (!output.includes('{')) throw new Error(result.stderr || `exit ${result.status}`);
    const start = output.indexOf('{');
    const end = output.lastIndexOf('}');
    return JSON.parse(output.slice(start, end + 1));
  } catch (error) {
    throw new Error(`Firebase read-only command failed: ${command.join(' ')}${error.stderr ? ` (${String(error.stderr).trim().slice(-240)})` : ''}`);
  }
};
const check = (id, status, detail) => ({ id, status, detail });

const env = { ...process.env, ...(envFile ? parseEnv(await readFile(envFile, 'utf8')) : {}) };
const project = env.VITE_FIREBASE_QUALIFICATION_PROJECT_ID;
const site = env.VITE_FIREBASE_QUALIFICATION_HOSTING_SITE;
const checks = [];
const missing = REQUIRED.filter(key => !env[key]?.trim());
checks.push(check('qualification-config', missing.length ? 'missing' : 'ok', missing.length ? `missing ${missing.join(', ')}` : 'all required Firebase qualification keys are present'));
checks.push(check('non-production-identity', project && site && project !== PRODUCTION_PROJECT && site !== PRODUCTION_SITE ? 'ok' : 'blocked', project && site ? `${project}/${site}` : 'project/site unavailable'));

if (project && site && project !== PRODUCTION_PROJECT && site !== PRODUCTION_SITE) {
  try {
    const sites = runFirebase('hosting:sites:list', '--project', project, '--json').result?.sites || [];
    checks.push(check('hosting-site', sites.some(item => item.name?.endsWith(`/sites/${site}`)) ? 'ok' : 'missing', sites.some(item => item.name?.endsWith(`/sites/${site}`)) ? `${project}/${site}` : `${project}/${site} not found`));
  } catch (error) { checks.push(check('hosting-site', 'unverified', error.message)); }
  try {
    const instances = runFirebase('database:instances:list', '--project', project, '--json').result || [];
    const databaseUrl = env.VITE_FIREBASE_QUALIFICATION_DATABASE_URL;
    const found = instances.some(item => item.databaseUrl === databaseUrl);
    checks.push(check('rtdb-instance', found ? 'ok' : 'missing', found ? databaseUrl : 'configured RTDB URL is not an active project instance'));
  } catch (error) { checks.push(check('rtdb-instance', 'unverified', error.message)); }
  if (env.VITE_FIREBASE_QUALIFICATION_API_KEY) {
    try {
      const token = env.GOOGLE_OAUTH_ACCESS_TOKEN?.trim();
      if (!token) throw new Error('GOOGLE_OAUTH_ACCESS_TOKEN is required for the read-only Auth configuration probe');
      const response = await fetch(`https://identitytoolkit.googleapis.com/v2/projects/${encodeURIComponent(project)}/config`, { headers: { authorization: `Bearer ${token}`, 'x-goog-user-project': project }, redirect: 'error' });
      checks.push(check('firebase-auth', response.ok ? 'ok' : 'missing', response.ok ? `${project} Auth configuration is reachable` : `Auth configuration returned HTTP ${response.status}`));
    } catch (error) { checks.push(check('firebase-auth', 'unverified', `Auth configuration probe failed: ${error.message}`)); }
  }
} else {
  checks.push(check('hosting-site', 'blocked', 'skipped until dedicated project/site are configured'));
  checks.push(check('rtdb-instance', 'blocked', 'skipped until dedicated project/site are configured'));
}

const workerKeys = Object.keys(env).filter(key => /^VITE_.*WORKER.*(?:URL|ORIGIN)$/u.test(key) && /^https:\/\//u.test(env[key] || ''));
if (!workerKeys.length) checks.push(check('worker-endpoints', requireWorkers ? 'missing' : 'ok', 'no non-production Worker endpoint bindings configured'));
else {
  const workerResults = await Promise.all(workerKeys.map(async key => {
    const url = env[key].replace(/\/$/u, '');
    if (new URL(url).hostname === 'r2-upload-signer.iamhuwng.workers.dev') return `${key} points at the production Worker`;
    try {
      const response = await fetch(url, { method: 'OPTIONS', redirect: 'error' });
      return response.status < 500 ? null : `${key} returned HTTP ${response.status}`;
    } catch (error) { return `${key} probe failed: ${error.message}`; }
  }));
  const workerErrors = workerResults.filter(Boolean);
  checks.push(check('worker-endpoints', workerErrors.length ? 'blocked' : 'ok', workerErrors.length ? workerErrors.join('; ') : `${workerKeys.length} reachable non-production endpoint(s)`));
}

const result = { status: checks.some(item => ['blocked', 'missing'].includes(item.status)) ? 'BLOCKED' : checks.some(item => item.status === 'unverified') ? 'UNVERIFIED' : 'PASS', project: project || null, site: site || null, checks, readOnly: true };
if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
else { process.stdout.write(`${result.status}\n`); checks.forEach(item => process.stdout.write(`${item.status.toUpperCase()} ${item.id}: ${item.detail}\n`)); }
process.exitCode = result.status === 'PASS' ? 0 : 2;
