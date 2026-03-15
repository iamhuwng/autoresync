/**
 * Unit tests for useAntiCopyPaste hook
 *
 * PRD-0036: Anti-Cheating & Test Integrity System — Task 11.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAntiCopyPaste } from './useAntiCopyPaste';
import type { IntegrityEvent } from '../../types/integrity.types';

// ── Helpers ──

function createContainer(): HTMLDivElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function createRefFrom(el: HTMLElement): React.RefObject<HTMLElement> {
  return { current: el } as React.RefObject<HTMLElement>;
}

function fireEvent(el: EventTarget, type: string, opts?: EventInit) {
  const event = new Event(type, { cancelable: true, bubbles: true, ...opts });
  el.dispatchEvent(event);
  return event;
}

function fireKeyEvent(
  el: EventTarget,
  key: string,
  opts?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean },
) {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: opts?.ctrlKey ?? false,
    metaKey: opts?.metaKey ?? false,
    shiftKey: opts?.shiftKey ?? false,
    cancelable: true,
    bubbles: true,
  });
  el.dispatchEvent(event);
  return event;
}

describe('useAntiCopyPaste', () => {
  let container: HTMLDivElement;
  let containerRef: React.RefObject<HTMLElement>;
  let onEvent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = createContainer();
    containerRef = createRefFrom(container);
    onEvent = vi.fn();
  });

  afterEach(() => {
    if (container.parentElement) {
      document.body.removeChild(container);
    }
  });

  // ── (a) Copy/cut/paste prevention ──

  it('prevents copy and fires event when enabled', () => {
    renderHook(() =>
      useAntiCopyPaste({
        enabled: true,
        containerRef,
        onEvent,
      }),
    );

    const event = fireEvent(container, 'copy');
    expect(event.defaultPrevented).toBe(true);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'copy_attempt', counted: true }),
    );
  });

  it('prevents cut and fires event when enabled', () => {
    renderHook(() =>
      useAntiCopyPaste({
        enabled: true,
        containerRef,
        onEvent,
      }),
    );

    const event = fireEvent(container, 'cut');
    expect(event.defaultPrevented).toBe(true);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'copy_attempt', counted: true }),
    );
  });

  it('prevents paste and fires event when enabled', () => {
    renderHook(() =>
      useAntiCopyPaste({
        enabled: true,
        containerRef,
        onEvent,
      }),
    );

    const event = fireEvent(container, 'paste');
    expect(event.defaultPrevented).toBe(true);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'paste_attempt', counted: true }),
    );
  });

  it('does NOT prevent events when disabled', () => {
    renderHook(() =>
      useAntiCopyPaste({
        enabled: false,
        containerRef,
        onEvent,
      }),
    );

    const event = fireEvent(container, 'copy');
    expect(event.defaultPrevented).toBe(false);
    expect(onEvent).not.toHaveBeenCalled();
  });

  // ── (b) Paste exception for Writing editor ──

  it('allows paste on elements with data-allow-paste when allowEditorPaste is true', () => {
    const editor = document.createElement('textarea');
    editor.setAttribute('data-allow-paste', 'true');
    container.appendChild(editor);

    renderHook(() =>
      useAntiCopyPaste({
        enabled: true,
        containerRef,
        allowEditorPaste: true,
        onEvent,
      }),
    );

    // Fire paste on the editor element itself
    const event = new Event('paste', { cancelable: true, bubbles: true });
    editor.dispatchEvent(event);

    // Should NOT be prevented, and no event fired
    expect(event.defaultPrevented).toBe(false);
    expect(onEvent).not.toHaveBeenCalled();
  });

  // ── (c) Right-click prevention ──

  it('prevents context menu when detectRightClick is true', () => {
    renderHook(() =>
      useAntiCopyPaste({
        enabled: true,
        containerRef,
        onEvent,
        detectRightClick: true,
      }),
    );

    const event = fireEvent(container, 'contextmenu');
    expect(event.defaultPrevented).toBe(true);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'right_click', counted: true }),
    );
  });

  it('does NOT prevent context menu when detectRightClick is false', () => {
    renderHook(() =>
      useAntiCopyPaste({
        enabled: true,
        containerRef,
        onEvent,
        detectRightClick: false,
      }),
    );

    const event = fireEvent(container, 'contextmenu');
    expect(event.defaultPrevented).toBe(false);
    expect(onEvent).not.toHaveBeenCalled();
  });

  // ── (d) Keyboard shortcuts ──

  it('detects Ctrl+C keyboard shortcut when enabled', () => {
    renderHook(() =>
      useAntiCopyPaste({
        enabled: true,
        containerRef,
        onEvent,
        detectKeyboardShortcuts: true,
      }),
    );

    fireKeyEvent(container, 'c', { ctrlKey: true });
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'keyboard_shortcut',
        details: 'Ctrl+C',
        counted: true,
      }),
    );
  });

  it('detects F12 keyboard shortcut when enabled', () => {
    renderHook(() =>
      useAntiCopyPaste({
        enabled: true,
        containerRef,
        onEvent,
        detectKeyboardShortcuts: true,
      }),
    );

    fireKeyEvent(container, 'F12');
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'keyboard_shortcut',
        details: 'F12',
        counted: true,
      }),
    );
  });

  // ── (e) Anti-select CSS class ──

  it('adds anti-select class when enabled', () => {
    renderHook(() =>
      useAntiCopyPaste({
        enabled: true,
        containerRef,
        onEvent,
      }),
    );

    expect(container.classList.contains('anti-select')).toBe(true);
  });

  it('removes anti-select class when disabled', () => {
    container.classList.add('anti-select');

    renderHook(() =>
      useAntiCopyPaste({
        enabled: false,
        containerRef,
        onEvent,
      }),
    );

    expect(container.classList.contains('anti-select')).toBe(false);
  });

  // ── (f) Cleanup on unmount ──

  it('removes event listeners and CSS class on unmount', () => {
    const { unmount } = renderHook(() =>
      useAntiCopyPaste({
        enabled: true,
        containerRef,
        onEvent,
        detectRightClick: true,
        detectKeyboardShortcuts: true,
      }),
    );

    expect(container.classList.contains('anti-select')).toBe(true);

    unmount();

    // Class removed
    expect(container.classList.contains('anti-select')).toBe(false);

    // Listeners removed — new events should NOT trigger onEvent
    onEvent.mockClear();
    fireEvent(container, 'copy');
    fireEvent(container, 'contextmenu');
    fireKeyEvent(container, 'F12');
    expect(onEvent).not.toHaveBeenCalled();
  });
});
