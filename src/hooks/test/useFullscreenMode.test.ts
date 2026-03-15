/**
 * Unit tests for useFullscreenMode hook
 *
 * PRD-0036: Anti-Cheating & Test Integrity System — Task 11.3
 *
 * NOTE: jsdom does not support the Fullscreen API natively.
 * Each test must set up and tear down its own mock of
 * document.documentElement.requestFullscreen.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFullscreenMode } from './useFullscreenMode';

describe('useFullscreenMode', () => {
  let onFullscreenExit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onFullscreenExit = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Always clean up: delete mock requestFullscreen so it doesn't leak
    try {
      delete (document.documentElement as any).requestFullscreen;
    } catch {
      // May throw in strict mode — acceptable
    }
  });

  // Helper: install a mock requestFullscreen on documentElement
  function installFullscreenMock(impl: () => Promise<void>): ReturnType<typeof vi.fn> {
    const spy = vi.fn(impl);
    (document.documentElement as any).requestFullscreen = spy;
    return spy;
  }

  // ── (a) Disabled = no fullscreen request ──

  it('does NOT request fullscreen when disabled', async () => {
    const spy = installFullscreenMock(() => Promise.resolve());

    await act(async () => {
      renderHook(() =>
        useFullscreenMode({
          enabled: false,
          onFullscreenExit,
        }),
      );
    });

    expect(spy).not.toHaveBeenCalled();
  });

  // ── (b) Requests fullscreen when enabled ──

  it('requests fullscreen on mount when enabled', async () => {
    const spy = installFullscreenMock(() => Promise.resolve());

    await act(async () => {
      renderHook(() =>
        useFullscreenMode({
          enabled: true,
          onFullscreenExit,
        }),
      );
    });

    expect(spy).toHaveBeenCalledTimes(1);
  });

  // ── (c) Reports fullscreen_unavailable when fullscreen fails ──

  it('fires fullscreen_unavailable event when fullscreen request is rejected', async () => {
    installFullscreenMock(() => Promise.reject(new Error('Not allowed')));

    await act(async () => {
      renderHook(() =>
        useFullscreenMode({
          enabled: true,
          onFullscreenExit,
        }),
      );
    });

    await vi.waitFor(() => {
      expect(onFullscreenExit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'fullscreen_unavailable',
          counted: false,
          withinGrace: true,
        }),
      );
    });
  });

  // ── (d) Monitors fullscreen exit ──

  it('fires fullscreen_exit event when user exits fullscreen', async () => {
    installFullscreenMock(() => Promise.resolve());

    await act(async () => {
      renderHook(() =>
        useFullscreenMode({
          enabled: true,
          onFullscreenExit,
        }),
      );
    });

    // Simulate exiting fullscreen
    Object.defineProperty(document, 'fullscreenElement', {
      value: null,
      configurable: true,
    });

    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'));
    });

    expect(onFullscreenExit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'fullscreen_exit',
        counted: true,
        withinGrace: false,
      }),
    );
  });

  // ── (e) Manual requestFullscreen ──

  it('exposes a manual requestFullscreen function', async () => {
    const spy = installFullscreenMock(() => Promise.resolve());

    let hookResult: any;
    await act(async () => {
      const { result } = renderHook(() =>
        useFullscreenMode({
          enabled: false,
          onFullscreenExit,
        }),
      );
      hookResult = result;
    });

    expect(typeof hookResult.current.requestFullscreen).toBe('function');

    await act(async () => {
      hookResult.current.requestFullscreen();
    });

    expect(spy).toHaveBeenCalledTimes(1);
  });

  // ── (f) isSupported returns false when API is missing ──

  it('sets isSupported=false when requestFullscreen is missing', async () => {
    // Do NOT install the mock → requestFullscreen is undefined in jsdom

    let hookResult: any;
    await act(async () => {
      const { result } = renderHook(() =>
        useFullscreenMode({
          enabled: true,
          onFullscreenExit,
        }),
      );
      hookResult = result;
    });

    expect(hookResult.current.isSupported).toBe(false);
    expect(onFullscreenExit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'fullscreen_unavailable' }),
    );
  });

  // ── (g) Cleanup on unmount ──

  it('removes fullscreenchange listener on unmount', async () => {
    installFullscreenMock(() => Promise.resolve());

    const removeSpy = vi.spyOn(document, 'removeEventListener');

    let unmountFn: () => void;
    await act(async () => {
      const { unmount } = renderHook(() =>
        useFullscreenMode({
          enabled: true,
          onFullscreenExit,
        }),
      );
      unmountFn = unmount;
    });

    unmountFn!();

    // Verify removeEventListener was called with 'fullscreenchange'
    expect(removeSpy).toHaveBeenCalledWith(
      'fullscreenchange',
      expect.any(Function),
    );

    removeSpy.mockRestore();
  });
});
