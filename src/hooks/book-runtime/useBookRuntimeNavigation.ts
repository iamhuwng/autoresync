import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type BookRuntimeDesktopView = 'split' | 'pdf-focus';
export type BookRuntimeMobileTab = 'page' | 'activity';

export interface BookRuntimeNavigationActivity {
  readonly activityId: string;
  readonly pageGroupKey: string;
}

export interface BookRuntimeNavigationState {
  readonly pageGroupKey: string;
  readonly activityId: string;
  readonly desktopView: BookRuntimeDesktopView;
  readonly mobileTab: BookRuntimeMobileTab;
  readonly navigatorCollapsed: boolean;
}

export type BookRuntimeNavigationReason =
  | 'page-group-selected'
  | 'activity-selected'
  | 'previous-activity'
  | 'next-activity';

export interface UseBookRuntimeNavigationOptions {
  readonly activities: readonly BookRuntimeNavigationActivity[];
  readonly initialState?: Partial<BookRuntimeNavigationState>;
  readonly onFlushBeforeNavigate?: (
    reason: BookRuntimeNavigationReason,
    state: BookRuntimeNavigationState,
  ) => void | Promise<void>;
  readonly onNavigate?: (
    state: BookRuntimeNavigationState,
    reason: BookRuntimeNavigationReason,
  ) => void;
  readonly onNavigationError?: (error: unknown, reason: BookRuntimeNavigationReason) => void;
}

const firstActivity = (activities: readonly BookRuntimeNavigationActivity[]) => activities[0];

const normalizeState = (
  activities: readonly BookRuntimeNavigationActivity[],
  requested: Partial<BookRuntimeNavigationState> | BookRuntimeNavigationState | undefined,
): BookRuntimeNavigationState => {
  const fallback = firstActivity(activities);
  if (!fallback) {
    throw new Error('BookRuntimeShell requires at least one Activity.');
  }
  const requestedActivity = requested?.activityId
    ? activities.find((activity) => activity.activityId === requested.activityId)
    : undefined;
  const requestedGroup = requested?.pageGroupKey
    ? activities.find((activity) => activity.pageGroupKey === requested.pageGroupKey)
    : undefined;
  const active = requestedActivity ?? requestedGroup ?? fallback;
  return {
    pageGroupKey: active.pageGroupKey,
    activityId: active.activityId,
    desktopView: requested?.desktopView === 'pdf-focus' ? 'pdf-focus' : 'split',
    mobileTab: requested?.mobileTab === 'activity' ? 'activity' : 'page',
    navigatorCollapsed: requested?.navigatorCollapsed === true,
  };
};

export interface BookRuntimeNavigationController {
  readonly state: BookRuntimeNavigationState;
  readonly isTransitioning: boolean;
  readonly pageGroups: readonly string[];
  readonly selectPageGroup: (pageGroupKey: string) => void;
  readonly selectActivity: (activityId: string) => void;
  readonly previousActivity: () => void;
  readonly nextActivity: () => void;
  readonly setDesktopView: (view: BookRuntimeDesktopView) => void;
  readonly setMobileTab: (tab: BookRuntimeMobileTab) => void;
  readonly setNavigatorCollapsed: (collapsed: boolean) => void;
  readonly restoreSplitView: () => void;
}

export const useBookRuntimeNavigation = ({
  activities,
  initialState,
  onFlushBeforeNavigate,
  onNavigate,
  onNavigationError,
}: UseBookRuntimeNavigationOptions): BookRuntimeNavigationController => {
  const initial = useMemo(
    () => normalizeState(activities, initialState),
    [activities, initialState],
  );
  const [state, setState] = useState<BookRuntimeNavigationState>(initial);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const initialStateKey = [
    initialState?.pageGroupKey ?? '',
    initialState?.activityId ?? '',
    initialState?.desktopView ?? '',
    initialState?.mobileTab ?? '',
    initialState?.navigatorCollapsed ? 'true' : 'false',
  ].join('\u0000');
  const previousInitialStateKey = useRef(initialStateKey);

  useEffect(() => {
    setState((current) => normalizeState(activities, current));
  }, [activities]);

  useEffect(() => {
    if (previousInitialStateKey.current === initialStateKey) return;
    previousInitialStateKey.current = initialStateKey;
    setState(normalizeState(activities, initialState));
  }, [activities, initialState, initialStateKey]);

  const pageGroups = useMemo(
    () => Array.from(new Set(activities.map((activity) => activity.pageGroupKey))),
    [activities],
  );

  const transition = useCallback(async (
    next: Partial<BookRuntimeNavigationState>,
    reason: BookRuntimeNavigationReason,
  ): Promise<void> => {
    if (isTransitioning) return;
    const nextState = normalizeState(activities, { ...state, ...next });
    setIsTransitioning(true);
    try {
      await onFlushBeforeNavigate?.(reason, state);
      setState(nextState);
      onNavigate?.(nextState, reason);
    } catch (error) {
      onNavigationError?.(error, reason);
    } finally {
      setIsTransitioning(false);
    }
  }, [activities, isTransitioning, onFlushBeforeNavigate, onNavigate, onNavigationError, state]);

  const selectPageGroup = useCallback((pageGroupKey: string) => {
    const nextActivity = activities.find((activity) => activity.pageGroupKey === pageGroupKey);
    if (!nextActivity) return;
    void transition(
      { pageGroupKey, activityId: nextActivity.activityId, mobileTab: 'page' },
      'page-group-selected',
    );
  }, [activities, transition]);

  const selectActivity = useCallback((activityId: string) => {
    const nextActivity = activities.find((activity) => activity.activityId === activityId);
    if (!nextActivity) return;
    void transition(
      { pageGroupKey: nextActivity.pageGroupKey, activityId, mobileTab: 'activity' },
      'activity-selected',
    );
  }, [activities, transition]);

  const previousActivity = useCallback(() => {
    const index = activities.findIndex((activity) => activity.activityId === state.activityId);
    const previous = index > 0 ? activities[index - 1] : undefined;
    if (!previous) return;
    void transition(
      { pageGroupKey: previous.pageGroupKey, activityId: previous.activityId, mobileTab: 'activity' },
      'previous-activity',
    );
  }, [activities, state.activityId, transition]);

  const nextActivity = useCallback(() => {
    const index = activities.findIndex((activity) => activity.activityId === state.activityId);
    const next = index >= 0 ? activities[index + 1] : undefined;
    if (!next) return;
    void transition(
      { pageGroupKey: next.pageGroupKey, activityId: next.activityId, mobileTab: 'activity' },
      'next-activity',
    );
  }, [activities, state.activityId, transition]);

  const setDesktopView = useCallback((desktopView: BookRuntimeDesktopView) => {
    setState((current) => ({
      ...current,
      desktopView,
      ...(desktopView === 'pdf-focus' ? { mobileTab: 'page' as const } : {}),
    }));
  }, []);

  const setMobileTab = useCallback((mobileTab: BookRuntimeMobileTab) => {
    setState((current) => ({ ...current, mobileTab }));
  }, []);

  const setNavigatorCollapsed = useCallback((navigatorCollapsed: boolean) => {
    setState((current) => ({ ...current, navigatorCollapsed }));
  }, []);

  const restoreSplitView = useCallback(() => {
    setDesktopView('split');
  }, [setDesktopView]);

  return {
    state,
    isTransitioning,
    pageGroups,
    selectPageGroup,
    selectActivity,
    previousActivity,
    nextActivity,
    setDesktopView,
    setMobileTab,
    setNavigatorCollapsed,
    restoreSplitView,
  };
};
