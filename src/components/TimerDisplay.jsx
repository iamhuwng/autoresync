import React from 'react';
import { RingProgress, Text, Center } from '@mantine/core';
import { useSynchronizedTimer } from '../hooks/useSynchronizedTimer';

/**
 * TimerDisplay Component
 *
 * Displays a circular countdown timer with visual feedback
 * - Synchronized across all devices using server timestamp
 * - Color changes: Green → Yellow → Red based on time remaining
 */
const TimerDisplay = ({
  timerState,
  onTimeUp = null,
  size = 40,
  onClick = null
}) => {
  // Use synchronized timer hook for perfect synchronization
  const timeRemaining = useSynchronizedTimer(timerState, onTimeUp);

  // Calculate percentage for ring progress
  const percentage = timerState?.totalTime 
    ? (timeRemaining / timerState.totalTime) * 100 
    : 0;

  // Determine color based on time remaining with smooth gradient
  const getColor = () => {
    if (timerState?.isPaused) return '#9ca3af';
    
    const ratio = timerState?.totalTime 
      ? timeRemaining / timerState.totalTime 
      : 1;
    
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
    <div 
      onClick={onClick}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 0.2s',
      }}
      onMouseEnter={(e) => onClick && (e.currentTarget.style.transform = 'scale(1.05)')}
      onMouseLeave={(e) => onClick && (e.currentTarget.style.transform = 'scale(1)')}
      title={onClick ? "Click to skip to feedback" : undefined}
    >
      <RingProgress
        size={size}
        thickness={5}
        sections={[{ value: percentage, color: color }]}
        label={
          <Center>
            <Text size="md" fw={700} style={{ color: color }}>
              {timeRemaining}
            </Text>
          </Center>
        }
      />
    </div>
  );
};

export default TimerDisplay;
