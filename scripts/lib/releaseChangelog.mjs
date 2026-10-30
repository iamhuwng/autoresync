import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';

const OPERATIONS = new Set(['deploy', 'activate', 'rollback', 'rules', 'indexes', 'configuration', 'secrets', 'migration', 'maintenance', 'storage', 'recovery']);
const BINDING_KEYS = ['sourceRevision', 'sourceFingerprint', 'artifactSha256', 'configSha256'];
const CONTENT_KEYS = BINDING_KEYS.slice(1);
const PUBLICATIONS = new Set(['published', 'not-published', 'unconfirmed']);
const VERIFICATIONS = new Set(['passed', 'failed', 'unverified']);
const fail = message => { throw new Error(`Invalid release changelog: ${message}`); };

const object = (value, keys, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail(`${label} must be an object`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`unknown ${label} field ${key}`);
  return value;
};
const text = (value, label, maximum = 1000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || value.includes('\0')) fail(`${label} must be nonempty text (maximum ${maximum} characters)`);
  return value;
};
const identity = (value, label = 'id') => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9:._/-]{0,199}$/u.test(value) || Object.hasOwn(Object.prototype, value) || value === 'prototype') fail(`${label} is malformed`);
  return value;
};
const refs = value => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 30) fail('evidenceRefs must be a compact array');
  return [...new Set(value.map(value => {
    text(value, 'evidence reference', 1000);
    if (/[\r\n]/u.test(value) || /^\s*[{[]/u.test(value) || /[?&](?:key|token|secret|password|authorization)=/iu.test(value) || /:\/\/[^/]*@/u.test(value)) fail('evidenceRefs must contain references without credentials, not raw receipts');
    return value;
  }))];
};
const binding = value => {
  object(value, BINDING_KEYS, 'binding');
  const result = {};
  for (const key of BINDING_KEYS) {
    if (value[key] === undefined) continue;
    const pattern = key === 'sourceRevision' ? /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u : /^[a-f0-9]{64}$/u;
    if (typeof value[key] !== 'string' || !pattern.test(value[key])) fail(`${key} must be a full lower-case hexadecimal digest`);
    result[key] = value[key];
  }
  if (!CONTENT_KEYS.some(key => result[key])) fail('binding requires a content fingerprint or artifact/configuration digest');
  return result;
};
const sameBinding = (left, right) => CONTENT_KEYS.every(key => left[key] === right[key]);
const comparableBinding = (saved, published) => CONTENT_KEYS.every(key => !saved[key] || Boolean(published[key]));
const targets = (value, release = false) => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30) fail('targets must contain between 1 and 30 explicit targets');
  const result = value.map(target => {
    object(target, release ? ['id', 'operation', 'binding', 'annotation'] : ['id', 'binding'], 'target');
    const result = { id: identity(target.id, 'target id'), binding: binding(target.binding) };
    if (release) {
      if (!OPERATIONS.has(target.operation)) fail(`unsupported operation ${target.operation}`);
      result.operation = target.operation;
      if (target.annotation !== undefined) result.annotation = text(target.annotation, 'annotation');
    }
    return result;
  });
  if (new Set(result.map(target => target.id)).size !== result.length) fail('target IDs must be unique');
  return result.sort((left, right) => left.id.localeCompare(right.id));
};
const timestamp = value => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail('timestamp is malformed');
};

export const resolveStoreDir = () => path.resolve(process.env.LUYENTAP_CHANGELOG_DIR || path.join(os.homedir(), '.luyentap', 'changelog', 'temp-a1437'));
const storePath = storeDir => path.join(path.resolve(storeDir ?? resolveStoreDir()), 'state.json');

const validateDraft = value => {
  object(value, ['id', 'status', 'description', 'targets', 'createdAt'], 'draft');
  identity(value.id);
  if (value.status !== 'not-live') fail('draft must be not-live');
  text(value.description, 'description');
  targets(value.targets);
  timestamp(value.createdAt);
};
const validateRelease = value => {
  object(value, ['id', 'status', 'description', 'targets', 'evidenceRefs', 'origin', 'createdAt', 'updatedAt', 'pendingId', 'supersedesPendingId', 'appliedReceiptHashes'], 'release');
  identity(value.id);
  text(value.description, 'description');
  if (!['execution', 'retrospective'].includes(value.origin)) fail('release origin is malformed');
  if (value.pendingId !== null) identity(value.pendingId, 'pendingId');
  if (value.supersedesPendingId !== null) identity(value.supersedesPendingId, 'supersedesPendingId');
  if (value.origin === 'retrospective' && (value.pendingId !== null || value.supersedesPendingId !== null)) fail('retrospective records cannot consume a current draft');
  refs(value.evidenceRefs);
  if (value.appliedReceiptHashes !== undefined) {
    const hashes = value.appliedReceiptHashes;
    if (!Array.isArray(hashes) || hashes.some(hash => typeof hash !== 'string' || !/^[a-f0-9]{64}$/u.test(hash))
      || new Set(hashes).size !== hashes.length) fail('applied receipt hashes are malformed');
  }
  if (value.origin === 'retrospective' && !value.evidenceRefs.length) fail('retrospective record requires historical evidence references');
  timestamp(value.createdAt);
  timestamp(value.updatedAt);
  if (!Array.isArray(value.targets)) fail('release targets are malformed');
  targets(value.targets.map(target => {
    object(target, ['id', 'binding', 'operation', 'annotation', 'publication', 'verification', 'providerIdentity', 'evidenceRefs'], 'saved target');
    if (!PUBLICATIONS.has(target.publication) || !VERIFICATIONS.has(target.verification)) fail('saved publication or verification is malformed');
    refs(target.evidenceRefs);
    if (target.providerIdentity !== undefined) providerIdentity(target.providerIdentity);
    if (target.publication === 'published' && (!target.providerIdentity || ![...value.evidenceRefs, ...target.evidenceRefs].length)) fail('published target requires provider identity and evidence reference');
    const { publication, verification, providerIdentity: provider, evidenceRefs, ...intent } = target;
    return intent;
  }), true);
  if (value.status !== (value.targets.every(target => target.publication === 'published') ? 'live' : 'not-live')) fail('release status disagrees with confirmed publication');
};
const readState = storeDir => {
  let raw;
  try { raw = readFileSync(storePath(storeDir), 'utf8'); } catch (error) {
    if (error.code === 'ENOENT') return { schemaVersion: 1, draft: null, releases: {} };
    throw error;
  }
  const state = JSON.parse(raw);
  object(state, ['schemaVersion', 'draft', 'releases'], 'store');
  if (state.schemaVersion !== 1) fail('unsupported store schema');
  if (state.draft !== null) validateDraft(state.draft);
  object(state.releases, Object.keys(state.releases ?? {}), 'releases');
  for (const [id, release] of Object.entries(state.releases)) {
    validateRelease(release);
    if (id !== release.id) fail('release key disagrees with its id');
  }
  return state;
};
const writeState = (state, storeDir) => {
  const target = storePath(storeDir);
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  let descriptor;
  try {
    descriptor = openSync(temporary, 'wx', 0o600);
    writeFileSync(descriptor, `${JSON.stringify(state)}\n`);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, target);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    rmSync(temporary, { force: true });
  }
};
const updateState = (storeDir, update) => {
  const target = storePath(storeDir);
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const lock = `${target}.lock`;
  const deadline = Date.now() + 2000;
  const wait = new Int32Array(new SharedArrayBuffer(4));
  let descriptor;
  while (descriptor === undefined) {
    try { descriptor = openSync(lock, 'wx', 0o600); } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (Date.now() >= deadline) throw new Error(`Changelog is locked by another writer; retry after it finishes. Lock: ${lock}`);
      Atomics.wait(wait, 0, 0, 25);
    }
  }
  try {
    // shortcut: a crashed writer leaves its lock; remove only after checking the recorded process.
    writeFileSync(descriptor, `${process.pid}\n`);
    const state = readState(storeDir);
    const before = JSON.stringify(state);
    const result = update(state);
    if (JSON.stringify(state) !== before) writeState(state, storeDir);
    return result;
  } finally {
    closeSync(descriptor);
    rmSync(lock);
  }
};

export const readDraft = storeDir => readState(storeDir).draft;
export const readRelease = (id, storeDir) => readState(storeDir).releases[identity(id)] ?? null;
export const listReleases = storeDir => Object.values(readState(storeDir).releases).sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id));

export function saveDraft(input, storeDir) {
  object(input, ['description', 'targets'], 'draft input');
  const draft = { id: crypto.randomUUID(), status: 'not-live', description: text(input.description, 'description'), targets: targets(input.targets), createdAt: new Date().toISOString() };
  return updateState(storeDir, state => { state.draft = draft; return draft; });
}

const select = (description, requested, draft) => {
  const matching = Boolean(draft && requested.every(target => draft.targets.some(saved => saved.id === target.id && sameBinding(saved.binding, target.binding))));
  const relevant = draft && requested.some(target => draft.targets.some(saved => saved.id === target.id));
  return {
    description: matching ? draft.description : description,
    pendingId: matching ? draft.id : null,
    matching,
    reason: !draft ? 'No pending manual entry exists.' : matching ? 'Pending description matches the explicit target scope and content.' : relevant ? 'Pending entry is stale or covers a different target scope.' : 'Pending entry belongs to unrelated targets.',
  };
};
export function selectDescription(input, storeDir) {
  object(input, ['description', 'targets'], 'selection input');
  return select(text(input.description, 'description'), targets(input.targets), readDraft(storeDir));
}

const intent = release => ({ description: release.description, targets: release.targets.map(({ publication, verification, providerIdentity, evidenceRefs, ...target }) => target), origin: release.origin });
export function beginRelease(input, storeDir, options = {}) {
  object(input, ['id', 'description', 'targets', 'evidenceRefs', 'retrospective'], 'release input');
  object(options, ['requireNew'], 'begin options');
  if (options.requireNew !== undefined && typeof options.requireNew !== 'boolean') fail('requireNew must be boolean');
  if (input.retrospective !== undefined && typeof input.retrospective !== 'boolean') fail('retrospective must be boolean');
  const id = input.id === undefined ? crypto.randomUUID() : identity(input.id);
  const requested = targets(input.targets, true);
  const description = text(input.description, 'description');
  const evidenceRefs = refs(input.evidenceRefs);
  if (input.retrospective && !evidenceRefs.length) fail('retrospective record requires explicit historical evidence references');
  return updateState(storeDir, state => {
    const selected = input.retrospective ? { description, pendingId: null } : select(description, requested, state.draft);
    const candidate = { description, targets: requested, origin: input.retrospective ? 'retrospective' : 'execution' };
    const previous = state.releases[id];
    if (previous) {
      if (options.requireNew) throw new Error(`Release ${id} is already recorded; reconcile the recorded intent before a new execution.`);
      // Repeating an ID reuses its original intent even after the matching draft was consumed.
      if (JSON.stringify(intent(previous)) !== JSON.stringify(candidate)) fail(`release id ${id} already has different intent`);
      return previous;
    }
    const now = new Date().toISOString();
    const revised = !input.retrospective && state.draft && requested.some(target => state.draft.targets.some(saved => saved.id === target.id && comparableBinding(saved.binding, target.binding) && !sameBinding(saved.binding, target.binding)));
    const release = { id, status: 'not-live', ...candidate, targets: requested.map(target => ({ ...target, publication: 'unconfirmed', verification: 'unverified', evidenceRefs: [] })), evidenceRefs, createdAt: now, updatedAt: now, pendingId: selected.description === description ? selected.pendingId : null, supersedesPendingId: revised ? state.draft.id : null };
    state.releases[id] = release;
    return release;
  });
}

const providerIdentity = value => {
  text(value, 'providerIdentity', 500);
  if (/[\r\n]/u.test(value)) fail('providerIdentity must be a compact identifier');
  return value;
};
export function settleRelease(id, input, storeDir) {
  identity(id);
  object(input, ['outcomes', 'evidenceRefs'], 'settlement input');
  if (!Array.isArray(input.outcomes) || !input.outcomes.length || input.outcomes.length > 30) fail('outcomes must name explicit targets');
  const evidenceRefs = refs(input.evidenceRefs);
  const outcomes = input.outcomes.map(outcome => {
    object(outcome, ['id', 'publication', 'verification', 'providerIdentity', 'evidenceRefs'], 'outcome');
    identity(outcome.id, 'outcome target id');
    if (!PUBLICATIONS.has(outcome.publication) || !VERIFICATIONS.has(outcome.verification)) fail('outcome requires explicit publication and verification');
    return { ...outcome, ...(outcome.providerIdentity === undefined ? {} : { providerIdentity: providerIdentity(outcome.providerIdentity) }), evidenceRefs: refs(outcome.evidenceRefs) };
  });
  if (new Set(outcomes.map(outcome => outcome.id)).size !== outcomes.length) fail('outcome target IDs must be unique');
  const receiptHash = crypto.createHash('sha256').update(JSON.stringify({
    evidenceRefs: [...evidenceRefs].sort(),
    outcomes: outcomes.map(outcome => ({ id: outcome.id, publication: outcome.publication, verification: outcome.verification,
      providerIdentity: outcome.providerIdentity, evidenceRefs: [...outcome.evidenceRefs].sort() }))
      .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  })).digest('hex');
  return updateState(storeDir, state => {
    const release = state.releases[id];
    if (!release) fail(`unknown release id ${id}`);
    if (release.appliedReceiptHashes?.includes(receiptHash)) return release;
    const before = JSON.stringify(release);
    release.evidenceRefs = [...new Set([...release.evidenceRefs, ...evidenceRefs])];
    for (const outcome of outcomes) {
      const target = release.targets.find(target => target.id === outcome.id);
      if (!target) fail(`outcome target ${outcome.id} was not in the recorded intent`);
      if (target.publication === 'published' && (outcome.publication !== 'published' || (outcome.providerIdentity !== undefined && outcome.providerIdentity !== target.providerIdentity))) fail('confirmed publication cannot be erased or reassigned; record a separate operation');
      Object.assign(target, { publication: outcome.publication, verification: outcome.verification, evidenceRefs: [...new Set([...target.evidenceRefs, ...outcome.evidenceRefs])] }, outcome.providerIdentity === undefined ? {} : { providerIdentity: outcome.providerIdentity });
      if (target.publication === 'published' && (!target.providerIdentity || ![...target.evidenceRefs, ...release.evidenceRefs].length)) fail('published outcome requires provider identity and evidence reference');
    }
    release.appliedReceiptHashes = [...(release.appliedReceiptHashes ?? []), receiptHash];
    release.status = release.targets.every(target => target.publication === 'published') ? 'live' : 'not-live';
    if (JSON.stringify(release) !== before) release.updatedAt = new Date().toISOString();
    const draft = state.draft;
    if (draft && [release.pendingId, release.supersedesPendingId].includes(draft.id)
      && draft.targets.every(target => Object.values(state.releases).some(record =>
        [record.pendingId, record.supersedesPendingId].includes(draft.id)
        && record.targets.some(published => published.id === target.id && published.publication === 'published'
          && (record.pendingId === draft.id ? sameBinding(target.binding, published.binding) : comparableBinding(target.binding, published.binding)))))) state.draft = null;
    return release;
  });
}
