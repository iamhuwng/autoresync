import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockTrackPageView,
  mockTrackAction,
  mockResolveFeatureFromRoute,
  mockValidateFeatureId,
  mockAddNavigationBreadcrumb,
} = vi.hoisted(() => ({
  mockTrackPageView: vi.fn(),
  mockTrackAction: vi.fn(),
  mockResolveFeatureFromRoute: vi.fn(),
  mockValidateFeatureId: vi.fn(),
  mockAddNavigationBreadcrumb: vi.fn(),
}));

vi.mock('../services/reportingService', () => ({
  reportingService: {
    trackPageView: mockTrackPageView,
    trackAction: mockTrackAction,
  },
}));

vi.mock('../config/featureRegistry', () => ({
  resolveFeatureFromRoute: mockResolveFeatureFromRoute,
  validateFeatureId: mockValidateFeatureId,
}));

vi.mock('./useBreadcrumbs', () => ({
  addNavigationBreadcrumb: mockAddNavigationBreadcrumb,
}));

import { useFeatureTracking } from './useFeatureTracking';

describe('useFeatureTracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/student-test/ABC123');
    mockResolveFeatureFromRoute.mockReturnValue('testTaking');
    mockValidateFeatureId.mockReturnValue(true);
  });

  it('tracks a page view immediately when a feature name is provided', () => {
    renderHook(() => useFeatureTracking('testTaking'));

    expect(mockValidateFeatureId).toHaveBeenCalledWith('testTaking');
    expect(mockTrackPageView).toHaveBeenCalledWith(
      'testTaking',
      '/student-test/ABC123'
    );
    expect(mockAddNavigationBreadcrumb).toHaveBeenCalledWith('/student-test/ABC123');
    expect(mockResolveFeatureFromRoute).not.toHaveBeenCalled();
  });

  it('auto-resolves the feature from the current route when none is provided', () => {
    window.history.replaceState({}, '', '/teacher/homework');
    mockResolveFeatureFromRoute.mockReturnValue('homework');

    renderHook(() => useFeatureTracking());

    expect(mockResolveFeatureFromRoute).toHaveBeenCalledWith('/teacher/homework');
    expect(mockTrackPageView).toHaveBeenCalledWith('homework', '/teacher/homework');
    expect(mockAddNavigationBreadcrumb).toHaveBeenCalledWith('/teacher/homework');
  });

  it('tracks user actions against the resolved feature', () => {
    const { result } = renderHook(() => useFeatureTracking());

    act(() => {
      result.current.trackAction('submitAnswer', { questionId: 'q-1' });
    });

    expect(mockTrackAction).toHaveBeenCalledWith('testTaking', 'submitAnswer', {
      questionId: 'q-1',
    });
  });
});
