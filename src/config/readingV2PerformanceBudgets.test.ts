import { describe, expect, it } from 'vitest';
import {
  READING_V2_PERFORMANCE_BUDGETS,
  REQUIRED_READING_V2_PERFORMANCE_SURFACES,
  assertReadingV2PerformanceBudgetsComplete,
} from './readingV2PerformanceBudgets';

describe('readingV2PerformanceBudgets', () => {
  it('defines a measurable budget for every PRD-0048 rollout surface', () => {
    expect(() => assertReadingV2PerformanceBudgetsComplete()).not.toThrow();
    expect(new Set(READING_V2_PERFORMANCE_BUDGETS.map((budget) => budget.surface))).toEqual(
      new Set(REQUIRED_READING_V2_PERFORMANCE_SURFACES),
    );
  });

  it('keeps every budget numeric, bounded, and owned by an existing surface family', () => {
    READING_V2_PERFORMANCE_BUDGETS.forEach((budget) => {
      expect(budget.maximum).toBeGreaterThan(0);
      expect(['ms', 'count', 'kb']).toContain(budget.unit);
      expect([
        'studio',
        'runtime',
        'publish-pipeline',
        'launch-surface',
        'result-shell',
        'shared-list',
      ]).toContain(budget.owner);
    });
  });

  it('includes explicit content-size ceilings before public rollout', () => {
    const contentSizeBudgets = READING_V2_PERFORMANCE_BUDGETS.filter(
      (budget) => budget.surface === 'content-size',
    );

    expect(contentSizeBudgets.map((budget) => budget.metric)).toEqual(
      expect.arrayContaining(['max_runtime_interactions', 'max_projection_payload_size']),
    );
  });
});
