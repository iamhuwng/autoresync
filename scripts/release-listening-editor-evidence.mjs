import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { canonical, workerInvariants, readListeningProvider } from './release-listening-evidence.mjs';
import { reviewedListeningProbeRelease } from './release-listening-probe-pins.mjs';
import { reviewedListeningFunctionalRelease } from './release-listening-functional-pins.mjs';
import { reviewedListeningPrivateRelease } from './release-listening-private-pins.mjs';
import { reviewedListeningPreviewRelease } from './release-listening-preview-pins.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const digest = value => hash(canonical(value));
const observations = new WeakSet();
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

// Fixed independently reviewed editor release; historical audio-release pins are unchanged.
export const reviewedListeningEditorRelease = freeze({
  "revision": "5090b7ef1e02562c4f0d873d2172a594df4ab29f",
  "tree": "8b30b3ce703e89aa30a28d64da487494d798e38b",
  "baseRevision": "03089c913ecd81201759181328f991a78bea21d3",
  "filesSha256": "c77b8bde149460c44702d820106ff6dc7aeeba13654789fc970e5ebb88010f92",
  "bundleSha256": "a87f00b21c94642104f47cadf8e9ecf34996da751b767c1e547a7c2272d10f88",
  "configSha256": "39dd362796e79689f0afe1516cc0203b938b9f76cc964ac937d724e46bdeec5a",
  "sourceConfigSha256": "fcac57397e7b6ee7604d1e1cffb56a7176cdc1556a71483ad115898c941540ec",
  "envSha256": "8ec86efb1aa5967b5aa05d1a901bf7bd99244c3d34fafc0998bd3be113a8ea57",
  "rulesSha256": "0310f19cc07a8970ce2b12672e60fe6389acaf255910319a4286058e39fbdbc3",
  "commonSha256": "5b7c5cc18708132a4f54e450349c3c1a0bca2f48f4747a22f0de6109e39c9588",
  "unchangedWorkers": {
    "r2-backup-worker": {
      "versionId": "e9cac4c7-430a-4398-ba1f-72034c0fd45e",
      "modules": [
        {
          "name": "index.js",
          "sha256": "64e0e529f924805ec7983986206b51775ed5710837a370bfb45ae1f78206aec1"
        }
      ],
      "invariantSha256": "c984cf3a91e222ad339732c343bfb896846eef13d75cb66fe55afd6760b5d708"
    },
    "luyentap-notification-command": {
      "versionId": "a184d75b-8823-485a-885d-e23354646f45",
      "modules": [
        {
          "name": "notification-command-active.mjs",
          "sha256": "9734197c765b06de9d746e68fea9a4912780447e05ddb12057e1ac3c6e2f9ed7"
        },
        {
          "name": "notification-command-entry.js",
          "sha256": "72a358e0f7313fd37e89f7bf1d85cd1337c199192dc6c297881bf1b71258d270"
        }
      ],
      "invariantSha256": "2607c64ddaafc5bb3ddcea24223b52e73bd3763271bfa10f469893c97e43a87e"
    },
    "luyentap-notification-firestore-qa": {
      "versionId": "5696e963-c5ed-463d-a495-30db3c07bc98",
      "modules": [
        {
          "name": "notification-firestore-do.js",
          "sha256": "fa9ba9fe7df75fb940aeec73372d214a0ceab8fdc363b2f909fdaba9a4c7a7cf"
        }
      ],
      "invariantSha256": "f8258abd467010f11cb559ca6987b7b2837c1854983a40b8d68203ac24a98355"
    }
  },
  "upload": {
    "versionId": "674bf4a5-bcd1-4a91-b505-f05214182df5",
    "modules": [
      {
        "name": "worker.js",
        "sha256": "21a423c4bf42320ed5411e493e1ef8c24bf7ccea4d0ee4da40f310f583d6fd3b"
      }
    ],
    "invariantSha256": "0d6807ba1a9ecff8ff79d9a17aa773a9c57f94388ae6767a8ac9f571b7d087b0"
  }
});

export const isListeningEditorObserved = value => observations.has(value);

// Native observation chooses only reviewed profiles, from Git HEAD, never options.
export function selectListeningReleaseProfile(revision) {
  assert.match(revision ?? '', /^[a-f0-9]{40}$/, 'Listening candidate revision is invalid');
  if (revision === reviewedListeningEditorRelease.revision) {
    return { name: 'editor-capability', scope: 'upload-worker-and-hosting', pins: reviewedListeningEditorRelease };
  }
  if (revision === reviewedListeningProbeRelease.revision) {
    return { name: 'probe-hotfix', scope: 'upload-worker-only', pins: reviewedListeningProbeRelease };
  }
  if (revision === reviewedListeningFunctionalRelease.revision) {
    return { name: 'functional-completion', scope: 'upload-worker-rules-and-hosting', pins: reviewedListeningFunctionalRelease };
  }
  if (revision === reviewedListeningPrivateRelease.revision) {
    return { name: 'private-audio', scope: 'upload-worker-rules-and-hosting', pins: reviewedListeningPrivateRelease };
  }
  if (revision === reviewedListeningPreviewRelease.revision) {
    return { name: 'private-upload-preview', scope: 'upload-worker-only', pins: reviewedListeningPreviewRelease };
  }
  throw new Error('Listening candidate has no reviewed fixed profile');
}

export const listeningEditorHostingReady = observation =>
  (observation?.profile === 'editor-capability' && observation.scope === 'upload-worker-and-hosting' && observation.phase === 'postupload') ||
  (['functional-completion', 'private-audio'].includes(observation?.profile) && observation.scope === 'upload-worker-rules-and-hosting' && observation.phase === 'postrules');

export function assertListeningEditorSource(source, pins = reviewedListeningEditorRelease) {
  for (const field of ['revision', 'tree', 'baseRevision']) {
    assert.match(pins[field] ?? '', /^[a-f0-9]{40}$/, `Editor ${field} is not reviewed`);
    assert.equal(source[field], pins[field], `Editor ${field} changed`);
  }
  assert.equal(source.dirty, false, 'Editor candidate is dirty');
  assert.equal(digest(source.files), pins.filesSha256, 'Editor changed-file scope changed');
}

export function assertListeningPrivateLocalBindingChange(before, after) {
  const oldBuckets = '"r2_buckets": [{ "binding": "R2_BUCKET", "bucket_name": "local-book-covers" }],';
  const newBuckets = '"r2_buckets": [{ "binding": "R2_BUCKET", "bucket_name": "local-book-covers" }, { "binding": "LISTENING_AUDIO_BUCKET", "bucket_name": "local-listening-audio-private" }],';
  const prior = before.replace(/\r\n/g, '\n'), current = after.replace(/\r\n/g, '\n');
  assert.equal(prior.split(oldBuckets).length, 2, 'Editor prior local bucket binding is not exact');
  assert.equal(current.split(newBuckets).length, 2, 'Editor private local bucket binding is not exact');
  assert.equal(current.replace(newBuckets, oldBuckets), prior, 'Editor local Worker changed outside the private Listening binding');
}

export function validateListeningEditorEvidence(local, provider, phase, pins = reviewedListeningEditorRelease) {
  assertListeningEditorSource(local.source, pins);
  const changesRules = Object.hasOwn(pins, 'priorFirestoreRulesSha256');
  const observesFirestore = Object.hasOwn(pins, 'firestoreRulesSha256');
  assert((changesRules ? ['predeploy', 'postupload', 'postrules'] : ['predeploy', 'postupload']).includes(phase), 'Editor phase is invalid');
  for (const key of ['bundleSha256', 'configSha256', 'sourceConfigSha256', 'envSha256', 'rulesSha256', ...(observesFirestore ? ['firestoreRulesSha256'] : [])]) {
    assert.match(pins[key] ?? '', /^[a-f0-9]{64}$/, `Editor ${key} is not reviewed`);
    assert.equal(local[key], pins[key], `Editor ${key} changed`);
  }
  if (changesRules) {
    for (const key of ['priorRulesSha256', 'priorFirestoreRulesSha256']) assert.match(pins[key] ?? '', /^[a-f0-9]{64}$/, `Editor ${key} is not reviewed`);
  }
  if (observesFirestore) assert.equal(provider.firestoreRules?.sourceSha256, changesRules && phase !== 'postrules' ? pins.priorFirestoreRulesSha256 : pins.firestoreRulesSha256, 'Editor live Firestore rules changed');
  if (pins.privateAudio) {
    assert.equal(pins.privateAudio.bucketName, 'luyentap-listening-audio-private', 'Editor private audio bucket is not reviewed');
    assert.match(pins.privateAudio.lifecycleSha256 ?? '', /^[a-f0-9]{64}$/, 'Editor private audio lifecycle is not reviewed');
    assert.equal(local.lifecycleSha256, pins.privateAudio.lifecycleSha256, 'Editor private audio lifecycle source changed');
    const bucket = provider.privateAudioBucket;
    assert.equal(bucket?.bucketName, pins.privateAudio.bucketName, 'Editor private audio bucket changed');
    assert.equal(bucket.managedDomain?.enabled, false, 'Editor private audio r2.dev access is enabled or unavailable');
    assert.deepEqual(bucket.customDomains?.domains, [], 'Editor private audio custom domains changed');
    assert.equal(digest(bucket.lifecycle), pins.privateAudio.lifecycleSha256, 'Editor private audio lifecycle changed');
    if (changesRules) {
      assert.equal(local.localListeningBindingOnly, true, 'Editor local Listening binding correction is not verified');
      assert.match(pins.postUploadInvariantSha256 ?? '', /^[a-f0-9]{64}$/, 'Editor deployed Upload configuration is not reviewed');
      assert.notEqual(pins.postUploadInvariantSha256, pins.upload.invariantSha256, 'Editor private audio binding transition is missing');
    }
  }
  assert.equal(provider.rulesSha256, changesRules && phase !== 'postrules' ? pins.priorRulesSha256 : pins.rulesSha256, 'Editor live rules changed');
  assert.equal(digest(provider.common), pins.commonSha256, 'Editor routes or account changed');
  assert.equal(provider.writesEnabled, true, 'Editor authoring writes are disabled');
  assert(provider.restore === null || provider.restore === false || provider.restore?.active === false, 'Editor restore state is active or ambiguous');
  assert.deepEqual(provider.functions, [], 'Editor release excludes Firebase Functions');
  assert.equal(local.submitEndpoint, 'https://r2-backup-worker.iamhuwng.workers.dev/api/reading-v2/submit', 'Editor submit endpoint changed');
  assert.deepEqual(Object.keys(provider.workers).sort(), ['r2-upload-signer', ...Object.keys(pins.unchangedWorkers)].sort(), 'Editor service inventory changed');
  for (const [name, expected] of Object.entries({ 'r2-upload-signer': pins.upload, ...pins.unchangedWorkers })) {
    assert(expected?.versionId && expected.modules && expected.invariantSha256, `Editor ${name} is not reviewed`);
    const worker = provider.workers[name];
    const invariantSha256 = name === 'r2-upload-signer' && phase !== 'predeploy' && pins.privateAudio && changesRules
      ? pins.postUploadInvariantSha256 : expected.invariantSha256;
    assert.equal(digest(workerInvariants(worker)), invariantSha256, `Editor ${name} configuration changed`);
    assert.deepEqual(worker.deployment, worker.deploymentAfter, `Editor ${name} changed during observation`);
    assert.deepEqual(worker.deployment.versions, [{ version_id: worker.versionId, percentage: 100 }], `Editor ${name} traffic is split`);
    if (name === 'r2-upload-signer' && phase !== 'predeploy') {
      assert.notEqual(worker.versionId, expected.versionId, 'Editor candidate upload is not deployed');
      assert.deepEqual(worker.modules, [{ name: local.moduleName, sha256: pins.bundleSha256 }], 'Editor deployed upload bytes changed');
    } else {
      assert.equal(worker.versionId, expected.versionId, `Editor ${name} version changed`);
      assert.deepEqual(worker.modules, expected.modules, `Editor ${name} modules changed`);
    }
  }
}

const git = (cwd, ...args) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
  assert(!result.error && result.status === 0, 'Editor source inspection failed');
  return result.stdout.trim();
};

async function readCandidate({ cwd, uploadBundle, uploadConfig }) {
  const revision = git(cwd, 'rev-parse', 'HEAD');
  const profile = selectListeningReleaseProfile(revision);
  const pins = profile.pins;
  // Validate reviewed constants before using them in Git or accessing providers.
  assert.match(pins.baseRevision ?? '', /^[a-f0-9]{40}$/, 'Editor base is not reviewed');
  const source = { revision, tree: git(cwd, 'rev-parse', 'HEAD^{tree}'),
    baseRevision: git(cwd, 'rev-parse', '--verify', `${pins.baseRevision}^{commit}`),
    dirty: Boolean(git(cwd, 'status', '--porcelain=v1', '--untracked-files=all')),
    files: git(cwd, 'diff', '--name-only', pins.baseRevision, 'HEAD').split(/\r?\n/).filter(Boolean).sort() };
  assertListeningEditorSource(source, pins);
  assert(uploadBundle && uploadConfig, 'Editor upload bundle and config are required');
  const bundlePath = path.resolve(cwd, uploadBundle), configPath = path.resolve(cwd, uploadConfig);
  const configBytes = await readFile(configPath), config = JSON.parse(configBytes);
  assert.equal(config.name, 'r2-upload-signer', 'Editor deploy service changed');
  assert.equal(config.no_bundle, true, 'Editor deploy must retain exact reviewed bytes');
  assert.equal(path.resolve(path.dirname(configPath), config.main), bundlePath, 'Editor config selects another bundle');
  const envBytes = await readFile(path.join(os.homedir(), '.luyentap/env/.env.production'));
  const local = { source, profile: profile.name, scope: profile.scope, moduleName: path.basename(bundlePath), bundleSha256: hash(await readFile(bundlePath)),
    configSha256: hash(configBytes), sourceConfigSha256: hash(await readFile(path.join(cwd, 'cloudflare/wrangler.jsonc'))),
    envSha256: hash(envBytes), rulesSha256: digest(JSON.parse(await readFile(path.join(cwd, 'database.rules.json'), 'utf8'))),
    submitEndpoint: envBytes.toString('utf8').match(/^VITE_READING_V2_SUBMISSION_ENDPOINT\s*=\s*(.*?)\s*$/m)?.[1]?.replace(/^(['"])(.*)\1$/, '$2') };
  if (Object.hasOwn(pins, 'firestoreRulesSha256')) local.firestoreRulesSha256 = hash(await readFile(path.join(cwd, 'firestore.rules')));
  if (pins.privateAudio) {
    local.lifecycleSha256 = digest(JSON.parse(await readFile(path.join(cwd, 'cloudflare/r2-lifecycle.listening-private.json'), 'utf8')));
    if (Object.hasOwn(pins, 'priorFirestoreRulesSha256')) {
      const localWorkerPath = 'scripts/local-book-source-worker.mjs';
      assertListeningPrivateLocalBindingChange(git(cwd, 'show', `${pins.baseRevision}:${localWorkerPath}`),
        (await readFile(path.join(cwd, localWorkerPath), 'utf8')).trim());
      local.localListeningBindingOnly = true;
    }
  }
  for (const key of ['bundleSha256', 'configSha256', 'sourceConfigSha256', 'envSha256', 'rulesSha256', ...(Object.hasOwn(pins, 'firestoreRulesSha256') ? ['firestoreRulesSha256'] : [])]) {
    assert.match(pins[key] ?? '', /^[a-f0-9]{64}$/, `Editor ${key} is not reviewed`);
    assert.equal(local[key], pins[key], `Editor ${key} changed`);
  }
  return local;
}

export async function observeListeningEditor(options) {
  const local = await readCandidate(options);
  const pins = selectListeningReleaseProfile(local.source.revision).pins;
  const providerOptions = { firestore: Object.hasOwn(pins, 'firestoreRulesSha256'), privateAudio: Boolean(pins.privateAudio) };
  const provider = await readListeningProvider(options.cwd, providerOptions);
  validateListeningEditorEvidence(local, provider, options.phase, pins);
  assert.deepEqual(await readListeningProvider(options.cwd, providerOptions), provider, 'Editor provider changed during observation');
  assert.deepEqual(await readCandidate(options), local, 'Editor inputs changed during observation');
  const observation = freeze({ service: 'listening-editor-release', profile: local.profile, scope: local.scope, source: local.source, phase: options.phase, local, provider,
    observedAt: new Date().toISOString(), fingerprint: digest({ local, provider, phase: options.phase }),
    readOnly: true, sourceKnown: false,
    provenance: 'Exact reviewed upload artifact and native configuration readback; historical Worker Git provenance is unknown.' });
  observations.add(observation);
  return observation;
}
