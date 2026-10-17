import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { createComponentStudentDocument } from '../../services/book-assembly/componentStudentDocument.types';

const baseline = JSON.parse(readFileSync('database.rules.json', 'utf8'));
for (const name of ['16A', '43']) {
  const fragment = JSON.parse(readFileSync(`cloudflare/src/upload-worker/book-rules/fragments/${name}.json`, 'utf8'));
  for (const operation of fragment.operations) {
    let node = baseline.rules;
    for (const segment of operation.path.split('/')) node = node[segment] ??= {};
    node[operation.rule] = operation.rule === '.indexOn' ? [operation.expression] : operation.expression;
  }
}
const suite = process.env.FIREBASE_DATABASE_EMULATOR_HOST ? describe : describe.skip;
const catalog = 'material_catalog/public_book_readiness/book-1';
const publication = 'book_assembly_publications/books/book-1';
const now = '2026-10-03T00:00:00.000Z';
const pointer = (revision = 1) => ({ publicationId: `publication-${revision}`, publicationRevision: revision,
  manifestVersionId: `manifest-${revision}`, bookRevision: 2, sourceSetRevision: 1, updatedAt: now,
  updatedByCommandId: `command-${revision}`, operationFingerprint: `operation-${revision}` });
const row = (revision = 1) => ({ schemaVersion: 1, bookId: 'book-1', title: 'Public Book', updatedAt: now,
  bookRevision: 2, publicationId: `publication-${revision}`, publicationRevision: revision, manifestVersionId: `manifest-${revision}`,
  sourceStrategy: 'full_pdf', sourceVersionId: 'original-1', sha256Hex: 'a'.repeat(64), physicalPageCount: 2 });
const claim = (revision = 1) => ({ book_public_readiness_service: true, book_public_readiness_bookId: 'book-1',
  book_public_readiness_ownerId: 'teacher-1', book_public_readiness_publicationId: `publication-${revision}`,
  book_public_readiness_publicationRevision: revision, book_public_readiness_accountId: 'account-1',
  book_public_readiness_setupActivationIndex: '0' });
let env: RulesTestEnvironment;
let previousRules: unknown;
const rulesUrl = 'http://localhost:9000/.settings/rules.json?ns=demo-prd0062-u-rules';
suite('Public readiness native candidate fences', () => {
  beforeAll(async () => {
    previousRules = await (await fetch(rulesUrl, { headers: { authorization: 'Bearer owner' } })).json();
    env = await initializeTestEnvironment({ projectId: 'demo-prd0062-u-rules', database: { host: 'localhost', port: 9000, rules: JSON.stringify(baseline) } });
  });
  afterAll(async () => {
    await env?.cleanup();
    if (previousRules) {
      const restored = await fetch(rulesUrl, { method: 'PUT', headers: { authorization: 'Bearer owner', 'content-type': 'application/json' }, body: JSON.stringify(previousRules) });
      expect(restored.ok).toBe(true);
    }
  });
  beforeEach(async () => {
    await env.clearDatabase();
    await env.withSecurityRulesDisabled(async (context) => {
      await context.database().ref().set({ users: { 'teacher-1': { role: 'teacher', status: 'active' }, 'student-1': { role: 'student', status: 'active' } },
        material_catalog: { books: { 'book-1': { bookId: 'book-1', ownerId: 'teacher-1', title: 'Public Book', visibility: 'public-library-published', status: 'ready', bookRevision: 2 } } },
        book_assembly_publications: { books: { 'book-1': { current: pointer(), versions: Object.fromEntries([1, 2].map((revision) => [`manifest-${revision}`, {
          bookId: 'book-1', ownerId: 'teacher-1', publicationId: `publication-${revision}`, publicationRevision: revision,
          createdByCommandId: `command-${revision}`, strategy: 'full_pdf', manifest: { sourceSet: { sources: [{ sourceVersionId: 'original-1' }] } },
        }])) } } },
        book_source_upload_accounts: { 'account-1': { assemblyBooks: { 'book-1': { 'original-1': {
          ownerId: 'teacher-1', verifiedUsable: true, studentSafeStatus: 'ready', purpose: 'book-source', checksum: { value: 'a'.repeat(64) }, physicalPageCount: 2,
        } } } } },
      });
    });
  });

  it('permits exact ready full sources and one bounded student catalog read, denying leaks and broad reads', async () => {
    const db = env.authenticatedContext('teacher-1', claim()).database();
    await assertSucceeds(db.ref(catalog).set(row()));
    await assertFails(db.ref(catalog).set({ ...row(), provider: 'private' }));
    const student = env.authenticatedContext('student-1').database();
    await assertSucceeds(student.ref('material_catalog/public_book_readiness').orderByChild('updatedAt').limitToLast(21).once('value'));
    await assertFails(student.ref('material_catalog/public_book_readiness').once('value'));
    await assertFails(student.ref('material_catalog/public_book_readiness').orderByChild('updatedAt').limitToLast(52).once('value'));
  });

  it('blocks pointer advance if an old refresh races after preclear, and blocks stale refresh/delete after successor publication', async () => {
    const old = env.authenticatedContext('teacher-1', claim()).database();
    const publisher = env.authenticatedContext('teacher-1', { book_assembly_publication_service: true, book_assembly_publication_bookId: 'book-1', book_assembly_publication_ownerId: 'teacher-1' }).database();
    await assertSucceeds(old.ref(catalog).set(row()));
    await assertSucceeds(old.ref(catalog).remove());
    await assertSucceeds(old.ref(catalog).set(row()));
    await assertFails(publisher.ref(`${publication}/current`).set(pointer(2)));
    await assertSucceeds(old.ref(catalog).remove());
    await assertSucceeds(publisher.ref(`${publication}/current`).set(pointer(2)));
    const next = env.authenticatedContext('teacher-1', claim(2)).database();
    await assertSucceeds(next.ref(catalog).set(row(2)));
    await assertFails(old.ref(catalog).set(row()));
    await assertFails(old.ref(catalog).remove());
  });

  it('rejects refresh after archive or removed source authority', async () => {
    const db = env.authenticatedContext('readiness-service', claim()).database();
    await assertSucceeds(db.ref(catalog).set(row()));
    await env.withSecurityRulesDisabled(async (context) => { await context.database().ref().update({
      'material_catalog/books/book-1/status': 'archived', [catalog]: null,
    }); });
    await assertFails(db.ref(catalog).set(row()));
    await env.withSecurityRulesDisabled(async (context) => { await context.database().ref().update({
      'material_catalog/books/book-1/status': 'ready', 'book_source_upload_accounts/account-1/assemblyBooks/book-1/original-1': null,
    }); });
    await assertFails(db.ref(catalog).set(row()));
  });

  it('accepts the exact active component document pin and rejects another ready descriptor', async () => {
    const document = createComponentStudentDocument({ sourceVersionId: 'combined-1', descriptorRevision: 1,
      sha256Hex: 'b'.repeat(64), byteSize: 1024, physicalPageCount: 2, compositionFingerprint: 'composition-1', components: [
        { sourceKey: 'one', sourceVersionId: 'source-1', sourceOrder: 1, ownerNodeKey: 'unit-1', localPageCount: 1, combinedStartPage: 1, combinedEndPage: 1 },
        { sourceKey: 'two', sourceVersionId: 'source-2', sourceOrder: 2, ownerNodeKey: 'unit-1', localPageCount: 1, combinedStartPage: 2, combinedEndPage: 2 },
      ] });
    await env.withSecurityRulesDisabled(async (context) => { await context.database().ref().update({
      'material_catalog/books/book-1/sourceSetRevision': 1,
      'material_catalog/books/book-1/setupActivations': [{ sourceSetRevision: 1, studentDocument: { sourceVersionId: document.sourceVersionId, descriptorRevision: document.descriptorRevision } }],
      [`${publication}/versions/manifest-1/strategy`]: 'component_pdfs',
      [`${publication}/student_documents/${document.sourceVersionId}`]: document,
      'book_source_upload_accounts/account-1/assemblyBooks/book-1/combined-1': {
        ownerId: 'teacher-1', verifiedUsable: true, studentSafeStatus: 'ready', purpose: 'student-document', checksum: { value: document.sha256Hex }, physicalPageCount: 2,
      },
    }); });
    const combined = { ...row(), sourceStrategy: 'component_pdfs', sourceVersionId: document.sourceVersionId,
      descriptorRevision: 1, byteSize: document.byteSize, sha256Hex: document.sha256Hex };
    const db = env.authenticatedContext('teacher-1', claim()).database();
    await assertSucceeds(db.ref(catalog).set(combined));
    await assertFails(db.ref(catalog).set({ ...combined, descriptorRevision: 2 }));
    await assertFails(env.authenticatedContext('teacher-1', { ...claim(), book_public_readiness_setupActivationIndex: '1' }).database().ref(catalog).set(combined));
  });
});
