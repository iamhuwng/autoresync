import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAnalyticsInstance,
  mockLogEvent,
  mockRef,
  mockUpdate,
  mockPush,
  mockOnValue,
  mockSet,
  mockOnAuthStateChanged,
} = vi.hoisted(() => ({
  mockAnalyticsInstance: { app: 'mock-analytics' },
  mockLogEvent: vi.fn(),
  mockRef: vi.fn((database, path?: string) => ({ database, path })),
  mockUpdate: vi.fn(() => Promise.resolve()),
  mockPush: vi.fn(),
  mockOnValue: vi.fn(),
  mockSet: vi.fn(() => Promise.resolve()),
  mockOnAuthStateChanged: vi.fn(),
}));

vi.mock('firebase/analytics', () => ({
  logEvent: mockLogEvent,
}));

vi.mock('firebase/database', () => ({
  ref: mockRef,
  update: mockUpdate,
  push: mockPush,
  onValue: mockOnValue,
  set: mockSet,
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: mockOnAuthStateChanged,
}));

vi.mock('./firebase', () => ({
  analytics: mockAnalyticsInstance,
}));

import { ReportingService, reportingService } from './reportingService';

function resetReportingServiceState() {
  const service = ReportingService.getInstance() as unknown as {
    database: unknown;
    runtime: unknown;
    runtimePromise: Promise<unknown> | null;
    authenticatedInitPromise: Promise<void> | null;
    currentUser: unknown;
    currentUserRole: string;
    isCoreInitialized: boolean;
    isInitialized: boolean;
    authUnsubscribe: (() => void) | null;
    roleUnsubscribe: (() => void) | null;
    modeUnsubscribe: (() => void) | null;
    categoriesUnsubscribe: (() => void) | null;
    beforeUnloadHandler: (() => void) | null;
    eventQueue: unknown[];
    _flushIntervalId: ReturnType<typeof setInterval> | null;
    currentMode: 'full' | 'errors-only' | 'off';
    categories: {
      errors: boolean;
      events: boolean;
      performance: boolean;
      diagnostics: boolean;
    };
    circuitState: 'closed' | 'open' | 'half-open';
    failureCount: number;
    circuitOpenedAt: number | null;
    rateLimitMap: Map<string, { resetTimer: ReturnType<typeof setTimeout> }>;
    persistedErrorPaths: Set<string>;
    sessionEventCount: number;
    quotaWarned: boolean;
    canarySent: boolean;
  };

  for (const entry of service.rateLimitMap.values()) {
    clearTimeout(entry.resetTimer);
  }

  if (service._flushIntervalId) {
    clearInterval(service._flushIntervalId);
  }

  service.database = null;
  service.runtime = null;
  service.runtimePromise = null;
  service.authenticatedInitPromise = null;
  service.currentUser = null;
  service.currentUserRole = 'unknown';
  service.isCoreInitialized = false;
  service.isInitialized = false;
  service.authUnsubscribe = null;
  service.roleUnsubscribe = null;
  service.modeUnsubscribe = null;
  service.categoriesUnsubscribe = null;
  if (service.beforeUnloadHandler) {
    window.removeEventListener('beforeunload', service.beforeUnloadHandler);
  }
  service.beforeUnloadHandler = null;
  service.eventQueue = [];
  service._flushIntervalId = null;
  service.currentMode = 'full';
  service.categories = {
    errors: true,
    events: true,
    performance: true,
    diagnostics: true,
  };
  service.circuitState = 'closed';
  service.failureCount = 0;
  service.circuitOpenedAt = null;
  service.rateLimitMap.clear();
  service.persistedErrorPaths.clear();
  service.sessionEventCount = 0;
  service.quotaWarned = false;
  service.canarySent = false;
}

function bindRuntimeMocks() {
  const service = ReportingService.getInstance() as unknown as {
    runtime: unknown;
  };

  service.runtime = {
    analytics: mockAnalyticsInstance,
    logEvent: mockLogEvent,
    onAuthStateChanged: mockOnAuthStateChanged,
    onValue: mockOnValue,
    push: mockPush,
    ref: mockRef,
    set: mockSet,
    update: mockUpdate,
  };
}

describe('ReportingService', () => {
  beforeEach(() => {
    let pushCounter = 0;

    resetReportingServiceState();
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    window.history.replaceState({}, '', '/student-test/ABC123');

    mockRef.mockImplementation((database, path?: string) => ({ database, path }));
    mockUpdate.mockImplementation(() => Promise.resolve());
    mockPush.mockImplementation(() => ({ key: `mock-key-${++pushCounter}` }));
    mockOnValue.mockImplementation(() => {});
    mockSet.mockImplementation(() => Promise.resolve());
    mockOnAuthStateChanged.mockImplementation(() => () => {});
    mockLogEvent.mockImplementation(() => {});
    bindRuntimeMocks();
  });

  afterEach(() => {
    resetReportingServiceState();
    vi.restoreAllMocks();
  });

  it('returns the same instance from getInstance()', () => {
    expect(ReportingService.getInstance()).toBe(ReportingService.getInstance());
    expect(ReportingService.getInstance()).toBe(reportingService);
  });

  it('does not throw from public tracking methods before initialization', () => {
    const service = ReportingService.getInstance();

    expect(() => {
      service.reportError(new Error('test error'));
    }).not.toThrow();

    expect(() => {
      service.trackAction('testTaking', 'submitAnswer', { questionId: 'q-1' });
    }).not.toThrow();

    expect(() => {
      service.trackPageView('testTaking', '/student-test/ABC123');
    }).not.toThrow();
  });

  it('initializes global reporting handlers without requiring authenticated runtime setup', () => {
    const service = ReportingService.getInstance() as unknown as {
      isCoreInitialized: boolean;
      isInitialized: boolean;
      initCore: () => void;
    };

    service.initCore();

    expect(service.isCoreInitialized).toBe(true);
    expect(service.isInitialized).toBe(false);
  });

  it('adds an action event to the internal queue', () => {
    const service = ReportingService.getInstance() as unknown as {
      eventQueue: Array<{ type: string; data: Record<string, unknown> }>;
      trackAction: (
        feature: string,
        action: string,
        metadata?: Record<string, unknown>
      ) => void;
    };

    service.trackAction('testTaking', 'submitAnswer', { questionId: 'q-1' });

    expect(service.eventQueue).toHaveLength(1);
    expect(service.eventQueue[0]).toMatchObject({
      type: 'event',
      data: {
        type: 'action',
        feature: 'testTaking',
        action: 'submitAnswer',
      },
    });
  });

  it('flushes queued events and writes them with mocked firebase helpers', async () => {
    const service = ReportingService.getInstance() as unknown as {
      database: unknown;
      eventQueue: Array<{ type: string; data: Record<string, unknown> }>;
      trackAction: (
        feature: string,
        action: string,
        metadata?: Record<string, unknown>
      ) => void;
      trackPageView: (feature: string, page: string) => void;
      flush: () => void;
    };

    service.database = { app: 'mock-db' };
    service.trackAction('testTaking', 'submitAnswer', { questionId: 'q-1' });
    service.trackPageView('testTaking', '/student-test/ABC123');

    expect(service.eventQueue).toHaveLength(2);

    service.flush();
    await Promise.resolve();
    await Promise.resolve();

    const todayDate = new Date().toISOString().split('T')[0];
    const updatesArgument = mockUpdate.mock.calls[0]?.[1] as Record<string, unknown>;

    expect(service.eventQueue).toHaveLength(0);
    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(Object.keys(updatesArgument)).toHaveLength(2);
    expect(Object.keys(updatesArgument)).toEqual(
      expect.arrayContaining([
        `/reports/events/${todayDate}/mock-key-1`,
        `/reports/events/${todayDate}/mock-key-2`,
      ])
    );
    expect(mockLogEvent).toHaveBeenCalledTimes(2);
  });

  it('reuses the reserved error path when flushing an error record', async () => {
    const service = ReportingService.getInstance() as unknown as {
      database: unknown;
      eventQueue: Array<{ databasePath?: string }>;
      reportError: (error: Error) => void;
      flush: () => void;
    };

    service.database = { app: 'mock-db' };
    service.reportError(new Error('reserved path error'));

    expect(service.eventQueue).toHaveLength(1);
    expect(service.eventQueue[0]?.databasePath).toMatch(/\/reports\/errors\//);
    expect(mockPush).toHaveBeenCalledTimes(1);

    service.flush();
    await Promise.resolve();
    await Promise.resolve();

    const todayDate = new Date().toISOString().split('T')[0];
    const updatesArgument = mockUpdate.mock.calls[0]?.[1] as Record<string, unknown>;

    expect(Object.keys(updatesArgument)).toEqual([
      `/reports/errors/${todayDate}/mock-key-1`,
    ]);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('clears queued events and falls back to analytics when the circuit is open', async () => {
    const service = ReportingService.getInstance() as unknown as {
      database: unknown;
      eventQueue: Array<{ type: string }>;
      circuitState: 'closed' | 'open' | 'half-open';
      circuitOpenedAt: number | null;
      trackAction: (feature: string, action: string) => void;
      flush: () => void;
      sendAnalyticsEvents: (events: unknown[]) => void;
    };

    service.database = { app: 'mock-db' };
    service.trackAction('testTaking', 'submitAnswer');
    service.circuitState = 'open';
    service.circuitOpenedAt = Date.now();

    const analyticsSpy = vi.spyOn(service, 'sendAnalyticsEvents');

    service.flush();
    await Promise.resolve();
    await Promise.resolve();

    expect(service.eventQueue).toHaveLength(0);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(analyticsSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'event',
      }),
    ]);
  });

  it('passes captured events to analytics fallback when RTDB update fails', async () => {
    const service = ReportingService.getInstance() as unknown as {
      database: unknown;
      eventQueue: Array<{ type: string }>;
      trackAction: (feature: string, action: string) => void;
      trackPageView: (feature: string, page: string) => void;
      flush: () => void;
      sendAnalyticsEvents: (events: unknown[]) => void;
    };

    mockUpdate.mockImplementationOnce(() => Promise.reject(new Error('db down')));

    service.database = { app: 'mock-db' };
    service.trackAction('testTaking', 'submitAnswer');
    service.trackPageView('testTaking', '/student-test/ABC123');

    const analyticsSpy = vi.spyOn(service, 'sendAnalyticsEvents');

    service.flush();
    await Promise.resolve();
    await Promise.resolve();

    expect(service.eventQueue).toHaveLength(0);
    expect(analyticsSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'event',
        data: expect.objectContaining({ type: 'action' }),
      }),
      expect.objectContaining({
        type: 'event',
        data: expect.objectContaining({ type: 'pageView' }),
      }),
    ]);
  });
});
