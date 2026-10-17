import { renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useWritingAutoSave } from './useWritingAutoSave';
vi.mock('../services/firebase', () => ({ database: {} }));
vi.mock('firebase/database', () => ({ ref: (_db: unknown, path: string) => path, set: vi.fn(),
    get: async () => ({ exists: () => true, val: () => ({ task2: { text: 'Accepted Task 2 draft' } }) }),
}));
it('restores the saved Task 2 editor before an explicit tab selection has been persisted', async () => {
    const { result } = renderHook(() => useWritingAutoSave('QAWRT2', 'student'));
    await expect(result.current.loadSavedState()).resolves.toMatchObject({ activeTask: 2, task2Text: 'Accepted Task 2 draft' });
});
