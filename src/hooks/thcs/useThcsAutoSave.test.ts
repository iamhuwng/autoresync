import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateThcsDraft } from '../../services/thcsDraftService';
import { useThcsAutoSave } from './useThcsAutoSave';

vi.mock('../../services/thcsDraftService', () => ({ updateThcsDraft: vi.fn() }));

describe('useThcsAutoSave', () => {
    beforeEach(() => vi.clearAllMocks());

    it('saves a newly created draft by the supplied ID and returns the write result', async () => {
        vi.mocked(updateThcsDraft).mockResolvedValueOnce({ success: true });
        const data = { questionCount: 155 };
        const { result } = renderHook(() => useThcsAutoSave({ draftId: null, data, isDirty: false }));

        let saveResult: Awaited<ReturnType<typeof result.current.saveNow>> | undefined;
        await act(async () => { saveResult = await result.current.saveNow('draft-new'); });

        expect(updateThcsDraft).toHaveBeenCalledWith('draft-new', data);
        expect(saveResult).toEqual({ success: true });
    });

    it('returns a failed write so the editor cannot announce a successful save', async () => {
        vi.mocked(updateThcsDraft).mockResolvedValueOnce({ success: false, error: 'Permission denied' });
        const { result } = renderHook(() => useThcsAutoSave({
            draftId: 'draft-existing', data: { questionCount: 155 }, isDirty: false,
        }));

        let saveResult: Awaited<ReturnType<typeof result.current.saveNow>> | undefined;
        await act(async () => { saveResult = await result.current.saveNow(); });

        expect(saveResult).toEqual({ success: false, error: 'Permission denied' });
    });
});
