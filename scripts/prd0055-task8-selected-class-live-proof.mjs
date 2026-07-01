import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const PROJECT_ID = 'temp-a1437';
const WORKER_URL = 'https://r2-upload-signer.iamhuwng.workers.dev';
const OUTPUT_DIR = join(ROOT, 'output', 'prd0055-task9-live-readback');
const FIXTURE_DIR = join(OUTPUT_DIR, 'deployed-fixture-1782834043116');
const PAYLOAD = JSON.parse(readFileSync(join(FIXTURE_DIR, 'payload.json'), 'utf8'));
const FULL_TEST = JSON.parse(readFileSync(join(FIXTURE_DIR, 'test.json'), 'utf8'));
const SAFE_TEST = JSON.parse(readFileSync(join(FIXTURE_DIR, 'safeTest.json'), 'utf8'));

const startedAtMs = Date.now();
const proofId = `prd0055-selected-class-live-${startedAtMs}`;
const sessionCode = `T8${Math.random().toString(36).slice(2, 6).toUpperCase()}`.replace(/[^A-Z0-9]/g, 'X');
const classId = `${proofId}-class`;
const OUTPUT_PATH = join(OUTPUT_DIR, `${proofId}.json`);
const firebaseBin = join(ROOT, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');

const redact = (value) => String(value)
  .replace(/auth=[^&\s"]+/g, 'auth=[redacted]')
  .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [redacted]')
  .replace(/[A-Za-z0-9._~+/=-]{80,}/g, '[redacted]');

const readEnvFile = () => {
  const env = {};
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index > 0) env[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return env;
};

const env = readEnvFile();
const apiKey = env.VITE_FIREBASE_API_KEY;
if (!apiKey) throw new Error('Missing VITE_FIREBASE_API_KEY in .env');

const runFirebase = (args) => {
  const result = spawnSync(process.execPath, [
    firebaseBin,
    ...args,
    '--project',
    PROJECT_ID,
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`firebase ${args.join(' ')} failed: ${redact(result.stderr || result.stdout || 'no output')}`);
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
        Origin: 'https://kahut1.web.app',
        Referer: 'https://kahut1.web.app/',
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

const postLive = async (token, body) => {
  const response = await fetch(`${WORKER_URL}/listening-delivery/live`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const responseBody = await response.json().catch(() => ({}));
  return {
    status: response.status,
    ok: response.ok,
    body: responseBody,
  };
};

const fetchRange = async (url) => {
  const response = await fetch(url, {
    headers: { Range: 'bytes=0-15' },
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    contentType: response.headers.get('content-type'),
    acceptRanges: response.headers.get('accept-ranges'),
    contentRange: response.headers.get('content-range'),
    contentLength: response.headers.get('content-length'),
    firstBytesHex: bytes.toString('hex'),
    byteLength: bytes.byteLength,
  };
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const liveRequestBody = {
  assetId: PAYLOAD.assetId,
  sessionCode,
  testId: PAYLOAD.testId,
  versionId: PAYLOAD.versionId,
  classId,
  sectionNumber: 1,
};

const baseFullBrowserTestData = {
  ...FULL_TEST,
  id: PAYLOAD.testId,
  testId: PAYLOAD.testId,
  type: 'IELTS',
  skill: 'Listening',
  duration: 5,
  questionCount: 1,
  questions: [
    {
      id: 'q1',
      number: 1,
      type: 'completion',
      question: 'Complete the note: The browser proof tone starts at ____.',
      answer: 'nine',
      acceptableAnswers: ['9', 'nine'],
      passageId: 'listening-section-1',
      sectionNumber: 1,
      points: 1,
    },
  ],
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

const baseSafeBrowserTestData = {
  ...SAFE_TEST,
  id: PAYLOAD.testId,
  testId: PAYLOAD.testId,
  type: 'IELTS',
  skill: 'Listening',
  duration: 5,
  questionCount: 1,
  questions: [
    {
      id: 'q1',
      number: 1,
      type: 'completion',
      question: 'Complete the note: The browser proof tone starts at ____.',
      passageId: 'listening-section-1',
      sectionNumber: 1,
      points: 1,
    },
  ],
  settings: baseFullBrowserTestData.settings,
};

const result = {
  task: 'PRD-0055 Task 8.15 selected-class live private delivery proof',
  proofId,
  startedAt: new Date(startedAtMs).toISOString(),
  workerUrl: WORKER_URL,
  firebaseProjectId: PROJECT_ID,
  fixture: {
    sessionCode,
    classId,
    testId: PAYLOAD.testId,
    versionId: PAYLOAD.versionId,
    assetId: PAYLOAD.assetId,
  },
  writes: [],
  checks: [],
  explicitNonActions: [
    'No cleanup/delete.',
    'No commit/push/merge.',
    'No Cloudflare traffic percentage change.',
    'No selected-user rollout beyond this internal fixture class.',
  ],
};

try {
  const teacher = await signIn('teacher@test.com', 'password123');
  const student = await signIn('student@test.com', 'password123');
  const crossOwnerTeacher = await signIn('teacher2@test.com', 'password123');

  result.selectedTeacher = { uid: teacher.uid, email: teacher.email };
  result.selectedStudent = { uid: student.uid, email: student.email };
  result.crossOwnerTeacher = { uid: crossOwnerTeacher.uid, email: crossOwnerTeacher.email };

  const now = Date.now();
  const ownedTestFields = {
    ownerId: teacher.uid,
    createdBy: teacher.uid,
    createdByUserId: teacher.uid,
    teacherId: teacher.uid,
    userId: teacher.uid,
    isPublic: false,
    prd0055Fixture: true,
    updatedAt: now,
  };
  const fullBrowserTestData = {
    ...baseFullBrowserTestData,
    ...ownedTestFields,
    createdAt: typeof baseFullBrowserTestData.createdAt === 'number' ? baseFullBrowserTestData.createdAt : now,
  };
  const safeBrowserTestData = {
    ...baseSafeBrowserTestData,
    ...ownedTestFields,
    createdAt: typeof baseSafeBrowserTestData.createdAt === 'number' ? baseSafeBrowserTestData.createdAt : now,
  };
  const classRecord = {
    id: classId,
    name: `PRD-0055 selected class ${sessionCode}`,
    createdBy: teacher.uid,
    teacherId: teacher.uid,
    createdAt: now,
    updatedAt: now,
    students: {
      [student.uid]: {
        uid: student.uid,
        email: student.email,
        displayName: 'PRD-0055 Selected Student',
        enrolledAt: now,
      },
    },
    prd0055Fixture: true,
  };
  const masterAudioState = {
    schemaVersion: 2,
    revision: 1,
    section: 1,
    position: 0,
    isPlaying: false,
    speed: 1,
    timestamp: now,
    updateKind: 'command',
    lastAction: 'pause',
    lastActionRevision: 1,
    lastActionTimestamp: now,
    actionId: `initialize-${sessionCode}-${now}`,
    writerUid: teacher.uid,
    writerClientId: `prd0055-selected-class-${sessionCode}`,
  };
  const sessionRecord = {
    sessionCode,
    status: 'in-progress',
    createdAt: now,
    updatedAt: now,
    startTime: now,
    expiresAt: now + 24 * 60 * 60 * 1000,
    className: classRecord.name,
    teacherId: teacher.uid,
    createdByUserId: teacher.uid,
    createdBy: teacher.uid,
    classId,
    linkedClassId: classId,
    testId: PAYLOAD.testId,
    mode: 'test',
    settings: {
      autoAdvance: true,
      allowLateJoin: true,
      showLeaderboard: false,
      autoArchiveDays: 90,
      restrictToClassMembers: true,
      audioMode: 'online',
      examMode: true,
    },
    players: {
      [student.uid]: {
        name: 'PRD-0055 Selected Student',
        email: student.email,
        joinedAt: now,
      },
    },
    students: {
      [student.uid]: {
        name: 'PRD-0055 Selected Student',
        email: student.email,
        joinedAt: now,
      },
    },
    bannedPlayers: {},
    activeTests: {},
    activeQuizzes: {},
    masterAudioState,
    audioCommand: {
      schemaVersion: 2,
      commandId: masterAudioState.actionId,
      canonicalRevision: 1,
      type: 'pause',
      sectionNumber: 1,
      position: 0,
      speed: 1,
      isPlaying: false,
      timestamp: now,
      writerUid: teacher.uid,
    },
  };

  firebaseSet(`/classes/${classId}`, classRecord);
  result.writes.push(`/classes/${classId}`);
  firebaseSet(`/tests/${PAYLOAD.testId}`, fullBrowserTestData);
  result.writes.push(`/tests/${PAYLOAD.testId}`);
  firebaseSet(`/student_safe_tests/${PAYLOAD.testId}`, safeBrowserTestData);
  result.writes.push(`/student_safe_tests/${PAYLOAD.testId}`);
  firebaseSet(`/game_sessions/${sessionCode}`, sessionRecord);
  result.writes.push(`/game_sessions/${sessionCode}`);
  firebaseSet(`/session_test_payloads/${sessionCode}`, {
    testId: PAYLOAD.testId,
    generatedAt: now,
    testData: safeBrowserTestData,
  });
  result.writes.push(`/session_test_payloads/${sessionCode}`);
  firebaseSet(`/media_assets/${PAYLOAD.assetId}/references/sessions/${sessionCode}`, true);
  result.writes.push(`/media_assets/${PAYLOAD.assetId}/references/sessions/${sessionCode}`);

  const classReadback = firebaseGet(`/classes/${classId}`);
  const sessionReadback = firebaseGet(`/game_sessions/${sessionCode}`);
  const mediaSessionRefReadback = firebaseGet(`/media_assets/${PAYLOAD.assetId}/references/sessions/${sessionCode}`);
  assert(classReadback?.students?.[student.uid], 'selected student class membership missing');
  assert(sessionReadback?.settings?.restrictToClassMembers === true, 'selected class session restriction missing');
  assert(sessionReadback?.classId === classId && sessionReadback?.linkedClassId === classId, 'session class scope mismatch');
  assert(mediaSessionRefReadback === true, 'media asset session reference missing');
  result.checks.push({
    name: 'firebase-selected-class-readback',
    status: 'passed',
    classStudentPresent: Boolean(classReadback?.students?.[student.uid]),
    sessionRestrictedToClass: sessionReadback?.settings?.restrictToClassMembers === true,
    sessionClassId: sessionReadback?.classId,
    sessionLinkedClassId: sessionReadback?.linkedClassId,
    mediaSessionReference: mediaSessionRefReadback,
  });

  const teacherIssue = await postLive(teacher.idToken, liveRequestBody);
  assert(teacherIssue.status === 200 && teacherIssue.body?.deliveryReady === true, `teacher live issue failed ${teacherIssue.status}`);
  const teacherRange = await fetchRange(teacherIssue.body.url);
  assert(teacherRange.status === 206, `teacher content range failed ${teacherRange.status}`);
  assert(teacherRange.firstBytesHex.startsWith('52494646'), 'teacher content is not WAV RIFF');
  result.checks.push({
    name: 'teacher-live-private-delivery',
    status: 'passed',
    issueStatus: teacherIssue.status,
    deliveryReady: teacherIssue.body.deliveryReady,
    range: teacherRange,
  });

  const studentIssue = await postLive(student.idToken, liveRequestBody);
  assert(studentIssue.status === 200 && studentIssue.body?.deliveryReady === true, `student live issue failed ${studentIssue.status}`);
  const studentRange = await fetchRange(studentIssue.body.url);
  assert(studentRange.status === 206, `student content range failed ${studentRange.status}`);
  assert(studentRange.firstBytesHex.startsWith('52494646'), 'student content is not WAV RIFF');
  result.checks.push({
    name: 'selected-student-live-private-delivery',
    status: 'passed',
    issueStatus: studentIssue.status,
    deliveryReady: studentIssue.body.deliveryReady,
    range: studentRange,
  });

  const studentRefresh = await postLive(student.idToken, {
    ...liveRequestBody,
    previous: studentIssue.body,
  });
  const refreshAccepted = studentRefresh.status === 200 && studentRefresh.body?.deliveryReady === true;
  const refreshNotDue = studentRefresh.status === 400 && studentRefresh.body?.code === 'refresh_not_due';
  result.checks.push({
    name: 'selected-student-refresh-attempt',
    status: refreshAccepted || refreshNotDue ? 'passed' : 'failed',
    refreshStatus: studentRefresh.status,
    deliveryReady: studentRefresh.body?.deliveryReady === true,
    code: studentRefresh.body?.code,
    acceptedAsHealthyFreshToken: refreshNotDue,
  });
  assert(refreshAccepted || refreshNotDue, `student refresh gate failed ${studentRefresh.status}`);
  if (refreshAccepted) {
    result.checks.push({
      name: 'selected-student-refresh',
      status: 'passed',
      refreshStatus: studentRefresh.status,
      deliveryReady: studentRefresh.body.deliveryReady,
      tokenChanged: studentRefresh.body.tokenId !== studentIssue.body.tokenId,
    });
  }

  const crossOwnerIssue = await postLive(crossOwnerTeacher.idToken, liveRequestBody);
  result.checks.push({
    name: 'cross-owner-live-denial-attempt',
    status: crossOwnerIssue.status === 403 ? 'passed' : 'failed',
    issueStatus: crossOwnerIssue.status,
    code: crossOwnerIssue.body?.code,
  });
  assert(crossOwnerIssue.status === 403, `cross-owner live issue was not denied: ${crossOwnerIssue.status}`);
  result.checks.push({
    name: 'cross-owner-live-denial',
    status: 'passed',
    issueStatus: crossOwnerIssue.status,
    code: crossOwnerIssue.body?.code,
  });

  const wrongSection = await postLive(student.idToken, {
    ...liveRequestBody,
    sectionNumber: 2,
  });
  result.checks.push({
    name: 'wrong-section-denial-attempt',
    status: wrongSection.status === 403 ? 'passed' : 'failed',
    issueStatus: wrongSection.status,
    code: wrongSection.body?.code,
  });
  assert(wrongSection.status === 403, `wrong-section issue was not denied: ${wrongSection.status}`);
  result.checks.push({
    name: 'wrong-section-denial',
    status: 'passed',
    issueStatus: wrongSection.status,
    code: wrongSection.body?.code,
  });

  result.completedAt = new Date().toISOString();
  result.passed = true;
} catch (error) {
  result.completedAt = new Date().toISOString();
  result.passed = false;
  result.error = error instanceof Error ? redact(error.message) : redact(error);
  process.exitCode = 1;
} finally {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const redacted = JSON.parse(redact(JSON.stringify(result)));
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(redacted, null, 2)}\n`);
  console.log(OUTPUT_PATH);
}
