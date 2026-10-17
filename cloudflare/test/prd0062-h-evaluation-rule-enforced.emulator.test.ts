import { createHash, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { importSPKI, jwtVerify } from 'jose';
import { createFirebaseClaimTokenProvider } from '../src/upload-worker/book-activity-authoring/firebase-token.ts';
import { FirebaseRestBookActivityEvaluationRepository, InMemoryBookActivityEvaluationRepository, bookActivityEvaluationScopePath } from '../src/upload-worker/book-activity-grading/repository.ts';
import { createTrustedBookActivityEvaluationService } from '../../src/services/book-activity/activityEvaluation.service.ts';
import type { BookActivityEvaluationCommand, BookActivityEvaluationRepository, BookActivityEvaluationTarget } from '../../src/services/book-activity/activityEvaluation.types.ts';
import type { BookRuntimeAttemptRecord } from '../../src/services/book-activity/activityRuntimeAttempt.types.ts';
import type { NormalizedActivity } from '../../src/types/bookActivity.types.ts';
import { composeGeneratedBookRules } from '../src/upload-worker/book-rules/generated-fragment-composer.ts';
import { createBookNonRedoEvaluationAdapter } from '../src/upload-worker/book-updates/non-redo-evaluation-adapter.ts';

// Disclosed domain context only. Evaluations/receipts and capabilities below are
// produced by the real service/default repository; this is not full H acceptance.
const projectId = 'demo-prd0062-h-evaluation';
const identity = `book-evaluation@${projectId}.iam.gserviceaccount.com`;
const target: BookActivityEvaluationTarget = {
  attemptId: 'attempt-1', resultId: 'attempt-1:result', recipientId: 'student-1',
  bindingId: 'binding-1', bindingRevision: 1, contextKind: 'homework', contextId: 'homework-1',
  placementId: 'placement-1', activityId: 'activity-1', activityVersion: 1,
  interactionId: 'interaction-1', activityVersionId: 'activity-version-1', attemptNumber: 1,
  pageGroupKeys: ['page-group-1'], sourceProvenance: [{ sourceKey: 'source-1', sourceVersionId: 'source-version-1', pages: [1] }],
};
const attempt: BookRuntimeAttemptRecord = {
  schemaVersion: 1, attemptId: target.attemptId, bindingId: target.bindingId,
  bindingRevision: target.bindingRevision, recipientId: target.recipientId, contextId: target.contextId,
  placementId: target.placementId, activityId: target.activityId, activityVersion: target.activityVersion,
  interactionId: target.interactionId, activityVersionId: target.activityVersionId,
  acknowledgedDraftRevision: 1, attemptNumber: target.attemptNumber,
  pageGroupKeys: target.pageGroupKeys, sourceProvenance: target.sourceProvenance,
  feedbackRelease: 'pending', response: { text: 'A complete explanation.' },
  createdByOperationId: 'submit-1', createdAt: '2026-10-03T00:00:00.000Z',
  submissionScope: 'activity', requiredInteractionIds: [target.interactionId], submittedInteractionIds: [target.interactionId],
};
const activity: NormalizedActivity = {
  schemaVersion: 1, title: 'Evaluation Rules context', taskProfile: null, presentationMode: 'structured',
  contextRequirement: { mode: 'required', acceptedKinds: ['pdf-page'] }, instructions: [{ text: 'Explain.' }],
  stimulus: null, assetRefs: [], interaction: { family: 'long-response', variant: 'essay' },
  answerRule: { defaultPoints: 10, normalization: 'exact' },
  interactions: [{ family: 'long-response', interactionId: target.interactionId, prompt: 'Explain',
    itemIdentities: { family: 'long-response', itemIds: [] },
    answerKey: { family: 'long-response', rubric: { criteria: ['Relevant'] } } }],
  scoring: { mode: 'review-required' },
};
const command: BookActivityEvaluationCommand = {
  schemaVersion: 1, scorerVersion: 1, operationId: 'teacher-evaluation-1', kind: 'teacher_evaluation',
  expectedEvaluationRevision: 0, target,
  evaluation: { earnedScore: 7, maximumScore: 10, feedback: 'Explain the evidence.',
    correctionFacts: [{ interactionId: target.interactionId, outcome: 'partial', note: 'Add supporting detail.' }] },
};
const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');
const emulatorToken = (uid: string, claims: Record<string, unknown>): string => {
  const now = Math.floor(Date.now() / 1_000);
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    iss: `https://securetoken.google.com/${projectId}`, aud: projectId, auth_time: now,
    iat: now, exp: now + 3_600, sub: uid, user_id: uid,
    firebase: { identities: {}, sign_in_provider: 'custom' }, ...claims,
  })}.`;
};
let rules: RulesTestEnvironment;
beforeAll(async () => {
  const address = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
  if (!address) throw new Error('FIREBASE_DATABASE_EMULATOR_HOST is required; no authorization proof may be skipped.');
  const separator = address.lastIndexOf(':');
  const canonical = JSON.parse(readFileSync(new URL('../../database.rules.json', import.meta.url), 'utf8'));
  const fragmentSource = readFileSync(new URL('../src/upload-worker/book-rules/fragments/36.json', import.meta.url), 'utf8');
  const candidate = composeGeneratedBookRules([{ sourcePath: 'fragments/36.json', fragment: JSON.parse(fragmentSource) }], {
    baseRules: canonical.rules, requiredFragmentIds: ['36'],
  });
  const outside = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== 'book_activity_evaluations'));
  expect(outside(candidate.rules)).toEqual(outside(canonical.rules));
  const rulesSource = JSON.stringify({ rules: candidate.rules });
  console.info('Evaluation isolated Rules inputs', JSON.stringify({
    fragmentSha256: createHash('sha256').update(fragmentSource).digest('hex'),
    candidateSha256: createHash('sha256').update(rulesSource).digest('hex'),
  }));
  rules = await initializeTestEnvironment({
    projectId,
    database: { host: address.slice(0, separator), port: Number(address.slice(separator + 1)),
      rules: rulesSource },
  });
  await rules.clearDatabase();
});
afterAll(async () => { await rules?.cleanup(); });

it('enforces generated evaluator capabilities for real domain revisions, history/replay and crossed user/ancestor denials', async () => {
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const verificationKey = await importSPKI(keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(), 'RS256');
  const serviceAccountJson = JSON.stringify({ client_email: identity,
    private_key: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() });
  const capabilities = new Map<string, Record<string, unknown>>();
  const traces: { path: string; method: string; status: number; token: string; limit: string | null }[] = [];
  let reportDeniedRevision = true;
  let competition = false;
  let arrivals = 0;
  let releaseCompetitors!: () => void;
  const competitorsReady = new Promise<void>((resolve) => { releaseCompetitors = resolve; });
  let loseResponse = false;
  let denyLostResponseReadback = false;
  let readbackUnavailable = false;
  const realFetch = globalThis.fetch.bind(globalThis);
  const bridge: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === 'identitytoolkit.googleapis.com') {
      const { payload } = await jwtVerify(JSON.parse(String(init?.body)).token, verificationKey, {
        issuer: identity, audience: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
      });
      expect(payload.uid).toBe(identity);
      if (!payload.claims || typeof payload.claims !== 'object' || Array.isArray(payload.claims)) {
        return new Response(null, { status: 400 });
      }
      const claims = payload.claims as Record<string, unknown>;
      const idToken = emulatorToken(payload.uid, claims);
      capabilities.set(idToken, claims);
      return Response.json({ idToken, expiresIn: '3600' });
    }
    if (url.hostname !== 'firebase.test') return new Response(null, { status: 599 });
    const token = url.searchParams.get('auth') ?? '';
    expect(capabilities.has(token)).toBe(true);
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);
    if (readbackUnavailable && (init?.method ?? 'GET') === 'GET') {
      readbackUnavailable = false;
      traces.push({ path: decodeURIComponent(url.pathname), method: 'GET', status: 503, token, limit: null });
      return new Response(null, { status: 503 });
    }
    const emulatorUrl = new URL(`http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}${url.pathname}${url.search}`);
    emulatorUrl.searchParams.set('ns', projectId);
    if (competition && init?.method === 'PATCH') {
      arrivals += 1;
      if (arrivals === 2) releaseCompetitors();
      await competitorsReady;
    }
    const response = await realFetch(emulatorUrl, init);
    if (reportDeniedRevision && init?.method === 'PATCH' && !response.ok) {
      const submitted = JSON.parse(String(init.body));
      console.error('Evaluation revision Rules denial', JSON.stringify({
        path: decodeURIComponent(url.pathname), status: response.status,
        updates: Object.keys(submitted),
        response: await response.clone().text(),
      }));
    }
    traces.push({ path: decodeURIComponent(url.pathname), method: init?.method ?? 'GET',
      status: response.status, token, limit: url.searchParams.get('limitToLast') });
    if (loseResponse && init?.method === 'PATCH' && response.ok) {
      loseResponse = false;
      readbackUnavailable = denyLostResponseReadback;
      throw new Error('simulated_committed_response_loss');
    }
    return response;
  };
  const repository = new FirebaseRestBookActivityEvaluationRepository({
    env: { FIREBASE_DB_URL: 'https://firebase.test', FIREBASE_PROJECT_ID: projectId,
      FIREBASE_WEB_API_KEY: 'emulator-exchange-key', BOOK_ACTIVITY_EVALUATION_SERVICE_IDENTITY: identity,
      BOOK_ACTIVITY_EVALUATION_GOOGLE_SA_KEY: serviceAccountJson },
    fetchImpl: bridge,
  });
  const createService = (store: BookActivityEvaluationRepository) => createTrustedBookActivityEvaluationService({ repository: store,
    trustedScorerIdentity: identity, now: () => '2026-10-03T01:00:00.000Z',
    resolveAttempt: async (requested) => requested.attemptId === target.attemptId
      ? { attempt, contextKind: 'homework', activity, submission: [{ interactionId: target.interactionId, answer: 'A complete explanation.' }] } : null,
    resolveTeacherAuthority: async ({ actorUid }) => actorUid === 'teacher-1'
      ? { ownerId: 'teacher-1', recipientId: target.recipientId, bindingId: target.bindingId,
        bindingRevision: target.bindingRevision, contextKind: target.contextKind, contextId: target.contextId,
        placementId: target.placementId, activityId: target.activityId,
        activityVersion: target.activityVersion, activityVersionId: target.activityVersionId } : null,
  });
  const service = createService(repository);
  const first = await service.applyEvaluationCommand(command, { kind: 'teacher', uid: 'teacher-1' });
  expect(first).toMatchObject({ status: 'accepted', revision: { revision: 1, evaluatedBy: { kind: 'teacher', uid: 'teacher-1' } } });
  expect(await service.applyEvaluationCommand(command, { kind: 'teacher', uid: 'teacher-1' }))
    .toEqual({ ...first, status: 'replayed' });
  expect((await repository.listHistory({ target, limit: 1 })).map((row) => row.revision)).toEqual([1]);
  expect(traces.some((row) => row.method === 'PATCH' && row.status === 200)).toBe(true);
  expect(traces.some((row) => row.path.endsWith('/history.json') && row.limit === '1' && row.status === 200)).toBe(true);
  expect(traces.every((row) => row.status === 200)).toBe(true);
  const token = traces[0].token;
  expect(capabilities.get(token)).toEqual({ book_activity_evaluation_service: true,
    book_activity_evaluation_recipientId: target.recipientId, book_activity_evaluation_contextId: target.contextId,
    book_activity_evaluation_placementId: target.placementId, book_activity_evaluation_activityId: target.activityId,
    book_activity_evaluation_attemptId: target.attemptId });
  expect(capabilities.size).toBe(1);
  reportDeniedRevision = false;
  const path = bookActivityEvaluationScopePath(target);
  const get = (requestPath: string, auth: string, method = 'GET', body?: unknown) => bridge(
    `https://firebase.test/${requestPath}.json?auth=${encodeURIComponent(auth)}`,
    { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) },
  );
  const saved = await (await get(path, token)).json();
  const provider = createFirebaseClaimTokenProvider({ serviceAccountJson, serviceIdentity: identity,
    firebaseProjectId: projectId, firebaseWebApiKey: 'emulator-exchange-key', fetchImpl: bridge });
  const exact = { service: 'book_activity_evaluation', recipientId: target.recipientId, contextId: target.contextId,
    placementId: target.placementId, activityId: target.activityId, attemptId: target.attemptId } as const;
  for (const field of ['recipientId', 'contextId', 'placementId', 'activityId', 'attemptId'] as const) {
    const crossed = await provider({ ...exact, [field]: `${exact[field]}-crossed` });
    expect((await get(path, crossed)).status).toBe(401);
    expect((await get(path, crossed, 'PUT', saved)).status).toBe(401);
  }
  const parent = path.slice(0, path.lastIndexOf('/'));
  expect((await get(parent, token)).status).toBe(401);
  expect((await get(parent, token, 'PATCH', { [target.attemptId]: saved })).status).toBe(401);
  for (const uid of ['teacher-1', target.recipientId]) {
    const db = rules.authenticatedContext(uid).database();
    await assertFails(db.ref(path).once('value'));
    await assertFails(db.ref(`${path}-forged`).set(saved));
    await assertFails(db.ref(`${path}/current`).update({ revision: 3 }));
    await assertFails(db.ref(path).remove());
    await assertFails(db.ref(parent).update({ [target.attemptId]: saved }));
    await assertFails(db.ref().update({ [`${path}/current/revision`]: 3 }));
  }
  expect(await (await get(path, token)).json()).toEqual(saved);
  reportDeniedRevision = true;
  const regrade: BookActivityEvaluationCommand = { ...command, kind: 'regrade',
    operationId: 'teacher-regrade-1', expectedEvaluationRevision: 1,
    evaluation: { ...command.evaluation, earnedScore: 8 } };
  const second = await service.applyEvaluationCommand(regrade, { kind: 'teacher', uid: 'teacher-1' });
  expect(second).toMatchObject({ status: 'accepted', revision: { revision: 2, previousRevision: 1 } });
  expect(await service.applyEvaluationCommand(regrade, { kind: 'teacher', uid: 'teacher-1' }))
    .toEqual({ ...second, status: 'replayed' });
  expect((await repository.listHistory({ target, limit: 1 })).map((row) => row.revision)).toEqual([2]);
  expect((await repository.listHistory({ target, limit: 2 })).map((row) => row.revision)).toEqual([1, 2]);
  const retained = await (await get(path, token)).json();
  const memory = new InMemoryBookActivityEvaluationRepository({ scopes: { [path]: retained } });
  expect(await createService(memory).applyEvaluationCommand({ ...regrade,
    operationId: 'teacher-regrade-2', expectedEvaluationRevision: 2,
  }, { kind: 'teacher', uid: 'teacher-1' })).toMatchObject({ status: 'accepted', revision: { revision: 3 } });
  const append = memory.snapshot().scopes[path]!;
  reportDeniedRevision = false;
  const unchanged = async () => expect(await (await get(path, token)).json()).toEqual(retained);
  const rowPaths = ['history/r000001', 'corrections/r000001', 'aggregateScores/r000001', 'operations/teacher-evaluation-1'];
  for (const rowPath of rowPaths) {
    const [collection, key] = rowPath.split('/');
    const changed = { ...retained[collection][key], revision: 99 };
    for (const value of [changed, null]) {
      expect((await get(`${path}/${rowPath}`, token, value === null ? 'DELETE' : 'PUT', value ?? undefined)).status).toBe(401);
      expect((await get(path, token, 'PATCH', { [rowPath]: value })).status).toBe(401);
      expect((await get('', token, 'PATCH', { [`${path}/${rowPath}`]: value })).status).toBe(401);
      const whole = structuredClone(retained);
      if (value === null) delete whole[collection][key]; else whole[collection][key] = value;
      expect((await get(path, token, 'PUT', whole)).status).toBe(401);
      const mixed = structuredClone(append) as Record<string, any>;
      if (value === null) delete mixed[collection][key]; else mixed[collection][key] = value;
      expect((await get(path, token, 'PUT', mixed)).status).toBe(401);
      expect((await get(path, token, 'PATCH', {
        current: append.current, 'history/r000003': append.history!.r000003,
        'corrections/r000003': append.corrections!.r000003,
        'aggregateScores/r000003': append.aggregateScores!.r000003,
        'operations/teacher-regrade-2': append.operations!['teacher-regrade-2'], [rowPath]: value,
      })).status).toBe(401);
      await unchanged();
    }
  }
  expect((await get(`${path}/current`, token, 'DELETE')).status).toBe(401);
  expect((await get('', token, 'PATCH', { [`${path}/current`]: null })).status).toBe(401);
  expect((await get('', token, 'PATCH', { [path]: null })).status).toBe(401);
  expect((await get(`${path}/current`, token, 'PUT', append.current)).status).toBe(401);
  await unchanged();
  const malformed: Record<string, any>[] = [];
  for (const collection of ['history', 'corrections', 'aggregateScores', 'operations']) {
    const key = collection === 'operations' ? 'teacher-regrade-2' : 'r000003';
    const omitted = structuredClone(append) as Record<string, any>;
    delete omitted[collection][key]; malformed.push(omitted);
    const forged = structuredClone(append) as Record<string, any>;
    forged[collection][`${key}-extra`] = structuredClone(forged[collection][key]); malformed.push(forged);
    const swapped = structuredClone(append) as Record<string, any>;
    const oldKey = collection === 'operations' ? 'teacher-evaluation-1' : 'r000001';
    [swapped[collection][oldKey], swapped[collection][key]] = [swapped[collection][key], swapped[collection][oldKey]];
    malformed.push(swapped);
  }
  const mixedTarget = structuredClone(append) as Record<string, any>;
  mixedTarget.history.r000003.target = { ...target, recipientId: 'student-crossed' }; malformed.push(mixedTarget);
  const mixedOperation = structuredClone(append) as Record<string, any>;
  mixedOperation.operations['teacher-regrade-2'].commandFingerprint = 'forged'; malformed.push(mixedOperation);
  const mixedCurrent = structuredClone(append) as Record<string, any>;
  mixedCurrent.current.revisionKey = 'r000002'; malformed.push(mixedCurrent);
  for (const reference of [undefined, 'r000002', `${path}/history/r000001`, 'cross-scope/r000001']) {
    const substituted = structuredClone(append) as Record<string, any>;
    if (reference === undefined) delete substituted.history.r000003.targetRevisionKey;
    else substituted.history.r000003.targetRevisionKey = reference;
    malformed.push(substituted);
  }
  const duplicateTarget = structuredClone(append) as Record<string, any>;
  duplicateTarget.history.r000003.target = target; malformed.push(duplicateTarget);
  for (const invalid of malformed) {
    expect((await get(path, token, 'PUT', invalid)).status).toBe(401);
    const patch: Record<string, unknown> = { current: invalid.current };
    for (const collection of ['history', 'corrections', 'aggregateScores', 'operations']) {
      for (const [key, value] of Object.entries(invalid[collection] ?? {})) {
        if (JSON.stringify(value) !== JSON.stringify(retained[collection]?.[key])) patch[`${collection}/${key}`] = value;
      }
    }
    expect((await get(path, token, 'PATCH', patch)).status).toBe(401);
    await unchanged();
  }
  const targetBoundaryResults: { field: string; status: number; moved: boolean }[] = [];
  const targetMutations: [string, unknown][] = [
    ['bindingId', 'binding-crossed'], ['bindingRevision', 2], ['activityVersion', 2],
    ['activityVersionId', 'activity-version-crossed'], ['resultId', 'result-crossed'],
    ['contextKind', 'solo'], ['interactionId', 'interaction-crossed'], ['attemptNumber', 2],
    ['pageGroupKeys', ['page-group-1', 'page-group-extra']], ['pageGroupKeys', ['page-group-crossed']], ['pageGroupKeys', []],
    ['sourceProvenance', [...target.sourceProvenance, { sourceKey: 'source-extra', sourceVersionId: 'source-version-extra', pages: [2] }]],
    ['sourceProvenance', [{ sourceKey: 'source-crossed', sourceVersionId: 'source-version-crossed', pages: [99] }]],
    ['sourceProvenance', []],
  ];
  for (const [field, value] of targetMutations) {
    const forgedHistory = structuredClone(append.history!.r000003);
    (forgedHistory as unknown as Record<string, unknown>).target = { ...target, [field]: value };
    const response = await get(path, token, 'PATCH', {
      current: append.current, 'history/r000003': forgedHistory,
      'corrections/r000003': append.corrections!.r000003,
      'aggregateScores/r000003': append.aggregateScores!.r000003,
      'operations/teacher-regrade-2': append.operations!['teacher-regrade-2'],
    });
    const after = await (await get(path, token)).json();
    const moved = JSON.stringify(after) !== JSON.stringify(retained);
    targetBoundaryResults.push({ field, status: response.status, moved });
    // Restore only after an observed exploit, so every field gets an independent probe.
    if (moved) await rules.withSecurityRulesDisabled(async (context) => context.database().ref(path).set(retained));
  }
  console.info('Evaluation target boundary probes', JSON.stringify(targetBoundaryResults));
  expect(targetBoundaryResults).toEqual(targetMutations.map(([field]) => ({ field, status: 401, moved: false })));
  for (const [field, value] of targetMutations) {
    expect((await get(path, token, 'PATCH', { [`history/r000001/target/${field}`]: value })).status).toBe(401);
    expect((await get('', token, 'PATCH', { [`${path}/history/r000001/target/${field}`]: value })).status).toBe(401);
    await unchanged();
  }
  const orphan = structuredClone(retained);
  delete orphan.history.r000001;
  await rules.withSecurityRulesDisabled(async (context) => context.database().ref(path).set(orphan));
  expect((await get(path, token, 'PATCH', {
    current: append.current, 'history/r000003': append.history!.r000003,
    'corrections/r000003': append.corrections!.r000003,
    'aggregateScores/r000003': append.aggregateScores!.r000003,
    'operations/teacher-regrade-2': append.operations!['teacher-regrade-2'],
  })).status).toBe(401);
  expect(await (await get(path, token)).json()).toEqual(orphan);
  await rules.withSecurityRulesDisabled(async (context) => context.database().ref(path).set(retained));
  competition = true;
  const raced = await Promise.all(['competing-a', 'competing-b'].map((operationId) => service.applyEvaluationCommand({
    ...regrade, operationId, expectedEvaluationRevision: 2,
  }, { kind: 'teacher', uid: 'teacher-1' })));
  competition = false;
  expect(arrivals).toBe(2);
  expect(raced.filter((row) => row.status === 'accepted')).toHaveLength(1);
  expect(raced.filter((row) => row.status === 'rejected')).toEqual([
    { status: 'rejected', code: 'evaluation_stale_revision', currentRevision: 3 },
  ]);
  const won = await (await get(path, token)).json();
  expect(won.history.r000001).toEqual(retained.history.r000001);
  expect(won.history.r000002).toEqual(retained.history.r000002);
  expect(won.current).toEqual({ revision: 3, revisionKey: 'r000003', operationId: won.history.r000003.operationId });
  const beforeLoss = traces.length;
  loseResponse = true;
  const responseLossCommand: BookActivityEvaluationCommand = {
    ...regrade, operationId: 'response-loss', expectedEvaluationRevision: 3,
    evaluation: { earnedScore: 9, maximumScore: 10, feedback: 'Rechecked with no corrections.' },
  };
  const recovered = await service.applyEvaluationCommand(responseLossCommand, { kind: 'teacher', uid: 'teacher-1' });
  expect(recovered).toMatchObject({ status: 'replayed', revision: { revision: 4, operationId: 'response-loss' } });
  expect(traces.slice(beforeLoss).filter((row) => row.method === 'PATCH')).toHaveLength(1);
  const appendPosition = traces.findLastIndex((row) => row.method === 'PATCH');
  expect(traces.slice(appendPosition + 1).filter((row) => row.method === 'GET')).toHaveLength(1);
  const beforeReplay = traces.length;
  expect(await service.applyEvaluationCommand(responseLossCommand, { kind: 'teacher', uid: 'teacher-1' })).toEqual(recovered);
  expect(traces.slice(beforeReplay).some((row) => row.method === 'PATCH')).toBe(false);
  expect((await repository.listHistory({ target, limit: 1 }))[0].facts.correctionFacts).toEqual([]);
  const beforeUnavailable = traces.length;
  loseResponse = true;
  denyLostResponseReadback = true;
  const uncertainCommand = { ...responseLossCommand, operationId: 'unreadable-response-loss', expectedEvaluationRevision: 4 };
  expect(await service.applyEvaluationCommand(uncertainCommand, { kind: 'teacher', uid: 'teacher-1' }))
    .toEqual({ status: 'rejected', code: 'evaluation_repository_conflict' });
  const uncertainTraces = traces.slice(beforeUnavailable);
  expect(uncertainTraces.filter((row) => row.method === 'PATCH')).toHaveLength(1);
  expect(uncertainTraces.at(-1)).toMatchObject({ path: `/${path}.json`, method: 'GET', status: 503 });
  const beforeExactReplay = traces.length;
  expect(await service.applyEvaluationCommand(uncertainCommand, { kind: 'teacher', uid: 'teacher-1' }))
    .toMatchObject({ status: 'replayed', revision: { revision: 5, operationId: uncertainCommand.operationId } });
  expect(traces.slice(beforeExactReplay).some((row) => row.method === 'PATCH')).toBe(false);
  const beforeLateHistory = traces.length;
  expect((await repository.listHistory({ target, limit: 1 })).map((row) => ({ revision: row.revision, target: row.target })))
    .toEqual([{ revision: 5, target }]);
  expect(traces.slice(beforeLateHistory).filter((row) => row.path === `/${path}/history/r000001.json`))
    .toHaveLength(1);
  const complete = await (await get(path, token)).json();
  expect(complete.history.r000001.target).toEqual(target);
  for (const row of Object.values(complete.history) as Record<string, unknown>[]) {
    if (row.revision === 1) expect(row.targetRevisionKey).toBeUndefined();
    else { expect(row.target).toBeUndefined(); expect(row.targetRevisionKey).toBe('r000001'); }
  }
  for (const anchor of [null, { ...complete.history.r000001, target: { ...target, bindingId: 'corrupt-binding' } },
    { ...complete.history.r000001, targetRevisionKey: 'r000001' }]) {
    await rules.withSecurityRulesDisabled(async (context) => context.database().ref(`${path}/history/r000001`).set(anchor));
    await expect(repository.listHistory({ target, limit: 1 })).rejects.toThrow(/evaluation_(?:target_anchor|history_readback)_invalid/u);
    await expect(repository.readOperation({ target, operationId: uncertainCommand.operationId }))
      .rejects.toThrow(/evaluation_(?:target_anchor|history_readback)_invalid/u);
    await rules.withSecurityRulesDisabled(async (context) => context.database().ref(path).set(complete));
  }
  const objectiveTarget = { ...target, activityId: 'objective-1', attemptId: 'objective-attempt', resultId: 'objective-attempt:result' };
  let correctOption = 'option-a';
  const objectiveService = createTrustedBookActivityEvaluationService({ repository, trustedScorerIdentity: identity,
    now: () => '2026-10-03T01:00:00.000Z', resolveTeacherAuthority: async () => null,
    resolveAttempt: async () => ({
      attempt: { ...attempt, attemptId: objectiveTarget.attemptId, activityId: objectiveTarget.activityId },
      contextKind: 'homework', submission: [{ interactionId: target.interactionId, answer: ['option-a'] }],
      activity: { ...activity, interaction: { family: 'choice', variant: 'single' },
        answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
        interactions: [{ family: 'choice', interactionId: target.interactionId, prompt: 'Choose.', options: ['A', 'B'],
          itemIdentities: { family: 'choice', optionIds: ['option-a', 'option-b'] },
          answerKey: { family: 'choice', acceptedOptionItemIds: [correctOption] } }], scoring: { mode: 'auto-where-possible' } },
    }),
  });
  const scorer = { kind: 'trusted_scorer' as const, serviceIdentity: identity };
  expect(await objectiveService.applyEvaluationCommand({ schemaVersion: 1, scorerVersion: 1,
    operationId: 'objective-initial', kind: 'evaluate_objective', expectedEvaluationRevision: 0, target: objectiveTarget }, scorer))
    .toMatchObject({ status: 'accepted', revision: { facts: { earnedScore: 1 } } });
  correctOption = 'option-b';
  const adapter = createBookNonRedoEvaluationAdapter({ evaluations: objectiveService, trustedActor: scorer,
    rubricReviews: { queue: async () => ({ status: 'stale' }) },
    objectiveProjection: { apply: async () => ({ status: 'conflict' }) } });
  const nonRedoId = 'action-1:homework:placement-1:regrade-objective';
  const beforeNonRedo = traces.length;
  expect(await adapter.regradeObjective({ operationId: nonRedoId, operation: {
    kind: 'regrade-objective', contextKind: 'homework', contextKey: 'homework:homework-1', placementId: target.placementId,
    activityId: objectiveTarget.activityId, oldActivityVersionId: 'old-v1', newActivityVersionId: 'new-v2',
    choice: 'apply-without-redo', expectedEvaluationRevision: 1, evaluationTarget: objectiveTarget,
  } })).toEqual({ status: 'stale' }); // Evaluation commits; a separate projection conflict stays truthful.
  expect(traces.slice(beforeNonRedo).filter((row) => row.method === 'PATCH')).toHaveLength(1);
  expect(await repository.readOperation({ target: objectiveTarget, operationId: nonRedoId }))
    .toMatchObject({ revision: { revision: 2, commandKind: 'regrade_objective', target: objectiveTarget, facts: { earnedScore: 0 } } });
}, 60_000);
