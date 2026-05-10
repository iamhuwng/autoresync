import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildReadingTestData,
  buildStudentSafeTestData,
  buildTableCompletionPublishReport,
  generateTestId,
} from '../ielts-reading-materials-firebase.mjs';
import {
  closeTableCompletionRuntime,
  loadTableCompletionSharedModules,
} from '../table-completion-runtime.mjs';
import {
  createCanonicalTableGroup,
  createMaterial,
  createTableCompletionDiagnostic,
} from './fixtures.mjs';

function normalizeDerivedQuestionsForStorage(questions) {
  return questions.map((question) => ({
    number: question.number,
    type: question.type,
    question: question.questionText,
    questionText: question.questionText,
    answer: question.answer,
    passageId: question.passageId,
    points: question.points,
    acceptableAnswers: question.acceptableAnswers,
    ...(question.wordLimit !== undefined ? { wordLimit: question.wordLimit } : {}),
    ...(question.sectionInstructionId ? { sectionInstructionId: question.sectionInstructionId } : {}),
    ...(question.groupId ? { groupId: question.groupId } : {}),
    ...(question.blankId ? { blankId: question.blankId } : {}),
    ...(question.anchorId ? { anchorId: question.anchorId } : {}),
    ...(question.groupTaskType ? { groupTaskType: question.groupTaskType } : {}),
    ...(question.tableGroupSchemaVersion ? { tableGroupSchemaVersion: question.tableGroupSchemaVersion } : {}),
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await closeTableCompletionRuntime();
});

describe('ielts-reading-materials-firebase', () => {
  it('generates deterministic ids from the current timestamp and random suffix', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    vi.spyOn(Math, 'random').mockReturnValue(0.123456789);

    const testId = generateTestId();

    expect(testId).toMatch(/^test-1700000000000-[a-z0-9]{7}$/);
  });

  it('builds canonical reading payloads from grouped table artifacts', async () => {
    const testData = await buildReadingTestData(createMaterial(), {
      testId: 'test-1',
      now: 1700000000000,
      createdBy: 'teacher-1',
      ownerId: 'teacher-1',
    });

    expect(testData.questionGroups).toEqual([
      expect.objectContaining({
        groupId: 'table-group-1',
        canonicalReadingOrder: ['blank-18'],
      }),
    ]);
    expect(testData.questions).toEqual(
      expect.arrayContaining([
      expect.objectContaining({
        number: 18,
        questionText: 'Native region ___',
        sectionInstructionId: 'table-group-1',
        groupId: 'table-group-1',
        blankId: 'blank-18',
        anchorId: 'anchor-18',
        groupTaskType: 'table-completion',
        acceptableAnswers: ['China'],
      }),
      ]),
    );
    expect(testData.tableCompletionDiagnostics).toEqual([
      expect.objectContaining({
        groupId: 'table-group-1',
        sourceWorkflow: 'script-material',
      }),
    ]);
  });

  it('matches the app-side canonical transforms for grouped question derivation and student-safe projection', async () => {
    const { transforms } = await loadTableCompletionSharedModules();
    const canonicalGroup = createCanonicalTableGroup({
      provenance: {
        sourceWorkflow: 'in-app-parse',
        sourceShape: 'markdown-table',
        rawExcerpt: '| Plant | Region |',
        normalizationVersion: 1,
        confidence: 0.91,
        warnings: ['inferred-headers'],
        canonicalRevisionHash: 'rev-1',
      },
      canonicalReadingOrder: ['blank-18'],
      visualOrderConflict: false,
    });
    const material = createMaterial({
      questions: [],
      questionGroups: [canonicalGroup],
      tableCompletionDiagnostics: [],
    });

    const testData = await buildReadingTestData(material, {
      testId: 'test-1',
      now: 1700000000000,
      createdBy: 'teacher-1',
      ownerId: 'teacher-1',
    });
    const safeTestData = await buildStudentSafeTestData(testData);

    const appDerivedQuestions = transforms.deriveTableCompletionQuestionsFromGroup(canonicalGroup);
    const appStudentSafeGroup = transforms.stripTableCompletionReviewOnlyProvenance(canonicalGroup);

    expect(testData.questionGroups).toEqual([canonicalGroup]);
    expect(testData.questionGroups[0]).toMatchObject({
      canonicalReadingOrder: canonicalGroup.canonicalReadingOrder,
      visualOrderConflict: canonicalGroup.visualOrderConflict,
    });
    expect(testData.questions).toEqual(normalizeDerivedQuestionsForStorage(appDerivedQuestions));
    expect(safeTestData.questionGroups).toEqual([appStudentSafeGroup]);
  });

  it('strips review-only grouped provenance and diagnostics from student-safe payloads', async () => {
    const testData = await buildReadingTestData(createMaterial(), {
      testId: 'test-1',
      now: 1700000000000,
    });

    const safeTestData = await buildStudentSafeTestData(testData);

    expect(safeTestData.tableCompletionDiagnostics).toBeUndefined();
    expect(safeTestData.questions.every((question) => !('answer' in question))).toBe(true);
    expect(safeTestData.questions.every((question) => !('acceptableAnswers' in question))).toBe(true);
    expect(safeTestData.questionGroups).toEqual([
      expect.objectContaining({
        provenance: { canonicalRevisionHash: 'rev-1' },
      }),
    ]);
    expect(safeTestData.questionGroups[0].blanks[0]).not.toHaveProperty('acceptedAnswers');
    expect(safeTestData.questionGroups[0].provenance).not.toHaveProperty('rawExcerpt');
    expect(safeTestData.questionGroups[0].provenance).not.toHaveProperty('confidence');
    expect(safeTestData.questionGroups[0].provenance).not.toHaveProperty('warnings');
  });

  it('rejects unsupported grouped schema versions before projection', async () => {
    await expect(
      buildStudentSafeTestData({
        id: 'test-1',
        questionGroups: [
          createCanonicalTableGroup({
            schemaVersion: 2,
          }),
        ],
      }),
    ).rejects.toThrow(/Unsupported table-completion schemaVersion 2/i);
  });

  it('reports acknowledgement-required diagnostics as non-publishable', async () => {
    const publishReport = await buildTableCompletionPublishReport(
      createMaterial({
        questionGroups: [],
        tableCompletionDiagnostics: [
          createTableCompletionDiagnostic({
            groupId: 'unresolved-table-group',
            parseMode: 'unresolved',
            hasCanonicalGroup: false,
          }),
        ],
      }),
    );

    expect(publishReport.isPublishable).toBe(false);
    expect(publishReport.hasBlocking).toBe(true);
    expect(publishReport.diagnostics).toEqual([
      expect.objectContaining({
        groupId: 'unresolved-table-group',
        parseMode: 'unresolved',
      }),
    ]);
  });
});
