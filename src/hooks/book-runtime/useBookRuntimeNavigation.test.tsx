import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useBookRuntimeNavigation } from './useBookRuntimeNavigation';

const activities = [{ runtimeKey: 'placement-1:activity-1:v1', activityId: 'activity-1', pageGroupKeys: ['group-1'] }, { runtimeKey: 'placement-2:activity-2:v1', activityId: 'activity-2', pageGroupKeys: ['group-1'] }, { runtimeKey: 'placement-3:activity-3:v1', activityId: 'activity-3', pageGroupKeys: ['group-2'] }];
const pageGroups = [{ pageGroupKey: 'group-1', combinedPhysicalPages: [2, 4] }, { pageGroupKey: 'group-2', combinedPhysicalPages: [7, 8] }];

describe('useBookRuntimeNavigation', () => {
  it('uses configured opening pages for new groups while preserving an explicit restored page', async () => {
    const configured = [{ ...pageGroups[0]!, defaultCombinedPhysicalPage: 4 }, { ...pageGroups[1]!, defaultCombinedPhysicalPage: 8 }];
    const { result } = renderHook(() => useBookRuntimeNavigation({ activities, pageGroups: configured }));
    expect(result.current.state.combinedPhysicalPage).toBe(4);
    act(() => result.current.selectActivity('placement-3:activity-3:v1'));
    await waitFor(() => expect(result.current.state.combinedPhysicalPage).toBe(8));
    act(() => result.current.previousActivity());
    await waitFor(() => expect(result.current.state.combinedPhysicalPage).toBe(4));
    const restored = renderHook(() => useBookRuntimeNavigation({ activities, pageGroups: configured, initialState: { combinedPhysicalPage: 2 } }));
    expect(restored.result.current.state.combinedPhysicalPage).toBe(2);
  });
  it('owns one combined page and flushes before Activity and Page Group transitions', async () => {
    const events: string[] = [];
    const { result } = renderHook(() => useBookRuntimeNavigation({ activities, pageGroups, initialState: { runtimeKey: 'placement-2:activity-2:v1', combinedPhysicalPage: 4 }, onFlushBeforeNavigate: async (reason) => { events.push(`flush:${reason}`); }, onNavigate: (state, reason) => { events.push(`navigate:${reason}:${state.combinedPhysicalPage}`); } }));
    expect(result.current.state).toMatchObject({ activityId: 'activity-2', pageGroupKey: 'group-1', combinedPhysicalPage: 4 });
    act(() => result.current.nextActivity());
    await waitFor(() => expect(result.current.state.activityId).toBe('activity-3'));
    expect(result.current.state.combinedPhysicalPage).toBe(7);
    expect(events).toEqual(['flush:next-activity', 'navigate:next-activity:7']);
  });

  it('selects any qualified combined page and rejects unqualified pages', async () => {
    const { result } = renderHook(() => useBookRuntimeNavigation({ activities, pageGroups }));
    act(() => result.current.selectCombinedPhysicalPage(7));
    await waitFor(() => expect(result.current.state.combinedPhysicalPage).toBe(7));
    act(() => result.current.selectCombinedPhysicalPage(99));
    expect(result.current.state.combinedPhysicalPage).toBe(7);
    act(() => result.current.selectCombinedPhysicalPage(4));
    await waitFor(() => expect(result.current.state.combinedPhysicalPage).toBe(4));
  });

  it('preserves state when a flush fails', async () => {
    const onNavigationError = vi.fn();
    const { result } = renderHook(() => useBookRuntimeNavigation({ activities, pageGroups, onFlushBeforeNavigate: async () => { throw new Error('flush failed'); }, onNavigationError }));
    act(() => result.current.selectPageGroup('group-2'));
    await waitFor(() => expect(onNavigationError).toHaveBeenCalled());
    expect(result.current.state).toMatchObject({ activityId: 'activity-1', pageGroupKey: 'group-1', combinedPhysicalPage: 2 });
  });

  it('reaches every declared group and retains the physical page when focusing its Activity', async () => {
    const multiGroupActivities = [{ runtimeKey: 'placement-1:activity-1:v1', activityId: 'activity-1', pageGroupKeys: ['group-1', 'group-2'] }];
    const { result } = renderHook(() => useBookRuntimeNavigation({ activities: multiGroupActivities, pageGroups }));
    act(() => result.current.selectPageGroup('group-2'));
    await waitFor(() => expect(result.current.state).toMatchObject({ activityId: 'activity-1', pageGroupKey: 'group-2', combinedPhysicalPage: 7 }));
    act(() => result.current.selectActivity('placement-1:activity-1:v1'));
    await waitFor(() => expect(result.current.state).toMatchObject({ pageGroupKey: 'group-2', combinedPhysicalPage: 7 }));
  });

  it('selects repeated immutable Activity placements by runtime tuple', async () => {
    const repeated = [
      { runtimeKey: 'placement-a:activity-shared:v1', activityId: 'activity-shared', pageGroupKeys: ['group-1'] },
      { runtimeKey: 'placement-b:activity-shared:v1', activityId: 'activity-shared', pageGroupKeys: ['group-2'] },
    ];
    const { result } = renderHook(() => useBookRuntimeNavigation({ activities: repeated, pageGroups }));
    act(() => result.current.selectActivity('placement-b:activity-shared:v1'));
    await waitFor(() => expect(result.current.state).toMatchObject({ runtimeKey: 'placement-b:activity-shared:v1', activityId: 'activity-shared', pageGroupKey: 'group-2' }));
  });
});
