import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import net from 'node:net';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertProtectedMain, digest, FIREBASE_PROJECT_ID, readProviderState } from './release-provider-readback.mjs';
import { parseVitestReport } from './release-verification.mjs';

const execFileAsync = promisify(execFile);
const TOOLING = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'tooling-where.mjs');
const TARGETS = Object.freeze(['database', 'firestore:rules', 'firestore:indexes']);
export const ALLOWED_RULES_TARGETS = TARGETS;
export const RTDB_SECURITY_TEST_FILES = Object.freeze([
  'src/__tests__/security/notificationFirebaseRules.emulator.test.ts',
  'src/__tests__/security/teacher-writing-homework-access.emulator.test.ts',
  'src/__tests__/security/student-private-thcs-homework-current-rules.emulator.test.ts',
]);
export const FIRESTORE_SECURITY_TEST_FILES = Object.freeze([
  'src/__tests__/security/homeworkFirestoreRules.test.ts',
]);
export function allocateEmulatorPort(host = 'localhost') {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    const finish = (error, port) => {
      if (server.listening) server.close(closeError => {
        if (error) reject(error);
        else if (closeError) reject(closeError);
        else resolve(port);
      });
      else if (error) reject(error);
      else resolve(port);
    };
    server.once('error', error => finish(error));
    server.listen({ host, port: 0, exclusive: true }, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      if (!Number.isInteger(port) || port < 1 || port > 65535) finish(new Error('Could not allocate a valid emulator port.'));
      else finish(null, port);
    });
  });
}
const sha256 = value => createHash('sha256').update(value).digest('hex');
const plainObject = value => value && typeof value === 'object' && !Array.isArray(value);

function commandError(error, command, args) {
  if (error?.code === 'ENOENT' || error?.code === 'EACCES') return new Error(`Unable to start Firebase deployment tool (${error.code}): ${command} ${args.join(' ')}`, { cause: error });
  return error;
}
async function run(deps, command, args, options = {}) {
  try { return await (deps.exec || execFileAsync)(command, args, { windowsHide: true, ...options }); }
  catch (error) { throw commandError(error, command, args); }
}
const outputOf = result => typeof result === 'string' ? result : `${result?.stdout || ''}\n${result?.stderr || ''}`;

export function parseDeployRulesArgs(argv) {
  const result = { targets: undefined, dryRun: false, allowDirty: false, offline: false, skipTests: false, allowNonMain: false, json: false };
  let only;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--only') {
      if (only) throw new Error('--only may be specified only once');
      only = argv[++i];
      if (!only) throw new Error('--only requires at least one target');
    } else if (arg === '--all') {
      if (result.all) throw new Error('--all may be specified only once');
      result.all = true;
    } else if (arg === '--dry-run') result.dryRun = true;
    else if (arg === '--allow-dirty') result.allowDirty = true;
    else if (arg === '--offline') result.offline = true;
    else if (arg === '--skip-tests') result.skipTests = true;
    else if (arg === '--allow-non-main') result.allowNonMain = true;
    else if (arg === '--json') result.json = true;
    else throw new Error(`Unknown flag: ${arg}`);
  }
  if ((only ? 1 : 0) + (result.all ? 1 : 0) !== 1) throw new Error('Specify exactly one of --only <targets> or --all');
  const targets = result.all ? [...TARGETS] : [...new Set(only.split(',').map(value => value.trim()).filter(Boolean))];
  if (!targets.length) throw new Error('--only requires at least one target');
  for (const target of targets) if (!TARGETS.includes(target)) throw new Error(`Unknown Firebase rules target: ${target}`);
  if ((result.allowDirty || result.offline || result.skipTests) && !result.dryRun) throw new Error('--allow-dirty, --offline, and --skip-tests require --dry-run');
  result.targets = targets;
  delete result.all;
  return result;
}

function parseJson(text, label) {
  try { return JSON.parse(text); } catch (error) { throw new Error(`Invalid ${label}: ${error.message}`); }
}

export async function parseLocalRulesFiles(cwd, targets) {
  const selected = [...new Set(targets)];
  const local = {};
  if (selected.includes('database')) {
    const parsed = parseJson(await readFile(path.join(cwd, 'database.rules.json'), 'utf8'), 'database.rules.json');
    assert(plainObject(parsed) && plainObject(parsed.rules), 'database.rules.json must contain a plain-object rules property');
    local.database = parsed;
    local.rtdbRulesSha256 = digest(parsed);
  }
  if (selected.includes('firestore:rules')) {
    const raw = await readFile(path.join(cwd, 'firestore.rules'), 'utf8');
    const normalized = raw.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
    assert(normalized.trim(), 'firestore.rules must not be empty');
    assert(/rules_version\s*=\s*['"][^'"]+['"]\s*;/u.test(normalized), 'firestore.rules must declare rules_version');
    local.firestoreRules = normalized;
    local.firestoreRulesSha256s = [sha256(normalized), sha256(normalized.replaceAll('\n', '\r\n'))];
  }
  if (selected.includes('firestore:indexes')) {
    const parsed = parseJson(await readFile(path.join(cwd, 'firestore.indexes.json'), 'utf8'), 'firestore.indexes.json');
    assert(plainObject(parsed) && Object.keys(parsed).every(key => ['indexes', 'fieldOverrides'].includes(key)) && Array.isArray(parsed.indexes), 'Invalid firestore.indexes.json top-level shape');
    if (parsed.fieldOverrides !== undefined) {
      assert(Array.isArray(parsed.fieldOverrides) && parsed.fieldOverrides.length === 0, 'Non-empty Firestore fieldOverrides are not supported by automated readback and require separate qualification');
    }
    for (const index of parsed.indexes) {
      assert(plainObject(index) && Object.keys(index).every(key => ['collectionGroup', 'queryScope', 'fields'].includes(key)) && typeof index.collectionGroup === 'string' && index.collectionGroup.length > 0, 'Invalid Firestore composite index declaration');
      assert(['COLLECTION', 'COLLECTION_GROUP'].includes(index.queryScope), 'Invalid Firestore composite index queryScope');
      assert(Array.isArray(index.fields) && index.fields.length >= 2, 'Firestore composite indexes require at least two fields');
      for (const field of index.fields) {
        assert(plainObject(field) && typeof field.fieldPath === 'string' && field.fieldPath !== '__name__' && Object.keys(field).length === 2
          && (['ASCENDING', 'DESCENDING'].includes(field.order) || field.arrayConfig === 'CONTAINS'), 'Invalid Firestore composite index field');
      }
    }
    local.firestoreIndexes = parsed;
  }
  return local;
}

function indexKey(index) { return JSON.stringify({ collectionGroup: index.collectionGroup, queryScope: index.queryScope, fields: index.fields }); }
function normalizedFields(actual, declared) {
  const fields = [...(actual.fields || [])];
  const last = fields.at(-1);
  const defaultOrder = declared?.fields?.filter(field => field.order).at(-1)?.order || 'ASCENDING';
  if (last?.fieldPath === '__name__' && last.order === defaultOrder) fields.pop();
  return fields;
}

export function findPendingFirestoreIndexes(declared, observed) {
  const actual = Array.isArray(observed) ? observed : observed?.firestoreIndexes || observed?.indexes || [];
  const prefixFor = group => `projects/${FIREBASE_PROJECT_ID}/databases/(default)/collectionGroups/${group}/indexes/`;
  return (declared || []).filter(index => !actual.some(candidate => candidate.state === 'READY'
    && typeof candidate.name === 'string' && candidate.name.startsWith(prefixFor(index.collectionGroup))
    && candidate.queryScope === index.queryScope
    && indexKey({ collectionGroup: index.collectionGroup, queryScope: candidate.queryScope, fields: normalizedFields(candidate, index) }) === indexKey(index)));
}

export function validateRulesReadback(targets, local, observed) {
  const result = observed || {};
  if (targets.includes('database')) assert.equal(result.rulesSha256 ?? result.rtdbRules?.rulesSha256, local.rtdbRulesSha256, 'Active RTDB rules differ from candidate');
  if (targets.includes('firestore:rules')) {
    const rules = result.firestoreRules || {};
    assert(local.firestoreRulesSha256s.includes(rules.sourceSha256), 'Active Firestore rules source differs from candidate');
    assert.equal(rules.release?.name || result.firestoreRelease?.name, 'projects/temp-a1437/releases/cloud.firestore', 'Firestore release changed');
  }
  if (targets.includes('firestore:indexes')) assert.equal(findPendingFirestoreIndexes(local.firestoreIndexes.indexes, Array.isArray(result) ? result : result.firestoreIndexes ?? result.indexes).length, 0, 'Firestore indexes are missing or not READY');
  return true;
}

function observedFor(value) { return value?.rules ? value : value; }
export async function waitForRulesLive(targetsOrOptions, localArg, readStateArg, optionsArg = {}) {
  const objectStyle = targetsOrOptions && !Array.isArray(targetsOrOptions) && typeof targetsOrOptions === 'object';
  const targets = objectStyle ? targetsOrOptions.targets : targetsOrOptions;
  const local = objectStyle ? targetsOrOptions.local : localArg;
  const readState = objectStyle ? targetsOrOptions.readState : readStateArg;
  const options = objectStyle ? targetsOrOptions : optionsArg;
  const timeout = options.timeout ?? (targets.includes('firestore:indexes') ? 90000 : 30000);
  const initialDelay = options.initialDelay ?? 1500;
  const maxDelay = options.maxDelay ?? 10000;
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const started = now();
  let delay = initialDelay;
  let lastError;
  while (now() - started <= timeout) {
    try {
      const observed = observedFor(await readState({ rtdbRules: targets.includes('database'), firestoreRules: targets.includes('firestore:rules'), firestoreIndexes: targets.includes('firestore:indexes') }));
      validateRulesReadback(targets, local, observed);
      return observed;
    } catch (error) { lastError = error; }
    const remaining = timeout - (now() - started);
    if (remaining <= 0) break;
    await sleep(Math.min(delay, remaining));
    delay = Math.min(maxDelay, delay * 2);
  }
  throw new Error(`Timed out waiting for Firebase rules/indexes readback${lastError ? `: ${lastError.message}` : ''}`);
}

async function gitIdentity(cwd, deps, allowDirty, dryRun) {
  const status = outputOf(await run(deps, 'git', ['status', '--porcelain', '--untracked-files=all'], { cwd })).trim();
  assert(!status || (dryRun && allowDirty), `Git tree is dirty:\n${status}`);
  const revision = outputOf(await run(deps, 'git', ['rev-parse', 'HEAD'], { cwd })).trim();
  const tree = outputOf(await run(deps, 'git', ['rev-parse', 'HEAD^{tree}'], { cwd })).trim();
  return { revision, tree };
}

function rollbackGuidance(targets, prior, revision) {
  const lines = [`Candidate source revision: ${revision}`, 'To recover, check out the last known-good revision and rerun this guarded deploy command.'];
  if (targets.includes('database')) lines.push(`Prior RTDB rules SHA-256: ${prior?.rulesSha256 ?? prior?.rtdbRules?.rulesSha256 ?? 'unavailable'}`);
  if (targets.includes('firestore:rules')) lines.push(`Prior Firestore ruleset name: ${prior?.firestoreRules?.release?.rulesetName ?? prior?.firestoreRules?.rulesetName ?? 'unavailable'}`);
  lines.push('git checkout <known-good-revision>', `node scripts/deploy-firebase-rules.mjs --only ${targets.join(',')} --allow-non-main`);
  return lines.join('\n');
}

function assertNoPriorDrift(targets, prior, current) {
  if (targets.includes('database')) {
    assert.deepEqual(current?.rulesSha256 ?? current?.rtdbRules?.rulesSha256, prior?.rulesSha256 ?? prior?.rtdbRules?.rulesSha256, 'Active RTDB rules changed before deploy');
  }
  if (targets.includes('firestore:rules')) {
    assert.equal(current?.firestoreRules?.release?.rulesetName, prior?.firestoreRules?.release?.rulesetName, 'Active Firestore ruleset changed before deploy');
    assert.equal(current?.firestoreRules?.sourceSha256, prior?.firestoreRules?.sourceSha256, 'Active Firestore rules source changed before deploy');
  }
  if (targets.includes('firestore:indexes')) {
    assert.deepEqual(current?.firestoreIndexes, prior?.firestoreIndexes, 'Firestore indexes changed before deploy');
  }
}

export async function deployFirebaseRules({ targets, dryRun = false, allowDirty = false, offline = false, skipTests = false, allowNonMain = false, cwd = process.cwd(), deps = {} }) {
  assert(Array.isArray(targets) && targets.length > 0, 'Firebase deploy targets are required');
  targets = [...new Set(targets)];
  for (const target of targets) assert(TARGETS.includes(target), `Unknown Firebase rules target: ${target}`);
  if ((allowDirty || offline || skipTests) && !dryRun) throw new Error('--allow-dirty, --offline, and --skip-tests require --dry-run');
  const local = await parseLocalRulesFiles(cwd, targets);
  const identity = await gitIdentity(cwd, deps, allowDirty, dryRun);
  if (!dryRun && !allowNonMain) {
    await assertProtectedMain({
      runGit: args => run(deps, 'git', args, { cwd }).then(outputOf),
      revision: identity.revision,
      label: 'Production Firebase rules deploy',
    });
  }
  const readProvider = options => (deps.readState || readProviderState)(cwd, options);
  const allocatePort = deps.allocatePort ?? (() => allocateEmulatorPort('localhost'));
  const readOptions = { rtdbRules: targets.includes('database'), firestoreRules: targets.includes('firestore:rules'), firestoreIndexes: targets.includes('firestore:indexes') };
  const prior = dryRun && offline ? {} : await readProvider(readOptions);
  const tests = [];
  let tempDir;
  try {
    if (!skipTests && (targets.includes('database') || targets.includes('firestore:rules'))) {
      tempDir = await mkdtemp(path.join(os.tmpdir(), 'luyentap-rules-'));
    }
    if (!skipTests && targets.includes('database')) {
      const config = path.join(tempDir, 'rtdb-firebase.json');
      const reportPath = path.join(tempDir, 'rtdb-report.json');
      const rtdbPort = await allocatePort();
      await writeFile(config, JSON.stringify({ emulators: { database: { host: 'localhost', port: rtdbPort }, ui: { enabled: false } } }), 'utf8');
      const command = `node scripts/tooling-where.mjs --exec vitest run --config vitest.security-emulator.config.ts --passWithNoTests=false --reporter=json --outputFile="${reportPath.replaceAll('\\', '/')}"`;
      await run(deps, process.execPath, [TOOLING, '--exec', 'firebase', 'emulators:exec', '--only', 'database', '--project', 'demo-private-thcs-homework-current-rules', '--config', config, command], { cwd, env: { ...process.env, THCS_RULES_FILE: path.join(cwd, 'database.rules.json') } });
      const report = parseJson(await readFile(reportPath, 'utf8'), 'RTDB security Vitest report');
      parseVitestReport(report, RTDB_SECURITY_TEST_FILES, cwd);
      tests.push('database');
    }
    if (!skipTests && targets.includes('firestore:rules')) {
      const config = path.join(tempDir, 'firestore-firebase.json');
      const rulesCopy = path.join(tempDir, 'firestore.rules');
      const reportPath = path.join(tempDir, 'firestore-report.json');
      await writeFile(rulesCopy, local.firestoreRules, 'utf8');
      const firestorePort = await allocatePort();
      await writeFile(config, JSON.stringify({ firestore: { rules: 'firestore.rules' }, emulators: { firestore: { host: 'localhost', port: firestorePort }, ui: { enabled: false } } }), 'utf8');
      const command = `node scripts/tooling-where.mjs --exec vitest run src/__tests__/security/homeworkFirestoreRules.test.ts --passWithNoTests=false --reporter=json --outputFile="${reportPath.replaceAll('\\', '/')}"`;
      await run(deps, process.execPath, [TOOLING, '--exec', 'firebase', 'emulators:exec', '--only', 'firestore', '--project', 'demo-prd-0052-homework-rules', '--config', config, command], { cwd, env: { ...process.env, FIRESTORE_RULES_PATH: path.join(cwd, 'firestore.rules') } });
      const report = parseJson(await readFile(reportPath, 'utf8'), 'Firestore security Vitest report');
      parseVitestReport(report, FIRESTORE_SECURITY_TEST_FILES, cwd);
      tests.push('firestore:rules');
    }
    const plannedCommand = `node scripts/tooling-where.mjs --exec firebase deploy --only ${targets.join(',')} --project ${FIREBASE_PROJECT_ID} --non-interactive`;
    if (dryRun) return { status: 'DRY_RUN', project: FIREBASE_PROJECT_ID, targets, revision: identity.revision, tree: identity.tree, testsSkipped: skipTests, tests, local, prior, plannedCommand };
    const guidance = rollbackGuidance(targets, prior, identity.revision);
    try {
      const priorBeforeDeploy = await readProvider(readOptions);
      assertNoPriorDrift(targets, prior, priorBeforeDeploy);
    } catch (error) { Object.assign(error, { phase: 'pre-deploy-drift', prior, rollbackGuidance: guidance }); throw error; }
    try {
      await run(deps, process.execPath, [TOOLING, '--exec', 'firebase', 'deploy', '--only', targets.join(','), '--project', FIREBASE_PROJECT_ID, '--non-interactive'], { cwd });
    } catch (error) { Object.assign(error, { phase: 'deploy', prior, rollbackGuidance: guidance }); throw error; }
    let observed;
    try { observed = await waitForRulesLive(targets, local, readProvider, { sleep: deps.sleep, now: deps.now }); }
    catch (error) { Object.assign(error, { phase: 'readback', prior, rollbackGuidance: guidance }); throw error; }
    return { status: 'VERIFIED', project: FIREBASE_PROJECT_ID, targets, revision: identity.revision, tree: identity.tree, tests, prior, deployed: observed, rollbackGuidance: guidance };
  } finally { if (tempDir) await rm(tempDir, { recursive: true, force: true }); }
}

async function main() {
  try {
    const args = parseDeployRulesArgs(process.argv.slice(2));
    const result = await deployFirebaseRules(args);
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      const lines = [`status: ${result.status}`, `targets: ${result.targets.join(', ')}`];
      if (result.status === 'DRY_RUN') lines.push(`planned: ${result.plannedCommand}`);
      else lines.push(result.rollbackGuidance);
      console.log(lines.join('\n'));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) main();

