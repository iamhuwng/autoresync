import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useIntegrityRefreshRequest } from './useIntegrityRefreshRequest';

describe('useIntegrityRefreshRequest', () => {
  it('ignores the initial request timestamp on mount', () => {
    const onRefreshRequested = vi.fn(async () => {});

    renderHook(({ requestTimestamp }) => useIntegrityRefreshRequest({
      enabled: true,
      requestTimestamp,
      onRefreshRequested,
    }), {
      initialProps: {
        requestTimestamp: 1_000,
      },
    });

    expect(onRefreshRequested).not.toHaveBeenCalled();
  });

  it('flushes when a newer request timestamp arrives', async () => {
    const onRefreshRequested = vi.fn(async () => {});

    const { rerender } = renderHook(({ requestTimestamp }) => useIntegrityRefreshRequest({
      enabled: true,
      requestTimestamp,
      onRefreshRequested,
    }), {
      initialProps: {
        requestTimestamp: 1_000,
      },
    });

    rerender({
      requestTimestamp: 2_000,
    });

    await waitFor(() => {
      expect(onRefreshRequested).toHaveBeenCalledTimes(1);
    });
  });

  it('does not flush while disabled', async () => {
    const onRefreshRequested = vi.fn(async () => {});

    const { rerender } = renderHook(
      ({ enabled, requestTimestamp }) => useIntegrityRefreshRequest({
        enabled,
        requestTimestamp,
        onRefreshRequested,
      }),
      {
        initialProps: {
          enabled: false,
          requestTimestamp: 1_000,
        },
      },
    );

    rerender({
      enabled: false,
      requestTimestamp: 2_000,
    });

    await waitFor(() => {
      expect(onRefreshRequested).not.toHaveBeenCalled();
    });
  });
});
