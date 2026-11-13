import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { assess, classifyPaths, collectSourceState, compatibilityReviewBindingsMatch, main, STATUS } from '../release-check.mjs';
import { prepareHotfix } from '../hotfix-prepare.mjs';
import { observeHosting, parseHostingChannelEvidence, writeHostingManifest } from '../release-evidence.mjs';

const git = (cwd, ...args) => { const r = spawnSync('git', args, { cwd, encoding:'utf8', windowsHide:true }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const fixture = async () => { const cwd = await mkdtemp(path.join(os.tmpdir(),'release-check-')); git(cwd,'init','-q'); git(cwd,'config','user.email','test@example.invalid'); git(cwd,'config','user.name','Release Test'); await mkdir(path.join(cwd,'src')); await mkdir(path.join(cwd,'public')); await mkdir(path.join(cwd,'cloudflare')); await writeFile(path.join(cwd,'.gitignore'),'baseline.json\n'); await writeFile(path.join(cwd,'src','App.jsx'),'export default 1;'); await writeFile(path.join(cwd,'public','index.html'),'x'); await writeFile(path.join(cwd,'firebase.json'),JSON.stringify({hosting:[{target:'kahut1',public:'dist'}]})); await writeFile(path.join(cwd,'.firebaserc'),JSON.stringify({projects:{default:'temp-a1437'}})); await writeFile(path.join(cwd,'cloudflare','wrangler.book-source.jsonc'),'{}'); git(cwd,'add','.'); git(cwd,'commit','-qm','base'); await writeFile(path.join(cwd,'public','index.html'),'y'); git(cwd,'add','.'); git(cwd,'commit','-qm','candidate'); return cwd; };

test('classifies known service paths conservatively', () => assert.deepEqual(classifyPaths(['src/App.jsx','cloudflare/worker.ts','database.rules.json']), ['firebase-rules','hosting','worker']));
test('classifies website build configuration as Hosting', () => assert.deepEqual(classifyPaths(['postcss.config.cjs','tailwind.config.js','tsconfig.json','tsconfig.app.json']), ['hosting']));
test('classifies CI and integration result machinery as release tooling', () => assert.deepEqual(classifyPaths(['.github/workflows/release-safety.yml','scripts/integration-check.mjs']), ['tooling']));
test('historical migration documentation is not an executable migration requirement', () => {
  assert.deepEqual(classifyPaths(['documentation/migration/backup-tests-collection.js', '.knowns/docs/migration/hooks.md']), []);
  assert(classifyPaths(['scripts/backfill-reading.mjs']).includes('migrations'));
  assert(classifyPaths(['migrations/001.sql']).includes('migrations'));
});
test('Hosting review binding rejects changed or omitted native dependency state', () => {
  const source = { revision: 'a'.repeat(40), baseRevision: 'b'.repeat(40) };
  const observation = { fingerprint: 'c'.repeat(64) }, dependencies = { fingerprint: 'd'.repeat(64) };
  const review = { schemaVersion: 1, decision: 'verified', reviewer: 'fixture reviewer', reviewedAt: new Date().toISOString(),
    sourceRevision: source.revision, baseRevision: source.baseRevision, observedFingerprint: observation.fingerprint,
    scope: ['Hosting against active dependencies'], dependenciesFingerprint: dependencies.fingerprint };
  assert.equal(compatibilityReviewBindingsMatch(review, source, observation, dependencies), true);
  assert.equal(compatibilityReviewBindingsMatch({ ...review, dependenciesFingerprint: undefined }, source, observation, dependencies), false);
  assert.equal(compatibilityReviewBindingsMatch(review, source, observation, { fingerprint: 'e'.repeat(64) }), false);
});
test('Hosting target cannot use caller dependency JSON or fixed service profiles to clear service gates', async () => {
  const cwd = await fixture();
  try {
    const base = git(cwd, 'rev-parse', 'HEAD');
    await writeFile(path.join(cwd, 'cloudflare/changed-worker.ts'), 'export const changed = true;');
    git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', 'backend source differs');
    const manifest = { schemaVersion: 1, environment: 'production', project: 'temp-a1437', site: 'kahut1', revision: base,
      tree: git(cwd, 'rev-parse', `${base}^{tree}`), files: [{ path: '/index.html', sha256: crypto.createHash('sha256').update('x').digest('hex') }] };
    const observation = await observeHosting({ fetchImpl: async url => ({ ok: true, url,
      arrayBuffer: async () => Buffer.from(url.endsWith('luyentap-release.json') ? JSON.stringify(manifest) : 'x') }) });
    assert.equal(observation.sourceKnown, true);
    const result = await assess({ cwd, base, target: 'hosting', hostingObservation: observation,
      hostingDependenciesObservation: { scope: 'hosting-dependencies', readOnly: true }, productionEnvFingerprint: 'env' });
    assert.equal(result.target, 'hosting');
    assert(result.source.services.includes('worker'));
    assert.equal(result.hostingDependencies, null);
    assert.equal(result.decision, STATUS.UNVERIFIED);
    assert(result.findings.some(finding => /Untrusted or stale Hosting dependency/u.test(finding.message)));
    for (const options of [{ observeHomework: true }, { observeListening: true }, { baselinePath: 'assertion.json' }, { mode: 'acceptance' }]) {
      await assert.rejects(assess({ cwd, base, target: 'hosting', ...options }), /native production Hosting observation/u);
    }
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
test('shared compiled scoring and contract code affects Hosting and the Homework Worker', () => {
  assert.deepEqual(classifyPaths(['src/services/reading-v2/readingV2AnswerScoring.ts', 'src/services/reading-v2/readingV2ContractGuards.service.ts']), ['backup-worker', 'hosting']);
  assert.deepEqual(classifyPaths(['src/components/reading-v2/runtime/ReadingV2RuntimeShell.css']), ['hosting']);
});
test('a shared scorer change cannot be described or qualified as a Hosting-only release', async () => {
  const cwd = await fixture();
  try {
    await mkdir(path.join(cwd, 'src/services/reading-v2'), { recursive: true });
    await writeFile(path.join(cwd, 'src/services/reading-v2/readingV2AnswerScoring.ts'), 'export const score = 1;');
    git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', 'change shared scorer');
    const result = await assess({ cwd, base: 'HEAD^' });
    assert(result.findings.some(finding => finding.status === STATUS.UNVERIFIED && /Backup Worker active version/u.test(finding.message)));
    assert(result.deploymentOrder.some(action => /Homework\/backup Worker compatibility before Hosting/u.test(action)));
    assert(!result.deploymentOrder.includes('Hosting-only deployment.'));
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('fixed Homework Worker observation rejects mixed evidence and missing artifact paths', async () => {
  await assert.rejects(() => assess({ observeHomework: true, observe: true }), /cannot be combined/u);
  await assert.rejects(() => assess({ observeHomework: true, mode: 'hotfix' }), /cannot be combined/u);
  await assert.rejects(() => assess({ observeHomework: true }), /requires --worker-bundle and --worker-config/u);
  await assert.rejects(() => assess({ workerBundlePath: 'candidate.js' }), /require --observe-homework-worker/u);
});

test('fixed Homework Worker route cannot suppress services for an arbitrary candidate', async () => {
  const cwd = await fixture();
  try {
    const result = await assess({ cwd, base: 'HEAD^', observeHomework: true, workerBundlePath: 'public/index.html', workerConfigPath: 'firebase.json' });
    assert.equal(result.decision, STATUS.UNVERIFIED);
    assert.equal(result.observed, null);
    assert.ok(result.source.files.includes('public/index.html'));
    assert.ok(result.source.changedServices.includes('hosting'));
    assert.ok(result.findings.some(finding => /Homework Worker readback/u.test(finding.message)));
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('Listening Worker-only route rejects foreign source and caller evidence without Hosting qualification', async () => {
  const cwd = await fixture();
  try {
    const options = { cwd, base: 'HEAD^', observeListeningEditorRelease: true, listeningPhase: 'predeploy' };
    const result = await assess(options);
    assert.equal(result.decision, STATUS.UNVERIFIED);
    assert.equal(result.editorObservation, null);
    assert.equal(result.hostingReady, false);
    assert.equal(result.observed, null);
    assert(result.source.changedServices.includes('hosting'));
    assert(result.source.files.includes('public/index.html'));
    assert(result.findings.some(finding => /Editor release readback/u.test(finding.message)));
    assert(!result.findings.some(finding => /Hosting|deployed baseline/u.test(finding.message)));
    for (const extra of [{ baselinePath: 'assertion.json' }, { hostingObservation: {} }, { observeProvider: true },
      { observeHomework: true }, { mode: 'hotfix' }, { compatibilityReviewPath: 'review.json' }]) {
      await assert.rejects(assess({ ...options, ...extra }), /native observation/);
    }
    await assert.rejects(assess({ ...options, observeListeningEditorRelease: false, observeListening: true }), /native observation/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('CLI receipts follow the selected --cwd candidate', async () => {
  const caller = await fixture(), selected = await fixture();
  const receipt = 'tmp/release-receipts/selected.json';
  try {
    assert.equal(await main(['--cwd', selected, '--base', 'HEAD^', '--receipt', receipt], caller), 2);
    await access(path.join(selected, receipt));
    await assert.rejects(() => access(path.join(caller, receipt)));
  } finally {
    await rm(caller, { recursive: true, force: true });
    await rm(selected, { recursive: true, force: true });
  }
});
test('classifies backup Worker and Backblaze surfaces conservatively', () => assert.deepEqual(classifyPaths(['r2-backup-worker/src/index.ts','cloudflare/wrangler.book-source.jsonc']), ['backblaze','backup-worker','worker']));

test('a caller-shaped private audio claim cannot waive the local Book/Backblaze guard', async () => {
  const cwd = await fixture();
  try {
    await mkdir(path.join(cwd, 'scripts'));
    await writeFile(path.join(cwd, 'scripts/local-book-source-worker.mjs'), 'export default {};');
    git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', 'local Worker change');
    const result = await assess({ cwd, base: 'HEAD^', editorObservation: {
      profile: 'private-audio', local: { localListeningBindingOnly: true }, phase: 'postrules',
    } });
    assert(result.source.services.includes('backblaze'));
    assert(result.findings.some(finding => finding.status === STATUS.UNVERIFIED && /Verify B2 bucket/u.test(finding.message)));
    assert(!result.findings.some(finding => /verifies only the local Listening/u.test(finding.message)));
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('isolates unchanged Book rollout gates while retaining them for a Book Worker change', async () => {
  const cwd = await fixture();
  try {
    const configPath = path.join(cwd, 'cloudflare', 'wrangler.book-source.jsonc');
    const config = { vars: { BOOK_ROLLOUT_CONFIG_JSON: JSON.stringify({ expiresAt: '2020-01-01T00:00:00Z' }) } };
    await writeFile(configPath, JSON.stringify(config));
    git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', 'existing dormant Book configuration');
    const base = git(cwd, 'rev-parse', 'HEAD');
    await writeFile(path.join(cwd, 'cloudflare', 'thcs-gemma-worker.js'), 'export default {};');
    git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', 'AI Worker correction');
    const ai = await assess({ cwd, base, productionEnvFingerprint: 'env' });
    assert.equal(ai.decision, STATUS.UNVERIFIED);
    assert.ok(ai.findings.some(finding => /own deployed version/u.test(finding.message)));
    assert.ok(!ai.findings.some(finding => /rollout expired/u.test(finding.message)));
    config.vars.BOOK_SOURCE_CONTROL_ALLOWED_ORIGIN = 'http://localhost:5173';
    await writeFile(configPath, JSON.stringify(config));
    git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', 'Book Worker configuration change');
    const book = await assess({ cwd, base, productionEnvFingerprint: 'env' });
    assert.equal(book.decision, STATUS.BLOCKED);
    assert.ok(book.findings.some(finding => /rollout expired/u.test(finding.message)));
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
test('clean candidate with missing baseline is unverified', async () => { const cwd=await fixture(); try { const result=await assess({cwd,base:'HEAD^'}); assert.equal(result.source.dirty,false); assert.equal(result.decision,STATUS.UNVERIFIED); assert.ok(result.findings.some(f=>f.status===STATUS.UNVERIFIED&&/baseline/i.test(f.message))); } finally { await rm(cwd,{recursive:true,force:true}); } });
test('dirty candidate is blocked and assessment remains read-only', async () => { const cwd=await fixture(); try { await writeFile(path.join(cwd,'src','App.jsx'),'dirty'); const result=await assess({cwd,base:'HEAD^'}); assert.equal(result.decision,STATUS.BLOCKED); assert.equal(result.readOnly,true); } finally { await rm(cwd,{recursive:true,force:true}); } });
test('untracked source files trigger the dirty candidate guard', async () => { const cwd=await fixture(); try { await writeFile(path.join(cwd,'untracked-release-source.txt'),'candidate'); const source=await collectSourceState(cwd,'HEAD^'); assert.equal(source.dirty,true); assert(source.files.includes('untracked-release-source.txt')); } finally { await rm(cwd,{recursive:true,force:true}); } });

test('baseline evidence must be fresh, verified, and include Hosting dependencies', async () => { const cwd=await fixture(); try { const baseline=path.join(cwd,'baseline.json'); await writeFile(baseline,JSON.stringify({schemaVersion:1,evidenceVersion:1,verified:true,observedAt:'not-a-date',services:{hosting:{identity:'x',fingerprint:'x',evidenceRef:'x'}}})); const result=await assess({cwd,base:'HEAD^',baselinePath:'baseline.json',productionEnvFingerprint:'env'}); assert.equal(result.decision,STATUS.UNVERIFIED); } finally { await rm(cwd,{recursive:true,force:true}); } });

test('caller-supplied provider-shaped assertions cannot produce PASS', async () => { const cwd=await fixture(); try { const baseline={schemaVersion:1,evidenceVersion:1,verified:true,observedAt:new Date().toISOString(),provenance:{kind:'read-only-provider',provider:'fixture',evidenceHash:'claimed'},services:{hosting:{identity:'x',fingerprint:'x',evidenceRef:'x'}},dependencies:{worker:{compatibility:'verified'},firebaseRules:{compatibility:'verified'}}}; await writeFile(path.join(cwd,'baseline.json'),JSON.stringify(baseline)); const result=await assess({cwd,base:'HEAD^',baselinePath:'baseline.json',productionEnvFingerprint:'env'}); assert.equal(result.decision,STATUS.UNVERIFIED); assert.ok(result.findings.some(f=>/caller-supplied assertion/i.test(f.message))); } finally { await rm(cwd,{recursive:true,force:true}); } });

test('production observation rejects invalid identity and content evidence', async () => { await assert.rejects(() => observeHosting({fetchImpl:async url => ({ok:true,url,arrayBuffer:async()=>Buffer.from(JSON.stringify({schemaVersion:1,project:'wrong',site:'kahut1',revision:'x',tree:'y',files:[]}))})}), /Invalid production Hosting manifest/); });
test('production observation explains a pre-manifest HTML response', async () => { await assert.rejects(() => observeHosting({fetchImpl:async url => ({ok:true,url,arrayBuffer:async()=>Buffer.from('<!doctype html>')})}), /response is not JSON/u); });
test('Firebase Hosting provider metadata is accepted only as source-unverified evidence', () => { const provider=parseHostingChannelEvidence({result:{channels:[{name:'projects/temp-a1437/sites/kahut1/channels/live',url:'https://kahut1.web.app',release:{releaseTime:'2026-10-11T00:00:00Z',version:{name:'projects/temp-a1437/sites/kahut1/versions/abc123',status:'FINALIZED',fileCount:'445',versionBytes:'10',config:{rewrites:[]},labels:{'deployment-tool':'cli-firebase'}}}}]}}); assert.equal(provider.version,'projects/temp-a1437/sites/kahut1/versions/abc123'); assert.throws(()=>parseHostingChannelEvidence({result:{channels:[]}}),/finalized kahut1/u); });
test('acceptance preview manifests cannot become production observations', async () => { await assert.rejects(() => observeHosting({fetchImpl:async url => ({ok:true,url,arrayBuffer:async()=>Buffer.from(JSON.stringify({schemaVersion:1,environment:'acceptance',project:'temp-a1437',site:'kahut1',revision:'a'.repeat(40),tree:'b'.repeat(40),files:[{path:'/index.html',sha256:'c'.repeat(64)}]}))})}), /Invalid production Hosting manifest/u); });
test('Hosting observation bounds concurrent asset readback', async () => {
  const contentHash = crypto.createHash('sha256').update('asset').digest('hex');
  const manifest = { schemaVersion: 1, environment: 'production', project: 'temp-a1437', site: 'kahut1', revision: 'a'.repeat(40), tree: 'b'.repeat(40), files: [{ path: '/index.html', sha256: contentHash }, ...Array.from({ length: 16 }, (_, index) => ({ path: `/asset-${index}.js`, sha256: contentHash }))] };
  let inFlight = 0, maxInFlight = 0;
  const observation = await observeHosting({ readConcurrency: 3, maxAttempts: 1, fetchImpl: async url => {
    if (url.endsWith('luyentap-release.json')) return { ok: true, url, arrayBuffer: async () => Buffer.from(JSON.stringify(manifest)) };
    inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight); await new Promise(resolve => setTimeout(resolve, 1)); inFlight -= 1;
    return { ok: true, url, arrayBuffer: async () => Buffer.from('asset') };
  } });
  assert.equal(observation.revision, manifest.revision);
  assert.equal(maxInFlight, 3);
});
test('Hosting observation retries a complete snapshot after transient asset drift', async () => {
  const newHash = crypto.createHash('sha256').update('new').digest('hex');
  const manifest = revision => ({ schemaVersion: 1, environment: 'production', project: 'temp-a1437', site: 'kahut1', revision, tree: 'b'.repeat(40), files: [{ path: '/index.html', sha256: newHash }] });
  let manifestReads = 0;
  const observation = await observeHosting({ readConcurrency: 1, maxAttempts: 2, retryDelayMs: 0, fetchImpl: async url => {
    if (url.endsWith('luyentap-release.json')) {
      manifestReads += 1;
      return { ok: true, url, arrayBuffer: async () => Buffer.from(JSON.stringify(manifest(manifestReads === 1 ? 'a'.repeat(40) : 'c'.repeat(40)))) };
    }
    return { ok: true, url, arrayBuffer: async () => Buffer.from(manifestReads === 1 ? 'old' : 'new') };
  } });
  assert.equal(observation.revision, 'c'.repeat(40));
  assert.equal(manifestReads, 2);
});
test('Hosting retries wait for the failed read batch before starting another batch', async () => {
  const newHash = crypto.createHash('sha256').update('new').digest('hex');
  const manifest = { schemaVersion: 1, environment: 'production', project: 'temp-a1437', site: 'kahut1', revision: 'a'.repeat(40), tree: 'b'.repeat(40), files: [{ path: '/index.html', sha256: newHash }, ...Array.from({ length: 15 }, (_, index) => ({ path: `/asset-${index}.js`, sha256: newHash }))] };
  let attempt = 0, inFlight = 0, maxInFlight = 0;
  await observeHosting({ readConcurrency: 8, maxAttempts: 2, retryDelayMs: 0, fetchImpl: async url => {
    if (url.endsWith('luyentap-release.json')) {
      attempt += 1;
      return { ok: true, url, arrayBuffer: async () => Buffer.from(JSON.stringify(manifest)) };
    }
    const firstAttempt = attempt === 1 && url.endsWith('/index.html');
    inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight);
    if (!firstAttempt) await new Promise(resolve => setTimeout(resolve, 10));
    inFlight -= 1;
    return { ok: true, url, arrayBuffer: async () => Buffer.from(firstAttempt ? 'old' : 'new') };
  } });
  assert.equal(attempt, 2);
  assert.ok(maxInFlight <= 8, `asset read concurrency exceeded the configured bound: ${maxInFlight}`);
});
test('Hosting stops assigning queued files after an early permanent failure', async () => {
  const contentHash = crypto.createHash('sha256').update('asset').digest('hex');
  const manifest = { schemaVersion: 1, environment: 'production', project: 'temp-a1437', site: 'kahut1', revision: 'a'.repeat(40), tree: 'b'.repeat(40), files: [{ path: '/index.html', sha256: contentHash }, ...Array.from({ length: 119 }, (_, index) => ({ path: `/asset-${index}.js`, sha256: contentHash }))] };
  let assetRequests = 0, manifestReads = 0;
  await assert.rejects(() => observeHosting({ readConcurrency: 8, maxAttempts: 3, retryDelayMs: 0, fetchImpl: async url => {
    if (url.endsWith('luyentap-release.json')) {
      manifestReads += 1;
      return { ok: true, url, arrayBuffer: async () => Buffer.from(JSON.stringify(manifest)) };
    }
    assetRequests += 1;
    if (url.endsWith('/index.html')) return { ok: false, status: 404, url, arrayBuffer: async () => Buffer.alloc(0) };
    await new Promise(resolve => setTimeout(resolve, 10));
    return { ok: true, url, arrayBuffer: async () => Buffer.from('asset') };
  } }), /HTTP 404/u);
  assert.equal(manifestReads, 1);
  assert.ok(assetRequests <= 8, `queued asset work continued after failure: ${assetRequests}`);
});
test('Hosting prefers a permanent failure when retryable and permanent reads fail together', async () => {
  const contentHash = crypto.createHash('sha256').update('good').digest('hex');
  const manifest = { schemaVersion: 1, environment: 'production', project: 'temp-a1437', site: 'kahut1', revision: 'a'.repeat(40), tree: 'b'.repeat(40), files: [{ path: '/index.html', sha256: contentHash }, { path: '/asset-0.js', sha256: contentHash }, ...Array.from({ length: 118 }, (_, index) => ({ path: `/asset-${index + 1}.js`, sha256: contentHash }))] };
  let assetRequests = 0, manifestReads = 0;
  await assert.rejects(() => observeHosting({ readConcurrency: 8, maxAttempts: 3, retryDelayMs: 0, fetchImpl: async url => {
    if (url.endsWith('luyentap-release.json')) {
      manifestReads += 1;
      return { ok: true, url, arrayBuffer: async () => Buffer.from(JSON.stringify(manifest)) };
    }
    assetRequests += 1;
    if (url.endsWith('/asset-0.js')) return { ok: false, status: 404, url, arrayBuffer: async () => Buffer.alloc(0) };
    if (url.endsWith('/index.html')) await new Promise(resolve => setTimeout(resolve, 10));
    else await new Promise(resolve => setTimeout(resolve, 20));
    return { ok: true, url, arrayBuffer: async () => Buffer.from(url.endsWith('/index.html') ? 'bad' : 'good') };
  } }), /HTTP 404/u);
  assert.equal(manifestReads, 1);
  assert.ok(assetRequests <= 8, `queued asset work continued after simultaneous failures: ${assetRequests}`);
});
test('Hosting retries a transient response-body read but not a permanent HTTP error', async () => {
  const bodyHash = crypto.createHash('sha256').update('asset').digest('hex');
  const manifest = { schemaVersion: 1, environment: 'production', project: 'temp-a1437', site: 'kahut1', revision: 'a'.repeat(40), tree: 'b'.repeat(40), files: [{ path: '/index.html', sha256: bodyHash }] };
  let manifestReads = 0;
  await observeHosting({ maxAttempts: 2, retryDelayMs: 0, fetchImpl: async url => {
    if (url.endsWith('luyentap-release.json')) {
      manifestReads += 1;
      return { ok: true, url, arrayBuffer: async () => {
        if (manifestReads === 1) throw new Error('socket reset');
        return Buffer.from(JSON.stringify(manifest));
      } };
    }
    return { ok: true, url, arrayBuffer: async () => Buffer.from('asset') };
  } });
  assert.equal(manifestReads, 2);

  let transientHttpManifestReads = 0;
  await observeHosting({ maxAttempts: 2, retryDelayMs: 0, fetchImpl: async url => {
    if (url.endsWith('luyentap-release.json')) {
      transientHttpManifestReads += 1;
      if (transientHttpManifestReads === 1) return { ok: false, status: 503, url, arrayBuffer: async () => Buffer.alloc(0) };
    }
    return { ok: true, url, arrayBuffer: async () => Buffer.from(url.endsWith('luyentap-release.json') ? JSON.stringify(manifest) : 'asset') };
  } });
  assert.equal(transientHttpManifestReads, 2);

  let permanentReads = 0;
  await assert.rejects(() => observeHosting({ maxAttempts: 3, retryDelayMs: 0, fetchImpl: async url => {
    permanentReads += 1;
    return { ok: false, status: 404, url, arrayBuffer: async () => Buffer.alloc(0) };
  } }), /HTTP 404/u);
  assert.equal(permanentReads, 1);
});
test('acceptance observation can use only an explicit localhost origin', async () => { const contentHash=crypto.createHash('sha256').update('x').digest('hex'); const observation=await observeHosting({originOverride:'http://localhost:5199',expectedEnvironment:'acceptance',fetchImpl:async url => ({ok:true,url,arrayBuffer:async()=>Buffer.from(url.endsWith('luyentap-release.json') ? JSON.stringify({schemaVersion:1,environment:'acceptance',project:'temp-a1437',site:'kahut1',revision:'a'.repeat(40),tree:'b'.repeat(40),files:[{path:'/index.html',sha256:contentHash}]}) : 'x')})}); assert.equal(observation.evidenceRef,'http://localhost:5199/.well-known/luyentap-release.json'); await assert.rejects(() => observeHosting({originOverride:'https://kahut1.web.app',expectedEnvironment:'acceptance',fetchImpl:async()=>({})}), /localhost acceptance/u); });
test('manifest writer binds acceptance artifacts to acceptance environment', async () => { const cwd=await fixture(); try { await mkdir(path.join(cwd,'dist'),{recursive:true}); await writeFile(path.join(cwd,'dist','index.html'),'x'); const manifest=await writeHostingManifest({cwd,envFingerprint:'mock-env',environment:'acceptance'}); assert.equal(manifest.environment,'acceptance'); assert.equal(JSON.parse(await readFile(path.join(cwd,'dist','.well-known','luyentap-release.json'),'utf8')).environment,'acceptance'); } finally { await rm(cwd,{recursive:true,force:true}); } });

test('observed Hosting baseline permits a Hosting-only PASS', async () => { const cwd=await fixture(); try { const base=git(cwd,'rev-parse','HEAD^'); const tree=git(cwd,'rev-parse',`${base}^{tree}`); const contentHash=crypto.createHash('sha256').update('x').digest('hex'); const observation=await observeHosting({fetchImpl:async url => ({ok:true,url,arrayBuffer:async()=>Buffer.from(url.endsWith('luyentap-release.json') ? JSON.stringify({schemaVersion:1,environment:'production',project:'temp-a1437',site:'kahut1',revision:base,tree,compatibility:{worker:'verified'},files:[{path:'/index.html',sha256:contentHash}]}) : 'x')})}); const result=await assess({cwd,base,hostingObservation:observation,productionEnvFingerprint:'env'}); assert.equal(result.decision,STATUS.PASS); assert.ok(result.observed); assert.ok(result.requiredActions.length === 0); } finally { await rm(cwd,{recursive:true,force:true}); } });

test('Hosting observation cannot qualify Firebase rules, indexes or Functions', async t => {
  for (const file of ['database.rules.json', 'firestore.rules', 'firestore.indexes.json', 'functions/index.js', 'database.rules.json+hosting']) {
    await t.test(file, async () => {
      const cwd = await fixture();
      try {
        const base = git(cwd, 'rev-parse', 'HEAD');
        const target = path.join(cwd, file.split('+')[0]);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, '{}');
        if (file.endsWith('+hosting')) await writeFile(path.join(cwd, 'public/index.html'), 'mixed change');
        git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', 'unsupported service change');
        const manifest = { schemaVersion: 1, environment: 'production', project: 'temp-a1437', site: 'kahut1',
          revision: base, tree: git(cwd, 'rev-parse', `${base}^{tree}`),
          files: [{ path: '/index.html', sha256: crypto.createHash('sha256').update('x').digest('hex') }] };
        const observation = await observeHosting({ fetchImpl: async url => ({ ok: true, url,
          arrayBuffer: async () => Buffer.from(url.endsWith('luyentap-release.json') ? JSON.stringify(manifest) : 'x') }) });
        const result = await assess({ cwd, base, hostingObservation: observation, productionEnvFingerprint: 'env' });
        assert.equal(result.source.dirty, false);
        assert.equal(result.decision, STATUS.UNVERIFIED);
        assert(result.findings.some(finding => finding.status === STATUS.UNVERIFIED && /Hosting observation cannot verify/u.test(finding.message)));
      } finally { await rm(cwd, { recursive: true, force: true }); }
    });
  }
});

test('Hosting revision match cannot hide a different observed base tree', async () => {
  const cwd = await fixture();
  try {
    const base = git(cwd, 'rev-parse', 'HEAD^');
    const manifest = { schemaVersion: 1, environment: 'production', project: 'temp-a1437', site: 'kahut1',
      revision: base, tree: git(cwd, 'rev-parse', 'HEAD^{tree}'),
      files: [{ path: '/index.html', sha256: crypto.createHash('sha256').update('x').digest('hex') }] };
    const observation = await observeHosting({ fetchImpl: async url => ({ ok: true, url,
      arrayBuffer: async () => Buffer.from(url.endsWith('luyentap-release.json') ? JSON.stringify(manifest) : 'x') }) });
    const result = await assess({ cwd, base, hostingObservation: observation, productionEnvFingerprint: 'env' });
    assert.equal(result.decision, STATUS.BLOCKED);
    assert(result.findings.some(finding => /base tree does not match/u.test(finding.message)));
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('bound compatibility review clears an application-release review', async () => { const cwd=await fixture(); const reviewPath=path.join(os.tmpdir(),"release-review-49fac8a6-079f-49bd-9513-d6db6c3c2d88.json" ); try { const base=git(cwd,'rev-parse','HEAD'); await writeFile(path.join(cwd,'src','App.jsx'),'export default 2;'); git(cwd,'add','.'); git(cwd,'commit','-qm','application-candidate'); const source=await collectSourceState(cwd,base); const tree=git(cwd,'rev-parse',`${base}^{tree}`); const contentHash=crypto.createHash('sha256').update('x').digest('hex'); const observation=await observeHosting({fetchImpl:async url => ({ok:true,url,arrayBuffer:async()=>Buffer.from(url.endsWith('luyentap-release.json') ? JSON.stringify({schemaVersion:1,environment:'production',project:'temp-a1437',site:'kahut1',revision:base,tree,files:[{path:'/index.html',sha256:contentHash}]}) : 'x')})}); await writeFile(reviewPath,JSON.stringify({schemaVersion:1,decision:'verified',reviewer:'fixture-reviewer',reviewedAt:new Date().toISOString(),sourceRevision:source.revision,baseRevision:source.baseRevision,observedFingerprint:observation.fingerprint,scope:['frontend-worker-contract']})); const result=await assess({cwd,base,hostingObservation:observation,compatibilityReviewPath:reviewPath,productionEnvFingerprint:'env'}); assert.equal(result.decision,STATUS.PASS); assert.equal(result.compatibilityReview.reviewer,'fixture-reviewer'); } finally { await rm(cwd,{recursive:true,force:true}); await rm(reviewPath,{force:true}); } });

test('unreconciled hotfix evidence is surfaced for a later release', async () => { const cwd=await fixture(); try { const baseline={hotfixes:[{id:'hf-1',paths:['src/production-fix.js'],reconciled:false}]}; await writeFile(path.join(cwd,'baseline.json'),JSON.stringify(baseline)); const result=await assess({cwd,base:'HEAD^',baselinePath:'baseline.json',productionEnvFingerprint:'env'}); assert.ok(result.findings.some(f=>/hotfix hf-1/i.test(f.message))); } finally { await rm(cwd,{recursive:true,force:true}); } });

test('deployed multi-commit hotfix detects loss of an earlier correction', async () => {
  const cwd = await fixture();
  try {
    const baseRevision = git(cwd, 'rev-parse', 'HEAD');
    await writeFile(path.join(cwd, 'public', 'index.html'), 'production correction');
    git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', 'first hotfix correction');
    await writeFile(path.join(cwd, 'public', 'second.txt'), 'second correction');
    git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', 'second hotfix correction');
    const revision = git(cwd, 'rev-parse', 'HEAD');
    const manifest = { schemaVersion: 1, environment: 'production', project: 'temp-a1437', site: 'kahut1', revision, tree: git(cwd, 'rev-parse', 'HEAD^{tree}'), files: [{path: '/index.html', sha256: crypto.createHash('sha256').update('x').digest('hex')}], hotfixes: [{revision, baseRevision}] };
    const observation = await observeHosting({fetchImpl: async url => ({ok: true, url, arrayBuffer: async () => Buffer.from(url.endsWith('luyentap-release.json') ? JSON.stringify(manifest) : 'x')})});
    await writeFile(path.join(cwd, 'public', 'next.txt'), 'deliberate next release');
    git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', 'retain both corrections');
    const retained = await assess({cwd, base: revision, hostingObservation: observation, productionEnvFingerprint: 'env'});
    assert.equal(retained.decision, STATUS.PASS);
    await writeFile(path.join(cwd, 'public', 'index.html'), 'y');
    git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', 'accidentally lose first correction');
    const lost = await assess({cwd, base: revision, hostingObservation: observation, productionEnvFingerprint: 'env'});
    assert.equal(lost.decision, STATUS.REVIEW_REQUIRED);
    assert.ok(lost.findings.some(f => /content differs.*public\/index.html/u.test(f.message)));
  } finally { await rm(cwd, {recursive: true, force: true}); }
});

test('a historical hotfix already superseded by verified live content needs no repeated review', async () => {
  const cwd = await fixture();
  try {
    const firstFix = git(cwd, 'rev-parse', 'HEAD'), firstBase = git(cwd, 'rev-parse', 'HEAD^');
    await writeFile(path.join(cwd, 'public/index.html'), 'published successor');
    git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', 'published successor');
    const base = git(cwd, 'rev-parse', 'HEAD');
    const manifest = { schemaVersion: 1, environment: 'production', project: 'temp-a1437', site: 'kahut1', revision: base,
      tree: git(cwd, 'rev-parse', 'HEAD^{tree}'), files: [{ path: '/index.html', sha256: crypto.createHash('sha256').update('published successor').digest('hex') }],
      hotfixes: [{ revision: firstFix, baseRevision: firstBase }] };
    const observation = await observeHosting({ fetchImpl: async url => ({ ok: true, url,
      arrayBuffer: async () => Buffer.from(url.endsWith('luyentap-release.json') ? JSON.stringify(manifest) : 'published successor') }) });
    await writeFile(path.join(cwd, 'public/next.txt'), 'routine next change');
    git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', 'next release preserves live successor');
    const result = await assess({ cwd, base, hostingObservation: observation, productionEnvFingerprint: 'env' });
    assert.equal(result.decision, STATUS.PASS);
    assert.deepEqual(result.hotfixComparison[0].preservedLivePaths, ['public/index.html']);
    assert.deepEqual(result.hotfixComparison[0].reviewRequiredPaths, []);
    const untrusted = await assess({ cwd, base, hostingObservation: JSON.parse(JSON.stringify(observation)), productionEnvFingerprint: 'env' });
    assert.equal(untrusted.decision, STATUS.BLOCKED);
    const wrongTree = await observeHosting({ fetchImpl: async url => ({ ok: true, url,
      arrayBuffer: async () => Buffer.from(url.endsWith('luyentap-release.json') ? JSON.stringify({ ...manifest, tree: 'f'.repeat(40) }) : 'published successor') }) });
    const wrongBaseline = await assess({ cwd, base, hostingObservation: wrongTree, productionEnvFingerprint: 'env' });
    assert.deepEqual(wrongBaseline.hotfixComparison[0].preservedLivePaths, []);
    assert(wrongBaseline.hotfixComparison[0].reviewRequiredPaths.includes('public/index.html'));
    await writeFile(path.join(cwd, 'public/index.html'), 'accidental regression');
    git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', 'lose current published correction');
    const regressed = await assess({ cwd, base, hostingObservation: observation, productionEnvFingerprint: 'env' });
    assert.equal(regressed.decision, STATUS.REVIEW_REQUIRED);
    assert(regressed.hotfixComparison[0].reviewRequiredPaths.includes('public/index.html'));
    await writeFile(path.join(cwd, 'public/index.html'), git(cwd, 'show', `${firstFix}:public/index.html`));
    git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', 'restore older hotfix but lose live successor');
    const oldFix = await assess({ cwd, base, hostingObservation: observation, productionEnvFingerprint: 'env' });
    assert.equal(oldFix.decision, STATUS.REVIEW_REQUIRED);
    assert.deepEqual(oldFix.hotfixComparison[0].reviewRequiredPaths, ['public/index.html']);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('hotfix successor review binds the exact differing paths and preserves every obligation', async t => {
  const cwd = await fixture();
  const reviewDirectory = await mkdtemp(path.join(os.tmpdir(), 'hotfix-review-'));
  const reviewPath = path.join(reviewDirectory, 'review.json');
  try {
    const originalBase = git(cwd, 'rev-parse', 'HEAD^');
    const earlierHotfix = git(cwd, 'rev-parse', 'HEAD');
    const paths = ['src/App.jsx', 'src/Badge.jsx'];
    for (const file of paths) await writeFile(path.join(cwd, file), 'published correction');
    git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', 'published hotfix');
    const base = git(cwd, 'rev-parse', 'HEAD');
    const hotfixes = [{ revision: earlierHotfix, baseRevision: originalBase }, { revision: base, baseRevision: earlierHotfix }];
    const manifest = { schemaVersion: 1, environment: 'production', project: 'temp-a1437', site: 'kahut1', revision: base,
      tree: git(cwd, 'rev-parse', 'HEAD^{tree}'), files: [{ path: '/index.html', sha256: crypto.createHash('sha256').update('x').digest('hex') }], hotfixes };
    const observation = await observeHosting({ fetchImpl: async url => ({ ok: true, url,
      arrayBuffer: async () => Buffer.from(url.endsWith('luyentap-release.json') ? JSON.stringify(manifest) : 'x') }) });
    for (const file of paths) await writeFile(path.join(cwd, file), 'reviewed successor');
    git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', 'deliberate successor');
    const review = { schemaVersion: 1, decision: 'verified', reviewer: 'independent reviewer', reviewedAt: new Date().toISOString(),
      sourceRevision: git(cwd, 'rev-parse', 'HEAD'), baseRevision: base, observedFingerprint: observation.fingerprint,
      scope: ['runtime presentation'], hotfixReconciliations: [{ revision: base, paths, rationale: 'Preserves the correction while removing the repeated badge.' }] };
    const assessReview = async value => {
      await writeFile(reviewPath, JSON.stringify(value));
      return assess({ cwd, base, mode: 'hotfix', hostingObservation: observation, compatibilityReviewPath: reviewPath, productionEnvFingerprint: 'env' });
    };
    const accepted = await assessReview(review);
    assert.equal(accepted.decision, STATUS.PASS);
    assert.deepEqual(accepted.hotfixes.slice(0, 2), hotfixes);
    assert.equal(accepted.hotfixes[2].revision, review.sourceRevision);
    assert.deepEqual(accepted.compatibilityReview.hotfixReconciliations, review.hotfixReconciliations);
    for (const [name, mutate] of [
      ['generic compatibility only', value => { delete value.hotfixReconciliations; }],
      ['unknown revision', value => { value.hotfixReconciliations[0].revision = originalBase; }],
      ['extra revision', value => { value.hotfixReconciliations.push({ ...value.hotfixReconciliations[0], revision: originalBase }); }],
      ['duplicate revision', value => { value.hotfixReconciliations.push(value.hotfixReconciliations[0]); }],
      ['missing path', value => { value.hotfixReconciliations[0].paths.pop(); }],
      ['extra path', value => { value.hotfixReconciliations[0].paths.push('public/index.html'); }],
      ['unsorted paths', value => { value.hotfixReconciliations[0].paths.reverse(); }],
      ['empty rationale', value => { value.hotfixReconciliations[0].rationale = ' '; }],
      ['malformed entry', value => { value.hotfixReconciliations = [null]; }],
      ['malformed array', value => { value.hotfixReconciliations = {}; }],
      ['different source', value => { value.sourceRevision = base; }],
      ['different base', value => { value.baseRevision = originalBase; }],
      ['different live fingerprint', value => { value.observedFingerprint = 'changed'; }],
      ['stale review', value => { value.reviewedAt = '2000-01-01T00:00:00Z'; }],
      ['future review', value => { value.reviewedAt = '2100-01-01T00:00:00Z'; }],
    ]) await t.test(name, async () => {
      const changed = structuredClone(review);
      mutate(changed);
      assert.equal((await assessReview(changed)).decision, STATUS.REVIEW_REQUIRED);
    });
    await writeFile(path.join(cwd, 'public', 'index.html'), 'lost earlier hotfix');
    git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', 'unreviewed regression in another hotfix');
    const extraDrift = { ...review, sourceRevision: git(cwd, 'rev-parse', 'HEAD') };
    assert.equal((await assessReview(extraDrift)).decision, STATUS.REVIEW_REQUIRED);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(reviewDirectory, { recursive: true, force: true });
  }
});

test('receipts cannot overwrite tracked or outside files', async () => { const cwd=await fixture(); try { assert.equal(await main(['--base','HEAD^','--receipt','src/App.jsx'],cwd),1); assert.equal(await main(['--base','HEAD^','--receipt','outside.json'],cwd),1); } finally { await rm(cwd,{recursive:true,force:true}); } });

test('receipt generation succeeds only in the generated receipt directory', async () => { const cwd=await fixture(); try { const exit = await main(['--base','HEAD^','--receipt','tmp/release-receipts/assessment.json'],cwd); assert.equal(exit,2); await access(path.join(cwd,'tmp','release-receipts','assessment.json')); } finally { await rm(cwd,{recursive:true,force:true}); } });

test('receipt generation never overwrites an existing generated file', async () => { const cwd=await fixture(); try { const target=path.join(cwd,'tmp','release-receipts','assessment.json'); await mkdir(path.dirname(target),{recursive:true}); await writeFile(target,'keep'); assert.equal(await main(['--base','HEAD^','--receipt','tmp/release-receipts/assessment.json'],cwd),1); assert.equal(await readFile(target,'utf8'),'keep'); } finally { await rm(cwd,{recursive:true,force:true}); } });

test('hotfix preparation isolates verified source from dirty development files', async () => { const cwd=await fixture(); const destination = await mkdtemp(path.join(os.tmpdir(),'hotfix-destination-')); await rm(destination,{recursive:true,force:true}); try { await writeFile(path.join(cwd,'unfinished.txt'),'development-only'); const source = git(cwd,'rev-parse','HEAD^'); const tree = git(cwd,'rev-parse',`${source}^{tree}`); const contentHash=crypto.createHash('sha256').update('x').digest('hex'); const observation = await observeHosting({fetchImpl:async url => { if (url.endsWith('luyentap-release.json')) return {ok:true,url, arrayBuffer:async()=>Buffer.from(JSON.stringify({schemaVersion:1,environment:'production',project:'temp-a1437',site:'kahut1',revision:source,tree,files:[{path:'/index.html',sha256:contentHash}]}))}; return {ok:true,url,arrayBuffer:async()=>Buffer.from('x')}; }}); const result = await prepareHotfix({cwd,source,destination,hostingObservation:observation}); assert.equal(result.isolated,true); await access(path.join(destination,'src','App.jsx')); await assert.rejects(() => access(path.join(destination,'unfinished.txt'))); } finally { try { if (await access(destination).then(()=>true).catch(()=>false)) spawnSync('git',['worktree','remove','--force',destination],{cwd,encoding:'utf8',windowsHide:true}); } finally { await rm(cwd,{recursive:true,force:true}); await rm(destination,{recursive:true,force:true}); } } });

test('verified frontend hotfix returns a reconciliation obligation', async () => { const cwd=await fixture(); const destination=path.join(os.tmpdir(),`hotfix-positive-${crypto.randomUUID()}`); const reviewPath=path.join(os.tmpdir(),`hotfix-review-${crypto.randomUUID()}.json`); try { const source=git(cwd,'rev-parse','HEAD^'); const tree=git(cwd,'rev-parse',`${source}^{tree}`); const contentHash=crypto.createHash('sha256').update('x').digest('hex'); const observation=await observeHosting({fetchImpl:async url=>({ok:true,url,arrayBuffer:async()=>Buffer.from(url.endsWith('luyentap-release.json')?JSON.stringify({schemaVersion:1,environment:'production',project:'temp-a1437',site:'kahut1',revision:source,tree,files:[{path:'/index.html',sha256:contentHash}]}):'x')})}); await prepareHotfix({cwd,source,destination,hostingObservation:observation}); await writeFile(path.join(destination,'src','App.jsx'),'export default 2;'); git(destination,'add','.'); git(destination,'-c','user.email=test@example.invalid','-c','user.name=Release Test','commit','-qm','hotfix'); const candidate=await collectSourceState(destination,source); await writeFile(reviewPath,JSON.stringify({schemaVersion:1,decision:'verified',reviewer:'fixture-reviewer',reviewedAt:new Date().toISOString(),sourceRevision:candidate.revision,baseRevision:candidate.baseRevision,observedFingerprint:observation.fingerprint,scope:['frontend-worker-contract']})); const result=await assess({cwd:destination,mode:'hotfix',base:source,hostingObservation:observation,productionEnvFingerprint:'env',compatibilityReviewPath:reviewPath}); assert.equal(result.decision,STATUS.PASS); assert.equal(result.hotfixes.length,1); assert.equal(result.hotfixes[0].baseRevision,source); } finally { spawnSync('git',['worktree','remove','--force',destination],{cwd,encoding:'utf8',windowsHide:true}); await rm(cwd,{recursive:true,force:true}); await rm(reviewPath,{force:true}); } });
