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
