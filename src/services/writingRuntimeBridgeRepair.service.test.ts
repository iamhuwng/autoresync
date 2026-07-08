import { describe, expect, it } from 'vitest';
import {
  buildWritingRuntimeBridgeRepairUpdatePayload,
  planWritingRuntimeBridgeRepair,
} from './writingRuntimeBridgeRepair.service';

const task = {
  taskNumber: 2,
  taskType: 'opinion',
  promptText: 'Some people prefer online learning. Discuss.',
  wordMinimum: 250,
  recommendedTimeMinutes: 40,
  showModelAnswerToStudent: false,
};

const publishedDraft = {
  userId: 'teacher-1',
  status: 'published',
  publishedTestId: 'writing-test-1',
  metadata: {
    title: 'IELTS Writing Practice',
    duration: 40,
    format: 'task2-only',
    tags: ['ielts'],
  },
  tasks: [task],
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_100_000,
};

describe('writingRuntimeBridgeRepair.service', () => {
  it('backfills a missing RTDB runtime test and active material summary from a published draft', () => {
    const plan = planWritingRuntimeBridgeRepair({
      draftsById: { 'draft-1': publishedDraft },
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

    const payload = buildWritingRuntimeBridgeRepairUpdatePayload(plan.operations);
    expect(payload['tests/writing-test-1']).toMatchObject({
      id: 'writing-test-1',
      testType: 'IELTS',
      skill: 'Writing',
      ownerId: 'teacher-1',
      sourceDraftId: 'draft-1',
      metadata: expect.objectContaining({ title: 'IELTS Writing Practice' }),
    });
    expect(payload['material_catalog/material_summary_indexes/v1/by_owner/teacher-1/writing-test-1'])
      .toMatchObject({
        producerId: 'writing',
        materialKind: 'writing-prompt',
        visibility: 'private',
      });
    expect(payload['material_catalog/material_summary_indexes/v1/by_test_type/ielts/writing-test-1'])
      .toMatchObject({ skillId: 'writing' });
  });

  it('does not overwrite existing runtime rows but can repair missing summary rows', () => {
    const plan = planWritingRuntimeBridgeRepair({
      draftsById: { 'draft-1': publishedDraft },
      testsById: {
        'writing-test-1': {
          id: 'writing-test-1',
          type: 'IELTS',
          testType: 'IELTS',
          skill: 'Writing',
          title: 'IELTS Writing Practice',
          metadata: publishedDraft.metadata,
          tasks: [task],
          createdBy: 'teacher-1',
          ownerId: 'teacher-1',
          sourceDraftId: 'draft-1',
          isPublic: false,
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
      testId: 'writing-test-1',
      draftId: 'draft-1',
      reason: 'existing-runtime',
    }));
  });

  it('skips published drafts that do not have runnable task bodies', () => {
    const plan = planWritingRuntimeBridgeRepair({
      draftsById: {
        'draft-1': {
          ...publishedDraft,
          tasks: [],
        },
      },
      testsById: {},
      currentSummaryIndex: null,
    });

    expect(plan.operations).toHaveLength(0);
    expect(plan.skips).toContainEqual(expect.objectContaining({
      testId: 'writing-test-1',
      draftId: 'draft-1',
      reason: 'missing-tasks',
    }));
  });

  it('does not resurrect a removed summary from a stale published draft', () => {
    const plan = planWritingRuntimeBridgeRepair({
      draftsById: { 'draft-1': publishedDraft },
      testsById: {},
      currentSummaryIndex: {
        by_id: {
          'writing-test-1': {
            schemaVersion: 1,
            materialId: 'writing-test-1',
            producerId: 'writing',
            materialKind: 'writing-prompt',
            surfaceFamily: 'assessment',
            ownerId: 'teacher-1',
            title: 'IELTS Writing Practice',
            visibility: 'private',
            lifecycleState: 'removed',
            skillId: 'writing',
            primaryTestTypeId: 'ielts',
            testTypeIds: ['ielts'],
            tags: ['ielts'],
            questionCount: 1,
            updatedAt: '2023-11-14T22:30:00.000Z',
          },
        },
        by_owner: {
          'teacher-1': {
            'writing-test-1': {
              schemaVersion: 1,
              materialId: 'writing-test-1',
              ownerId: 'teacher-1',
              title: 'IELTS Writing Practice',
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
        path: 'material_catalog/material_summary_indexes/v1/by_owner/teacher-1/writing-test-1',
      }),
    ]);
    expect(plan.skips).toContainEqual(expect.objectContaining({
      testId: 'writing-test-1',
      draftId: 'draft-1',
      reason: 'removed-summary-tombstone',
    }));
  });
});
