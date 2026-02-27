/**
 * AudioControls Component
 * Additional controls for IELTS Listening audio playback
 * 
 * Features:
 * - Volume slider
 * - Playback speed selector
 * - Section navigation
 * - Replay counter
 */

import React from 'react';

interface AudioControlsProps {
  volume: number;
  playbackSpeed: number;
  currentSection: number;
  totalSections: number;
  replaysRemaining?: number;
  onVolumeChange: (volume: number) => void;
  onSpeedChange: (speed: number) => void;
  onSectionChange: (section: number) => void;
  allowSpeedControl?: boolean;
  sectionsCompleted: number[];
}

export const AudioControls: React.FC<AudioControlsProps> = ({
  volume,
  playbackSpeed,
  currentSection,
  totalSections,
  replaysRemaining,
  onVolumeChange,
  onSpeedChange,
  onSectionChange,
  allowSpeedControl = false,
  sectionsCompleted = []
}) => {
  const speedOptions = [0.75, 1.0, 1.25, 1.5];
  
  return (
    <div className="audio-controls-panel" style={{
      backgroundColor: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      padding: '16px'
    }}>
      {/* Volume Control */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ 
          fontSize: '14px', 
          fontWeight: '500', 
          color: '#475569', 
          display: 'flex', 
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px' 
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            🔊 Volume
          </span>
          <span style={{ 
            fontSize: '13px', 
            fontWeight: '600',
            color: '#3b82f6',
            backgroundColor: '#eff6ff',
            padding: '2px 8px',
            borderRadius: '4px'
          }}>
            {Math.round(volume * 100)}%
          </span>
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
          style={{
            width: '100%',
            height: '8px',
            borderRadius: '4px',
            outline: 'none',
            background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${volume * 100}%, #e2e8f0 ${volume * 100}%, #e2e8f0 100%)`,
            cursor: 'pointer'
          }}
        />
      </div>
      
      {/* Speed Control */}
      {allowSpeedControl && (
        <div style={{ marginBottom: '16px' }}>
          <label style={{ 
            fontSize: '14px', 
            fontWeight: '500', 
            color: '#475569', 
            display: 'block', 
            marginBottom: '8px' 
          }}>
            ⚡ Playback Speed
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {speedOptions.map(speed => (
              <button
                key={speed}
                onClick={() => onSpeedChange(speed)}
                style={{
                  flex: 1,
                  padding: '8px',
                  backgroundColor: playbackSpeed === speed ? '#3b82f6' : '#f1f5f9',
                  color: playbackSpeed === speed ? 'white' : '#475569',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>
      )}
      
      {/* Section Quick Navigation */}
      <div style={{ marginBottom: '12px' }}>
        <label style={{ 
          fontSize: '14px', 
          fontWeight: '500', 
          color: '#475569', 
          display: 'block', 
          marginBottom: '8px' 
        }}>
          📑 Sections
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          {Array.from({ length: totalSections }, (_, i) => i + 1).map(section => (
            <button
              key={section}
              onClick={() => onSectionChange(section)}
              disabled={!sectionsCompleted.includes(section - 1) && section > currentSection}
              style={{
                flex: 1,
                padding: '10px',
                backgroundColor: section === currentSection 
                  ? '#3b82f6' 
                  : sectionsCompleted.includes(section) 
                    ? '#10b981' 
                    : '#f1f5f9',
                color: section === currentSection || sectionsCompleted.includes(section) 
                  ? 'white' 
                  : '#94a3b8',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: (!sectionsCompleted.includes(section - 1) && section > currentSection) 
                  ? 'not-allowed' 
                  : 'pointer',
                opacity: (!sectionsCompleted.includes(section - 1) && section > currentSection) 
                  ? 0.5 
                  : 1,
                transition: 'all 0.2s',
                position: 'relative'
              }}
            >
              {section}
              {sectionsCompleted.includes(section) && (
                <span style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-4px',
                  backgroundColor: '#10b981',
                  color: 'white',
                  borderRadius: '50%',
                  width: '16px',
                  height: '16px',
                  fontSize: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px solid white'
                }}>
                  ✓
                </span>
              )}
            </button>
          ))}
        </div>
        <p style={{ 
          fontSize: '11px', 
          color: '#94a3b8', 
          marginTop: '6px',
          fontStyle: 'italic'
        }}>
          Complete sections to unlock navigation
        </p>
      </div>
      
      {/* Replay Information */}
      {replaysRemaining !== undefined && (
        <div style={{
          padding: '10px',
          backgroundColor: '#fef3c7',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{ fontSize: '16px' }}>🔁</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#92400e' }}>
              Replays Remaining: {replaysRemaining}
            </div>
            <div style={{ fontSize: '11px', color: '#b45309' }}>
              Audio will replay automatically if available
            </div>
          </div>
        </div>
      )}
      
      {/* Tips */}
      <div style={{
        marginTop: '12px',
        padding: '10px',
        backgroundColor: '#f0f9ff',
        borderRadius: '6px',
        fontSize: '11px',
        color: '#0369a1'
      }}>
        💡 <strong>Tip:</strong> Adjust volume for comfort. Each section plays only once in real IELTS test.
      </div>
    </div>
  );
};
