/**
 * SessionStartConfigModal — Teacher Pre-Test Anti-Cheat Configuration
 *
 * PRD-0036: Anti-Cheating & Test Integrity System (Task 4.1, 4.2, 4.3)
 *
 * Displayed when teacher clicks "Start Test" in the control bar.
 * Allows preset selection (None/Standard/Strict/Custom) and
 * fine-grained toggle customization before the test begins.
 *
 * @module components/test/SessionStartConfigModal
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { AntiCheatConfig, AntiCheatPreset } from '../../types/integrity.types';
import { resolvePreset, getContextDefaults } from '../../utils/antiCheatPresets';
import { Button } from '../modern';
import './SessionStartConfigModal.css';

// ============================================================================
// TYPES
// ============================================================================

interface SessionStartConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (config: AntiCheatConfig) => void;
  testTitle: string;
}

// ============================================================================
// TOGGLE DEFINITIONS
// ============================================================================

const TOGGLE_FIELDS: Array<{
  key: keyof AntiCheatConfig;
  label: string;
}> = [
  { key: 'detectTabSwitch', label: 'Tab-switch detection' },
  { key: 'detectCopyPaste', label: 'Copy/paste prevention' },
  { key: 'detectRightClick', label: 'Right-click prevention' },
  { key: 'requireFullscreen', label: 'Fullscreen required' },
  { key: 'detectKeyboardShortcuts', label: 'Detect keyboard shortcuts' },
  { key: 'enableStudentWarnings', label: 'Student warnings' },
  { key: 'enableAutoSubmit', label: 'Auto-submit on violations' },
  { key: 'shuffleQuestions', label: 'Shuffle questions' },
  { key: 'shuffleOptions', label: 'Shuffle answer options' },
];

const PRESET_HINTS: Record<string, string> = {
  none: 'No monitoring — questions can still be shuffled.',
  standard: 'Tab-switch + copy/paste detection. Good balance for most tests.',
  strict: 'Full lockdown with fullscreen, keyboard shortcuts, and auto-submit.',
  custom: 'Manually configured settings.',
};

// ============================================================================
// COMPONENT
// ============================================================================

export const SessionStartConfigModal: React.FC<SessionStartConfigModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  testTitle,
}) => {
  const [preset, setPreset] = useState<AntiCheatPreset | 'custom'>('standard');
  const [config, setConfig] = useState<AntiCheatConfig>(() => ({
    ...resolvePreset('standard'),
    ...getContextDefaults('session'),
  }));
  const [showCustomize, setShowCustomize] = useState(false);

  // (Task 4.3) Reset on open
  useEffect(() => {
    if (isOpen) {
      const init = { ...resolvePreset('standard'), ...getContextDefaults('session') };
      setConfig(init);
      setPreset('standard');
      setShowCustomize(false);
    }
  }, [isOpen]);

  // Handle preset change
  const handlePresetChange = useCallback((newPreset: AntiCheatPreset) => {
    setPreset(newPreset);
    setConfig({
      ...resolvePreset(newPreset),
      ...getContextDefaults('session'),
    });
  }, []);

  // Handle individual toggle
  const handleToggle = useCallback((key: keyof AntiCheatConfig, value: boolean) => {
    setPreset('custom');
    setConfig(prev => ({ ...prev, [key]: value }));
  }, []);

  // Handle threshold change
  const handleThresholdChange = useCallback((value: number) => {
    setPreset('custom');
    setConfig(prev => ({ ...prev, autoSubmitThreshold: Math.max(1, Math.min(20, value)) }));
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="session-config-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="session-config-modal">
        {/* Header */}
        <div className="scm-header">
          <h2 className="scm-title">Start Test — {testTitle}</h2>
          <button className="scm-close-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {/* Body */}
        <div className="scm-body">
          {/* Preset Dropdown */}
          <div className="scm-preset-group">
            <label className="scm-label" htmlFor="scm-preset">
              Anti-Cheat Preset
            </label>
            <select
              id="scm-preset"
              className="scm-preset-select"
              value={preset}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'custom') {
                  setPreset('custom');
                } else {
                  handlePresetChange(val as AntiCheatPreset);
                }
              }}
            >
              <option value="none">None</option>
              <option value="standard">Standard</option>
              <option value="strict">Strict</option>
              <option value="custom">Custom</option>
            </select>
            <p className="scm-preset-hint">
              {PRESET_HINTS[preset]}
            </p>
          </div>

          {/* Customize Toggle */}
          <button
            className="scm-customize-toggle"
            onClick={() => setShowCustomize(!showCustomize)}
          >
            <span className={`scm-customize-arrow ${showCustomize ? 'expanded' : ''}`}>
              ▸
            </span>
            Customize settings
          </button>

          {/* Toggle List */}
          {showCustomize && (
            <div className="scm-toggle-list">
              {TOGGLE_FIELDS.map(({ key, label }) => (
                <React.Fragment key={key}>
                  <div className="scm-toggle-row">
                    <span className="scm-toggle-label">{label}</span>
                    <input
                      type="checkbox"
                      className="scm-switch"
                      checked={Boolean(config[key])}
                      onChange={(e) => handleToggle(key, e.target.checked)}
                    />
                  </div>
                  {/* Show threshold input when auto-submit is enabled */}
                  {key === 'enableAutoSubmit' && config.enableAutoSubmit && (
                    <div className="scm-threshold-row">
                      <span>Auto-submit after</span>
                      <input
                        type="number"
                        className="scm-threshold-input"
                        value={config.autoSubmitThreshold}
                        min={1}
                        max={20}
                        onChange={(e) => handleThresholdChange(parseInt(e.target.value) || 5)}
                      />
                      <span>violations</span>
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="scm-footer">
          <button className="scm-cancel-btn" onClick={onClose}>
            Cancel
          </button>
          <Button
            variant="primary"
            onClick={() => onConfirm(config)}
          >
            Start Test
          </Button>
        </div>
      </div>
    </div>
  );
};
