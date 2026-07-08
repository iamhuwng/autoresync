import { describe, expect, it } from 'vitest';
import {
  buildThcsRuntimeBridgeRepairUpdatePayload,
  planThcsRuntimeBridgeRepair,
} from './thcsRuntimeBridgeRepair.service';

const section = {
  id: 'section-1',
  name: 'PART A',
  order: 0,
  totalPoints: 10,
  pointMode: 'auto',
  instructionText: 'Choose the best answer.',
  isCustomInstruction: false,
  layout: 'single-column',
  questions: [{
    id: 'question-1',
    questionNumber: 1,
    type: 'mcq-grammar',
    intent: 'mcq-grammar',
    questionText: 'She ____ to school every day.',
    options: ['go', 'goes', 'going', 'gone'],
    correctAnswer: 'B',
  }],
};

const publishedDraft = {
  userId: 'teacher-1',
  status: 'published',
  publishedTestId: 'thcs-test-1',
  metadata: {
    title: 'Grade 9 Midterm',
    duration: 45,
    gradeLevel: 9,
    examType: 'midterm',
    tags: ['grade-9'],
  },
  sections: [section],
  questionCount: 1,
  totalPoints: 10,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_100_000,
};

describe('thcsRuntimeBridgeRepair.service', () => {
  it('backfills a missing RTDB runtime test and active material summary from a published draft', () => {
    const plan = planThcsRuntimeBridgeRepair({
      draftsById: { 'draft-1': publishedDraft },
      libraryById: {
        'thcs-test-1': {
          testId: 'thcs-test-1',
          title: 'Grade 9 Midterm',
          createdBy: 'teacher-1',
          isPublic: true,
          createdAt: 1_700_000_000_000,
        },
      },
      testsById: {},
      currentSummaryIndex: null,
    });

    expect(plan.totals).toMatchObject({
      publishedDrafts: 1,
      repairableDrafts: 1,
      runtimeWrites: 1,
      summaryWrites: 5,
      operations: 6,
    });

    const payload = buildThcsRuntimeBridgeRepairUpdatePayload(plan.operations);
    expect(payload['tests/thcs-test-1']).toMatchObject({
      id: 'thcs-test-1',
      testType: 'THCS-THPT',
      ownerId: 'teacher-1',
      sourceDraftId: 'draft-1',
      metadata: expect.objectContaining({ title: 'Grade 9 Midterm' }),
    });
    expect(payload['material_catalog/material_summary_indexes/v1/by_owner/teacher-1/thcs-test-1'])
      .toMatchObject({
        producerId: 'thcs-thpt',
        materialKind: 'thcs-thpt-test',
        visibility: 'public',
      });
    expect(payload['material_catalog/material_summary_indexes/v1/by_test_type/thcs-thpt/thcs-test-1'])
      .toMatchObject({ skillId: 'thcs' });
  });

  it('reports Firestore library rows without a full published draft as unbackfillable', () => {
    const plan = planThcsRuntimeBridgeRepair({
      draftsById: {},
      libraryById: {
        'thcs-test-orphan': {
          testId: 'thcs-test-orphan',
          title: 'Metadata Only',
          createdBy: 'teacher-1',
        },
      },
      testsById: {},
      currentSummaryIndex: null,
    });

    expect(plan.operations).toHaveLength(0);
    expect(plan.totals.unbackfillableLibraryRows).toBe(1);
    expect(plan.skips).toContainEqual(expect.objectContaining({
      testId: 'thcs-test-orphan',
      libraryId: 'thcs-test-orphan',
      reason: 'missing-sections',
    }));
  });

  it('does not overwrite existing runtime rows but can repair missing summary rows', () => {
    const plan = planThcsRuntimeBridgeRepair({
      draftsById: { 'draft-1': publishedDraft },
      libraryById: {},
      testsById: {
        'thcs-test-1': {
          id: 'thcs-test-1',
          testType: 'THCS-THPT',
          metadata: publishedDraft.metadata,
          sections: [section],
          questionCount: 1,
          totalPoints: 10,
          createdBy: 'teacher-1',
          ownerId: 'teacher-1',
          isPublic: false,
          isComplete: true,
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_100_000,
        },
      },
      currentSummaryIndex: null,
    });

    expect(plan.totals.runtimeWrites).toBe(0);
    expect(plan.totals.existingRuntime).toBe(1);
    expect(plan.totals.summaryWrites).toBe(5);
    expect(plan.skips).toContainEqual(expect.objectContaining({
      testId: 'thcs-test-1',
      draftId: 'draft-1',
      reason: 'existing-runtime',
    }));
  });

  it('does not resurrect a removed summary from a stale published draft', () => {
    const plan = planThcsRuntimeBridgeRepair({
      draftsById: { 'draft-1': publishedDraft },
      libraryById: {},
      testsById: {},
      currentSummaryIndex: {
        by_id: {
          'thcs-test-1': {
            schemaVersion: 1,
            materialId: 'thcs-test-1',
            producerId: 'thcs-thpt',
            materialKind: 'thcs-thpt-test',
            surfaceFamily: 'assessment',
            ownerId: 'teacher-1',
            title: 'Grade 9 Midterm',
            visibility: 'private',
            lifecycleState: 'removed',
            skillId: 'thcs',
            primaryTestTypeId: 'thcs-thpt',
            testTypeIds: ['thcs-thpt'],
            tags: ['thcs-thpt-test'],
            questionCount: 1,
            updatedAt: '2023-11-14T22:30:00.000Z',
          },
        },
        by_owner: {
          'teacher-1': {
            'thcs-test-1': {
              schemaVersion: 1,
              materialId: 'thcs-test-1',
              ownerId: 'teacher-1',
              title: 'Grade 9 Midterm',
              lifecycleState: 'active',
            },
          },
        },
      },
    });

    expect(plan.totals.runtimeWrites).toBe(0);
    expect(plan.totals.summaryWrites).toBe(0);
    expect(plan.operations).toEqual([
      expect.objectContaining({
        kind: 'material-summary-remove',
        path: 'material_catalog/material_summary_indexes/v1/by_owner/teacher-1/thcs-test-1',
      }),
    ]);
    expect(plan.skips).toContainEqual(expect.objectContaining({
      testId: 'thcs-test-1',
      draftId: 'draft-1',
      reason: 'removed-summary-tombstone',
    }));
  });
});
