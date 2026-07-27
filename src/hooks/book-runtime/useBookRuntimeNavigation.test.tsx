import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useBookRuntimeNavigation } from './useBookRuntimeNavigation';

const activities = [
  { activityId: 'activity-1', pageGroupKey: 'group-1' },
  { activityId: 'activity-2', pageGroupKey: 'group-1' },
  { activityId: 'activity-3', pageGroupKey: 'group-2' },
];

describe('useBookRuntimeNavigation', () => {
  it('normalizes URL-derived activity state and flushes before navigation', async () => {
    const events: string[] = [];
    const { result } = renderHook(() => useBookRuntimeNavigation({
      activities,
      initialState: { activityId: 'activity-2' },
      onFlushBeforeNavigate: async (reason) => {
        events.push(`flush:${reason}`);
      },
      onNavigate: (state, reason) => {
        events.push(`navigate:${reason}:${state.activityId}`);
      },
    }));

    expect(result.current.state).toMatchObject({
      activityId: 'activity-2',
      pageGroupKey: 'group-1',
      desktopView: 'split',
      mobileTab: 'page',
    });

    act(() => result.current.nextActivity());
    await waitFor(() => expect(result.current.state.activityId).toBe('activity-3'));
    expect(events).toEqual([
      'flush:next-activity',
      'navigate:next-activity:activity-3',
    ]);
  });

  it('keeps local layout state while changing page groups and exposes deterministic groups', async () => {
    const { result } = renderHook(() => useBookRuntimeNavigation({
      activities,
      initialState: { activityId: 'activity-2', navigatorCollapsed: true },
    }));

    expect(result.current.pageGroups).toEqual(['group-1', 'group-2']);
    act(() => result.current.selectPageGroup('group-2'));
    await waitFor(() => expect(result.current.state.activityId).toBe('activity-3'));
    expect(result.current.state.navigatorCollapsed).toBe(true);

    act(() => result.current.setMobileTab('activity'));
    expect(result.current.state.mobileTab).toBe('activity');
    act(() => result.current.restoreSplitView());
    expect(result.current.state.desktopView).toBe('split');
  });

  it('resynchronizes when the URL-derived initial state changes', async () => {
    const { result, rerender } = renderHook(
      ({ activityId }: { activityId: string }) => useBookRuntimeNavigation({
        activities,
        initialState: { activityId },
      }),
      { initialProps: { activityId: 'activity-1' } },
    );

    act(() => result.current.nextActivity());
    await waitFor(() => expect(result.current.state.activityId).toBe('activity-2'));
    rerender({ activityId: 'activity-2' });
    rerender({ activityId: 'activity-1' });
    await waitFor(() => expect(result.current.state.activityId).toBe('activity-1'));
  });

  it('shows the PDF pane when focus mode is selected', () => {
    const { result } = renderHook(() => useBookRuntimeNavigation({ activities }));

    act(() => {
      result.current.setMobileTab('activity');
      result.current.setDesktopView('pdf-focus');
    });
    expect(result.current.state).toMatchObject({ desktopView: 'pdf-focus', mobileTab: 'page' });
  });
});
