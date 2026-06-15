import { readFileSync } from 'node:fs';
import { refreshReadingV2MasterAssignmentFromLatest } from '../src/services/reading-v2/readingV2AssignmentRefreshRepository.service';
import { readingV2StoragePaths } from '../src/services/reading-v2/readingV2StoragePaths.service';

const parseEnv = (): Record<string, string> =>
  Object.fromEntries(
    readFileSync('.env', 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        const key = line.slice(0, index).trim();
        let value = line.slice(index + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        return [key, value];
      }),
  );

const env = parseEnv();
const referer = 'http://localhost:5173/';
const apiKey = env.VITE_FIREBASE_API_KEY;
const databaseUrl = env.VITE_FIREBASE_DATABASE_URL?.replace(/\/$/, '');

if (!apiKey || !databaseUrl) {
  throw new Error('Missing Firebase API key or database URL env.');
}

const authResponse = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Referer: referer,
    },
    body: JSON.stringify({
      email: 'teacher@test.com',
      password: 'password123',
      returnSecureToken: true,
    }),
  },
);

if (!authResponse.ok) {
  throw new Error(`Teacher auth failed: ${authResponse.status}`);
}

const authPayload = await authResponse.json() as { idToken: string; localId: string };
const idToken = authPayload.idToken;
const ownerId = authPayload.localId;

const withAuth = (path: string): string =>
  `${databaseUrl}/${path.replace(/^\/+/, '')}.json?auth=${encodeURIComponent(idToken)}`;

const readRtdb = async (path: string): Promise<unknown> => {
  const response = await fetch(withAuth(path), { headers: { Referer: referer } });
  if (!response.ok) {
    throw new Error(`RTDB read failed: ${response.status}`);
  }
  return response.json();
};

const patchRoot = async (updates: Record<string, unknown | null>): Promise<void> => {
  const response = await fetch(`${databaseUrl}/.json?auth=${encodeURIComponent(idToken)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Referer: referer,
    },
    body: JSON.stringify(updates),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`RTDB patch failed: ${response.status} ${text.slice(0, 200)} pathCount=${Object.keys(updates).length}`);
  }
};

const pad = (value: number): string => String(value).padStart(2, '0');
const now = new Date();
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
const fixtureId = `e2e-prd0052-0054-broken-assignment-${stamp}`;
const compositionId = `${fixtureId}-composition`;
const versionId = `${fixtureId}-version`;
const passageMaterialId = `${fixtureId}-archived-passage`;
const createdAt = now.toISOString();

await patchRoot({
  [readingV2StoragePaths.fullTestCompositions(compositionId)]: {
    deliveryEngine: 'reading-v2',
    plane: 'packaging',
    schemaVersion: 1,
    compositionId,
    testMaterialId: fixtureId,
    title: fixtureId,
    ownerId,
    publishedVersionId: versionId,
    skill: 'reading',
    testTypeIds: ['ielts'],
    state: 'published',
    visibility: 'private',
    hasBrokenRefs: true,
    brokenRefCount: 1,
    brokenRefReasons: ['archived'],
    passageRefs: [{
      refId: `${fixtureId}-ref-1`,
      passageMaterialId,
      materialId: passageMaterialId,
      snapshotVersionId: `${fixtureId}-snapshot`,
      order: 1,
      sourceOrderDisplaySnapshot: 'Passage 1',
      titleSnapshot: `${fixtureId} archived passage`,
      questionCountSnapshot: 1,
      testTypeIdsSnapshot: ['ielts'],
      source: { sourceOrderDisplay: 'Passage 1' },
    }],
    questionCount: 1,
    numbering: { passageRanges: [], interactionDisplayNumbers: {}, totalQuestionCount: 1 },
    createdAt,
    updatedAt: createdAt,
  },
});

let writeAttemptCount = 0;
let updateAttemptCount = 0;
let blockMessage = '';

try {
  await refreshReadingV2MasterAssignmentFromLatest({
    homework: {
      id: `${fixtureId}-homework`,
      materialType: 'reading-passage-set',
      materialId: fixtureId,
      materialTitle: fixtureId,
      readingPassageSet: {
        titleSnapshot: fixtureId,
        compositionId,
        compositionVersionId: `${fixtureId}-old-version`,
        items: [],
      },
    } as never,
    submissions: [{ id: `${fixtureId}-sub`, status: 'not_started' }] as never,
    adapter: {
      readRtdb,
      writeRtdb: async () => {
        writeAttemptCount += 1;
        throw new Error('Unexpected assignment payload write.');
      },
      updateHomeworkAssignment: async () => {
        updateAttemptCount += 1;
        throw new Error('Unexpected homework assignment update.');
      },
    },
  });
} catch (error) {
  blockMessage = error instanceof Error ? error.message : String(error);
}

console.log(JSON.stringify({
  fixtureId,
  liveCompositionWritten: Boolean(await readRtdb(readingV2StoragePaths.fullTestCompositions(compositionId))),
  blockedBrokenMaster: blockMessage.includes('unresolved broken Reading Passage refs'),
  writeAttemptCount,
  updateAttemptCount,
}, null, 2));
