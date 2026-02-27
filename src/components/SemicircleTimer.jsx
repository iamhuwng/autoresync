import React from 'react';
import { useSynchronizedTimer } from '../hooks/useSynchronizedTimer';

/**
 * SemicircleTimer Component
 * 
 * Displays a small solid color bar at the top of the screen
 * - Synchronized across all devices using server timestamp
 * - Color changes based on time remaining: Green → Yellow → Red
 * - Shows countdown number in center
 */
const SemicircleTimer = ({
  timerState,
  onTimeUp = null
}) => {
  // Use synchronized timer hook for perfect synchronization
  const timeRemaining = useSynchronizedTimer(timerState, onTimeUp);
  
  const ratio = timerState?.totalTime 
    ? timeRemaining / timerState.totalTime 
    : 1;

  // Determine color based on time remaining
  const getColor = () => {
    if (timerState?.isPaused) return '#9ca3af';
    
    if (ratio > 0.5) {
      // Green to yellow (50% to 100%)
      const greenToYellowRatio = (ratio - 0.5) * 2;
      const r = Math.round(34 + (255 - 34) * (1 - greenToYellowRatio));
      const g = Math.round(197 + (193 - 197) * (1 - greenToYellowRatio));
      const b = Math.round(94 + (7 - 94) * (1 - greenToYellowRatio));
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // Yellow to red (0% to 50%)
      const yellowToRedRatio = ratio * 2;
      const r = Math.round(239 + (255 - 239) * (1 - yellowToRedRatio));
      const g = Math.round(68 + (193 - 68) * yellowToRedRatio);
      const b = Math.round(68 + (7 - 68) * (1 - yellowToRedRatio));
      return `rgb(${r}, ${g}, ${b})`;
    }
  };

  const color = getColor();

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      height: 'clamp(60px, 10vh, 80px)',
      backgroundColor: color,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      transition: 'background-color 0.3s ease',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)'
    }}>
      {/* Timer text */}
      <div style={{
        fontSize: 'clamp(2rem, 6vw, 3rem)',
        fontWeight: '800',
        color: 'white',
        textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        {timeRemaining}
      </div>
    </div>
  );
};

export default SemicircleTimer;
