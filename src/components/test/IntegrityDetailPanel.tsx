/**
 * IntegrityDetailPanel
 *
 * PRD-0036 Task 8.1-8.2: Slide-in panel showing a student's full integrity
 * report — violation stats, force-submit info, and chronological event timeline.
 *
 * Used on Teacher Results pages when clicking an IntegrityBadge.
 */

import React from 'react';
import type { IntegrityEventType } from '../../types/integrity.types';
import type { IntegrityViewData } from '../../utils/integrityUtils';
import { IntegrityBadge } from './IntegrityBadge';
import {
  getIntegrityEventCount,
  getIntegrityEvents,
  getIntegritySummary,
  isIntegrityReport,
} from '../../utils/integrityUtils';
import './IntegrityDetailPanel.css';
import type { BookIntegrityReport } from '../../services/book-activity/bookIntegrityReport.types';

interface IntegrityDetailPanelProps {
  report: IntegrityViewData;
  studentName: string;
  isOpen: boolean;
  onClose: () => void;
}

const EVENT_ICONS: Record<IntegrityEventType, string> = {
  tab_switch: '🔄',
  window_blur: '🔄',
  fullscreen_exit: '⛶',
  copy_attempt: '📋',
  paste_attempt: '📎',
  right_click: '🖱️',
  keyboard_shortcut: '⌨️',
  devtools_resize: '🪟',
  time_per_question: '⏱️',
  page_reload: '🔁',
  fullscreen_unavailable: '⛶',
};

const EVENT_LABELS: Record<IntegrityEventType, string> = {
  tab_switch: 'Tab Switch',
  window_blur: 'Window Blur',
  fullscreen_exit: 'Fullscreen Exit',
  copy_attempt: 'Copy Attempt',
  paste_attempt: 'Paste Attempt',
  right_click: 'Right Click',
  keyboard_shortcut: 'Keyboard Shortcut',
  devtools_resize: 'DevTools Resize',
  time_per_question: 'Question Time',
  page_reload: 'Page Reload',
  fullscreen_unavailable: 'Fullscreen N/A',
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m ${rem}s`;
}

export const IntegrityDetailPanel: React.FC<IntegrityDetailPanelProps> = ({
  report,
  studentName,
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const events = getIntegrityEvents(report);
  const hasTimeline = isIntegrityReport(report);

  const stats = [
    { label: 'Tab Switches', value: report.tabSwitchCount, color: '#3b82f6' },
    { label: 'Time Away', value: formatDuration(report.totalTimeAwayMs), color: '#8b5cf6' },
    { label: 'Copy Attempts', value: report.copyAttempts, color: '#f59e0b' },
    { label: 'Paste Attempts', value: report.pasteAttempts, color: '#f59e0b' },
    { label: 'Fullscreen Exits', value: report.fullscreenExitCount, color: '#ef4444' },
    { label: 'Right Clicks', value: report.rightClickAttempts, color: '#64748b' },
    { label: 'Keyboard Shortcuts', value: report.keyboardShortcutAttempts, color: '#64748b' },
    { label: 'Violations / Total', value: `${report.violationCount} / ${report.totalEvents}`, color: '#1e293b' },
  ];

  return (
    <div className="integrity-panel-overlay" onClick={onClose}>
      <div className="integrity-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="integrity-panel-header">
          <div>
            <div className="integrity-panel-title">
              Integrity Report
            </div>
            <div className="integrity-panel-subtitle">
              {studentName} &nbsp;
              <IntegrityBadge violationCount={report.violationCount} riskLevel={report.riskLevel} />
            </div>
          </div>
          <button className="integrity-panel-close" onClick={onClose}>✕</button>
        </div>

        {/* Stats Grid */}
        <div className="integrity-stats-grid">
          {stats.map((stat) => (
            <div key={stat.label} className="integrity-stat-card">
              <div className="integrity-stat-value" style={{ color: stat.color }}>
                {stat.value}
              </div>
              <div className="integrity-stat-label">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Force Submit Info */}
        <div className={`integrity-force-info ${report.forceSubmitted ? '' : 'no-force'}`}>
          {report.forceSubmitted
            ? `✅ Force Submitted by ${report.forceSubmittedBy || 'unknown'}`
            : '❌ Not Force Submitted'}
        </div>

        {/* Event Timeline */}
        <div className="integrity-timeline-header">
          {hasTimeline
            ? `Event Timeline (${getIntegrityEventCount(report)} events)`
            : `Homework Summary (${getIntegrityEventCount(report)} events)`}
        </div>

        {!hasTimeline ? (
          <div className="integrity-timeline-empty">
            {getIntegritySummary(report)}
          </div>
        ) : events.length === 0 ? (
          <div className="integrity-timeline-empty">
            No integrity events recorded.
          </div>
        ) : (
          <div className="integrity-timeline">
            {events.map((event, idx) => {
              const statusClass = event.withinGrace ? 'grace' : event.counted ? 'counted' : '';
              return (
                <div
                  key={idx}
                  className={`integrity-timeline-item ${statusClass} ${report.riskLevel === 'high' && event.counted ? 'high' : ''}`}
                >
                  <span className="integrity-timeline-time">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="integrity-timeline-icon">
                    {EVENT_ICONS[event.type] || '❓'}
                  </span>
                  <span className="integrity-timeline-type">
                    {EVENT_LABELS[event.type] || event.type}
                    {event.details ? ` (${event.details})` : ''}
                  </span>
                  {event.durationMs != null && event.durationMs > 0 && (
                    <span className="integrity-timeline-duration">
                      ({formatDuration(event.durationMs)})
                    </span>
                  )}
                  <span className={`integrity-timeline-status ${statusClass}`}>
                    {event.withinGrace ? 'grace ✓' : event.counted ? 'counted ⚠️' : ''}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default IntegrityDetailPanel;

/**
 * Book Activity's post-submit report is intentionally a separate presentation
 * from the legacy PRD-0036 panel above.  It uses cautious language and owns no
 * grading, release, completion, or correction controls.
 */
export interface BookActivityIntegrityDetailPanelProps {
  readonly report: BookIntegrityReport;
  readonly studentName: string;
  readonly activityLabel: string;
  readonly onClose?: () => void;
}

const BOOK_SIGNAL_LABELS: Readonly<Record<keyof BookIntegrityReport['counts'], string>> = {
  visibility_loss: 'Page visibility loss',
  focus_loss: 'Focus loss',
  route_reload_close: 'Route, reload, or close',
  paste: 'Paste',
  protected_copy: 'Protected copy',
  focus_mode_exit: 'Required focus-mode exit',
  concurrent_attempt: 'Concurrent attempt',
  inactivity: 'Bounded inactivity',
};

const riskCopy = (risk: BookIntegrityReport['risk']): string => {
  if (risk === 'normal') return 'No bounded integrity signals were recorded for this submitted Activity.';
  if (risk === 'integrity_high_risk') return 'Several bounded integrity signals were recorded for teacher review.';
  return 'Bounded integrity signals were recorded for teacher review.';
};

export const BookActivityIntegrityDetailPanel: React.FC<BookActivityIntegrityDetailPanelProps> = ({
  report,
  studentName,
  activityLabel,
  onClose,
}) => (
  <section className="book-integrity-detail-panel" aria-labelledby="book-integrity-detail-title">
    <header className="book-integrity-detail-panel__header">
      <div>
        <p className="book-integrity-detail-panel__eyebrow">Post-submit integrity review</p>
        <h3 id="book-integrity-detail-title">{activityLabel}</h3>
        <p>{studentName}</p>
      </div>
      {onClose ? (
        <button type="button" onClick={onClose} aria-label="Close integrity review">Close</button>
      ) : null}
    </header>
    <p className="book-integrity-detail-panel__caution">{riskCopy(report.risk)}</p>
    <dl className="book-integrity-detail-panel__summary">
      <div>
        <dt>Report status</dt>
        <dd>Sealed after submission</dd>
      </div>
      <div>
        <dt>Risk status</dt>
        <dd>{report.risk.replace('integrity_', '').replace('_', ' ')}</dd>
      </div>
      <div>
        <dt>Total signals</dt>
        <dd>{report.totalEventCount}</dd>
      </div>
      <div>
        <dt>Attempt</dt>
        <dd>{report.terminal.attemptNumber}</dd>
      </div>
    </dl>
    <section aria-labelledby="book-integrity-counts-title">
      <h4 id="book-integrity-counts-title">Signal counts</h4>
      <ul className="book-integrity-detail-panel__counts">
        {(Object.keys(BOOK_SIGNAL_LABELS) as Array<keyof BookIntegrityReport['counts']>).map((signal) => (
          <li key={signal}>
            <span>{BOOK_SIGNAL_LABELS[signal]}</span>
            <strong>{report.counts[signal]}</strong>
          </li>
        ))}
      </ul>
    </section>
    <section aria-labelledby="book-integrity-events-title">
      <h4 id="book-integrity-events-title">Recorded signal times</h4>
      {report.eventRefs.length === 0 ? (
        <p className="book-integrity-detail-panel__empty">No signal events were recorded.</p>
      ) : (
        <ol className="book-integrity-detail-panel__events">
          {report.eventRefs.map((event) => (
            <li key={event.eventId}>
              <span>{BOOK_SIGNAL_LABELS[event.signal]}</span>
              <time dateTime={event.recordedAt}>{new Date(event.recordedAt).toLocaleString()}</time>
            </li>
          ))}
        </ol>
      )}
    </section>
    <p className="book-integrity-detail-panel__note">
      This report is informational for the owning teacher. It does not change grading, feedback release,
      completion, eligibility, or attempt count.
    </p>
  </section>
);
