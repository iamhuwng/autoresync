import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useBulkSelection } from './useBulkSelection';

describe('useBulkSelection', () => {
    it('starts empty', () => {
        const { result } = renderHook(() => useBulkSelection<string>());

        expect(result.current.selectedCount).toBe(0);
        expect(result.current.selected.size).toBe(0);
        expect(result.current.isSelected('homework-1')).toBe(false);
    });

    it('toggles selected ids on and off', () => {
        const { result } = renderHook(() => useBulkSelection<string>());

        act(() => {
            result.current.toggle('homework-1');
        });

        expect(result.current.selectedCount).toBe(1);
        expect(result.current.isSelected('homework-1')).toBe(true);

        act(() => {
            result.current.toggle('homework-1');
        });

        expect(result.current.selectedCount).toBe(0);
        expect(result.current.isSelected('homework-1')).toBe(false);
    });

    it('replaces the current selection with selectAll', () => {
        const { result } = renderHook(() => useBulkSelection<string>());

        act(() => {
            result.current.toggle('homework-1');
            result.current.selectAll(['homework-2', 'homework-3']);
        });

        expect(result.current.selectedCount).toBe(2);
        expect(Array.from(result.current.selected)).toEqual(['homework-2', 'homework-3']);
    });

    it('clears all selections with deselectAll', () => {
        const { result } = renderHook(() => useBulkSelection<string>());

        act(() => {
            result.current.selectAll(['homework-1', 'homework-2']);
            result.current.deselectAll();
        });

        expect(result.current.selectedCount).toBe(0);
        expect(result.current.selected.size).toBe(0);
    });
});
