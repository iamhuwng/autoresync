import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';

let environment: RulesTestEnvironment;
const now = 1_700_000_000_000;
const pin = { testId: 'listening', versionId: 'version-1', startTime: now, runId: 'run-1' };
const player = { studentId: 'student-1', name: 'Student', answers: { 1: 'A' }, hasSubmitted: false };
const session = {
  sessionCode: 'LIVE', createdByUserId: 'teacher-1', createdAt: now,
  status: 'waiting', testId: 'listening', expiresAt: 9_000_000_000_000,
  listeningTestPin: pin, players: { 'student-1': player }, students: { 'student-1': player },
};
const result = {
  resultId: 'trusted-result', studentId: 'student-1', testId: 'listening',
  testType: 'IELTS', testSkill: 'Listening', deliveryEngine: 'listening', materialVersionId: 'version-1',
  sessionCode: 'LIVE',
  totalScore: 1, maxScore: 1, percentage: 100, bandScore: 9, correct: 1, totalQuestions: 1,
  createdAt: now, submittedAt: now, isGuest: false,
  questionResults: [{ questionId: 'q1', questionNumber: 1, questionType: 'completion', studentAnswer: 'A', correctAnswer: 'A', isCorrect: true, score: 1, maxScore: 1, feedback: 'Correct!' }],
};
const submission = {
  id: 'submission-1', studentId: 'student-1', teacherId: 'teacher-1', homeworkId: 'homework-1',
  startedAt: now, status: 'in_progress', timeSpent: 0,
};

describe('Listening trusted scoring rules', () => {
  beforeAll(async () => {
    if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST) {
      throw new Error('Database and Firestore emulators are required');
    }
    environment = await initializeTestEnvironment({
      projectId: 'demo-listening-trusted-submit',
      database: { rules: readFileSync('database.rules.json', 'utf8') },
      firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    });
  });

  beforeEach(async () => {
    await environment.withSecurityRulesDisabled(async context => {
      await context.database().ref().set({
        users: { 'student-1': { role: 'student' }, 'student-2': { role: 'student' }, 'teacher-1': { role: 'teacher' }, 'teacher-2': { role: 'teacher' }, 'admin-1': { role: 'super_admin' } },
        tests: {
          listening: { id: 'listening', ownerId: 'teacher-1', skill: 'Listening', versionId: 'version-1', audioReplacedAt: now + 1 },
          reading: { id: 'reading', ownerId: 'teacher-1', skill: 'Reading' },
        },
        listening_authoring: { versions: { 'version-1': { testId: 'listening' } } },
        student_safe_tests: { listening: { skill: 'Listening', questions: [{ number: 1 }] } },
        homework_test_access: { listening: { 'student-1': { 'homework-1': true } } },
        game_sessions: { LIVE: session },
        session_test_payloads: { LIVE: { testId: 'listening', testData: { skill: 'Listening', questions: [{ number: 1 }] } } },
        test_results: { 'trusted-result': result },
        test_results_by_student: { 'student-1': { 'trusted-result': { resultId: result.resultId, testId: result.testId, percentage: 100 } } },
        test_results_by_session: { LIVE: { 'trusted-result': { resultId: result.resultId, studentId: result.studentId, percentage: 100 } } },
        test_results_by_teacher: { 'teacher-1': { 'trusted-result': { resultId: result.resultId, studentId: result.studentId, percentage: 100 } } },
      });
      const firestore = context.firestore();
      await firestore.doc('homework_assignments/homework-1').set({
        id: 'homework-1', createdBy: 'teacher-1', materialId: 'listening', materialType: 'test',
        materialSkill: 'listening', contentRef: { contentKind: 'ielts_listening', contentId: 'listening', version: 'version-1' },
      });
      await firestore.doc('homework_assignments/reading-homework').set({
        id: 'reading-homework', createdBy: 'teacher-1', materialType: 'test', materialSkill: 'reading',
      });
      await firestore.doc('homework_submissions/submission-1').set(submission);
    });
  });

  afterAll(async () => { await environment?.cleanup(); });

  it('lets an assigned student read recording status without exposing private questions', async () => {
    const assigned = environment.authenticatedContext('student-1').database();
    const stranger = environment.authenticatedContext('student-2').database();
    await assertSucceeds(assigned.ref('tests/listening/audioReplacedAt').once('value'));
    await assertFails(assigned.ref('tests/listening').once('value'));
    await assertFails(stranger.ref('tests/listening/audioReplacedAt').once('value'));
    await assertFails(assigned.ref('tests/listening/audioReplacedAt').set(now + 2));
  });

  it('saves the student’s generated feedback while keeping trusted Listening grading immutable', async () => {
    await environment.withSecurityRulesDisabled(context => context.database().ref('test_results/trusted-result').update({
      teacherId: 'teacher-1', visibility: { ownershipResolved: true, contextType: 'class_session', sourceType: 'session',
        sourceId: 'LIVE', sessionCode: 'LIVE', visibilityOwnerTeacherId: 'teacher-1' },
    }));
    const student = environment.authenticatedContext('student-1').database();
    const feedback = { formativeFeedback: { summary: 'Review the recording.' },
      feedbackGenerationMeta: { kind: 'ielts-listening', lastOutcome: 'saved-ai', lastAttemptAt: now } };
    await assertSucceeds(student.ref('test_results/trusted-result').update(feedback));
    await assertSucceeds(student.ref().update({ 'test_results/trusted-result/feedbackGenerationMeta': feedback.feedbackGenerationMeta }));
    await assertSucceeds(environment.authenticatedContext('teacher-1').database().ref('test_results/trusted-result').update(feedback));
    await assertFails(environment.authenticatedContext('student-2').database().ref('test_results/trusted-result').update(feedback));
    await assertFails(student.ref('test_results/trusted-result').update({ ...feedback, percentage: 0 }));
    await assertFails(student.ref('test_results').update({ 'trusted-result': { ...result, ...feedback, correct: 0 } }));
    await assertFails(student.ref('test_results/forged-result').set({ ...result, ...feedback, resultId: 'forged-result' }));
    for (const uid of ['student-1', 'teacher-1', 'admin-1']) {
      const db = environment.authenticatedContext(uid).database();
      for (const [field, value] of [['percentage', 0], ['materialVersionId', 'forged'], ['questionResults/0/score', 0],
        ['questionResults/0/studentAnswer', 'forged'], ['listeningContext', { versionId: 'forged' }]] as const) {
        try { await assertFails(db.ref(`test_results/trusted-result/${field}`).set(value)); }
        catch (error) { throw new Error(`Unexpected Listening write: ${uid}/${field}`, { cause: error }); }
      }
      await assertFails(db.ref('test_results/trusted-result').set({ ...result, ...feedback, correct: 0 }));
    }
  });

  it('denies direct and ancestor Listening source/projection tampering while preserving Reading writes', async () => {
    for (const uid of ['student-1', 'teacher-1']) {
      const db = environment.authenticatedContext(uid).database();
      await assertFails(db.ref('student_safe_tests/listening').update({ skill: 'Reading', questions: [{ correctAnswer: 'A' }] }));
      await assertFails(db.ref('student_safe_tests/listening').remove());
      await assertFails(db.ref('student_safe_tests').update({ listening: { skill: 'Reading' } }));
      await assertFails(db.ref('session_test_payloads/LIVE').update({ testId: 'reading', testData: { skill: 'Reading' } }));
      await assertFails(db.ref().update({ 'session_test_payloads/LIVE': null }));
    }
    const teacher = environment.authenticatedContext('teacher-1').database();
    await assertFails(teacher.ref('tests/listening').update({ skill: 'Reading', versionId: null }));
    await assertFails(teacher.ref('tests/listening').remove());
    await assertSucceeds(teacher.ref('tests/reading').update({ title: 'Reading title' }));
    await assertSucceeds(environment.authenticatedContext('student-1').database().ref('student_safe_tests/reading').set({ skill: 'Reading' }));
  });

  it('denies forged pins through direct, ancestor and new-session writes', async () => {
    for (const uid of ['student-1', 'teacher-1']) {
      const db = environment.authenticatedContext(uid).database();
      await assertFails(db.ref('game_sessions/LIVE/listeningTestPin').update({ versionId: 'forged' }));
      await assertFails(db.ref('game_sessions/LIVE').update({ listeningTestPin: { ...pin, versionId: 'forged' } }));
      await assertFails(db.ref().update({ 'game_sessions/LIVE/listeningTestPin': null }));
    }
    await assertFails(environment.authenticatedContext('admin-1').database().ref('game_sessions/LIVE').set({
      ...session, listeningTestPin: { ...pin, versionId: 'forged' },
    }));
    await assertFails(environment.authenticatedContext('teacher-1').database().ref('game_sessions/NEW').set({
      ...session, sessionCode: 'NEW',
    }));
  });

  it('requires the pinned initial start, permits time extensions, and permits teacher reset', async () => {
    const teacher = environment.authenticatedContext('teacher-1').database();
    await assertFails(teacher.ref('game_sessions/LIVE').update({ status: 'in-progress', startTime: now + 1 }));
    await assertSucceeds(teacher.ref('game_sessions/LIVE').update({ status: 'in-progress', startTime: pin.startTime }));
    await assertSucceeds(teacher.ref('game_sessions/LIVE/startTime').set(now + 60_000));
    await assertSucceeds(teacher.ref('game_sessions/LIVE').update({
      status: 'waiting', testId: null, startTime: null, listeningTestPin: null, lastTestId: 'listening',
    }));
    await assertSucceeds(teacher.ref('session_test_payloads/LIVE').remove());
  });

  it('permits answers/presence but rejects player grading, submitted flags and row deletion', async () => {
    const student = environment.authenticatedContext('student-1').database();
    await assertSucceeds(student.ref('game_sessions/LIVE/players/student-1').update({ answers: { 1: 'B' }, lastActivity: now + 1 }));
    for (const field of ['score', 'bandScore', 'correctCount', 'percentage', 'submittedAt', 'latestResultId', 'resultId']) {
      await assertFails(student.ref('game_sessions/LIVE').update({ [`players/student-1/${field}`]: field.endsWith('Id') ? 'forged' : 9 }));
    }
    await assertFails(student.ref('game_sessions/LIVE/players/student-1').update({ isSubmitted: true, hasSubmitted: true }));
    await assertFails(student.ref('game_sessions/LIVE/students/student-1').update({ score: 9, hasCompletedTest: true }));
    await assertFails(student.ref('game_sessions/LIVE/players/student-1').remove());
    await assertFails(student.ref('game_sessions/LIVE/students/student-1').remove());
    const teacher = environment.authenticatedContext('teacher-1').database();
    await assertFails(teacher.ref('game_sessions/LIVE/players/student-1').update({ score: 9, isSubmitted: true }));
    await assertSucceeds(teacher.ref('game_sessions/LIVE/players/student-1').update({ score: null, isSubmitted: null, hasSubmitted: false }));
    await assertSucceeds(environment.authenticatedContext('student-2').database().ref('game_sessions/LIVE/players/student-2').set({ name: 'New student', score: 0 }));
    await assertFails(teacher.ref('game_sessions/NEW').set({
      ...session, sessionCode: 'NEW', listeningTestPin: null,
      players: { 'student-1': { ...player, score: 9 } },
    }));
  });

  it('rejects Listening result creation with disguised skill and rejects trusted-result replacement', async () => {
    const student = environment.authenticatedContext('student-1').database();
    const forged = { resultId: 'forged-result', studentId: 'student-1', testId: 'listening', testSkill: 'Reading', totalScore: 9 };
    await assertFails(student.ref('test_results/forged-result').set(forged));
    await assertFails(student.ref('test_results').update({ 'forged-result': forged }));
    await assertFails(student.ref().update({ 'test_results/forged-result': forged }));
    const admin = environment.authenticatedContext('admin-1').database();
    await assertFails(admin.ref('test_results/forged-result').set(forged));
    await assertFails(admin.ref('test_results/trusted-result').set({ ...result, testId: 'reading', testSkill: 'Reading', totalScore: 9 }));
    await assertFails(admin.ref('test_results/trusted-result/totalScore').set(9));
    await assertFails(admin.ref('test_results/trusted-result/materialVersionId').remove());
    await assertFails(admin.ref('test_results/forged-engine').set({
      ...forged, resultId: 'forged-engine', testId: 'reading', deliveryEngine: 'listening',
    }));
    await assertSucceeds(admin.ref('test_results/reading-result').set({
      resultId: 'reading-result', studentId: 'student-1', testId: 'reading', testSkill: 'Reading', totalScore: 1,
    }));
  });

  it('rejects forged Listening scores in result indexes, including writes through an allowed ancestor', async () => {
    await environment.withSecurityRulesDisabled(async context => {
      const db = context.database();
      await db.ref('test_results/trusted-result').update({
        classId: 'class-1', courseId: 'course-1',
        visibility: { ownershipResolved: true, contextType: 'class_session', sourceType: 'session', sourceId: 'LIVE',
          sessionCode: 'LIVE', visibilityOwnerTeacherId: 'teacher-1', classId: 'class-1', courseId: 'course-1' },
      });
      await db.ref('game_sessions/LIVE').update({ linkedClassId: 'class-1', courseId: 'course-1' });
      await db.ref('test_results/trusted-solo').set({ ...result, resultId: 'trusted-solo', visibility: { contextType: 'solo_practice' } });
      await db.ref('test_results_solo_practice_by_student/student-1/trusted-solo').set({ resultId: 'trusted-solo', percentage: 100, submittedAt: now });
      for (const scope of ['course', 'class']) {
        await db.ref(`test_results_by_${scope}/${scope}-1/student-1/trusted-result`).set({ resultId: result.resultId, studentId: result.studentId, percentage: 100 });
      }
    });
    const paths = [
      'test_results_by_student/student-1/trusted-result',
      'test_results_by_session/LIVE/trusted-result',
      'test_results_by_teacher/teacher-1/trusted-result',
      'test_results_solo_practice_by_student/student-1/trusted-solo',
      'test_results_by_course/course-1/student-1/trusted-result',
      'test_results_by_class/class-1/student-1/trusted-result',
    ];
    for (const uid of ['student-1', 'teacher-1', 'admin-1']) {
      const db = environment.authenticatedContext(uid).database();
      for (const path of paths) {
        await assertFails(db.ref(path).update({ percentage: 9 }));
        await assertFails(db.ref().update({ [`${path}/bandScore`]: 1 }));
      }
    }
    const student = environment.authenticatedContext('student-1').database();
    await assertFails(student.ref('test_results_by_teacher/teacher-1').set({
      'trusted-result': { resultId: result.resultId, studentId: result.studentId, percentage: 9 },
    }));
    const admin = environment.authenticatedContext('admin-1').database();
    await assertFails(admin.ref('test_results_by_teacher/teacher-2/trusted-result').set({
      resultId: result.resultId, studentId: result.studentId, percentage: 9,
    }));
    await assertSucceeds(admin.ref('test_results/reading-result').set({
      resultId: 'reading-result', studentId: 'student-1', testId: 'reading', testSkill: 'Reading', totalScore: 1,
    }));
    await assertSucceeds(student.ref('test_results_by_student/student-1/reading-result').set({ resultId: 'reading-result', percentage: 1 }));
  });

  it('lets the owning teacher atomically delete a trusted live result and its indexes, then reset the player', async () => {
    await environment.withSecurityRulesDisabled(async context => {
      await context.database().ref().update({
        'test_results/trusted-result/visibility': {
          ownershipResolved: true, contextType: 'class_session', sourceType: 'session', sourceId: 'LIVE',
          sessionCode: 'LIVE', visibilityOwnerTeacherId: 'teacher-1',
        },
        'teacher_result_keys/teacher-1/trusted-result': true,
        'game_sessions/LIVE/players/student-1': {
          ...player, hasCompletedTest: true, isSubmitted: true, submittedAt: now, submittedBy: 'student',
          completedAt: now, correctCount: 1, totalQuestions: 1, percentage: 100, bandScore: 9,
          score: 1, maxScore: 1, latestResultId: result.resultId, resultId: result.resultId,
        },
      });
    });
    // Match deleteTestResult's root update so index rules see the canonical pre-write state.
    const deletion = {
      'test_results/trusted-result': null,
      'test_results_by_session/LIVE/trusted-result': null,
      'test_results_by_student/student-1/trusted-result': null,
      'teacher_result_keys/teacher-1/trusted-result': null,
    };
    await assertFails(environment.authenticatedContext('teacher-2').database().ref().update(deletion));
    const teacher = environment.authenticatedContext('teacher-1').database();
    await assertSucceeds(teacher.ref('test_results/trusted-result').once('value'));
    await assertSucceeds(teacher.ref().update(deletion));
    // Match resetStudentSessionSubmission after its linked result deletion succeeds.
    await assertSucceeds(teacher.ref('game_sessions/LIVE/players/student-1').update({
      hasCompletedTest: false,
      isSubmitted: false,
      submittedAt: null,
      submittedBy: null,
      forceSubmittedBy: null,
      forceSubmitRequestedAt: null,
      completedAt: null,
      correctCount: null,
      totalQuestions: null,
      percentage: null,
      bandScore: null,
      score: null,
      maxScore: null,
      latestResultId: null,
      resultId: null,
      submissionResetAt: now + 1,
    }));
    await environment.withSecurityRulesDisabled(async context => {
      for (const path of Object.keys(deletion)) {
        expect((await context.database().ref(path).once('value')).val()).toBeNull();
      }
      const { answers, ...resetPlayer } = (await context.database().ref('game_sessions/LIVE/players/student-1').once('value')).val();
      expect(answers[1]).toBe('A');
      expect(resetPlayer).toEqual({
        studentId: player.studentId, name: player.name, hasSubmitted: false,
        hasCompletedTest: false, isSubmitted: false, submissionResetAt: now + 1,
      });
    });
  });

  it('permits homework progress and teacher reset while reserving Listening completion for the backend', async () => {
    await environment.withSecurityRulesDisabled(async context => {
      await context.firestore().doc('homework_submissions/submission-1').update({ listeningVersionId: 'version-1' });
    });
    for (const uid of ['student-1', 'teacher-1']) {
      const firestore = environment.authenticatedContext(uid).firestore();
      const doc = firestore.doc('homework_submissions/submission-1');
      await assertSucceeds(doc.update({ timeSpent: 12, studentAnswers: { 1: 'B' } }));
      for (const patch of [{ status: 'submitted' }, { score: 9 }, { resultId: 'forged' }, { submittedAt: now + 1 }, { bandScore: 9 }, { listeningVersionId: 'forged-version' }]) {
        await assertFails(doc.update(patch));
      }
      await assertFails(doc.set(submission));
      await assertFails(firestore.doc('homework_submissions/forged-submission').set({
        ...submission, id: 'forged-submission', score: 9,
      }));
    }
    const teacher = environment.authenticatedContext('teacher-1').firestore();
    await assertSucceeds(teacher.doc('homework_submissions/submission-1').delete());
    const student = environment.authenticatedContext('student-1').firestore();
    await assertFails(student.doc('homework_submissions/submission-1').set(submission));
    await assertFails(student.doc('homework_submissions/submission-1').set({ ...submission, listeningVersionId: 'version-1' }));
    await assertSucceeds(student.doc('homework_submissions/reading-submission').set({
      ...submission, id: 'reading-submission', homeworkId: 'reading-homework',
    }));
    await assertSucceeds(student.doc('homework_submissions/reading-submission').update({ status: 'submitted', score: 1, resultId: 'reading-result' }));
  });

  it('lets the homework teacher discover and read only a matching backend Listening result proof', async () => {
    const homeworkResult = {
      ...result, resultId: 'homework-result', teacherId: 'teacher-1', sessionCode: 'homework_practice_submission-1',
      context: { type: 'homework', source: { type: 'homework', id: 'homework-1', submissionId: 'submission-1' }, assignment: { homeworkId: 'homework-1' } },
      visibility: { contextType: 'homework', sourceType: 'homework', sourceId: 'homework-1', homeworkId: 'homework-1',
        ownershipResolved: true, visibilityOwnerTeacherId: 'teacher-1' },
    };
    const proof = {
      schemaVersion: 4, materialType: 'test', testSkill: 'Listening', contextType: 'homework', resultId: 'homework-result',
      studentId: 'student-1', testId: 'listening', versionId: 'version-1', ownerTeacherId: 'teacher-1',
      homeworkId: 'homework-1', homeworkSubmissionId: 'submission-1', createdAt: now, submittedAt: now, homeworkSubmittedAt: now,
    };
    const teacher = environment.authenticatedContext('teacher-1').database();
    const student = environment.authenticatedContext('student-1').database();
    await environment.withSecurityRulesDisabled(async context => {
      await context.database().ref().update({
        'test_results/homework-result': homeworkResult,
        'teacher_result_keys/teacher-1/homework-result': true,
      });
    });
    await assertSucceeds(teacher.ref('teacher_result_keys/teacher-1').once('value'));
    await assertFails(teacher.ref('test_results/homework-result').once('value'));
    await assertFails(student.ref('result_notification_authority/homework-result').set(proof));
    await environment.withSecurityRulesDisabled(async context => {
      await context.database().ref('result_notification_authority/homework-result').set(proof);
    });
    await assertSucceeds(teacher.ref('test_results/homework-result').once('value'));
    await assertFails(environment.authenticatedContext('teacher-2').database().ref('test_results/homework-result').once('value'));
    await environment.withSecurityRulesDisabled(async context => {
      await context.database().ref('result_notification_authority/homework-result/versionId').set('wrong-version');
    });
    await assertFails(teacher.ref('test_results/homework-result').once('value'));
  });

  it('reserves Listening course completion for the backend through direct and ancestor writes', async () => {
    const path = 'course_progress/student-1/course-1/materials/listening';
    const progress = { completed: true, score: 100, resultId: result.resultId, completedAt: now };
    const student = environment.authenticatedContext('student-1').database();
    await assertFails(student.ref(path).set(progress));
    await environment.withSecurityRulesDisabled(async context => {
      await context.database().ref(path).set(progress);
    });
    for (const uid of ['student-1', 'teacher-1', 'admin-1']) {
      const db = environment.authenticatedContext(uid).database();
      await assertFails(db.ref(path).update({ score: 9 }));
      await assertFails(db.ref('course_progress/student-1/course-1').update({
        'materials/listening': { ...progress, completedAt: now + 1 },
      }));
    }
    await assertSucceeds(student.ref('course_progress/student-1/course-1/materials/reading').set({ ...progress, resultId: 'reading-result' }));
  });

  it('lets only the current course owner read backend Listening course results', async () => {
    const courseResult = {
      ...result, resultId: 'course-result', teacherId: 'teacher-1', courseId: 'course-1',
      listeningContext: { mode: 'course_material', versionId: 'version-1', courseId: 'course-1', moduleId: 'module-1' },
      context: { type: 'course_material', source: { type: 'course', id: 'course-1' }, courseId: 'course-1' },
      visibility: { contextType: 'course_material', sourceType: 'course', sourceId: 'course-1', courseId: 'course-1',
        ownershipResolved: true, visibilityOwnerTeacherId: 'teacher-1' },
    };
    await environment.withSecurityRulesDisabled(async context => {
      await context.database().ref().update({
        'courses/course-1': { ownerId: 'teacher-1' },
        'test_results/course-result': courseResult,
        'teacher_result_keys/teacher-1/course-result': true,
      });
    });
    const teacher = environment.authenticatedContext('teacher-1').database();
    await assertSucceeds(teacher.ref('teacher_result_keys/teacher-1').once('value'));
    await assertSucceeds(teacher.ref('test_results/course-result').once('value'));
    await assertFails(environment.authenticatedContext('teacher-2').database().ref('test_results/course-result').once('value'));
    await assertFails(teacher.ref('test_results/course-result').update({ courseId: 'course-2' }));
    await environment.withSecurityRulesDisabled(async context => {
      await context.database().ref('courses/course-1/ownerId').set('teacher-2');
    });
    await assertFails(teacher.ref('test_results/course-result').once('value'));
  });
});
