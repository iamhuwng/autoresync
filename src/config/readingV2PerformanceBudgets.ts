export type ReadingV2PerformanceBudgetSurface =
  | 'studio-load'
  | 'runtime-load'
  | 'dense-task-render'
  | 'projection-generation'
  | 'launch-payload-fetch'
  | 'result-adapter-render'
  | 'shared-list-search'
  | 'content-size';

export interface ReadingV2PerformanceBudget {
  readonly surface: ReadingV2PerformanceBudgetSurface;
  readonly metric: string;
  readonly maximum: number;
  readonly unit: 'ms' | 'count' | 'kb';
  readonly owner: 'studio' | 'runtime' | 'publish-pipeline' | 'launch-surface' | 'result-shell' | 'shared-list';
}

export const READING_V2_PERFORMANCE_BUDGETS: readonly ReadingV2PerformanceBudget[] = [
  {
    surface: 'studio-load',
    metric: 'route_ready_time',
    maximum: 2500,
    unit: 'ms',
    owner: 'studio',
  },
  {
    surface: 'runtime-load',
    metric: 'runtime_ready_time',
    maximum: 1800,
    unit: 'ms',
    owner: 'runtime',
  },
  {
    surface: 'dense-task-render',
    metric: 'largest_task_group_render_time',
    maximum: 450,
    unit: 'ms',
    owner: 'runtime',
  },
  {
    surface: 'projection-generation',
    metric: 'all_projection_generation_time',
    maximum: 1000,
    unit: 'ms',
    owner: 'publish-pipeline',
  },
  {
    surface: 'launch-payload-fetch',
    metric: 'metadata_and_projection_fetch_time',
    maximum: 1200,
    unit: 'ms',
    owner: 'launch-surface',
  },
  {
    surface: 'result-adapter-render',
    metric: 'grouped_review_render_time',
    maximum: 500,
    unit: 'ms',
    owner: 'result-shell',
  },
  {
    surface: 'shared-list-search',
    metric: 'library_lobby_search_filter_time',
    maximum: 350,
    unit: 'ms',
    owner: 'shared-list',
  },
  {
    surface: 'content-size',
    metric: 'max_runtime_interactions',
    maximum: 60,
    unit: 'count',
    owner: 'runtime',
  },
  {
    surface: 'content-size',
    metric: 'max_projection_payload_size',
    maximum: 512,
    unit: 'kb',
    owner: 'publish-pipeline',
  },
] as const;

export const REQUIRED_READING_V2_PERFORMANCE_SURFACES: readonly ReadingV2PerformanceBudgetSurface[] = [
  'studio-load',
  'runtime-load',
  'dense-task-render',
  'projection-generation',
  'launch-payload-fetch',
  'result-adapter-render',
  'shared-list-search',
  'content-size',
] as const;

export const assertReadingV2PerformanceBudgetsComplete = (): void => {
  const covered = new Set(READING_V2_PERFORMANCE_BUDGETS.map((budget) => budget.surface));
  const missing = REQUIRED_READING_V2_PERFORMANCE_SURFACES.filter((surface) => !covered.has(surface));

  if (missing.length > 0) {
    throw new Error(`Missing Reading V2 performance budgets: ${missing.join(', ')}`);
  }
};
