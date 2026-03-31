import React from 'react';
import { TrackedRoute } from '../components/TrackedRoute.tsx';

export function withTrackedRoute(children: React.ReactNode, featureName?: string) {
  return <TrackedRoute featureName={featureName}>{children}</TrackedRoute>;
}
