import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { THCSSection } from '../../types/thcs-test.types';
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

it('blocks publication until preserved import source has been reviewed', () => {
    const section: THCSSection = {
        id: 'source', name: 'Original source', order: 0, totalPoints: 0,
        pointMode: 'manual', instructionText: '', isCustomInstruction: true, layout: 'single-column',
        importSourceNeedsReview: true, isRawTextFallback: true, rawText: 'Question and answer source',
        questions: [{ id: 'q', questionNumber: 1, type: 'raw-text-fallback', questionText: 'Question text', correctAnswer: '' }],
    };
    const { result, rerender } = renderHook(({ sections }) => useThcsValidation({
        metadata: { title: 'Test', duration: 45, gradeLevel: 9, examType: 'midterm' }, sections,
    }), { initialProps: { sections: [section] } });
    expect(result.current.isValid).toBe(false);
    expect(result.current.errors).toContain('Review the preserved source in Build Test before publishing section "Original source".');
    rerender({ sections: [{ ...section, importSourceNeedsReview: false }] });
    expect(result.current.isValid).toBe(true);
});