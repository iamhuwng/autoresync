/**
 * DrawingToolbar - UI component for drawing tools
 * Displays tool buttons, settings, and actions (undo/redo/clear/export)
 */

import React, { useState } from 'react';

const DrawingToolbar = ({
  currentTool,
  onToolChange,
  onUpdateToolOptions,
  onUndo,
  onRedo,
  onClear,
  onExport,
  canUndo,
  canRedo,
  tools
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [settingsVersion, setSettingsVersion] = useState(0); // Force re-render on settings change
  
  // Tool icons and labels (priority order)
  const toolConfig = {
    pen: { icon: '✏️', label: 'Pen', color: '#3b82f6' },
    eraser: { icon: '⌫', label: 'Eraser', color: '#ef4444' },
    highlighter: { icon: '🖍️', label: 'Highlight', color: '#eab308' }
  };
  
  const toolOrder = ['pen', 'eraser', 'highlighter'];
  
  // Re-fetch settings panel to get updated values (triggered by settingsVersion)
  const currentToolSettings = tools?.[currentTool]?.getSettingsPanel?.();
  
  const handleExport = (format) => {
    onExport(format);
    setShowExportMenu(false);
  };
  
  return (
    <div style={styles.container}>
      {/* Tool Selector */}
      <div style={styles.toolSection}>
        <div style={styles.sectionLabel}>Tools</div>
        <div style={styles.toolButtons}>
          {toolOrder.map(toolName => {
            const config = toolConfig[toolName];
            const isActive = currentTool === toolName;
            
            return (
              <button
                key={toolName}
                onClick={() => onToolChange(toolName)}
                style={{
                  ...styles.toolButton,
                  ...(isActive ? styles.toolButtonActive : {}),
                  borderColor: isActive ? config.color : '#e2e8f0'
                }}
                title={config.label}
              >
                <span style={{ fontSize: '18px' }}>{config.icon}</span>
                <span style={{ fontSize: '11px', marginTop: '2px' }}>{config.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      
      {/* Actions */}
      <div style={styles.actionSection}>
        <div style={styles.sectionLabel}>Actions</div>
        <div style={styles.actionButtons}>
          <button
            onClick={onUndo}
            disabled={!canUndo}
            style={{
              ...styles.actionButton,
              ...(canUndo ? {} : styles.actionButtonDisabled)
            }}
            title="Undo (Ctrl+Z)"
          >
            ↶
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            style={{
              ...styles.actionButton,
              ...(canRedo ? {} : styles.actionButtonDisabled)
            }}
            title="Redo (Ctrl+Y)"
          >
            ↷
          </button>
          <button
            onClick={onClear}
            style={styles.actionButton}
            title="Clear All"
          >
            🗑️
          </button>
          <div style={styles.exportDropdown}>
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              style={styles.actionButton}
              title="Export"
            >
              📤
            </button>
            {showExportMenu && (
              <div style={styles.exportMenu}>
                <button
                  onClick={() => handleExport('png')}
                  style={styles.exportMenuItem}
                >
                  Export PNG
                </button>
                <button
                  onClick={() => handleExport('pdf')}
                  style={styles.exportMenuItem}
                >
                  Export PDF
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Settings Panel (if tool has settings) */}
      {currentToolSettings && (
        <div style={styles.settingsSection}>
          <button
            onClick={() => setShowSettings(!showSettings)}
            style={styles.settingsToggle}
          >
            ⚙️ Settings {showSettings ? '▲' : '▼'}
          </button>
          
          {showSettings && (
            <div style={styles.settingsPanel}>
              {currentToolSettings.fields.map((field, index) => {
                // The field's onChange already updates the tool's options via BaseTool.updateOptions()
                // No need for additional logic - just call it directly
                const handleChange = (value) => {
                  field.onChange(value);
                  // Force re-render to show updated values in UI
                  setSettingsVersion(v => v + 1);
                  // Trigger a redraw to apply settings immediately
                  if (onUpdateToolOptions) {
                    onUpdateToolOptions({});
                  }
                };
                
                return (
                  <div key={index} style={styles.settingField}>
                    <label style={styles.settingLabel}>{field.label}:</label>
                    
                    {field.type === 'slider' && (
                      <div style={styles.sliderWrapper}>
                        <input
                          type="range"
                          min={field.min}
                          max={field.max}
                          step={field.step}
                          value={field.value}
                          onChange={(e) => handleChange(Number(e.target.value))}
                          style={styles.slider}
                        />
                        <span style={styles.sliderValue}>{field.value}</span>
                      </div>
                    )}
                    
                    {field.type === 'color' && (
                      <div style={styles.colorWrapper}>
                        {field.presets && (
                          <div style={styles.colorPresets}>
                            {field.presets.map(color => (
                              <button
                                key={color}
                                onClick={() => handleChange(color)}
                                style={{
                                  ...styles.colorPreset,
                                  backgroundColor: color,
                                  border: field.value === color ? '3px solid #3b82f6' : '2px solid #cbd5e1'
                                }}
                                title={color}
                              />
                            ))}
                          </div>
                        )}
                        <input
                          type="color"
                          value={field.value}
                          onChange={(e) => handleChange(e.target.value)}
                          style={styles.colorPicker}
                        />
                      </div>
                    )}
                    
                    {field.type === 'select' && (
                      <select
                        value={field.value}
                        onChange={(e) => handleChange(e.target.value)}
                        style={styles.select}
                      >
                        {field.options.map(opt => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    )}
                    
                    {field.type === 'checkbox' && (
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={(e) => handleChange(e.target.checked)}
                        style={styles.checkbox}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Styles
const styles = {
  container: {
    background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
    border: '2px solid #cbd5e1',
    borderRadius: '12px',
    padding: '16px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    fontFamily: 'Arial, sans-serif',
    minWidth: '280px',
    maxWidth: '320px'
  },
  
  toolSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  
  sectionLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  
  toolButtons: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: '8px'
  },
  
  toolButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 4px',
    border: '2px solid #e2e8f0',
    borderRadius: '8px',
    background: 'white',
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontSize: '14px',
    fontWeight: '500',
    color: '#475569',
    minHeight: '56px'
  },
  
  toolButtonActive: {
    background: 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)',
    color: '#6d28d9',
    transform: 'scale(1.05)',
    boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)'
  },
  
  actionSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    borderTop: '1px solid #e2e8f0',
    paddingTop: '12px'
  },
  
  actionButtons: {
    display: 'flex',
    gap: '8px'
  },
  
  actionButton: {
    flex: 1,
    padding: '10px',
    border: '2px solid #e2e8f0',
    borderRadius: '8px',
    background: 'white',
    cursor: 'pointer',
    fontSize: '18px',
    transition: 'all 0.2s',
    color: '#475569'
  },
  
  actionButtonDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed'
  },
  
  exportDropdown: {
    position: 'relative',
    flex: 1
  },
  
  exportMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: '4px',
    background: 'white',
    border: '2px solid #cbd5e1',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    zIndex: 1000,
    minWidth: '140px'
  },
  
  exportMenuItem: {
    width: '100%',
    padding: '10px 16px',
    border: 'none',
    background: 'white',
    textAlign: 'left',
    cursor: 'pointer',
    fontSize: '14px',
    color: '#475569',
    transition: 'background 0.2s'
  },
  
  settingsSection: {
    borderTop: '1px solid #e2e8f0',
    paddingTop: '12px'
  },
  
  settingsToggle: {
    width: '100%',
    padding: '10px',
    border: '2px solid #e2e8f0',
    borderRadius: '8px',
    background: 'white',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    color: '#475569',
    transition: 'all 0.2s'
  },
  
  settingsPanel: {
    marginTop: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  
  settingField: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  
  settingLabel: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#64748b'
  },
  
  sliderWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  
  slider: {
    flex: 1,
    height: '6px',
    borderRadius: '3px',
    outline: 'none',
    cursor: 'pointer'
  },
  
  sliderValue: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#475569',
    minWidth: '30px',
    textAlign: 'right'
  },
  
  colorWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  
  colorPresets: {
    display: 'flex',
    gap: '6px'
  },
  
  colorPreset: {
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  
  colorPicker: {
    width: '100%',
    height: '40px',
    border: '2px solid #e2e8f0',
    borderRadius: '6px',
    cursor: 'pointer'
  },
  
  select: {
    padding: '8px',
    border: '2px solid #e2e8f0',
    borderRadius: '6px',
    fontSize: '14px',
    color: '#475569',
    background: 'white',
    cursor: 'pointer'
  },
  
  checkbox: {
    width: '20px',
    height: '20px',
    cursor: 'pointer'
  }
};

export default DrawingToolbar;
