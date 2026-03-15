/**
 * AntiCheatConfigSection — Collapsible Anti-Cheat Settings for Homework
 *
 * PRD-0036: Anti-Cheating & Test Integrity System (Task 5.1, 5.2)
 *
 * Rendered in the HomeworkCreateModal's configuration step.
 * Provides preset-based and custom toggle configuration for
 * homework-specific anti-cheat behavior.
 *
 * @module components/homework/AntiCheatConfigSection
 */

import React, { useState, useCallback } from 'react';
import type { AntiCheatConfig, AntiCheatPreset } from '../../types/integrity.types';
import { resolvePreset } from '../../utils/antiCheatPresets';
import './AntiCheatConfigSection.css';

// ============================================================================
// TYPES
// ============================================================================

interface AntiCheatConfigSectionProps {
  config: AntiCheatConfig;
  onChange: (config: AntiCheatConfig) => void;
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
  { key: 'nullifyRemainingAttempts', label: 'Lock remaining attempts on auto-submit' },
  { key: 'shuffleQuestions', label: 'Shuffle questions' },
  { key: 'shuffleOptions', label: 'Shuffle answer options' },
];

// ============================================================================
// COMPONENT
// ============================================================================

export const AntiCheatConfigSection: React.FC<AntiCheatConfigSectionProps> = ({
  config,
  onChange,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [preset, setPreset] = useState<AntiCheatPreset | 'custom'>('standard');

  // Determine which preset badge to show
  const getPresetLabel = (): string => {
    if (preset === 'custom') return 'Custom';
    return preset.charAt(0).toUpperCase() + preset.slice(1);
  };

  const isActive = preset !== 'none';

  const handlePresetChange = useCallback(
    (newPreset: AntiCheatPreset) => {
      setPreset(newPreset);
      onChange(resolvePreset(newPreset));
    },
    [onChange],
  );

  const handleToggle = useCallback(
    (key: keyof AntiCheatConfig, value: boolean) => {
      setPreset('custom');
      onChange({ ...config, [key]: value });
    },
    [config, onChange],
  );

  const handleThresholdChange = useCallback(
    (value: number) => {
      setPreset('custom');
      onChange({
        ...config,
        autoSubmitThreshold: Math.max(1, Math.min(20, value)),
      });
    },
    [config, onChange],
  );

  return (
    <div className="anticheat-section">
      {/* Section Header */}
      <button
        className="anticheat-header"
        onClick={() => setIsExpanded(!isExpanded)}
        type="button"
      >
        <span className={`anticheat-chevron ${isExpanded ? 'expanded' : ''}`}>
          ▸
        </span>
        <span className="anticheat-header-text">🔒 Anti-Cheat Settings</span>
        <span className={`anticheat-header-badge ${isActive ? 'active' : ''}`}>
          {getPresetLabel()}
        </span>
      </button>

      {/* Expandable Content */}
      <div className={`anticheat-content ${isExpanded ? 'expanded' : ''}`}>
        <div className="anticheat-inner">
          {/* Preset Dropdown */}
          <div className="ac-preset-group">
            <label className="ac-preset-label" htmlFor="ac-preset">
              Preset
            </label>
            <select
              id="ac-preset"
              className="ac-preset-select"
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
          </div>

          {/* Customize Sub-Toggle */}
          <button
            className="ac-customize-btn"
            onClick={() => setShowCustomize(!showCustomize)}
            type="button"
          >
            <span className={`anticheat-chevron ${showCustomize ? 'expanded' : ''}`}>
              ▸
            </span>
            Customize
          </button>

          {/* Toggle List */}
          {showCustomize && (
            <div className="ac-toggle-list">
              {TOGGLE_FIELDS.map(({ key, label }) => (
                <React.Fragment key={key}>
                  <div className="ac-toggle-row">
                    <span className="ac-toggle-label">{label}</span>
                    <input
                      type="checkbox"
                      className="ac-switch"
                      checked={Boolean(config[key])}
                      onChange={(e) => handleToggle(key, e.target.checked)}
                    />
                  </div>
                  {/* Threshold input when auto-submit is enabled */}
                  {key === 'enableAutoSubmit' && config.enableAutoSubmit && (
                    <div className="ac-threshold-row">
                      <span>After</span>
                      <input
                        type="number"
                        className="ac-threshold-input"
                        value={config.autoSubmitThreshold}
                        min={1}
                        max={20}
                        onChange={(e) =>
                          handleThresholdChange(parseInt(e.target.value) || 5)
                        }
                      />
                      <span>violations</span>
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
