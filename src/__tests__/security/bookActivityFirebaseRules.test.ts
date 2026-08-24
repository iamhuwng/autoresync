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
  activityVersionId: 'version-1',
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
  activityVersionId: 'version-1',
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
    await db.ref('book_activity_authoring/owners/teacher-1').set({
      activity: authoringMaterial,
      draft: version.content,
    });
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
  it('defines the current split authoring/canonical Activity roots and deny-by-default boundaries', () => {
    const rules = databaseRules.rules;
    const activity = rules.book_activity;
    const authoring = rules.book_activity_authoring;
    const canonicalVersion = activity.versions.$activityId.$versionId;
    const safeProjection = activity.student_safe_projections.$activityId.$versionId;

    expect(activity).toBeDefined();
    expect(activity['.read']).toBe('false');
    expect(activity['.write']).toBe('false');
    expect(authoring['.read']).toBe('false');
    expect(authoring['.write']).toBe('false');
    expect(authoring.owners.$ownerId['.read']).toContain('book_activity_authoring_service');
    expect(authoring.owners.$ownerId['.write']).toContain('book_activity_authoring_ownerId');
    expect(canonicalVersion['.read']).toContain('book_activity_runtime_reader_service');
    expect(canonicalVersion['.write']).toContain('book_activity_publication_writer_service');
    expect(safeProjection['.read']).toContain('book_activity_runtime_reader_service');
    expect(safeProjection['.write']).toContain('book_activity_publication_writer_service');
    expect(safeProjection.$other['.validate']).toContain("$other == 'content'");
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

  it('denies browser and cross-owner access while allowing exact service identities and super-admin reads', async () => {
    const {
      admin,
      otherTeacher,
      student,
      teacher,
    } = contexts();
    const authoringService = testEnv.authenticatedContext('authoring-service', {
      book_activity_authoring_service: true,
      book_activity_authoring_ownerId: 'teacher-1',
    });
    const otherAuthoringService = testEnv.authenticatedContext('other-authoring-service', {
      book_activity_authoring_service: true,
      book_activity_authoring_ownerId: 'teacher-2',
    });
    const publicationWriter = testEnv.authenticatedContext('publication-writer', {
      book_activity_publication_writer_service: true,
      book_activity_publication_writer_ownerId: 'teacher-1',
      book_activity_publication_writer_activityId: 'activity-1',
      book_activity_publication_writer_activityVersionId: 'version-1',
    });
    const otherPublicationWriter = testEnv.authenticatedContext('other-publication-writer', {
      book_activity_publication_writer_service: true,
      book_activity_publication_writer_ownerId: 'teacher-2',
      book_activity_publication_writer_activityId: 'activity-1',
      book_activity_publication_writer_activityVersionId: 'version-1',
    });

    await assertSucceeds(authoringService.database().ref('book_activity_authoring/owners/teacher-1').once('value'));
    await assertFails(otherAuthoringService.database().ref('book_activity_authoring/owners/teacher-1').once('value'));
    await assertFails(teacher.database().ref('book_activity_authoring/owners/teacher-1').once('value'));
    await assertFails(student.database().ref('book_activity_authoring/owners/teacher-1').once('value'));
    await assertSucceeds(publicationWriter.database().ref('book_activity/versions/activity-1/version-1').once('value'));
    await assertSucceeds(publicationWriter.database().ref('book_activity/student_safe_projections/activity-1/version-1').once('value'));
    await assertFails(student.database().ref('book_activity/versions/activity-1/version-1').once('value'));
    await assertFails(student.database().ref('book_activity/student_safe_projections/activity-1/version-1').once('value'));
    await assertSucceeds(admin.database().ref('book_activity/versions/activity-1/version-1').once('value'));
    await assertFails(otherTeacher.database().ref('book_activity/student_safe_projections/activity-1/version-1').once('value'));
    await assertFails(teacher.database().ref('book_activity/versions/activity-1/version-1').set(version));
    await assertFails(teacher.database().ref('book_activity/student_safe_projections/activity-1/version-1').set(projection));
    await assertFails(otherPublicationWriter.database().ref('book_activity/versions/activity-1/version-1').set(version));
    await assertFails(otherPublicationWriter.database().ref('book_activity/student_safe_projections/activity-1/version-1').set(projection));
    await assertFails(publicationWriter.database().ref('book_activity/versions/activity-1/version-1').set(version));
    await assertFails(publicationWriter.database().ref('book_activity/student_safe_projections/activity-1/version-1').set(projection));
    await assertFails(publicationWriter.database().ref('book_activity/versions/activity-1').update({
      'version-1': version,
    }));
    await assertFails(publicationWriter.database().ref('book_activity/student_safe_projections/activity-1').update({
      'version-1': projection,
    }));
    await assertFails(publicationWriter.database().ref('book_activity/versions/activity-1/version-1').update({
      publishedAt: '2026-07-09T00:02:00.000Z',
    }));
    await assertFails(publicationWriter.database().ref('book_activity/student_safe_projections/activity-1/version-1').update({
      publishedAt: '2026-07-09T00:02:00.000Z',
    }));
    await assertFails(publicationWriter.database().ref('book_activity/versions/activity-1/version-1').remove());
    await assertFails(publicationWriter.database().ref('book_activity/student_safe_projections/activity-1/version-1').remove());
  });
});
