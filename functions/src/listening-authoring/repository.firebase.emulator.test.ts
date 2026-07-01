import * as admin from 'firebase-admin';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ListeningAuthoringDocumentV1 } from './contracts';
import { createFirebaseListeningAuthoringRepository } from './repository';
import {
  publishListeningDraftCore,
  saveListeningDraftCore,
} from './service';

const hasDatabaseEmulator = Boolean(process.env.FIREBASE_DATABASE_EMULATOR_HOST);
const projectId = 'temp-a1437';
const appName = 'listening-authoring-repository-emulator-tests';
const auth = { uid: 'teacher-1', role: 'teacher' as const };

const document: ListeningAuthoringDocumentV1 = {
  title: 'Concurrent test',
  type: 'IELTS',
  skill: 'Listening',
  duration: 1800,
  difficulty: 'Intermediate',
  questionCount: 1,
  isPublic: false,
  isComplete: true,
  displayMode: 'text',
  metadata: {
    description: 'Emulator transaction proof',
    instructions: 'Answer every question.',
    tags: [],
  },
  audioSections: [{
    number: 1,
    name: 'Section 1',
    assetId: 'asset-1',
    audioUrl: 'r2://asset-1',
    startQuestion: 1,
    endQuestion: 1,
  }],
  questions: [{
    number: 1,
    type: 'short-answer',
    question: 'Question 1',
    answer: 'A',
    sectionNumber: 1,
    points: 1,
  }],
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

describe.runIf(hasDatabaseEmulator)('Firebase listening authoring transactions', () => {
  let app: admin.app.App;
  let db: admin.database.Database;

  beforeAll(() => {
    app = admin.initializeApp({
      projectId,
      databaseURL: `https://${projectId}-default-rtdb.firebaseio.com`,
    }, appName);
    db = app.database();
  });

  beforeEach(async () => {
    await db.ref().set(null);
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
  });

  afterAll(async () => {
    vi.useRealTimers();
    await app.delete();
  });

  it('converges concurrent same-key legacy first-edit requests to one atomic result', async () => {
    const legacyTest = {
      id: 'legacy-concurrent',
      ownerId: auth.uid,
      createdAt: 1_600_000_000_000,
      createdBy: auth.uid,
      updatedAt: 1_600_000_000_500,
      isPublished: true,
      ...document,
    };
    await db.ref(`tests/${legacyTest.id}`).set(legacyTest);

    const publish = () => publishListeningDraftCore({
      auth,
      body: {
        legacyTestId: legacyTest.id,
        idempotencyKey: 'same-concurrent-key',
      },
      repo: createFirebaseListeningAuthoringRepository(db),
      idempotencySecret: 'emulator-secret',
    });
    const [first, second] = await Promise.all([publish(), publish()]);

    expect(first).toEqual(second);
    expect(first.status).toBe('published');
    const root = (await db.ref().get()).val();
    expect(Object.keys(root.listening_authoring.versions)).toHaveLength(1);
    expect(Object.keys(root.listening_authoring.revision_drafts)).toHaveLength(1);
    expect(Object.keys(root.listening_authoring.operations)).toHaveLength(1);
    expect(root.tests[legacyTest.id]).toEqual({
      ...legacyTest,
      authoringVersioning: expect.objectContaining({
        frozen: true,
        versionNumber: 1,
      }),
    });
  });

  it('allows one concurrent draft CAS update and records the loser as a conflict', async () => {
    const initial = await saveListeningDraftCore({
      auth,
      body: { idempotencyKey: 'create-draft', document },
      repo: createFirebaseListeningAuthoringRepository(db),
      idempotencySecret: 'emulator-secret',
    });
    expect(initial.status).toBe('saved');
    if (initial.status !== 'saved') {
      throw new Error(`expected saved draft, got ${initial.status}`);
    }

    const update = (suffix: string) => saveListeningDraftCore({
      auth,
      body: {
        draftId: initial.draftId,
        expectedConflictToken: initial.conflictToken,
        idempotencyKey: `update-${suffix}`,
        document: { ...document, title: `Update ${suffix}` },
      },
      repo: createFirebaseListeningAuthoringRepository(db),
      idempotencySecret: 'emulator-secret',
    });
    const results = await Promise.all([update('A'), update('B')]);

    expect(results.map((result) => result.status).sort()).toEqual(['conflict', 'saved']);
    const storedDraft = (await db.ref(
      `listening_authoring/drafts/${initial.draftId}`,
    ).get()).val();
    expect(storedDraft.conflictToken).toBe(2);
    expect(['Update A', 'Update B']).toContain(storedDraft.document.title);
    const operations = (await db.ref('listening_authoring/operations').get()).val();
    expect(Object.keys(operations)).toHaveLength(3);
  });
});
