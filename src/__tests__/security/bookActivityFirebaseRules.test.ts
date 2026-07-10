import { readFileSync } from 'node:fs';
import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

const databaseRules = JSON.parse(readFileSync('database.rules.json', 'utf8')) as {
  rules: Record<string, any>;
};
const DATABASE_RULES = readFileSync('database.rules.json', 'utf8');
const PROJECT_ID = 'demo-prd-0062-book-activity-rules';
const hasDatabaseEmulator = Boolean(process.env.FIREBASE_DATABASE_EMULATOR_HOST);
const describeEmulator = hasDatabaseEmulator ? describe : describe.skip;

let testEnv: RulesTestEnvironment;

const authoringMaterial = {
  activityId: 'activity-1',
  materialId: 'activity-1',
  materialKind: 'interactive-activity',
  ownerId: 'teacher-1',
  title: 'Activity',
  lifecycleState: 'published',
  currentVersionId: 'version-1',
  createdAt: '2026-07-09T00:00:00.000Z',
  updatedAt: '2026-07-09T00:00:00.000Z',
};

const version = {
  activityId: 'activity-1',
  versionId: 'version-1',
  ownerId: 'teacher-1',
  materialKind: 'interactive-activity',
  content: {
    schemaVersion: 1,
    title: 'Activity',
    presentationMode: 'structured',
    contextRequirement: 'none',
    interactions: {
      0: {
        family: 'choice',
        prompt: 'Pick one.',
        choices: ['A', 'B'],
        hiddenInteractionId: 'hidden-1',
      },
    },
    answerRule: {
      type: 'single-choice',
      correctChoiceIndexes: [0],
    },
  },
  publishedAt: '2026-07-09T00:00:00.000Z',
  publishedBy: 'teacher-1',
};

const projection = {
  projectionKind: 'student-safe',
  activityId: 'activity-1',
  versionId: 'version-1',
  ownerId: 'teacher-1',
  title: 'Activity',
  presentationMode: 'structured',
  contextRequirement: 'none',
  interactions: {
    0: {
      clientInteractionKey: 'i1',
      family: 'choice',
      prompt: 'Pick one.',
      choices: ['A', 'B'],
    },
  },
  generatedAt: '2026-07-09T00:01:00.000Z',
};

const seed = async (): Promise<void> => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.database();
    await db.ref('users/student-1/role').set('student');
    await db.ref('users/teacher-1/role').set('teacher');
    await db.ref('users/teacher-2/role').set('teacher');
    await db.ref('users/admin-1/role').set('super_admin');
    await db.ref('book_activity/materials/activity-1').set(authoringMaterial);
    await db.ref('book_activity/versions/activity-1/version-1').set(version);
    await db.ref('book_activity/student_safe_projections/activity-1/version-1').set(projection);
  });
};

const contexts = () => ({
  admin: testEnv.authenticatedContext('admin-1'),
  student: testEnv.authenticatedContext('student-1'),
  teacher: testEnv.authenticatedContext('teacher-1'),
  otherTeacher: testEnv.authenticatedContext('teacher-2'),
});

describe('Book Activity Firebase rule contract', () => {
  it('defines Packet 1 book_activity RTDB paths and deny-by-default boundaries', () => {
    const rules = databaseRules.rules.book_activity;

    expect(rules).toBeDefined();
    expect(databaseRules.rules['.write']).toContain("newData.child('book_activity').val() === data.child('book_activity').val()");
    expect(rules.materials.$activityId['.read']).toContain("data.child('ownerId').val() === auth.uid");
    expect(rules.drafts.$activityId.$draftId['.validate']).toContain("!newData.child('editableContent').child('activityId').exists()");
    expect(rules.candidates.$candidateId['.validate']).toContain("!newData.child('replacementContent').child('hiddenInteractionId').exists()");
    expect(rules.versions.$activityId.$versionId['.write']).toBe(false);
    expect(rules.student_safe_projections.$activityId.$versionId['.write']).toBe(false);
    expect(rules.student_safe_projections.$activityId.$versionId['.validate']).toContain("!newData.child('answerRule').exists()");
    expect(rules.student_safe_projections.$activityId.$versionId['.validate']).toContain("!newData.child('hiddenInteractionId').exists()");
  });
});

describeEmulator('Book Activity Firebase rule emulator behavior', () => {
  beforeEach(async () => {
    if (!testEnv) {
      testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        database: { rules: DATABASE_RULES },
      });
    }

    await testEnv.clearDatabase();
    await seed();
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  it('denies student and cross-owner access to Activity authoring records while allowing safe projections', async () => {
    const {
      admin,
      otherTeacher,
      student,
      teacher,
    } = contexts();

    await assertSucceeds(teacher.database().ref('book_activity/materials/activity-1').once('value'));
    await assertSucceeds(admin.database().ref('book_activity/versions/activity-1/version-1').once('value'));
    await assertFails(student.database().ref('book_activity/materials/activity-1').once('value'));
    await assertFails(student.database().ref('book_activity/versions/activity-1/version-1').once('value'));
    await assertFails(otherTeacher.database().ref('book_activity/materials/activity-1').once('value'));
    await assertFails(otherTeacher.database().ref('book_activity/materials/activity-1').set({
      ...authoringMaterial,
      ownerId: 'teacher-2',
      title: 'Spoofed takeover',
    }));
    await assertFails(otherTeacher.database().ref('book_activity/drafts/activity-1/draft-spoof').set({
      activityId: 'activity-1',
      draftId: 'draft-spoof',
      ownerId: 'teacher-2',
      editableContent: {
        schemaVersion: 1,
        title: 'Spoofed draft',
        presentationMode: 'structured',
        contextRequirement: 'none',
      },
      normalizedContent: version.content,
      draftRevision: 1,
      validationState: 'valid',
      createdAt: '2026-07-09T00:02:00.000Z',
      updatedAt: '2026-07-09T00:02:00.000Z',
    }));
    await assertFails(otherTeacher.database().ref('book_activity/versions/activity-1/version-spoof').set({
      ...version,
      versionId: 'version-spoof',
      ownerId: 'teacher-2',
    }));
    await assertFails(otherTeacher.database().ref('book_activity/student_safe_projections/activity-1/version-spoof').set({
      ...projection,
      versionId: 'version-spoof',
      ownerId: 'teacher-2',
    }));

    await assertSucceeds(student.database().ref('book_activity/student_safe_projections/activity-1/version-1').once('value'));
    await assertSucceeds(teacher.database().ref('book_activity/student_safe_projections/activity-1/version-1').once('value'));
    await assertFails(otherTeacher.database().ref('book_activity/student_safe_projections/activity-1/version-1').once('value'));
    await assertFails(teacher.database().ref('book_activity/versions/activity-1/version-1').update({
      publishedAt: '2026-07-09T00:02:00.000Z',
    }));
    await assertFails(teacher.database().ref('book_activity/versions/activity-1/version-direct').set({
      ...version,
      versionId: 'version-direct',
    }));
    await assertFails(teacher.database().ref('book_activity/student_safe_projections/activity-1/version-direct').set({
      ...projection,
      versionId: 'version-direct',
    }));
    await assertFails(admin.database().ref().update({
      'book_activity/versions/activity-1/version-admin-direct': {
        ...version,
        versionId: 'version-admin-direct',
      },
    }));
    await assertFails(teacher.database().ref('book_activity/student_safe_projections/activity-1/version-unsafe').set({
      ...projection,
      versionId: 'version-unsafe',
      answerRule: { type: 'single-choice' },
    }));
  });
});
