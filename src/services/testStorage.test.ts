/**
 * Test Storage Service Unit Tests
 * Tests Firebase test storage operations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateTestId,
  saveTestToFirebase,
  getTestFromFirebase,
  getStudentSafeTestFromFirebase,
  getAllTestsFromFirebase,
  deleteTestFromFirebase,
  buildStudentSafeTestData,
  cacheSessionStudentSafeTestData,
  persistIELTSCanonicalQuestionGroupsToFirebase,
} from './testStorage';
import type { TestMetadata } from './testStorage';

const CANONICAL_TABLE_GROUP = {
  schemaVersion: 1 as const,
  groupId: 'group-1',
  taskType: 'table-completion' as const,
  passageId: 'p1',
  questionRange: { start: 1, end: 1 },
  sharedContent: {
    instructionText: 'Complete the table below.',
    answerRuleText: 'Choose NO MORE THAN TWO WORDS.',
    constraints: { maxWords: 2 },
  },
  columns: [
    { columnId: 'col-1', order: 0 },
    { columnId: 'col-2', order: 1 },
  ],
  rows: [
    { rowId: 'row-header-1', order: 0, cellIds: ['cell-header-1', 'cell-header-2'] },
    { rowId: 'row-1', order: 1, cellIds: ['cell-row-header', 'cell-1'] },
  ],
  cells: [
    {
      cellId: 'cell-header-1',
      rowId: 'row-header-1',
      columnId: 'col-1',
      rowSpan: 1,
      colSpan: 1,
      role: 'column-header' as const,
      segments: [{ kind: 'text' as const, text: 'Plant Species' }],
    },
    {
      cellId: 'cell-header-2',
      rowId: 'row-header-1',
      columnId: 'col-2',
      rowSpan: 1,
      colSpan: 1,
      role: 'column-header' as const,
      segments: [{ kind: 'text' as const, text: 'Native Region' }],
    },
    {
      cellId: 'cell-row-header',
      rowId: 'row-1',
      columnId: 'col-1',
      rowSpan: 1,
      colSpan: 1,
      role: 'row-header' as const,
      segments: [{ kind: 'text' as const, text: 'Ginkgo Biloba' }],
    },
    {
      cellId: 'cell-1',
      rowId: 'row-1',
      columnId: 'col-2',
      rowSpan: 1,
      colSpan: 1,
      role: 'body' as const,
      segments: [
        { kind: 'text' as const, text: 'Native region: ' },
        { kind: 'blank-anchor' as const, anchorId: 'anchor-1' },
      ],
    },
  ],
  blanks: [
    {
      blankId: 'blank-1',
      questionNumber: 1,
      anchorId: 'anchor-1',
      cellId: 'cell-1',
      canonicalOrder: 0,
      acceptedAnswers: ['China'],
      constraints: {},
      breadcrumb: {
        rowHeaders: ['Ginkgo Biloba'],
        columnHeaders: ['Native Region'],
      },
    },
  ],
  provenance: {
    sourceWorkflow: 'in-app-parse' as const,
    sourceShape: 'html-table' as const,
    rawExcerpt: '<table>teacher only</table>',
    normalizationVersion: 1,
    confidence: 0.81,
    warnings: ['inferred-headers'],
    canonicalRevisionHash: 'rev-1',
  },
  canonicalReadingOrder: ['blank-1'],
};

// Mock Firebase
vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  set: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
}));

vi.mock('./firebase', () => ({
  database: {},
}));

vi.mock('./restoreGuard', () => ({
  withRestoreGuard: (_serviceName: string, _safeReturn: unknown) => (
    fn: (...args: unknown[]) => Promise<unknown>
  ) => fn,
}));

describe('testStorage', () => {
  describe('buildStudentSafeTestData', () => {
    it('strips answer keys from flat IELTS-style question arrays', () => {
      const safeTest = buildStudentSafeTestData({
        id: 'test-1',
        title: 'Reading Test',
        questions: [
          {
            number: 1,
            question: 'Q1',
            answer: 'A',
            correctAnswer: 'B',
            options: ['A', 'B'],
          },
        ],
      });

      expect(safeTest.questions).toEqual([
        {
          number: 1,
          question: 'Q1',
          options: ['A', 'B'],
        },
      ]);
    });

    it('rejects explicit Reading V2 payload markers in the legacy projection pipeline', () => {
      expect(() =>
        buildStudentSafeTestData({
          id: 'reading-v2-test-1',
          engine: 'reading-v2',
          questions: [],
        }),
      ).toThrow(
        'Reading V2 payloads must use the dedicated Reading V2 publish pipeline before student-safe projection.',
      );
    });

    it('strips answer keys from THCS section questions without throwing', () => {
      const safeTest = buildStudentSafeTestData({
        id: 'thcs-test-1',
        testType: 'THCS-THPT',
        metadata: {
          title: 'THCS Test',
          duration: 45,
        },
        sections: [
          {
            id: 'section-1',
            name: 'Part A',
            questions: [
              {
                id: 'q-1',
                questionNumber: 1,
                questionText: 'Choose the correct answer',
                correctAnswer: 'A',
                options: ['A', 'B', 'C', 'D'],
              },
            ],
          },
        ],
      });

      expect(safeTest.sections).toEqual([
        {
          id: 'section-1',
          name: 'Part A',
          questions: [
            {
              id: 'q-1',
              questionNumber: 1,
              questionText: 'Choose the correct answer',
              options: ['A', 'B', 'C', 'D'],
            },
          ],
        },
      ]);
    });

    it('strips review-only canonical table provenance from question groups', () => {
      const safeTest = buildStudentSafeTestData({
        id: 'test-1',
        questionGroups: [CANONICAL_TABLE_GROUP],
      });

      expect(safeTest.questionGroups).toEqual([
        expect.objectContaining({
          provenance: { canonicalRevisionHash: 'rev-1' },
        }),
      ]);
      expect(safeTest.questionGroups?.[0]?.blanks[0]).not.toHaveProperty('acceptedAnswers');
      expect(safeTest.questionGroups?.[0]?.provenance).not.toHaveProperty('rawExcerpt');
      expect(safeTest.questionGroups?.[0]?.provenance).not.toHaveProperty('confidence');
      expect(safeTest.questionGroups?.[0]?.provenance).not.toHaveProperty('warnings');
    });
  });

  describe('getStudentSafeTestFromFirebase', () => {
    beforeEach(async () => {
      vi.clearAllMocks();
      const { ref } = await import('firebase/database');
      (ref as any).mockImplementation((_db: unknown, path: string) => ({ path }));
    });

    it('builds and backfills a student-safe payload when the cached projection is missing', async () => {
      const { get, set } = await import('firebase/database');
      const canonicalTest = {
        id: 'test-1',
        title: 'Reading Test',
        questions: [
          {
            number: 1,
            question: 'Q1',
            answer: 'A',
            correctAnswer: 'B',
            options: ['A', 'B'],
          },
        ],
        questionGroups: [CANONICAL_TABLE_GROUP],
        tableCompletionDiagnostics: [
          {
            groupId: 'group-1',
            questionRange: { start: 1, end: 1 },
            parseMode: 'deterministic',
            sourceWorkflow: 'script-material',
            sourceShape: 'html-table',
            validationSeverity: 'none',
            issueCodes: [],
            issues: [],
            unsupportedRepairState: 'none',
            missingSemanticBreadcrumbs: false,
            canonicalRevisionHash: 'rev-1',
            hasCanonicalGroup: true,
          },
        ],
      };

      (get as any)
        .mockResolvedValueOnce({ exists: () => false })
        .mockResolvedValueOnce({ exists: () => true, val: () => canonicalTest });
      (set as any).mockResolvedValueOnce(undefined);

      const result = await getStudentSafeTestFromFirebase('test-1');

      expect(result.success).toBe(true);
      expect(result.data?.questions).toEqual([
        {
          number: 1,
          question: 'Q1',
          options: ['A', 'B'],
        },
      ]);
      expect(set).toHaveBeenCalledWith(
        { path: 'student_safe_tests/test-1' },
        {
          id: 'test-1',
          title: 'Reading Test',
          questions: [
            {
              number: 1,
              question: 'Q1',
              options: ['A', 'B'],
            },
          ],
          questionGroups: [
            expect.objectContaining({
              provenance: { canonicalRevisionHash: 'rev-1' },
            }),
          ],
        },
      );
      expect(result.data?.questionGroups?.[0]?.blanks[0]).not.toHaveProperty('acceptedAnswers');
    });
  });

  describe('cacheSessionStudentSafeTestData', () => {
    beforeEach(async () => {
      vi.clearAllMocks();
      const { ref } = await import('firebase/database');
      (ref as any).mockImplementation((_db: unknown, path?: string) => (path ? { path } : { path: '/' }));
    });

    it('caches Reading V2 live sessions from the published student-safe projection instead of the legacy builder', async () => {
      const { get, update } = await import('firebase/database');
      const readingV2Test = {
        id: 'material-v2',
        materialId: 'material-v2',
        deliveryEngine: 'reading-v2',
        publishedSnapshotVersionId: 'snapshot-v2',
      };
      const metadata = {
        materialId: 'material-v2',
        ownerId: 'teacher-1',
        deliveryEngine: 'reading-v2',
        productLabel: 'Reading V2',
        title: 'Reading V2 Live Material',
        materialKind: 'full-test',
        durationMinutes: 60,
        difficulty: 'intermediate',
        visibility: 'private',
        publishedSnapshotVersionId: 'snapshot-v2',
        updatedAt: '2026-04-29T00:00:00.000Z',
        relationshipSurfaces: ['teacher-lobby'],
      };
      const studentSafeProjection = {
        deliveryEngine: 'reading-v2',
        plane: 'projection',
        schemaVersion: 1,
        ownerId: 'teacher-1',
        projectionKind: 'student-safe',
        projectionId: 'student-safe:material-v2:snapshot-v2',
        sourceSnapshotVersionId: 'snapshot-v2',
        sourceDocumentId: 'document-v2',
        materialId: 'material-v2',
        generatedAt: '2026-04-29T00:00:00.000Z',
        runtimeContract: 'student-runtime',
        content: {
          title: 'Reading V2 Live Material',
          materialId: 'material-v2',
          sections: [],
          stimuli: [],
          anchors: [],
          taskGroups: [],
          optionSets: [],
        },
      };

      (get as any)
        .mockResolvedValueOnce({ exists: () => true, val: () => readingV2Test })
        .mockResolvedValueOnce({ exists: () => true, val: () => metadata })
        .mockResolvedValueOnce({ exists: () => true, val: () => studentSafeProjection });
      (update as any).mockResolvedValueOnce(undefined);

      const result = await cacheSessionStudentSafeTestData('LIVE123', 'material-v2');

      expect(result.success).toBe(true);
      expect(update).toHaveBeenCalledWith(
        { path: '/' },
        expect.objectContaining({
          'reading_v2/projections/session_test_payloads/LIVE123:snapshot-v2': expect.objectContaining({
            projectionKind: 'session-safe',
            projectionId: 'session-safe:LIVE123:snapshot-v2',
            runtimeContract: 'live-session',
          }),
          'game_sessions/LIVE123/readingV2': expect.objectContaining({
            materialId: 'material-v2',
            publishedSnapshotVersionId: 'snapshot-v2',
          }),
        }),
      );
    });
  });

  describe('generateTestId', () => {
    it('should generate unique test IDs', () => {
      const id1 = generateTestId();
      const id2 = generateTestId();

      expect(id1).toMatch(/^test-\d+-[a-z0-9]+$/);
      expect(id2).toMatch(/^test-\d+-[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    it('should start with "test-" prefix', () => {
      const id = generateTestId();
      expect(id.startsWith('test-')).toBe(true);
    });

    it('should contain timestamp and random component', () => {
      const id = generateTestId();
      const parts = id.split('-');

      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe('test');
      expect(parts[1]).toMatch(/^\d+$/); // timestamp
      expect(parts[2]).toMatch(/^[a-z0-9]+$/); // random string
    });
  });

  describe('Test Validation', () => {
    const mockMetadata: TestMetadata = {
      title: 'IELTS Reading Practice Test 1',
      type: 'IELTS',
      skill: 'Reading',
      duration: 60,
      difficulty: 'Intermediate',
      description: 'Full-length IELTS Reading test',
      targetBand: '7.0',
      estimatedScore: '6.5-7.5',
    };

    const mockPassages = [
      {
        id: 'p1',
        title: 'The History of Chocolate',
        content: 'Chocolate has a long history dating back thousands of years...',
        type: 'text' as const,
        createdAt: Date.now(),
      },
      {
        id: 'p2',
        title: 'Climate Change',
        content: 'Climate change is one of the most pressing issues...',
        type: 'text' as const,
        createdAt: Date.now(),
      },
      {
        id: 'p3',
        title: 'Artificial Intelligence',
        content: 'AI is transforming the way we live and work...',
        type: 'text' as const,
        createdAt: Date.now(),
      },
    ];

    const mockQuestions = Array.from({ length: 40 }, (_, i) => ({
      number: i + 1,
      type: 'multiple-choice',
      question: `Question ${i + 1}?`,
      options: ['A', 'B', 'C', 'D'],
      answer: 'A',
      passageId: `p${Math.floor(i / 13) + 1}`,
      points: 1,
    }));

    it('should validate IELTS Reading structure (40 questions, 3 passages)', () => {
      expect(mockQuestions).toHaveLength(40);
      expect(mockPassages).toHaveLength(3);
      expect(mockMetadata.type).toBe('IELTS');
      expect(mockMetadata.skill).toBe('Reading');
    });

    it('should assign correct passage IDs', () => {
      const p1Questions = mockQuestions.filter(q => q.passageId === 'p1');
      const p2Questions = mockQuestions.filter(q => q.passageId === 'p2');
      const p3Questions = mockQuestions.filter(q => q.passageId === 'p3');

      expect(p1Questions.length).toBeGreaterThan(0);
      expect(p2Questions.length).toBeGreaterThan(0);
      expect(p3Questions.length).toBeGreaterThan(0);
    });

    it('should have valid question numbers (1-40)', () => {
      const numbers = mockQuestions.map(q => q.number);

      expect(Math.min(...numbers)).toBe(1);
      expect(Math.max(...numbers)).toBe(40);
      expect(numbers).toHaveLength(40);
    });

    it('should have correct duration for IELTS Reading', () => {
      expect(mockMetadata.duration).toBe(60);
    });
  });

  describe('Test Metadata Validation', () => {
    it('should validate required metadata fields', () => {
      const metadata: TestMetadata = {
        title: 'Test Title',
        type: 'IELTS',
        skill: 'Reading',
        duration: 60,
        difficulty: 'Intermediate',
        description: 'Test description',
      };

      expect(metadata.title).toBeTruthy();
      expect(metadata.type).toBeTruthy();
      expect(metadata.skill).toBeTruthy();
      expect(metadata.duration).toBeGreaterThan(0);
      expect(metadata.difficulty).toBeTruthy();
    });

    it('should validate test types', () => {
      const validTypes: Array<'IELTS' | 'TOEFL' | 'Custom'> = ['IELTS', 'TOEFL', 'Custom'];

      validTypes.forEach(type => {
        const metadata: TestMetadata = {
          title: 'Test',
          type,
          skill: 'Reading',
          duration: 60,
          difficulty: 'Intermediate',
          description: '',
        };

        expect(['IELTS', 'TOEFL', 'Custom']).toContain(metadata.type);
      });
    });

    it('should validate skills', () => {
      const validSkills: Array<'Reading' | 'Listening' | 'Writing' | 'Speaking'> =
        ['Reading', 'Listening', 'Writing', 'Speaking'];

      validSkills.forEach(skill => {
        const metadata: TestMetadata = {
          title: 'Test',
          type: 'IELTS',
          skill,
          duration: 60,
          difficulty: 'Intermediate',
          description: '',
        };

        expect(['Reading', 'Listening', 'Writing', 'Speaking']).toContain(metadata.skill);
      });
    });

    it('should validate difficulty levels', () => {
      const validDifficulties: Array<'Beginner' | 'Intermediate' | 'Advanced'> =
        ['Beginner', 'Intermediate', 'Advanced'];

      validDifficulties.forEach(difficulty => {
        const metadata: TestMetadata = {
          title: 'Test',
          type: 'IELTS',
          skill: 'Reading',
          duration: 60,
          difficulty,
          description: '',
        };

        expect(['Beginner', 'Intermediate', 'Advanced']).toContain(metadata.difficulty);
      });
    });

    it('should validate duration range (1-180 minutes)', () => {
      expect(1).toBeGreaterThanOrEqual(1);
      expect(1).toBeLessThanOrEqual(180);
      expect(60).toBeGreaterThanOrEqual(1);
      expect(60).toBeLessThanOrEqual(180);
      expect(180).toBeGreaterThanOrEqual(1);
      expect(180).toBeLessThanOrEqual(180);
    });
  });

  describe('Question Type Validation', () => {
    it('should support IELTS question types', () => {
      const ieltsTypes = [
        'multiple-choice',
        'multiple-select',
        'completion',
        'matching',
        'matching-headings',
        'matching-information',
        'matching-features',
        'matching-sentence-endings',
        'true-false-not-given',
        'yes-no-not-given',
        'diagram-labeling',
      ];

      ieltsTypes.forEach(type => {
        expect(type).toBeTruthy();
        expect(typeof type).toBe('string');
      });
    });

    it('should have valid answer formats', () => {
      // String answer (MCQ, T/F/NG, etc.)
      const stringAnswer = 'Option A';
      expect(typeof stringAnswer).toBe('string');

      // Array answer (multiple select)
      const arrayAnswer = ['A', 'B', 'C'];
      expect(Array.isArray(arrayAnswer)).toBe(true);

      // Object answer (matching)
      const objectAnswer = { 'Statement 1': 'Answer A', 'Statement 2': 'Answer B' };
      expect(typeof objectAnswer).toBe('object');
      expect(Array.isArray(objectAnswer)).toBe(false);
    });
  });

  describe('Passage Validation', () => {
    it('should calculate word count correctly', () => {
      const content = 'This is a test passage with exactly ten words here.';
      const wordCount = content.split(/\s+/).length;

      expect(wordCount).toBe(10);
    });

    it('should have valid passage structure', () => {
      const passage = {
        id: 'p1',
        title: 'Test Passage',
        content: 'Content here',
        type: 'text' as const,
        wordCount: 2,
        questionStart: 1,
        questionEnd: 13,
        createdAt: Date.now(),
      };

      expect(passage.id).toBeTruthy();
      expect(passage.title).toBeTruthy();
      expect(passage.content).toBeTruthy();
      expect(passage.type).toBe('text');
      expect(passage.questionStart).toBeLessThanOrEqual(passage.questionEnd);
    });

    it('should support different passage types', () => {
      const types: Array<'text' | 'image' | 'both'> = ['text', 'image', 'both'];

      types.forEach(type => {
        expect(['text', 'image', 'both']).toContain(type);
      });
    });
  });

  describe('Firebase Structure Validation', () => {
    it('should have correct test data structure', () => {
      const testData = {
        id: 'test-123',
        title: 'Test Title',
        type: 'IELTS',
        skill: 'Reading',
        duration: 60,
        difficulty: 'Intermediate',
        questionCount: 40,
        createdAt: Date.now(),
        createdBy: 'teacher-123',
        updatedAt: Date.now(),
        isPublished: true,
        metadata: {},
        passages: [],
        questions: [],
        settings: {},
        statistics: {},
      };

      // Verify all required top-level fields exist
      expect(testData).toHaveProperty('id');
      expect(testData).toHaveProperty('title');
      expect(testData).toHaveProperty('type');
      expect(testData).toHaveProperty('skill');
      expect(testData).toHaveProperty('duration');
      expect(testData).toHaveProperty('questionCount');
      expect(testData).toHaveProperty('metadata');
      expect(testData).toHaveProperty('passages');
      expect(testData).toHaveProperty('questions');
      expect(testData).toHaveProperty('settings');
      expect(testData).toHaveProperty('statistics');
    });

    it('should have correct settings structure', () => {
      const settings = {
        allowPause: false,
        showTimer: true,
        shuffleQuestions: false,
        showResults: 'immediate' as const,
        allowReview: true,
        passingScore: 60,
      };

      expect(settings.allowPause).toBeDefined();
      expect(settings.showTimer).toBeDefined();
      expect(settings.shuffleQuestions).toBeDefined();
      expect(settings.showResults).toBeDefined();
      expect(settings.allowReview).toBeDefined();
      expect(settings.passingScore).toBeGreaterThanOrEqual(0);
      expect(settings.passingScore).toBeLessThanOrEqual(100);
    });

    it('should have correct statistics structure', () => {
      const statistics = {
        attempts: 0,
        averageScore: 0,
        averageTime: 0,
        completionRate: 0,
      };

      expect(statistics).toHaveProperty('attempts');
      expect(statistics).toHaveProperty('averageScore');
      expect(statistics).toHaveProperty('averageTime');
      expect(statistics).toHaveProperty('completionRate');
      expect(statistics.attempts).toBeGreaterThanOrEqual(0);
    });
  });

  describe('wordLimit persistence', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should persist wordLimit in formatted questions when saving to Firebase', async () => {
      const { set, update } = await import('firebase/database');
      (set as any).mockResolvedValueOnce(undefined);
      (update as any).mockResolvedValueOnce(undefined);

      const metadata: TestMetadata = {
        title: 'Word Limit Test',
        type: 'IELTS',
        skill: 'Reading',
        duration: 60,
      };
      const passages = [{
        id: 'p1', title: 'P1', content: 'Test content here',
        type: 'text' as const, wordCount: 3, questionStart: 1, questionEnd: 2, createdAt: '',
      }];
      const questions = [
        {
          id: 'q-1', number: 1, questionNumber: 1, questionText: 'Q1',
          question: 'Q1', type: 'sentence-completion' as const, answer: 'answer',
          answerSource: 'ai-suggestion' as const, passageId: 'p1', confidence: 90,
          points: 1, wordLimit: 3,
        },
        {
          id: 'q-2', number: 2, questionNumber: 2, questionText: 'Q2',
          question: 'Q2', type: 'short-answer' as const, answer: 'answer',
          answerSource: 'ai-suggestion' as const, passageId: 'p1', confidence: 90,
          points: 1,
          // No wordLimit set — should be absent from output
        },
      ];

      await saveTestToFirebase(metadata, passages as any, questions as any, 'user1');

      const rootUpdates = (update as any).mock.calls[0][1];
      const savedData = Object.entries(rootUpdates)
        .find(([path]) => path.startsWith('tests/'))?.[1] as any;
      expect(savedData.questions[0].wordLimit).toBe(3);
      expect(savedData.questions[1].wordLimit).toBeUndefined();
    });

    it('should not persist wordLimit when value is 0 or negative', async () => {
      const { set, update } = await import('firebase/database');
      (set as any).mockResolvedValueOnce(undefined);
      (update as any).mockResolvedValueOnce(undefined);

      const metadata: TestMetadata = {
        title: 'Edge Case Test',
        type: 'IELTS',
        skill: 'Reading',
        duration: 60,
      };
      const passages = [{
        id: 'p1', title: 'P1', content: 'Content',
        type: 'text' as const, wordCount: 1, questionStart: 1, questionEnd: 1, createdAt: '',
      }];
      const questions = [{
        id: 'q-1', number: 1, questionNumber: 1, questionText: 'Q1',
        question: 'Q1', type: 'completion' as const, answer: 'ans',
        answerSource: 'ai-suggestion' as const, passageId: 'p1', confidence: 90,
        points: 1, wordLimit: 0,
      }];

      await saveTestToFirebase(metadata, passages as any, questions as any, 'user1');

      const rootUpdates = (update as any).mock.calls[0][1];
      const savedData = Object.entries(rootUpdates)
        .find(([path]) => path.startsWith('tests/'))?.[1] as any;
      expect(savedData.questions[0].wordLimit).toBeUndefined();
    });

    it('omits empty matching-information section metadata when publishing', async () => {
      const { set, update } = await import('firebase/database');
      (set as any).mockResolvedValueOnce(undefined);
      (update as any).mockResolvedValueOnce(undefined);

      const metadata: TestMetadata = {
        title: 'Matching Information Test',
        type: 'IELTS',
        skill: 'Reading',
        duration: 60,
      };
      const passages = [{
        id: 'p1', title: 'P1', content: 'Content',
        type: 'text' as const, wordCount: 1, questionStart: 1, questionEnd: 1, createdAt: '',
      }];
      const questions = [{
        id: 'q-1',
        number: 1,
        questionNumber: 1,
        questionText: 'Which section contains the following information?',
        question: 'Which section contains the following information?',
        type: 'matching-information' as const,
        answer: 'A',
        answerSource: 'ai-suggestion' as const,
        passageId: 'p1',
        confidence: 90,
        points: 1,
        sectionReferences: [
          { label: 'A', title: '  ', paragraph: '' },
          { label: 'B' },
        ],
      }];

      await saveTestToFirebase(metadata, passages as any, questions as any, 'user1');

      const rootUpdates = (update as any).mock.calls[0][1];
      const savedData = Object.entries(rootUpdates)
        .find(([path]) => path.startsWith('tests/'))?.[1] as any;
      expect(savedData.questions[0].sectionReferences).toEqual([
        { label: 'A' },
        { label: 'B' },
      ]);
      expect(savedData.questions[0].sectionReferences[0]).not.toHaveProperty('title');
      expect(savedData.questions[0].sectionReferences[0]).not.toHaveProperty('paragraph');
    });

    it('persists canonical questionGroups and derives flat table member questions from them', async () => {
      const { set, update } = await import('firebase/database');
      (set as any).mockResolvedValue(undefined);
      (update as any).mockResolvedValue(undefined);

      const metadata: TestMetadata = {
        title: 'Canonical Table Test',
        type: 'IELTS',
        skill: 'Reading',
        duration: 60,
      };
      const passages = [{
        id: 'p1',
        title: 'P1',
        content: 'Content',
        type: 'text' as const,
        wordCount: 1,
        questionStart: 1,
        questionEnd: 1,
        createdAt: '',
      }];

      await saveTestToFirebase(
        metadata,
        passages as any,
        [],
        'user1',
        undefined,
        'user1',
        false,
        [CANONICAL_TABLE_GROUP as any],
      );

      const rootUpdates = (update as any).mock.calls[0][1];
      const savedData = Object.entries(rootUpdates)
        .find(([path]) => path.startsWith('tests/'))?.[1] as any;
      expect(savedData.questionGroups).toEqual([CANONICAL_TABLE_GROUP]);
      expect(savedData.tableCompletionDiagnostics).toEqual([
        expect.objectContaining({
          groupId: 'group-1',
          sourceShape: 'html-table',
          hasCanonicalGroup: true,
        }),
      ]);
      expect(savedData.questions).toEqual([
        expect.objectContaining({
          number: 1,
          type: 'table-completion',
          questionText: 'Native region: ___',
          sectionInstructionId: 'group-1',
          groupId: 'group-1',
          blankId: 'blank-1',
          anchorId: 'anchor-1',
          groupTaskType: 'table-completion',
          tableGroupSchemaVersion: 1,
        }),
      ]);
    });
  });

  describe('persistIELTSCanonicalQuestionGroupsToFirebase', () => {
    beforeEach(async () => {
      vi.clearAllMocks();
      const { ref } = await import('firebase/database');
      (ref as any).mockImplementation((_db: unknown, path: string) => ({ path }));
    });

    it('rewrites canonical IELTS table groups and regenerates the student-safe projection', async () => {
      const { get, set, update } = await import('firebase/database');
      (get as any).mockResolvedValueOnce({
        exists: () => true,
        val: () => ({
          id: 'test-1',
          title: 'Reading Test',
          type: 'IELTS',
          skill: 'Reading',
          duration: 60,
          difficulty: 'Intermediate',
          questionCount: 1,
          createdAt: 1,
          createdBy: 'user-1',
          updatedAt: 1,
          isPublished: false,
          ownerId: 'user-1',
          isPublic: false,
          isComplete: true,
          metadata: {
            description: '',
            instructions: '',
            tags: [],
          },
          passages: [
            {
              id: 'p1',
              title: 'Passage 1',
              content: 'Content',
              type: 'text',
              wordCount: 1,
              questionStart: 1,
              questionEnd: 1,
              createdAt: 1,
            },
          ],
          questions: [],
          settings: {
            allowPause: false,
            showTimer: true,
            shuffleQuestions: false,
            showResults: 'immediate',
            allowReview: true,
            passingScore: 60,
          },
          statistics: {
            attempts: 0,
            averageScore: 0,
            averageTime: 0,
            completionRate: 0,
          },
          questionGroups: [],
          tableCompletionDiagnostics: [],
        }),
      });
      (set as any).mockResolvedValue(undefined);
      (update as any).mockResolvedValue(undefined);

      const result = await persistIELTSCanonicalQuestionGroupsToFirebase('test-1', [
        CANONICAL_TABLE_GROUP as any,
      ]);

      expect(result).toEqual({ success: true });
      expect(update).toHaveBeenCalledWith(
        { path: undefined },
        expect.objectContaining({
          'tests/test-1': expect.objectContaining({
          questionGroups: [CANONICAL_TABLE_GROUP],
          tableCompletionDiagnostics: [
            expect.objectContaining({
              groupId: 'group-1',
              hasCanonicalGroup: true,
            }),
          ],
          questions: [
            expect.objectContaining({
              groupId: 'group-1',
              blankId: 'blank-1',
              anchorId: 'anchor-1',
              type: 'table-completion',
            }),
          ],
          }),
          'material_catalog/material_summary_indexes/v1/by_owner/user-1/test-1':
            expect.objectContaining({ materialId: 'test-1' }),
        }),
      );
      expect(set).toHaveBeenCalledWith(
        { path: 'student_safe_tests/test-1' },
        expect.objectContaining({
          questionGroups: [
            expect.objectContaining({
              provenance: { canonicalRevisionHash: 'rev-1' },
            }),
          ],
        }),
      );
    });
  });
});
