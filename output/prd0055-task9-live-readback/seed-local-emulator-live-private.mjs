import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const proofPath = resolve(
  ROOT,
  process.env.PRD0055_FINAL_LIVE_PROOF
    || 'output/prd0055-task9-live-readback/prd0055-final-live-private-1782848559399.json',
);
const proof = JSON.parse(readFileSync(proofPath, 'utf8'));
const proofId = proof.proofId;
const fixture = proof.fixture;
const fixtureDir = join(HERE, proofId);
const emulatorUrl = (process.env.PRD0055_LOCAL_FIREBASE_DATABASE_EMULATOR_URL
  || 'http://127.0.0.1:9000').replace(/\/$/, '');
const workerUrl = (process.env.PRD0055_LOCAL_WORKER_URL || 'http://localhost:8787').replace(/\/$/, '');
const outputPath = resolve(
  HERE,
  `local-emulator-live-private-worker-proof-${proofId.replace('prd0055-final-live-private-', '')}.json`,
);
const sectionKeys = [
  `assessment-assets/listening/prd0055-final/${proofId}/section-1.wav`,
  `assessment-assets/listening/prd0055-final/${proofId}/section-2.wav`,
];
const sectionPaths = [
  join(fixtureDir, 'section-1.wav'),
  join(fixtureDir, 'section-2.wav'),
];
const wranglerNode = 'C:\\Users\\The Lord\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\bin\\node.exe';
const wranglerBin = join(ROOT, 'cloudflare', 'node_modules', 'wrangler', 'bin', 'wrangler.js');

const result = {
  task: 'PRD-0055 local emulator live private delivery seed/proof',
  proofPath,
  proofId,
  fixture,
  emulatorUrl,
  workerUrl,
  startedAt: new Date().toISOString(),
  r2Operations: [],
  emulatorWrites: [],
  checks: [],
  explicitNonActions: [
    'No production deploy.',
    'No Cloudflare traffic rollout change.',
    'No cleanup/delete.',
    'No commit/push/merge.',
    'Local emulator and local Miniflare R2 writes only.',
  ],
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readEnvFile() {
  const envPath = join(ROOT, '.env');
  const entries = {};
  if (!existsSync(envPath)) return entries;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    entries[match[1]] = match[2];
  }
  return entries;
}

function runR2Put(name, key, filePath) {
  const completed = spawnSync(
    wranglerNode,
    [
      wranglerBin,
      'r2',
      'object',
      'put',
      `kahoot-media/${key}`,
      '--file',
      filePath,
      '--local',
      '--content-type',
      'audio/wav',
      '--force',
    ],
    {
      cwd: join(ROOT, 'cloudflare'),
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  result.r2Operations.push({
    name,
    exitCode: completed.status,
    signal: completed.signal,
    stdout: completed.stdout?.slice(-1200) ?? '',
    stderr: completed.stderr?.slice(-1200) ?? '',
  });
  assert(completed.status === 0, `${name} failed`);
}

async function putEmulator(path, value) {
  const response = await fetch(`${emulatorUrl}/${path}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  const body = await response.text();
  result.emulatorWrites.push({
    path: `/${path}`,
    status: response.status,
    bodyPreview: body.slice(0, 160),
  });
  assert(response.ok, `emulator write failed for ${path}: ${response.status}`);
}

async function readEmulator(path) {
  const response = await fetch(`${emulatorUrl}/${path}.json`);
  const text = await response.text();
  assert(response.ok, `emulator read failed for ${path}: ${response.status}`);
  return text.trim() ? JSON.parse(text) : null;
}

async function signIn(email, password, apiKey) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
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
  assert(response.ok, `sign-in failed for ${email}: ${JSON.stringify(body)}`);
  return {
    uid: body.localId,
    email,
    token: body.idToken,
  };
}

async function issueDelivery(user, sectionNumber, assetId) {
  const response = await fetch(`${workerUrl}/listening-delivery/live`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${user.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      assetId,
      sessionCode: fixture.sessionCode,
      testId: fixture.testId,
      versionId: fixture.versionId,
      classId: fixture.classId,
      sectionNumber,
    }),
  });
  const body = await response.json().catch(async () => ({ raw: await response.text() }));
  return {
    status: response.status,
    body,
  };
}

async function probeContent(url) {
  const response = await fetch(url, {
    headers: { Range: 'bytes=0-15' },
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  return {
    status: response.status,
    contentType: response.headers.get('content-type'),
    acceptRanges: response.headers.get('accept-ranges'),
    contentRange: response.headers.get('content-range'),
    contentLength: response.headers.get('content-length'),
    firstBytesHex: Buffer.from(bytes).toString('hex'),
    byteLength: bytes.byteLength,
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
      tests: { [fixture.testId]: true },
      versions: { [fixture.versionId]: true },
      sessions: { [fixture.sessionCode]: true },
    },
    retainedVersions: [
      {
        versionId: fixture.versionId,
        ownerId: ownerUid,
        immutable: true,
        active: true,
      },
    ],
    retainedResults: [],
    retainedSoloAccess: [],
    retainedLiveSessions: [
      {
        sessionCode: fixture.sessionCode,
        testId: fixture.testId,
        versionId: fixture.versionId,
        active: true,
        studentUserIds: [proof.selectedStudent.uid],
        classIds: [fixture.classId],
        sectionNumbers: [sectionNumber],
      },
    ],
  };
}

try {
  mkdirSync(dirname(outputPath), { recursive: true });
  sectionPaths.forEach((filePath) => assert(existsSync(filePath), `missing WAV: ${filePath}`));
  assert(existsSync(wranglerNode), `missing x64 Node runtime: ${wranglerNode}`);
  assert(existsSync(wranglerBin), `missing Wrangler CLI: ${wranglerBin}`);

  runR2Put('local-r2-put-section-1', sectionKeys[0], sectionPaths[0]);
  runR2Put('local-r2-put-section-2', sectionKeys[1], sectionPaths[1]);

  const env = readEnvFile();
  const apiKey = env.VITE_FIREBASE_API_KEY;
  assert(apiKey, 'missing VITE_FIREBASE_API_KEY in .env');
  const teacher = await signIn('teacher@test.com', 'password123', apiKey);
  const student = await signIn('student@test.com', 'password123', apiKey);
  assert(teacher.uid === proof.selectedTeacher.uid, 'teacher uid mismatch');
  assert(student.uid === proof.selectedStudent.uid, 'student uid mismatch');

  const now = Date.now();
  const sessionRecord = {
    id: fixture.sessionCode,
    sessionCode: fixture.sessionCode,
    status: 'in-progress',
    testId: fixture.testId,
    classId: fixture.classId,
    teacherId: teacher.uid,
    createdByUserId: teacher.uid,
    currentQuestionIndex: 0,
    startedAt: now,
    updatedAt: now,
    players: {
      [student.uid]: {
        id: student.uid,
        uid: student.uid,
        name: 'PRD-0055 Local Fixture Student',
        status: 'active',
      },
    },
    students: {
      [student.uid]: true,
    },
    masterAudioState: {
      schemaVersion: 2,
      actionId: `${proofId}-local-seed`,
      actionType: 'seek',
      isPlaying: false,
      section: 2,
      position: 4,
      speed: 1,
      lastAction: 'seek',
      lastActionRevision: 2,
      lastActionTimestamp: now,
      updatedAt: now,
      writerUid: teacher.uid,
    },
  };
  const testRecord = {
    id: fixture.testId,
    testId: fixture.testId,
    title: `PRD-0055 local live private fixture ${fixture.sessionCode}`,
    teacherId: teacher.uid,
    createdBy: teacher.uid,
    authoringVersioning: {
      versionId: fixture.versionId,
      status: 'published',
    },
    audioSections: [
      {
        number: 1,
        title: 'Local private section 1',
        assetId: fixture.assetIds[0],
        duration: 8,
      },
      {
        number: 2,
        title: 'Local private section 2',
        assetId: fixture.assetIds[1],
        duration: 8,
      },
    ],
  };
  const classRecord = {
    id: fixture.classId,
    teacherId: teacher.uid,
    createdBy: teacher.uid,
    students: { [student.uid]: true },
    studentIds: [student.uid],
    updatedAt: now,
  };
  const media1 = buildMediaAsset(
    fixture.assetIds[0],
    sectionKeys[0],
    teacher.uid,
    1,
    statSync(sectionPaths[0]).size,
  );
  const media2 = buildMediaAsset(
    fixture.assetIds[1],
    sectionKeys[1],
    teacher.uid,
    2,
    statSync(sectionPaths[1]).size,
  );

  await putEmulator(`classes/${fixture.classId}`, classRecord);
  await putEmulator(`tests/${fixture.testId}`, testRecord);
  await putEmulator(`student_safe_tests/${fixture.testId}`, testRecord);
  await putEmulator(`game_sessions/${fixture.sessionCode}`, sessionRecord);
  await putEmulator(`session_test_payloads/${fixture.sessionCode}`, {
    testId: fixture.testId,
    generatedAt: now,
    testData: testRecord,
  });
  await putEmulator(`media_assets/${fixture.assetIds[0]}`, media1);
  await putEmulator(`media_assets/${fixture.assetIds[1]}`, media2);

  const sessionReadback = await readEmulator(`game_sessions/${fixture.sessionCode}`);
  const testReadback = await readEmulator(`tests/${fixture.testId}`);
  const media1Readback = await readEmulator(`media_assets/${fixture.assetIds[0]}`);
  result.checks.push({
    name: 'local-emulator-fixture-readback',
    status: 'passed',
    sessionStatus: sessionReadback?.status,
    testVersionId: testReadback?.authoringVersioning?.versionId,
    mediaDurableKey: media1Readback?.durableKey,
  });
  assert(sessionReadback?.status === 'in-progress', 'session not active after emulator seed');
  assert(testReadback?.authoringVersioning?.versionId === fixture.versionId, 'test version mismatch after emulator seed');
  assert(media1Readback?.durableKey === sectionKeys[0], 'media key mismatch after emulator seed');

  for (const [sectionIndex, assetId] of fixture.assetIds.entries()) {
    const sectionNumber = sectionIndex + 1;
    const teacherIssue = await issueDelivery(teacher, sectionNumber, assetId);
    const studentIssue = await issueDelivery(student, sectionNumber, assetId);
    result.checks.push({
      name: `local-worker-live-issue-section-${sectionNumber}`,
      status: teacherIssue.status === 200 && studentIssue.status === 200 ? 'passed' : 'failed',
      teacherIssueStatus: teacherIssue.status,
      teacherIssueBodyCode: teacherIssue.body?.code,
      studentIssueStatus: studentIssue.status,
      studentIssueBodyCode: studentIssue.body?.code,
    });
    assert(teacherIssue.status === 200, `teacher issue failed for section ${sectionNumber}: ${JSON.stringify(teacherIssue.body)}`);
    assert(studentIssue.status === 200, `student issue failed for section ${sectionNumber}: ${JSON.stringify(studentIssue.body)}`);

    const teacherRange = await probeContent(teacherIssue.body.url);
    const studentRange = await probeContent(studentIssue.body.url);
    result.checks.push({
      name: `local-worker-live-content-section-${sectionNumber}`,
      status: teacherRange.status === 206 && studentRange.status === 206 ? 'passed' : 'failed',
      teacherRange,
      studentRange,
    });
    assert(teacherRange.status === 206, `teacher content range failed for section ${sectionNumber}`);
    assert(studentRange.status === 206, `student content range failed for section ${sectionNumber}`);
  }

  result.completedAt = new Date().toISOString();
  result.passed = true;
} catch (error) {
  result.completedAt = new Date().toISOString();
  result.passed = false;
  result.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    proofId,
    outputPath,
    passed: result.passed,
    error: result.error,
    checks: result.checks.map((check) => ({
      name: check.name,
      status: check.status,
    })),
  }, null, 2));
}
