import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTestIntegrity } from './useTestIntegrity';
import type { AntiCheatConfig } from '../../types/integrity.types';
import { resolvePreset } from '../../utils/antiCheatPresets';

const {
  mockTrackAntiCheatAction,
  mockDbUpdate,
  mockDbRef,
} = vi.hoisted(() => ({
  mockTrackAntiCheatAction: vi.fn(),
  mockDbUpdate: vi.fn(() => Promise.resolve()),
  mockDbRef: vi.fn(() => ({})),
}));

vi.mock('firebase/database', () => ({
  ref: mockDbRef,
  update: mockDbUpdate,
  getDatabase: vi.fn(() => ({})),
  onValue: vi.fn(),
}));

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({ name: 'test-app' })),
}));

vi.mock('firebase/analytics', () => ({
  getAnalytics: vi.fn(() => null),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  GoogleAuthProvider: vi.fn(() => ({
    setCustomParameters: vi.fn(),
  })),
}));

vi.mock('firebase/firestore', () => ({
  initializeFirestore: vi.fn(() => ({})),
  persistentLocalCache: vi.fn(() => ({})),
  persistentMultipleTabManager: vi.fn(() => ({})),
}));

vi.mock('../../services/firebase', () => ({
  database: {},
}));

vi.mock('../../services/firebase.js', () => ({
  database: {},
}));

vi.mock('../../services/antiCheatReporting', () => ({
  summarizeAntiCheatConfig: (config: AntiCheatConfig | null | undefined) => ({
    antiCheatEnabled: Boolean(config),
    preset: config?.preset ?? 'none',
  }),
  summarizeError: (error: unknown) => ({
    errorMessage: error instanceof Error ? error.message : String(error),
  }),
  summarizeIntegrityEvent: (event: any) => ({
    eventType: event.type,
    counted: event.counted,
    withinGrace: event.withinGrace,
  }),
  summarizeIntegritySnapshot: (report: any) => ({
    violationCount: report?.violationCount ?? 0,
    totalEvents: report?.totalEvents ?? 0,
    riskLevel: report?.riskLevel ?? 'low',
    forceSubmitted: report?.forceSubmitted ?? false,
  }),
  trackAntiCheatAction: mockTrackAntiCheatAction,
}));

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
    Object.keys(mockSessionStorage).forEach((key) => delete mockSessionStorage[key]);
  }),
  length: 0,
  key: vi.fn(() => null),
};

Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
  writable: true,
});

let mockVisibilityState: DocumentVisibilityState = 'visible';
Object.defineProperty(document, 'visibilityState', {
  configurable: true,
  get: () => mockVisibilityState,
});

const standardConfig: AntiCheatConfig = resolvePreset('standard');

const defaultOptions = {
  config: standardConfig,
  context: 'session' as const,
  surface: 'student_test',
  sessionCode: 'TEST123',
  studentId: 'student1',
  testId: 'test1',
};

const dispatchVisibilityChange = (state: DocumentVisibilityState) => {
  mockVisibilityState = state;
  document.dispatchEvent(new Event('visibilitychange'));
};

const dispatchWindowBlur = () => {
  window.dispatchEvent(new Event('blur'));
};

const dispatchWindowFocus = () => {
  window.dispatchEvent(new Event('focus'));
};

describe('useTestIntegrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorageMock.clear();
    vi.useFakeTimers();
    mockVisibilityState = 'visible';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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
    expect(mockTrackAntiCheatAction).not.toHaveBeenCalled();
  });

  it('tracks initialization once when protection becomes active', () => {
    renderHook(() => useTestIntegrity(defaultOptions));

    expect(mockTrackAntiCheatAction).toHaveBeenCalledWith(
      'initializeProtection',
      expect.objectContaining({
        context: 'session',
        surface: 'student_test',
        sessionCode: 'TEST123',
        studentId: 'student1',
        testId: 'test1',
      }),
      expect.objectContaining({
        antiCheatEnabled: true,
        preset: 'standard',
      }),
    );
  });

  it('treats the first two long visibility switches as grace events', () => {
    const { result } = renderHook(() => useTestIntegrity(defaultOptions));

    act(() => {
      dispatchVisibilityChange('hidden');
    });
    act(() => {
      vi.advanceTimersByTime(10000);
      dispatchVisibilityChange('visible');
    });
    act(() => {
      dispatchVisibilityChange('hidden');
    });
    act(() => {
      vi.advanceTimersByTime(7000);
      dispatchVisibilityChange('visible');
    });

    const report = result.current.getIntegrityReport();
    expect(report.violationCount).toBe(0);
    expect(report.totalEvents).toBe(2);
    expect(report.events.every((event) => event.withinGrace)).toBe(true);
    expect(report.events.every((event) => event.counted === false)).toBe(true);
  });

  it('counts the third long switch as a violation once grace is exhausted', () => {
    const { result } = renderHook(() => useTestIntegrity(defaultOptions));

    act(() => {
      dispatchVisibilityChange('hidden');
    });
    act(() => {
      vi.advanceTimersByTime(6000);
      dispatchVisibilityChange('visible');
    });
    act(() => {
      dispatchVisibilityChange('hidden');
    });
    act(() => {
      vi.advanceTimersByTime(6000);
      dispatchVisibilityChange('visible');
    });
    act(() => {
      dispatchWindowBlur();
    });
    act(() => {
      vi.advanceTimersByTime(8000);
      dispatchWindowFocus();
    });

    const report = result.current.getIntegrityReport();
    const countedEvent = report.events[report.events.length - 1];

    expect(report.violationCount).toBe(1);
    expect(report.totalEvents).toBe(3);
    expect(countedEvent?.counted).toBe(true);
    expect(countedEvent?.withinGrace).toBe(false);
    expect(mockTrackAntiCheatAction).toHaveBeenCalledWith(
      'recordViolation',
      expect.objectContaining({
        context: 'session',
        surface: 'student_test',
      }),
      expect.objectContaining({
        eventType: 'window_blur',
        violationCount: 1,
        totalEvents: 3,
      }),
    );
  });

  it('tracks warning escalation and auto-submit when the threshold is reached', () => {
    const configWithWarnings: AntiCheatConfig = {
      ...standardConfig,
      enableStudentWarnings: true,
      enableAutoSubmit: true,
      autoSubmitThreshold: 3,
    };

    const { result } = renderHook(() =>
      useTestIntegrity({
        ...defaultOptions,
        config: configWithWarnings,
      }),
    );

    act(() => {
      result.current.addEvent({
        type: 'copy_attempt',
        timestamp: Date.now(),
        withinGrace: false,
        counted: true,
      });
    });
    act(() => {
      result.current.addEvent({
        type: 'paste_attempt',
        timestamp: Date.now(),
        withinGrace: false,
        counted: true,
      });
    });
    act(() => {
      result.current.addEvent({
        type: 'right_click',
        timestamp: Date.now(),
        withinGrace: false,
        counted: true,
      });
    });

    expect(result.current.warningLevel).toBe('final');
    expect(result.current.shouldAutoSubmit).toBe(true);
    expect(mockTrackAntiCheatAction).toHaveBeenCalledWith(
      'escalateWarning',
      expect.any(Object),
      expect.objectContaining({
        warningLevel: 'toast',
      }),
    );
    expect(mockTrackAntiCheatAction).toHaveBeenCalledWith(
      'triggerAutoSubmit',
      expect.any(Object),
      expect.objectContaining({
        violationCount: 3,
        autoSubmitThreshold: 3,
      }),
    );
  });

  it('restores crash-recovery state and records a reload signal', () => {
    sessionStorageMock.setItem(
      'integrity_events_test1',
      JSON.stringify([
        {
          type: 'tab_switch',
          timestamp: 1000,
          durationMs: 8000,
          withinGrace: false,
          counted: true,
        },
      ]),
    );
    sessionStorageMock.setItem('test_in_progress', 'test1');

    const { result } = renderHook(() => useTestIntegrity(defaultOptions));

    expect(result.current.violationCount).toBe(1);
    expect(result.current.totalEvents).toBe(2);
    expect(mockTrackAntiCheatAction).toHaveBeenCalledWith(
      'restoreIntegrityState',
      expect.objectContaining({
        context: 'session',
        surface: 'student_test',
      }),
      expect.objectContaining({
        recoveredEvents: 1,
        recoveredViolations: 1,
      }),
    );
  });

  it('tracks failed session flush attempts with the supplied trigger metadata', async () => {
    const { result } = renderHook(() => useTestIntegrity(defaultOptions));

    act(() => {
      result.current.addEvent({
        type: 'copy_attempt',
        timestamp: Date.now(),
        withinGrace: false,
        counted: true,
      });
    });

    await act(async () => {
      await result.current.flushEvents('teacher_refresh');
    });

    const flushCall = mockTrackAntiCheatAction.mock.calls.find(
      ([actionName]) => actionName === 'flushIntegrityLogs',
    );

    expect(flushCall).toBeDefined();
    expect(flushCall?.[1]).toEqual(
      expect.objectContaining({
        context: 'session',
        surface: 'student_test',
      }),
    );
    expect(flushCall?.[2]).toEqual(
      expect.objectContaining({
        status: 'failed',
        trigger: 'teacher_refresh',
        persistenceTarget: 'rtdb',
        violationCount: 1,
        errorMessage: expect.any(String),
      }),
    );
    expect(sessionStorageMock.removeItem).toHaveBeenCalledWith(
      'integrity_events_test1',
    );
    expect(sessionStorageMock.removeItem).toHaveBeenCalledWith(
      'test_in_progress',
    );
  });

  it('tracks time_per_question events without counting them as violations', () => {
    const { result } = renderHook(() => useTestIntegrity(defaultOptions));

    act(() => {
      result.current.trackQuestionTime(0);
    });

    vi.advanceTimersByTime(5000);
    act(() => {
      result.current.trackQuestionTime(1);
    });

    const report = result.current.getIntegrityReport();
    const timeEvent = report.events.find((event) => event.type === 'time_per_question');

    expect(timeEvent).toBeDefined();
    expect(timeEvent?.counted).toBe(false);
    expect(timeEvent?.withinGrace).toBe(true);
  });
});
