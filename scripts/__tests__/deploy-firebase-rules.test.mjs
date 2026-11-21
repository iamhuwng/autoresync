import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  FIRESTORE_SECURITY_TEST_FILES,
  RTDB_SECURITY_TEST_FILES,
  allocateEmulatorPort,
  deployFirebaseRules,
  findPendingFirestoreIndexes,
  parseDeployRulesArgs,
  parseLocalRulesFiles,
  validateRulesReadback,
  waitForRulesLive,
} from '../deploy-firebase-rules.mjs';

const index = { collectionGroup: 'items', queryScope: 'COLLECTION', fields: [{ fieldPath: 'a', order: 'ASCENDING' }, { fieldPath: 'b', order: 'DESCENDING' }] };
const observedIndex = (state = 'READY', group = 'items') => ({
  name: `projects/temp-a1437/databases/(default)/collectionGroups/${group}/indexes/idx1`,
  queryScope: 'COLLECTION',
  state,
  fields: [...index.fields, { fieldPath: '__name__', order: 'DESCENDING' }],
});
const result = (stdout = '') => ({ stdout, stderr: '' });

async function writeMockVitestReport(cwd, args, reportOverrides = {}) {
  const command = args.at(-1) || '';
  const match = /--outputFile="([^"]+)"/u.exec(command);
  if (!match) return;
  const outputFile = match[1];
  const files = command.includes('vitest.security-emulator.config.ts') ? RTDB_SECURITY_TEST_FILES : FIRESTORE_SECURITY_TEST_FILES;
  const report = {
    success: true,
    numFailedTestSuites: 0,
    numPendingTestSuites: 0,
    numTotalTests: files.length,
    numPassedTests: files.length,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    testResults: files.map(file => ({ name: path.resolve(cwd, file), status: 'passed' })),
    ...reportOverrides,
  };
  await writeFile(outputFile, JSON.stringify(report), 'utf8');
}

test('Firebase argument parsing requires one explicit target selector and restricts bypass flags', () => {
  assert.deepEqual(parseDeployRulesArgs(['--all']).targets, ['database', 'firestore:rules', 'firestore:indexes']);
  assert.deepEqual(parseDeployRulesArgs(['--only', 'database,database']).targets, ['database']);
  assert.equal(parseDeployRulesArgs(['--only', 'database', '--allow-non-main']).allowNonMain, true);
  assert.throws(() => parseDeployRulesArgs([]), /exactly one/);
  assert.throws(() => parseDeployRulesArgs(['--only', 'database', '--all']), /exactly one/);
  assert.throws(() => parseDeployRulesArgs(['--only', 'unknown']), /Unknown Firebase rules target/);
  assert.throws(() => parseDeployRulesArgs(['--only', 'database', '--offline']), /require --dry-run/);
  assert.throws(() => parseDeployRulesArgs(['--only', 'database', '--allow-dirty']), /require --dry-run/);
  assert.throws(() => parseDeployRulesArgs(['--only', 'database', '--skip-tests']), /require --dry-run/);
});

test('local rules and indexes are validated and hashed', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'deploy-rules-test-'));
  try {
    await writeFile(path.join(root, 'database.rules.json'), '{"rules":{".read":false}}\n');
    await writeFile(path.join(root, 'firestore.rules'), "rules_version = '2';\nservice cloud.firestore {}\n");
    await writeFile(path.join(root, 'firestore.indexes.json'), JSON.stringify({ indexes: [index] }));
    const local = await parseLocalRulesFiles(root, ['database', 'firestore:rules', 'firestore:indexes']);
    assert.match(local.rtdbRulesSha256, /^[a-f0-9]{64}$/);
    assert.equal(local.firestoreRulesSha256s.length, 2);
    assert.equal(findPendingFirestoreIndexes([index], [observedIndex('READY', 'items')]).length, 0);
    assert.equal(findPendingFirestoreIndexes([index], [observedIndex('READY', 'other')]).length, 1);
    await writeFile(path.join(root, 'firestore.indexes.json'), JSON.stringify({ indexes: [{ ...index, fields: [{ fieldPath: '__name__', order: 'ASCENDING' }, ...index.fields] }] }));
    await assert.rejects(() => parseLocalRulesFiles(root, ['firestore:indexes']), /Invalid Firestore composite index field/);
    await writeFile(path.join(root, 'firestore.indexes.json'), JSON.stringify({ indexes: [index], fieldOverrides: [{ collectionGroup: 'items', fieldPath: 'a', indexes: [] }] }));
    await assert.rejects(() => parseLocalRulesFiles(root, ['firestore:indexes']), /fieldOverrides are not supported/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('local rules validation rejects bad JSON, missing rules property, empty rules, and missing rules_version', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'deploy-rules-invalid-'));
  try {
    await writeFile(path.join(root, 'database.rules.json'), '{bad json');
    await assert.rejects(() => parseLocalRulesFiles(root, ['database']), /Invalid database\.rules\.json/);
    await writeFile(path.join(root, 'database.rules.json'), '{"other":true}');
    await assert.rejects(() => parseLocalRulesFiles(root, ['database']), /plain-object rules property/);
    await writeFile(path.join(root, 'firestore.rules'), '   \n');
    await assert.rejects(() => parseLocalRulesFiles(root, ['firestore:rules']), /must not be empty/);
    await writeFile(path.join(root, 'firestore.rules'), 'service cloud.firestore {}\n');
    await assert.rejects(() => parseLocalRulesFiles(root, ['firestore:rules']), /must declare rules_version/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('rules dry-run stops before firebase deploy', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'deploy-rules-dry-'));
  try {
    await writeFile(path.join(root, 'database.rules.json'), '{"rules":{}}\n');
    const calls = [];
    const deps = { exec: async (command, args) => { calls.push(args); if (args[0] === 'status') return { stdout: '', stderr: '' }; if (args[0] === 'rev-parse') return { stdout: `${args[1] === 'HEAD' ? 'a'.repeat(40) : 'b'.repeat(40)}\n`, stderr: '' }; return { stdout: '', stderr: '' }; } };
    const outcome = await deployFirebaseRules({ targets: ['database'], dryRun: true, allowDirty: true, offline: true, skipTests: true, cwd: root, deps });
    assert.equal(outcome.status, 'DRY_RUN');
    assert.equal(calls.some(args => args.includes('deploy')), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('emulator port allocation returns a valid ephemeral port', async () => {
  const port = await allocateEmulatorPort();
  assert.equal(Number.isInteger(port) && port >= 1 && port <= 65535, true);
});

test('readback validates RTDB hash and Firestore release', () => {
  const local = { rtdbRulesSha256: 'r'.repeat(64), firestoreRulesSha256s: ['f'.repeat(64)] };
  assert.equal(validateRulesReadback(['database', 'firestore:rules'], local, { rulesSha256: 'r'.repeat(64), firestoreRules: { sourceSha256: 'f'.repeat(64), release: { name: 'projects/temp-a1437/releases/cloud.firestore' } } }), true);
});

test('scoped deploy runs the matching emulator security suite with strict report checks and skips tests for indexes only', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'deploy-rules-scoped-'));
  try {
    await writeFile(path.join(root, 'database.rules.json'), '{"rules":{}}\n');
    await writeFile(path.join(root, 'firestore.rules'), "rules_version = '2';\n");
    await writeFile(path.join(root, 'firestore.indexes.json'), JSON.stringify({ indexes: [index] }));
    const calls = [];
    const emulatorConfigs = [];
    const allocatedPorts = [19123, 18123];
    let allocatedPortIndex = 0;
    const exec = async (command, args, options) => {
      calls.push({ command, args, options });
      if (args[0] === 'status') return result('');
      if (args[0] === 'rev-parse') return result('a'.repeat(40));
      if (args[0] === 'ls-remote') return result(`${'a'.repeat(40)}\trefs/heads/main\n`);
      if (args.includes('emulators:exec')) {
        const configPath = args[args.indexOf('--config') + 1];
        emulatorConfigs.push(JSON.parse(await readFile(configPath, 'utf8')));
        await writeMockVitestReport(root, args);
      }
      return result('');
    };
    const dbLocal = await parseLocalRulesFiles(root, ['database']);
    const allocatePort = async () => allocatedPorts[allocatedPortIndex++];
    await deployFirebaseRules({ targets: ['database'], cwd: root, deps: { exec, allocatePort, readState: async () => ({ rulesSha256: dbLocal.rtdbRulesSha256 }) } });
    assert(calls.some(call => call.args.includes('emulators:exec') && call.args.includes('database')));
    assert.equal(calls.find(call => call.args.includes('emulators:exec')).options.env.THCS_RULES_FILE, path.join(root, 'database.rules.json'));
    assert.equal(emulatorConfigs[0].emulators.database.port, allocatedPorts[0]);
    assert.notEqual(emulatorConfigs[0].emulators.database.port, 19000);
    calls.length = 0;
    const rulesLocal = await parseLocalRulesFiles(root, ['firestore:rules']);
    await deployFirebaseRules({ targets: ['firestore:rules'], cwd: root, deps: { exec, allocatePort, readState: async () => ({ firestoreRules: { sourceSha256: rulesLocal.firestoreRulesSha256s[0], release: { name: 'projects/temp-a1437/releases/cloud.firestore' } } }) } });
    const fsCall = calls.find(call => call.args.includes('emulators:exec') && call.args.includes('firestore'));
    assert(fsCall);
    assert.equal(fsCall.options.env.FIRESTORE_RULES_PATH, path.join(root, 'firestore.rules'));
    assert.equal(emulatorConfigs[1].emulators.firestore.port, allocatedPorts[1]);
    assert.notEqual(emulatorConfigs[1].emulators.firestore.port, 18080);
    calls.length = 0;
    const indexesLocal = await parseLocalRulesFiles(root, ['firestore:indexes']);
    await deployFirebaseRules({ targets: ['firestore:indexes'], cwd: root, deps: { exec, readState: async () => ({ firestoreIndexes: [observedIndex('READY', 'items')] }) } });
    assert.equal(calls.some(call => call.args.includes('emulators:exec')), false);
    assert.equal(indexesLocal.firestoreIndexes.indexes.length, 1);

    await assert.rejects(() => deployFirebaseRules({
      targets: ['firestore:rules'], cwd: root,
      deps: {
        exec: async (command, args) => {
          if (args[0] === 'status') return result('');
          if (args[0] === 'rev-parse') return result('a'.repeat(40));
          if (args[0] === 'ls-remote') return result(`${'a'.repeat(40)}\trefs/heads/main\n`);
          if (args.includes('emulators:exec')) await writeMockVitestReport(root, args, { numPendingTests: 1 });
          return result('');
        },
        readState: async () => ({ firestoreRules: { sourceSha256: rulesLocal.firestoreRulesSha256s[0], release: { name: 'projects/temp-a1437/releases/cloud.firestore' } } }),
      },
    }), /without failures or skips/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Firestore index readback retries CREATING and times out when never READY', async () => {
  const local = { firestoreIndexes: { indexes: [index] } };
  let reads = 0;
  const creating = { firestoreIndexes: [observedIndex('CREATING', 'items')] };
  const ready = { firestoreIndexes: [observedIndex('READY', 'items')] };
  let clock = 0;
  const observed = await waitForRulesLive(['firestore:indexes'], local, async () => { reads += 1; return reads === 1 ? creating : ready; }, { timeout: 100, initialDelay: 1, maxDelay: 1, sleep: async () => { clock += 2; }, now: () => clock });
  assert.equal(observed.firestoreIndexes[0].state, 'READY');
  await assert.rejects(() => waitForRulesLive(['firestore:indexes'], local, async () => creating, { timeout: 4, initialDelay: 1, maxDelay: 1, sleep: async () => { clock += 2; }, now: () => clock }), /Timed out/);
});

test('live guards block --skip-tests, dirty tree, and concurrent live drift while deploy failures include rollback guidance', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'deploy-rules-rollback-'));
  try {
    await writeFile(path.join(root, 'firestore.rules'), "rules_version = '2';\nservice cloud.firestore {}\n");
    await assert.rejects(() => deployFirebaseRules({ targets: ['firestore:rules'], cwd: root, skipTests: true, deps: {} }), /require --dry-run/);
    await assert.rejects(() => deployFirebaseRules({
      targets: ['firestore:rules'], cwd: root,
      deps: { exec: async (cmd, args) => args[0] === 'status' ? result(' M firestore.rules\n') : result('a'.repeat(40)) },
    }), /Git tree is dirty/);

    const priorRuleset = 'projects/temp-a1437/rulesets/prior-ruleset-99';
    const driftedRuleset = 'projects/temp-a1437/rulesets/drifted-ruleset-100';
    let driftRead = 0;
    const driftCalls = [];
    await assert.rejects(() => deployFirebaseRules({
      targets: ['firestore:rules'], cwd: root,
      deps: {
        exec: async (cmd, args) => {
          driftCalls.push(args);
          if (args[0] === 'status') return result('');
          if (args[0] === 'rev-parse') return result('a'.repeat(40));
          if (args[0] === 'ls-remote') return result(`${'a'.repeat(40)}\trefs/heads/main\n`);
          if (args.includes('emulators:exec')) await writeMockVitestReport(root, args);
          return result('');
        },
        readState: async () => ({
          firestoreRules: {
            release: { name: 'projects/temp-a1437/releases/cloud.firestore', rulesetName: driftRead++ === 0 ? priorRuleset : driftedRuleset },
            sourceSha256: 'x'.repeat(64),
          },
        }),
      },
    }), error => {
      assert.equal(error.phase, 'pre-deploy-drift');
      assert.match(error.rollbackGuidance, new RegExp(`node scripts/deploy-firebase-rules\\.mjs --only firestore:rules --allow-non-main`));
      return error.rollbackGuidance.includes(priorRuleset);
    });
    assert.equal(driftCalls.some(args => args.includes('deploy')), false);

    await assert.rejects(() => deployFirebaseRules({
      targets: ['firestore:rules'], cwd: root,
      deps: {
        exec: async (cmd, args) => {
          if (args[0] === 'status') return result('');
          if (args[0] === 'rev-parse') return result('a'.repeat(40));
          if (args[0] === 'ls-remote') return result(`${'a'.repeat(40)}\trefs/heads/main\n`);
          if (args.includes('emulators:exec')) await writeMockVitestReport(root, args);
          if (args.includes('deploy')) throw new Error('firebase deploy failed');
          return result('');
        },
        readState: async () => ({ firestoreRules: { release: { name: 'projects/temp-a1437/releases/cloud.firestore', rulesetName: priorRuleset }, sourceSha256: 'x'.repeat(64) } }),
      },
    }), error => error.phase === 'deploy' && error.rollbackGuidance.includes(priorRuleset));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('live Firebase rules deploys enforce origin/main unless --allow-non-main is passed, while --dry-run stays feature-branch friendly', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'deploy-rules-main-'));
  try {
    await writeFile(path.join(root, 'database.rules.json'), '{"rules":{}}\n');
    const local = await parseLocalRulesFiles(root, ['database']);

    const mismatchCalls = [];
    await assert.rejects(() => deployFirebaseRules({
      targets: ['database'], cwd: root,
      deps: {
        exec: async (cmd, args) => {
          mismatchCalls.push(args);
          if (args[0] === 'status') return result('');
          if (args[0] === 'rev-parse') return result('a'.repeat(40));
          if (args[0] === 'ls-remote') return result(`${'b'.repeat(40)}\trefs/heads/main\n`);
          return result('');
        },
        readState: async () => { throw new Error('provider read must not run on non-main'); },
      },
    }), /match protected origin\/main/u);
    assert.equal(mismatchCalls.some(args => args.includes('emulators:exec')), false);

    await assert.rejects(() => deployFirebaseRules({
      targets: ['database'], cwd: root,
      deps: {
        exec: async (cmd, args) => {
          if (args[0] === 'status') return result('');
          if (args[0] === 'rev-parse') return result('a'.repeat(40));
          if (args[0] === 'ls-remote') return result('');
          return result('');
        },
        readState: async () => { throw new Error('provider read must not run'); },
      },
    }), /could not be resolved/u);

    const dryCalls = [];
    const dry = await deployFirebaseRules({
      targets: ['database'], dryRun: true, offline: true, skipTests: true, cwd: root,
      deps: {
        exec: async (cmd, args) => {
          dryCalls.push(args);
          if (args[0] === 'status') return result('');
          if (args[0] === 'rev-parse') return result('a'.repeat(40));
          return result('');
        },
      },
    });
    assert.equal(dry.status, 'DRY_RUN');
    assert.equal(dryCalls.some(args => args[0] === 'ls-remote'), false);

    const overrideCalls = [];
    const overridden = await deployFirebaseRules({
      targets: ['database'], allowNonMain: true, cwd: root,
      deps: {
        exec: async (cmd, args) => {
          overrideCalls.push(args);
          if (args[0] === 'status') return result('');
          if (args[0] === 'rev-parse') return result('a'.repeat(40));
          if (args.includes('emulators:exec')) await writeMockVitestReport(root, args);
          return result('');
        },
        allocatePort: async () => 19124,
        readState: async () => ({ rulesSha256: local.rtdbRulesSha256 }),
      },
    });
    assert.equal(overridden.status, 'VERIFIED');
    assert.equal(overrideCalls.some(args => args[0] === 'ls-remote'), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
