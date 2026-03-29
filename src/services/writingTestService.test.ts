import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDoc, setDoc } from 'firebase/firestore';
import { set as setDatabaseValue, push, update as updateDatabaseValue } from 'firebase/database';
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
    (setDatabaseValue as any).mockResolvedValue(undefined);
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
    expect(setDatabaseValue).toHaveBeenCalledOnce();
    expect(setDoc).toHaveBeenCalledOnce();
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

  it('still reads Firestore when updating an existing draft', async () => {
    (getDoc as any).mockResolvedValue({
      exists: () => true,
      data: () => ({
        userId: 'teacher-1',
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
  });
});
