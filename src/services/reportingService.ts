/**
 * ReportingService - Core singleton for production error reporting and event tracking.
 * PRD-0037: Production Reporting & Observability System
 *
 * The reporting system must never throw errors that affect the host application.
 */

import { logEvent } from 'firebase/analytics';
import type { Auth, User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import type { Database } from 'firebase/database';
import { onValue, push, ref, set, update } from 'firebase/database';
import { resolveFeatureFromRoute, validateFeatureId } from '../config/featureRegistry';
import { getBreadcrumbs } from '../hooks/useBreadcrumbs';
import { analytics } from './firebase';

interface QueuedEvent {
  type: 'error' | 'event';
  data: Record<string, unknown>;
  databasePath?: string;
}

interface ErrorRecord {
  id: string;
  timestamp: number;
  feature: string;
  severity: 'crash' | 'error' | 'warning';
  message: string;
  stack: string;
  page: string;
  userId: string;
  userName: string;
  userRole: string;
  browser: string;
  screenSize: string;
  isBoundary: boolean;
  contextData: Record<string, unknown>;
  breadcrumbs: unknown[];
  diagnosticUrl: string | null;
  componentStack: string | null;
  duplicateCount: number;
}

interface ReportingConfig {
  mode: 'full' | 'errors-only' | 'off';
  categories: {
    errors: boolean;
    events: boolean;
    performance: boolean;
    diagnostics: boolean;
  };
}

interface RateLimitEntry {
  count: number;
  firstId: string;
  firstRtdbPath: string;
  resetTimer: ReturnType<typeof setTimeout>;
}

export class ReportingService {
  private static instance: ReportingService;

  private database: Database | null = null;
  private currentUser: User | null = null;
  private currentUserRole = 'unknown';
  private isInitialized = false;

  private eventQueue: QueuedEvent[] = [];
  private _flushIntervalId: ReturnType<typeof setInterval> | null = null;

  private currentMode: 'full' | 'errors-only' | 'off' = 'full';
  private categories: ReportingConfig['categories'] = {
    errors: true,
    events: true,
    performance: true,
    diagnostics: true,
  };

  private circuitState: 'closed' | 'open' | 'half-open' = 'closed';
  private failureCount = 0;
  private circuitOpenedAt: number | null = null;
  private static readonly CIRCUIT_COOLDOWN_MS = 5 * 60 * 1000;

  private rateLimitMap: Map<string, RateLimitEntry> = new Map();
  private persistedErrorPaths: Set<string> = new Set();

  private sessionEventCount = 0;
  private static readonly SESSION_QUOTA = 500;
  private quotaWarned = false;
  private canarySent = false;

  private constructor() {}

  static getInstance(): ReportingService {
    if (!ReportingService.instance) {
      ReportingService.instance = new ReportingService();
    }
    return ReportingService.instance;
  }

  private findQueuedErrorEvent(errorId: string): QueuedEvent | undefined {
    return this.eventQueue.find(
      (event) => event.type === 'error' && event.data.id === errorId
    );
  }

  private syncErrorRecord(
    errorId: string,
    recordPath: string | undefined,
    patch: Partial<ErrorRecord>
  ): void {
    const pendingEvent = this.findQueuedErrorEvent(errorId);

    if (pendingEvent) {
      Object.assign(pendingEvent.data, patch);
      return;
    }

    if (!this.database || !recordPath || !this.persistedErrorPaths.has(recordPath)) {
      return;
    }

    update(ref(this.database, recordPath), patch).catch((error) => {
      console.warn('[ReportingService] Error record update failed:', error);
    });
  }

  init(auth: Auth, database: Database): void {
    try {
      if (this.isInitialized) {
        console.warn('[ReportingService] Already initialized');
        return;
      }

      this.database = database;

      onAuthStateChanged(auth, (user) => {
        try {
          this.currentUser = user;

          if (user) {
            const roleRef = ref(database, `users/${user.uid}/role`);
            onValue(roleRef, (snapshot) => {
              this.currentUserRole = snapshot.val() || 'unknown';
            });

            if (!this.canarySent) {
              this.canarySent = true;
              this.sendCanaryEvent();
            }
          } else {
            this.currentUserRole = 'unknown';
          }
        } catch (e) {
          console.warn('[ReportingService] Auth state handler error:', e);
        }
      });

      const modeRef = ref(database, '/reports/config/mode');
      onValue(modeRef, (snapshot) => {
        const value = snapshot.val();
        if (value === 'full' || value === 'errors-only' || value === 'off') {
          const previousMode = this.currentMode;
          this.currentMode = value;
          if (value === 'off' && previousMode !== 'off') {
            this.eventQueue = [];
          }
        }
      });

      const categoriesRef = ref(database, '/reports/config/categories');
      onValue(categoriesRef, (snapshot) => {
        const value = snapshot.val();
        if (value && typeof value === 'object') {
          this.categories = {
            errors: value.errors !== false,
            events: value.events !== false,
            performance: value.performance !== false,
            diagnostics: value.diagnostics !== false,
          };
        }
      });

      this.setupGlobalErrorHandlers();

      this._flushIntervalId = setInterval(() => {
        this.flush();
      }, 5000);

      window.addEventListener('beforeunload', () => {
        this.flush();
      });

      this.isInitialized = true;
      console.log('[ReportingService] Initialized');
    } catch (e) {
      console.warn('[ReportingService] Init error:', e);
    }
  }

  private setupGlobalErrorHandlers(): void {
    try {
      const previousOnError = window.onerror;
      window.onerror = (message, source, lineno, colno, error) => {
        try {
          this.reportError(error || new Error(String(message)), {
            source,
            lineno,
            colno,
          });
        } catch (handlerError) {
          console.warn('[ReportingService] onerror handler error:', handlerError);
        }

        if (previousOnError) {
          previousOnError.call(window, message, source, lineno, colno, error);
        }
      };

      window.addEventListener('unhandledrejection', (event) => {
        try {
          const error =
            event.reason instanceof Error
              ? event.reason
              : new Error(String(event.reason));
          this.reportError(error, { type: 'unhandledPromiseRejection' });
        } catch (handlerError) {
          console.warn(
            '[ReportingService] unhandledrejection handler error:',
            handlerError
          );
        }
      });
    } catch (e) {
      console.warn('[ReportingService] setupGlobalErrorHandlers error:', e);
    }
  }

  private async sendCanaryEvent(): Promise<void> {
    try {
      if (!this.database) return;

      const todayDate = new Date().toISOString().split('T')[0];
      const canaryRef = ref(
        this.database,
        `/reports/events/${todayDate}/canary_${Date.now()}`
      );

      await set(canaryRef, {
        type: 'canary',
        timestamp: Date.now(),
        message: 'Reporting pipeline active',
      });

      console.log('[ReportingService] Pipeline verified');
    } catch (e) {
      console.warn('[ReportingService] Canary failed - pipeline not operational:', e);
      this.circuitState = 'open';
      this.circuitOpenedAt = Date.now();
    }
  }

  reportError(error: Error, context?: Record<string, unknown>): void {
    try {
      if (this.currentMode === 'off') return;
      if (!this.categories.errors) return;

      const userId = this.currentUser?.uid || 'pre-auth';
      if (userId === 'guest') {
        console.warn('[ReportingService] Skipping error report for guest user');
        return;
      }

      const contextData = this.extractContextData(context);
      const severity: 'crash' | 'error' | 'warning' =
        context?.isBoundary ? 'crash' : 'error';

      const signature = `${error.message}::${window.location.pathname}`;
      const rateLimitEntry = this.rateLimitMap.get(signature);

      const errorId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Date.now().toString(36) + Math.random().toString(36).substring(2);

      const todayDate = new Date().toISOString().split('T')[0];
      const pathPrefix = `/reports/errors/${todayDate}`;
      let errorRecordPath: string | undefined;

      if (this.database) {
        const pushKey = push(ref(this.database, pathPrefix)).key;
        if (pushKey) {
          errorRecordPath = `${pathPrefix}/${pushKey}`;
        }
      }

      if (rateLimitEntry) {
        rateLimitEntry.count += 1;
        if (rateLimitEntry.count >= 5) {
          this.syncErrorRecord(rateLimitEntry.firstId, rateLimitEntry.firstRtdbPath, {
            duplicateCount: rateLimitEntry.count,
          });
          return;
        }
      }

      const errorRecord: ErrorRecord = {
        id: errorId,
        timestamp: Date.now(),
        feature: resolveFeatureFromRoute(window.location.pathname) || 'unregistered',
        severity,
        message: (error.message || 'Unknown error').substring(0, 500),
        stack: (error.stack || '').substring(0, 2000),
        page: window.location.pathname,
        userId,
        userName: this.currentUser?.displayName || 'Pre-authentication',
        userRole: this.currentUserRole,
        browser: navigator.userAgent.substring(0, 200),
        screenSize: `${window.innerWidth}x${window.innerHeight}`,
        isBoundary: Boolean(context?.isBoundary),
        contextData,
        breadcrumbs: getBreadcrumbs(),
        diagnosticUrl: null,
        componentStack: (context?.componentStack as string) || null,
        duplicateCount: 1,
      };

      if (!rateLimitEntry) {
        const resetTimer = setTimeout(() => {
          this.rateLimitMap.delete(signature);
        }, 60000);

        this.rateLimitMap.set(signature, {
          count: 1,
          firstId: errorId,
          firstRtdbPath: errorRecordPath || '',
          resetTimer,
        });
      }

      this.enqueue({
        type: 'error',
        data: errorRecord as unknown as Record<string, unknown>,
        databasePath: errorRecordPath,
      });

      if (severity === 'crash' || severity === 'error') {
        this.uploadDiagnosticBundle(errorRecord, errorRecordPath);
      }
    } catch (e) {
      console.warn('[ReportingService] reportError internal error:', e);
    }
  }

  trackAction(
    feature: string,
    action: string,
    metadata?: Record<string, unknown>
  ): void {
    try {
      if (this.currentMode !== 'full') return;
      if (!this.categories.events) return;

      if (import.meta.env.DEV) {
        validateFeatureId(feature);
      }

      this.enqueue({
        type: 'event',
        data: {
          type: 'action',
          feature,
          action,
          metadata: metadata || {},
          timestamp: Date.now(),
          page: window.location.pathname,
          userId: this.currentUser?.uid || 'pre-auth',
          userName: this.currentUser?.displayName || 'Pre-authentication',
          userRole: this.currentUserRole,
        },
      });
    } catch (e) {
      console.warn('[ReportingService] trackAction internal error:', e);
    }
  }

  trackPageView(feature: string, page: string): void {
    try {
      if (this.currentMode !== 'full') return;
      if (!this.categories.events) return;

      if (import.meta.env.DEV) {
        validateFeatureId(feature);
      }

      this.enqueue({
        type: 'event',
        data: {
          type: 'pageView',
          feature,
          page,
          timestamp: Date.now(),
          userId: this.currentUser?.uid || 'pre-auth',
          userName: this.currentUser?.displayName || 'Pre-authentication',
          userRole: this.currentUserRole,
        },
      });
    } catch (e) {
      console.warn('[ReportingService] trackPageView internal error:', e);
    }
  }

  getConfig(): ReportingConfig {
    try {
      return {
        mode: this.currentMode,
        categories: { ...this.categories },
      };
    } catch (e) {
      console.warn('[ReportingService] getConfig internal error:', e);
      return {
        mode: 'full',
        categories: {
          errors: true,
          events: true,
          performance: true,
          diagnostics: true,
        },
      };
    }
  }

  setMode(mode: 'full' | 'errors-only' | 'off'): void {
    try {
      if (!this.database) return;
      set(ref(this.database, '/reports/config/mode'), mode);
    } catch (e) {
      console.warn('[ReportingService] setMode internal error:', e);
    }
  }

  private enqueue(event: QueuedEvent): void {
    try {
      this.sessionEventCount += 1;

      if (this.sessionEventCount > ReportingService.SESSION_QUOTA) {
        if (event.type !== 'error') {
          if (!this.quotaWarned) {
            console.warn(
              '[ReportingService] Session quota reached (500 events) - only errors will be reported'
            );
            this.quotaWarned = true;
          }
          return;
        }
      }

      this.eventQueue.push(event);

      if (this.eventQueue.length >= 10) {
        this.flush();
      }
    } catch (e) {
      console.warn('[ReportingService] enqueue internal error:', e);
    }
  }

  flush(): void {
    try {
      if (!this.database || this.eventQueue.length === 0) return;

      if (this.currentMode === 'off') {
        this.eventQueue = [];
        return;
      }

      const events = [...this.eventQueue];
      this.eventQueue = [];

      if (this.circuitState === 'open') {
        const elapsed = Date.now() - (this.circuitOpenedAt || 0);
        if (elapsed < ReportingService.CIRCUIT_COOLDOWN_MS) {
          this.sendAnalyticsOnly(events);
          return;
        }

        this.circuitState = 'half-open';
      }

      const todayDate = new Date().toISOString().split('T')[0];
      const updates: Record<string, unknown> = {};

      for (const event of events) {
        const pathPrefix =
          event.type === 'error'
            ? `/reports/errors/${todayDate}`
            : `/reports/events/${todayDate}`;

        let databasePath = event.databasePath;
        if (!databasePath) {
          const pushKey = push(ref(this.database, pathPrefix)).key;
          if (!pushKey) {
            continue;
          }
          databasePath = `${pathPrefix}/${pushKey}`;
          event.databasePath = databasePath;
        }

        updates[databasePath] = event.data;
      }

      if (Object.keys(updates).length === 0) return;

      update(ref(this.database), updates)
        .then(() => {
          for (const event of events) {
            if (event.type === 'error' && event.databasePath) {
              this.persistedErrorPaths.add(event.databasePath);
            }
          }

          if (this.circuitState === 'half-open') {
            this.circuitState = 'closed';
            this.failureCount = 0;
            console.log('[ReportingService] Circuit breaker CLOSED - writes resumed');
          }

          this.sendAnalyticsEvents(events);
        })
        .catch((err: unknown) => {
          console.warn('[ReportingService] RTDB flush failed:', err);
          this.failureCount += 1;

          if (this.circuitState === 'half-open') {
            this.circuitState = 'open';
            this.circuitOpenedAt = Date.now();
          } else if (this.failureCount >= 3) {
            this.circuitState = 'open';
            this.circuitOpenedAt = Date.now();
            console.warn(
              '[ReportingService] Circuit breaker OPEN - pausing for 5 minutes'
            );
          }

          this.sendAnalyticsOnly(events);
        });
    } catch (e) {
      console.warn('[ReportingService] flush internal error:', e);
    }
  }

  private sendAnalyticsEvents(events: QueuedEvent[]): void {
    try {
      if (this.currentMode === 'off' || !analytics) return;

      for (const event of events) {
        try {
          if (event.type === 'error') {
            logEvent(analytics, 'error_occurred', {
              feature: String(event.data.feature || ''),
              severity: String(event.data.severity || ''),
              error_code: String(event.data.message || '').substring(0, 40),
            });
          } else if (event.data.type === 'pageView') {
            logEvent(analytics, 'screen_view', {
              firebase_screen: String(event.data.page || ''),
              firebase_screen_class: String(event.data.feature || ''),
            });
          } else if (event.data.type === 'action') {
            logEvent(analytics, 'feature_used', {
              feature: String(event.data.feature || ''),
              action: String(event.data.action || ''),
            });
          }
        } catch {
          // Analytics failures should never block anything.
        }
      }
    } catch (e) {
      console.warn('[ReportingService] Analytics error:', e);
    }
  }

  private sendAnalyticsOnly(events: QueuedEvent[]): void {
    try {
      if (events.length > 0) {
        this.sendAnalyticsEvents(events);
      }
    } catch (e) {
      console.warn('[ReportingService] sendAnalyticsOnly error:', e);
    }
  }

  private extractContextData(
    userContext?: Record<string, unknown>
  ): Record<string, unknown> {
    try {
      const pathname = window.location.pathname;
      const urlParams: Record<string, string> = {};

      const paramPatterns: [RegExp, string][] = [
        [/\/student-test\/([^/]+)/, 'sessionCode'],
        [/\/teacher\/homework\/([^/]+)/, 'homeworkId'],
        [/\/teacher\/courses\/([^/]+)/, 'courseId'],
        [/\/teacher\/thcs-test\/edit\/([^/]+)/, 'draftId'],
        [/\/teacher\/classes\/([^/]+)/, 'classId'],
        [/\/student\/courses\/([^/]+)/, 'courseId'],
        [/\/student\/practice\/([^/]+)/, 'materialId'],
        [/\/teacher-quiz\/([^/]+)/, 'gameSessionId'],
        [/\/student-quiz\/([^/]+)/, 'gameSessionId'],
      ];

      for (const [pattern, paramName] of paramPatterns) {
        const match = pathname.match(pattern);
        if (match && match[1]) {
          urlParams[paramName] = match[1];
        }
      }

      const searchParams: Record<string, string> = {};
      const search = new URLSearchParams(window.location.search);
      search.forEach((value, key) => {
        searchParams[key] = value;
      });

      return {
        ...urlParams,
        ...(userContext || {}),
        routeParams: { ...urlParams },
        searchParams,
      };
    } catch {
      return { ...(userContext || {}) };
    }
  }

  private uploadDiagnosticBundle(
    errorRecord: ErrorRecord,
    recordPath?: string
  ): void {
    try {
      if (!this.categories.diagnostics) return;

      const workerUrl = import.meta.env.VITE_BACKUP_WORKER_URL;
      const diagnosticToken = import.meta.env.VITE_DIAGNOSTIC_TOKEN;

      if (!workerUrl || !diagnosticToken) {
        if (import.meta.env.DEV) {
          console.warn(
            '[ReportingService] Diagnostic upload skipped - missing VITE_BACKUP_WORKER_URL or VITE_DIAGNOSTIC_TOKEN'
          );
        }
        return;
      }

      void import('../utils/diagnosticLogger')
        .then(({ getDiagnosticLogger }) => getDiagnosticLogger()?.getLogs() || [])
        .catch(() => [])
        .then(async (diagnosticLogs) => {
          const bundle = {
            errorId: errorRecord.id,
            timestamp: errorRecord.timestamp,
            error: {
              message: errorRecord.message,
              stack: errorRecord.stack,
              componentStack: errorRecord.componentStack,
            },
            user: {
              id: errorRecord.userId,
              name: errorRecord.userName,
              role: errorRecord.userRole,
            },
            environment: {
              browser: errorRecord.browser,
              screenSize: errorRecord.screenSize,
              page: errorRecord.page,
              buildVersion: import.meta.env.VITE_BUILD_VERSION || 'unknown',
            },
            breadcrumbs: errorRecord.breadcrumbs,
            diagnosticLogs,
          };

          const response = await fetch(`${workerUrl}/api/diagnostic`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${diagnosticToken}`,
            },
            body: JSON.stringify(bundle),
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const result = await response.json();
          return typeof result.url === 'string' ? result.url : null;
        })
        .then((diagnosticUrl) => {
          if (diagnosticUrl) {
            this.syncErrorRecord(errorRecord.id, recordPath, { diagnosticUrl });
          }
        })
        .catch((e: unknown) => {
          console.warn('[ReportingService] Diagnostic upload failed:', e);
        });
    } catch (e) {
      console.warn('[ReportingService] uploadDiagnosticBundle error:', e);
    }
  }
}

export const reportingService = ReportingService.getInstance();
export type { ErrorRecord, ReportingConfig };
