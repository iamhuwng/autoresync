/**
 * computeRiskLevel — PRD-0036 Task 7.6
 * Utility to compute risk level from violation count and force-submit status.
 */

export function computeRiskLevel(
  violationCount: number,
  forceSubmitted: boolean = false
): 'low' | 'medium' | 'high' {
  if (forceSubmitted || violationCount >= 3) return 'high';
  if (violationCount >= 1) return 'medium';
  return 'low';
}
