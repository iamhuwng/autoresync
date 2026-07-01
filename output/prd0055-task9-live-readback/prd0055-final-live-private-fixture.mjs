import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const PROJECT_ID = 'temp-a1437';
const WORKER_URL = 'https://r2-upload-signer.iamhuwng.workers.dev';
const OUTPUT_DIR = join(ROOT, 'output', 'prd0055-task9-live-readback');
const firebaseBin = join(ROOT, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
const wranglerBin = join(ROOT, 'cloudflare', 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const bundledX64Node = 'C:\\Users\\The Lord\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\bin\\node.exe';
const wranglerNode = bundledX64Node;

const startedAtMs = Date.now();
const proofId = `prd0055-final-live-private-${startedAtMs}`;
const sessionCode = `T8${Math.random().toString(36).slice(2, 6).toUpperCase()}`.replace(/[^A-Z0-9]/g, 'X');
const classId = `${proofId}-class`;
const testId = `${proofId}-test`;
const versionId = `${proofId}-version`;
const assetId1 = `${proofId}-asset-s1`;
const assetId2 = `${proofId}-asset-s2`;
const section1Key = `assessment-assets/listening/prd0055-final/${proofId}/section-1.wav`;
const section2Key = `assessment-assets/listening/prd0055-final/${proofId}/section-2.wav`;
const fixtureDir = join(OUTPUT_DIR, proofId);
const outputPath = join(OUTPUT_DIR, `${proofId}.json`);

const redact = (value) => String(value)
  .replace(/auth=[^&\s"]+/g, 'auth=[redacted]')
  .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [redacted]')
  .replace(/token=[^&\s"]+/g, 'token=[redacted]')
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

function buildAudibleWavBuffer(durationSeconds, frequencyHz) {
  const sampleRate = 8_000;
  const bytesPerSample = 2;
  const sampleCount = Math.max(1, Math.floor(sampleRate * durationSeconds));
  const dataSize = sampleCount * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(bytesPerSample * 8, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  const amplitude = 0.2 * 0x7fff;
  for (let i = 0; i < sampleCount; i += 1) {
    const envelope = Math.min(1, i / 200, (sampleCount - i) / 200);
    const sample = Math.round(Math.sin((2 * Math.PI * frequencyHz * i) / sampleRate) * amplitude * envelope);
    buffer.writeInt16LE(sample, 44 + (i * bytesPerSample));
  }
  return buffer;
}

function run(name, cwd, commandArgs, options = {}) {
  const artifact = join(OUTPUT_DIR, `${proofId}-${name}.txt`);
  const result = spawnSync(commandArgs[0], commandArgs.slice(1), {
    cwd,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 20 * 1024 * 1024,
  });
  const payload = [
    `$ ${commandArgs.map((arg) => String(arg).includes(' ') ? `"${arg}"` : arg).join(' ')}`,
    `exit=${result.status}`,
    '--- stdout ---',
    redact(result.stdout || ''),
    '--- stderr ---',
    redact(result.stderr || ''),
  ].join('\n');
  writeFileSync(artifact, payload, 'utf8');
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${name} failed; see ${artifact}`);
  }
  return {
    name,
    exitCode: result.status,
    artifact: artifact.replace(`${ROOT}\\`, '').replaceAll('\\', '/'),
  };
}

function runFirebase(args) {
  const result = spawnSync(process.execPath, [
    firebaseBin,
    ...args,
    '--project',
    PROJECT_ID,
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`firebase ${args.join(' ')} failed: ${redact(result.stderr || result.stdout || 'no output')}`);
  }
  return result.stdout.trim();
}

function firebaseSet(path, value) {
  runFirebase(['database:set', path, '--data', JSON.stringify(value), '--force']);
}

function firebaseGet(path) {
  const text = runFirebase(['database:get', path]);
  return text ? JSON.parse(text) : null;
}

async function signIn(email, password, apiKey) {
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
}

async function postLive(token, body) {
  const response = await fetch(`${WORKER_URL}/listening-delivery/live`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    ok: response.ok,
    body: await response.json().catch(() => ({})),
  };
}

async function fetchRange(url) {
  const response = await fetch(url, { headers: { Range: 'bytes=0-15' } });
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
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function buildQuestions(includeAnswers) {
  return [
    {
      id: 'q1',
      number: 1,
      type: 'completion',
      question: 'Complete the note: Section one tone starts at ____.',
      passageId: 'listening-section-1',
      sectionNumber: 1,
      points: 1,
      ...(includeAnswers ? { answer: 'one', acceptableAnswers: ['one', '1'] } : {}),
    },
    {
      id: 'q2',
      number: 2,
      type: 'completion',
      question: 'Complete the note: Section one asks for the ____ card.',
      passageId: 'listening-section-1',
      sectionNumber: 1,
      points: 1,
      ...(includeAnswers ? { answer: 'student', acceptableAnswers: ['student'] } : {}),
    },
    {
      id: 'q3',
      number: 3,
      type: 'completion',
      question: 'Complete the note: Section two tone starts at ____.',
      passageId: 'listening-section-2',
      sectionNumber: 2,
      points: 1,
      ...(includeAnswers ? { answer: 'two', acceptableAnswers: ['two', '2'] } : {}),
    },
    {
      id: 'q4',
      number: 4,
      type: 'completion',
      question: 'Complete the note: Section two ends on the ____ floor.',
      passageId: 'listening-section-2',
      sectionNumber: 2,
      points: 1,
      ...(includeAnswers ? { answer: 'third', acceptableAnswers: ['third', '3rd'] } : {}),
    },
  ];
}

function buildTestData(ownerUid, includeAnswers) {
  const now = startedAtMs;
  return {
    id: testId,
    testId,
    title: 'PRD-0055 Final Deployed Private Delivery Fixture',
    type: 'IELTS',
    testType: 'IELTS',
    testSkill: 'listening',
    skill: 'Listening',
    skillType: 'listening',
    ownerId: ownerUid,
    createdBy: ownerUid,
    createdByUserId: ownerUid,
    teacherId: ownerUid,
    userId: ownerUid,
    isPublic: false,
    visibility: 'private',
    duration: 8,
    questionCount: 4,
    createdAt: now,
    updatedAt: now,
    versionId,
    authoringVersioning: { versionId },
    settings: {
      allowPause: true,
      showTimer: true,
      shuffleQuestions: false,
      showResults: 'after-submission',
      allowReview: true,
      passingScore: 60,
      allowReplay: true,
    },
    audioSections: [
      {
        number: 1,
        name: 'Section 1',
        assetId: assetId1,
        audioUrl: '',
        streamUrl: '',
        startQuestion: 1,
        endQuestion: 2,
        duration: 8,
        waitTimeBefore: 0,
      },
      {
        number: 2,
        name: 'Section 2',
        assetId: assetId2,
        audioUrl: '',
        streamUrl: '',
        startQuestion: 3,
        endQuestion: 4,
        duration: 8,
        waitTimeBefore: 0,
      },
    ],
    passages: [],
    questions: buildQuestions(includeAnswers),
    metadata: {
      source: 'prd0055-final-live-private-fixture',
      fixtureOnly: true,
      ownerId: ownerUid,
      skill: 'Listening',
    },
  };
}

function buildMediaAsset(assetId, durableKey, ownerUid, sectionNumber, sizeBytes) {
  return {
    assetId,
    canonicalAssetId: assetId,
    ownerId: ownerUid,
    state: 'committed',
    durableKey,
    contentType: 'audio/wav',
    sizeBytes,
    references: {
      tests: { [testId]: true },
      versions: { [versionId]: true },
      sessions: { [sessionCode]: true },
    },
    retainedVersions: [
      { versionId, ownerId: ownerUid, immutable: true, active: true },
    ],
    retainedLiveSessions: [
      {
        sessionCode,
        testId,
        versionId,
        active: true,
        studentUserIds: [],
        classIds: [classId],
        sectionNumbers: [sectionNumber],
      },
    ],
  };
}

const result = {
  task: 'PRD-0055 final deployed live private delivery fixture',
  proofId,
  startedAt: new Date(startedAtMs).toISOString(),
  workerUrl: WORKER_URL,
  firebaseProjectId: PROJECT_ID,
  fixture: {
    sessionCode,
    classId,
    testId,
    versionId,
    assetIds: [assetId1, assetId2],
  },
  writes: [],
  r2Operations: [],
  checks: [],
  explicitNonActions: [
    'No cleanup/delete.',
    'No commit/push/merge.',
    'No Cloudflare traffic percentage change.',
    'Internal fixture Firebase/R2 writes only.',
  ],
};

try {
  mkdirSync(fixtureDir, { recursive: true });
  const env = readEnvFile();
  const apiKey = env.VITE_FIREBASE_API_KEY;
  if (!apiKey) throw new Error('Missing VITE_FIREBASE_API_KEY in .env');

  const section1Bytes = buildAudibleWavBuffer(8, 440);
  const section2Bytes = buildAudibleWavBuffer(8, 554);
  const section1Path = join(fixtureDir, 'section-1.wav');
  const section2Path = join(fixtureDir, 'section-2.wav');
  writeFileSync(section1Path, section1Bytes);
  writeFileSync(section2Path, section2Bytes);

  result.r2Operations.push(run('r2-put-section-1', join(ROOT, 'cloudflare'), [
    wranglerNode,
    wranglerBin,
    'r2',
    'object',
    'put',
    `kahoot-media/${section1Key}`,
    '--file',
    section1Path,
    '--remote',
  ]));
  result.r2Operations.push(run('r2-put-section-2', join(ROOT, 'cloudflare'), [
    wranglerNode,
    wranglerBin,
    'r2',
    'object',
    'put',
    `kahoot-media/${section2Key}`,
    '--file',
    section2Path,
    '--remote',
  ]));

  const teacher = await signIn('teacher@test.com', 'password123', apiKey);
  const student = await signIn('student@test.com', 'password123', apiKey);
  const crossOwnerTeacher = await signIn('teacher2@test.com', 'password123', apiKey);
  result.selectedTeacher = { uid: teacher.uid, email: teacher.email };
  result.selectedStudent = { uid: student.uid, email: student.email };
  result.crossOwnerTeacher = { uid: crossOwnerTeacher.uid, email: crossOwnerTeacher.email };

  const now = Date.now();
  const fullTestData = buildTestData(teacher.uid, true);
  const safeTestData = buildTestData(teacher.uid, false);
  const classRecord = {
    id: classId,
    name: `PRD-0055 final selected class ${sessionCode}`,
    createdBy: teacher.uid,
    teacherId: teacher.uid,
    createdAt: now,
    updatedAt: now,
    students: {
      [student.uid]: {
        uid: student.uid,
        email: student.email,
        displayName: 'PRD-0055 Final Selected Student',
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
    writerClientId: `prd0055-final-live-${sessionCode}`,
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
    testId,
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
        name: 'PRD-0055 Final Selected Student',
        email: student.email,
        joinedAt: now,
      },
    },
    students: {
      [student.uid]: {
        name: 'PRD-0055 Final Selected Student',
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
  const mediaAsset1 = buildMediaAsset(assetId1, section1Key, teacher.uid, 1, section1Bytes.length);
  const mediaAsset2 = buildMediaAsset(assetId2, section2Key, teacher.uid, 2, section2Bytes.length);
  mediaAsset1.retainedLiveSessions[0].studentUserIds = [student.uid];
  mediaAsset2.retainedLiveSessions[0].studentUserIds = [student.uid];

  firebaseSet(`/classes/${classId}`, classRecord);
  result.writes.push(`/classes/${classId}`);
  firebaseSet(`/tests/${testId}`, fullTestData);
  result.writes.push(`/tests/${testId}`);
  firebaseSet(`/student_safe_tests/${testId}`, safeTestData);
  result.writes.push(`/student_safe_tests/${testId}`);
  firebaseSet(`/game_sessions/${sessionCode}`, sessionRecord);
  result.writes.push(`/game_sessions/${sessionCode}`);
  firebaseSet(`/session_test_payloads/${sessionCode}`, {
    testId,
    generatedAt: now,
    testData: safeTestData,
  });
  result.writes.push(`/session_test_payloads/${sessionCode}`);
  firebaseSet(`/media_assets/${assetId1}`, mediaAsset1);
  result.writes.push(`/media_assets/${assetId1}`);
  firebaseSet(`/media_assets/${assetId2}`, mediaAsset2);
  result.writes.push(`/media_assets/${assetId2}`);

  const classReadback = firebaseGet(`/classes/${classId}`);
  const sessionReadback = firebaseGet(`/game_sessions/${sessionCode}`);
  const media1Readback = firebaseGet(`/media_assets/${assetId1}`);
  const media2Readback = firebaseGet(`/media_assets/${assetId2}`);
  assert(classReadback?.students?.[student.uid], 'selected student class membership missing');
  assert(sessionReadback?.settings?.restrictToClassMembers === true, 'selected class restriction missing');
  assert(media1Readback?.durableKey === section1Key, 'section 1 media asset durable key mismatch');
  assert(media2Readback?.durableKey === section2Key, 'section 2 media asset durable key mismatch');
  result.checks.push({
    name: 'firebase-final-fixture-readback',
    status: 'passed',
    classStudentPresent: Boolean(classReadback?.students?.[student.uid]),
    sessionRestrictedToClass: sessionReadback?.settings?.restrictToClassMembers === true,
    sessionClassId: sessionReadback?.classId,
    mediaDurableKeys: [media1Readback?.durableKey, media2Readback?.durableKey],
  });

  const liveBody = (assetId, sectionNumber) => ({
    assetId,
    sessionCode,
    testId,
    versionId,
    classId,
    sectionNumber,
  });

  for (const [label, assetId, sectionNumber] of [
    ['section-1', assetId1, 1],
    ['section-2', assetId2, 2],
  ]) {
    const teacherIssue = await postLive(teacher.idToken, liveBody(assetId, sectionNumber));
    assert(teacherIssue.status === 200 && teacherIssue.body?.deliveryReady === true, `${label} teacher issue failed ${teacherIssue.status}`);
    const teacherRange = await fetchRange(teacherIssue.body.url);
    assert(teacherRange.status === 206, `${label} teacher range failed ${teacherRange.status}`);
    assert(teacherRange.firstBytesHex.startsWith('52494646'), `${label} teacher content is not WAV RIFF`);

    const studentIssue = await postLive(student.idToken, liveBody(assetId, sectionNumber));
    assert(studentIssue.status === 200 && studentIssue.body?.deliveryReady === true, `${label} student issue failed ${studentIssue.status}`);
    const studentRange = await fetchRange(studentIssue.body.url);
    assert(studentRange.status === 206, `${label} student range failed ${studentRange.status}`);
    assert(studentRange.firstBytesHex.startsWith('52494646'), `${label} student content is not WAV RIFF`);

    result.checks.push({
      name: `${label}-teacher-student-live-private-delivery`,
      status: 'passed',
      teacherIssueStatus: teacherIssue.status,
      teacherRange,
      studentIssueStatus: studentIssue.status,
      studentRange,
    });
  }

  const crossOwnerIssue = await postLive(crossOwnerTeacher.idToken, liveBody(assetId1, 1));
  assert(crossOwnerIssue.status === 403, `cross-owner live issue was not denied: ${crossOwnerIssue.status}`);
  result.checks.push({
    name: 'cross-owner-live-denial',
    status: 'passed',
    issueStatus: crossOwnerIssue.status,
    code: crossOwnerIssue.body?.code,
  });

  const wrongSection = await postLive(student.idToken, liveBody(assetId1, 2));
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
  writeFileSync(outputPath, `${JSON.stringify(redacted, null, 2)}\n`);
  console.log(outputPath);
}
