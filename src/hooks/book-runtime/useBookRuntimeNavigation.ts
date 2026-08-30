import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type BookRuntimeDesktopView = 'split' | 'pdf-focus';
export type BookRuntimeMobileTab = 'page' | 'activity';

export interface BookRuntimeNavigationActivity {
  readonly activityId: string;
  readonly pageGroupKey: string;
  readonly componentId?: string;
  readonly componentIds?: readonly string[];
  readonly componentPageById?: Readonly<Record<string, number>>;
}

export interface BookRuntimeNavigationPageScope {
  readonly kind: 'all' | 'pages';
  readonly pages: readonly number[];
}

export interface BookRuntimeNavigationComponent {
  readonly componentId: string;
  readonly sourceOrder: number;
  readonly activityIds: readonly string[];
  readonly localPageScope?: BookRuntimeNavigationPageScope;
}

export interface BookRuntimeNavigationState {
  readonly pageGroupKey: string;
  readonly activityId: string;
  readonly componentId: string;
  readonly componentPageById: Readonly<Record<string, number>>;
  readonly desktopView: BookRuntimeDesktopView;
  readonly mobileTab: BookRuntimeMobileTab;
  readonly navigatorCollapsed: boolean;
}

export type BookRuntimeNavigationReason =
  | 'page-group-selected'
  | 'activity-selected'
  | 'previous-activity'
  | 'next-activity'
  | 'component-selected'
  | 'component-page-selected';

export interface UseBookRuntimeNavigationOptions {
  readonly activities: readonly BookRuntimeNavigationActivity[];
  readonly components?: readonly BookRuntimeNavigationComponent[];
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

const DEFAULT_COMPONENT: BookRuntimeNavigationComponent = Object.freeze({
  componentId: 'full-pdf',
  sourceOrder: 1,
  activityIds: Object.freeze([]),
});
const EMPTY_COMPONENTS: readonly BookRuntimeNavigationComponent[] = Object.freeze([]);

const componentIdsForActivity = (activity: BookRuntimeNavigationActivity): readonly string[] => {
  if (activity.componentIds && activity.componentIds.length > 0) return activity.componentIds;
  if (activity.componentId) return [activity.componentId];
  return [DEFAULT_COMPONENT.componentId];
};

const componentForActivity = (
  activity: BookRuntimeNavigationActivity,
  components: readonly BookRuntimeNavigationComponent[],
  preferred?: string,
): string => {
  const available = components.length > 0 ? components : [DEFAULT_COMPONENT];
  const activityComponents = componentIdsForActivity(activity);
  if (preferred && activityComponents.includes(preferred) && available.some((component) => component.componentId === preferred)) {
    return preferred;
  }
  return activityComponents.find((componentId) => available.some((component) => component.componentId === componentId))
    ?? available[0]!.componentId;
};

const pageByComponent = (
  requested: Readonly<Record<string, number>> | undefined,
  components: readonly BookRuntimeNavigationComponent[],
): Readonly<Record<string, number>> => {
  const available = components.length > 0 ? components : [DEFAULT_COMPONENT];
  const result: Record<string, number> = {};
  available.forEach((component) => {
    const page = requested?.[component.componentId];
    const allowed = component.localPageScope?.kind !== 'pages'
      || component.localPageScope.pages.includes(page ?? 0);
    const firstScopedPage = component.localPageScope?.kind === 'pages'
      ? component.localPageScope.pages.find((candidate) => Number.isSafeInteger(candidate) && candidate > 0)
      : undefined;
    result[component.componentId] = Number.isSafeInteger(page) && page > 0 && allowed
      ? page
      : firstScopedPage ?? 1;
  });
  return Object.freeze(result);
};

const componentPageAllowed = (
  component: BookRuntimeNavigationComponent | undefined,
  page: number,
): boolean => Number.isSafeInteger(page)
  && page > 0
  && (component?.localPageScope?.kind !== 'pages' || component.localPageScope.pages.includes(page));

const normalizeState = (
  activities: readonly BookRuntimeNavigationActivity[],
  requested: Partial<BookRuntimeNavigationState> | BookRuntimeNavigationState | undefined,
  components: readonly BookRuntimeNavigationComponent[],
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
  const requestedComponent = requested?.componentId
    ? components.find((component) => component.componentId === requested.componentId)
    : undefined;
  const componentActivity = requestedComponent
    ? activities.find((activity) => componentIdsForActivity(activity).includes(requestedComponent.componentId))
    : undefined;
  const active = requestedActivity ?? requestedGroup ?? componentActivity ?? fallback;
  const componentId = componentForActivity(active, components, requestedComponent?.componentId);
  return {
    pageGroupKey: active.pageGroupKey,
    activityId: active.activityId,
    componentId,
    componentPageById: pageByComponent({
      ...active.componentPageById,
      ...requested?.componentPageById,
    }, components),
    desktopView: requested?.desktopView === 'pdf-focus' ? 'pdf-focus' : 'split',
    mobileTab: requested?.mobileTab === 'activity' ? 'activity' : 'page',
    navigatorCollapsed: requested?.navigatorCollapsed === true,
  };
};

export interface BookRuntimeNavigationController {
  readonly state: BookRuntimeNavigationState;
  readonly isTransitioning: boolean;
  readonly pageGroups: readonly string[];
  readonly components: readonly BookRuntimeNavigationComponent[];
  readonly selectPageGroup: (pageGroupKey: string) => void;
  readonly selectActivity: (activityId: string) => void;
  readonly selectComponent: (componentId: string) => void;
  readonly setComponentPage: (componentId: string, page: number) => void;
  readonly previousActivity: () => void;
  readonly nextActivity: () => void;
  readonly setDesktopView: (view: BookRuntimeDesktopView) => void;
  readonly setMobileTab: (tab: BookRuntimeMobileTab) => void;
  readonly setNavigatorCollapsed: (collapsed: boolean) => void;
  readonly restoreSplitView: () => void;
}

export const useBookRuntimeNavigation = ({
  activities,
  components = EMPTY_COMPONENTS,
  initialState,
  onFlushBeforeNavigate,
  onNavigate,
  onNavigationError,
}: UseBookRuntimeNavigationOptions): BookRuntimeNavigationController => {
  const initial = useMemo(
    () => normalizeState(activities, initialState, components),
    [activities, components, initialState],
  );
  const [state, setState] = useState<BookRuntimeNavigationState>(initial);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const initialStateKey = [
    initialState?.pageGroupKey ?? '',
    initialState?.activityId ?? '',
    initialState?.desktopView ?? '',
    initialState?.mobileTab ?? '',
    initialState?.navigatorCollapsed ? 'true' : 'false',
    initialState?.componentId ?? '',
    JSON.stringify(Object.entries(initialState?.componentPageById ?? {}).sort()),
  ].join('\u0000');
  const previousInitialStateKey = useRef(initialStateKey);

  useEffect(() => {
    setState((current) => normalizeState(activities, current, components));
  }, [activities, components]);

  useEffect(() => {
    if (previousInitialStateKey.current === initialStateKey) return;
    previousInitialStateKey.current = initialStateKey;
    setState(normalizeState(activities, initialState, components));
  }, [activities, components, initialState, initialStateKey]);

  const pageGroups = useMemo(
    () => Array.from(new Set(activities.map((activity) => activity.pageGroupKey))),
    [activities],
  );

  const transition = useCallback(async (
    next: Partial<BookRuntimeNavigationState>,
    reason: BookRuntimeNavigationReason,
  ): Promise<void> => {
    if (isTransitioning) return;
    const nextState = normalizeState(activities, { ...state, ...next }, components);
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
  }, [activities, components, isTransitioning, onFlushBeforeNavigate, onNavigate, onNavigationError, state]);

  const selectPageGroup = useCallback((pageGroupKey: string) => {
    const nextActivity = activities.find((activity) => activity.pageGroupKey === pageGroupKey);
    if (!nextActivity) return;
    void transition(
      {
        pageGroupKey,
        activityId: nextActivity.activityId,
        componentId: componentForActivity(nextActivity, components),
        componentPageById: { ...state.componentPageById, ...nextActivity.componentPageById },
        mobileTab: 'page',
      },
      'page-group-selected',
    );
  }, [activities, components, state.componentPageById, transition]);

  const selectActivity = useCallback((activityId: string) => {
    const nextActivity = activities.find((activity) => activity.activityId === activityId);
    if (!nextActivity) return;
    void transition(
      {
        pageGroupKey: nextActivity.pageGroupKey,
        activityId,
        componentId: componentForActivity(nextActivity, components),
        componentPageById: { ...state.componentPageById, ...nextActivity.componentPageById },
        mobileTab: 'activity',
      },
      'activity-selected',
    );
  }, [activities, components, state.componentPageById, transition]);

  const selectComponent = useCallback((componentId: string) => {
    const component = components.find((candidate) => candidate.componentId === componentId);
    if (!component) return;
    const nextActivity = activities.find((activity) => (
      componentIdsForActivity(activity).includes(componentId)
    ));
    if (!nextActivity) return;
    void transition(
      {
        componentId,
        pageGroupKey: nextActivity.pageGroupKey,
        activityId: nextActivity.activityId,
        componentPageById: { ...state.componentPageById, ...nextActivity.componentPageById },
        mobileTab: 'page',
      },
      'component-selected',
    );
  }, [activities, components, state.componentPageById, transition]);

  const setComponentPage = useCallback((componentId: string, page: number) => {
    const component = components.find((candidate) => candidate.componentId === componentId);
    if (!component || !componentPageAllowed(component, page)) return;
    setState((current) => ({
      ...current,
      componentPageById: Object.freeze({
        ...current.componentPageById,
        [componentId]: page,
      }),
    }));
  }, [components]);

  const previousActivity = useCallback(() => {
    const index = activities.findIndex((activity) => activity.activityId === state.activityId);
    const previous = index > 0 ? activities[index - 1] : undefined;
    if (!previous) return;
    void transition(
      {
        pageGroupKey: previous.pageGroupKey,
        activityId: previous.activityId,
        componentId: componentForActivity(previous, components),
        componentPageById: { ...state.componentPageById, ...previous.componentPageById },
        mobileTab: 'activity',
      },
      'previous-activity',
    );
  }, [activities, components, state.activityId, state.componentPageById, transition]);

  const nextActivity = useCallback(() => {
    const index = activities.findIndex((activity) => activity.activityId === state.activityId);
    const next = index >= 0 ? activities[index + 1] : undefined;
    if (!next) return;
    void transition(
      {
        pageGroupKey: next.pageGroupKey,
        activityId: next.activityId,
        componentId: componentForActivity(next, components),
        componentPageById: { ...state.componentPageById, ...next.componentPageById },
        mobileTab: 'activity',
      },
      'next-activity',
    );
  }, [activities, components, state.activityId, state.componentPageById, transition]);

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
    components,
    selectPageGroup,
    selectActivity,
    selectComponent,
    setComponentPage,
    previousActivity,
    nextActivity,
    setDesktopView,
    setMobileTab,
    setNavigatorCollapsed,
    restoreSplitView,
  };
};
