// @ts-nocheck
import { useEffect, useRef } from 'react';

interface IdleTaskOptions {
  enabled?: boolean;
  delayMs?: number;
  timeoutMs?: number;
}

type IdleTaskCleanup = void | (() => void);

declare global {
  interface Window {
    requestIdleCallback?: (
      callback: (deadline: IdleDeadline) => void,
      options?: { timeout: number }
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  }
}

/**
 * Platform idle hook.
 *
 * Web uses requestIdleCallback when available and falls back to a timer.
 * This keeps feature code away from raw window timing APIs.
 */
export function useDeferredIdleTask(
  task: () => IdleTaskCleanup,
  options: IdleTaskOptions = {}
): void {
  const {
    enabled = true,
    delayMs = 0,
    timeoutMs = 1500,
  } = options;
  const taskRef = useRef(task);

  taskRef.current = task;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cleanup: IdleTaskCleanup;
    let delayHandle: ReturnType<typeof setTimeout> | null = null;
    let fallbackHandle: ReturnType<typeof setTimeout> | null = null;
    let idleHandle: number | null = null;

    const runTask = () => {
      cleanup = taskRef.current();
    };

    const scheduleIdleWork = () => {
      if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        idleHandle = window.requestIdleCallback(() => {
          runTask();
        }, { timeout: timeoutMs });
        return;
      }

      fallbackHandle = setTimeout(() => {
        runTask();
      }, timeoutMs);
    };

    if (delayMs > 0) {
      delayHandle = setTimeout(() => {
        scheduleIdleWork();
      }, delayMs);
    } else {
      scheduleIdleWork();
    }

    return () => {
      if (delayHandle) {
        clearTimeout(delayHandle);
      }

      if (fallbackHandle) {
        clearTimeout(fallbackHandle);
      }

      if (
        idleHandle !== null
        && typeof window !== 'undefined'
        && typeof window.cancelIdleCallback === 'function'
      ) {
        window.cancelIdleCallback(idleHandle);
      }

      if (typeof cleanup === 'function') {
        cleanup();
      }
    };
  }, [delayMs, enabled, timeoutMs]);
}
