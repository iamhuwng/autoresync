/**
 * Passage Controls Component
 * Reading-specific controls for font size, line spacing, and text highlighter
 * 
 * Moved from src/components/test/ to src/skills/reading/components/ (Phase 2 Step 2.4)
 */

import React from 'react';

interface PassageControlsProps {
  fontSize: number;
  setFontSize: (size: number) => void;
  lineSpacing: number;
  setLineSpacing: (spacing: number) => void;
  highlighterActive: boolean;
  setHighlighterActive: (active: boolean) => void;
  highlightColor: string;
  setHighlightColor: (color: string) => void;
  onClearHighlights: () => void;
}

export const PassageControls: React.FC<PassageControlsProps> = ({
  fontSize,
  setFontSize,
  lineSpacing,
  setLineSpacing,
  highlighterActive,
  setHighlighterActive,
  highlightColor,
  setHighlightColor,
  onClearHighlights,
}) => {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.75rem 1.5rem',
      background: 'white',
      borderBottom: '1px solid #e2e8f0',
      flexShrink: 0,
    }}>
      {/* Font Size Controls */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#64748b' }}>
          Font:
        </span>
        <button
          onClick={() => setFontSize(Math.max(12, fontSize - 2))}
          disabled={fontSize <= 12}
          style={{
            padding: '0.375rem 0.625rem',
            borderRadius: '0.375rem',
            border: '1px solid #cbd5e1',
            background: fontSize <= 12 ? '#f1f5f9' : 'white',
            cursor: fontSize <= 12 ? 'not-allowed' : 'pointer',
            color: fontSize <= 12 ? '#94a3b8' : '#1e293b',
            fontWeight: 600,
            fontSize: '0.8125rem',
          }}
          title="Decrease font size"
        >
          A-
        </button>
        <span style={{
          fontSize: '0.6875rem',
          color: '#475569',
          fontWeight: 600,
          fontFamily: 'monospace',
          minWidth: '40px',
          textAlign: 'center',
        }}>
          {fontSize}px
        </span>
        <button
          onClick={() => setFontSize(Math.min(32, fontSize + 2))}
          disabled={fontSize >= 32}
          style={{
            padding: '0.375rem 0.625rem',
            borderRadius: '0.375rem',
            border: '1px solid #cbd5e1',
            background: fontSize >= 32 ? '#f1f5f9' : 'white',
            cursor: fontSize >= 32 ? 'not-allowed' : 'pointer',
            color: fontSize >= 32 ? '#94a3b8' : '#1e293b',
            fontWeight: 600,
            fontSize: '0.8125rem',
          }}
          title="Increase font size"
        >
          A+
        </button>
      </div>
      
      {/* Line Spacing Controls */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#64748b' }}>
          Line:
        </span>
        <button
          onClick={() => setLineSpacing(Math.max(1, lineSpacing - 0.25))}
          disabled={lineSpacing <= 1}
          style={{
            padding: '0.375rem 0.625rem',
            borderRadius: '0.375rem',
            border: '1px solid #cbd5e1',
            background: lineSpacing <= 1 ? '#f1f5f9' : 'white',
            cursor: lineSpacing <= 1 ? 'not-allowed' : 'pointer',
            color: lineSpacing <= 1 ? '#94a3b8' : '#1e293b',
            fontWeight: 600,
            fontSize: '0.8125rem',
          }}
          title="Decrease line spacing"
        >
          ↗↙
        </button>
        <span style={{
          fontSize: '0.6875rem',
          color: '#475569',
          fontWeight: 600,
          fontFamily: 'monospace',
          minWidth: '35px',
          textAlign: 'center',
        }}>
          {lineSpacing.toFixed(2)}
        </span>
        <button
          onClick={() => setLineSpacing(Math.min(3, lineSpacing + 0.25))}
          disabled={lineSpacing >= 3}
          style={{
            padding: '0.375rem 0.625rem',
            borderRadius: '0.375rem',
            border: '1px solid #cbd5e1',
            background: lineSpacing >= 3 ? '#f1f5f9' : 'white',
            cursor: lineSpacing >= 3 ? 'not-allowed' : 'pointer',
            color: lineSpacing >= 3 ? '#94a3b8' : '#1e293b',
            fontWeight: 600,
            fontSize: '0.8125rem',
          }}
          title="Increase line spacing"
        >
          ↖↘
        </button>
      </div>

      {/* Highlighter Controls */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <button
          onClick={() => setHighlighterActive(!highlighterActive)}
          style={{
            padding: '0.375rem 0.75rem',
            borderRadius: '0.375rem',
            border: '2px solid',
            borderColor: highlighterActive ? '#8b5cf6' : '#cbd5e1',
            background: highlighterActive ? 'rgba(139, 92, 246, 0.1)' : 'white',
            cursor: 'pointer',
            color: highlighterActive ? '#8b5cf6' : '#475569',
            fontWeight: 600,
            fontSize: '0.8125rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
          }}
          title="Toggle highlighter"
        >
          <span style={{ fontSize: '0.875rem' }}>🖍️</span>
          <span>{highlighterActive ? 'ON' : 'OFF'}</span>
        </button>

        {/* Color Picker */}
        {highlighterActive && (
          <>
            <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
              {['#ffeb3b', '#4ade80', '#60a5fa', '#f472b6', '#fb923c'].map(color => (
                <button
                  key={color}
                  onClick={() => setHighlightColor(color)}
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '0.375rem',
                    border: '2px solid',
                    borderColor: highlightColor === color ? '#1e293b' : '#e5e7eb',
                    background: color,
                    cursor: 'pointer',
                    boxShadow: highlightColor === color ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
                  }}
                  title={`Select ${color}`}
                />
              ))}
              {/* Clear All Button */}
              <button
                onClick={onClearHighlights}
                style={{
                  padding: '0.25rem 0.5rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #e5e7eb',
                  background: 'white',
                  cursor: 'pointer',
                  color: '#ef4444',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  marginLeft: '0.25rem',
                }}
                title="Clear all highlights"
              >
                Clear All
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
