import { describe, expect, it } from 'vitest';
import { createBookSubmissionCommitAdapter, createBookSubmissionWorkerHandlers } from '../src/upload-worker/book-submission/worker.ts';
import { createInMemoryBookSubmissionRepository } from '../src/upload-worker/book-submission/repository.ts';
import { createBookRouter } from '../src/upload-worker/book-router.ts';

const fingerprint = 'a'.repeat(64);
const request = (body: unknown) => new Request('https://worker.test/v1/book-submissions', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const authoring = { strategy: 'full', pdfs: [{ sourceKey: 'full' }], structureJson: '{}', unitsJson: '{}', pageMappingJson: '{}', pdfPageCounts: { full: 1 } };
const sourceReceipts = [{ sourceKey: 'full', sourceVersionId: 'source-1', purpose: 'book-source', sha256Hex: fingerprint, byteSize: 10, physicalPageCount: 1, verifiedUsable: true, studentSafeStatus: 'ready' }];
const commitBody = { fingerprint, metadata: { title: 'Draft' }, authoring, sourceReceipts };
const componentPreparationPayload = { fingerprint, authoring: { strategy: 'component' }, sourceReceipts: [{}], descriptorRevision: 1 };
const componentArtifact = (operationId: string, bookId: string) => ({
  schemaVersion: 1, kind: 'component-pdf-prepared-artifact', operationId,
  ownerId: 'teacher-1', bookId, fingerprint, active: false,
  sourceSet: { sourceStrategy: 'component_pdfs', sources: [] }, sourceReceipts: [],
  composition: { sha256Hex: fingerprint, mapping: [], inputManifest: [] },
  studentDocument: { sourceVersionId: 'student-1', sha256Hex: fingerprint, byteSize: 1, physicalPageCount: 1, verifiedUsable: true, studentSafeStatus: 'ready' },
  descriptor: { sourceVersionId: 'student-1', descriptorRevision: 1, sha256Hex: fingerprint, byteSize: 1, physicalPageCount: 1, compositionFingerprint: fingerprint, components: [] },
} as any);

describe('Book submission worker contract', () => {
  it('binds operation ownership and replays the committed receipt', async () => {
    const repository = createInMemoryBookSubmissionRepository({
      allocateOperationId: () => 'submission-1',
      allocateBookId: () => 'book-1',
    });
    let preparedComponent: unknown = 'unset';
    const commit = async (input: { preparedComponent?: unknown }) => { preparedComponent = input.preparedComponent; };
    const handlers = createBookSubmissionWorkerHandlers({ repository, commitAdapter: commit });
    const started = await handlers.begin({
      request: request({ fingerprint, idempotencyKey: 'draft-1' }),
      env: {}, uid: 'teacher-1',
    });
    const operationId = (started.body as { operation: { operationId: string } }).operation.operationId;

    const committed = await handlers.commit({
      request: request(commitBody), env: {}, uid: 'teacher-1', operationId,
    });
    expect(committed.body).toMatchObject({ status: 'committed', receipt: { finalBookId: 'book-1' } });
    expect(preparedComponent).toBeUndefined();

    const replayed = await handlers.commit({
      request: request(commitBody), env: {}, uid: 'teacher-1', operationId,
    });
    expect(replayed.body).toMatchObject({ status: 'replayed', receipt: { operationId } });
  });

  it('rejects an operation from another owner', async () => {
    const repository = createInMemoryBookSubmissionRepository({ allocateOperationId: () => 'submission-2' });
    const handlers = createBookSubmissionWorkerHandlers({ repository });
    const started = await handlers.begin({
      request: request({ fingerprint, idempotencyKey: 'draft-2' }), env: {}, uid: 'teacher-1',
    });
    const operationId = (started.body as { operation: { operationId: string } }).operation.operationId;
    const status = await handlers.status({
      request: new Request('https://worker.test/v1/book-submissions/status'),
      env: {}, uid: 'teacher-2', operationId,
    });
    expect(status.init.status).toBe(403);
    expect(status.body).toEqual({ code: 'operation_owner_mismatch' });
  });

  it('rejects unknown request fields before beginning an operation', async () => {
    const handlers = createBookSubmissionWorkerHandlers({
      repository: createInMemoryBookSubmissionRepository(),
    });
    const result = await handlers.begin({
      request: request({ fingerprint, idempotencyKey: 'strict', extra: true }),
      env: {}, uid: 'teacher-1',
    });
    expect(result.init.status).toBe(400);
    expect(result.body).toEqual({ code: 'invalid_input' });
    for (const field of ['serverValidation', 'previewApproval']) {
      const rejected = await handlers.commit({
        request: request({ ...commitBody, [field]: { approved: true } }), env: {}, uid: 'teacher-1', operationId: 'submission-1',
      });
      expect(rejected.init.status).toBe(400);
      expect(rejected.body).toEqual({ code: 'invalid_input' });
    }
  });

  it('releases a failed commit lease for a corrected retry', async () => {
    const repository = createInMemoryBookSubmissionRepository({ allocateOperationId: () => 'submission-retry' });
    let attempts = 0;
    const handlers = createBookSubmissionWorkerHandlers({
      repository,
      commitAdapter: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('temporary');
      },
    });
    const started = await handlers.begin({
      request: request({ fingerprint, idempotencyKey: 'retry' }), env: {}, uid: 'teacher-1',
    });
    const operationId = (started.body as { operation: { operationId: string } }).operation.operationId;
    const failed = await handlers.commit({ request: request(commitBody), env: {}, uid: 'teacher-1', operationId });
    expect(failed.init.status).toBe(503);
    const retried = await handlers.commit({ request: request(commitBody), env: {}, uid: 'teacher-1', operationId });
    expect(retried.body).toMatchObject({ status: 'committed' });
  });

  it('is reachable only through the authenticated canonical router', async () => {
    const repository = createInMemoryBookSubmissionRepository({ allocateOperationId: () => 'submission-router', allocateBookId: () => 'book-router' });
    const router = createBookRouter({
      firebaseVerifier: { verifyAuthorizationHeader: async (header) => header === 'Bearer valid'
        ? { valid: true, uid: 'teacher-router' } : { valid: false } },
      routeHandlers: { bookSubmission: { repository, commitAdapter: async () => undefined } },
    });
    const env = {
      BOOK_SUBMISSION_ROUTES_ENABLED: 'enabled',
      BOOK_SUBMISSION_SERVICE_IDENTITY: 'worker@project.iam.gserviceaccount.com',
      BOOK_SUBMISSION_GOOGLE_SA_KEY: JSON.stringify({ client_email: 'worker@project.iam.gserviceaccount.com', private_key: 'private' }),
      BOOK_ROUTE_RATE_LIMITER: { limit: async () => ({ success: true }) },
    };
    const response = await router.fetch(new Request('https://worker.test/v1/book-submissions', {
      method: 'POST', headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fingerprint, idempotencyKey: 'router-draft' }),
    }), env);
    expect(response.status).toBe(200);
    expect((await response.json()).operation.ownerId).toBe('teacher-router');
    const denied = await router.fetch(new Request('https://worker.test/v1/book-submissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), env);
    expect(denied.status).toBe(401);
  });

  it('keeps production commit behind verified operation-bound source receipts', async () => {
    const adapter = createBookSubmissionCommitAdapter({ readSourceReceipt: async () => true });
    const repository = createInMemoryBookSubmissionRepository({ allocateOperationId: () => 'submission-receipts', allocateBookId: () => 'book-receipts' });
    const handlers = createBookSubmissionWorkerHandlers({ repository, commitAdapter: adapter });
    const started = await handlers.begin({ request: request({ fingerprint, idempotencyKey: 'receipt-draft' }), env: {}, uid: 'teacher-1' });
    const operationId = (started.body as { operation: { operationId: string } }).operation.operationId;
    const missing = await handlers.commit({ request: request({ fingerprint, authoring, sourceReceipts: [] }), env: {}, uid: 'teacher-1', operationId });
    expect(missing.init.status).toBe(409);
    expect(missing.body).toEqual({ code: 'book_submission_source_receipts_required' });
    const committed = await handlers.commit({ request: request(commitBody), env: {}, uid: 'teacher-1', operationId });
    expect(committed.body).toMatchObject({ status: 'committed' });
  });

  it('persists an operation-bound component artifact and replays preparation', async () => {
    const repository = createInMemoryBookSubmissionRepository({ allocateOperationId: () => 'submission-component', allocateBookId: () => 'book-component' });
    let preparations = 0;
    const artifact = componentArtifact('submission-component', 'book-component');
    const handlers = createBookSubmissionWorkerHandlers({ repository, componentPreparationAdapter: async () => { preparations += 1; return artifact; } });
    const started = await handlers.begin({ request: request({ fingerprint, idempotencyKey: 'component-draft' }), env: {}, uid: 'teacher-1' });
    const operationId = (started.body as { operation: { operationId: string } }).operation.operationId;
    const prepared = await handlers.prepareComponent({ request: request(componentPreparationPayload), env: {}, uid: 'teacher-1', operationId });
    expect(prepared.body).toMatchObject({ status: 'prepared', artifact: { active: false, operationId } });
    const replayed = await handlers.prepareComponent({ request: request(componentPreparationPayload), env: {}, uid: 'teacher-1', operationId });
    expect(replayed.body).toMatchObject({ status: 'replayed', artifact: { active: false, operationId } });
    expect(preparations).toBe(1);
  });

  it('passes the prepared artifact through the component-PDF commit route', async () => {
    const repository = createInMemoryBookSubmissionRepository({ allocateOperationId: () => 'submission-component-commit-route', allocateBookId: () => 'book-component-commit-route' });
    const artifact = componentArtifact('submission-component-commit-route', 'book-component-commit-route');
    let received: unknown = undefined;
    const handlers = createBookSubmissionWorkerHandlers({
      repository,
      componentPreparationAdapter: async () => artifact,
      commitAdapter: async (input) => { received = input.preparedComponent; },
    });
    const started = await handlers.begin({ request: request({ fingerprint, idempotencyKey: 'component-commit-route' }), env: {}, uid: 'teacher-1' });
    const operationId = (started.body as { operation: { operationId: string } }).operation.operationId;
    await handlers.prepareComponent({ request: request(componentPreparationPayload), env: {}, uid: 'teacher-1', operationId });
    const committed = await handlers.commit({
      request: request({ ...commitBody, authoring: { ...authoring, strategy: 'component' } }),
      env: {}, uid: 'teacher-1', operationId,
    });
    expect(committed.body).toMatchObject({ status: 'committed' });
    expect(received).toEqual(artifact);
  });

  it('does not persist preparation after cancellation or once commit owns the operation', async () => {
    const repository = createInMemoryBookSubmissionRepository({ allocateOperationId: () => 'submission-component-cancel', allocateBookId: () => 'book-component-cancel' });
    let preparationStarted!: () => void;
    let releasePreparation!: () => void;
    const preparationStartedPromise = new Promise<void>((resolve) => { preparationStarted = resolve; });
    const preparationGate = new Promise<void>((resolve) => { releasePreparation = resolve; });
    let preparations = 0;
    const cancellationArtifact = componentArtifact('submission-component-cancel', 'book-component-cancel');
    const handlers = createBookSubmissionWorkerHandlers({ repository, componentPreparationAdapter: async () => {
      preparations += 1;
      preparationStarted();
      await preparationGate;
      return cancellationArtifact;
    } });
    const started = await handlers.begin({ request: request({ fingerprint, idempotencyKey: 'component-cancel' }), env: {}, uid: 'teacher-1' });
    const operationId = (started.body as { operation: { operationId: string } }).operation.operationId;
    const pending = handlers.prepareComponent({ request: request(componentPreparationPayload), env: {}, uid: 'teacher-1', operationId });
    await preparationStartedPromise;
    const canceled = await handlers.cancel({ request: request({}), env: {}, uid: 'teacher-1', operationId });
    expect(canceled.body).toMatchObject({ status: 'canceled' });
    releasePreparation();
    expect((await pending).body).toEqual({ code: 'invalid_transition' });
    const retried = await handlers.prepareComponent({ request: request(componentPreparationPayload), env: {}, uid: 'teacher-1', operationId });
    expect(retried.body).toEqual({ code: 'invalid_transition' });
    expect(preparations).toBe(1);

    const committingRepository = createInMemoryBookSubmissionRepository({ allocateOperationId: () => 'submission-component-commit', allocateBookId: () => 'book-component-commit' });
    let commitStarted!: () => void;
    let releaseCommit!: () => void;
    const commitStartedPromise = new Promise<void>((resolve) => { commitStarted = resolve; });
    const commitGate = new Promise<void>((resolve) => { releaseCommit = resolve; });
    const committingArtifact = componentArtifact('submission-component-commit', 'book-component-commit');
    const committingHandlers = createBookSubmissionWorkerHandlers({
      repository: committingRepository,
      commitAdapter: async () => { commitStarted(); await commitGate; },
      componentPreparationAdapter: async () => committingArtifact,
    });
    const committingStarted = await committingHandlers.begin({ request: request({ fingerprint, idempotencyKey: 'component-commit' }), env: {}, uid: 'teacher-1' });
    const committingOperationId = (committingStarted.body as { operation: { operationId: string } }).operation.operationId;
    const commit = committingHandlers.commit({ request: request(commitBody), env: {}, uid: 'teacher-1', operationId: committingOperationId });
    await commitStartedPromise;
    const blocked = await committingHandlers.prepareComponent({ request: request(componentPreparationPayload), env: {}, uid: 'teacher-1', operationId: committingOperationId });
    expect(blocked.body).toEqual({ code: 'invalid_transition' });
    releaseCommit();
    expect((await commit).body).toMatchObject({ status: 'committed' });
  });
});
