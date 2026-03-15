/**
 * useAntiCopyPaste Hook — Copy/Paste Prevention & Keyboard Shortcut Detection
 *
 * PRD-0036: Anti-Cheating & Test Integrity System (Task 3.1, 3.2, 3.3)
 *
 * Prevents and detects:
 *   - Copy, cut, paste events
 *   - Right-click context menu
 *   - Keyboard shortcuts (Ctrl+C/V/X, Ctrl+Shift+I, F12, Ctrl+U)
 *   - Applies `user-select: none` CSS to prevent text selection
 *
 * Exception: Elements with `data-allow-paste` attribute (e.g., IELTS Writing editor)
 * are exempted from paste prevention.
 *
 * @module hooks/test/useAntiCopyPaste
 */

import { useEffect } from 'react';
import type { IntegrityEvent } from '../../types/integrity.types';

// ============================================================================
// TYPES
// ============================================================================

export interface UseAntiCopyPasteOptions {
  /** Master enable flag — maps to config.detectCopyPaste */
  enabled: boolean;
  /** Container element ref to attach listeners to */
  containerRef: React.RefObject<HTMLElement>;
  /** Set to true for IELTS Writing editor — allows paste in [data-allow-paste] (FR-16) */
  allowEditorPaste?: boolean;
  /** Callback to inject events into useTestIntegrity's buffer */
  onEvent: (event: IntegrityEvent) => void;
  /** Whether to detect and prevent right-click (maps to config.detectRightClick) */
  detectRightClick?: boolean;
  /** Whether to detect keyboard shortcuts (maps to config.detectKeyboardShortcuts) */
  detectKeyboardShortcuts?: boolean;
}

// ============================================================================
// ANTI-SELECT CSS CLASS NAME
// ============================================================================

const ANTI_SELECT_CLASS = 'anti-select';

// ============================================================================
// HOOK
// ============================================================================

export function useAntiCopyPaste({
  enabled,
  containerRef,
  allowEditorPaste = false,
  onEvent,
  detectRightClick = false,
  detectKeyboardShortcuts = false,
}: UseAntiCopyPasteOptions): void {
  // ── Copy/Cut/Paste Prevention (Task 3.1) ──
  useEffect(() => {
    if (!enabled || !containerRef.current) return;

    const container = containerRef.current;

    const handleCopy = (e: Event) => {
      e.preventDefault();
      onEvent({
        type: 'copy_attempt',
        timestamp: Date.now(),
        withinGrace: false,
        counted: true,
      });
    };

    const handleCut = (e: Event) => {
      e.preventDefault();
      onEvent({
        type: 'copy_attempt', // FR-15: copy and cut grouped
        timestamp: Date.now(),
        withinGrace: false,
        counted: true,
      });
    };

    const handlePaste = (e: Event) => {
      // FR-16: Allow paste in elements with data-allow-paste attribute
      if (allowEditorPaste) {
        const target = e.target as HTMLElement;
        if (
          target?.closest('[data-allow-paste]') ||
          target?.hasAttribute('data-allow-paste')
        ) {
          // Allow paste — do NOT prevent default
          return;
        }
      }

      e.preventDefault();
      onEvent({
        type: 'paste_attempt',
        timestamp: Date.now(),
        withinGrace: false,
        counted: true,
      });
    };

    container.addEventListener('copy', handleCopy, { passive: false });
    container.addEventListener('cut', handleCut, { passive: false });
    container.addEventListener('paste', handlePaste, { passive: false });

    return () => {
      container.removeEventListener('copy', handleCopy);
      container.removeEventListener('cut', handleCut);
      container.removeEventListener('paste', handlePaste);
    };
  }, [enabled, containerRef, allowEditorPaste, onEvent]);

  // ── Right-Click Prevention (Task 3.1) ──
  useEffect(() => {
    if (!detectRightClick || !containerRef.current) return;

    const container = containerRef.current;

    const handleContextMenu = (e: Event) => {
      e.preventDefault();
      onEvent({
        type: 'right_click',
        timestamp: Date.now(),
        withinGrace: false,
        counted: true,
      });
    };

    container.addEventListener('contextmenu', handleContextMenu, {
      passive: false,
    });

    return () => {
      container.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [detectRightClick, containerRef, onEvent]);

  // ── Keyboard Shortcut Detection (Task 3.2) ──
  useEffect(() => {
    if (!detectKeyboardShortcuts || !containerRef.current) return;

    const container = containerRef.current;

    const handleKeydown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      let captured = false;
      let details = '';

      if (ctrl && e.key === 'c') {
        captured = true;
        details = 'Ctrl+C';
      } else if (ctrl && e.key === 'v') {
        captured = true;
        details = 'Ctrl+V';
      } else if (ctrl && e.key === 'x') {
        captured = true;
        details = 'Ctrl+X';
      } else if (ctrl && e.shiftKey && e.key === 'I') {
        captured = true;
        details = 'Ctrl+Shift+I';
      } else if (e.key === 'F12') {
        captured = true;
        details = 'F12';
      } else if (ctrl && e.key === 'u') {
        captured = true;
        details = 'Ctrl+U';
      }

      if (captured) {
        e.preventDefault();
        onEvent({
          type: 'keyboard_shortcut',
          timestamp: Date.now(),
          withinGrace: false,
          counted: true,
          details,
        });
      }
    };

    container.addEventListener('keydown', handleKeydown as EventListener, {
      passive: false,
    });

    return () => {
      container.removeEventListener(
        'keydown',
        handleKeydown as EventListener,
      );
    };
  }, [detectKeyboardShortcuts, containerRef, onEvent]);

  // ── Anti-Select CSS (Task 3.3) ──
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    if (enabled) {
      container.classList.add(ANTI_SELECT_CLASS);
    } else {
      container.classList.remove(ANTI_SELECT_CLASS);
    }

    return () => {
      container.classList.remove(ANTI_SELECT_CLASS);
    };
  }, [enabled, containerRef]);
}
