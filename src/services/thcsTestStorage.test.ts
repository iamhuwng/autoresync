import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get, runTransaction, set, update } from 'firebase/database';
import type { THCSTest } from '../types/thcs-test.types';
import {
  deleteThcsTestFromFirebase,
  publishTestUpdate,
  saveThcsTestToFirebase,
  updateThcsTestInFirebase,
} from './thcsTestStorage';

const firebaseMocks = vi.hoisted(() => ({
  ref: vi.fn((_database: unknown, path = '') => ({ path })),
  get: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  runTransaction: vi.fn(),
}));

vi.mock('firebase/database', () => firebaseMocks);
vi.mock('./firebase', () => ({
  database: { name: 'mock-database' },
}));

const snapshot = (exists: boolean, value: unknown) => ({
  exists: () => exists,
  val: () => value,
});

const thcsTest = (overrides: Partial<THCSTest> = {}): THCSTest => ({
  id: 'thcs-1',
  testType: 'THCS-THPT',
  metadata: {
    title: 'THCS Entrance Test',
    duration: 45,
    gradeLevel: 9,
    examType: 'entrance',
    tags: ['grade-9'],
  },
  sections: [],
  questionCount: 10,
  totalPoints: 10,
  createdBy: 'teacher-1',
  ownerId: 'teacher-1',
  isPublic: false,
  isComplete: true,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
  ...overrides,
});

describe('thcsTestStorage material summary lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(1700000001000);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    vi.mocked(update).mockResolvedValue(undefined);
    vi.mocked(set).mockResolvedValue(undefined);
    vi.mocked(runTransaction).mockResolvedValue({ committed: true, snapshot: null } as any);
  });

  it('writes first publish canonical data and active summary in one root update', async () => {
    vi.mocked(get).mockResolvedValueOnce(snapshot(false, null) as any);

    const result = await saveThcsTestToFirebase(thcsTest(), 'teacher-1');

    expect(result).toEqual({ success: true, testId: 'thcs-1' });
    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(
      { path: '' },
      expect.objectContaining({
        'tests/thcs-1': expect.objectContaining({
          testType: 'THCS-THPT',
          publishedAt: 1700000001000,
        }),
        'material_catalog/material_summary_indexes/v1/by_owner/teacher-1/thcs-1':
          expect.objectContaining({
            producerId: 'thcs-thpt',
            materialKind: 'thcs-thpt-test',
            lifecycleState: 'active',
          }),
        'material_catalog/material_summary_indexes/v1/by_test_type/thcs-thpt/thcs-1':
          expect.objectContaining({ producerId: 'thcs-thpt' }),
      }),
    );
  });

  it('updates canonical data and moves active summary memberships atomically', async () => {
    vi.mocked(get)
      .mockResolvedValueOnce(snapshot(true, thcsTest()) as any)
      .mockResolvedValueOnce(snapshot(true, 10) as any)
      .mockResolvedValueOnce(snapshot(true, 'Updated THCS Test') as any);

    const result = await updateThcsTestInFirebase('thcs-1', {
      metadata: {
        title: 'Updated THCS Test',
        duration: 45,
        gradeLevel: 9,
        examType: 'entrance',
      },
      isPublic: true,
    });

    expect(result).toEqual({ success: true });
    expect(update).toHaveBeenCalledWith(
      { path: '' },
      expect.objectContaining({
        'tests/thcs-1': expect.objectContaining({
          isPublic: true,
          updatedAt: 1700000001000,
        }),
        'material_catalog/material_summary_indexes/v1/by_visibility/private/thcs-1': null,
        'material_catalog/material_summary_indexes/v1/by_visibility/public/thcs-1':
          expect.objectContaining({
            title: 'Updated THCS Test',
            visibility: 'public',
          }),
      }),
    );
  });

  it('removes canonical data and leaves a removed by_id tombstone', async () => {
    vi.mocked(get).mockResolvedValueOnce(snapshot(true, thcsTest()) as any);

    const result = await deleteThcsTestFromFirebase('thcs-1');

    expect(result).toEqual({ success: true });
    expect(update).toHaveBeenCalledWith(
      { path: '' },
      expect.objectContaining({
        'tests/thcs-1': null,
        'material_catalog/material_summary_indexes/v1/by_owner/teacher-1/thcs-1': null,
        'material_catalog/material_summary_indexes/v1/by_id/thcs-1': expect.objectContaining({
          lifecycleState: 'removed',
        }),
      }),
    );
  });

  it('republishes with changelog and summary update in the same root update', async () => {
    const current = thcsTest({ publishedAt: 1700000000000 });
    const next = thcsTest({
      metadata: {
        title: 'Republished THCS Test',
        duration: 45,
        gradeLevel: 9,
        examType: 'entrance',
      },
      isPublic: true,
      publishedAt: 1700000000000,
    });
    vi.mocked(get)
      .mockResolvedValueOnce(snapshot(true, current) as any)
      .mockResolvedValueOnce(snapshot(true, {}) as any);

    await publishTestUpdate('thcs-1', next, 'teacher-1');

    expect(runTransaction).toHaveBeenCalledOnce();
    expect(set).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      { path: '' },
      expect.objectContaining({
        'tests/thcs-1': expect.objectContaining({
          metadata: expect.objectContaining({ title: 'Republished THCS Test' }),
          isPublic: true,
          _changelog: expect.any(Object),
        }),
        'material_catalog/material_summary_indexes/v1/by_visibility/private/thcs-1': null,
        'material_catalog/material_summary_indexes/v1/by_visibility/public/thcs-1':
          expect.objectContaining({
            title: 'Republished THCS Test',
            visibility: 'public',
          }),
      }),
    );
  });
});
