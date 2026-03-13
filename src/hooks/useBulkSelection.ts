import { useCallback, useMemo, useState } from 'react';

export interface UseBulkSelectionReturn<T extends string> {
    selected: Set<T>;
    selectedCount: number;
    toggle: (id: T) => void;
    selectAll: (ids: T[]) => void;
    deselectAll: () => void;
    isSelected: (id: T) => boolean;
}

export function useBulkSelection<T extends string>(): UseBulkSelectionReturn<T> {
    const [selected, setSelected] = useState<Set<T>>(() => new Set<T>());

    const toggle = useCallback((id: T) => {
        setSelected((currentSelected) => {
            const nextSelected = new Set(currentSelected);

            if (nextSelected.has(id)) {
                nextSelected.delete(id);
            } else {
                nextSelected.add(id);
            }

            return nextSelected;
        });
    }, []);

    const selectAll = useCallback((ids: T[]) => {
        setSelected(new Set(ids));
    }, []);

    const deselectAll = useCallback(() => {
        setSelected(new Set<T>());
    }, []);

    const isSelected = useCallback((id: T) => selected.has(id), [selected]);

    const selectedCount = useMemo(() => selected.size, [selected]);

    return {
        selected,
        selectedCount,
        toggle,
        selectAll,
        deselectAll,
        isSelected,
    };
}

export default useBulkSelection;
