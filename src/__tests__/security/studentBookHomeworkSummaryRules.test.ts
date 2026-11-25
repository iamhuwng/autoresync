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

interface RtdbRulesFile {
  rules: Record<string, any>;
}

const DATABASE_RULES = readFileSync('database.rules.json', 'utf8');
const databaseRules = JSON.parse(DATABASE_RULES) as RtdbRulesFile;
const PROJECT_ID = 'demo-student-book-homework-summary-rules';
const hasDatabaseEmulator = Boolean(process.env.FIREBASE_DATABASE_EMULATOR_HOST);
const describeEmulator = hasDatabaseEmulator ? describe : describe.skip;

const BANNED_FIELDS = [
  'answerKey',
  'response',
  'credentials',
  'privateObjectKey',
  'pdfBytes',
] as const;

interface RuleAuth {
  uid: string;
  token?: Record<string, unknown>;
}

interface RuleSnapshot {
  val(): unknown;
  exists(): boolean;
  child(path: string): RuleSnapshot;
}

const createRuleSnapshot = (raw: unknown): RuleSnapshot => {
  const normalized = raw === undefined ? null : raw;
  return {
    val: () => normalized,
    exists: () => normalized !== null,
    child: (childPath: string) => {
      const parts = childPath.split('/').filter(Boolean);
      let cursor: unknown = normalized;
      for (const part of parts) {
        if (cursor !== null && typeof cursor === 'object' && !Array.isArray(cursor)) {
          cursor = (cursor as Record<string, unknown>)[part] ?? null;
        } else {
          cursor = null;
          break;
        }
      }
      return createRuleSnapshot(cursor);
    },
  };
};

const evalRuleExpression = (
  expression: boolean | string | undefined,
  context: {
    auth: RuleAuth | null;
    rootData?: Record<string, unknown>;
    data?: unknown;
    newData?: unknown;
    params?: Record<string, string>;
  },
): boolean => {
  if (expression === undefined) return false;
  if (typeof expression === 'boolean') return expression;
  if (expression === 'false') return false;
  if (expression === 'true') return true;

  const authValue = context.auth === null
    ? null
    : {
      uid: context.auth.uid,
      token: context.auth.token ?? {},
    };
  const paramEntries = Object.entries(context.params ?? {});
  const fn = new Function(
    'auth',
    'root',
    'data',
    'newData',
    ...paramEntries.map(([key]) => key),
    `return Boolean(${expression});`,
  );
  try {
    return Boolean(
      fn(
        authValue,
        createRuleSnapshot(context.rootData ?? {}),
        createRuleSnapshot(context.data ?? null),
        createRuleSnapshot(context.newData ?? null),
        ...paramEntries.map(([, value]) => value),
      ),
    );
  } catch {
    // In Firebase RTDB security rules, null dereferences (e.g. auth.uid when unauthenticated) evaluate to false.
    return false;
  }
};

const validSummary = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  studentId: 'student-1',
  homeworkId: 'homework-1',
  bookId: 'book-1',
  status: 'in_progress',
  isComplete: false,
  submittedCount: 1,
  requiredCount: 2,
  scoredCount: 1,
  pendingReviewCount: 0,
  latestSubmittedAt: 1_754_006_401_000,
  updatedAt: 1_754_006_402_000,
  activities: [
    {
      activityId: 'activity-1',
      order: 1,
      submitted: true,
      submittedAt: 1_754_006_401_000,
      gradingState: 'scored',
      score: {
        earnedScore: 1,
        maximumScore: 1,
        displayScore: '1/1',
      },
    },
    {
      activityId: 'activity-2',
      order: 2,
      submitted: false,
      submittedAt: 0,
      gradingState: 'ungraded',
    },
  ],
  ...overrides,
});

const evaluateReadAtStudentScope = (
  auth: RuleAuth | null,
  studentId: string,
  rootData: Record<string, unknown> = {},
): boolean => {
  const rootRules = databaseRules.rules;
  const node = rootRules.student_book_homework_summaries;
  return (
    evalRuleExpression(rootRules['.read'], { auth, rootData })
    || evalRuleExpression(node['.read'], { auth, rootData })
    || evalRuleExpression(node.$studentId['.read'], {
      auth,
      rootData,
      params: { $studentId: studentId },
    })
  );
};

const evaluateWriteAtStudentScope = (
  auth: RuleAuth | null,
  studentId: string,
  newData: unknown,
  rootData: Record<string, unknown> = {},
): boolean => {
  const rootRules = databaseRules.rules;
  const node = rootRules.student_book_homework_summaries;
  return (
    evalRuleExpression(rootRules['.write'], { auth, rootData, newData })
    || evalRuleExpression(node['.write'], { auth, rootData, newData })
    || evalRuleExpression(node.$studentId['.write'], {
      auth,
      rootData,
      newData,
      params: { $studentId: studentId },
    })
  );
};

const evaluateWriteAtHomeworkLeaf = (
  auth: RuleAuth | null,
  studentId: string,
  homeworkId: string,
  newData: unknown,
  rootData: Record<string, unknown> = {},
): boolean => {
  const rootRules = databaseRules.rules;
  const node = rootRules.student_book_homework_summaries;
  return (
    evalRuleExpression(rootRules['.write'], { auth, rootData, newData })
    || evalRuleExpression(node['.write'], { auth, rootData, newData })
    || evalRuleExpression(node.$studentId['.write'], {
      auth,
      rootData,
      newData,
      params: { $studentId: studentId },
    })
    || evalRuleExpression(node.$studentId.$homeworkId['.write'], {
      auth,
      rootData,
      newData,
      params: { $studentId: studentId, $homeworkId: homeworkId },
    })
  );
};

describe('student_book_homework_summaries Firebase rule contract', () => {
  it('defines root deny and keeps ancestor write closed', () => {
    const rootRules = databaseRules.rules;
    const summaries = rootRules.student_book_homework_summaries;

    expect(rootRules['.write']).toBe(false);
    expect(summaries).toBeDefined();
    expect(summaries['.read']).toBe('false');
    expect(summaries['.write']).toBe('false');
    expect(summaries.$studentId).toBeDefined();
    expect(summaries.$studentId['.read']).toBe('auth != null && auth.uid == $studentId');
    expect(summaries.$studentId['.write']).toBeUndefined();
    expect(summaries.$studentId.$homeworkId).toBeDefined();

    // Non-admin users cannot read or write the collection root.
    const studentAuth: RuleAuth = { uid: 'student-1', token: {} };
    const rootRead = evalRuleExpression(rootRules['.read'], {
      auth: studentAuth,
      rootData: { users: { 'student-1': { role: 'student' } } },
    }) || evalRuleExpression(summaries['.read'], { auth: studentAuth });
    const rootWrite = evalRuleExpression(rootRules['.write'], { auth: studentAuth })
      || evalRuleExpression(summaries['.write'], { auth: studentAuth });

    expect(rootRead).toBe(false);
    expect(rootWrite).toBe(false);
  });

  it('allows $studentId self-read only and denies unauthenticated, cross-student, and teacher reads', () => {
    const rootData = {
      users: {
        'student-1': { role: 'student' },
        'student-2': { role: 'student' },
        'teacher-1': { role: 'teacher' },
      },
    };

    expect(evaluateReadAtStudentScope({ uid: 'student-1' }, 'student-1', rootData)).toBe(true);
    expect(evaluateReadAtStudentScope(null, 'student-1', rootData)).toBe(false);
    expect(evaluateReadAtStudentScope({ uid: 'student-2' }, 'student-1', rootData)).toBe(false);
    expect(evaluateReadAtStudentScope({ uid: 'teacher-1' }, 'student-1', rootData)).toBe(false);
  });

  it('denies browser writes at $studentId and $homeworkId for students and teachers', () => {
    const payload = validSummary();
    const studentAuth: RuleAuth = { uid: 'student-1', token: {} };
    const teacherAuth: RuleAuth = { uid: 'teacher-1', token: {} };

    expect(evaluateWriteAtStudentScope(null, 'student-1', { 'homework-1': payload })).toBe(false);
    expect(evaluateWriteAtStudentScope(studentAuth, 'student-1', { 'homework-1': payload })).toBe(false);
    expect(evaluateWriteAtStudentScope(teacherAuth, 'student-1', { 'homework-1': payload })).toBe(false);

    expect(evaluateWriteAtHomeworkLeaf(null, 'student-1', 'homework-1', payload)).toBe(false);
    expect(evaluateWriteAtHomeworkLeaf(studentAuth, 'student-1', 'homework-1', payload)).toBe(false);
    expect(evaluateWriteAtHomeworkLeaf(teacherAuth, 'student-1', 'homework-1', payload)).toBe(false);
  });

  it('requires book_runtime_service claim plus exact recipient/context and payload identity match for writes', () => {
    const validWorkerAuth: RuleAuth = {
      uid: 'student-1',
      token: {
        book_runtime_service: true,
        book_runtime_recipientId: 'student-1',
        book_runtime_contextId: 'homework-1',
      },
    };

    expect(
      evaluateWriteAtHomeworkLeaf(validWorkerAuth, 'student-1', 'homework-1', validSummary()),
    ).toBe(true);

    // Missing service boolean
    expect(
      evaluateWriteAtHomeworkLeaf(
        {
          uid: 'student-1',
          token: {
            book_runtime_recipientId: 'student-1',
            book_runtime_contextId: 'homework-1',
          },
        },
        'student-1',
        'homework-1',
        validSummary(),
      ),
    ).toBe(false);

    // Mismatched recipient claim
    expect(
      evaluateWriteAtHomeworkLeaf(
        {
          uid: 'student-2',
          token: {
            book_runtime_service: true,
            book_runtime_recipientId: 'student-2',
            book_runtime_contextId: 'homework-1',
          },
        },
        'student-1',
        'homework-1',
        validSummary(),
      ),
    ).toBe(false);

    // Mismatched context claim
    expect(
      evaluateWriteAtHomeworkLeaf(
        {
          uid: 'student-1',
          token: {
            book_runtime_service: true,
            book_runtime_recipientId: 'student-1',
            book_runtime_contextId: 'homework-2',
          },
        },
        'student-1',
        'homework-1',
        validSummary(),
      ),
    ).toBe(false);

    // Mismatched payload schemaVersion / studentId / homeworkId or deletion
    expect(
      evaluateWriteAtHomeworkLeaf(
        validWorkerAuth,
        'student-1',
        'homework-1',
        validSummary({ schemaVersion: 2 }),
      ),
    ).toBe(false);
    expect(
      evaluateWriteAtHomeworkLeaf(
        validWorkerAuth,
        'student-1',
        'homework-1',
        validSummary({ studentId: 'student-2' }),
      ),
    ).toBe(false);
    expect(
      evaluateWriteAtHomeworkLeaf(
        validWorkerAuth,
        'student-1',
        'homework-1',
        validSummary({ homeworkId: 'homework-2' }),
      ),
    ).toBe(false);
    expect(
      evaluateWriteAtHomeworkLeaf(validWorkerAuth, 'student-1', 'homework-1', null),
    ).toBe(false);

    // Worker cannot write broad $studentId parent map directly
    expect(
      evaluateWriteAtStudentScope(validWorkerAuth, 'student-1', {
        'homework-1': validSummary(),
      }),
    ).toBe(false);
  });

  it.each(BANNED_FIELDS)('rejects write payloads containing banned field %s', (bannedField) => {
    const writeRule = String(
      databaseRules.rules.student_book_homework_summaries.$studentId.$homeworkId['.write'],
    );
    expect(writeRule).toContain(`!newData.child('${bannedField}').exists()`);

    const workerAuth: RuleAuth = {
      uid: 'student-1',
      token: {
        book_runtime_service: true,
        book_runtime_recipientId: 'student-1',
        book_runtime_contextId: 'homework-1',
      },
    };
    expect(
      evaluateWriteAtHomeworkLeaf(
        workerAuth,
        'student-1',
        'homework-1',
        validSummary({ [bannedField]: 'leaked' }),
      ),
    ).toBe(false);
  });
});

let testEnv: RulesTestEnvironment;

describeEmulator('student_book_homework_summaries Firebase rule emulator behavior', () => {
  beforeEach(async () => {
    if (!testEnv) {
      testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        database: { rules: DATABASE_RULES },
      });
    }
    await testEnv.clearDatabase();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.database();
      await db.ref('users/student-1/role').set('student');
      await db.ref('users/student-2/role').set('student');
      await db.ref('users/teacher-1/role').set('teacher');
      await db.ref('student_book_homework_summaries/student-1/homework-1').set(validSummary());
    });
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  it('enforces self-read, browser write denial, scoped Worker writes, and banned field rejections', async () => {
    const unauth = testEnv.unauthenticatedContext().database();
    const student1 = testEnv.authenticatedContext('student-1').database();
    const student2 = testEnv.authenticatedContext('student-2').database();
    const teacher1 = testEnv.authenticatedContext('teacher-1').database();
    const workerScoped = testEnv.authenticatedContext('student-1', {
      book_runtime_service: true,
      book_runtime_recipientId: 'student-1',
      book_runtime_contextId: 'homework-1',
    }).database();
    const workerWrongContext = testEnv.authenticatedContext('student-1', {
      book_runtime_service: true,
      book_runtime_recipientId: 'student-1',
      book_runtime_contextId: 'homework-2',
    }).database();

    await assertFails(unauth.ref('student_book_homework_summaries').once('value'));
    await assertFails(student1.ref('student_book_homework_summaries').once('value'));
    await assertSucceeds(student1.ref('student_book_homework_summaries/student-1').once('value'));
    await assertSucceeds(student1.ref('student_book_homework_summaries/student-1/homework-1').once('value'));
    await assertFails(student2.ref('student_book_homework_summaries/student-1').once('value'));
    await assertFails(teacher1.ref('student_book_homework_summaries/student-1').once('value'));

    await assertFails(student1.ref('student_book_homework_summaries/student-1').set({ 'homework-1': validSummary() }));
    await assertFails(student1.ref('student_book_homework_summaries/student-1/homework-1').set(validSummary()));
    await assertFails(teacher1.ref('student_book_homework_summaries/student-1/homework-1').set(validSummary()));
    await assertFails(workerWrongContext.ref('student_book_homework_summaries/student-1/homework-1').set(validSummary()));

    await assertSucceeds(
      workerScoped.ref('student_book_homework_summaries/student-1/homework-1').set(
        validSummary({ submittedCount: 2, status: 'completed', isComplete: true }),
      ),
    );

    for (const bannedField of BANNED_FIELDS) {
      await assertFails(
        workerScoped.ref('student_book_homework_summaries/student-1/homework-1').set(
          validSummary({ [bannedField]: 'forbidden' }),
        ),
      );
    }
  });
});
