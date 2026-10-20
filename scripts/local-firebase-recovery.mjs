import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import protobuf from 'protobufjs/minimal.js';

export const recoveryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../tmp/local-firebase-recovery');
const project = 'demo-luyentap-local';
const stable = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(key => [key, v[key]])) : v);
export const digest = value => createHash('sha256').update(Buffer.isBuffer(value) ? value : stable(value)).digest('hex');
const json = async file => JSON.parse(await readFile(file, 'utf8'));
export const atomicJson = async (file, value) => {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, JSON.stringify(value, null, 2)); await rename(temporary, file); }
  finally { await rm(temporary, { force: true }); }
};

// The OS releases this local project lock on exit, including a killed writer.
export const withCheckpointWriter = async (operation, port = 9010) => {
  const lock = net.createServer();
  await new Promise((resolve, reject) => {
    lock.once('error', error => reject(new Error(`Firebase checkpoint writer unavailable: ${error.code}. Another writer may be active.`)));
    lock.listen({ port, host: 'localhost', exclusive: true }, resolve);
  });
  try { return await operation(lock.address().port); }
  finally { await new Promise((resolve, reject) => lock.close(error => error ? reject(error) : resolve())); }
};

const wire = (bytes, reader = protobuf.Reader.create(bytes), endGroup = false) => {
  const fields = {};
  while (reader.pos < reader.len) {
    const tag = reader.uint32(), key = tag >>> 3, type = tag & 7;
    if (type === 4) { assert(endGroup); return fields; }
    let value;
    if (type === 0) value = reader.uint64().toString();
    else if (type === 1) value = reader.double();
    else if (type === 2) value = Buffer.from(reader.bytes());
    else if (type === 3) value = wire(null, reader, true);
    else assert.fail(`Unsupported Firestore protobuf wire type ${type}`);
    (fields[key] ??= []).push(value);
  }
  assert(!endGroup, 'Incomplete Firestore protobuf group');
  return fields;
};
const entity = bytes => {
  const fields = wire(bytes), result = {};
  for (const raw of [...(fields[14] ?? []), ...(fields[15] ?? [])]) {
    const property = wire(raw), name = property[3]?.[0]?.toString();
    assert(name, 'Firestore property name is missing');
    const value = wire(property[5]?.[0] ?? Buffer.alloc(0));
    const meaning = property[1]?.[0] ?? '0';
    // OnestoreEntity.Property.Meaning in the pinned emulator: GD_WHEN=7 (microseconds).
    assert(['0', '7', '19', '24'].includes(meaning), `Unsupported Firestore property meaning ${meaning}`);
    assert(Object.keys(value).every(key => ['1', '2', '3', '4'].includes(key)), 'Unsupported Firestore value type');
    assert(Object.keys(value).length <= 1 && Object.values(value).every(items => items.length === 1), 'Ambiguous Firestore value');
    if (meaning === '7') assert(value[1], 'Firestore timestamp requires integer microseconds');
    const decoded = meaning === '24' ? [] : meaning === '19' ? entity(value[3][0])
      : value[3] ? value[3][0].toString() : value[1] ? Number(BigInt.asIntN(64, BigInt(value[1][0])))
        : value[2] ? value[2][0] === '1' : value[4] ? value[4][0] : null;
    if (value[1]) assert(Number.isSafeInteger(decoded), 'Firestore integer exceeds safe precision');
    if (value[4]) assert(Number.isFinite(decoded), 'Unsupported non-finite Firestore number');
    if (property[4]?.[0] === '1') (result[name] ??= []).push(decoded);
    else { assert(!(name in result), `Duplicate Firestore property ${name}`); result[name] = decoded; }
  }
  return result;
};
const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0x82f63b78 : 0);
  return value >>> 0;
});
export const maskedCrc32c = bytes => {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  value = (value ^ 0xffffffff) >>> 0;
  return (((value >>> 15) | (value << 17)) + 0xa282ead8) >>> 0;
};
export const decodeFirestoreExport = bytes => {
  const records = []; let partial = [];
  for (let offset = 0; offset < bytes.length;) {
    const remaining = 32768 - offset % 32768;
    if (remaining < 7) { offset += remaining; continue; }
    assert(offset + 7 <= bytes.length, 'Incomplete Firestore export header');
    const size = bytes.readUInt16LE(offset + 4), type = bytes[offset + 6];
    if (!size && !type) { offset += remaining; continue; }
    assert(size + 7 <= remaining && offset + 7 + size <= bytes.length, 'Incomplete Firestore export record');
    assert.equal(bytes.readUInt32LE(offset), maskedCrc32c(bytes.subarray(offset + 6, offset + 7 + size)), 'Firestore export checksum mismatch');
    const record = bytes.subarray(offset + 7, offset + 7 + size); offset += 7 + size;
    if (type === 1) { assert.equal(partial.length, 0); records.push(record); }
    else if (type === 2) { assert.equal(partial.length, 0); partial = [record]; }
    else if (type === 3 || type === 4) {
      assert(partial.length); partial.push(record);
      if (type === 4) { records.push(Buffer.concat(partial)); partial = []; }
    } else assert.fail(`Invalid Firestore export record type ${type}`);
  }
  assert.equal(partial.length, 0, 'Incomplete Firestore export fragments');
  return records.map(record => {
    const reference = wire(wire(record)[13][0]);
    assert.equal(reference[13][0].toString(), `dev~${project}`, 'Wrong Firestore export project');
    const segments = wire(reference[14][0])[1] ?? [];
    const documentPath = segments.flatMap(segment => [segment[2][0].toString(), segment[4]?.[0]?.toString() ?? segment[3]?.[0]]).join('/');
    assert(documentPath && documentPath.split('/').length % 2 === 0);
    return { path: documentPath, fields: entity(record), sha256: digest(record) };
  });
};

export const snapshotFiles = async directory => {
  const files = {};
  const visit = async relative => {
    for (const item of await readdir(path.join(directory, relative), { withFileTypes: true })) {
      assert(!item.isSymbolicLink(), 'Recovery exports cannot contain links');
      const key = path.join(relative, item.name);
      if (item.isDirectory()) await visit(key);
      else if (key !== 'recovery-generation.json') files[key] = digest(await readFile(path.join(directory, key)));
    }
  };
  await visit(''); return files;
};
const recordFamilies = database => {
  const rows = {};
  const add = (prefix, values) => { for (const [key, value] of Object.entries(values ?? {})) rows[`${prefix}/${key}`] = value; };
  add('material_catalog/books', database.material_catalog?.books);
  add('book_storage_bindings', database.book_storage_bindings);
  for (const [uid, scope] of Object.entries(database.book_submission_operations ?? {})) add(`book_submission_operations/${uid}/operations`, scope.operations);
  for (const [account, scope] of Object.entries(database.book_source_upload_accounts ?? {})) add(`book_source_upload_accounts/${account}/operations`, scope.operations);
  for (const [uid, scopes] of Object.entries(database.book_delivery?.scopes ?? {})) {
    for (const [context, scope] of Object.entries(scopes)) add(`book_delivery/scopes/${uid}/${context}/records`, scope.records);
  }
  for (const [uid, scopes] of Object.entries(database.book_runtime?.scopes ?? {})) {
    for (const [context, scope] of Object.entries(scopes)) {
      add(`book_runtime/scopes/${uid}/${context}/attempts`, scope.attempts);
      add(`book_runtime/scopes/${uid}/${context}/drafts`, scope.drafts);
    }
  }
  return rows;
};
export const inventory = (database, auth, documents) => ({
  accounts: Object.fromEntries((auth.users ?? []).map(user => [user.localId, user.email ?? null])),
  records: Object.fromEntries(Object.entries(recordFamilies(database)).map(([key, value]) => [key, {
    ...(key.startsWith('book_storage_bindings/') ? { immutable: digest(value) } : {}),
    ...(/\/attempts\//u.test(key) && value.status === 'submitted' ? { immutable: digest(value) } : {}),
    ...Object.fromEntries(['bookRevision', 'sourceSetRevision', 'revision', 'recordRevision'].filter(k => Number.isSafeInteger(value[k])).map(k => [k, value[k]])),
    ...Object.fromEntries(['fingerprint', 'reservationId', 'ownerId', 'finalBookId', 'sourceVersionId'].filter(k => typeof value[k] === 'string').map(k => [k, value[k]])),
  }])),
  documents: Object.fromEntries(documents.map(doc => [doc.path, {
    ...(Number.isSafeInteger(doc.fields.revision) ? { revision: doc.fields.revision } : {}),
  }])),
});
export const assertInventoryPreserved = (previous, current) => {
  for (const [uid, email] of Object.entries(previous.accounts)) assert.equal(current.accounts[uid], email, `Missing or changed Auth identity ${uid}`);
  for (const [key, record] of Object.entries(previous.records)) {
    assert(current.records[key], `Missing protected record ${key}`);
    for (const [field, value] of Object.entries(record)) {
      if (typeof value === 'number') assert(current.records[key][field] >= value, `Stale revision ${key}/${field}`);
      else assert.equal(current.records[key][field], value, `Changed protected identity ${key}/${field}`);
    }
  }
  for (const [key, doc] of Object.entries(previous.documents)) {
    assert(current.documents[key], `Missing Firestore document ${key}`);
    if (doc.revision !== undefined) assert(current.documents[key].revision >= doc.revision, `Stale Firestore revision ${key}`);
  }
};
export const datasetIssues = (database, auth, documents) => {
  const issues = [];
  for (const account of auth.users ?? []) {
    const profile = database.users?.[account.localId];
    if (account.email?.endsWith('@test.com') && (!profile || profile.email !== account.email)) issues.push(`Auth/profile mismatch ${account.localId}`);
  }
  for (const doc of documents.filter(d => d.path.startsWith('homework_assignments/'))) {
    if (doc.fields.archived === true || doc.fields.materialType !== 'book') continue;
    if (!database.material_catalog?.books?.[doc.fields.materialId]) issues.push(`Homework ${doc.path} references missing Book ${doc.fields.materialId}`);
  }
  for (const [account, state] of Object.entries(database.book_source_upload_accounts ?? {})) {
    if (state.capacity?.providerReconciliation?.status === 'drift') issues.push(`Provider ledger drift ${account}`);
  }
  return issues;
};
export const inspectSnapshot = async (directory, { freshDataset = false } = {}) => {
  const metadata = await json(path.join(directory, 'firebase-export-metadata.json'));
  assert(metadata.auth && metadata.database && metadata.firestore, 'Incomplete three-store snapshot');
  const database = await json(path.join(directory, 'database_export', `${project}.json`));
  const auth = await json(path.join(directory, 'auth_export', 'accounts.json'));
  await json(path.join(directory, 'auth_export', 'config.json'));
  await stat(path.join(directory, 'firestore_export', 'firestore_export.overall_export_metadata'));
  const files = await snapshotFiles(directory);
  const documents = [];
  for (const file of Object.keys(files).filter(file => /^output-\d+$/u.test(path.basename(file)))) documents.push(...decodeFirestoreExport(await readFile(path.join(directory, file))));
  assert(freshDataset || documents.length > 0, 'No readable Firestore records');
  const identities = inventory(database, auth, documents);
  assert(Object.keys(identities.accounts).length > 0 && (freshDataset || Object.keys(identities.records).length > 0), 'Empty/seed-only recovery dataset');
  return { database, auth, documents, files, inventory: identities, issues: datasetIssues(database, auth, documents) };
};
export const readGeneration = async (root = recoveryRoot) => {
  const selected = await json(path.join(root, 'latest.json'));
  const dataset = await json(path.join(root, 'dataset.json'));
  assert.equal(selected.datasetId, dataset.datasetId, 'Wrong recovery dataset');
  assert.match(selected.generationId, /^[a-f0-9-]{36}$/u);
  const directory = path.join(root, 'generations', selected.generationId);
  const manifest = await json(path.join(directory, 'recovery-generation.json'));
  assert.equal(manifest.datasetId, dataset.datasetId); assert.equal(manifest.generationId, selected.generationId);
  const actual = await inspectSnapshot(directory, { freshDataset: manifest.freshDataset === true });
  assert.equal(digest(actual.files), digest(manifest.files), 'Corrupt/incomplete recovery generation');
  assert.equal(digest(actual.inventory), digest(manifest.inventory), 'Recovery inventory mismatch');
  return { directory, manifest, ...actual };
};
export const publishGeneration = async (staging, { datasetId, previous, root = recoveryRoot, protectedGeneration = false, freshDataset = previous?.manifest.freshDataset === true }) => {
  const inspected = await inspectSnapshot(staging, { freshDataset });
  if (previous) assertInventoryPreserved(previous.inventory, inspected.inventory);
  const generationId = randomUUID(), completedAt = new Date().toISOString();
  const manifest = { schemaVersion: 1, projectId: project, datasetId, generationId, completedAt, protectedGeneration,
    ...(freshDataset ? { freshDataset: true } : {}),
    files: inspected.files, inventory: inspected.inventory, issues: inspected.issues };
  await atomicJson(path.join(staging, 'recovery-generation.json'), manifest);
  const destination = path.join(root, 'generations', generationId);
  await mkdir(path.dirname(destination), { recursive: true });
  await rename(staging, destination);
  // Only a fully validated generation can advance the pointer; earlier generations are immutable.
  await atomicJson(path.join(root, 'latest.json'), { datasetId, generationId, completedAt });
  return { directory: destination, manifest };
};
export const pruneAutomaticGenerations = async (root = recoveryRoot) => {
  const latest = await json(path.join(root, 'latest.json'));
  const candidates = [];
  for (const name of await readdir(path.join(root, 'generations'))) {
    assert.match(name, /^[a-f0-9-]{36}$/u);
    const directory = path.join(root, 'generations', name);
    const manifest = await json(path.join(directory, 'recovery-generation.json'));
    assert.equal(manifest.datasetId, latest.datasetId);
    if (!manifest.protectedGeneration) candidates.push({ directory, name, completedAt: manifest.completedAt });
  }
  candidates.sort((a,b) => b.completedAt.localeCompare(a.completedAt));
  for (const old of candidates.slice(3)) {
    assert.notEqual(old.name, latest.generationId);
    assert.equal(path.dirname(old.directory), path.join(root, 'generations'));
    await rm(old.directory, { recursive: true });
  }
};
export const adoptSnapshot = (source, root = recoveryRoot) => withCheckpointWriter(async () => {
  await assert.rejects(readFile(path.join(root, 'dataset.json')), { code: 'ENOENT' }, 'Dataset is already registered; do not replace it');
  await inspectSnapshot(source);
  const datasetId = randomUUID();
  const staging = path.join(root, `adopt-${randomUUID()}`);
  await cp(source, staging, { recursive: true, errorOnExist: true, force: false });
  const published = await publishGeneration(staging, { datasetId, root, protectedGeneration: true });
  await atomicJson(path.join(root, 'dataset.json'), { schemaVersion: 1, projectId: project, datasetId, adoptedAt: new Date().toISOString(), source: path.resolve(source) });
  await atomicJson(path.join(root, 'status.json'), { state: 'saved', startedAt: published.manifest.completedAt,
    completedAt: published.manifest.completedAt, datasetId, generationId: published.manifest.generationId, issues: published.manifest.issues });
  return published;
});
