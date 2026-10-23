import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type BookRuntimeDesktopView = 'split' | 'pdf-focus';
export type BookRuntimeMobileTab = 'page' | 'activity';
export interface BookRuntimeNavigationActivity { readonly runtimeKey: string; readonly activityId: string; readonly pageGroupKeys: readonly string[] }
export interface BookRuntimeNavigationPageGroup { readonly pageGroupKey: string; readonly combinedPhysicalPages: readonly number[]; readonly defaultCombinedPhysicalPage?: number }
export interface BookRuntimeNavigationState {
  readonly pageGroupKey: string;
  readonly runtimeKey: string;
  readonly activityId: string;
  readonly combinedPhysicalPage: number;
  readonly desktopView: BookRuntimeDesktopView;
  readonly mobileTab: BookRuntimeMobileTab;
  readonly navigatorCollapsed: boolean;
}
export type BookRuntimeNavigationReason = 'page-group-selected' | 'activity-selected' | 'previous-activity' | 'next-activity' | 'combined-page-selected' | 'mobile-tab-changed' | 'desktop-view-changed' | 'activity-focused';
export interface UseBookRuntimeNavigationOptions {
  readonly activities: readonly BookRuntimeNavigationActivity[];
  readonly pageGroups: readonly BookRuntimeNavigationPageGroup[];
  readonly initialState?: Partial<BookRuntimeNavigationState>;
  readonly onFlushBeforeNavigate?: (reason: BookRuntimeNavigationReason, state: BookRuntimeNavigationState) => void | Promise<void>;
  readonly onNavigate?: (state: BookRuntimeNavigationState, reason: BookRuntimeNavigationReason) => void;
  readonly onNavigationError?: (error: unknown, reason: BookRuntimeNavigationReason) => void;
}

const normalizeState = (activities: readonly BookRuntimeNavigationActivity[], pageGroups: readonly BookRuntimeNavigationPageGroup[], requested?: Partial<BookRuntimeNavigationState>): BookRuntimeNavigationState => {
  const fallback = activities[0];
  if (!fallback) throw new Error('BookRuntimeShell requires at least one Activity.');
  const active = activities.find((activity) => activity.runtimeKey === requested?.runtimeKey)
    ?? activities.find((activity) => activity.pageGroupKeys.includes(requested?.pageGroupKey ?? ''))
    ?? fallback;
  const pageGroupKey = pageGroups.some((group) => group.pageGroupKey === requested?.pageGroupKey)
    ? requested!.pageGroupKey!
    : active.pageGroupKeys[0];
  const group = pageGroups.find((candidate) => candidate.pageGroupKey === pageGroupKey);
  const firstPage = group?.combinedPhysicalPages.find((page) => Number.isSafeInteger(page) && page > 0);
  if (!pageGroupKey || !firstPage) throw new Error(`BookRuntimeShell requires combined pages for Activity ${active.activityId}.`);
  const combinedPhysicalPage = requested?.combinedPhysicalPage !== undefined
    && (!requested.pageGroupKey || requested.pageGroupKey === pageGroupKey)
    && group?.combinedPhysicalPages.includes(requested.combinedPhysicalPage)
    ? requested.combinedPhysicalPage
    : group?.defaultCombinedPhysicalPage !== undefined && group.combinedPhysicalPages.includes(group.defaultCombinedPhysicalPage)
      ? group.defaultCombinedPhysicalPage : firstPage;
  return { pageGroupKey, runtimeKey: active.runtimeKey, activityId: active.activityId, combinedPhysicalPage, desktopView: requested?.desktopView === 'pdf-focus' ? 'pdf-focus' : 'split', mobileTab: requested?.mobileTab === 'activity' ? 'activity' : 'page', navigatorCollapsed: requested?.navigatorCollapsed === true };
};

export interface BookRuntimeNavigationController {
  readonly state: BookRuntimeNavigationState;
  readonly isTransitioning: boolean;
  readonly pageGroups: readonly BookRuntimeNavigationPageGroup[];
  readonly selectPageGroup: (pageGroupKey: string) => void;
  readonly selectActivity: (runtimeKey: string) => void;
  readonly selectCombinedPhysicalPage: (page: number) => void;
  readonly previousActivity: () => void;
  readonly nextActivity: () => void;
  readonly setDesktopView: (view: BookRuntimeDesktopView) => void;
  readonly setMobileTab: (tab: BookRuntimeMobileTab) => void;
  readonly setNavigatorCollapsed: (collapsed: boolean) => void;
  readonly restoreSplitView: () => void;
  readonly focusActivity: () => void;
}

export const useBookRuntimeNavigation = ({ activities, pageGroups, initialState, onFlushBeforeNavigate, onNavigate, onNavigationError }: UseBookRuntimeNavigationOptions): BookRuntimeNavigationController => {
  const initial = useMemo(() => normalizeState(activities, pageGroups, initialState), [activities, initialState, pageGroups]);
  const [state, setState] = useState(initial);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const initialStateKey = JSON.stringify(initialState ?? {});
  const previousInitialStateKey = useRef(initialStateKey);
  useEffect(() => setState((current) => normalizeState(activities, pageGroups, current)), [activities, pageGroups]);
  useEffect(() => {
    if (previousInitialStateKey.current === initialStateKey) return;
    previousInitialStateKey.current = initialStateKey;
    setState(normalizeState(activities, pageGroups, initialState));
  }, [activities, initialState, initialStateKey, pageGroups]);
  const transition = useCallback(async (next: Partial<BookRuntimeNavigationState>, reason: BookRuntimeNavigationReason) => {
    if (isTransitioning) return;
    const nextState = normalizeState(activities, pageGroups, { ...state, ...next });
    setIsTransitioning(true);
    try {
      await onFlushBeforeNavigate?.(reason, state);
      setState(nextState);
      onNavigate?.(nextState, reason);
    } catch (error) {
      onNavigationError?.(error, reason);
    } finally { setIsTransitioning(false); }
  }, [activities, isTransitioning, onFlushBeforeNavigate, onNavigate, onNavigationError, pageGroups, state]);
  const selectPageGroup = useCallback((pageGroupKey: string) => {
    const activity = activities.find((candidate) => candidate.pageGroupKeys.includes(pageGroupKey));
    if (pageGroups.some((group) => group.pageGroupKey === pageGroupKey)) void transition({ pageGroupKey, runtimeKey: activity?.runtimeKey ?? state.runtimeKey, activityId: activity?.activityId ?? state.activityId, combinedPhysicalPage: undefined, mobileTab: 'page' }, 'page-group-selected');
  }, [activities, pageGroups, state.activityId, state.runtimeKey, transition]);
  const selectActivity = useCallback((runtimeKey: string) => {
    const activity = activities.find((candidate) => candidate.runtimeKey === runtimeKey);
    if (activity) void transition({ pageGroupKey: activity.pageGroupKeys.includes(state.pageGroupKey) ? state.pageGroupKey : activity.pageGroupKeys[0], runtimeKey: activity.runtimeKey, activityId: activity.activityId,
      ...(activity.pageGroupKeys.includes(state.pageGroupKey) ? {} : { combinedPhysicalPage: undefined }), mobileTab: 'activity' }, 'activity-selected');
  }, [activities, state.pageGroupKey, transition]);
  const selectCombinedPhysicalPage = useCallback((combinedPhysicalPage: number) => {
    const group = pageGroups.find((candidate) => candidate.combinedPhysicalPages.includes(combinedPhysicalPage));
    if (group) void transition({ pageGroupKey: group.pageGroupKey, combinedPhysicalPage }, 'combined-page-selected');
  }, [pageGroups, state.pageGroupKey, transition]);
  const moveActivity = useCallback((offset: number, reason: 'previous-activity' | 'next-activity') => {
    const activity = activities[activities.findIndex((candidate) => candidate.runtimeKey === state.runtimeKey) + offset];
    if (activity) void transition({ pageGroupKey: activity.pageGroupKeys[0], runtimeKey: activity.runtimeKey, activityId: activity.activityId, combinedPhysicalPage: undefined, mobileTab: 'activity' }, reason);
  }, [activities, state.runtimeKey, transition]);
  const setDesktopView = useCallback((desktopView: BookRuntimeDesktopView) => {
    void transition({ desktopView, ...(desktopView === 'pdf-focus' ? { mobileTab: 'page' as const } : {}) }, 'desktop-view-changed');
  }, [transition]);
  const setMobileTab = useCallback((mobileTab: BookRuntimeMobileTab) => {
    void transition({ mobileTab }, 'mobile-tab-changed');
  }, [transition]);
  const setNavigatorCollapsed = useCallback((navigatorCollapsed: boolean) => setState((current) => ({ ...current, navigatorCollapsed })), []);
  const focusActivity = useCallback(() => {
    void transition({ mobileTab: 'activity', desktopView: 'split' }, 'activity-focused');
  }, [transition]);
  return { state, isTransitioning, pageGroups, selectPageGroup, selectActivity, selectCombinedPhysicalPage, previousActivity: () => moveActivity(-1, 'previous-activity'), nextActivity: () => moveActivity(1, 'next-activity'), setDesktopView, setMobileTab, setNavigatorCollapsed, restoreSplitView: () => setDesktopView('split'), focusActivity };
};
