import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useBookIntegrityCapture } from './useBookIntegrityCapture';
import { createDefaultBookIntegrityPolicy } from '../../services/book-activity/bookIntegrityCapture.service';
import type {
  BookIntegrityCaptureClient,
  BookIntegrityCaptureTarget,
  BookIntegritySignalRequest,
} from '../../services/book-activity/bookIntegrityCapture.types';

const target: BookIntegrityCaptureTarget = {
  bookId: 'book-1',
  bindingId: 'binding-1',
  bindingRevision: 1,
  contextKind: 'homework',
  contextId: 'homework-1',
  placementId: 'placement-1',
  activityId: 'activity-1',
  activityVersion: 1,
};

const frozenPolicy = {
  ...createDefaultBookIntegrityPolicy('accountable', {
    policyId: 'policy-1',
    policyRevision: 1,
  }),
  requiredFocusMode: true,
  inactivityThresholdMs: 5_000,
};

const client = () => {
  const requests: BookIntegritySignalRequest[] = [];
  const recordSignal = vi.fn<BookIntegrityCaptureClient['recordSignal']>(
    async (request) => {
      requests.push(request);
      if (request.signal === 'concurrent_attempt') {
        return {
          status: 'ignored',
          signal: request.signal,
          reason: 'not_concurrent',
          recordedEventCount: requests.length - 1,
        };
      }
      return {
        status: 'recorded',
        eventId: `integrity-v1-${request.sequence.toString(16).padStart(40, '0')}`,
        signal: request.signal,
        recordedAt: '2026-08-02T00:00:00.000Z',
        recordedEventCount: requests.filter((entry) => entry.signal !== 'concurrent_attempt').length,
      };
    },
  );
  return { adapter: { recordSignal } satisfies BookIntegrityCaptureClient, recordSignal, requests };
};

const memoryStorage = () => {
  const values = new Map<string, unknown>();
  return {
    values,
    adapter: {
      async get<T>(key: string): Promise<T | null> {
        return (values.get(key) as T | undefined) ?? null;
      },
      async set(key: string, value: unknown): Promise<void> {
        values.set(key, structuredClone(value));
      },
      async remove(key: string): Promise<void> {
        values.delete(key);
      },
    },
  };
};

const strictWrapper = ({ children }: { readonly children: ReactNode }) => (
  <StrictMode>{children}</StrictMode>
);

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('useBookIntegrityCapture', () => {
  it('captures lifecycle and interaction signals, blocks only protected copy, and warns immediately', async () => {
    vi.useFakeTimers();
    let now = 1_000;
    const fixture = client();
    const warnings = vi.fn();
    const storage = memoryStorage();
    const protectedArea = document.createElement('div');
    protectedArea.dataset.bookIntegrityCopyProtected = 'true';
    protectedArea.textContent = 'Protected Book Activity text';
    document.body.append(protectedArea);
    const { result } = renderHook(() => useBookIntegrityCapture({
      client: fixture.adapter,
      target,
      frozenPolicy,
      enabled: true,
      active: true,
      onWarning: warnings,
      storage: storage.adapter,
      now: () => now,
    }), { wrapper: strictWrapper });

    await act(async () => {
      window.dispatchEvent(new Event('blur'));
      document.dispatchEvent(new Event('paste', { cancelable: true }));
      const selection = document.getSelection()!;
      const range = document.createRange();
      range.selectNodeContents(protectedArea);
      selection.removeAllRanges();
      selection.addRange(range);
      const copy = new Event('copy', { bubbles: true, cancelable: true });
      document.dispatchEvent(copy);
      expect(copy.defaultPrevented).toBe(true);
      selection.removeAllRanges();
      const ordinaryCopy = new Event('copy', { bubbles: true, cancelable: true });
      document.dispatchEvent(ordinaryCopy);
      expect(ordinaryCopy.defaultPrevented).toBe(false);
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
      document.dispatchEvent(new Event('fullscreenchange'));
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      now += 5_000;
      vi.advanceTimersByTime(1_000);
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fixture.requests.map((entry) => entry.signal)).toEqual(expect.arrayContaining([
      'concurrent_attempt',
      'focus_loss',
      'paste',
      'protected_copy',
      'focus_mode_exit',
      'visibility_loss',
      'inactivity',
    ]));
    expect(warnings).toHaveBeenCalled();
    expect(warnings.mock.calls.at(-1)?.[0]).toMatchObject({
      message: 'An integrity signal was recorded. You can continue this Activity and submit normally.',
    });
    expect(result.current.recordedEventCount).toBeGreaterThan(0);
    expect(Object.keys(result.current).sort()).toEqual([
      'lastResult',
      'recordSignal',
      'recordedEventCount',
      'status',
    ]);
  });

  it('is silent for practice/policy-off and never installs a punitive completion action', async () => {
    const fixture = client();
    const practice = createDefaultBookIntegrityPolicy('practice', {
      policyId: 'policy-practice',
      policyRevision: 1,
    });
    const { result } = renderHook(() => useBookIntegrityCapture({
      client: fixture.adapter,
      target,
      frozenPolicy: practice,
      enabled: true,
      active: true,
    }));
    await act(async () => {
      window.dispatchEvent(new Event('blur'));
      document.dispatchEvent(new Event('paste'));
      await Promise.resolve();
    });
    expect(fixture.recordSignal).not.toHaveBeenCalled();
    expect(result.current.status).toBe('disabled');
    expect(JSON.stringify(result.current)).not.toMatch(/submit|lock|score|attempt/iu);
  });

  it('records route/reload recovery deterministically and stops ordinary capture after unmount', async () => {
    const fixture = client();
    const storage = memoryStorage();
    const first = renderHook(() => useBookIntegrityCapture({
      client: fixture.adapter,
      target,
      frozenPolicy,
      enabled: true,
      active: true,
      storage: storage.adapter,
    }));
    await waitFor(() => expect(fixture.recordSignal).toHaveBeenCalled());
    act(() => {
      window.dispatchEvent(new Event('beforeunload', { cancelable: true }));
    });
    await waitFor(() => expect(
      fixture.requests.filter((entry) => entry.signal === 'route_reload_close').length,
    ).toBeGreaterThan(0));
    const exitRequest = fixture.requests.find((entry) => entry.signal === 'route_reload_close')!;
    first.unmount();

    const second = renderHook(() => useBookIntegrityCapture({
      client: fixture.adapter,
      target,
      frozenPolicy,
      enabled: true,
      active: true,
      storage: storage.adapter,
    }));
    await waitFor(() => expect(
      fixture.requests.filter((entry) => (
        entry.signal === 'route_reload_close'
        && entry.clientSessionId === exitRequest.clientSessionId
        && entry.sequence === exitRequest.sequence
      )).length,
    ).toBeGreaterThanOrEqual(2));
    second.unmount();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const ordinaryCountAfterUnmount = fixture.requests.filter(
      (entry) => entry.signal === 'focus_loss' || entry.signal === 'paste',
    ).length;
    act(() => {
      window.dispatchEvent(new Event('blur'));
      document.dispatchEvent(new Event('paste'));
    });
    expect(fixture.requests.filter(
      (entry) => entry.signal === 'focus_loss' || entry.signal === 'paste',
    ).slice(ordinaryCountAfterUnmount).map((entry) => entry.signal)).toEqual([]);
  });

  it('does not record a route event when submission has made the attempt inactive', async () => {
    const fixture = client();
    const { rerender, unmount } = renderHook(
      ({ active }) => useBookIntegrityCapture({
        client: fixture.adapter,
        target,
        frozenPolicy,
        enabled: true,
        active,
      }),
      { initialProps: { active: true } },
    );
    await waitFor(() => expect(fixture.recordSignal).toHaveBeenCalled());
    rerender({ active: false });
    const routeCount = fixture.requests.filter(
      (entry) => entry.signal === 'route_reload_close',
    ).length;
    unmount();
    expect(fixture.requests.filter(
      (entry) => entry.signal === 'route_reload_close',
    )).toHaveLength(routeCount);
  });
});
