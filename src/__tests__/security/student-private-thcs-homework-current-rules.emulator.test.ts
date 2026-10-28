// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment,
    type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import type { Database } from 'firebase/database';
import { saveTestResult } from '../../services/testResults.service';

const client = vi.hoisted(() => ({ database: undefined as Database | undefined }));
vi.mock('../../services/firebase', () => ({ get database() { return client.database; } }));
vi.mock('../../services/resultOwnershipResolver', () => ({
    resolveResultOwnership: vi.fn(async ({ result }: any) => ({
        visibility: {
            contextType: 'homework', sourceType: 'homework', sourceId: result.context.assignment.homeworkId,
            sourceNameSnapshot: result.context.source.name, visibilityOwnerTeacherId: 'homework-owner',
            ownerResolutionSource: 'homework.createdBy', ownershipResolved: true, unresolvedReason: null,
            homeworkId: result.context.assignment.homeworkId, sessionCode: null,
            courseId: null, classId: null, assignmentId: null,
        },
        sourceLookupAttempted: true,
        strongestKnownSourceClue: `homework:${result.context.assignment.homeworkId}`,
    })),
}));
vi.mock('../../services/resultVisibilityReporting.service', () => ({
    clearUnresolvedResultVisibilityReport: vi.fn().mockResolvedValue(undefined),
    upsertUnresolvedResultVisibilityReport: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../services/notificationProducerClient', () => ({
    createTrustedNotification: vi.fn().mockResolvedValue({ success: true }),
    dispatchCommittedNotification: vi.fn().mockResolvedValue({ success: true }),
    notifyCommittedEvent: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock('../../services/resultFeedbackGeneration.service', () => ({
    triggerFormativeFeedbackForSavedResult: vi.fn().mockResolvedValue(undefined),
}));

const studentId = 'private-thcs-student';
const foreignStudentId = 'private-thcs-foreign-student';
const teacherId = 'private-thcs-teacher';
const adminId = 'private-thcs-admin';
const homeworkId = 'private-thcs-homework';
const submissionId = 'private-thcs-attempt';
const materialId = 'thcs-test-1790924020881-gezr5n1';

describe('student-private THCS homework result against the exact current RTDB rules', () => {
    let environment: RulesTestEnvironment;
    const absentResultId = '-P2vOtvgXx1Vn6A5Ueku';

    beforeAll(async () => {
        const rulesPath = process.env.THCS_RULES_FILE;
        if (!rulesPath) throw new Error('THCS_RULES_FILE must point to the exact current Rules snapshot.');
        const emulatorAddress = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
        if (!emulatorAddress) throw new Error('Database emulator required.');
        const [host, portText] = emulatorAddress.split(':');
        const ruleTree = JSON.parse(readFileSync(rulesPath, 'utf8')).rules;
        const resultRuleKey = Object.keys(ruleTree.test_results).find(key => key.startsWith('$'))!;
        const studentRuleKey = Object.keys(ruleTree.test_results_by_student).find(key => key.startsWith('$'))!;
        const resultIndexRuleKey = Object.keys(ruleTree.test_results_by_student[studentRuleKey])
            .find(key => key.startsWith('$'))!;
        const sha256 = (source: string) => createHash('sha256').update(source).digest('hex');
        expect(sha256(ruleTree.test_results[resultRuleKey]['.write']))
            .toBe('57b6ac6925ef5d905d787c59910c6cda1790f289773d826d4cf77f5259fbd5e8');
        expect(sha256(ruleTree.test_results_by_student[studentRuleKey][resultIndexRuleKey]['.write']))
            .toBe('d2f7137d03f68e12c0904c8f298e37f2ced12ac874063343e65910b68f9cfca2');
        environment = await initializeTestEnvironment({
            projectId: 'demo-private-thcs-homework-current-rules',
            database: { host, port: Number(portText), rules: readFileSync(rulesPath, 'utf8') },
        });
        await environment.clearDatabase();
        await environment.withSecurityRulesDisabled(async context => {
            await context.database().ref('users').set({
                [studentId]: { role: 'student', status: 'active' },
                [foreignStudentId]: { role: 'student', status: 'active' },
                [teacherId]: { role: 'teacher', status: 'active' },
                [adminId]: { role: 'super_admin', status: 'active' },
            });
        });
        client.database = environment.authenticatedContext(studentId).database() as unknown as Database;
    });

    afterAll(async () => { await environment?.cleanup(); });

    it('saves the full prepared THCS result and only the student index; private row stays unreadable to teacher/foreign student', async () => {
        const submittedAt = 1_790_924_235_455;
        const mark = {
            totalScore: 1, maxScore: 1, percentage: 100, completedAt: submittedAt,
            questionResults: [{
                questionNumber: 1, questionType: 'multiple-choice', isCorrect: true, score: 1,
                maxScore: 1, studentAnswer: 'A', correctAnswer: 'A', feedback: '',
            }],
            summary: { correct: 1, incorrect: 0, partialCredit: 0, totalQuestions: 1 },
        } as any;
        const context = {
            type: 'homework',
            source: { type: 'homework', id: homeworkId, name: 'Notification expiry QA', submissionId },
            assignment: { homeworkId, attemptNumber: 1 },
            configApplied: { timerMinutes: 45, feedbackTiming: 'after_completion', source: 'material_default' },
        } as any;
        const studentDb = environment.authenticatedContext(studentId).database();
        expect((await assertSucceeds(studentDb.ref(`test_results/${absentResultId}`).get())).exists()).toBe(false);

        const saveArgs = [
            `homework_practice_${submissionId}`, materialId, studentId, 'Private THCS Student', mark,
            { title: 'Notification expiry QA', type: 'THCS-THPT', skill: 'Mixed', duration: 45 },
            29, undefined, false, undefined, undefined, context,
            {
                scaledScore: 10, sectionResults: [], intentBreakdown: { grammar: { correct: 1, total: 1 } },
            } as any,
            undefined,
            { stableResultId: absentResultId, submissionOperationId: `${submissionId}__submit`, studentPrivateHomework: true },
        ] as Parameters<typeof saveTestResult>;
        const resultId = await assertSucceeds(saveTestResult(...saveArgs));

        const foreignDb = environment.authenticatedContext(foreignStudentId).database();
        const teacherDb = environment.authenticatedContext(teacherId).database();
        const canonicalPath = `test_results/${resultId}`;
        const indexPath = `test_results_by_student/${studentId}/${resultId}`;
        await assertSucceeds(studentDb.ref(canonicalPath).get());
        const initialIndex = (await assertSucceeds(studentDb.ref(indexPath).get())).val();
        expect(initialIndex).toEqual({
            resultId, sessionCode: `homework_practice_${submissionId}`, testId: materialId,
            percentage: 100, submittedAt,
        });
        await assertFails(foreignDb.ref(canonicalPath).get());
        await assertFails(foreignDb.ref(indexPath).get());
        await assertFails(teacherDb.ref(canonicalPath).get());
        await assertFails(teacherDb.ref(indexPath).get());
        expect((await assertSucceeds(studentDb.ref(`test_results_by_session/homework_practice_${submissionId}/${resultId}`).get())).exists()).toBe(false);
        expect((await assertSucceeds(studentDb.ref(`users/${studentId}/role`).get())).val()).toBe('student');

        await environment.withSecurityRulesDisabled(async contextDb => {
            const row = (await contextDb.database().ref(canonicalPath).get()).val();
            expect(row).toMatchObject({
                resultId, studentId, testId: materialId, isGuest: false, markingStatus: 'auto-marked',
                context, thcsData: { scaledScore: 10 },
                visibility: {
                    contextType: 'homework', sourceType: 'homework', sourceId: homeworkId,
                    homeworkId, ownershipResolved: false,
                },
                feedbackGenerationMeta: { kind: 'thcs' },
            });
            expect(row.visibility.visibilityOwnerTeacherId ?? null).toBeNull();
            expect(row.feedbackGenerationMeta.lastOutcome ?? null).toBeNull();
            expect(row).not.toHaveProperty('teacherId');
            expect(row.classId ?? null).toBeNull();
            expect(row.courseId ?? null).toBeNull();
            expect(row.moduleId ?? null).toBeNull();
            expect((await contextDb.database().ref(indexPath).get()).exists()).toBe(true);
            expect((await contextDb.database().ref(`test_results_by_session/homework_practice_${submissionId}/${resultId}`).get()).exists()).toBe(false);
            expect((await contextDb.database().ref(`teacher_result_keys/${teacherId}/${resultId}`).get()).exists()).toBe(false);
        });

        const adminDb = environment.authenticatedContext(adminId).database();
        await assertSucceeds(adminDb.ref(canonicalPath).update({
            bandScore: 9, markingStatus: 'graded', overallFeedback: 'Newer teacher grading',
            feedbackUpdatedAt: submittedAt + 1, feedbackUpdatedByTeacherId: teacherId, hasFeedback: true,
        }));
        const acceptedCanonical = (await adminDb.ref(canonicalPath).get()).val();
        await assertSucceeds(adminDb.ref(indexPath).remove());
        expect((await studentDb.ref(indexPath).get()).exists()).toBe(false);

        expect(await assertSucceeds(saveTestResult(...saveArgs))).toBe(resultId);
        const replayedCanonical = (await adminDb.ref(canonicalPath).get()).val();
        expect(replayedCanonical).toEqual(acceptedCanonical);
        expect(replayedCanonical).toMatchObject({
            bandScore: 9, markingStatus: 'graded', overallFeedback: 'Newer teacher grading',
        });
        expect((await studentDb.ref(indexPath).get()).val()).toEqual({
            resultId, sessionCode: `homework_practice_${submissionId}`, testId: materialId,
            percentage: 100, submittedAt,
        });
    }, 15000);

    it('grants only the receipt-bound assigning teacher read access while keeping browser writes and indexes private', async () => {
        const adminDb = environment.authenticatedContext(adminId).database();
        const studentDb = environment.authenticatedContext(studentId).database();
        const teacherDb = environment.authenticatedContext(teacherId).database();
        const foreignDb = environment.authenticatedContext(foreignStudentId).database();
        const resultPath = `test_results/${absentResultId}`;
        const authorityPath = `result_notification_authority/${absentResultId}`;
        const result = (await adminDb.ref(resultPath).get()).val();
        const receipt = { schemaVersion: 3, materialType: 'thcs-test', contextType: 'homework',
            resultId: absentResultId, studentId, ownerTeacherId: teacherId, homeworkId,
            homeworkSubmissionId: submissionId, testId: materialId, createdAt: result.createdAt,
            submittedAt: result.submittedAt, homeworkSubmittedAt: result.createdAt + 1000,
            sourceRulesCutoff: '2026-10-02T02:22:09.862Z' };
        await environment.withSecurityRulesDisabled(async context => {
            await context.database().ref(authorityPath).set(receipt);
            await context.database().ref('users/foreign-teacher').set({ role: 'teacher', status: 'active' });
        });
        expect((await assertSucceeds(teacherDb.ref(resultPath).get())).val()).toEqual(result);
        await assertFails(environment.authenticatedContext('foreign-teacher').database().ref(resultPath).get());
        await assertFails(foreignDb.ref(resultPath).get());
        await assertFails(environment.unauthenticatedContext().database().ref(resultPath).get());
        await assertFails(teacherDb.ref(`test_results_by_student/${studentId}/${absentResultId}`).get());
        for (const actor of [studentDb, teacherDb, foreignDb]) {
            await assertFails(actor.ref(`${authorityPath}-forged`).set(receipt));
            await assertFails(actor.ref(authorityPath).set({ ...receipt, ownerTeacherId: 'foreign-teacher' }));
            await assertFails(actor.ref(authorityPath).remove());
            await assertFails(actor.ref('result_notification_authority').set({ [absentResultId]: receipt }));
            await assertFails(actor.ref('result_notification_authority').update({ [absentResultId]: receipt }));
            await assertFails(actor.ref().update({ [authorityPath]: receipt }));
        }
        await assertFails(teacherDb.ref(resultPath).update({ overallFeedback: 'Unauthorized teacher feedback' }));
        await assertFails(teacherDb.ref(resultPath).remove());
        for (const mutation of [
            { studentId: foreignStudentId }, { testId: 'foreign-test' }, { sessionCode: 'foreign-session' },
            { submittedAt: result.submittedAt + 1 }, { createdAt: result.createdAt + 1 },
            { 'context/source/submissionId': 'foreign-attempt' }, { 'context/source/id': 'foreign-homework' },
            { 'context/assignment/homeworkId': 'foreign-homework' }, { percentage: 1 },
            { 'questionResults/0/studentAnswer': 'forged' },
        ]) await assertFails(studentDb.ref(resultPath).update(mutation));
        await assertSucceeds(studentDb.ref(resultPath).update({
            feedbackGenerationMeta: { kind: 'thcs', lastAttemptAt: result.createdAt + 1 },
        }));
        await assertSucceeds(teacherDb.ref(resultPath).get());
        await environment.withSecurityRulesDisabled(async context => {
            await context.database().ref('test_results/forged-result').set({ ...result, resultId: 'forged-result' });
            await context.database().ref('result_notification_authority/forged-result').set(receipt);
        });
        await assertFails(teacherDb.ref('test_results/forged-result').get());
        for (const mutation of [
            { schemaVersion: 2 }, { materialType: 'test' }, { studentId: foreignStudentId },
            { ownerTeacherId: 'foreign-teacher' }, { homeworkId: 'foreign-homework' },
            { homeworkSubmissionId: 'foreign-attempt' }, { testId: 'foreign-test' },
            { createdAt: result.createdAt + 1 }, { submittedAt: result.submittedAt + 1 },
        ]) {
            await environment.withSecurityRulesDisabled(async context => {
                await context.database().ref(authorityPath).set({ ...receipt, ...mutation });
            });
            await assertFails(teacherDb.ref(resultPath).get());
        }
        await environment.withSecurityRulesDisabled(async context => {
            await context.database().ref(authorityPath).set(receipt);
            await context.database().ref(`${resultPath}/context/source/submissionId`).set('tampered-after-receipt');
        });
        await assertFails(teacherDb.ref(resultPath).get());
    }, 15000);
});
