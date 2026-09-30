import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useThcsValidation } from './useThcsValidation';

describe('useThcsValidation metadata errors', () => {
    it('exposes the publish-required setup errors separately', () => {
        const { result } = renderHook(() => useThcsValidation({
            metadata: { title: '', duration: 45, gradeLevel: 9, examType: '' },
            sections: [],
        }));

        expect(result.current.metadataErrors).toEqual([
            'Test title is required.',
            'Exam type is required.',
        ]);
        expect(result.current.errors).toEqual(result.current.metadataErrors);
    });
});
