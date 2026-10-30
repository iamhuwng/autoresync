import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { beginRelease, listReleases, readDraft, readRelease, resolveStoreDir, saveDraft, selectDescription, settleRelease } from '../lib/releaseChangelog.mjs';

const digest = letter => letter.repeat(64);
const hosting = { id: 'hosting:kahut1', binding: { sourceRevision: 'a'.repeat(40), sourceFingerprint: digest('b'), configSha256: digest('c') } };
const worker = { id: 'worker:homework', binding: { artifactSha256: digest('d'), configSha256: digest('e') } };
const releaseTarget = target => ({ ...target, operation: 'deploy' });
const outcome = (target, publication = 'published', verification = 'passed') => ({ id: target.id, publication, verification, ...(publication === 'published' ? { providerIdentity: `${target.id}/version-1`, evidenceRefs: ['tmp/release-receipts/provider-result.json'] } : {}) });
const fixture = t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'release-recorder-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
};

test('manual selection is scoped to explicit target IDs and content, independently of source revision', t => {
  const store = fixture(t);
  const draft = saveDraft({ description: 'Keep the exact manual attempt', targets: [hosting, worker] }, store);
  const committedHosting = { ...hosting, binding: { ...hosting.binding, sourceRevision: 'f'.repeat(40) } };
  const selected = selectDescription({ description: 'Generated fallback', targets: [committedHosting] }, store);
  assert.deepEqual([selected.description, selected.pendingId, selected.matching], [draft.description, draft.id, true]);
  const stale = selectDescription({ description: 'Generated fallback', targets: [{ ...hosting, binding: { ...hosting.binding, sourceFingerprint: digest('f') } }] }, store);
  assert.equal(stale.matching, false);
  assert.match(stale.reason, /stale/u);
  const unrelated = { id: 'firebase:indexes', binding: { configSha256: digest('a') } };
  assert.match(selectDescription({ description: 'Indexes', targets: [unrelated] }, store).reason, /unrelated/u);
  assert.equal(selectDescription({ description: 'Mixed', targets: [hosting, unrelated] }, store).matching, false);
  assert.equal(readDraft(store).id, draft.id);
});

test('intent is persisted before outcomes, and partial publication never infers missing targets', t => {
  const store = fixture(t);
  const draft = saveDraft({ description: 'Release both surfaces', targets: [hosting, worker] }, store);
  const release = beginRelease({ id: 'combined-release', description: draft.description, targets: [releaseTarget(hosting), releaseTarget(worker)] }, store);
  assert.deepEqual(readRelease(release.id, store), release);
  assert.ok(release.targets.every(target => target.publication === 'unconfirmed' && target.verification === 'unverified'));
  const partial = settleRelease(release.id, { outcomes: [outcome(hosting)] }, store);
  assert.equal(partial.status, 'not-live');
  assert.equal(partial.targets.find(target => target.id === worker.id).publication, 'unconfirmed');
  assert.equal(readDraft(store).id, draft.id);
  const completed = settleRelease(release.id, { outcomes: [outcome(worker, 'published', 'failed')] }, store);
  assert.equal(completed.status, 'live');
  assert.equal(completed.targets.find(target => target.id === worker.id).verification, 'failed');
  assert.equal(readDraft(store), null);
});

test('subset releases promote only their confirmed scope until the entire draft is published', t => {
  const store = fixture(t);
  const draft = saveDraft({ description: 'Shared rollout', targets: [hosting, worker] }, store);
  const first = beginRelease({ description: draft.description, targets: [releaseTarget(hosting)] }, store);
  assert.equal(settleRelease(first.id, { outcomes: [outcome(hosting)] }, store).status, 'live');
  assert.equal(readDraft(store).id, draft.id);
  const second = beginRelease({ description: draft.description, targets: [releaseTarget(worker)] }, store);
  settleRelease(second.id, { outcomes: [outcome(worker)] }, store);
  assert.equal(readDraft(store), null);
  assert.equal(listReleases(store).length, 2);
});

test('newer, unrelated and noncomparable drafts survive publication', t => {
  const store = fixture(t);
  const original = saveDraft({ description: 'Original attempt', targets: [hosting] }, store);
  const release = beginRelease({ description: original.description, targets: [releaseTarget(hosting)] }, store);
  const newer = saveDraft({ description: 'New attempt saved during publication', targets: [hosting] }, store);
  settleRelease(release.id, { outcomes: [outcome(hosting)] }, store);
  assert.equal(readDraft(store).id, newer.id);
  const unrelated = beginRelease({ description: 'Separate worker', targets: [releaseTarget(worker)] }, store);
  settleRelease(unrelated.id, { outcomes: [outcome(worker)] }, store);
  assert.equal(readDraft(store).id, newer.id);
  const staleHosting = { ...hosting, binding: { sourceFingerprint: digest('e') } };
  const stale = beginRelease({ description: 'Changed source', targets: [releaseTarget(staleHosting)] }, store);
  settleRelease(stale.id, { outcomes: [outcome(staleHosting)] }, store);
  assert.equal(readDraft(store).id, newer.id);
});

test('revised source replaces a stale draft only after all intended target scopes are confirmed published', t => {
  const store = fixture(t);
  const draft = saveDraft({ description: 'Earlier attempt', targets: [hosting, worker] }, store);
  const revisedHosting = { ...hosting, binding: { ...hosting.binding, sourceFingerprint: digest('f') } };
  const revisedWorker = { ...worker, binding: { ...worker.binding, artifactSha256: digest('a') } };
  const selected = selectDescription({ description: 'Revised source release', targets: [revisedHosting] }, store);
  assert.equal(selected.matching, false);
  assert.equal(selected.description, 'Revised source release');
  const first = beginRelease({ description: selected.description, targets: [releaseTarget(revisedHosting)] }, store);
  assert.equal(first.pendingId, null);
  assert.equal(first.supersedesPendingId, draft.id);
  settleRelease(first.id, { outcomes: [outcome(revisedHosting, 'unconfirmed')] }, store);
  assert.equal(readDraft(store).id, draft.id);
  settleRelease(first.id, { outcomes: [outcome(revisedHosting)] }, store);
  assert.equal(readDraft(store).id, draft.id);
  const configOnly = { id: worker.id, binding: { configSha256: digest('b') } };
  const configuration = beginRelease({ description: 'Separate configuration operation', targets: [{ ...configOnly, operation: 'configuration' }] }, store);
  assert.equal(configuration.supersedesPendingId, null);
  settleRelease(configuration.id, { outcomes: [outcome(configOnly)] }, store);
  assert.equal(readDraft(store).id, draft.id);
  const second = beginRelease({ description: 'Revised Worker release', targets: [releaseTarget(revisedWorker)] }, store);
  settleRelease(second.id, { outcomes: [outcome(revisedWorker)] }, store);
  assert.equal(readDraft(store), null);
});

test('unconfirmed publication and rejected publication stay distinct from runtime verification', t => {
  const store = fixture(t);
  const release = beginRelease({ description: 'Attempt deployment', targets: [releaseTarget(hosting)] }, store);
  const uncertain = settleRelease(release.id, { outcomes: [outcome(hosting, 'unconfirmed', 'passed')], evidenceRefs: ['tmp/release-receipts/assessment-PASS.json'] }, store);
  assert.equal(uncertain.status, 'not-live');
  assert.equal(uncertain.targets[0].publication, 'unconfirmed');
  const failed = settleRelease(release.id, { outcomes: [outcome(hosting, 'not-published', 'failed')] }, store);
  assert.equal(failed.status, 'not-live');
  assert.equal(failed.targets[0].publication, 'not-published');
  const published = settleRelease(release.id, { outcomes: [outcome(hosting, 'published', 'unverified')] }, store);
  assert.equal(published.status, 'live');
  assert.equal(published.targets[0].verification, 'unverified');
  assert.throws(() => settleRelease(release.id, { outcomes: [outcome(hosting, 'unconfirmed')] }, store), /cannot be erased/u);
});

test('exact annotations and duplicate intent/receipts are preserved without duplicate writes', t => {
  const store = fixture(t);
  const annotation = '  Operator annotation\nKeep every character.  ';
  const input = { id: 'idempotent-release', description: 'Deploy reviewed artifact', targets: [{ ...releaseTarget(hosting), annotation }] };
  const release = beginRelease(input, store);
  assert.equal(release.targets[0].annotation, annotation);
  assert.equal(beginRelease(input, store).id, release.id);
  const receipt = { outcomes: [outcome(hosting)] };
  settleRelease(release.id, receipt, store);
  const saved = readFileSync(path.join(store, 'state.json'), 'utf8');
  settleRelease(release.id, receipt, store);
  beginRelease(input, store);
  assert.equal(readFileSync(path.join(store, 'state.json'), 'utf8'), saved);
  assert.equal(listReleases(store).length, 1);
  assert.throws(() => beginRelease({ ...input, description: 'Another operation' }, store), /different intent/u);
  assert.throws(() => settleRelease(release.id, { outcomes: [{ ...outcome(hosting), providerIdentity: 'different-version' }] }, store), /cannot be erased or reassigned/u);
});

test('replaying an older receipt cannot overwrite newer verification or evidence', t => {
  const store = fixture(t);
  const release = beginRelease({ description: 'Recheck the same versions', targets: [releaseTarget(hosting), releaseTarget(worker)] }, store);
  const receipt = {
    outcomes: [hosting, worker].map(target => ({ ...outcome(target), evidenceRefs: ['fixture://first-b', 'fixture://first-a'] })),
    evidenceRefs: ['fixture://receipt-b', 'fixture://receipt-a'],
  };
  settleRelease(release.id, receipt, store);
  const newer = settleRelease(release.id, { outcomes: [hosting, worker].map(target => ({
    ...outcome(target, 'published', 'failed'), evidenceRefs: ['fixture://newer-verification'],
  })) }, store);
  const saved = readFileSync(path.join(store, 'state.json'), 'utf8');
  assert.deepEqual(settleRelease(release.id, receipt, store), newer);
  const reordered = {
    evidenceRefs: [...receipt.evidenceRefs].reverse(),
    outcomes: [...receipt.outcomes].reverse().map(target => ({
      evidenceRefs: [...target.evidenceRefs].reverse(), providerIdentity: target.providerIdentity,
      verification: target.verification, publication: target.publication, id: target.id,
    })),
  };
  assert.deepEqual(settleRelease(release.id, reordered, store), newer);
  assert.equal(readFileSync(path.join(store, 'state.json'), 'utf8'), saved);
});

test('historical records without receipt hashes remain intact and saved hashes are strictly validated', t => {
  const store = fixture(t);
  const release = beginRelease({ description: 'Historical release', targets: [releaseTarget(hosting)] }, store);
  settleRelease(release.id, { outcomes: [outcome(hosting)] }, store);
  const stateFile = path.join(store, 'state.json');
  const legacy = JSON.parse(readFileSync(stateFile, 'utf8'));
  delete legacy.releases[release.id].appliedReceiptHashes;
  writeFileSync(stateFile, JSON.stringify(legacy));
  saveDraft({ description: 'Independent draft', targets: [worker] }, store);
  assert.deepEqual(readRelease(release.id, store), legacy.releases[release.id]);
  const updated = settleRelease(release.id, { outcomes: [outcome(hosting, 'published', 'failed')] }, store);
  assert.equal(updated.targets[0].verification, 'failed');
  assert.equal(updated.appliedReceiptHashes.length, 1);
  for (const hashes of [null, digest('a'), [1], [digest('A')], [digest('a'), digest('a')]]) {
    const invalid = { ...legacy, releases: { [release.id]: { ...legacy.releases[release.id], appliedReceiptHashes: hashes } } };
    writeFileSync(stateFile, JSON.stringify(invalid));
    assert.throws(() => readRelease(release.id, store), /applied receipt hashes are malformed/u);
  }
});

test('a retrospective record requires historical references and explicit publication, without fresh verification', t => {
  const store = fixture(t);
  const draft = saveDraft({ description: 'Current attempt', targets: [hosting] }, store);
  const input = { description: 'Historical publication', targets: [releaseTarget(hosting)], retrospective: true };
  assert.throws(() => beginRelease(input, store), /historical evidence/u);
  const release = beginRelease({ ...input, evidenceRefs: ['documentation/release-audits/historical-release.md'] }, store);
  assert.equal(release.origin, 'retrospective');
  assert.equal(release.status, 'not-live');
  const historical = settleRelease(release.id, { outcomes: [outcome(hosting, 'published', 'unverified')] }, store);
  assert.equal(historical.status, 'live');
  assert.equal(historical.targets[0].verification, 'unverified');
  assert.equal(readDraft(store).id, draft.id);
});

test('strict metadata rejects unknown operations, raw receipts, secret fields and corrupt store replacement', t => {
  const store = fixture(t);
  const input = { description: 'Description', targets: [releaseTarget(hosting)] };
  assert.throws(() => beginRelease({ ...input, secretValue: 'do-not-store' }, store), /unknown/u);
  assert.throws(() => beginRelease({ ...input, targets: [{ ...releaseTarget(hosting), operation: 'arbitrary-command' }] }, store), /unsupported operation/u);
  assert.throws(() => saveDraft({ description: 'Description', targets: [{ ...hosting, binding: { sourceFingerprint: digest('a'), apiKey: 'do-not-store' } }] }, store), /unknown binding field/u);
  assert.throws(() => beginRelease({ ...input, evidenceRefs: ['{"raw":"receipt"}'] }, store), /not raw receipts/u);
  const release = beginRelease(input, store);
  assert.throws(() => settleRelease(release.id, { outcomes: [{ id: hosting.id, publication: 'published', verification: 'passed' }] }, store), /provider identity and evidence/u);
  assert.throws(() => settleRelease(release.id, { outcomes: [{ ...outcome(hosting), receipt: { token: 'do-not-store' } }] }, store), /unknown outcome/u);
  assert.throws(() => settleRelease(release.id, { outcomes: [outcome(hosting)], appliedReceiptHashes: [digest('a')] }, store), /unknown settlement input/u);
  assert.throws(() => settleRelease(release.id, { outcomes: [outcome(worker)] }, store), /not in the recorded intent/u);
  writeFileSync(path.join(store, 'state.json'), '{broken');
  assert.throws(() => saveDraft({ description: 'Cannot overwrite', targets: [hosting] }, store));
  assert.equal(readFileSync(path.join(store, 'state.json'), 'utf8'), '{broken');
});

test('the application store is reused from independent source checkouts and by concurrent writers', async t => {
  const root = fixture(t);
  const store = path.join(root, 'application-store');
  const firstCheckout = path.join(root, 'checkout-one');
  const secondCheckout = path.join(root, 'checkout-two');
  mkdirSync(firstCheckout);
  mkdirSync(secondCheckout);
  const moduleUrl = new URL('../lib/releaseChangelog.mjs', import.meta.url).href;
  const env = { ...process.env, LUYENTAP_CHANGELOG_DIR: store };
  const saveScript = `import {saveDraft} from ${JSON.stringify(moduleUrl)}; saveDraft(${JSON.stringify({ description: 'Cross-checkout draft', targets: [hosting] })});`;
  execFileSync(process.execPath, ['--input-type=module', '-e', saveScript], { cwd: firstCheckout, env, windowsHide: true });
  const readScript = `import {readDraft,resolveStoreDir} from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify({store:resolveStoreDir(),draft:readDraft()}));`;
  const observed = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', readScript], { cwd: secondCheckout, env, encoding: 'utf8', windowsHide: true }));
  assert.equal(observed.store, store);
  assert.equal(observed.draft.description, 'Cross-checkout draft');
  await Promise.all([firstCheckout, secondCheckout].map((cwd, index) => new Promise((resolve, reject) => {
    const input = { id: `concurrent-${index}`, description: 'Concurrent independent release', targets: [releaseTarget(worker)] };
    const script = `import {beginRelease} from ${JSON.stringify(moduleUrl)}; beginRelease(${JSON.stringify(input)});`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], { cwd, env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(stderr)));
  })));
  assert.equal(listReleases(store).length, 2);
  assert.equal(readDraft(store).id, observed.draft.id);
  assert.match(resolveStoreDir(), /(?:temp-a1437|changelog)/u);
});

test('concurrent execution claims allow exactly one owner while ordinary intent reads remain idempotent', async t => {
  const store = fixture(t);
  const input = { id: 'one-execution', description: 'Claim one provider mutation', targets: [releaseTarget(worker)] };
  const moduleUrl = new URL('../lib/releaseChangelog.mjs', import.meta.url).href;
  const script = `import {beginRelease} from ${JSON.stringify(moduleUrl)};
    try { beginRelease(${JSON.stringify(input)}, ${JSON.stringify(store)}, {requireNew:true}); console.log('claimed'); }
    catch (error) { console.log(error.message); }`;
  const claims = await Promise.all([0, 1].map(() => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr)));
  })));
  assert.equal(claims.filter(value => value === 'claimed').length, 1);
  assert.equal(claims.filter(value => value.includes('already recorded')).length, 1);
  assert.equal(listReleases(store).length, 1);
  assert.deepEqual(beginRelease(input, store), readRelease(input.id, store));
});
