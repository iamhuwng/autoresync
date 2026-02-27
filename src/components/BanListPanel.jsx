import React, { useEffect, useState } from 'react';
import { Text, Stack } from '@mantine/core';
import { Button } from './modern';

const BanListPanel = ({ isOpen, onClose, bannedPlayers, onUnbanPlayer, buttonRef }) => {
  const [position, setPosition] = useState({ bottom: '90px', right: '180px' });

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
        border: '2px solid rgba(244, 63, 94, 0.3)',
        boxShadow: '0 20px 60px rgba(244, 63, 94, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.5) inset',
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
          borderTop: '12px solid rgba(244, 63, 94, 0.3)'
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
          borderBottom: '2px solid rgba(244, 63, 94, 0.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#f43f5e' }}>
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8z"/>
            </svg>
            <Text fw={700} size="lg" style={{ color: '#1e293b' }}>
              Ban List
            </Text>
          </div>
          <Button size="sm" variant="glass" onClick={onClose} style={{ padding: '0.25rem 0.5rem' }}>
            ✕
          </Button>
        </div>

        {/* Banned Players List */}
        <Stack spacing="xs" style={{ maxHeight: '300px', overflowY: 'auto', paddingRight: '0.25rem' }}>
          {bannedPlayers && Object.keys(bannedPlayers).length > 0 ? (
            Object.entries(bannedPlayers).map(([playerId, player]) => (
              <div 
                key={playerId} 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  padding: '0.75rem', 
                  background: 'linear-gradient(135deg, rgba(244, 63, 94, 0.05), rgba(251, 113, 133, 0.05))',
                  border: '1px solid rgba(244, 63, 94, 0.2)',
                  borderRadius: '0.5rem',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(244, 63, 94, 0.1), rgba(251, 113, 133, 0.1))';
                  e.currentTarget.style.borderColor = 'rgba(244, 63, 94, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(244, 63, 94, 0.05), rgba(251, 113, 133, 0.05))';
                  e.currentTarget.style.borderColor = 'rgba(244, 63, 94, 0.2)';
                }}
              >
                <div>
                  <Text fw={600} size="sm" style={{ color: '#1e293b', marginBottom: '0.25rem' }}>
                    {player.name}
                  </Text>
                  <Text size="xs" style={{ color: '#64748b' }}>
                    IP: {player.ip || 'Unknown'}
                  </Text>
                </div>
                <Button variant="success" size="sm" onClick={() => onUnbanPlayer(playerId)}>
                  Unban
                </Button>
              </div>
            ))
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#64748b' }}>
              <Text size="sm">No banned players.</Text>
            </div>
          )}
        </Stack>
      </div>
    </div>
  );
};

export default BanListPanel;
