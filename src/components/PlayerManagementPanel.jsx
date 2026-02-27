import React, { useEffect, useState } from 'react';
import { Text, Stack } from '@mantine/core';
import { Button } from './modern';

const PlayerManagementPanel = ({ isOpen, onClose, players, onKickPlayer, buttonRef }) => {
  const [position, setPosition] = useState({ bottom: '90px', right: '20px' });

  useEffect(() => {
    if (isOpen && buttonRef) {
      const rect = buttonRef.getBoundingClientRect();
      const panelWidth = 320;
      const tailOffset = 30;
      
      // Calculate position to center the tail above the button
      const buttonCenter = rect.left + (rect.width / 2);
      const rightPosition = window.innerWidth - buttonCenter - tailOffset;
      
      setPosition({
        bottom: '90px',
        right: `${rightPosition}px`
      });
    }
  }, [isOpen, buttonRef]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: position.bottom,
      right: position.right,
      zIndex: 1300,
      maxWidth: '400px',
      minWidth: '320px'
    }}>
      {/* Speech Bubble Container */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.98)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: '0.75rem',
        border: '2px solid rgba(139, 92, 246, 0.3)',
        boxShadow: '0 20px 60px rgba(139, 92, 246, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.5) inset',
        padding: '1.25rem',
        position: 'relative',
        animation: 'popIn 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)'
      }}>
        {/* Speech Bubble Tail */}
        <div style={{
          position: 'absolute',
          bottom: '-12px',
          right: '30px',
          width: 0,
          height: 0,
          borderLeft: '12px solid transparent',
          borderRight: '12px solid transparent',
          borderTop: '12px solid rgba(139, 92, 246, 0.3)'
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-9px',
          right: '32px',
          width: 0,
          height: 0,
          borderLeft: '10px solid transparent',
          borderRight: '10px solid transparent',
          borderTop: '10px solid rgba(255, 255, 255, 0.98)'
        }} />

        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '1rem',
          paddingBottom: '0.75rem',
          borderBottom: '2px solid rgba(139, 92, 246, 0.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#8b5cf6' }}>
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
            </svg>
            <Text fw={700} size="lg" style={{ color: '#1e293b' }}>
              Player Management
            </Text>
          </div>
          <Button size="sm" variant="glass" onClick={onClose} style={{ padding: '0.25rem 0.5rem' }}>
            ✕
          </Button>
        </div>

        {/* Player List */}
        <Stack spacing="xs" style={{ maxHeight: '300px', overflowY: 'auto', paddingRight: '0.25rem' }}>
          {players && Object.keys(players).length > 0 ? (
            Object.entries(players).map(([playerId, player]) => (
              <div 
                key={playerId} 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  padding: '0.75rem', 
                  background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.05), rgba(56, 189, 248, 0.05))',
                  border: '1px solid rgba(139, 92, 246, 0.2)',
                  borderRadius: '0.5rem',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(56, 189, 248, 0.1))';
                  e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(139, 92, 246, 0.05), rgba(56, 189, 248, 0.05))';
                  e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.2)';
                }}
              >
                <div>
                  <Text fw={600} size="sm" style={{ color: '#1e293b', marginBottom: '0.25rem' }}>
                    {player.name}
                  </Text>
                  <Text size="xs" style={{ color: '#64748b' }}>
                    Score: {player.score || 0}
                  </Text>
                </div>
                <Button variant="danger" size="sm" onClick={() => onKickPlayer(playerId)}>
                  Kick
                </Button>
              </div>
            ))
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#64748b' }}>
              <Text size="sm">No active players.</Text>
            </div>
          )}
        </Stack>
      </div>
    </div>
  );
};

export default PlayerManagementPanel;
