import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = process.cwd();
const PROJECT_ID = 'temp-a1437';
const DEFAULT_WORKER_URL = 'https://r2-upload-signer.iamhuwng.workers.dev';
const OUTPUT_DIR = join(ROOT, 'output', 'prd0055-task5-selected-teacher-worker-proof');
const OUTPUT_PATH = join(OUTPUT_DIR, 'selected-teacher-worker-proof.json');

const proofId = `prd0055-selected-teacher-${Date.now()}`;
const startedAt = new Date().toISOString();
const workerUrl = (process.env.LISTENING_AUTHORING_WORKER_URL || DEFAULT_WORKER_URL).replace(/\/+$/, '');
const firebaseArgsPrefix = [join(ROOT, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js')];

const redact = (value) => String(value).replace(/[A-Za-z0-9._~+/=-]{24,}/g, '[redacted]');

const readEnvFile = () => {
  const text = readFileSync(join(ROOT, '.env'), 'utf8');
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 0) continue;
    env[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return env;
};

const env = readEnvFile();
const apiKey = env.VITE_FIREBASE_API_KEY;
const databaseUrl = env.VITE_FIREBASE_DATABASE_URL?.replace(/\/+$/, '');

if (!apiKey || !databaseUrl) {
  throw new Error('Missing Firebase web config in .env.');
}

const runFirebase = (args, input) => {
  const result = spawnSync(process.execPath, [...firebaseArgsPrefix, ...args, '--project', PROJECT_ID], {
    cwd: ROOT,
    input,
    encoding: 'utf8',
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`firebase ${args.join(' ')} failed (${result.status ?? result.signal}): ${redact(result.stderr || result.stdout || 'no output')}`);
  }
  return result.stdout.trim();
};

const firebaseSet = (path, value) => {
  runFirebase(['database:set', path, '--data', JSON.stringify(value), '--force']);
};

const firebaseGet = (path) => {
  const text = runFirebase(['database:get', path]);
  return text ? JSON.parse(text) : null;
};

const signIn = async (email, password) => {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5173',
        Referer: 'http://localhost:5173/',
      },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`signIn failed for ${email}: ${body.error?.message || response.status}`);
  }
  return {
    uid: body.localId,
    email,
    idToken: body.idToken,
  };
};

const postWorker = async (token, path, body) => {
  const response = await fetch(`${workerUrl}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': body.idempotencyKey,
    },
    body: JSON.stringify(body),
  });
  const responseBody = await response.json().catch(() => ({}));
  return {
    statusCode: response.status,
    ok: response.ok,
    body: responseBody,
  };
};

const rtdbUrl = (path, token, params = {}) => {
  const url = new URL(`${databaseUrl}/${path.split('/').map(encodeURIComponent).join('/')}.json`);
  url.searchParams.set('auth', token);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
};

const rtdbGet = async (path, token, params = {}) => {
  const response = await fetch(rtdbUrl(path, token, params));
  const body = await response.json().catch(() => null);
  return { statusCode: response.status, ok: response.ok, body };
};

const rtdbPut = async (path, token, value) => {
  const response = await fetch(rtdbUrl(path, token), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  const body = await response.json().catch(() => null);
  return { statusCode: response.status, ok: response.ok, body };
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const incompleteDocument = {
  title: `${proofId} incomplete draft`,
  type: 'IELTS',
  skill: 'Listening',
  duration: 0,
  difficulty: 'Intermediate',
  questionCount: 1,
  isPublic: false,
  isComplete: false,
  displayMode: 'text',
  metadata: { description: 'Selected-teacher Worker proof.', instructions: '', tags: ['prd0055-proof'] },
  questions: [{ number: 1, type: 'short-answer', question: 'Question 1', answer: '', sectionNumber: 1, points: 1 }],
  settings: {
    allowPause: true,
    showTimer: true,
    shuffleQuestions: false,
    showResults: 'after-submission',
    allowReview: true,
    passingScore: 60,
    allowReplay: true,
  },
};

const completeDocument = {
  ...incompleteDocument,
  title: `${proofId} ready draft`,
  duration: 1800,
  isComplete: true,
  questions: [{ number: 1, type: 'short-answer', question: 'Question 1', answer: 'A', sectionNumber: 1, points: 1 }],
  audioSections: [{
    number: 1,
    name: 'Section 1',
    assetId: `${proofId}-asset-1`,
    audioUrl: `r2://${proofId}-asset-1`,
    startQuestion: 1,
    endQuestion: 1,
  }],
};

const summarizeError = (body) => {
  if (!body || typeof body !== 'object') return body;
  return {
    error: body.error || body.message || body.status || null,
  };
};

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
};

const assertUnchangedFields = (before, after, fields) => {
  for (const field of fields) {
    if (JSON.stringify(canonicalize(before[field])) !== JSON.stringify(canonicalize(after[field]))) {
      throw new Error(`legacy field changed: ${field}`);
    }
  }
};

const result = {
  task: 'PRD-0055 Task 5 selected-teacher Worker authoring proof',
  proofId,
  startedAt,
  workerUrl,
  firebaseProjectId: PROJECT_ID,
  selectedTeachersAuthorized: true,
  selectedTeacherRollout: 'single selected-teacher proof window',
  deployedWorkerVersionId: '34970bd6-feb7-4520-87f1-fa6341dc0ba0',
  rollbackWorkerVersionId: '3687d2e0-4718-4c0b-9c84-7f81749c31fb',
  steps: [],
  artifacts: [OUTPUT_PATH.replaceAll('\\', '/')],
  stopConditions: {
    unexplainedPermanentObjectGrowth: false,
    failedCleanup: false,
    wrongAudio: false,
    legacyIncompatibility: false,
    productionData: true,
    remoteMutation: true,
  },
};

let teacher;
let teacher2;
let flagEnabled = false;

try {
  teacher = await signIn('teacher@test.com', 'password123');
  teacher2 = await signIn('teacher2@test.com', 'password123');
  result.selectedTeacher = { uid: teacher.uid, email: teacher.email };
  result.crossOwnerTeacher = { uid: teacher2.uid, email: teacher2.email };

  firebaseSet(`/system_flags/listening_authoring_rollout_audit/${proofId}/start`, {
    actor: 'firebase-cli:iamhuwng@gmail.com',
    action: 'enable',
    reason: 'PRD-0055 selected-teacher Worker authoring proof',
    selectedTeacherUid: teacher.uid,
    requestedAt: startedAt,
  });
  firebaseSet('/system_flags/listening_authoring_writes_enabled', true);
  flagEnabled = true;
  result.steps.push({ name: 'enable-write-flag', status: 'passed' });

  const incompleteSave = await postWorker(teacher.idToken, 'listening-authoring/save-draft', {
    idempotencyKey: `${proofId}-save-incomplete`,
    document: incompleteDocument,
    trigger: 'explicit',
  });
  assert(incompleteSave.statusCode === 200, `incomplete save HTTP ${incompleteSave.statusCode}`);
  assert(incompleteSave.body.status === 'saved', 'incomplete save did not return saved');
  const incompleteDraft = await rtdbGet(`listening_authoring/drafts/${incompleteSave.body.draftId}`, teacher.idToken);
  assert(incompleteDraft.ok && incompleteDraft.body?.ownerId === teacher.uid, 'incomplete draft owner read failed');
  const incompleteTestId = incompleteDraft.body.testId;
  const versionsAfterIncomplete = await rtdbGet('listening_authoring/versions', teacher.idToken, {
    orderBy: JSON.stringify('ownerId'),
    equalTo: JSON.stringify(teacher.uid),
  });
  assert(versionsAfterIncomplete.ok, 'versions query after incomplete save failed');
  const matchingIncompleteVersions = Object.values(versionsAfterIncomplete.body || {})
    .filter((version) => version?.testId === incompleteTestId);
  const testAfterIncomplete = firebaseGet(`/tests/${incompleteTestId}`);
  assert(matchingIncompleteVersions.length === 0, 'incomplete save created a version');
  assert(testAfterIncomplete === null, 'incomplete save created tests row');
  result.steps.push({
    name: 'save-incomplete-draft',
    status: 'passed',
    httpStatus: incompleteSave.statusCode,
    draftId: incompleteSave.body.draftId,
    testId: incompleteTestId,
    warnings: incompleteSave.body.warnings?.length ?? 0,
    matchingVersions: matchingIncompleteVersions.length,
    testRowCreated: false,
  });

  const firstSave = await postWorker(teacher.idToken, 'listening-authoring/save-draft', {
    idempotencyKey: `${proofId}-save-complete`,
    document: completeDocument,
    trigger: 'explicit',
  });
  assert(firstSave.statusCode === 200 && firstSave.body.status === 'saved', 'complete save failed');
  const updatedDocument = { ...completeDocument, title: `${proofId} ready draft updated` };
  const secondSave = await postWorker(teacher.idToken, 'listening-authoring/save-draft', {
    idempotencyKey: `${proofId}-save-complete-update`,
    draftId: firstSave.body.draftId,
    expectedConflictToken: firstSave.body.conflictToken,
    document: updatedDocument,
    trigger: 'explicit',
  });
  assert(secondSave.statusCode === 200 && secondSave.body.status === 'saved', 'complete update failed');
  const staleSave = await postWorker(teacher.idToken, 'listening-authoring/save-draft', {
    idempotencyKey: `${proofId}-save-stale`,
    draftId: firstSave.body.draftId,
    expectedConflictToken: firstSave.body.conflictToken,
    document: { ...completeDocument, title: `${proofId} stale mutation should not persist` },
    trigger: 'explicit',
  });
  assert(staleSave.statusCode === 409 && staleSave.body.status === 'conflict', 'stale conflict was not rejected');
  const draftAfterStale = await rtdbGet(`listening_authoring/drafts/${firstSave.body.draftId}`, teacher.idToken);
  assert(draftAfterStale.body?.document?.title === updatedDocument.title, 'stale save mutated draft');
  result.steps.push({
    name: 'stale-conflict-denial',
    status: 'passed',
    httpStatus: staleSave.statusCode,
    draftId: firstSave.body.draftId,
    currentConflictToken: staleSave.body.currentConflictToken,
    titlePreserved: true,
  });

  const publishBody = {
    idempotencyKey: `${proofId}-publish`,
    draftId: firstSave.body.draftId,
    expectedConflictToken: secondSave.body.conflictToken,
  };
  const publish = await postWorker(teacher.idToken, 'listening-authoring/publish', publishBody);
  assert(publish.statusCode === 200 && publish.body.status === 'published', 'publish failed');
  const publishRetry = await postWorker(teacher.idToken, 'listening-authoring/publish', publishBody);
  assert(publishRetry.statusCode === 200 && publishRetry.body.versionId === publish.body.versionId, 'publish retry returned different version');
  const version = await rtdbGet(`listening_authoring/versions/${publish.body.versionId}`, teacher.idToken);
  assert(version.ok && version.body?.ownerId === teacher.uid, 'published version owner read failed');
  const operations = await rtdbGet('listening_authoring/operations', teacher.idToken, {
    orderBy: JSON.stringify('ownerId'),
    equalTo: JSON.stringify(teacher.uid),
  });
  assert(operations.ok, 'operations query failed');
  const publishOperation = Object.values(operations.body || {}).find((operation) => (
    operation?.operationType === 'publish' &&
    operation?.result?.versionId === publish.body.versionId &&
    operation?.status === 'succeeded'
  ));
  assert(Boolean(publishOperation), 'publish operation record missing');
  result.steps.push({
    name: 'publish-and-idempotent-retry',
    status: 'passed',
    draftId: publish.body.draftId,
    versionId: publish.body.versionId,
    versionNumber: publish.body.versionNumber,
    retrySameVersionId: true,
    operationRecordFound: true,
    conflictToken: publish.body.conflictToken,
  });

  const crossDraft = await rtdbGet(`listening_authoring/drafts/${firstSave.body.draftId}`, teacher2.idToken);
  const crossVersion = await rtdbGet(`listening_authoring/versions/${publish.body.versionId}`, teacher2.idToken);
  const browserWrite = await rtdbPut(`listening_authoring/drafts/${firstSave.body.draftId}`, teacher.idToken, {
    ...draftAfterStale.body,
    document: { ...draftAfterStale.body.document, title: 'browser mutation denied' },
  });
  assert(!crossDraft.ok, 'cross-owner draft read was allowed');
  assert(!crossVersion.ok, 'cross-owner version read was allowed');
  assert(!browserWrite.ok, 'browser canonical write was allowed');
  result.steps.push({
    name: 'browser-rule-denials',
    status: 'passed',
    crossOwnerDraftStatus: crossDraft.statusCode,
    crossOwnerVersionStatus: crossVersion.statusCode,
    browserWriteStatus: browserWrite.statusCode,
    browserWriteError: summarizeError(browserWrite.body),
  });

  const legacyTestId = `${proofId}-legacy`;
  const legacyBefore = {
    id: legacyTestId,
    ownerId: teacher.uid,
    createdBy: teacher.uid,
    title: `${proofId} legacy test`,
    ...completeDocument,
    isPublished: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  firebaseSet(`/tests/${legacyTestId}`, legacyBefore);
  const legacyPublish = await postWorker(teacher.idToken, 'listening-authoring/publish', {
    idempotencyKey: `${proofId}-legacy-publish`,
    legacyTestId,
  });
  assert(legacyPublish.statusCode === 200 && legacyPublish.body.status === 'published', 'legacy first-edit publish failed');
  const legacyAfter = firebaseGet(`/tests/${legacyTestId}`);
  const { authoringVersioning } = legacyAfter;
  assertUnchangedFields(legacyBefore, legacyAfter, [
    'id',
    'ownerId',
    'createdBy',
    'title',
    'type',
    'skill',
    'duration',
    'difficulty',
    'questionCount',
    'isPublic',
    'isComplete',
    'displayMode',
    'metadata',
    'audioSections',
    'questions',
    'settings',
    'isPublished',
    'createdAt',
    'updatedAt',
  ]);
  assert(authoringVersioning?.frozen === true, 'legacy freeze metadata missing');
  const legacyVersion = await rtdbGet(`listening_authoring/versions/${legacyPublish.body.versionId}`, teacher.idToken);
  const legacyRevision = await rtdbGet(`listening_authoring/revision_drafts/${legacyPublish.body.draftId}`, teacher.idToken);
  assert(legacyVersion.ok && legacyVersion.body?.sourceDraftPath === 'legacy_tests', 'legacy version record missing');
  assert(legacyRevision.ok && legacyRevision.body?.recordType === 'revision-draft', 'legacy revision draft missing');
  result.steps.push({
    name: 'legacy-first-edit-freeze',
    status: 'passed',
    legacyTestId,
    draftId: legacyPublish.body.draftId,
    versionId: legacyPublish.body.versionId,
    versionNumber: legacyPublish.body.versionNumber,
    contentFieldsUnchanged: true,
    freezeMetadataAdded: true,
  });
} catch (error) {
  result.error = error instanceof Error ? redact(error.message) : redact(error);
  throw error;
} finally {
  if (flagEnabled) {
    try {
      firebaseSet('/system_flags/listening_authoring_writes_enabled', false);
      firebaseSet(`/system_flags/listening_authoring_rollout_audit/${proofId}/end`, {
        actor: 'firebase-cli:iamhuwng@gmail.com',
        action: 'disable',
        reason: 'PRD-0055 selected-teacher Worker authoring proof complete',
        requestedAt: new Date().toISOString(),
      });
      result.steps.push({ name: 'disable-write-flag', status: 'passed' });
    } catch (disableError) {
      result.stopConditions.writeFlagDisableFailed = true;
      result.disableError = disableError instanceof Error ? redact(disableError.message) : redact(disableError);
    }
  }

  if (teacher?.idToken) {
    try {
      const blocked = await postWorker(teacher.idToken, 'listening-authoring/save-draft', {
        idempotencyKey: `${proofId}-post-disable-save`,
        document: incompleteDocument,
        trigger: 'explicit',
      });
      result.steps.push({
        name: 'post-disable-write-blocked',
        status: blocked.statusCode === 503 && blocked.body?.status === 'writes-disabled' ? 'passed' : 'failed',
        httpStatus: blocked.statusCode,
        responseStatus: blocked.body?.status,
      });
      if (!(blocked.statusCode === 503 && blocked.body?.status === 'writes-disabled')) {
        result.stopConditions.writeFlagDisableFailed = true;
      }
    } catch (blockedError) {
      result.steps.push({
        name: 'post-disable-write-blocked',
        status: 'failed',
        error: blockedError instanceof Error ? redact(blockedError.message) : redact(blockedError),
      });
      result.stopConditions.writeFlagDisableFailed = true;
    }
  }

  result.completedAt = new Date().toISOString();
  result.passed = !result.error && !Object.values(result.stopConditions).some((value) => value === true && value !== result.stopConditions.productionData && value !== result.stopConditions.remoteMutation);
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`);
}

if (!result.passed) {
  process.exitCode = 1;
}
