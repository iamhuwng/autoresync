import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  INVENTORY_READ_PATHS,
  buildRetiredMaterialInventory,
  type ReadOnlyDatabase,
} from '../lib/retiredMaterialInventory';
import { parseRetiredMaterialInventoryArgs } from '../inspect-retired-materials';

const makeDatabase = (
  values: Readonly<Record<string, unknown>>,
  calls: string[] = [],
): ReadOnlyDatabase => ({
  read: async (path) => {
    calls.push(path);
    return values[path] ?? null;
  },
});

const baseValues = (): Record<string, unknown> =>
  Object.fromEntries(INVENTORY_READ_PATHS.map((path) => [path, null]));

describe('retired material inventory CLI', () => {
  it('accepts only a project and output path for read-only inspection', () => {
    expect(parseRetiredMaterialInventoryArgs([
      '--project',
      'temp-a1437',
      '--out',
      'phase-1.json',
    ])).toEqual({
      projectId: 'temp-a1437',
      outputPath: 'phase-1.json',
      help: false,
    });

    expect(() => parseRetiredMaterialInventoryArgs([
      '--project',
      'temp-a1437',
      '--out',
      'phase-1.json',
      '--apply',
    ])).toThrow(/does not accept --apply/i);
    expect(() => parseRetiredMaterialInventoryArgs(['--project', 'temp-a1437']))
      .toThrow(/--out is required/i);
    expect(() => parseRetiredMaterialInventoryArgs(['--out', 'phase-1.json']))
      .toThrow(/--project is required/i);
  });

  it('contains no Firebase mutation command or write-capable Firebase SDK import', () => {
    const entrySource = readFileSync(
      resolve('scripts/inspect-retired-materials.ts'),
      'utf8',
    );
    const inventorySource = readFileSync(
      resolve('scripts/lib/retiredMaterialInventory.ts'),
      'utf8',
    );
    const combined = `${entrySource}\n${inventorySource}`;

    expect(combined).not.toMatch(/database:(?:set|update|remove|delete|push)/i);
    expect(combined).not.toMatch(/from ['"]firebase\/database['"]/);
    expect(combined).not.toMatch(/\b(?:set|update|remove|push)\s*\(\s*ref\s*\(/);
    expect(entrySource).toContain("'database:get'");
  });
});

describe('buildRetiredMaterialInventory', () => {
  it('reads only the declared roots and returns counts without source payloads', async () => {
    const calls: string[] = [];
    const values = baseValues();
    values.tests = {
      'test-reading-v1': {
        id: 'test-reading-v1',
        type: 'IELTS',
        skill: 'Reading',
        passages: [{
          id: 'passage-1',
          title: 'Passage 1',
          content: 'private passage text',
          questionStart: 1,
          questionEnd: 1,
        }],
        questions: [{
          number: 1,
          type: 'short-answer',
          question: 'private question text',
          answer: 'private answer',
          passageId: 'passage-1',
        }],
        metadata: { instructions: 'private instructions' },
        settings: { allowReview: true, showTimer: true },
      },
      'test-listening': {
        id: 'test-listening',
        type: 'IELTS',
        skill: 'Listening',
        audioSections: [{ audioUrl: 'https://cdn.example.test/audio.mp3' }],
      },
    };

    const report = await buildRetiredMaterialInventory(makeDatabase(values, calls), {
      projectId: 'temp-a1437',
      sourceRevision: 'revision-1',
      generatedAt: '2026-07-05T00:00:00.000Z',
    });

    expect(calls).toEqual([...INVENTORY_READ_PATHS]);
    expect(report.readFailures).toEqual([]);
    expect(report.roots.tests.topLevelRecordCount).toBe(2);
    expect(JSON.stringify(report)).not.toContain('private passage text');
    expect(JSON.stringify(report)).not.toContain('private question text');
    expect(JSON.stringify(report)).not.toContain('private answer');
    expect(JSON.stringify(report)).not.toContain('private instructions');
  });

  it('counts explicit Reading V2 marker shapes separately through the canonical helper', async () => {
    const values = baseValues();
    values.tests = {
      'v2-delivery': { id: 'v2-delivery', deliveryEngine: 'reading-v2', skill: 'Reading' },
      'v2-runtime': { id: 'v2-runtime', runtimeEngine: ' READING-V2 ' },
      'reading-label-only': { id: 'reading-label-only', skill: 'Reading' },
      'thcs-reading': { id: 'thcs-reading', type: 'THCS-THPT', skill: 'Reading' },
    };

    const report = await buildRetiredMaterialInventory(makeDatabase(values), {
      projectId: 'temp-a1437',
      sourceRevision: 'revision-1',
      generatedAt: '2026-07-05T00:00:00.000Z',
    });

    expect(report.routingMetadata.explicitReadingV2PayloadCount).toBe(2);
    expect(report.routingMetadata.readingV2MarkerOccurrences).toEqual([
      { field: 'deliveryEngine', normalizedValue: 'reading-v2', count: 1 },
      { field: 'runtimeEngine', normalizedValue: 'reading-v2', count: 1 },
    ]);
    expect(report.legacyReadingSchemaEvidence.recordPaths).toEqual([]);
    expect(report.protectedBoundaries.readingV2).toContain('/reading_v2/**');
  });

  it('records the exact legacy producer signature as evidence without classifying deletion', async () => {
    const values = baseValues();
    values.tests = {
      'legacy-producer-shape': {
        id: 'legacy-producer-shape',
        type: 'IELTS',
        skill: 'Reading',
        passages: [{
          id: 'passage-1',
          title: 'Passage 1',
          content: 'text',
          questionStart: 1,
          questionEnd: 1,
        }],
        questions: [{
          number: 1,
          type: 'short-answer',
          question: 'Question',
          answer: 'Answer',
          passageId: 'passage-1',
        }],
        metadata: { instructions: 'Instructions' },
        settings: { allowReview: true, showTimer: true },
      },
      'label-only': {
        id: 'label-only',
        type: 'IELTS',
        skill: 'Reading',
      },
      'v2-with-legacy-fields': {
        id: 'v2-with-legacy-fields',
        type: 'IELTS',
        skill: 'Reading',
        deliveryEngine: 'reading-v2',
        passages: [{ id: 'p', title: 'P', content: 'text', questionStart: 1, questionEnd: 1 }],
        questions: [{ number: 1, type: 'x', question: 'Q', answer: 'A', passageId: 'p' }],
        metadata: { instructions: 'Instructions' },
        settings: { allowReview: true, showTimer: true },
      },
    };

    const report = await buildRetiredMaterialInventory(makeDatabase(values), {
      projectId: 'temp-a1437',
      sourceRevision: 'revision-1',
      generatedAt: '2026-07-05T00:00:00.000Z',
    });

    expect(report.legacyReadingSchemaEvidence.status).toBe('observed-not-approved');
    expect(report.legacyReadingSchemaEvidence.recordPaths).toEqual([
      '/tests/legacy-producer-shape',
    ]);
    expect(report.legacyReadingSchemaEvidence.requiredFields).toContain('passages[].questionStart');
    expect(report.legacyReadingSchemaEvidence.requiredFields).toContain('questions[].passageId');
    expect(report.legacyReadingSchemaEvidence.warning).toMatch(/positive producer-shape signature/i);
    expect(report.legacyReadingSchemaEvidence.warning).toMatch(/absent Reading V2 markers are not evidence/i);
  });

  it('reports Drive URL field paths without retaining URL values', async () => {
    const values = baseValues();
    values.tests = {
      listening: {
        id: 'listening',
        skill: 'Listening',
        audioSections: [{
          audioUrl: 'https://drive.google.com/file/d/private-id/view',
          streamUrl: 'https://drive.usercontent.google.com/download?id=private-id',
        }],
      },
    };
    values.test_results = {
      result1: {
        resultId: 'result1',
        sourceSnapshot: {
          originalUrl: 'https://docs.google.com/file/d/private-id/view',
        },
        questionResults: [{ answer: 'do-not-copy' }],
      },
    };

    const report = await buildRetiredMaterialInventory(makeDatabase(values), {
      projectId: 'temp-a1437',
      sourceRevision: 'revision-1',
      generatedAt: '2026-07-05T00:00:00.000Z',
    });

    expect(report.driveUrlFieldPaths).toEqual([
      '/test_results/result1/sourceSnapshot/originalUrl',
      '/tests/listening/audioSections/0/audioUrl',
      '/tests/listening/audioSections/0/streamUrl',
    ]);
    expect(JSON.stringify(report)).not.toContain('private-id');
    expect(JSON.stringify(report)).not.toContain('do-not-copy');
  });

  it('counts missing routing metadata, malformed records, active sessions, and result indexes', async () => {
    const values = baseValues();
    values.tests = {
      missingEverything: { id: 'missingEverything' },
      missingSkill: { id: 'missingSkill', type: 'IELTS' },
      malformed: 'not-an-object',
    };
    values.game_sessions = {
      activeQuiz: {
        status: 'in-progress',
        mode: 'quiz',
        quizId: 'quiz-1',
        activeQuizzes: { assignment: true },
        students: { student1: { assignedQuizId: 'quiz-1' } },
      },
      endedTest: { status: 'completed', mode: 'test', testId: 'test-1' },
    };
    values.test_results = { result1: { resultId: 'result1', testId: 'test-1' } };
    values.test_results_by_student = { student1: { result1: true } };
    values.test_results_by_course = { course1: { student1: { result1: true } } };

    const report = await buildRetiredMaterialInventory(makeDatabase(values), {
      projectId: 'temp-a1437',
      sourceRevision: 'revision-1',
      generatedAt: '2026-07-05T00:00:00.000Z',
    });

    expect(report.routingMetadata.tests).toEqual({
      totalRecords: 3,
      missingTestType: 1,
      missingSkill: 2,
      missingExplicitEngineMarker: 2,
    });
    expect(report.unknownShapes).toEqual([
      { path: '/tests/malformed', reason: 'non-object-record' },
      { path: '/tests/missingEverything', reason: 'missing-type-skill-and-engine-marker' },
    ]);
    expect(report.sessions).toEqual({
      total: 2,
      active: 1,
      withQuizId: 1,
      withActiveQuizzes: 1,
      withAssignedQuizId: 1,
    });
    expect(report.results.records).toBe(1);
    expect(report.results.indexes['/test_results_by_student']).toBe(1);
    expect(report.results.indexes['/test_results_by_course']).toBe(1);
  });

  it('does not emit dynamic child ids while summarizing roots', async () => {
    const values = baseValues();
    values.notifications = {
      user1: {
        notification1: {
          testId: 'test-1',
          quizId: 'quiz-1',
          link: '/student/test-1',
        },
      },
    };

    const report = await buildRetiredMaterialInventory(makeDatabase(values), {
      projectId: 'temp-a1437',
      sourceRevision: 'revision-1',
      generatedAt: '2026-07-05T00:00:00.000Z',
    });

    expect(report.roots.notifications).toEqual({
      topLevelRecordCount: 1,
      malformedTopLevelRecords: 0,
    });
    expect(JSON.stringify(report)).not.toContain('notification1');
  });

  it('excludes explained non-candidate containers and protected Listening records from unknown blockers', async () => {
    const values = baseValues();
    values.course_materials = {
      link1: {
        courseId: 'course-1',
        moduleId: 'module-1',
        materialId: 'material-1',
        order: 1,
      },
    };
    values['material_catalog/material_indexes'] = {
      by_visibility: { public: { material1: true } },
    };
    values.notifications = {
      user1: {
        notification1: {
          createdAt: 1780000000000,
          id: 'notification1',
          link: '/tests/listening-1',
          message: 'Material assigned',
          read: false,
          title: 'Assignment',
          type: 'assignment',
        },
      },
    };
    values.session_test_payloads = {
      CODE123: {
        generatedAt: 1780000000000,
        testId: 'listening-1',
        testData: {
          type: 'IELTS',
          skill: 'Listening',
          questions: [],
          audioSections: [],
        },
      },
    };
    values.tests = {
      listening1: {
        type: 'IELTS',
        skill: 'Listening',
        questions: [],
        audioSections: [],
      },
      listeningWithAsset: {
        type: 'IELTS',
        skill: 'Listening',
        audioSections: [{ assetId: 'asset-1', audioUrl: 'https://cdn.test/audio.mp3' }],
      },
      stillUnknown: { skill: 'Reading' },
    };
    values.student_safe_tests = {
      listeningCopy: {
        type: 'IELTS',
        skill: 'Listening',
        questions: [],
        audioSections: [],
      },
    };

    const report = await buildRetiredMaterialInventory(makeDatabase(values), {
      projectId: 'temp-a1437',
      sourceRevision: 'revision-1',
      generatedAt: '2026-07-05T00:00:00.000Z',
    });

    expect(report.manifest.candidateIdsByState['protect-non-candidate']).toEqual([
      '/course_materials/link1',
      '/material_catalog/material_indexes/by_visibility',
      '/notifications/user1',
    ]);
    expect(report.manifest.candidateIdsByState['protect-r2-listening']).toEqual([
      '/tests/listeningWithAsset',
    ]);
    expect(report.manifest.candidateIdsByState['protect-supported-listening']).toEqual([
      '/session_test_payloads/CODE123',
      '/student_safe_tests/listeningCopy',
      '/tests/listening1',
    ]);
    expect(report.manifest.unknownBlockedRecords).toEqual(['/tests/stillUnknown']);
  });

  it('records ownership, entry points, Firebase roots, source-loading results, and protected owners', async () => {
    const report = await buildRetiredMaterialInventory(makeDatabase(baseValues()), {
      projectId: 'temp-a1437',
      sourceRevision: 'revision-1',
      generatedAt: '2026-07-05T00:00:00.000Z',
    });

    expect(report.ownership.googleDrive).toContain('src/services/googleDriveAudio.ts');
    expect(report.ownership.readingV1).toContain('src/skills/reading/components/ReadingTestPage.tsx');
    expect(report.ownership.quiz).toContain('src/components/QuizEditor.jsx');
    expect(report.ownership.protected).toContain('src/config/readingV2FeatureFlags.ts');
    expect(report.entryPoints.dedicatedQuizRoutes).toContain('/student-quiz/:gameSessionId');
    expect(report.entryPoints.sharedFallbacks).toContain(
      "src/pages/TestPageRouter.tsx: loadNonThcsSkill('Reading')",
    );
    expect(report.firebaseSchema).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '/quizzes', store: 'rtdb' }),
      expect.objectContaining({ path: '/homework_assignments', store: 'firestore' }),
      expect.objectContaining({ path: '/reading_v2/**', protection: 'protected' }),
    ]));
    expect(report.resultSourceLoadingSurfaces).toContain(
      'src/services/resultFeedbackPayload.service.ts: getTestFromFirebase(result.testId)',
    );
  });
});
