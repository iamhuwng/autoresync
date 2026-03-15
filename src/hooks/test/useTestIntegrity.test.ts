/**
 * Unit tests for useTestIntegrity hook
 *
 * PRD-0036: Anti-Cheating & Test Integrity System — Task 2.13
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTestIntegrity } from './useTestIntegrity';
import type { AntiCheatConfig } from '../../types/integrity.types';
import { resolvePreset } from '../../utils/antiCheatPresets';

// ── Mock firebase/database ──
vi.mock('firebase/database', () => ({
  ref: vi.fn(() => ({})),
  update: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../services/firebase', () => ({
  database: {},
}));

// ── Mock sessionStorage ──
const mockSessionStorage: Record<string, string> = {};
const sessionStorageMock = {
  getItem: vi.fn((key: string) => mockSessionStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    mockSessionStorage[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete mockSessionStorage[key];
  }),
  clear: vi.fn(() => {
    Object.keys(mockSessionStorage).forEach(
      (key) => delete mockSessionStorage[key],
    );
  }),
  length: 0,
  key: vi.fn(() => null),
};

Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
  writable: true,
});

// ── Helpers ──
const standardConfig: AntiCheatConfig = resolvePreset('standard');

const defaultOptions = {
  config: standardConfig,
  context: 'session' as const,
  sessionCode: 'TEST123',
  studentId: 'student1',
  testId: 'test1',
};

describe('useTestIntegrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorageMock.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── (a) No-op when config is null ──
  it('returns no-op state when config is null', () => {
    const { result } = renderHook(() =>
      useTestIntegrity({
        ...defaultOptions,
        config: null,
      }),
    );

    expect(result.current.violationCount).toBe(0);
    expect(result.current.totalEvents).toBe(0);
    expect(result.current.warningLevel).toBe('none');
    expect(result.current.shouldAutoSubmit).toBe(false);
  });

  // ── (b) No-op when context is 'solo' ──
  it('returns no-op state when context is solo', () => {
    const { result } = renderHook(() =>
      useTestIntegrity({
        ...defaultOptions,
        context: 'solo',
      }),
    );

    expect(result.current.violationCount).toBe(0);
    expect(result.current.totalEvents).toBe(0);
    expect(result.current.warningLevel).toBe('none');
    expect(result.current.shouldAutoSubmit).toBe(false);
  });

  // ── (c) Grace period ignores first 2 switches ──
  it('grace period correctly ignores first 2 switches', () => {
    const { result } = renderHook(() =>
      useTestIntegrity(defaultOptions),
    );

    // Simulate 2 long tab switches (>5s each, but within first 2 free switches)
    act(() => {
      result.current.addEvent({
        type: 'tab_switch',
        timestamp: Date.now(),
        durationMs: 10000, // 10s - would be counted except it's within first 2
        withinGrace: true,
        counted: false,
      });
    });

    act(() => {
      result.current.addEvent({
        type: 'tab_switch',
        timestamp: Date.now(),
        durationMs: 10000,
        withinGrace: true,
        counted: false,
      });
    });

    expect(result.current.violationCount).toBe(0);
    expect(result.current.totalEvents).toBe(2);
  });

  // ── (d) Grace period correctly ignores switches <5s ──
  it('grace period correctly ignores switches under 5 seconds', () => {
    const { result } = renderHook(() =>
      useTestIntegrity(defaultOptions),
    );

    // Short-duration switch that would otherwise count (after first 2 free)
    act(() => {
      result.current.addEvent({
        type: 'tab_switch',
        timestamp: Date.now(),
        durationMs: 3000, // 3s - should be grace
        withinGrace: true,
        counted: false,
      });
    });

    expect(result.current.violationCount).toBe(0);
  });

  // ── (e) violationCount increments only for counted events ──
  it('violationCount increments only for counted events', () => {
    const { result } = renderHook(() =>
      useTestIntegrity(defaultOptions),
    );

    // Add a grace event (not counted)
    act(() => {
      result.current.addEvent({
        type: 'tab_switch',
        timestamp: Date.now(),
        durationMs: 2000,
        withinGrace: true,
        counted: false,
      });
    });

    expect(result.current.violationCount).toBe(0);

    // Add a counted event
    act(() => {
      result.current.addEvent({
        type: 'tab_switch',
        timestamp: Date.now(),
        durationMs: 10000,
        withinGrace: false,
        counted: true,
      });
    });

    expect(result.current.violationCount).toBe(1);
    expect(result.current.totalEvents).toBe(2);
  });

  // ── (f) Warning levels map correctly to thresholds ──
  it('warning levels escalate correctly with violations', () => {
    const configWithWarnings: AntiCheatConfig = {
      ...standardConfig,
      enableStudentWarnings: true,
      enableAutoSubmit: true,
      autoSubmitThreshold: 5,
    };

    const { result } = renderHook(() =>
      useTestIntegrity({
        ...defaultOptions,
        config: configWithWarnings,
      }),
    );

    // 0 violations → none
    expect(result.current.warningLevel).toBe('none');

    // 1 violation → toast (1 < threshold - 1 = 4)
    act(() => {
      result.current.addEvent({
        type: 'copy_attempt',
        timestamp: Date.now(),
        withinGrace: false,
        counted: true,
      });
    });
    expect(result.current.warningLevel).toBe('toast');

    // 2 violations → toast
    act(() => {
      result.current.addEvent({
        type: 'paste_attempt',
        timestamp: Date.now(),
        withinGrace: false,
        counted: true,
      });
    });
    expect(result.current.warningLevel).toBe('toast');

    // 3 violations → toast (3 < 4)
    act(() => {
      result.current.addEvent({
        type: 'right_click',
        timestamp: Date.now(),
        withinGrace: false,
        counted: true,
      });
    });
    expect(result.current.warningLevel).toBe('toast');

    // 4 violations → escalated (threshold - 1)
    act(() => {
      result.current.addEvent({
        type: 'keyboard_shortcut',
        timestamp: Date.now(),
        withinGrace: false,
        counted: true,
        details: 'Ctrl+C',
      });
    });
    expect(result.current.warningLevel).toBe('escalated');

    // 5 violations → final (>= threshold)
    act(() => {
      result.current.addEvent({
        type: 'tab_switch',
        timestamp: Date.now(),
        durationMs: 10000,
        withinGrace: false,
        counted: true,
      });
    });
    expect(result.current.warningLevel).toBe('final');
  });

  it('getIntegrityReport returns correct aggregate counts', () => {
    const { result } = renderHook(() =>
      useTestIntegrity(defaultOptions),
    );

    act(() => {
      result.current.addEvent({
        type: 'copy_attempt',
        timestamp: Date.now(),
        withinGrace: false,
        counted: true,
      });
      result.current.addEvent({
        type: 'tab_switch',
        timestamp: Date.now(),
        durationMs: 6000,
        withinGrace: false,
        counted: true,
      });
    });

    const report = result.current.getIntegrityReport();
    expect(report.violationCount).toBe(2);
    expect(report.totalEvents).toBe(2);
    expect(report.copyAttempts).toBe(1);
    expect(report.tabSwitchCount).toBe(1);
    expect(report.totalTimeAwayMs).toBe(6000);
    expect(report.riskLevel).toBe('medium');
  });

  it('trackQuestionTime logs time_per_question events', () => {
    const { result } = renderHook(() =>
      useTestIntegrity(defaultOptions),
    );

    // Start tracking Q0
    act(() => {
      result.current.trackQuestionTime(0);
    });

    // No event yet (first question has no previous)
    expect(result.current.totalEvents).toBe(0);

    // Move to Q1 — should log time for Q0
    vi.advanceTimersByTime(5000);
    act(() => {
      result.current.trackQuestionTime(1);
    });

    expect(result.current.totalEvents).toBe(1);
    const report = result.current.getIntegrityReport();
    const timeEvent = report.events.find(
      (e) => e.type === 'time_per_question',
    );
    expect(timeEvent).toBeDefined();
    expect(timeEvent?.details).toBe('Q0');
    expect(timeEvent?.counted).toBe(false);
    expect(timeEvent?.withinGrace).toBe(true);
  });
});
