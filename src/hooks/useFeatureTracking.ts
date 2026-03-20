/**
 * useFeatureTracking — React hook for tracking page views and user actions
 * PRD-0037: Production Reporting & Observability System (FR-12)
 *
 * Usage:
 *   const { trackAction } = useFeatureTracking('testTaking');
 *   trackAction('submitAnswer', { questionId: '123' });
 *
 * If featureName is not provided, auto-resolves from current route.
 */

import { useEffect, useRef, useCallback } from 'react';
import { resolveFeatureFromRoute, validateFeatureId } from '../config/featureRegistry';
import { reportingService } from '../services/reportingService';
import { addNavigationBreadcrumb } from './useBreadcrumbs';

export function useFeatureTracking(featureName?: string) {
  const resolvedFeatureRef = useRef<string>('unregistered');

  useEffect(() => {
    let feature = featureName;

    if (feature) {
      validateFeatureId(feature);
    } else {
      feature = resolveFeatureFromRoute(window.location.pathname) || 'unregistered';
    }

    resolvedFeatureRef.current = feature;

    // Track page view
    reportingService.trackPageView(feature, window.location.pathname);

    // Also add navigation breadcrumb
    addNavigationBreadcrumb(window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trackAction = useCallback(
    (actionName: string, metadata?: Record<string, unknown>) => {
      reportingService.trackAction(
        resolvedFeatureRef.current,
        actionName,
        metadata
      );
    },
    []
  );

  return { trackAction };
}
