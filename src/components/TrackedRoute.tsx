/**
 * TrackedRoute — Wrapper component for automatic page view tracking
 * PRD-0037: Production Reporting & Observability System (FR-13)
 *
 * Usage in App.jsx:
 *   <TrackedRoute>
 *     <SomePage />
 *   </TrackedRoute>
 *
 * If featureName is not passed, auto-resolves from the current URL
 * using resolveFeatureFromRoute from featureRegistry.
 */

import React from 'react';
import { useFeatureTracking } from '../hooks/useFeatureTracking';

interface TrackedRouteProps {
  children: React.ReactNode;
  featureName?: string;
}

export function TrackedRoute({ children, featureName }: TrackedRouteProps) {
  useFeatureTracking(featureName);
  return <>{children}</>;
}
