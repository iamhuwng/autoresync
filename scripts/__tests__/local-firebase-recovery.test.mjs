import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import protobuf from 'protobufjs/minimal.js';
import { adoptSnapshot, assertAuthUsersEqual, assertFirestoreDocumentsEqual, assertInventoryPreserved, atomicJson, datasetIssues, decodeFirestoreExport, inspectSnapshot, inventory, maskedCrc32c, publishGeneration, readGeneration, recoveryRoot, withCheckpointWriter } from '../local-firebase-recovery.mjs';
import { fileURLToPath } from 'node:url';
import { firestoreValue } from '../local-firebase.mjs';

const database = { users: { teacher: { email: 'teacher@test.com' } }, material_catalog: { books: { book: { bookRevision: 3, sourceSetRevision: 1, ownerId: 'teacher' } } }, book_storage_bindings: { book: { accountId: 'original', storageLocationId: 'bucket' } } };
const auth = { users: [{ localId: 'teacher', email: 'teacher@test.com' }] };
const documents = [{ path: 'homework_assignments/homework', fields: { materialType: 'book', materialId: 'book', revision: 2 } }];
const makeRecord = (property) => {
  const w = () => protobuf.Writer.create();
  const keyPath = w().uint32(11).uint32(18).string('homework_assignments').uint32(34).string('homework').uint32(12).finish();
  const reference = w().uint32(106).string('dev~demo-luyentap-local').uint32(114).bytes(keyPath).finish();
  const record = w().uint32(106).bytes(reference);
  if (property) record.uint32(114).bytes(property);
  const entity = Buffer.from(record.finish());
  const bytes = Buffer.alloc(7 + entity.length); bytes.writeUInt16LE(entity.length, 4); bytes[6] = 1; entity.copy(bytes, 7);
  bytes.writeUInt32LE(maskedCrc32c(bytes.subarray(6)), 0); return bytes;
};

test('writer exclusion spans independent callers and releases on failure', async () => {
  await withCheckpointWriter(async port => {
    await assert.rejects(withCheckpointWriter(() => assert.fail('overlapping writer ran'), port), /Another writer/);
  }, 0);
  await assert.rejects(withCheckpointWriter(() => { throw new Error('failed save'); }, 0), /failed save/);
  await withCheckpointWriter(() => {}, 0);
});

test('partial populated datasets, stale revisions, changed bindings and missing Auth/Firestore records are rejected', () => {
  const before = inventory(database, auth, documents);
  const changes = [
    value => delete value.accounts.teacher,
    value => delete value.records['material_catalog/books/book'],
    value => { value.records['material_catalog/books/book'].bookRevision = 2; },
    value => { value.records['book_storage_bindings/book'].immutable = 'replacement'; },
    value => delete value.documents['homework_assignments/homework'],
    value => { value.documents['homework_assignments/homework'].revision = 1; },
  ];
  for (const change of changes) { const after = structuredClone(before); change(after); assert.throws(() => assertInventoryPreserved(before, after)); }
  const newer = structuredClone(before); newer.records['material_catalog/books/book'].bookRevision = 4;
  assert.doesNotThrow(() => assertInventoryPreserved(before, newer));
});

test('exact Firestore restore compares every path and field while ignoring document order', () => {
  const expected = [
    { path: 'homework_assignments/first', fields: { revision: 3, nested: { enabled: true } } },
    { path: 'homework_assignments/second', fields: { answer: ['a', 'b'] } },
  ];
  assert.doesNotThrow(() => assertFirestoreDocumentsEqual(expected, [...expected].reverse()));
  assert.throws(() => assertFirestoreDocumentsEqual(expected, [
    expected[0], { ...expected[1], fields: { answer: ['a', 'c'] } },
  ]), /Restored Firestore documents differ/u);
  assert.throws(() => assertFirestoreDocumentsEqual(expected, [...expected, {
    path: 'extra/document', fields: { unexpected: true },
  }]), /Restored Firestore documents differ/u);
});

test('Auth restore compares all account fields except importer-recreated session metadata', () => {
  const expected = [
    { localId: 'student-1', email: 'student@test.com', emailVerified: true, displayName: 'Student', providerUserInfo: [{ providerId: 'password' }] },
    { localId: 'teacher-1', email: 'teacher@test.com', emailVerified: true, displayName: 'Teacher', disabled: false },
  ];
  assert.doesNotThrow(() => assertAuthUsersEqual(expected, [...expected].reverse()));
  assert.throws(() => assertAuthUsersEqual(expected, [
    { ...expected[0], emailVerified: false }, expected[1],
  ]), /Restored Auth users differ/u);
  assert.doesNotThrow(() => assertAuthUsersEqual(expected, expected.map(user => ({
    ...user, validSince: '1800000000', passwordUpdatedAt: 1800000000000,
  }))));
  for (const field of ['passwordHash', 'salt', 'customAttributes', 'unexpectedField']) {
    assert.throws(() => assertAuthUsersEqual(expected, [
      { ...expected[0], [field]: 'changed' }, expected[1],
    ]), /Restored Auth users differ/u);
  }
});

test('readiness identifies missing cross-store Books and actual provider drift', () => {
  assert.deepEqual(datasetIssues(database, auth, documents), []);
  const partial = structuredClone(database); delete partial.material_catalog.books.book;
  partial.book_source_upload_accounts = { account: { capacity: { providerReconciliation: { status: 'drift' } } } };
  assert.equal(datasetIssues(partial, auth, documents).length, 2);
});

test('Firestore records require complete framing, checksums and the correct local project', () => {
  const record = makeRecord(); assert.equal(decodeFirestoreExport(record)[0].path, 'homework_assignments/homework');
  const corrupt = Buffer.from(record); corrupt[corrupt.length - 2] ^= 1;
  assert.throws(() => decodeFirestoreExport(corrupt), /checksum/);
  assert.throws(() => decodeFirestoreExport(record.subarray(0, record.length - 1)), /Incomplete/);
  const property = (meaning, value) => protobuf.Writer.create().uint32(8).uint32(meaning).uint32(26).string('value').uint32(42).bytes(value).finish();
  assert.equal(decodeFirestoreExport(makeRecord(property(0, protobuf.Writer.create().uint32(8).int64(-3).finish())))[0].fields.value, -3);
  assert.equal(decodeFirestoreExport(makeRecord(property(7, protobuf.Writer.create().uint32(8).int64(1792353600123456).finish())))[0].fields.value, 1792353600123456);
  assert.equal(firestoreValue({ timestampValue: '2026-10-18T20:00:00.123456Z' }), 1792353600123456);
  assert.throws(() => firestoreValue({ bytesValue: 'eA==' }), /Unsupported Firestore REST/);
  assert.throws(() => decodeFirestoreExport(makeRecord(property(14, protobuf.Writer.create().uint32(26).string('bytes').finish()))), /Unsupported Firestore property meaning/);
  assert.throws(() => decodeFirestoreExport(makeRecord(property(0, protobuf.Writer.create().uint32(98).bytes([]).finish()))), /Unsupported Firestore value type/);
});

test('registered recovery generation rejects missing files, tampering and a mismatched dataset pointer', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'firebase-recovery-'));
  const source = path.join(temporary, 'source'), root = path.join(temporary, 'recovery');
  try {
    for (const dir of ['database_export', 'auth_export', 'firestore_export/all_namespaces/all_kinds']) await mkdir(path.join(source, dir), { recursive: true });
    await writeFile(path.join(source, 'firebase-export-metadata.json'), JSON.stringify({ database: {}, auth: {}, firestore: {} }));
    await writeFile(path.join(source, 'database_export/demo-luyentap-local.json'), JSON.stringify(database));
    await writeFile(path.join(source, 'auth_export/accounts.json'), JSON.stringify(auth));
    await writeFile(path.join(source, 'auth_export/config.json'), '{}');
    await writeFile(path.join(source, 'firestore_export/firestore_export.overall_export_metadata'), 'metadata');
    await writeFile(path.join(source, 'firestore_export/all_namespaces/all_kinds/output-0'), makeRecord());
    const adopted = await adoptSnapshot(source, root); const selected = await readGeneration(root);
    assert.equal(selected.manifest.generationId, adopted.manifest.generationId);
    const status = JSON.parse(await readFile(path.join(root, 'status.json'), 'utf8'));
    assert.equal(status.state, 'saved'); assert.equal(status.generationId, selected.manifest.generationId);
    await assert.rejects(adoptSnapshot(source, root), /already registered/);
    const target = path.join(selected.directory, 'auth_export/config.json'); await writeFile(target, '{"changed":true}');
    await assert.rejects(readGeneration(root), /Corrupt/); await writeFile(target, '{}');
    const pointerPath = path.join(root, 'latest.json'), pointer = JSON.parse(await readFile(pointerPath, 'utf8'));
    await writeFile(pointerPath, JSON.stringify({ ...pointer, datasetId: 'wrong' }));
    await assert.rejects(readGeneration(root), /Wrong recovery dataset/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('seed-only exports require explicit fresh registration and retain later preservation guards', async () => {
  assert.equal(recoveryRoot, path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../tmp/local-firebase-recovery'));
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'firebase-fresh-'));
  const source = path.join(temporary, 'source'), root = path.join(temporary, 'recovery');
  try {
    for (const dir of ['database_export', 'auth_export', 'firestore_export']) await mkdir(path.join(source, dir), { recursive: true });
    await writeFile(path.join(source, 'firebase-export-metadata.json'), JSON.stringify({ database: {}, auth: {}, firestore: {} }));
    await writeFile(path.join(source, 'database_export/demo-luyentap-local.json'), JSON.stringify({ users: database.users }));
    await writeFile(path.join(source, 'auth_export/accounts.json'), JSON.stringify(auth));
    await writeFile(path.join(source, 'auth_export/config.json'), '{}');
    await writeFile(path.join(source, 'firestore_export/firestore_export.overall_export_metadata'), 'metadata');
    await assert.rejects(adoptSnapshot(source, root), /No readable Firestore/);
    const inspected = await inspectSnapshot(source, { freshDataset: true }); assert.equal(inspected.documents.length, 0);
    await publishGeneration(source, { datasetId: 'fresh', root, freshDataset: true });
    await atomicJson(path.join(root, 'dataset.json'), { datasetId: 'fresh' });
    const selected = await readGeneration(root); assert.equal(selected.manifest.freshDataset, true);
    assert.throws(() => assertInventoryPreserved(inventory(database, auth, documents), selected.inventory), /Missing protected record/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
