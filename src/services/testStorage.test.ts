/**
 * Test Storage Service Unit Tests
 * Tests Firebase test storage operations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateTestId,
  getTestFromFirebase,
  getStudentSafeTestFromFirebase,
  getAllTestsFromFirebase,
  deleteTestFromFirebase,
  buildStudentSafeTestData,
  cacheSessionStudentSafeTestData,
  persistIELTSCanonicalQuestionGroupsToFirebase,
} from './testStorage';

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
