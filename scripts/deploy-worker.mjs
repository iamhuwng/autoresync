import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CLOUDFLARE_ACCOUNT_ID, PRODUCTION_WORKER_NAMES, readProviderState } from './release-provider-readback.mjs';

const execFileAsync = promisify(execFile);
const TOOLING = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'tooling-where.mjs');
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;
const HASH = /^[0-9a-f]{64}$/iu;

const production = (packageDir, configFile, wranglerTool, testArgs, smokeProbe) => ({
  environment: 'production', deployable: true, packageDir, configFile, wranglerTool, testArgs, smokeProbe,
});

export const WORKER_REGISTRY = Object.freeze({
  'r2-upload-signer': production('cloudflare', 'wrangler.jsonc', 'cloudflare-wrangler',
    ['../scripts/tooling-where.mjs', '--exec', 'cloudflare-vitest', 'run', '--config', 'vitest.config.mjs', '__tests__/upload-worker-harness.test.js', 'test/upload-worker-security.test.js', 'test/student-auth-worker.test.ts', 'test/spare-cors-policy.test.ts'],
    { url: 'https://r2-upload-signer.iamhuwng.workers.dev/', method: 'OPTIONS', headers: { Origin: 'https://kahut1.web.app', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization, content-type' }, expectedStatuses: [204] }),
  'r2-backup-worker': production('r2-backup-worker', 'wrangler.toml', 'r2-wrangler',
    ['../scripts/tooling-where.mjs', '--exec', 'r2-vitest', 'run', '--passWithNoTests=false'],
    { url: 'https://r2-backup-worker.iamhuwng.workers.dev/api/backup/health', method: 'OPTIONS', headers: { Origin: 'https://kahut1.web.app' }, expectedStatuses: [204] }),
  'luyentap-notification-command': production('cloudflare', 'wrangler.notifications.jsonc', 'cloudflare-wrangler',
    ['../scripts/tooling-where.mjs', '--exec', 'cloudflare-vitest', 'run', '--config', 'vitest.notifications.config.mjs'],
    { url: 'https://luyentap-notification-command.iamhuwng.workers.dev/session-notifications/action', method: 'OPTIONS', headers: { Origin: 'https://kahut1.web.app', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization, content-type' }, expectedStatuses: [204] }),
  'thcs-gemma': production('cloudflare', 'wrangler.thcs-gemma.jsonc', 'cloudflare-wrangler',
    ['../scripts/tooling-where.mjs', '--exec', 'cloudflare-vitest', 'run', '--config', 'vitest.config.mjs', 'test/thcs-gemma-worker.test.ts'],
    { url: 'https://thcs-gemma.iamhuwng.workers.dev/ai/health', method: 'OPTIONS', headers: { Origin: 'https://kahut1.web.app', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' }, expectedStatuses: [204] }),
  'luyentap-notification-firestore-qa': Object.freeze({ environment: 'production', deployable: false,
    reason: 'luyentap-notification-firestore-qa is an external-DO public-entry proxy whose live module does not match cloudflare/wrangler.notification-firestore-bridge.jsonc or notification-command-public.js; refusing generic deploy to prevent overwriting production.' }),
  'luyentap-qualification-upload-signer': Object.freeze({ environment: 'spare', deployable: true, packageDir: 'cloudflare', configFile: 'wrangler.qualification.jsonc', wranglerTool: 'cloudflare-wrangler',
    testArgs: ['../scripts/tooling-where.mjs', '--exec', 'cloudflare-vitest', 'run', '--config', 'vitest.config.mjs', '__tests__/upload-worker-harness.test.js', 'test/upload-worker-security.test.js', 'test/student-auth-worker.test.ts', 'test/spare-cors-policy.test.ts'],
    smokeProbe: { url: 'https://luyentap-qualification-upload-signer.iamhuwng.workers.dev/', method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization, content-type' }, expectedStatuses: [204] } }),
});

function commandError(error, command, args) {
  if (error?.code === 'ENOENT' || error?.code === 'EACCES') {
    return new Error(`Unable to start deployment tool (${error.code}): ${command} ${args.join(' ')}`, { cause: error });
  }
  return error;
}

async function run(deps, command, args, options = {}) {
  try { return await (deps.exec || execFileAsync)(command, args, { windowsHide: true, ...options }); }
  catch (error) { throw commandError(error, command, args); }
}

function outputOf(result) { return typeof result === 'string' ? result : `${result?.stdout || ''}\n${result?.stderr || ''}`; }

export function parseDeployWorkerArgs(argv) {
  let service;
  const result = { service: undefined, dryRun: false, allowDirty: false, offline: false, skipTests: false, json: false, list: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--list') result.list = true;
    else if (arg === '--dry-run') result.dryRun = true;
    else if (arg === '--allow-dirty') result.allowDirty = true;
    else if (arg === '--offline') result.offline = true;
    else if (arg === '--skip-tests') result.skipTests = true;
    else if (arg === '--json') result.json = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown flag: ${arg}`);
    else if (service) throw new Error(`Unexpected argument: ${arg}`);
    else service = arg;
  }
  result.service = service;
  if (!result.list && !service) throw new Error('Worker service is required');
  if (result.list && service) throw new Error('--list cannot be combined with a service');
  if ((result.allowDirty || result.offline || result.skipTests) && !result.dryRun) throw new Error('--allow-dirty, --offline, and --skip-tests require --dry-run');
  return result;
}

export function assertCloudflareAccount(output, expectedAccountId = CLOUDFLARE_ACCOUNT_ID) {
  const text = outputOf(output).trim();
  assert(text, `Wrangler account verification failed: empty response (expected ${expectedAccountId})`);
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = undefined; }
  if (parsed !== undefined && typeof parsed === 'object' && parsed !== null) {
    const ids = new Set();
    if (typeof parsed.account_id === 'string') ids.add(parsed.account_id);
    if (typeof parsed.id === 'string') ids.add(parsed.id);
    if (typeof parsed.result?.id === 'string') ids.add(parsed.result.id);
    if (Array.isArray(parsed.accounts)) {
      for (const account of parsed.accounts) if (typeof account?.id === 'string') ids.add(account.id);
    }
    if (Array.isArray(parsed)) {
      for (const account of parsed) if (typeof account?.id === 'string') ids.add(account.id);
    }
    assert(ids.has(expectedAccountId), `Wrangler authenticated account does not match pinned account ${expectedAccountId}`);
    return expectedAccountId;
  }
  const matcher = new RegExp(`\\b${expectedAccountId}\\b`, 'iu');
  assert(matcher.test(text), `Wrangler authenticated account does not match pinned account ${expectedAccountId}`);
  return expectedAccountId;
}

export function parseUploadedVersionId(value) {
  const text = outputOf(value).trim();
  try {
    const parsed = JSON.parse(text);
    const candidate = parsed?.id ?? parsed?.version_id ?? parsed?.result?.id ?? parsed?.result?.version_id;
    if (UUID.test(candidate || '')) return candidate;
  } catch { /* Wrangler often emits human-readable output. */ }
  const match = text.match(/(?:Worker Version ID\s*:\s*|version_id["']?\s*[:=]\s*["']?)([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})/iu) || text.match(UUID);
  if (match && UUID.test(match[1] || match[0])) return match[1] || match[0];
  throw new Error('Wrangler upload did not return a valid Worker Version ID');
}

export function buildWorkerRollbackCommand(entry, priorVersionId) {
  assert(UUID.test(priorVersionId || ''), 'Prior Worker version ID is unavailable for rollback');
  return `node scripts/tooling-where.mjs --exec ${entry.wranglerTool} versions deploy ${priorVersionId}@100% --config ${entry.packageDir}/${entry.configFile} --message rollback:${priorVersionId} --yes`;
}

export async function runWorkerSmokeProbe(probe, fetchImpl = fetch) {
  assert(probe?.url && Array.isArray(probe.expectedStatuses), 'Worker smoke probe is incomplete');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    let response;
    try { response = await fetchImpl(probe.url, { method: probe.method || 'GET', headers: probe.headers, redirect: 'error', signal: controller.signal }); }
    catch (error) { throw new Error(`Worker smoke probe request failed: ${error.message}`); }
    if (response.redirected || (response.status >= 300 && response.status < 400)) throw new Error(`Worker smoke probe redirected (${response.status})`);
    if (!probe.expectedStatuses.includes(response.status)) throw new Error(`Worker smoke probe returned HTTP ${response.status}, expected ${probe.expectedStatuses.join(', ')}`);
    return { url: probe.url, method: probe.method || 'GET', status: response.status };
  } finally { clearTimeout(timer); }
}

function unwrapWorkerState(value, service) { return value?.workers?.[service] ?? value?.[service] ?? value; }
function activeState(state, service) { return unwrapWorkerState(state, service); }
function assertPriorState(state, service) {
  const prior = activeState(state, service);
  assert(UUID.test(prior?.versionId || ''), `Prior Worker version ID for ${service} is unavailable`);
  assert.deepEqual(prior.deployment?.versions, [{ version_id: prior.versionId, percentage: 100 }], 'Prior Worker deployment is split or unavailable');
  return prior;
}

export async function waitForWorkerVersionActive(service, versionId, readState, options = {}) {
  const timeout = options.timeout ?? 60000;
  const initialDelay = options.initialDelay ?? 1500;
  const maxDelay = options.maxDelay ?? 10000;
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const started = now();
  let delay = initialDelay;
  let lastError;
  while (now() - started <= timeout) {
    try {
      const observed = activeState(await readState({ workers: [service] }), service);
      if (observed?.versionId === versionId
        && JSON.stringify(observed.deployment?.versions) === JSON.stringify([{ version_id: versionId, percentage: 100 }])
        && Array.isArray(observed.modules) && observed.modules.length > 0
        && observed.modules.every(module => HASH.test(module.sha256 || ''))) return observed;
      lastError = new Error(`Worker ${service} is not active at version ${versionId}`);
    } catch (error) { lastError = error; }
    const remaining = timeout - (now() - started);
    if (remaining <= 0) break;
    await sleep(Math.min(delay, remaining));
    delay = Math.min(maxDelay, delay * 2);
  }
  throw new Error(`Timed out waiting for Worker ${service} version ${versionId} to become active${lastError ? `: ${lastError.message}` : ''}`);
}

async function gitIdentity(cwd, deps) {
  const status = outputOf(await run(deps, 'git', ['status', '--porcelain', '--untracked-files=all'], { cwd })).trim();
  const revision = outputOf(await run(deps, 'git', ['rev-parse', 'HEAD'], { cwd })).trim();
  const tree = outputOf(await run(deps, 'git', ['rev-parse', 'HEAD^{tree}'], { cwd })).trim();
  assert(!status, `Git tree is dirty:\n${status}`);
  return { revision, tree };
}

function isSpawnError(error) {
  const code = error?.code ?? error?.cause?.code;
  return code === 'ENOENT' || code === 'EACCES';
}

function plannedCommands(entry, shortSha) {
  const prefix = `node scripts/tooling-where.mjs --exec ${entry.wranglerTool}`;
  const configPath = `${entry.packageDir}/${entry.configFile}`;
  return { build: `${prefix} deploy --config ${configPath} --dry-run`, upload: `${prefix} versions upload --config ${configPath} --message release:${shortSha}`, deploy: `${prefix} versions deploy <uploadedVersionId>@100% --config ${configPath} --message release:${shortSha} --yes` };
}

export async function deployWorker({ service, dryRun = false, allowDirty = false, offline = false, skipTests = false, cwd = process.cwd(), deps = {} }) {
  const entry = WORKER_REGISTRY[service];
  assert(entry, `Unknown Worker service: ${service}`);
  assert(entry.deployable !== false, `${service} is not deployable: ${entry.reason}`);
  if ((allowDirty || offline || skipTests) && !dryRun) throw new Error('--allow-dirty, --offline, and --skip-tests require --dry-run');
  const identity = dryRun && allowDirty ? { revision: outputOf(await run(deps, 'git', ['rev-parse', 'HEAD'], { cwd })).trim(), tree: outputOf(await run(deps, 'git', ['rev-parse', 'HEAD^{tree}'], { cwd })).trim() } : await gitIdentity(cwd, deps);
  const configPath = path.join(cwd, entry.packageDir, entry.configFile);
  await access(configPath).catch(() => { throw new Error(`Worker config not found: ${path.relative(cwd, configPath)}`); });
  const shortSha = identity.revision.slice(0, 8);
  const commands = plannedCommands(entry, shortSha);
  const packageCwd = path.join(cwd, entry.packageDir);
  const wranglerEnv = { ...process.env, CLOUDFLARE_ACCOUNT_ID, WRANGLER_SEND_METRICS: 'false' };
  const readWorker = () => (deps.readState || readProviderState)(cwd, { workers: [service] });
  if (!skipTests) await run(deps, process.execPath, entry.testArgs, { cwd: packageCwd });
  await run(deps, process.execPath, [TOOLING, '--exec', entry.wranglerTool, 'deploy', '--config', entry.configFile, '--dry-run'], { cwd: packageCwd, env: wranglerEnv });
  let prior;
  if (!(dryRun && offline)) {
    prior = assertPriorState(await readWorker(), service);
  }
  const priorVersionId = prior?.versionId;
  const rollbackCommand = priorVersionId ? buildWorkerRollbackCommand(entry, priorVersionId) : null;
  if (dryRun) return { status: 'DRY_RUN', accountId: CLOUDFLARE_ACCOUNT_ID, service, environment: entry.environment, revision: identity.revision, tree: identity.tree, configPath, testsSkipped: skipTests, priorVersionId, plannedCommands: commands, rollbackCommand };
  const whoami = await run(deps, process.execPath, [TOOLING, '--exec', entry.wranglerTool, 'whoami', '--json'], { cwd: packageCwd, env: wranglerEnv });
  assertCloudflareAccount(whoami, CLOUDFLARE_ACCOUNT_ID);
  let uploadedVersionId;
  try {
    const uploaded = await run(deps, process.execPath, [TOOLING, '--exec', entry.wranglerTool, 'versions', 'upload', '--config', entry.configFile, '--message', `release:${shortSha}`], { cwd: packageCwd, env: wranglerEnv });
    uploadedVersionId = parseUploadedVersionId(uploaded);
  } catch (error) {
    Object.assign(error, { phase: 'upload', priorVersionId });
    throw error;
  }
  try {
    const rechecked = assertPriorState(await readWorker(), service);
    assert.equal(rechecked.versionId, priorVersionId, `Worker ${service} active version changed from ${priorVersionId} to ${rechecked.versionId} before promotion`);
  } catch (error) {
    Object.assign(error, { phase: 'pre-deploy-drift', priorVersionId, uploadedVersionId });
    throw error;
  }
  try {
    await run(deps, process.execPath, [TOOLING, '--exec', entry.wranglerTool, 'versions', 'deploy', `${uploadedVersionId}@100%`, '--config', entry.configFile, '--message', `release:${shortSha}`, '--yes'], { cwd: packageCwd, env: wranglerEnv });
  } catch (error) {
    Object.assign(error, { phase: 'deploy', priorVersionId, uploadedVersionId, ...(isSpawnError(error) ? {} : { rollbackCommand }) });
    throw error;
  }
  let observed;
  try {
    observed = await waitForWorkerVersionActive(service, uploadedVersionId, () => readWorker(), { sleep: deps.sleep, now: deps.now });
  } catch (error) {
    Object.assign(error, { phase: 'readback', priorVersionId, uploadedVersionId, rollbackCommand });
    throw error;
  }
  let smokeProbe;
  try { smokeProbe = await runWorkerSmokeProbe(entry.smokeProbe, deps.fetchImpl || fetch); }
  catch (error) { Object.assign(error, { phase: 'smoke', priorVersionId, uploadedVersionId, rollbackCommand }); throw error; }
  return { status: 'VERIFIED', accountId: CLOUDFLARE_ACCOUNT_ID, service, environment: entry.environment, revision: identity.revision, tree: identity.tree, priorVersionId, deployedVersionId: uploadedVersionId, modules: observed.modules, smokeProbe, rollbackCommand };
}

async function main() {
  try {
    const args = parseDeployWorkerArgs(process.argv.slice(2));
    const result = args.list ? Object.fromEntries(Object.entries(WORKER_REGISTRY).map(([name, entry]) => [name, entry.deployable === false ? { ...entry } : { environment: entry.environment, deployable: true }])) : await deployWorker(args);
    if (args.list && !args.json) console.log(Object.keys(WORKER_REGISTRY).join('\n'));
    else if (args.json || args.list) console.log(JSON.stringify(result, null, 2));
    else {
      const lines = [`status: ${result.status}`, `service: ${result.service}`, `environment: ${result.environment}`, `priorVersionId: ${result.priorVersionId ?? 'unavailable'}`];
      lines.push(result.status === 'DRY_RUN' ? `planned: ${result.plannedCommands.deploy}` : `deployedVersionId: ${result.deployedVersionId}`);
      if (result.rollbackCommand) lines.push(`rollback: ${result.rollbackCommand}`);
      console.log(lines.join('\n'));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) main();

