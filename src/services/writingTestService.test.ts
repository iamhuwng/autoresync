import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDoc, setDoc } from 'firebase/firestore';
import { get, push, update as updateDatabaseValue } from 'firebase/database';
import {
  saveWritingDraft,
  publishWritingTest,
  ensureWritingEditableDraft,
} from './writingTestService';

vi.mock('./firebase', () => ({
  database: {},
  firestore: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_: unknown, path: string) => path),
  doc: vi.fn((_: unknown, ...segments: string[]) => segments.join('/')),
  setDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  deleteDoc: vi.fn(),
  updateDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  Timestamp: class MockTimestamp {},
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn((_: unknown, path: string) => path),
  set: vi.fn(),
  get: vi.fn(),
  push: vi.fn(),
  update: vi.fn(),
}));

vi.mock('./draftCloudService', () => ({
  deepRemoveUndefined: (value: unknown) => value,
}));

vi.mock('./restoreGuard', () => ({
  withRestoreGuard:
    (_serviceName: string, _safeReturn: unknown) =>
      (fn: (...args: any[]) => Promise<any>) =>
        fn,
}));

describe('writingTestService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (setDoc as any).mockResolvedValue(undefined);
    (updateDatabaseValue as any).mockResolvedValue(undefined);
    (push as any).mockReturnValue({ key: 'generated-test-id' });
  });

  it('saves a brand-new writing draft without reading a missing Firestore document first', async () => {
    const result = await saveWritingDraft('teacher-1', {
      metadata: {
        title: 'Writing Draft',
        duration: 60,
        format: 'full-test',
      },
      tasks: [],
    } as any);

    expect(result.success).toBe(true);
    expect(getDoc).not.toHaveBeenCalled();
    expect(setDoc).toHaveBeenCalledOnce();
  });

  it('publishes an unsaved writing draft without reading a missing Firestore document first', async () => {
    const result = await publishWritingTest({
      id: '',
      userId: 'teacher-1',
      testType: 'IELTS',
      skill: 'Writing',
      isPublic: true,
      metadata: {
        title: 'Unsaved Writing Test',
        duration: 60,
        format: 'full-test',
      },
      tasks: [
        {
          taskNumber: 1,
          taskType: 'line-graph',
          promptText: 'Prompt',
          wordMinimum: 150,
          recommendedTimeMinutes: 20,
          showModelAnswerToStudent: false,
        },
      ],
      status: 'published',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    expect(result.success).toBe(true);
    expect(getDoc).not.toHaveBeenCalled();
    expect(updateDatabaseValue).toHaveBeenCalledOnce();
    expect(setDoc).toHaveBeenCalledOnce();
    expect(updateDatabaseValue).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        'tests/generated-test-id': expect.objectContaining({
          isPublic: true,
        }),
        'material_catalog/material_summary_indexes/v1/by_visibility/public/generated-test-id':
          expect.objectContaining({ producerId: 'writing' }),
      }),
    );
  });

  it('creates an editable draft link without reading Firestore when a writing test has no sourceDraftId', async () => {
    const result = await ensureWritingEditableDraft({
      id: 'test-1',
      testType: 'IELTS',
      skill: 'Writing',
      metadata: {
        title: 'Published Writing Test',
        duration: 60,
        format: 'full-test',
      },
      tasks: [],
      createdBy: 'teacher-1',
      ownerId: 'teacher-1',
      isPublic: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as any, 'teacher-1');

    expect(result.success).toBe(true);
    expect(getDoc).not.toHaveBeenCalled();
    expect(setDoc).toHaveBeenCalledOnce();
    expect(updateDatabaseValue).toHaveBeenCalledOnce();
  });

  it('hydrates a summary-backed writing material from the canonical published test before creating an editable draft', async () => {
    (get as any).mockResolvedValue({
      exists: () => true,
      val: () => ({
        id: 'test-1',
        testType: 'IELTS',
        skill: 'Writing',
        metadata: {
          title: 'Task 1 Published Test',
          duration: 20,
          format: 'task1-only',
        },
        tasks: [
          {
            taskNumber: 1,
            taskType: 'line-graph',
            promptText: 'Describe the published chart.',
            promptImageUrl: 'https://example.com/chart.png',
            wordMinimum: 150,
            recommendedTimeMinutes: 20,
            showModelAnswerToStudent: false,
          },
        ],
        createdBy: 'teacher-1',
        ownerId: 'teacher-1',
        isPublic: false,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_500,
      }),
    });

    const result = await ensureWritingEditableDraft({
      id: 'test-1',
      testType: 'IELTS',
      skill: 'Writing',
      title: 'Task 1 Published Test',
      duration: 20,
      metadata: {
        title: 'Task 1 Published Test',
        duration: 20,
      },
    } as any, 'teacher-1');

    expect(result.success).toBe(true);
    expect(get).toHaveBeenCalledWith('tests/test-1');
    expect(setDoc).toHaveBeenCalledWith(
      expect.stringMatching(/^writing_drafts\//),
      expect.objectContaining({
        metadata: expect.objectContaining({
          title: 'Task 1 Published Test',
          duration: 20,
          format: 'task1-only',
        }),
        tasks: [
          expect.objectContaining({
            taskNumber: 1,
            promptText: 'Describe the published chart.',
          }),
        ],
      }),
    );
  });

  it('repairs an already-linked blank edit draft from the canonical published writing test', async () => {
    (get as any).mockResolvedValue({
      exists: () => true,
      val: () => ({
        id: 'test-1',
        testType: 'IELTS',
        skill: 'Writing',
        sourceDraftId: 'blank-draft-1',
        metadata: {
          title: 'Task 2 Published Test',
          duration: 40,
          format: 'task2-only',
        },
        tasks: [
          {
            taskNumber: 2,
            taskType: 'opinion',
            promptText: 'Discuss the published topic.',
            wordMinimum: 250,
            recommendedTimeMinutes: 40,
            showModelAnswerToStudent: false,
          },
        ],
        createdBy: 'teacher-1',
        ownerId: 'teacher-1',
        isPublic: false,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_500,
      }),
    });
    (getDoc as any).mockResolvedValue({
      exists: () => true,
      data: () => ({
        id: 'blank-draft-1',
        userId: 'teacher-1',
        metadata: {
          title: 'Task 2 Published Test',
          duration: 40,
          format: 'full-test',
        },
        tasks: [],
        status: 'published',
        publishedTestId: 'test-1',
      }),
    });

    const result = await ensureWritingEditableDraft({
      id: 'test-1',
      testType: 'IELTS',
      skill: 'Writing',
      title: 'Task 2 Published Test',
      duration: 40,
      metadata: {
        title: 'Task 2 Published Test',
        duration: 40,
      },
    } as any, 'teacher-1');

    expect(result).toEqual({ success: true, draftId: 'blank-draft-1' });
    expect(setDoc).toHaveBeenCalledWith(
      'writing_drafts/blank-draft-1',
      expect.objectContaining({
        metadata: expect.objectContaining({ format: 'task2-only' }),
        tasks: [
          expect.objectContaining({
            taskNumber: 2,
            promptText: 'Discuss the published topic.',
          }),
        ],
      }),
    );
  });

  it('still reads Firestore when updating an existing draft', async () => {
    (getDoc as any).mockResolvedValue({
      exists: () => true,
      data: () => ({
        userId: 'teacher-1',
        isPublic: true,
        status: 'editing',
        createdAt: new Date('2026-03-29T00:00:00Z'),
      }),
    });

    const result = await saveWritingDraft('teacher-1', {
      id: 'draft-1',
      metadata: {
        title: 'Existing Draft',
        duration: 60,
        format: 'full-test',
      },
      tasks: [],
    } as any);

    expect(result.success).toBe(true);
    expect(getDoc).toHaveBeenCalledOnce();
    expect(setDoc).toHaveBeenCalledOnce();
    expect(setDoc).toHaveBeenCalledWith(
      'writing_drafts/draft-1',
      expect.objectContaining({
        isPublic: true,
      })
    );
  });
});
