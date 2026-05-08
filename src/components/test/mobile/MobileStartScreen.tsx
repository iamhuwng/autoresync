/**
 * MobileStartScreen — Mobile-Optimized Start/Instructions Screen
 *
 * Renders a compact single-column layout filling the viewport with:
 * - Test title and skill badge
 * - Mode-specific rules from getMobileInstructionsContent()
 * - Dominant Start button (when showStartButton is true)
 *
 * Does NOT render TestHeader, ReadingHeader, SoloSettingsModal, or any
 * desktop header/body chrome. No @mantine imports.
 *
 * @see PRD-0043 FR-24–29, Task 2A.2
 */

import React from 'react';
import { getMobileInstructionsContent } from './mobileInstructionsContent';
import type { PracticeContext } from '../../practice/IELTSPracticeView';
import type { ResolvedPracticeSettings } from '../../../types/practice.types';

export interface MobileStartScreenProps {
  /** Exam mode: live, solo, or homework */
  mode: 'live' | 'solo' | 'homework';
  /** Test title to display */
  testTitle: string;
  /** Test skill badge text (e.g. "Reading") */
  testSkill: string;
  /** Number of passages in the test */
  passageCount: number;
  /** Total number of questions */
  questionCount: number;
  /** Time limit in minutes, or null if untimed */
  timeLimit: number | null;
  /** Callback when user taps "Start" */
  onStart: () => void;
  /** Whether to show the start button (false for live mode where teacher controls start) */
  showStartButton?: boolean;
  /** Practice context (solo/homework modes) */
  practiceContext?: PracticeContext;
  /** Resolved practice settings */
  resolvedSettings?: ResolvedPracticeSettings;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  height: '100vh',
  display: 'flex',
  flexDirection: 'column',
  background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  overflow: 'auto',
  WebkitOverflowScrolling: 'touch',
  paddingTop: 'env(safe-area-inset-top, 0px)',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
};

const contentStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  padding: '1.5rem 1.25rem',
  maxWidth: '480px',
  width: '100%',
  margin: '0 auto',
};

const headerSectionStyle: React.CSSProperties = {
  textAlign: 'center',
  marginBottom: '1.5rem',
  paddingTop: '1rem',
};

const skillBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '4px 12px',
  borderRadius: '999px',
  fontSize: '0.75rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  background: '#eff6ff',
  color: '#2563eb',
  marginBottom: '0.75rem',
};

const titleStyle: React.CSSProperties = {
  fontSize: '1.375rem',
  fontWeight: 700,
  color: '#0f172a',
  margin: '0 0 0.75rem',
  lineHeight: 1.3,
  wordBreak: 'break-word',
};

const metaRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  gap: '1rem',
  flexWrap: 'wrap',
};

const metaItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: '0.8125rem',
  color: '#64748b',
};

const rulesSectionStyle: React.CSSProperties = {
  flex: 1,
  marginBottom: '1.5rem',
};

const rulesSectionTitleStyle: React.CSSProperties = {
  fontSize: '0.875rem',
  fontWeight: 700,
  color: '#334155',
  marginBottom: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const rulesListStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.625rem',
};

const ruleItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '0.625rem',
  fontSize: '0.875rem',
  color: '#475569',
  lineHeight: 1.5,
};

const ruleBulletStyle: React.CSSProperties = {
  flexShrink: 0,
  width: '20px',
  height: '20px',
  borderRadius: '50%',
  background: '#e0e7ff',
  color: '#4f46e5',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.6875rem',
  fontWeight: 700,
  marginTop: '1px',
};

const startButtonStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '52px',
  padding: '0 1.5rem',
  background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
  color: 'white',
  border: 'none',
  borderRadius: '14px',
  fontSize: '1.0625rem',
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)',
  letterSpacing: '0.01em',
  marginBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)',
};

const waitingMessageStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '1rem',
  fontSize: '0.9375rem',
  color: '#6366f1',
  fontWeight: 600,
  marginBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)',
};

const dividerStyle: React.CSSProperties = {
  height: '1px',
  background: '#e2e8f0',
  margin: '0.25rem 0 1rem',
};

// ── Component ─────────────────────────────────────────────────────────────────

export const MobileStartScreen: React.FC<MobileStartScreenProps> = ({
  mode,
  testTitle,
  testSkill,
  passageCount,
  questionCount,
  timeLimit,
  onStart,
  showStartButton = true,
  practiceContext,
  resolvedSettings,
}) => {
  const { rules, controlsHelp } = getMobileInstructionsContent(
    mode,
    practiceContext,
    resolvedSettings,
  );

  const modeLabel = mode === 'live' ? 'Live Test' : mode === 'homework' ? 'Homework' : 'Practice';

  return (
    <div style={containerStyle} data-testid="mobile-start-screen">
      <div style={contentStyle}>
        {/* ── Header: Title + Skill Badge ─────────────────────────────────── */}
        <div style={headerSectionStyle}>
          <div>
            <span style={skillBadgeStyle} data-testid="skill-badge">
              📖 {testSkill}
            </span>
          </div>
          <h1 style={titleStyle} data-testid="test-title">
            {testTitle}
          </h1>

          {/* Meta row: passages, questions, time */}
          <div style={metaRowStyle}>
            <span style={metaItemStyle}>
              📄 {passageCount} passage{passageCount !== 1 ? 's' : ''}
            </span>
            <span style={metaItemStyle}>
              ❓ {questionCount} question{questionCount !== 1 ? 's' : ''}
            </span>
            {timeLimit && (
              <span style={metaItemStyle}>
                ⏱️ {timeLimit} min
              </span>
            )}
          </div>
        </div>

        <div style={dividerStyle} />

        {/* ── Rules Section ─────────────────────────────────────────────── */}
        <div style={rulesSectionStyle}>
          <div style={rulesSectionTitleStyle}>{modeLabel} Rules</div>
          <ul style={rulesListStyle} data-testid="rules-list">
            {rules.map((rule, index) => (
              <li key={index} style={ruleItemStyle}>
                <span style={ruleBulletStyle}>{index + 1}</span>
                <span>{rule}</span>
              </li>
            ))}
          </ul>

          {/* Controls Help */}
          {controlsHelp.length > 0 && (
            <>
              <div style={{ ...rulesSectionTitleStyle, marginTop: '1.25rem' }}>
                Controls
              </div>
              <ul style={rulesListStyle} data-testid="controls-help-list">
                {controlsHelp.map((help, index) => (
                  <li key={index} style={ruleItemStyle}>
                    <span style={{ ...ruleBulletStyle, background: '#ecfdf5', color: '#059669' }}>
                      {index + 1}
                    </span>
                    <span>{help}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* ── Bottom: Start Button or Waiting Message ─────────────────── */}
        {showStartButton ? (
          <button
            onClick={onStart}
            style={startButtonStyle}
            data-testid="start-button"
            onMouseDown={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.98)';
            }}
            onMouseUp={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
            }}
            onTouchStart={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.98)';
            }}
            onTouchEnd={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
            }}
          >
            Start {modeLabel}
          </button>
        ) : (
          <div style={waitingMessageStyle} data-testid="waiting-message">
            ⏳ Waiting for teacher to start the test...
          </div>
        )}
      </div>
    </div>
  );
};

export default MobileStartScreen;
