import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import generatedDatabaseRulesSource from '../../database.rules.json?raw';
import bindingFragmentSource from '../src/upload-worker/book-rules/fragments/118C.json?raw';
import { exportJWK, generateKeyPair, importSPKI, jwtVerify, SignJWT } from 'jose';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { createUploadWorker } from '../worker.js';
import { BOOK_ASSEMBLY_ACTIVITY_BINDING_ROOT } from '../src/upload-worker/book-assembly/unit-activity-binding-repository.ts';
import { BOOK_ASSEMBLY_PREVIEW_APPROVAL_ROOT } from '../src/upload-worker/book-assembly/preview-approval-repository.ts';
import { BOOK_SOURCE_ASSEMBLY_PROJECTION_SOURCE_PATH, MATERIAL_BOOK_PATH } from '../src/upload-worker/book-assembly/book-source-authority-reader.ts';
import type { BookAssemblyCandidateRecord } from '../../src/services/book-assembly/unitAssembly.types.ts';
import type { EditableActivity } from '../../src/types/bookActivity.types.ts';

const ownerId = 'teacher-1';
const bookId = 'book-1';
const unitKey = 'unit-1';
const activityKey = 'slot-1';
const sourceKey = 'full';
const sourceVersionId = 'source-v1';
const previewRegistryVersion = 'activity-renderer-manifest-v1@sha256:7be1fce11aa2a739ec10ddab540b6af682db6e8ea9659916b1c9eb878ef690b5';
const operation = (suffix: string): string => `123e4567-e89b-42d3-a456-426614174${suffix}`;

const activity: EditableActivity = {
  schemaVersion: 1, title: 'Verified PDF activity', taskProfile: null, presentationMode: 'structured',
  contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] }, instructions: [{ text: 'Read.' }], stimulus: null, assetRefs: [],
  interaction: { family: 'choice', variant: 'v1' }, answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
  interactions: [{ prompt: 'Choose', options: ['A', 'B'], acceptedOptionIndexes: [0] }], scoring: { mode: 'auto-where-possible' },
};

const sourceSet = { sourceStrategy: 'full_pdf' as const, sources: [{ sourceKey, sourceVersionId, sourceOrder: 1 }] };
const materialBook = { bookId, ownerId, bookMode: 'pdf', status: 'ready', bookRevision: 1, sourceSetRevision: 1, sourceSet };
const manifest = {
  bookId, sourceSet, nodes: [{ nodeKey: unitKey, parentNodeKey: null, nodeType: 'unit', order: 1 }], units: [{ unitKey,
    activitySlots: [{ activityKey, order: 1, contextRequirement: 'required', pageGroupKeys: ['pages-1'] }],
    pageGroups: [{ pageGroupKey: 'pages-1', sourceKey, pages: [1], activityKeys: [activityKey], mode: 'activity' }],
  }],
};

const pathParts = (path: string): string[] => path.split('/').filter(Boolean);
const clone = <T>(value: T): T => structuredClone(value);
const readTree = (tree: Record<string, unknown>, path: string): unknown => pathParts(path).reduce<unknown>((current, part) => (
  current && typeof current === 'object' && !Array.isArray(current)
    ? (current as Record<string, unknown>)[part]
    : undefined
), tree) ?? null;
const writeTree = (tree: Record<string, unknown>, path: string, value: unknown): void => {
  const parts = pathParts(path);
  let parent = tree;
  for (const part of parts.slice(0, -1)) {
    const next = parent[part];
    if (!next || typeof next !== 'object' || Array.isArray(next)) parent[part] = {};
    parent = parent[part] as Record<string, unknown>;
  }
  parent[parts.at(-1)!] = clone(value);
};

const privateKey = (): string => generateKeyPairSync('rsa', { modulusLength: 2048 })
  .privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
const publicKey = (privateKeyPem: string): string => createPublicKey(privateKeyPem)
  .export({ format: 'pem', type: 'spki' }).toString();
let firebaseUserKeyPair: Promise<Awaited<ReturnType<typeof generateKeyPair>>> | undefined;
const firebaseUserKeys = () => (firebaseUserKeyPair ??= generateKeyPair('RS256'));

/** Firebase wire JSON omits nullable and empty-array object fields. */
const firebaseWireValue = (value: unknown): unknown => {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(firebaseWireValue);
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => {
    const encoded = firebaseWireValue(child);
    return encoded === null || (Array.isArray(encoded) && encoded.length === 0) ? [] : [[key, encoded]];
  }));
};

/** Deterministic Firebase REST, token-exchange, and Firebase-JWKS transport. */
const firebase = (tree: Record<string, unknown>, jwk: JsonWebKey, options: {
  readonly customTokenVerificationKey: CryptoKey;
  readonly serviceIdentities: readonly string[];
  readonly bindingPath: string;
  readonly bindingWriteFailures: { remaining: number };
}) => {
  const revisions = new Map<string, number>();
  const requests: Array<{
    path: string; method: string; auth: string | null; etagRequested: boolean; ifMatch: string | null; dataWasNull: boolean;
  }> = [];
  const exchangedClaims: Array<Record<string, unknown>> = [];
  const exchangedCustomTokens: Array<{
    iss?: string; sub?: string; aud?: string | string[]; uid?: string; claims: Record<string, unknown>;
  }> = [];
  const etag = (path: string) => `\"${revisions.get(path) ?? 0}\"`;
  const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === 'www.googleapis.com') return Response.json({ keys: [jwk] });
    if (url.hostname === 'identitytoolkit.googleapis.com') {
      const customToken = JSON.parse(String(init?.body ?? '{}')) as { token?: unknown };
      if (typeof customToken.token === 'string') {
        const verified = await jwtVerify(customToken.token, options.customTokenVerificationKey, {
          issuer: [...options.serviceIdentities],
          audience: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
        });
        const claims = verified.payload.claims;
        const scopedClaims = claims && typeof claims === 'object' && !Array.isArray(claims)
          ? claims as Record<string, unknown> : {};
        exchangedClaims.push(scopedClaims);
        exchangedCustomTokens.push({
          iss: verified.payload.iss, sub: verified.payload.sub, aud: verified.payload.aud,
          uid: typeof verified.payload.uid === 'string' ? verified.payload.uid : undefined, claims: scopedClaims,
        });
      }
      return Response.json({ idToken: `firebase-token-${requests.length}`, expiresIn: '3600' });
    }
    const path = decodeURIComponent(url.pathname.replace(/^\/+|\.json$/gu, ''));
    const method = String(init?.method ?? 'GET');
    const headers = new Headers(init?.headers);
    requests.push({
      path, method, auth: url.searchParams.get('auth'),
      etagRequested: headers.get('x-firebase-etag') === 'true', ifMatch: headers.get('if-match'),
      dataWasNull: readTree(tree, path) === null,
    });
    if (method === 'GET') {
      return new Response(JSON.stringify(readTree(tree, path)), { status: 200, headers: { etag: etag(path) } });
    }
    if (method === 'PUT') {
      if (headers.get('if-match') !== etag(path)) return new Response('', { status: 412 });
      if (path === options.bindingPath && options.bindingWriteFailures.remaining > 0) {
        options.bindingWriteFailures.remaining -= 1;
        throw new Error('simulated_binding_transport_failure');
      }
      writeTree(tree, path, firebaseWireValue(JSON.parse(String(init?.body ?? 'null')) as unknown));
      revisions.set(path, (revisions.get(path) ?? 0) + 1);
      return new Response('{}', { status: 200, headers: { etag: etag(path) } });
    }
    if (method === 'PATCH') {
      const updates = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      for (const [relativePath, value] of Object.entries(updates)) {
        writeTree(tree, `${path}/${relativePath}`, firebaseWireValue(value));
      }
      revisions.set(path, (revisions.get(path) ?? 0) + 1);
      return new Response('{}', { status: 200 });
    }
    return new Response('', { status: 405 });
  });
  return { fetchImpl, requests, exchangedClaims, exchangedCustomTokens };
};

const payload = async (response: Response): Promise<Record<string, unknown>> => response.json() as Promise<Record<string, unknown>>;

type GeneratedBindingRules = {
  rules: {
    book_assembly_activity_bindings: {
      owners: {
        $ownerId: {
          books: {
            $bookId: {
              units: {
                $unitKey: {
                  activities: { $activityKey: { '.read': string } };
                };
              };
            };
          };
        };
      };
    };
  };
};

describe('production-normal #59 workflow', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks(); });

  it('uses default createUploadWorker fetch/router composition from durable PDF authority through publication fences', async () => {
    const assemblyKey = privateKey();
    const assemblyIdentity = 'book-assembly@example.test';
    const authoringIdentity = 'book-authoring@example.test';
    const accountId = 'account-1';
    const bindingPath = `${BOOK_ASSEMBLY_ACTIVITY_BINDING_ROOT}/${ownerId}/books/${bookId}/units/${unitKey}/activities/${activityKey}`;
    const sourcePath = BOOK_SOURCE_ASSEMBLY_PROJECTION_SOURCE_PATH(accountId, bookId, sourceKey);
    const siblingAuthorityPath = 'book_source_upload_accounts/account-1/assemblyBooks/book-2/source-sibling';
    const unrelatedEnrollmentPath = 'course_enrollments/legacy-enrollment-1';
    const unrelatedReleasePath = 'course_book_authority/releases/course-1/module-1/student-1';
    const tree: Record<string, unknown> = {};
    writeTree(tree, `users/${ownerId}`, { role: 'teacher', status: 'active' });
    writeTree(tree, MATERIAL_BOOK_PATH(bookId), materialBook);
    writeTree(tree, sourcePath, { ownerId, bookId, sourceKey, sourceVersionId, physicalPageCount: 1, verifiedUsable: true });
    // These are protected, unrelated roots from the generated #102 rules. The
    // production composition must never replace or validate them as its own.
    writeTree(tree, unrelatedEnrollmentPath, {
      enrollmentId: 'legacy-enrollment-1', courseId: 'course-1', studentId: 'student-1', status: 'active', revision: 7,
    });
    writeTree(tree, unrelatedReleasePath, { released: true, revision: 4 });
    writeTree(tree, siblingAuthorityPath, {
      ownerId: 'teacher-2', bookId: 'book-2', sourceKey: 'source-sibling', sourceVersionId: 'source-sibling-v1',
      physicalPageCount: 8, verifiedUsable: true,
    });
    const unrelatedAuthoritiesBefore = clone({
      enrollment: readTree(tree, unrelatedEnrollmentPath), release: readTree(tree, unrelatedReleasePath),
      sibling: readTree(tree, siblingAuthorityPath),
    });

    const { privateKey: firebaseSigningKey, publicKey: firebasePublicKey } = await firebaseUserKeys();
    const firebaseJwk = await exportJWK(firebasePublicKey);
    firebaseJwk.kid = 'production-normal-user-key';
    const bindingWriteFailures = { remaining: 0 };
    const transport = firebase(tree, firebaseJwk, {
      customTokenVerificationKey: await importSPKI(publicKey(assemblyKey), 'RS256'),
      serviceIdentities: [assemblyIdentity, authoringIdentity], bindingPath, bindingWriteFailures,
    });
    globalThis.fetch = transport.fetchImpl;
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const firebaseIdToken = await new SignJWT({ email: 'teacher@example.test', email_verified: true })
      .setProtectedHeader({ alg: 'RS256', kid: firebaseJwk.kid })
      .setIssuer('https://securetoken.google.com/project-1')
      .setAudience('project-1')
      .setSubject(ownerId)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(firebaseSigningKey);
    const env = {
      FIREBASE_DB_URL: 'https://firebase.test', FIREBASE_PROJECT_ID: 'project-1', FIREBASE_WEB_API_KEY: 'web-key',
      BOOK_SOURCE_UPLOAD_ACCOUNT_ID: accountId, BOOK_ASSEMBLY_PREVIEW_REGISTRY_VERSION: previewRegistryVersion,
      BOOK_ASSEMBLY_SERVICE_IDENTITY: assemblyIdentity, BOOK_ASSEMBLY_GOOGLE_SA_KEY: JSON.stringify({ client_email: assemblyIdentity, private_key: assemblyKey }),
      BOOK_ACTIVITY_AUTHORING_SERVICE_IDENTITY: authoringIdentity, BOOK_ACTIVITY_AUTHORING_GOOGLE_SA_KEY: JSON.stringify({ client_email: authoringIdentity, private_key: assemblyKey }),
      BOOK_ASSEMBLY_ROUTES_ENABLED: 'enabled', BOOK_ASSEMBLY_MUTATIONS_ENABLED: 'true',
      BOOK_ACTIVITY_AUTHORING_ROUTES_ENABLED: 'enabled', BOOK_FULL_PDF_PUBLICATION_ROUTES_ENABLED: 'enabled', BOOK_FULL_PDF_PUBLICATION_ENABLED: 'true',
      BOOK_ROUTE_RATE_LIMITER: { limit: async () => ({ success: true }) },
      BOOK_ACTIVITY_ROLLOUT_ENVIRONMENT: 'test',
      BOOK_ACTIVITY_ROLLOUT_CONFIG_JSON: JSON.stringify({ schemaVersion: 'v1', environment: 'test', revision: 'production-normal-59', issuedAt: new Date(Date.now() - 60_000).toISOString(), expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(), actions: { create: 'deny', upload: 'deny', publish: 'deny', 'assign-place': 'deny', 'launch-delivery': 'deny', mutation: 'allow' } }),
      BOOK_PILOT_SCOPE_ENFORCEMENT: 'enabled', BOOK_PILOT_SCOPE_ENVIRONMENT: 'test',
      BOOK_PILOT_SCOPE_CONFIG_JSON: JSON.stringify({ schemaVersion: 'v1', environment: 'test', revision: 'production-normal-59', issuedAt: new Date(Date.now() - 60_000).toISOString(), expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(), teacherId: ownerId, bookId, assignmentId: 'assignment-1', studentIds: ['student-1'], maxStudents: 30 }),
    };
    const worker = createUploadWorker() as { fetch: (request: Request, workerEnv: typeof env) => Promise<Response> };
    const request = (path: string, body: unknown): Request => new Request(`https://worker.test${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${firebaseIdToken}`, Origin: 'http://localhost:5173', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const fetchRoute = async (path: string, body: unknown): Promise<{ response: Response; body: Record<string, unknown> }> => {
      const response = await worker.fetch(request(path, body), env);
      return { response, body: await payload(response) };
    };
    const candidateCreatePath = `/book-assembly/books/${bookId}/units/${unitKey}/candidates`;

    // Preseed only the durable result of verified source attachment; this test
    // intentionally does not recreate the separate source upload system.
    expect(readTree(tree, MATERIAL_BOOK_PATH(bookId))).toMatchObject({ status: 'ready', sourceSet });
    expect(readTree(tree, sourcePath)).toMatchObject({ sourceVersionId, verifiedUsable: true });

    writeTree(tree, sourcePath, { ownerId, bookId, sourceKey, sourceVersionId: 'wrong-source', physicalPageCount: 1, verifiedUsable: true });
    const wrongSourceCreate = await fetchRoute(candidateCreatePath, {
      operationId: operation('001'), bookId, unitKey, expectedBookRevision: 1, expectedSourceSetRevision: 1, manifest,
    });
    expect(wrongSourceCreate.response.status).toBe(404);
    expect(wrongSourceCreate.body).toEqual({ status: 'not-found' });
    expect(readTree(tree, `book_assembly/books/${bookId}/units/${unitKey}`)).toBeNull();
    writeTree(tree, sourcePath, { ownerId, bookId, sourceKey, sourceVersionId, physicalPageCount: 1, verifiedUsable: true });

    const created = await fetchRoute(candidateCreatePath, {
      operationId: operation('002'), bookId, unitKey, expectedBookRevision: 1, expectedSourceSetRevision: 1, manifest,
    });
    expect(created.response.status).toBe(200);
    expect(created.body).toMatchObject({ status: 'created', candidate: { lifecycle: 'draft', revision: 1 } });
    const candidateId = String((created.body.candidate as BookAssemblyCandidateRecord).candidateId);
    const candidatePath = `${candidateCreatePath}/${candidateId}`;
    const validated = await fetchRoute(`${candidatePath}/validate`, {
      operationId: operation('003'), bookId, unitKey, candidateId, expectedCandidateRevision: 1,
    });
    expect(validated.response.status).toBe(200);
    expect(validated.body).toMatchObject({ status: 'validated', candidate: { candidateId, lifecycle: 'validated', revision: 2 } });

    const staged = await fetchRoute('/book-activity-authoring/stage', {
      operationId: operation('004'), expectedRevision: 0, bookId, content: activity,
    });
    expect(staged.response.status).toBe(200);
    const activityCandidateId = String(staged.body.candidateId);
    const authoringValidated = await fetchRoute('/book-activity-authoring/validate', {
      operationId: operation('005'), candidateId: activityCandidateId, expectedRevision: 1,
    });
    expect(authoringValidated.response.status).toBe(200);
    // The Activity CAS below succeeds before this deliberately failed binding
    // PUT. The retry must repair that exact receipt instead of saving again.
    bindingWriteFailures.remaining = 1;
    const incomplete = await fetchRoute('/book-activity-authoring/save-draft', {
      operationId: operation('006'), candidateId: activityCandidateId, expectedRevision: 2,
      unitActivityBinding: { unitKey, activityKey },
    });
    expect(incomplete.response.status).toBe(202);
    expect(incomplete.body).toMatchObject({
      status: 'binding-incomplete', retryable: true, candidateId: activityCandidateId,
      binding: { phase: 'binding-pending', ownerId, bookId, unitKey, activityKey },
    });
    const activityId = String(incomplete.body.activityId);
    const authoringRootPath = `book_activity_authoring/owners/${ownerId}`;
    const persistedAfterFailure = readTree(tree, authoringRootPath) as Record<string, Record<string, unknown>>;
    expect(Object.keys(persistedAfterFailure.activities ?? {})).toHaveLength(1);
    expect(Object.keys(persistedAfterFailure.candidates ?? {})).toHaveLength(1);
    expect(readTree(tree, bindingPath)).toBeNull();
    // These omissions model RTDB wire JSON. The replay's reads must hydrate
    // them before validating, binding, previewing, and publishing.
    const rawActivity = (persistedAfterFailure.activities?.[activityId] ?? {}) as Record<string, unknown>;
    expect(rawActivity.editableDraft).not.toHaveProperty('taskProfile');
    expect(rawActivity.editableDraft).not.toHaveProperty('stimulus');
    expect(rawActivity.editableDraft).not.toHaveProperty('assetRefs');
    expect(rawActivity.draft).not.toHaveProperty('taskProfile');
    expect(rawActivity.draft).not.toHaveProperty('stimulus');
    expect(rawActivity.draft).not.toHaveProperty('assetRefs');

    const saved = await fetchRoute('/book-activity-authoring/save-draft', {
      operationId: operation('006'), candidateId: activityCandidateId, expectedRevision: 2,
      unitActivityBinding: { unitKey, activityKey },
    });
    expect(saved.response.status).toBe(200);
    expect(saved.body).toMatchObject({
      status: 'saved', replayed: true, activityId, candidateId: activityCandidateId, candidateRevision: 3,
      binding: { phase: 'complete' },
    });
    expect(readTree(tree, bindingPath)).toMatchObject({
      activityId: saved.body.activityId, candidateId: activityCandidateId, candidateRevision: 3, candidateLifecycle: 'saved',
    });
    const persistedAfterRepair = readTree(tree, authoringRootPath) as Record<string, Record<string, unknown>>;
    expect(Object.keys(persistedAfterRepair.activities ?? {})).toHaveLength(1);
    expect(Object.keys(persistedAfterRepair.candidates ?? {})).toHaveLength(1);

    const previewPath = `${candidatePath}/preview`;
    const preview = await fetchRoute(previewPath, { expectedCandidateRevision: 2 });
    expect(preview.response.status).toBe(200);
    expect(preview.body).toMatchObject({ preview: { registryVersion: previewRegistryVersion, candidateId, candidateRevision: 2 } });
    const stalePreview = await fetchRoute(previewPath, { expectedCandidateRevision: 1 });
    expect(stalePreview.response.status).toBe(409);
    expect(stalePreview.body).toEqual({ code: 'preview_candidate_stale' });

    writeTree(tree, sourcePath, null);
    const wrongSourcePreview = await fetchRoute(previewPath, { expectedCandidateRevision: 2 });
    expect(wrongSourcePreview.response.status).toBe(403);
    expect(wrongSourcePreview.body).toEqual({ code: 'preview_forbidden' });
    writeTree(tree, sourcePath, { ownerId, bookId, sourceKey, sourceVersionId, physicalPageCount: 1, verifiedUsable: true });

    const approved = await fetchRoute(`${candidatePath}/approve`, { expectedCandidateRevision: 2 });
    expect(approved.response.status).toBe(200);
    const approval = approved.body.approval as { approvalId: string; approvalRevision: number; approvedAt: string; expiresAt: string };
    const approvalPath = `${BOOK_ASSEMBLY_PREVIEW_APPROVAL_ROOT}/${bookId}/units/${unitKey}/approvals/${approval.approvalId}`;
    expect(readTree(tree, approvalPath)).toMatchObject({ candidateId, candidateRevision: 2, registryVersion: previewRegistryVersion, actorId: ownerId });

    const publicationPath = '/book-assembly/full-pdf-publications';
    const publicationRequest = {
      bookId, unitKey, candidateId, expectedCandidateRevision: 2,
      expectedCurrentPublicationId: null, expectedBookRevision: 1, expectedSourceSetRevision: 1,
      previewApproval: { approvalId: approval.approvalId, approvalRevision: approval.approvalRevision, approvedAt: approval.approvedAt, expiresAt: approval.expiresAt },
    };
    const published = await fetchRoute(publicationPath, publicationRequest);
    expect(published.response.status).toBe(200);
    expect(published.body).toMatchObject({ result: { status: 'published' } });
    expect(readTree(tree, bindingPath)).toMatchObject({
      activityId: saved.body.activityId, candidateId: activityCandidateId, candidateRevision: 3,
      activityVersion: 1,
    });

    // Both failures are evaluated before a durable publication mutation.
    const candidateScopePath = `book_assembly/books/${bookId}/units/${unitKey}/candidates/${candidateId}`;
    const validatedCandidate = readTree(tree, candidateScopePath) as BookAssemblyCandidateRecord;
    writeTree(tree, candidateScopePath, { ...validatedCandidate, revision: 3 });
    const stalePublication = await fetchRoute(publicationPath, publicationRequest);
    expect(stalePublication.response.status).toBe(422);
    writeTree(tree, candidateScopePath, validatedCandidate);
    const revokePath = `${candidatePath}/approvals/${approval.approvalId}/revoke`;
    const revoked = await fetchRoute(revokePath, { expectedCandidateRevision: 2 });
    expect(revoked.response.status).toBe(200);
    expect(revoked.body).toMatchObject({ status: 'revoked', revocation: { approvalId: approval.approvalId, bookId, unitKey, actorId: ownerId } });
    const revokedReplay = await fetchRoute(revokePath, { expectedCandidateRevision: 2 });
    expect(revokedReplay.response.status).toBe(200);
    expect(revokedReplay.body).toMatchObject({ status: 'replayed', revocation: { approvalId: approval.approvalId } });
    const revokedPublication = await fetchRoute(publicationPath, publicationRequest);
    expect(revokedPublication.response.status).toBe(422);

    expect(transport.requests.some((entry) => entry.path === `book_source_upload_accounts/${accountId}/assemblyBooks/${bookId}`)).toBe(false);
    expect(transport.requests).toContainEqual(expect.objectContaining({
      path: bindingPath, method: 'GET', etagRequested: true, dataWasNull: true,
    }));
    expect(transport.requests).toContainEqual(expect.objectContaining({
      path: bindingPath, method: 'PUT', ifMatch: '"0"',
    }));
    const bindingClaims = transport.exchangedClaims.filter((claims) => claims.book_assembly_activity_binding_service === true);
    expect(bindingClaims).toContainEqual({
      book_assembly_activity_binding_service: true,
      book_assembly_activity_binding_ownerId: ownerId,
      book_assembly_activity_binding_bookId: bookId,
      book_assembly_activity_binding_unitKey: unitKey,
      book_assembly_activity_binding_activityKey: activityKey,
    });
    expect(transport.exchangedCustomTokens.filter((token) => token.claims.book_assembly_activity_binding_service === true)).toContainEqual({
      iss: assemblyIdentity, sub: assemblyIdentity,
      aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit', uid: ownerId,
      claims: {
        book_assembly_activity_binding_service: true,
        book_assembly_activity_binding_ownerId: ownerId,
        book_assembly_activity_binding_bookId: bookId,
        book_assembly_activity_binding_unitKey: unitKey,
        book_assembly_activity_binding_activityKey: activityKey,
      },
    });
    expect(transport.requests.every((entry) => entry.auth?.startsWith('firebase-token-') ?? false)).toBe(true);
    expect({
      enrollment: readTree(tree, unrelatedEnrollmentPath), release: readTree(tree, unrelatedReleasePath),
      sibling: readTree(tree, siblingAuthorityPath),
    }).toEqual(unrelatedAuthoritiesBefore);

    // The in-memory REST transport deliberately does not reimplement Firebase
    // rules. Bind this harness to the generated #118C identity and exact-leaf
    // claim shape; the real emulator suite executes those rules separately.
    const bindingFragment = JSON.parse(bindingFragmentSource) as { ticketId: string; owner: { serviceIdentity: string }; operations: Array<{ path: string; rule: string; expression: string }> };
    const generatedRules = JSON.parse(generatedDatabaseRulesSource) as GeneratedBindingRules;
    const generatedBindingRead = generatedRules.rules.book_assembly_activity_bindings.owners.$ownerId.books.$bookId
      .units.$unitKey.activities.$activityKey['.read'] as string;
    expect(bindingFragment).toMatchObject({ ticketId: '118C', owner: { serviceIdentity: 'book_assembly_service' } });
    expect(bindingFragment.operations).toContainEqual(expect.objectContaining({
      path: 'book_assembly_activity_bindings/owners/$ownerId/books/$bookId/units/$unitKey/activities/$activityKey', rule: '.read',
    }));
    for (const claim of [
      'book_assembly_activity_binding_service == true', 'book_assembly_activity_binding_ownerId == $ownerId',
      'book_assembly_activity_binding_bookId == $bookId', 'book_assembly_activity_binding_unitKey == $unitKey',
      'book_assembly_activity_binding_activityKey == $activityKey', '!data.exists()',
    ]) expect(generatedBindingRead).toContain(claim);
  });
});

const rtdbEmulatorHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
let rtdbRules: RulesTestEnvironment | undefined;
const emulatorProjectId = 'demo-prd0062-production-normal-worker';
const generatedDatabaseRules = generatedDatabaseRulesSource;
const jwtSegment = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');
/** The RTDB emulator accepts Firebase-emulator ID tokens with this documented unsigned test shape. */
const emulatorIdToken = (uid: string, claims: Record<string, unknown>): string => {
  const now = Math.floor(Date.now() / 1000);
  return `${jwtSegment({ alg: 'none', typ: 'JWT' })}.${jwtSegment({
    iss: `https://securetoken.google.com/${emulatorProjectId}`, aud: emulatorProjectId,
    auth_time: now, iat: now, exp: now + 3600, sub: uid, user_id: uid,
    firebase: { identities: {}, sign_in_provider: 'custom' }, ...claims,
  })}.`;
};

if (rtdbEmulatorHost) {
  describe('production-normal #59 Worker REST contract against generated RTDB rules', () => {
    afterAll(async () => { await rtdbRules?.cleanup(); });

    it('uses default composition and signed token exchange for binding, approval, publication, and revocation leaves under real generated rules', async () => {
      rtdbRules = await initializeTestEnvironment({
        projectId: emulatorProjectId,
        database: { rules: generatedDatabaseRules },
      });
      await rtdbRules.clearDatabase();
      const assemblyKey = privateKey();
      const assemblyIdentity = 'book-assembly@example.test';
      const authoringIdentity = 'book-authoring@example.test';
      const accountId = 'account-1';
      const bindingPath = `${BOOK_ASSEMBLY_ACTIVITY_BINDING_ROOT}/${ownerId}/books/${bookId}/units/${unitKey}/activities/${activityKey}`;
      const sourcePath = BOOK_SOURCE_ASSEMBLY_PROJECTION_SOURCE_PATH(accountId, bookId, sourceKey);
      const seed = async (path: string, value: unknown): Promise<void> => {
        await rtdbRules!.withSecurityRulesDisabled(async (context) => { await context.database().ref(path).set(value); });
      };
      const read = async (path: string): Promise<unknown> => rtdbRules!.withSecurityRulesDisabled(async (context) => (
        await context.database().ref(path).once('value')
      ).val());
      await rtdbRules.withSecurityRulesDisabled(async (context) => {
        await context.database().ref().update({
          [`users/${ownerId}`]: { role: 'teacher', status: 'active' },
          [`${MATERIAL_BOOK_PATH(bookId)}`]: materialBook,
          [sourcePath]: { ownerId, bookId, sourceKey, sourceVersionId, physicalPageCount: 1, verifiedUsable: true },
          'course_enrollments/legacy-enrollment-1': { enrollmentId: 'legacy-enrollment-1', courseId: 'course-1', studentId: 'student-1', status: 'active', revision: 7 },
          'course_book_authority/releases/course-1/module-1/student-1': { released: true, revision: 4 },
          'book_source_upload_accounts/account-1/assemblyBooks/book-2/source-sibling': { ownerId: 'teacher-2', bookId: 'book-2', sourceKey: 'source-sibling', sourceVersionId: 'source-sibling-v1', physicalPageCount: 8, verifiedUsable: true },
        });
      });
      const preservedAuthorities = await Promise.all([
        read('course_enrollments/legacy-enrollment-1'), read('course_book_authority/releases/course-1/module-1/student-1'),
        read('book_source_upload_accounts/account-1/assemblyBooks/book-2/source-sibling'),
      ]);

      // These checks execute database.rules.json, rather than mirroring it in
      // the bridge. They use the precise claim tuple minted below for REST.
      const bindingClaims = {
        book_assembly_activity_binding_service: true, book_assembly_activity_binding_ownerId: ownerId,
        book_assembly_activity_binding_bookId: bookId, book_assembly_activity_binding_unitKey: unitKey,
        book_assembly_activity_binding_activityKey: activityKey,
      };
      const exact = rtdbRules.authenticatedContext('binding-service', bindingClaims).database();
      await assertSucceeds(exact.ref(bindingPath).once('value'));
      await assertFails(rtdbRules.authenticatedContext('wrong-owner', { ...bindingClaims, book_assembly_activity_binding_ownerId: 'teacher-2' }).database().ref(bindingPath).once('value'));
      await assertFails(rtdbRules.authenticatedContext('wrong-book', { ...bindingClaims, book_assembly_activity_binding_bookId: 'book-2' }).database().ref(bindingPath).once('value'));
      await assertFails(rtdbRules.authenticatedContext('wrong-unit', { ...bindingClaims, book_assembly_activity_binding_unitKey: 'unit-2' }).database().ref(bindingPath).once('value'));
      await assertFails(rtdbRules.authenticatedContext('wrong-activity', { ...bindingClaims, book_assembly_activity_binding_activityKey: 'slot-2' }).database().ref(bindingPath).once('value'));
      await assertFails(exact.ref(`${bindingPath}-sibling`).once('value'));
      await assertFails(exact.ref(`${BOOK_ASSEMBLY_ACTIVITY_BINDING_ROOT}/${ownerId}/books/${bookId}/units/${unitKey}`).once('value'));
      const canonicalProbePath = 'book_activity/versions/activity-probe/version-probe';
      const canonicalProbeClaims = {
        book_activity_publication_writer_service: true,
        book_activity_publication_writer_ownerId: ownerId,
        book_activity_publication_writer_activityId: 'activity-probe',
        book_activity_publication_writer_activityVersionId: 'version-probe',
      };
      const canonicalProbe = rtdbRules.authenticatedContext('canonical-writer', canonicalProbeClaims).database();
      await assertSucceeds(canonicalProbe.ref(canonicalProbePath).once('value'));
      await assertFails(canonicalProbe.ref('book_activity/versions/activity-probe/version-sibling').once('value'));
      await assertFails(canonicalProbe.ref('book_activity/versions/activity-probe').once('value'));

      const { privateKey: firebaseSigningKey, publicKey: firebasePublicKey } = await firebaseUserKeys();
      const firebaseJwk = await exportJWK(firebasePublicKey);
      firebaseJwk.kid = 'production-normal-user-key';
      const exchanged: Array<Record<string, unknown>> = [];
      const requests: Array<{ path: string; method: string; etagRequested: boolean; ifMatch: string | null }> = [];
      let authoringWireAfterSave: Record<string, unknown> | undefined;
      const bindingWriteFailures = { remaining: 1 };
      const realFetch = globalThis.fetch;
      const bridge = vi.fn<typeof fetch>(async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        if (url.hostname === 'www.googleapis.com') return Response.json({ keys: [firebaseJwk] });
        if (url.hostname === 'identitytoolkit.googleapis.com') {
          const body = JSON.parse(String(init?.body ?? '{}')) as { token?: unknown };
          if (typeof body.token !== 'string') return new Response('', { status: 400 });
          const verified = await jwtVerify(body.token, await importSPKI(publicKey(assemblyKey), 'RS256'), {
            issuer: [assemblyIdentity, authoringIdentity],
            audience: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
          });
          const claims = verified.payload.claims;
          if (!claims || typeof claims !== 'object' || Array.isArray(claims) || typeof verified.payload.uid !== 'string') {
            return new Response('', { status: 400 });
          }
          exchanged.push(claims as Record<string, unknown>);
          return Response.json({ idToken: emulatorIdToken(verified.payload.uid, claims as Record<string, unknown>), expiresIn: '3600' });
        }
        if (url.hostname !== 'firebase.test') return realFetch(input, init);
        const path = decodeURIComponent(url.pathname.replace(/^\/+|\.json$/gu, ''));
        const method = String(init?.method ?? 'GET');
        const headers = new Headers(init?.headers);
        requests.push({ path, method, etagRequested: headers.get('x-firebase-etag') === 'true', ifMatch: headers.get('if-match') });
        if (path === bindingPath && method === 'PUT' && bindingWriteFailures.remaining > 0) {
          bindingWriteFailures.remaining -= 1;
          throw new Error('simulated_binding_transport_failure');
        }
        const emulatorUrl = new URL(`http://${rtdbEmulatorHost}${url.pathname}`);
        emulatorUrl.search = url.search;
        emulatorUrl.searchParams.set('ns', emulatorProjectId);
        const response = await realFetch(emulatorUrl, init);
        if (path === `book_activity_authoring/owners/${ownerId}` && method === 'GET' && response.ok) {
          authoringWireAfterSave = await response.clone().json() as Record<string, unknown>;
        }
        return response;
      });
      globalThis.fetch = bridge;
      vi.spyOn(console, 'info').mockImplementation(() => undefined);
      const firebaseIdToken = await new SignJWT({ email: 'teacher@example.test', email_verified: true })
        .setProtectedHeader({ alg: 'RS256', kid: firebaseJwk.kid })
        .setIssuer(`https://securetoken.google.com/${emulatorProjectId}`)
        .setAudience(emulatorProjectId).setSubject(ownerId).setIssuedAt().setExpirationTime('1h').sign(firebaseSigningKey);
      const env = {
        FIREBASE_DB_URL: 'https://firebase.test', FIREBASE_PROJECT_ID: emulatorProjectId, FIREBASE_WEB_API_KEY: 'emulator-web-key',
        BOOK_SOURCE_UPLOAD_ACCOUNT_ID: accountId, BOOK_ASSEMBLY_PREVIEW_REGISTRY_VERSION: previewRegistryVersion,
        BOOK_ASSEMBLY_SERVICE_IDENTITY: assemblyIdentity, BOOK_ASSEMBLY_GOOGLE_SA_KEY: JSON.stringify({ client_email: assemblyIdentity, private_key: assemblyKey }),
        BOOK_ACTIVITY_AUTHORING_SERVICE_IDENTITY: authoringIdentity, BOOK_ACTIVITY_AUTHORING_GOOGLE_SA_KEY: JSON.stringify({ client_email: authoringIdentity, private_key: assemblyKey }),
        BOOK_ASSEMBLY_ROUTES_ENABLED: 'enabled', BOOK_ASSEMBLY_MUTATIONS_ENABLED: 'true', BOOK_ACTIVITY_AUTHORING_ROUTES_ENABLED: 'enabled',
        BOOK_FULL_PDF_PUBLICATION_ROUTES_ENABLED: 'enabled', BOOK_FULL_PDF_PUBLICATION_ENABLED: 'true',
        BOOK_ROUTE_RATE_LIMITER: { limit: async () => ({ success: true }) }, BOOK_ACTIVITY_ROLLOUT_ENVIRONMENT: 'test',
        BOOK_ACTIVITY_ROLLOUT_CONFIG_JSON: JSON.stringify({ schemaVersion: 'v1', environment: 'test', revision: 'production-normal-emulator', issuedAt: new Date(Date.now() - 60_000).toISOString(), expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(), actions: { create: 'deny', upload: 'deny', publish: 'deny', 'assign-place': 'deny', 'launch-delivery': 'deny', mutation: 'allow' } }),
        BOOK_PILOT_SCOPE_ENFORCEMENT: 'enabled', BOOK_PILOT_SCOPE_ENVIRONMENT: 'test',
        BOOK_PILOT_SCOPE_CONFIG_JSON: JSON.stringify({ schemaVersion: 'v1', environment: 'test', revision: 'production-normal-emulator', issuedAt: new Date(Date.now() - 60_000).toISOString(), expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(), teacherId: ownerId, bookId, assignmentId: 'assignment-1', studentIds: ['student-1'], maxStudents: 30 }),
      };
      const worker = createUploadWorker() as { fetch: (request: Request, workerEnv: typeof env) => Promise<Response> };
      const invoke = async (path: string, body: unknown) => {
        const response = await worker.fetch(new Request(`https://worker.test${path}`, {
          method: 'POST', headers: { Authorization: `Bearer ${firebaseIdToken}`, Origin: 'http://localhost:5173', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }), env);
        return { response, body: await payload(response) };
      };
      try {
        const candidate = await invoke(`/book-assembly/books/${bookId}/units/${unitKey}/candidates`, {
          operationId: operation('101'), bookId, unitKey, expectedBookRevision: 1, expectedSourceSetRevision: 1, manifest,
        });
        expect(candidate.response.status).toBe(200);
        const candidateId = String((candidate.body.candidate as BookAssemblyCandidateRecord).candidateId);
        expect((await invoke(`/book-assembly/books/${bookId}/units/${unitKey}/candidates/${candidateId}/validate`, {
          operationId: operation('102'), bookId, unitKey, candidateId, expectedCandidateRevision: 1,
        })).response.status).toBe(200);
        const staged = await invoke('/book-activity-authoring/stage', { operationId: operation('103'), expectedRevision: 0, bookId, content: activity });
        const activityCandidateId = String(staged.body.candidateId);
        expect((await invoke('/book-activity-authoring/validate', { operationId: operation('104'), candidateId: activityCandidateId, expectedRevision: 1 })).response.status).toBe(200);
        const incomplete = await invoke('/book-activity-authoring/save-draft', { operationId: operation('105'), candidateId: activityCandidateId, expectedRevision: 2, unitActivityBinding: { unitKey, activityKey } });
        expect(incomplete).toMatchObject({ response: { status: 202 }, body: { status: 'binding-incomplete', retryable: true } });
        const activityId = String(incomplete.body.activityId);
        const repaired = await invoke('/book-activity-authoring/save-draft', { operationId: operation('105'), candidateId: activityCandidateId, expectedRevision: 2, unitActivityBinding: { unitKey, activityKey } });
        expect(repaired).toMatchObject({ response: { status: 200 }, body: { status: 'saved', replayed: true, activityId, binding: { phase: 'complete' } } });
        expect((await exact.ref(bindingPath).once('value')).val()).toMatchObject({
          activityId, candidateId: activityCandidateId, candidateRevision: 3,
        });
        expect(authoringWireAfterSave).toBeDefined();
        const rawActivities = authoringWireAfterSave!.activities as Record<string, Record<string, unknown>>;
        const rawCandidates = authoringWireAfterSave!.candidates as Record<string, unknown>;
        expect(Object.keys(rawActivities)).toHaveLength(1);
        expect(Object.keys(rawCandidates)).toHaveLength(1);
        expect(rawActivities[activityId]!.editableDraft).not.toHaveProperty('taskProfile');
        expect(rawActivities[activityId]!.editableDraft).not.toHaveProperty('assetRefs');
        expect(requests).toContainEqual(expect.objectContaining({ path: bindingPath, method: 'GET', etagRequested: true }));
        expect(requests).toContainEqual(expect.objectContaining({ path: bindingPath, method: 'PUT', ifMatch: 'null_etag' }));
        expect(exchanged).toContainEqual(bindingClaims);

        const previewPath = `/book-assembly/books/${bookId}/units/${unitKey}/candidates/${candidateId}/preview`;
        expect((await invoke(previewPath, { expectedCandidateRevision: 2 })).response.status).toBe(200);
        const approved = await invoke(`${previewPath.slice(0, -'/preview'.length)}/approve`, { expectedCandidateRevision: 2 });
        expect(approved.response.status).toBe(200);
        const previewApproval = approved.body.approval as {
          approvalId: string; approvalRevision: number; approvedAt: string; expiresAt: string;
        };
        const approvalPath = `${BOOK_ASSEMBLY_PREVIEW_APPROVAL_ROOT}/${bookId}/units/${unitKey}/approvals/${previewApproval.approvalId}`;
        const revocationPath = `${BOOK_ASSEMBLY_PREVIEW_APPROVAL_ROOT}/${bookId}/units/${unitKey}/revocations/${previewApproval.approvalId}`;
        expect(requests).toContainEqual(expect.objectContaining({ path: approvalPath, method: 'GET', etagRequested: true }));
        expect(requests).toContainEqual(expect.objectContaining({ path: approvalPath, method: 'PUT', ifMatch: 'null_etag' }));
        expect(exchanged).toContainEqual({
          book_assembly_preview_approval_service: true, book_assembly_preview_approval_ownerId: ownerId,
          book_assembly_preview_approval_bookId: bookId, book_assembly_preview_approval_unitKey: unitKey,
          book_assembly_preview_approval_approvalId: previewApproval.approvalId,
        });

        const publicationRequest = {
          bookId, unitKey, candidateId, expectedCandidateRevision: 2,
          expectedCurrentPublicationId: null, expectedBookRevision: 1, expectedSourceSetRevision: 1,
          previewApproval,
        };
        expect((await invoke('/book-assembly/full-pdf-publications', publicationRequest)).response.status).toBe(200);
        expect((await exact.ref(bindingPath).once('value')).val()).toMatchObject({
          activityId,
          candidateId: activityCandidateId,
          candidateRevision: 3,
          activityVersion: 1,
        });
        expect(requests).toContainEqual(expect.objectContaining({
          path: bindingPath,
          method: 'PUT',
          ifMatch: expect.not.stringMatching(/^null_etag$/u),
        }));
        expect(exchanged).toContainEqual({
          book_assembly_publication_approval_service: true, book_assembly_publication_approval_ownerId: ownerId,
          book_assembly_publication_approval_bookId: bookId, book_assembly_publication_approval_unitKey: unitKey,
          book_assembly_publication_approval_approvalId: previewApproval.approvalId,
        });

        const revokePath = `${previewPath.slice(0, -'/preview'.length)}/approvals/${previewApproval.approvalId}/revoke`;
        const revoked = await invoke(revokePath, { expectedCandidateRevision: 2 });
        expect(revoked).toMatchObject({ response: { status: 200 }, body: { status: 'revoked', revocation: { approvalId: previewApproval.approvalId } } });
        expect(requests).toContainEqual(expect.objectContaining({ path: revocationPath, method: 'GET', etagRequested: true }));
        expect(requests).toContainEqual(expect.objectContaining({ path: revocationPath, method: 'PUT', ifMatch: 'null_etag' }));
        expect((await invoke(revokePath, { expectedCandidateRevision: 2 })).body).toMatchObject({ status: 'replayed' });
        expect((await invoke('/book-assembly/full-pdf-publications', publicationRequest)).response.status).toBe(422);
        expect(await Promise.all([
          read('course_enrollments/legacy-enrollment-1'), read('course_book_authority/releases/course-1/module-1/student-1'),
          read('book_source_upload_accounts/account-1/assemblyBooks/book-2/source-sibling'),
        ])).toEqual(preservedAuthorities);
      } finally {
        globalThis.fetch = realFetch;
      }
    });
  });
}
