/**
 * AdminReportsPage
 *
 * Super admin reports shell for production reporting and observability.
 *
 * Route: /admin/reports
 * Allowed Roles: super_admin only
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  IconActivity,
  IconAlertTriangle,
  IconArrowLeft,
  IconChartBar,
  IconHeartbeat,
  IconShieldCheck,
} from '@tabler/icons-react';
import { getAuth } from 'firebase/auth';
import {
  get,
  limitToLast,
  off,
  onChildAdded,
  onValue,
  query,
  ref,
  remove,
} from 'firebase/database';
import DiagnosticViewerModal, {
  type DiagnosticBundle,
} from '../components/DiagnosticViewerModal';
import { FEATURE_REGISTRY } from '../config/featureRegistry';
import { Button, Card, Input, NativeSelect, toast } from '../components/modern';
import { AdminLayout } from '../components/navigation';
import { sessionStore } from '../core/platform/storage';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { database } from '../services/firebase';
import './AdminReportsPage.css';

type ReportsTab = 'health' | 'errors' | 'live';
type ReportingMode = 'full' | 'errors-only' | 'off';
type ErrorSeverity = 'crash' | 'error' | 'warning';
type ErrorSortOption = 'newest' | 'frequency';

interface ReportErrorRecord {
  id?: string;
  feature?: string;
  timestamp?: number;
  severity?: ErrorSeverity;
  message?: string;
  page?: string;
  userName?: string;
  userId?: string;
  userRole?: string;
  duplicateCount?: number;
  diagnosticUrl?: string | null;
  stack?: string;
  componentStack?: string | null;
  browser?: string;
  screenSize?: string;
  isBoundary?: boolean;
  breadcrumbs?: unknown[];
  contextData?: Record<string, unknown>;
}

interface ReportEventRecord {
  id?: string;
  feature?: string;
  timestamp?: number;
  type?: string;
  action?: string;
  page?: string;
  userName?: string;
}

interface FeatureHealthRow {
  featureId: string;
  featureName: string;
  description: string;
  errors24h: number;
  lastError: number | null;
  status: 'green' | 'yellow' | 'red';
  statusEmoji: string;
  statusLabel: string;
  usage24h: number;
}

interface TabDefinition {
  id: ReportsTab;
  label: string;
  description: string;
  icon: React.ReactNode;
  accent: string;
  summary: string;
}

interface LiveFeedItem {
  id: string;
  kind: 'error' | 'action' | 'pageView';
  timestamp: number;
  featureName: string;
  message: string;
  userName: string;
}

const TAB_DEFINITIONS: TabDefinition[] = [
  {
    id: 'health',
    label: 'Feature Health',
    description: 'Monitor adoption, feature coverage, and degraded paths.',
    icon: <IconChartBar size={20} />,
    accent: '#2563eb',
    summary: 'Usage, health scoring, and registration coverage will live here.',
  },
  {
    id: 'errors',
    label: 'Error Log',
    description: 'Review crashes, stack traces, and diagnostic bundle links.',
    icon: <IconAlertTriangle size={20} />,
    accent: '#dc2626',
    summary: 'Filtered error streams, detail panels, and diagnostic actions live here.',
  },
  {
    id: 'live',
    label: 'Live Feed',
    description: 'Watch the incoming stream of production telemetry in real time.',
    icon: <IconActivity size={20} />,
    accent: '#059669',
    summary: 'Live event activity and recent reporting pipeline status will render here.',
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const CRASH_LOOKBACK_MS = 72 * 60 * 60 * 1000;

function getReportDateKey(daysAgo = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().split('T')[0];
}

function snapshotToRecords<T extends { id?: string }>(value: unknown): T[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.entries(value as Record<string, unknown>)
    .map(([id, record]) => {
      if (record && typeof record === 'object') {
        return {
          id,
          ...(record as Record<string, unknown>),
        } as T;
      }

      return { id } as T;
    })
    .filter(Boolean);
}

function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp) {
    return 'No recent errors';
  }

  const elapsed = Date.now() - timestamp;

  if (elapsed < 60 * 1000) {
    return 'Just now';
  }

  if (elapsed < 60 * 60 * 1000) {
    return `${Math.floor(elapsed / (60 * 1000))}m ago`;
  }

  if (elapsed < DAY_MS) {
    return `${Math.floor(elapsed / (60 * 60 * 1000))}h ago`;
  }

  return `${Math.floor(elapsed / DAY_MS)}d ago`;
}

function buildFeatureHealthRows(
  errors: ReportErrorRecord[],
  events: ReportEventRecord[]
): FeatureHealthRow[] {
  const now = Date.now();
  const statusRank = {
    red: 0,
    yellow: 1,
    green: 2,
  };

  return FEATURE_REGISTRY.map((feature) => {
    const featureErrors = errors.filter(
      (record) =>
        record.feature === feature.id && typeof record.timestamp === 'number'
    );
    const featureEvents = events.filter(
      (record) =>
        record.feature === feature.id &&
        record.type === 'action' &&
        typeof record.timestamp === 'number'
    );

    const errors24h = featureErrors.filter(
      (record) => (record.timestamp as number) > now - DAY_MS
    ).length;
    const usage24h = featureEvents.filter(
      (record) => (record.timestamp as number) > now - DAY_MS
    ).length;

    let lastError: number | null = null;
    for (const error of featureErrors) {
      if (
        typeof error.timestamp === 'number' &&
        (lastError === null || error.timestamp > lastError)
      ) {
        lastError = error.timestamp;
      }
    }

    const hasCrash24h = featureErrors.some(
      (record) =>
        record.severity === 'crash' &&
        typeof record.timestamp === 'number' &&
        record.timestamp > now - DAY_MS
    );
    const hasCrash72h = featureErrors.some(
      (record) =>
        record.severity === 'crash' &&
        typeof record.timestamp === 'number' &&
        record.timestamp > now - CRASH_LOOKBACK_MS
    );

    let status: FeatureHealthRow['status'] = 'green';
    let statusEmoji = '🟢';
    let statusLabel = 'Healthy';

    if (errors24h > 5 || hasCrash24h) {
      status = 'red';
      statusEmoji = '🔴';
      statusLabel = 'Critical';
    } else if (errors24h >= 1 || hasCrash72h) {
      status = 'yellow';
      statusEmoji = '🟡';
      statusLabel = 'Needs attention';
    }

    return {
      featureId: feature.id,
      featureName: feature.name,
      description: feature.description,
      errors24h,
      lastError,
      status,
      statusEmoji,
      statusLabel,
      usage24h,
    };
  }).sort((left, right) => {
    return (
      statusRank[left.status] - statusRank[right.status] ||
      right.errors24h - left.errors24h ||
      right.usage24h - left.usage24h ||
      left.featureName.localeCompare(right.featureName)
    );
  });
}

function getFeatureName(featureId?: string): string {
  if (!featureId) {
    return 'Unregistered Feature';
  }

  return (
    FEATURE_REGISTRY.find((feature) => feature.id === featureId)?.name || featureId
  );
}

function truncateText(value: string | undefined, maxLength = 100): string {
  if (!value) {
    return 'No message captured';
  }

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}...`;
}

function getSeverityMeta(severity: ErrorSeverity | undefined): {
  label: string;
  color: string;
  background: string;
} {
  if (severity === 'crash') {
    return {
      label: 'Crash',
      color: '#b91c1c',
      background: 'rgba(239, 68, 68, 0.12)',
    };
  }

  if (severity === 'warning') {
    return {
      label: 'Warning',
      color: '#b45309',
      background: 'rgba(245, 158, 11, 0.14)',
    };
  }

  return {
    label: 'Error',
    color: '#c2410c',
    background: 'rgba(249, 115, 22, 0.12)',
  };
}

function buildLiveFeedItem(
  source: 'error' | 'event',
  id: string,
  payload: ReportErrorRecord | ReportEventRecord
): LiveFeedItem | null {
  if (source === 'error') {
    const errorRecord = payload as ReportErrorRecord;
    return {
      id: `error-${id}`,
      kind: 'error',
      timestamp: errorRecord.timestamp || Date.now(),
      featureName: getFeatureName(errorRecord.feature),
      message: errorRecord.message || 'No error message captured',
      userName: errorRecord.userName || 'Unknown user',
    };
  }

  const eventRecord = payload as ReportEventRecord;
  if (eventRecord.type === 'pageView') {
    return {
      id: `pageView-${id}`,
      kind: 'pageView',
      timestamp: eventRecord.timestamp || Date.now(),
      featureName: getFeatureName(eventRecord.feature),
      message: eventRecord.page || 'Page view',
      userName: eventRecord.userName || 'Unknown user',
    };
  }

  return {
    id: `event-${id}`,
    kind: 'action',
    timestamp: eventRecord.timestamp || Date.now(),
    featureName: getFeatureName(eventRecord.feature),
    message: eventRecord.action || 'Action event',
    userName: eventRecord.userName || 'Unknown user',
  };
}

function getLiveFeedMeta(kind: LiveFeedItem['kind']): {
  label: string;
  color: string;
  background: string;
} {
  if (kind === 'error') {
    return {
      label: 'Error',
      color: '#b91c1c',
      background: 'rgba(239, 68, 68, 0.12)',
    };
  }

  if (kind === 'pageView') {
    return {
      label: 'Page View',
      color: '#1d4ed8',
      background: 'rgba(37, 99, 235, 0.12)',
    };
  }

  return {
    label: 'Event',
    color: '#047857',
    background: 'rgba(16, 185, 129, 0.12)',
  };
}

function getRecordKey(record: ReportErrorRecord): string {
  return record.id || `${record.timestamp || 0}-${record.message || 'unknown-error'}`;
}

function formatAbsoluteTime(timestamp?: number): string {
  if (!timestamp) {
    return 'Unknown';
  }

  return new Date(timestamp).toLocaleString();
}

function normalizeBreadcrumbs(
  breadcrumbs: unknown
): Array<{
  type?: string;
  target?: string;
  timestamp?: number;
  timeSincePageLoad?: number;
}> {
  if (!Array.isArray(breadcrumbs)) {
    return [];
  }

  return breadcrumbs
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const record = entry as Record<string, unknown>;
      return {
        type: typeof record.type === 'string' ? record.type : undefined,
        target: typeof record.target === 'string' ? record.target : undefined,
        timestamp:
          typeof record.timestamp === 'number' ? record.timestamp : undefined,
        timeSincePageLoad:
          typeof record.timeSincePageLoad === 'number'
            ? record.timeSincePageLoad
            : undefined,
      };
    })
    .filter(Boolean) as Array<{
    type?: string;
    target?: string;
    timestamp?: number;
    timeSincePageLoad?: number;
  }>;
}

function formatJsonBlock(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return '{}';
  }
}

function formatLogLine(entry: {
  time?: string;
  level?: string;
  message?: string;
  data?: string | null;
}): string {
  return `[${entry.time || 'unknown'}] [${entry.level || 'log'}] ${entry.message || ''}${
    entry.data ? ` ${entry.data}` : ''
  }`.trim();
}

async function copyTextWithFallback(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall back to execCommand below.
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

const AdminReportsPage: React.FC = () => {
  const { profile, logout } = useAuth();
  const { navigateTo } = useNavigation('admin');
  const [activeTab, setActiveTab] = useState<ReportsTab>('health');
  const [reportingMode, setReportingMode] = useState<ReportingMode>('full');
  const [selectedFeatureFilter, setSelectedFeatureFilter] = useState<string | null>(
    null
  );
  const [todayErrors, setTodayErrors] = useState<ReportErrorRecord[]>([]);
  const [yesterdayErrors, setYesterdayErrors] = useState<ReportErrorRecord[]>([]);
  const [twoDaysAgoErrors, setTwoDaysAgoErrors] = useState<ReportErrorRecord[]>([]);
  const [todayEvents, setTodayEvents] = useState<ReportEventRecord[]>([]);
  const [healthLoadState, setHealthLoadState] = useState({
    todayErrors: false,
    yesterdayErrors: false,
    twoDaysAgoErrors: false,
    todayEvents: false,
  });
  const [userFilter, setUserFilter] = useState('');
  const [sortMode, setSortMode] = useState<ErrorSortOption>('newest');
  const [dateStartFilter, setDateStartFilter] = useState(getReportDateKey(2));
  const [dateEndFilter, setDateEndFilter] = useState(getReportDateKey(0));
  const [severityFilters, setSeverityFilters] = useState<Record<ErrorSeverity, boolean>>({
    crash: true,
    error: true,
    warning: true,
  });
  const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null);
  const [loadedDiagnosticBundles, setLoadedDiagnosticBundles] = useState<
    Record<string, DiagnosticBundle>
  >({});
  const [diagnosticViewerState, setDiagnosticViewerState] = useState<{
    recordKey: string;
    diagnosticUrl: string;
  } | null>(null);
  const [liveFeedItems, setLiveFeedItems] = useState<LiveFeedItem[]>([]);
  const [isLiveFeedPaused, setIsLiveFeedPaused] = useState(false);
  const [pendingLiveItems, setPendingLiveItems] = useState(0);
  const [autoPurgeDays, setAutoPurgeDays] = useState(30);
  const [oldestErrorDateKey, setOldestErrorDateKey] = useState<string | null>(null);
  const [dismissedRetentionWarningKey, setDismissedRetentionWarningKey] = useState<
    string | null
  >(null);
  const [isPurgeModalOpen, setIsPurgeModalOpen] = useState(false);
  const [purgeDaysInput, setPurgeDaysInput] = useState('');
  const [purgeInProgress, setPurgeInProgress] = useState(false);
  const [purgeResult, setPurgeResult] = useState<{
    errorRecords: number;
    eventRecords: number;
    diagnosticBundles: number;
    cutoffDate: string;
  } | null>(null);
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const liveFeedContainerRef = useRef<HTMLDivElement | null>(null);
  const liveFeedPausedRef = useRef(false);
  const liveFeedInitialLoadRef = useRef(true);

  const isSuperAdmin = profile?.role === 'super_admin';

  useEffect(() => {
    const modeRef = ref(database, '/reports/config/mode');
    const unsubscribe = onValue(modeRef, (snapshot) => {
      const value = snapshot.val();
      if (value === 'full' || value === 'errors-only' || value === 'off') {
        setReportingMode(value);
      } else {
        setReportingMode('full');
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const todayDate = getReportDateKey(0);
    const yesterdayDate = getReportDateKey(1);
    const twoDaysAgoDate = getReportDateKey(2);

    const markLoaded = (
      key: 'todayErrors' | 'yesterdayErrors' | 'twoDaysAgoErrors' | 'todayEvents'
    ) => {
      setHealthLoadState((previous) =>
        previous[key] ? previous : { ...previous, [key]: true }
      );
    };

    const unsubscribeTodayErrors = onValue(
      ref(database, `/reports/errors/${todayDate}`),
      (snapshot) => {
        setTodayErrors(snapshotToRecords<ReportErrorRecord>(snapshot.val()));
        markLoaded('todayErrors');
      }
    );

    const unsubscribeYesterdayErrors = onValue(
      ref(database, `/reports/errors/${yesterdayDate}`),
      (snapshot) => {
        setYesterdayErrors(snapshotToRecords<ReportErrorRecord>(snapshot.val()));
        markLoaded('yesterdayErrors');
      }
    );

    const unsubscribeTwoDaysAgoErrors = onValue(
      ref(database, `/reports/errors/${twoDaysAgoDate}`),
      (snapshot) => {
        setTwoDaysAgoErrors(snapshotToRecords<ReportErrorRecord>(snapshot.val()));
        markLoaded('twoDaysAgoErrors');
      }
    );

    const unsubscribeTodayEvents = onValue(
      ref(database, `/reports/events/${todayDate}`),
      (snapshot) => {
        setTodayEvents(snapshotToRecords<ReportEventRecord>(snapshot.val()));
        markLoaded('todayEvents');
      }
    );

    return () => {
      unsubscribeTodayErrors();
      unsubscribeYesterdayErrors();
      unsubscribeTwoDaysAgoErrors();
      unsubscribeTodayEvents();
    };
  }, []);

  useEffect(() => {
    const retentionRef = ref(database, '/reports/config/retention/autoPurgeDays');
    const errorsRootRef = ref(database, '/reports/errors');

    const unsubscribeRetention = onValue(retentionRef, (snapshot) => {
      const value = snapshot.val();
      if (typeof value === 'number' && Number.isFinite(value)) {
        setAutoPurgeDays(value);
        return;
      }

      setAutoPurgeDays(30);
    });

    const unsubscribeErrorsRoot = onValue(errorsRootRef, (snapshot) => {
      const value = snapshot.val();
      if (!value || typeof value !== 'object') {
        setOldestErrorDateKey(null);
        return;
      }

      const keys = Object.keys(value).sort();
      setOldestErrorDateKey(keys[0] || null);
    });

    return () => {
      if (typeof unsubscribeRetention === 'function') {
        unsubscribeRetention();
      }

      if (typeof unsubscribeErrorsRoot === 'function') {
        unsubscribeErrorsRoot();
      }
    };
  }, []);

  useEffect(() => {
    liveFeedPausedRef.current = isLiveFeedPaused;
  }, [isLiveFeedPaused]);

  useEffect(() => {
    const todayDate = getReportDateKey(0);
    const liveErrorsQuery = query(
      ref(database, `/reports/errors/${todayDate}`),
      limitToLast(50)
    );
    const liveEventsQuery = query(
      ref(database, `/reports/events/${todayDate}`),
      limitToLast(50)
    );

    const handleLiveItem = (
      source: 'error' | 'event',
      id: string,
      payload: ReportErrorRecord | ReportEventRecord
    ) => {
      const item = buildLiveFeedItem(source, id, payload);
      if (!item) {
        return;
      }

      setLiveFeedItems((previous) => [item, ...previous].slice(0, 100));

      if (liveFeedInitialLoadRef.current) {
        return;
      }

      if (liveFeedPausedRef.current) {
        setPendingLiveItems((previous) => previous + 1);
        return;
      }

      window.requestAnimationFrame(() => {
        liveFeedContainerRef.current?.scrollTo({
          top: 0,
          behavior: 'smooth',
        });
      });
    };

    const unsubscribeErrors = onChildAdded(liveErrorsQuery, (snapshot) => {
      handleLiveItem(
        'error',
        snapshot.key || `error-${Date.now()}`,
        snapshot.val() as ReportErrorRecord
      );
    });

    const unsubscribeEvents = onChildAdded(liveEventsQuery, (snapshot) => {
      handleLiveItem(
        'event',
        snapshot.key || `event-${Date.now()}`,
        snapshot.val() as ReportEventRecord
      );
    });

    const readyTimeout = window.setTimeout(() => {
      liveFeedInitialLoadRef.current = false;
    }, 0);

    return () => {
      window.clearTimeout(readyTimeout);
      liveFeedInitialLoadRef.current = true;
      off(liveErrorsQuery);
      off(liveEventsQuery);

      if (typeof unsubscribeErrors === 'function') {
        unsubscribeErrors();
      }

      if (typeof unsubscribeEvents === 'function') {
        unsubscribeEvents();
      }
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    await sessionStore.remove('isAdmin');
    navigateTo('LOGIN', {}, { reason: 'admin_logout', replace: true });
  };

  const handleSidebarNavigate = (page: string) => {
    const pageRoutes: Record<string, string> = {
      dashboard: 'ADMIN_DASHBOARD',
      materials: 'ADMIN_MATERIALS',
      users: 'ADMIN_USERS',
      courses: 'ADMIN_COURSES',
      classes: 'ADMIN_CLASSES',
      sessions: 'ADMIN_SESSIONS',
      settings: 'ADMIN_SETTINGS',
      backup: 'ADMIN_BACKUP',
      reports: 'ADMIN_REPORTS',
    };

    const route = pageRoutes[page];
    if (route) {
      navigateTo(route as never, {}, { reason: `admin_nav_${page}` });
    }
  };

  const handleCopyForAntigravity = async (record: ReportErrorRecord) => {
    const recordKey = getRecordKey(record);
    const bundle = loadedDiagnosticBundles[recordKey];
    const breadcrumbs =
      bundle?.breadcrumbs?.length
        ? bundle.breadcrumbs
        : normalizeBreadcrumbs(record.breadcrumbs);
    const inlineLogs = bundle?.diagnosticLogs?.length
      ? bundle.diagnosticLogs.map((entry) => formatLogLine(entry))
      : [];
    let diagnosticLogSectionNote = '';

    if (inlineLogs.length === 0) {
      diagnosticLogSectionNote =
        "Note: These logs are from the admin's current session. For the original user's logs, see the Full Diagnostic Bundle URL below.";

      try {
        const { getDiagnosticLogger } = await import('../utils/diagnosticLogger');
        const adminLogs = getDiagnosticLogger()
          ?.getLogs()
          ?.slice(-50)
          ?.map((entry: { time?: string; level?: string; message?: string; data?: string | null }) =>
            formatLogLine(entry)
          );

        if (adminLogs?.length) {
          inlineLogs.push(...adminLogs);
        }
      } catch {
        inlineLogs.push('Diagnostic logs unavailable.');
      }
    }

    const markdown = [
      `## Error Report [ERR-${record.id || 'unknown'}]`,
      '',
      `- Feature: ${getFeatureName(record.feature)}`,
      `- Severity: ${getSeverityMeta(record.severity).label}`,
      `- User: ${record.userName || 'Unknown user'} (${record.userRole || 'unknown'})`,
      `- Page: ${record.page || 'Unknown page'}`,
      `- Timestamp: ${formatAbsoluteTime(record.timestamp)}`,
      '',
      '### Error',
      bundle?.error?.message || record.message || 'No message captured',
      '',
      bundle?.error?.stack || record.stack || 'No stack trace available',
      '',
      '### Component Stack',
      bundle?.error?.componentStack || record.componentStack || 'Not available',
      '',
      '### Context Data (Samples)',
      '```json',
      formatJsonBlock(record.contextData),
      '```',
      '',
      '### Last 10 User Actions (Breadcrumbs)',
      breadcrumbs.length
        ? breadcrumbs
            .map(
              (entry, index) =>
                `${index + 1}. ${formatAbsoluteTime(entry.timestamp)} | ${
                  entry.type || 'event'
                } | ${entry.target || 'Unknown target'}`
            )
            .join('\n')
        : 'No breadcrumb trail captured.',
      '',
      '### Environment',
      `- Browser: ${bundle?.environment?.browser || record.browser || 'Unknown'}`,
      `- Screen: ${
        bundle?.environment?.screenSize || record.screenSize || 'Unknown'
      }`,
      `- Build: ${
        bundle?.environment?.buildVersion ||
        import.meta.env.VITE_BUILD_VERSION ||
        'unknown'
      }`,
      '',
      '### Recent Diagnostic Logs (Last 50 Entries)',
      diagnosticLogSectionNote,
      inlineLogs.length ? inlineLogs.join('\n') : 'No diagnostic logs available.',
      '',
      '### Full Diagnostic Bundle URL',
      record.diagnosticUrl === 'upload-failed'
        ? 'Upload failed'
        : record.diagnosticUrl || 'Unavailable',
      '',
      'Diagnose this error and suggest a fix. Include the likely root cause, affected code path, and concrete remediation steps.',
    ]
      .filter((section) => section !== '')
      .join('\n');

    const copied = await copyTextWithFallback(markdown);

    if (copied) {
      toast.success('Copied to clipboard. Error report ready for Antigravity.');
      return;
    }

    toast.error('Failed to copy error report.');
  };

  const handleResumeLiveFeed = () => {
    setIsLiveFeedPaused(false);
    setPendingLiveItems(0);
    window.requestAnimationFrame(() => {
      liveFeedContainerRef.current?.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    });
  };

  const openPurgeModal = () => {
    setPurgeDaysInput(String(autoPurgeDays));
    setPurgeResult(null);
    setPurgeError(null);
    setIsPurgeModalOpen(true);
  };

  const closePurgeModal = () => {
    if (purgeInProgress) {
      return;
    }

    setIsPurgeModalOpen(false);
  };

  const handleConfirmPurge = async () => {
    const parsedDays = Number(purgeDaysInput || autoPurgeDays);
    if (!Number.isFinite(parsedDays) || parsedDays <= 0) {
      setPurgeError('Enter a valid number of retention days before purging.');
      return;
    }

    setPurgeInProgress(true);
    setPurgeError(null);
    setPurgeResult(null);

    try {
      const cutoffDate = getReportDateKey(parsedDays);
      const errorsSnapshot = await get(ref(database, '/reports/errors'));
      const eventsSnapshot = await get(ref(database, '/reports/events'));
      const errorsByDate =
        errorsSnapshot.val() && typeof errorsSnapshot.val() === 'object'
          ? (errorsSnapshot.val() as Record<string, Record<string, unknown>>)
          : {};
      const eventsByDate =
        eventsSnapshot.val() && typeof eventsSnapshot.val() === 'object'
          ? (eventsSnapshot.val() as Record<string, Record<string, unknown>>)
          : {};
      const errorDateKeys = Object.keys(errorsByDate).filter((key) => key < cutoffDate);
      const eventDateKeys = Object.keys(eventsByDate).filter((key) => key < cutoffDate);
      const errorRecords = errorDateKeys.reduce(
        (total, key) => total + Object.keys(errorsByDate[key] || {}).length,
        0
      );
      const eventRecords = eventDateKeys.reduce(
        (total, key) => total + Object.keys(eventsByDate[key] || {}).length,
        0
      );

      await Promise.all([
        ...errorDateKeys.map((key) => remove(ref(database, `/reports/errors/${key}`))),
        ...eventDateKeys.map((key) => remove(ref(database, `/reports/events/${key}`))),
      ]);

      let diagnosticBundles = 0;
      const workerUrl = import.meta.env.VITE_BACKUP_WORKER_URL;
      const authUser = getAuth().currentUser;

      if (workerUrl && authUser) {
        const token = await authUser.getIdToken();
        const response = await fetch(`${workerUrl}/api/purge-diagnostics`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ cutoffDate }),
        });

        if (!response.ok) {
          throw new Error(`Diagnostic purge failed with HTTP ${response.status}`);
        }

        const result = await response.json();
        diagnosticBundles =
          typeof result.deletedCount === 'number' ? result.deletedCount : 0;
      }

      setPurgeResult({
        errorRecords,
        eventRecords,
        diagnosticBundles,
        cutoffDate,
      });
    } catch (error) {
      setPurgeError(
        error instanceof Error ? error.message : 'Failed to purge old reporting data.'
      );
    } finally {
      setPurgeInProgress(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Access Denied</h2>
        <p>This page is only accessible to super administrators.</p>
      </div>
    );
  }

  const currentTab = TAB_DEFINITIONS.find((tab) => tab.id === activeTab) || TAB_DEFINITIONS[0];
  const featureHealthRows = buildFeatureHealthRows(
    [...todayErrors, ...yesterdayErrors],
    todayEvents
  );
  const recentErrorRecords = [...todayErrors, ...yesterdayErrors, ...twoDaysAgoErrors];
  const healthDataReady =
    healthLoadState.todayErrors &&
    healthLoadState.yesterdayErrors &&
    healthLoadState.todayEvents;
  const errorLogDataReady =
    healthLoadState.todayErrors &&
    healthLoadState.yesterdayErrors &&
    healthLoadState.twoDaysAgoErrors;
  const healthSummary = {
    green: featureHealthRows.filter((row) => row.status === 'green').length,
    yellow: featureHealthRows.filter((row) => row.status === 'yellow').length,
    red: featureHealthRows.filter((row) => row.status === 'red').length,
    totalErrors24h: featureHealthRows.reduce(
      (total, row) => total + row.errors24h,
      0
    ),
    totalUsage24h: featureHealthRows.reduce(
      (total, row) => total + row.usage24h,
      0
    ),
  };
  const selectedFeatureName =
    FEATURE_REGISTRY.find((feature) => feature.id === selectedFeatureFilter)?.name ||
    selectedFeatureFilter;
  const hasInvalidDateRange =
    Boolean(dateStartFilter) &&
    Boolean(dateEndFilter) &&
    dateStartFilter > dateEndFilter;
  const filteredErrorRecords = recentErrorRecords
    .filter((record) => {
      const severity = record.severity || 'error';

      if (!severityFilters[severity]) {
        return false;
      }

      if (selectedFeatureFilter && record.feature !== selectedFeatureFilter) {
        return false;
      }

      if (
        userFilter &&
        !(record.userName || '')
          .toLowerCase()
          .includes(userFilter.trim().toLowerCase())
      ) {
        return false;
      }

      if (hasInvalidDateRange) {
        return false;
      }

      if (typeof record.timestamp !== 'number') {
        return false;
      }

      if (dateStartFilter) {
        const startBoundary = new Date(`${dateStartFilter}T00:00:00.000Z`).getTime();
        if (record.timestamp < startBoundary) {
          return false;
        }
      }

      if (dateEndFilter) {
        const endBoundary = new Date(`${dateEndFilter}T23:59:59.999Z`).getTime();
        if (record.timestamp > endBoundary) {
          return false;
        }
      }

      return true;
    })
    .sort((left, right) => {
      if (sortMode === 'frequency') {
        return (
          (right.duplicateCount || 1) - (left.duplicateCount || 1) ||
          (right.timestamp || 0) - (left.timestamp || 0)
        );
      }

      return (right.timestamp || 0) - (left.timestamp || 0);
    });
  const errorSummary = {
    crashes: filteredErrorRecords.filter((record) => record.severity === 'crash').length,
    warnings: filteredErrorRecords.filter((record) => record.severity === 'warning').length,
    uniqueUsers: new Set(
      filteredErrorRecords.map((record) => record.userName || 'Unknown user')
    ).size,
  };
  const featureFilterOptions = [
    { value: 'all', label: 'All features' },
    ...FEATURE_REGISTRY.map((feature) => ({
      value: feature.id,
      label: feature.name,
    })),
  ];
  const sortOptions = [
    { value: 'newest', label: 'Newest first' },
    { value: 'frequency', label: 'By frequency' },
  ];
  const severityOptionList: Array<{
    key: ErrorSeverity;
    label: string;
    color: string;
  }> = [
    { key: 'crash', label: 'Crash', color: '#b91c1c' },
    { key: 'error', label: 'Error', color: '#c2410c' },
    { key: 'warning', label: 'Warning', color: '#b45309' },
  ];
  const activeDiagnosticRecord =
    recentErrorRecords.find(
      (record) => getRecordKey(record) === diagnosticViewerState?.recordKey
    ) || null;
  const liveFeedSummary = {
    errors: liveFeedItems.filter((item) => item.kind === 'error').length,
    pageViews: liveFeedItems.filter((item) => item.kind === 'pageView').length,
    actions: liveFeedItems.filter((item) => item.kind === 'action').length,
  };
  const oldestErrorTimestamp = oldestErrorDateKey
    ? new Date(`${oldestErrorDateKey}T00:00:00.000Z`).getTime()
    : null;
  const hasRetentionWarning = Boolean(
    oldestErrorTimestamp && oldestErrorTimestamp < Date.now() - autoPurgeDays * DAY_MS
  );
  const retentionWarningKey = hasRetentionWarning
    ? `${oldestErrorDateKey || 'none'}:${autoPurgeDays}`
    : null;
  const modeBadge = {
    full: {
      label: 'Full',
      detail: 'RTDB + diagnostics + analytics',
      color: '#047857',
      background: 'rgba(16, 185, 129, 0.12)',
    },
    'errors-only': {
      label: 'Errors Only',
      detail: 'Error reporting is active, event tracking is reduced',
      color: '#b45309',
      background: 'rgba(245, 158, 11, 0.14)',
    },
    off: {
      label: 'Off',
      detail: 'Reporting collection is disabled by config',
      color: '#b91c1c',
      background: 'rgba(239, 68, 68, 0.14)',
    },
  }[reportingMode];
  const shellMetrics = [
    {
      label: 'Pipeline',
      value: modeBadge.label,
      detail: modeBadge.detail,
      icon: <IconShieldCheck size={20} />,
      color: modeBadge.color,
    },
    {
      label: 'Errors (24h)',
      value: String(healthSummary.totalErrors24h),
      detail: `${healthSummary.red} critical features, ${healthSummary.yellow} warning features`,
      icon: <IconAlertTriangle size={20} />,
      color: '#dc2626',
    },
    {
      label: 'Action Usage (24h)',
      value: String(healthSummary.totalUsage24h),
      detail: `${featureHealthRows.filter((row) => row.usage24h > 0).length} active features today`,
      icon: <IconHeartbeat size={20} />,
      color: '#059669',
    },
  ];

  return (
    <AdminLayout
      pageTitle="Production Reports"
      currentPage="reports"
      onNavigate={handleSidebarNavigate}
      onLogout={handleLogout}
      userRole={profile?.role}
    >
      <div className="admin-reports-page" style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <Card
          variant="glass"
          className="admin-reports-shell-card"
          style={{ padding: '1.75rem', marginBottom: '1.5rem' }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.35rem 0.8rem',
                  borderRadius: '999px',
                  background: 'rgba(37, 99, 235, 0.08)',
                  color: '#1d4ed8',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  letterSpacing: '0.02em',
                  marginBottom: '1rem',
                }}
              >
                <IconShieldCheck size={16} />
                Production Observability
              </div>
              <h1
                style={{
                  margin: 0,
                  fontSize: '2rem',
                  fontWeight: 800,
                  color: '#0f172a',
                }}
              >
                Production Reports
              </h1>
              <p
                style={{
                  margin: '0.75rem 0 0',
                  maxWidth: '760px',
                  color: '#475569',
                  lineHeight: 1.6,
                }}
              >
                This workspace is the admin shell for feature health, production errors,
                and real-time telemetry. Each tab below is wired as a dedicated surface so
                we can build the dashboards without changing the surrounding navigation.
              </p>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  flexWrap: 'wrap',
                  marginTop: '1rem',
                }}
              >
                <Button
                  variant="glass"
                  icon={<IconArrowLeft size={18} />}
                  onClick={() =>
                    navigateTo('ADMIN_DASHBOARD', {}, { reason: 'reports_back' })
                  }
                >
                  Back to Dashboard
                </Button>
                <Button variant="danger" onClick={openPurgeModal}>
                  Purge Old Data
                </Button>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    padding: '0.55rem 0.85rem',
                    borderRadius: '999px',
                    background: modeBadge.background,
                    color: modeBadge.color,
                    fontWeight: 700,
                  }}
                >
                  <span
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '999px',
                      background: modeBadge.color,
                      flexShrink: 0,
                    }}
                  />
                  <span>{modeBadge.label}</span>
                  <span style={{ color: '#475569', fontWeight: 600 }}>
                    {modeBadge.detail}
                  </span>
                </div>
              </div>
            </div>
            <div
              style={{
                minWidth: '220px',
                padding: '1rem 1.1rem',
                borderRadius: '18px',
                background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.92), rgba(37, 99, 235, 0.88))',
                color: '#e2e8f0',
                boxShadow: '0 20px 45px rgba(15, 23, 42, 0.18)',
              }}
            >
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.8 }}>
                Active Surface
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '1.15rem', fontWeight: 700 }}>
                {currentTab.label}
              </div>
              <p style={{ margin: '0.65rem 0 0', lineHeight: 1.5, fontSize: '0.9rem', opacity: 0.9 }}>
                {currentTab.summary}
              </p>
            </div>
          </div>
        </Card>

        {hasRetentionWarning &&
          retentionWarningKey &&
          dismissedRetentionWarningKey !== retentionWarningKey && (
            <Card
              variant="glass"
              className="admin-reports-retention-banner"
              style={{
                padding: '1rem 1.25rem',
                marginBottom: '1.5rem',
                border: '1px solid rgba(245, 158, 11, 0.24)',
                background: 'rgba(255, 251, 235, 0.92)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '1rem',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, color: '#b45309' }}>
                    Data retention warning
                  </div>
                  <p style={{ margin: '0.45rem 0 0', color: '#92400e', lineHeight: 1.6 }}>
                    Data older than {autoPurgeDays} days exists. Consider purging.
                    Oldest current error bucket: {oldestErrorDateKey}.
                  </p>
                </div>
                <Button
                  variant="glass"
                  onClick={() => setDismissedRetentionWarningKey(retentionWarningKey)}
                >
                  Dismiss
                </Button>
              </div>
            </Card>
          )}

        <div
          className="admin-reports-health-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          {shellMetrics.map((metric) => (
            <Card key={metric.label} variant="glass" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.9rem' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: `${metric.color}15`,
                    color: metric.color,
                    flexShrink: 0,
                  }}
                >
                  {metric.icon}
                </div>
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {metric.label}
                  </div>
                  <div style={{ marginTop: '0.35rem', fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>
                    {metric.value}
                  </div>
                  <p style={{ margin: '0.45rem 0 0', color: '#475569', lineHeight: 1.5 }}>
                    {metric.detail}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div
          className="admin-reports-tab-bar"
          style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}
        >
          {TAB_DEFINITIONS.map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? 'primary' : 'glass'}
              className={`admin-reports-tab${activeTab === tab.id ? ' is-active' : ''}`}
              aria-label={`Show ${tab.label} reporting section`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                {tab.icon}
                {tab.label}
              </span>
            </Button>
          ))}
        </div>

        <Card
          variant="glass"
          className="admin-reports-section-card"
          style={{ padding: '1.5rem', marginBottom: '1.25rem' }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.9rem' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: `${currentTab.accent}14`,
                color: currentTab.accent,
                flexShrink: 0,
              }}
            >
              {currentTab.icon}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: '#0f172a' }}>
                {currentTab.label}
              </h2>
              <p style={{ margin: '0.55rem 0 0', color: '#475569', lineHeight: 1.6 }}>
                {currentTab.description}
              </p>
            </div>
          </div>
        </Card>

        {activeTab === 'health' && (
          <>
            {!healthDataReady ? (
              <Card variant="glass" className="admin-reports-section-card" style={{ padding: '1.5rem' }}>
                <h3 style={{ marginTop: 0, marginBottom: '0.75rem', color: '#0f172a' }}>
                  Loading Feature Health
                </h3>
                <p style={{ margin: 0, color: '#475569', lineHeight: 1.6 }}>
                  Reading today and yesterday&apos;s reporting streams to build the
                  24-hour feature health dashboard.
                </p>
              </Card>
            ) : (
              <>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '1rem',
                    marginBottom: '1rem',
                  }}
                >
                  {[
                    {
                      label: 'Healthy',
                      value: healthSummary.green,
                      detail: 'Features with zero 24h errors',
                      color: '#047857',
                    },
                    {
                      label: 'Needs Attention',
                      value: healthSummary.yellow,
                      detail: 'Features with recent errors or older crashes',
                      color: '#b45309',
                    },
                    {
                      label: 'Critical',
                      value: healthSummary.red,
                      detail: 'Features with crash activity or elevated errors',
                      color: '#b91c1c',
                    },
                    {
                      label: 'Action Events',
                      value: healthSummary.totalUsage24h,
                      detail: 'Tracked feature actions in the last 24 hours',
                      color: '#2563eb',
                    },
                  ].map((metric) => (
                    <Card key={metric.label} variant="glass" style={{ padding: '1.25rem' }}>
                      <div
                        style={{
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          color: '#64748b',
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                        }}
                      >
                        {metric.label}
                      </div>
                      <div
                        style={{
                          marginTop: '0.4rem',
                          fontSize: '1.8rem',
                          fontWeight: 800,
                          color: metric.color,
                        }}
                      >
                        {metric.value}
                      </div>
                      <p style={{ margin: '0.45rem 0 0', color: '#475569', lineHeight: 1.5 }}>
                        {metric.detail}
                      </p>
                    </Card>
                  ))}
                </div>

                <Card variant="glass" className="admin-reports-section-card" style={{ padding: '1.5rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: '1rem',
                      flexWrap: 'wrap',
                      marginBottom: '1rem',
                    }}
                  >
                    <div>
                      <h3 style={{ marginTop: 0, marginBottom: '0.5rem', color: '#0f172a' }}>
                        Feature Health Dashboard
                      </h3>
                      <p style={{ margin: 0, color: '#475569', lineHeight: 1.6 }}>
                        Click a feature row to jump into the Error Log with that feature
                        preselected for follow-up investigation.
                      </p>
                    </div>
                    <div
                      className="admin-reports-status-badge status-blue"
                      style={{
                        padding: '0.55rem 0.85rem',
                        borderRadius: '999px',
                        background: 'rgba(37, 99, 235, 0.08)',
                        color: '#1d4ed8',
                        fontWeight: 700,
                      }}
                    >
                      {featureHealthRows.length} tracked features
                    </div>
                  </div>

                  <div className="admin-reports-scroll-container" style={{ overflowX: 'auto' }}>
                    <table
                      className="admin-reports-health-table"
                      style={{ width: '100%', borderCollapse: 'collapse', minWidth: '720px' }}
                    >
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.25)' }}>
                          {['Feature Name', 'Errors (24h)', 'Last Error', 'Status', 'Usage (24h)'].map((header) => (
                            <th
                              key={header}
                              style={{
                                textAlign: 'left',
                                padding: '0.85rem 0.75rem',
                                fontSize: '0.8rem',
                                letterSpacing: '0.06em',
                                textTransform: 'uppercase',
                                color: '#64748b',
                              }}
                            >
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {featureHealthRows.map((row) => (
                          <tr
                            key={row.featureId}
                            onClick={() => {
                              setSelectedFeatureFilter(row.featureId);
                              setActiveTab('errors');
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                setSelectedFeatureFilter(row.featureId);
                                setActiveTab('errors');
                              }
                            }}
                            tabIndex={0}
                            style={{
                              cursor: 'pointer',
                              borderBottom: '1px solid rgba(226, 232, 240, 0.7)',
                              outline: 'none',
                              background:
                                selectedFeatureFilter === row.featureId
                                  ? 'rgba(37, 99, 235, 0.06)'
                                  : 'transparent',
                            }}
                          >
                            <td style={{ padding: '1rem 0.75rem' }}>
                              <div style={{ fontWeight: 700, color: '#0f172a' }}>
                                {row.featureName}
                              </div>
                              <div style={{ marginTop: '0.35rem', color: '#64748b', lineHeight: 1.5 }}>
                                {row.description}
                              </div>
                            </td>
                            <td style={{ padding: '1rem 0.75rem', fontWeight: 700, color: '#0f172a' }}>
                              {row.errors24h}
                            </td>
                            <td style={{ padding: '1rem 0.75rem', color: '#334155' }}>
                              {formatRelativeTime(row.lastError)}
                            </td>
                            <td style={{ padding: '1rem 0.75rem' }}>
                              <span
                                className={`admin-reports-status-badge status-${row.status}`}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.5rem',
                                  padding: '0.4rem 0.7rem',
                                  borderRadius: '999px',
                                  background:
                                    row.status === 'red'
                                      ? 'rgba(239, 68, 68, 0.12)'
                                      : row.status === 'yellow'
                                        ? 'rgba(245, 158, 11, 0.14)'
                                        : 'rgba(16, 185, 129, 0.12)',
                                  color:
                                    row.status === 'red'
                                      ? '#b91c1c'
                                      : row.status === 'yellow'
                                        ? '#b45309'
                                        : '#047857',
                                  fontWeight: 700,
                                }}
                              >
                                <span>{row.statusEmoji}</span>
                                <span>{row.statusLabel}</span>
                              </span>
                            </td>
                            <td style={{ padding: '1rem 0.75rem', fontWeight: 700, color: '#0f172a' }}>
                              {row.usage24h}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )}
          </>
        )}

        {activeTab === 'errors' && (
          <>
            {!errorLogDataReady ? (
              <Card variant="glass" style={{ padding: '1.5rem' }}>
                <h3 style={{ marginTop: 0, marginBottom: '0.75rem', color: '#0f172a' }}>
                  Loading Error Log
                </h3>
                <p style={{ margin: 0, color: '#475569', lineHeight: 1.6 }}>
                  Reading the last 3 days of report data so the client-side filters can
                  be applied locally.
                </p>
              </Card>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <Card
                  variant="glass"
                  className="admin-reports-section-card admin-reports-filter-controls"
                  style={{ padding: '1.5rem' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: '1rem',
                      flexWrap: 'wrap',
                      marginBottom: '1rem',
                    }}
                  >
                    <div>
                      <h3 style={{ marginTop: 0, marginBottom: '0.5rem', color: '#0f172a' }}>
                        Error Log Filters
                      </h3>
                      <p style={{ margin: 0, color: '#475569', lineHeight: 1.6 }}>
                        Filtering is client-side and currently scoped to the most recent
                        3 days of reports.
                      </p>
                    </div>
                    <Button
                      variant="glass"
                      onClick={() => {
                        setSelectedFeatureFilter(null);
                        setUserFilter('');
                        setSortMode('newest');
                        setDateStartFilter(getReportDateKey(2));
                        setDateEndFilter(getReportDateKey(0));
                        setSeverityFilters({
                          crash: true,
                          error: true,
                          warning: true,
                        });
                      }}
                    >
                      Reset Filters
                    </Button>
                  </div>

                  {selectedFeatureFilter && (
                    <div
                      className="admin-reports-filter-primer"
                      style={{
                        marginBottom: '1rem',
                        padding: '0.85rem 1rem',
                        borderRadius: '16px',
                        border: '1px solid rgba(37, 99, 235, 0.16)',
                        background: 'rgba(37, 99, 235, 0.06)',
                      }}
                    >
                      <div style={{ fontWeight: 700, color: '#1d4ed8' }}>
                        Feature Filter Primed
                      </div>
                      <p
                        style={{
                          margin: '0.45rem 0 0',
                          color: '#475569',
                          lineHeight: 1.6,
                        }}
                      >
                        {selectedFeatureName} was selected from the Feature Health
                        dashboard and is applied as the current feature filter.
                      </p>
                    </div>
                  )}

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: '1rem',
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: 'block',
                          marginBottom: '0.5rem',
                          color: '#475569',
                          fontWeight: 700,
                        }}
                      >
                        Feature
                      </label>
                      <NativeSelect
                        options={featureFilterOptions}
                        value={selectedFeatureFilter || 'all'}
                        onChange={(value) =>
                          setSelectedFeatureFilter(value === 'all' ? null : value)
                        }
                      />
                    </div>

                    <div>
                      <label
                        style={{
                          display: 'block',
                          marginBottom: '0.5rem',
                          color: '#475569',
                          fontWeight: 700,
                        }}
                      >
                        Sort
                      </label>
                      <NativeSelect
                        options={sortOptions}
                        value={sortMode}
                        onChange={(value) => setSortMode(value as ErrorSortOption)}
                      />
                    </div>

                    <Input
                      label="User Name"
                      fullWidth
                      placeholder="Filter by user name"
                      value={userFilter}
                      onChange={(event) => setUserFilter(event.target.value)}
                    />

                    <Input
                      label="Start Date"
                      fullWidth
                      type="date"
                      value={dateStartFilter}
                      onChange={(event) => setDateStartFilter(event.target.value)}
                    />

                    <Input
                      label="End Date"
                      fullWidth
                      type="date"
                      value={dateEndFilter}
                      onChange={(event) => setDateEndFilter(event.target.value)}
                    />
                  </div>

                  <div style={{ marginTop: '1rem' }}>
                    <div
                      style={{
                        color: '#475569',
                        fontWeight: 700,
                        marginBottom: '0.6rem',
                      }}
                    >
                      Severity
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.75rem',
                      }}
                    >
                      {severityOptionList.map((option) => (
                        <label
                          key={option.key}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.55rem',
                            padding: '0.65rem 0.85rem',
                            borderRadius: '999px',
                            background: severityFilters[option.key]
                              ? `${option.color}15`
                              : 'rgba(148, 163, 184, 0.12)',
                            color: severityFilters[option.key]
                              ? option.color
                              : '#64748b',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={severityFilters[option.key]}
                            onChange={(event) =>
                              setSeverityFilters((previous) => ({
                                ...previous,
                                [option.key]: event.target.checked,
                              }))
                            }
                          />
                          <span
                            style={{
                              width: '10px',
                              height: '10px',
                              borderRadius: '999px',
                              background: option.color,
                              flexShrink: 0,
                            }}
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {hasInvalidDateRange && (
                    <p style={{ margin: '1rem 0 0', color: '#b91c1c', fontWeight: 700 }}>
                      Start date must be on or before the end date.
                    </p>
                  )}
                </Card>

                <Card variant="glass" className="admin-reports-section-card" style={{ padding: '1.5rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: '1rem',
                      flexWrap: 'wrap',
                      marginBottom: '1rem',
                    }}
                  >
                    <div>
                      <h3 style={{ marginTop: 0, marginBottom: '0.5rem', color: '#0f172a' }}>
                        Recent Error Reports
                      </h3>
                      <p style={{ margin: 0, color: '#475569', lineHeight: 1.6 }}>
                        Showing {filteredErrorRecords.length} of {recentErrorRecords.length}{' '}
                        error records loaded from the last 3 days.
                      </p>
                    </div>
                    <div
                      className="admin-reports-stat-grid"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, minmax(90px, 1fr))',
                        gap: '0.75rem',
                        minWidth: '280px',
                      }}
                    >
                      {[
                        {
                          label: 'Crashes',
                          value: errorSummary.crashes,
                          color: '#b91c1c',
                        },
                        {
                          label: 'Warnings',
                          value: errorSummary.warnings,
                          color: '#b45309',
                        },
                        {
                          label: 'Users',
                          value: errorSummary.uniqueUsers,
                          color: '#1d4ed8',
                        },
                      ].map((metric) => (
                        <div
                          key={metric.label}
                          style={{
                            padding: '0.85rem',
                            borderRadius: '14px',
                            background: `${metric.color}12`,
                          }}
                        >
                          <div
                            style={{
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              color: '#64748b',
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                            }}
                          >
                            {metric.label}
                          </div>
                          <div
                            style={{
                              marginTop: '0.25rem',
                              fontSize: '1.35rem',
                              fontWeight: 800,
                              color: metric.color,
                            }}
                          >
                            {metric.value}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {filteredErrorRecords.length === 0 ? (
                    <div
                      className="admin-reports-empty-state"
                      style={{
                        padding: '1.5rem',
                        borderRadius: '18px',
                        background: 'rgba(248, 250, 252, 0.9)',
                        color: '#475569',
                      }}
                    >
                      No error records match the current filters.
                    </div>
                  ) : (
                    <div
                      className="admin-reports-error-list-shell"
                      style={{
                        borderRadius: '18px',
                        overflow: 'hidden',
                        border: '1px solid rgba(226, 232, 240, 0.9)',
                      }}
                    >
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns:
                            'minmax(0, 1.9fr) minmax(150px, 0.9fr) minmax(180px, 1fr) 120px',
                          gap: '1rem',
                          padding: '0.85rem 1rem',
                          background: 'rgba(248, 250, 252, 0.9)',
                          color: '#64748b',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                        }}
                      >
                        <div>Error</div>
                        <div>Feature</div>
                        <div>User</div>
                        <div>When</div>
                      </div>

                      {filteredErrorRecords.map((record) => {
                        const rowKey = getRecordKey(record);
                        const severityMeta = getSeverityMeta(record.severity);
                        const duplicateCount = record.duplicateCount || 1;
                        const isExpanded = expandedErrorId === rowKey;
                        const diagnosticBundle = loadedDiagnosticBundles[rowKey];
                        const breadcrumbs =
                          diagnosticBundle?.breadcrumbs?.length
                            ? diagnosticBundle.breadcrumbs
                            : normalizeBreadcrumbs(record.breadcrumbs);
                        const fullMessage =
                          diagnosticBundle?.error?.message ||
                          record.message ||
                          'No message captured';
                        const fullStack =
                          diagnosticBundle?.error?.stack ||
                          record.stack ||
                          'No stack trace available';
                        const componentStack =
                          diagnosticBundle?.error?.componentStack ||
                          record.componentStack;

                        return (
                          <React.Fragment key={rowKey}>
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() =>
                                setExpandedErrorId((previous) =>
                                  previous === rowKey ? null : rowKey
                                )
                              }
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  setExpandedErrorId((previous) =>
                                    previous === rowKey ? null : rowKey
                                  );
                                }
                              }}
                              className={`admin-reports-error-row severity-${record.severity || 'error'}${isExpanded ? ' is-expanded' : ''}`}
                              style={{
                                display: 'grid',
                                gridTemplateColumns:
                                  'minmax(0, 1.9fr) minmax(150px, 0.9fr) minmax(180px, 1fr) 120px',
                                gap: '1rem',
                                padding: '1rem',
                                alignItems: 'center',
                                borderTop: '1px solid rgba(226, 232, 240, 0.9)',
                                background: isExpanded
                                  ? 'rgba(248, 250, 252, 0.95)'
                                  : 'rgba(255, 255, 255, 0.82)',
                                cursor: 'pointer',
                                outline: 'none',
                              }}
                            >
                              <div style={{ minWidth: 0 }}>
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.6rem',
                                    flexWrap: 'wrap',
                                  }}
                                >
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.45rem',
                                      padding: '0.35rem 0.7rem',
                                      borderRadius: '999px',
                                      background: severityMeta.background,
                                      color: severityMeta.color,
                                      fontWeight: 700,
                                    }}
                                  >
                                    <span
                                      style={{
                                        width: '10px',
                                        height: '10px',
                                        borderRadius: '999px',
                                        background: severityMeta.color,
                                        flexShrink: 0,
                                      }}
                                    />
                                    <span>{severityMeta.label}</span>
                                  </span>
                                  {duplicateCount > 1 && (
                                    <span
                                      className="admin-reports-duplicate-badge"
                                      style={{
                                        background: '#4b5563',
                                        color: '#ffffff',
                                        borderRadius: '12px',
                                        padding: '2px 8px',
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                      }}
                                    >
                                      x{duplicateCount}
                                    </span>
                                  )}
                                </div>
                                <div
                                  style={{
                                    marginTop: '0.65rem',
                                    fontSize: '0.98rem',
                                    fontWeight: 700,
                                    color: '#0f172a',
                                  }}
                                >
                                  {truncateText(record.message, 100)}
                                </div>
                                <div
                                  style={{
                                    marginTop: '0.35rem',
                                    color: '#64748b',
                                    lineHeight: 1.5,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {record.page || 'Unknown page'}
                                </div>
                              </div>

                              <div style={{ color: '#0f172a', fontWeight: 700 }}>
                                {getFeatureName(record.feature)}
                              </div>

                              <div>
                                <div style={{ color: '#0f172a', fontWeight: 700 }}>
                                  {record.userName || 'Unknown user'}
                                </div>
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    marginTop: '0.4rem',
                                    padding: '0.3rem 0.65rem',
                                    borderRadius: '999px',
                                    background: 'rgba(15, 23, 42, 0.08)',
                                    color: '#334155',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    textTransform: 'capitalize',
                                  }}
                                >
                                  {(record.userRole || 'unknown').replace(/_/g, ' ')}
                                </span>
                              </div>

                              <div style={{ color: '#334155', fontWeight: 700 }}>
                                {formatRelativeTime(record.timestamp || null)}
                              </div>
                            </div>

                            {isExpanded && (
                              <div
                                className="admin-reports-error-panel"
                                style={{
                                  padding: '1.2rem',
                                  borderTop: '1px solid rgba(226, 232, 240, 0.9)',
                                  background: 'rgba(248, 250, 252, 0.92)',
                                }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'flex-start',
                                    gap: '1rem',
                                    flexWrap: 'wrap',
                                    marginBottom: '1rem',
                                  }}
                                >
                                  <div>
                                    <h4
                                      style={{
                                        margin: 0,
                                        fontSize: '1.05rem',
                                        color: '#0f172a',
                                      }}
                                    >
                                      Expanded Error Details
                                    </h4>
                                    <p
                                      style={{
                                        margin: '0.45rem 0 0',
                                        color: '#64748b',
                                        lineHeight: 1.6,
                                      }}
                                    >
                                      Full message, stack trace, breadcrumbs, user
                                      context, and diagnostic actions.
                                    </p>
                                  </div>
                                  <div
                                    style={{
                                      display: 'flex',
                                      gap: '0.75rem',
                                      flexWrap: 'wrap',
                                    }}
                                  >
                                    {record.diagnosticUrl &&
                                      record.diagnosticUrl !== 'upload-failed' && (
                                        <Button
                                          variant="glass"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            setDiagnosticViewerState({
                                              recordKey: rowKey,
                                              diagnosticUrl: record.diagnosticUrl || '',
                                            });
                                          }}
                                        >
                                          View Full Diagnostic
                                        </Button>
                                      )}
                                    <Button
                                      variant="glass"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void handleCopyForAntigravity(record);
                                      }}
                                    >
                                      Copy for Antigravity
                                    </Button>
                                  </div>
                                </div>

                                <div
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                                    gap: '1rem',
                                  }}
                                >
                                  <Card variant="glass" style={{ padding: '1rem' }}>
                                    <h4 style={{ marginTop: 0, color: '#0f172a' }}>
                                      Error
                                    </h4>
                                    <div
                                      style={{
                                        color: '#334155',
                                        lineHeight: 1.7,
                                        whiteSpace: 'pre-wrap',
                                      }}
                                    >
                                      {fullMessage}
                                    </div>

                                    <h4
                                      style={{
                                        marginBottom: '0.65rem',
                                        marginTop: '1rem',
                                        color: '#0f172a',
                                      }}
                                    >
                                      Stack Trace
                                    </h4>
                                    <pre
                                      style={{
                                        margin: 0,
                                        padding: '0.85rem',
                                        borderRadius: '14px',
                                        background: 'rgba(15, 23, 42, 0.06)',
                                        color: '#334155',
                                        overflowX: 'auto',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word',
                                      }}
                                    >
                                      {fullStack}
                                    </pre>

                                    {componentStack && (
                                      <>
                                        <h4
                                          style={{
                                            marginBottom: '0.65rem',
                                            marginTop: '1rem',
                                            color: '#0f172a',
                                          }}
                                        >
                                          Component Stack
                                        </h4>
                                        <pre
                                          style={{
                                            margin: 0,
                                            padding: '0.85rem',
                                            borderRadius: '14px',
                                            background: 'rgba(15, 23, 42, 0.06)',
                                            color: '#334155',
                                            overflowX: 'auto',
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-word',
                                          }}
                                        >
                                          {componentStack}
                                        </pre>
                                      </>
                                    )}
                                  </Card>

                                  <Card variant="glass" style={{ padding: '1rem' }}>
                                    <h4 style={{ marginTop: 0, color: '#0f172a' }}>
                                      User Details
                                    </h4>
                                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                                      {[
                                        {
                                          label: 'User ID',
                                          value: record.userId || 'Unknown',
                                        },
                                        {
                                          label: 'Name',
                                          value: record.userName || 'Unknown user',
                                        },
                                        {
                                          label: 'Role',
                                          value: (record.userRole || 'unknown').replace(
                                            /_/g,
                                            ' '
                                          ),
                                        },
                                      ].map((item) => (
                                        <div key={item.label}>
                                          <div
                                            style={{
                                              fontSize: '0.78rem',
                                              color: '#64748b',
                                              fontWeight: 700,
                                              textTransform: 'uppercase',
                                              letterSpacing: '0.05em',
                                            }}
                                          >
                                            {item.label}
                                          </div>
                                          <div
                                            style={{
                                              marginTop: '0.2rem',
                                              color: '#0f172a',
                                              lineHeight: 1.5,
                                            }}
                                          >
                                            {item.value}
                                          </div>
                                        </div>
                                      ))}
                                    </div>

                                    <h4
                                      style={{
                                        marginBottom: '0.65rem',
                                        marginTop: '1rem',
                                        color: '#0f172a',
                                      }}
                                    >
                                      Environment
                                    </h4>
                                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                                      {[
                                        {
                                          label: 'Browser',
                                          value:
                                            diagnosticBundle?.environment?.browser ||
                                            record.browser ||
                                            'Unknown',
                                        },
                                        {
                                          label: 'Screen',
                                          value:
                                            diagnosticBundle?.environment
                                              ?.screenSize ||
                                            record.screenSize ||
                                            'Unknown',
                                        },
                                        {
                                          label: 'Captured At',
                                          value: formatAbsoluteTime(record.timestamp),
                                        },
                                      ].map((item) => (
                                        <div key={item.label}>
                                          <div
                                            style={{
                                              fontSize: '0.78rem',
                                              color: '#64748b',
                                              fontWeight: 700,
                                              textTransform: 'uppercase',
                                              letterSpacing: '0.05em',
                                            }}
                                          >
                                            {item.label}
                                          </div>
                                          <div
                                            style={{
                                              marginTop: '0.2rem',
                                              color: '#0f172a',
                                              lineHeight: 1.5,
                                            }}
                                          >
                                            {item.value}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </Card>

                                  <Card
                                    variant="glass"
                                    style={{ padding: '1rem', gridColumn: '1 / -1' }}
                                  >
                                    <h4 style={{ marginTop: 0, color: '#0f172a' }}>
                                      Breadcrumbs
                                    </h4>
                                    {!breadcrumbs.length ? (
                                      <p
                                        style={{
                                          margin: 0,
                                          color: '#475569',
                                          lineHeight: 1.6,
                                        }}
                                      >
                                        No breadcrumb trail was captured for this error.
                                      </p>
                                    ) : (
                                      <ol
                                        style={{
                                          margin: '0.75rem 0 0',
                                          paddingLeft: '1.25rem',
                                          color: '#334155',
                                        }}
                                      >
                                        {breadcrumbs.map((entry, index) => (
                                          <li
                                            key={`breadcrumb-${rowKey}-${index}`}
                                            style={{ marginBottom: '0.5rem' }}
                                          >
                                            <div style={{ color: '#0f172a', fontWeight: 700 }}>
                                              {entry.type || 'event'} ·{' '}
                                              {entry.target || 'Unknown target'}
                                            </div>
                                            <div
                                              style={{
                                                color: '#64748b',
                                                fontSize: '0.85rem',
                                              }}
                                            >
                                              {formatAbsoluteTime(entry.timestamp)} · +{entry.timeSincePageLoad || 0}
                                              ms
                                            </div>
                                          </li>
                                        ))}
                                      </ol>
                                    )}
                                  </Card>

                                  <Card
                                    variant="glass"
                                    style={{ padding: '1rem', gridColumn: '1 / -1' }}
                                  >
                                    <h4 style={{ marginTop: 0, color: '#0f172a' }}>
                                      Context Data
                                    </h4>
                                    <pre
                                      style={{
                                        margin: 0,
                                        padding: '0.85rem',
                                        borderRadius: '14px',
                                        background: 'rgba(15, 23, 42, 0.06)',
                                        color: '#334155',
                                        overflowX: 'auto',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word',
                                      }}
                                    >
                                      {formatJsonBlock(record.contextData)}
                                    </pre>
                                  </Card>
                                </div>
                              </div>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )}
                </Card>
              </div>
            )}
          </>
        )}

        {activeTab === 'live' && (
          <div className="admin-reports-live-feed" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <Card variant="glass" className="admin-reports-section-card" style={{ padding: '1.5rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '1rem',
                  flexWrap: 'wrap',
                  marginBottom: '1rem',
                }}
              >
                <div>
                  <h3 style={{ marginTop: 0, marginBottom: '0.5rem', color: '#0f172a' }}>
                    Live Feed Controls
                  </h3>
                  <p style={{ margin: 0, color: '#475569', lineHeight: 1.6 }}>
                    The stream listens to the latest 50 error records and latest 50
                    event records from today, with newest items pinned to the top.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {isLiveFeedPaused ? (
                    <Button variant="glass" onClick={handleResumeLiveFeed}>
                      Resume Feed
                    </Button>
                  ) : (
                    <Button
                      variant="glass"
                      onClick={() => setIsLiveFeedPaused(true)}
                    >
                      Pause Feed
                    </Button>
                  )}
                  {isLiveFeedPaused && pendingLiveItems > 0 && (
                    <button
                      type="button"
                      onClick={handleResumeLiveFeed}
                      style={{
                        border: 'none',
                        borderRadius: '999px',
                        padding: '0.7rem 1rem',
                        background: 'rgba(37, 99, 235, 0.12)',
                        color: '#1d4ed8',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {pendingLiveItems} new events
                    </button>
                  )}
                </div>
              </div>

              <div
                className="admin-reports-stat-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '1rem',
                }}
              >
                {[
                  {
                    label: 'Errors',
                    value: liveFeedSummary.errors,
                    color: '#b91c1c',
                  },
                  {
                    label: 'Actions',
                    value: liveFeedSummary.actions,
                    color: '#047857',
                  },
                  {
                    label: 'Page Views',
                    value: liveFeedSummary.pageViews,
                    color: '#1d4ed8',
                  },
                  {
                    label: 'Feed State',
                    value: isLiveFeedPaused ? 'Paused' : 'Live',
                    color: isLiveFeedPaused ? '#b45309' : '#047857',
                  },
                ].map((metric) => (
                  <div
                    key={metric.label}
                    style={{
                      padding: '1rem',
                      borderRadius: '16px',
                      background: `${metric.color}12`,
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        color: '#64748b',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {metric.label}
                    </div>
                    <div
                      style={{
                        marginTop: '0.3rem',
                        fontSize: '1.35rem',
                        fontWeight: 800,
                        color: metric.color,
                      }}
                    >
                      {metric.value}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card variant="glass" className="admin-reports-section-card" style={{ padding: '1.25rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '1rem',
                  flexWrap: 'wrap',
                  marginBottom: '1rem',
                }}
              >
                <div>
                  <h3 style={{ marginTop: 0, marginBottom: '0.5rem', color: '#0f172a' }}>
                    Event Timeline
                  </h3>
                  <p style={{ margin: 0, color: '#475569', lineHeight: 1.6 }}>
                    New entries are prepended to the stream. When the feed is paused,
                    they continue to accumulate without auto-scrolling.
                  </p>
                </div>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.55rem',
                    padding: '0.5rem 0.8rem',
                    borderRadius: '999px',
                    background: isLiveFeedPaused
                      ? 'rgba(245, 158, 11, 0.14)'
                      : 'rgba(16, 185, 129, 0.12)',
                    color: isLiveFeedPaused ? '#b45309' : '#047857',
                    fontWeight: 700,
                  }}
                >
                  <span
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '999px',
                      background: isLiveFeedPaused ? '#b45309' : '#047857',
                    }}
                  />
                  {isLiveFeedPaused ? 'Paused' : 'Streaming'}
                </div>
              </div>

              <div
                ref={liveFeedContainerRef}
                className="admin-reports-scroll-container admin-reports-live-feed-stream"
                style={{
                  maxHeight: '560px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  paddingRight: '0.35rem',
                }}
              >
                {liveFeedItems.length === 0 ? (
                  <div
                    className="admin-reports-empty-state"
                    style={{
                      padding: '1.5rem',
                      borderRadius: '16px',
                      background: 'rgba(248, 250, 252, 0.9)',
                      color: '#475569',
                    }}
                  >
                    Waiting for live report events from today&apos;s stream.
                  </div>
                ) : (
                  liveFeedItems.map((item) => {
                    const meta = getLiveFeedMeta(item.kind);

                    return (
                      <div
                        key={item.id}
                        className={`admin-reports-live-feed-item kind-${item.kind}`}
                        style={{
                          padding: '1rem',
                          borderRadius: '18px',
                          background: 'rgba(255, 255, 255, 0.85)',
                          border: '1px solid rgba(226, 232, 240, 0.9)',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '0.75rem',
                            flexWrap: 'wrap',
                          }}
                        >
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.45rem',
                              padding: '0.35rem 0.7rem',
                              borderRadius: '999px',
                              background: meta.background,
                              color: meta.color,
                              fontWeight: 700,
                            }}
                          >
                            <span
                              style={{
                                width: '10px',
                                height: '10px',
                                borderRadius: '999px',
                                background: meta.color,
                                flexShrink: 0,
                              }}
                            />
                            {meta.label}
                          </span>
                          <span style={{ color: '#64748b', fontWeight: 700 }}>
                            {formatAbsoluteTime(item.timestamp)}
                          </span>
                        </div>
                        <div
                          style={{
                            marginTop: '0.7rem',
                            color: '#0f172a',
                            fontWeight: 700,
                            lineHeight: 1.6,
                          }}
                        >
                          {item.message}
                        </div>
                        <div
                          style={{
                            marginTop: '0.45rem',
                            display: 'flex',
                            gap: '0.75rem',
                            flexWrap: 'wrap',
                            color: '#64748b',
                          }}
                        >
                          <span>{item.featureName}</span>
                          <span>{item.userName}</span>
                          <span>{formatRelativeTime(item.timestamp)}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          </div>
        )}

        {isPurgeModalOpen && (
          <div
            onClick={closePurgeModal}
            className="admin-reports-purge-modal-overlay"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1150,
              background: 'rgba(15, 23, 42, 0.58)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem',
            }}
          >
            <div
              onClick={(event) => event.stopPropagation()}
              className="admin-reports-purge-modal"
              style={{
                width: '100%',
                maxWidth: '520px',
                borderRadius: '22px',
                background: 'rgba(255, 255, 255, 0.98)',
                boxShadow: '0 30px 80px rgba(15, 23, 42, 0.24)',
                padding: '1.5rem',
              }}
            >
              <h3 style={{ marginTop: 0, marginBottom: '0.6rem', color: '#0f172a' }}>
                Purge Old Reporting Data
              </h3>
              <p style={{ margin: 0, color: '#475569', lineHeight: 1.6 }}>
                Delete RTDB report buckets and diagnostic bundles older than the
                selected retention window.
              </p>

              <div style={{ marginTop: '1rem' }}>
                <Input
                  type="number"
                  label="Delete data older than ___ days"
                  value={purgeDaysInput}
                  onChange={(event) => setPurgeDaysInput(event.target.value)}
                  min={1}
                  fullWidth
                />
              </div>

              {purgeError && (
                <div
                  style={{
                    marginTop: '1rem',
                    padding: '0.85rem 1rem',
                    borderRadius: '14px',
                    background: 'rgba(239, 68, 68, 0.12)',
                    color: '#b91c1c',
                    fontWeight: 700,
                  }}
                >
                  {purgeError}
                </div>
              )}

              {purgeResult && (
                <div
                  style={{
                    marginTop: '1rem',
                    padding: '1rem',
                    borderRadius: '16px',
                    background: 'rgba(16, 185, 129, 0.1)',
                    color: '#065f46',
                  }}
                >
                  <div style={{ fontWeight: 800 }}>Purge Complete</div>
                  <p style={{ margin: '0.45rem 0 0', lineHeight: 1.6 }}>
                    Deleted {purgeResult.errorRecords} error records,{' '}
                    {purgeResult.eventRecords} events, and{' '}
                    {purgeResult.diagnosticBundles} diagnostic bundles older than{' '}
                    {purgeResult.cutoffDate}.
                  </p>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '0.75rem',
                  flexWrap: 'wrap',
                  marginTop: '1.25rem',
                }}
              >
                <Button variant="glass" onClick={closePurgeModal} disabled={purgeInProgress}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={() => void handleConfirmPurge()}
                  disabled={purgeInProgress}
                >
                  {purgeInProgress ? 'Purging...' : 'Purge'}
                </Button>
              </div>
            </div>
          </div>
        )}

        <DiagnosticViewerModal
          opened={Boolean(diagnosticViewerState)}
          diagnosticUrl={diagnosticViewerState?.diagnosticUrl || null}
          errorTitle={activeDiagnosticRecord?.message}
          errorFeature={getFeatureName(activeDiagnosticRecord?.feature)}
          errorSeverity={getSeverityMeta(activeDiagnosticRecord?.severity).label}
          onClose={() => setDiagnosticViewerState(null)}
          onCopyForAntigravity={() => {
            if (activeDiagnosticRecord) {
              void handleCopyForAntigravity(activeDiagnosticRecord);
            }
          }}
          onBundleLoaded={(bundle) => {
            if (!diagnosticViewerState?.recordKey) {
              return;
            }

            setLoadedDiagnosticBundles((previous) => ({
              ...previous,
              [diagnosticViewerState.recordKey]: bundle,
            }));
          }}
        />
      </div>
    </AdminLayout>
  );
};

export default AdminReportsPage;
