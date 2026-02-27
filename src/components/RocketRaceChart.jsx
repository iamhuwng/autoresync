import React, { useMemo, useState, useEffect } from 'react';
import { Paper, Text, Box } from '@mantine/core';
import RocketSprite from './RocketSprite';
import './RocketRaceChart.css';

const RocketRaceChart = ({ players }) => {
  const [prevScores, setPrevScores] = useState({});
  const [floatingScores, setFloatingScores] = useState({});

  const playersArray = useMemo(() => {
    if (!players) return [];
    return Object.values(players).sort((a, b) => b.score - a.score);
  }, [players]);

  // Calculate correct answer streak for each player
  const getStreak = (player) => {
    if (!player.answers) return 0;
    const answerIndices = Object.keys(player.answers).map(Number).sort((a, b) => b - a);
    let streak = 0;
    for (const idx of answerIndices) {
      if (player.answers[idx]?.isCorrect) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  };

  // Count total correct answers for each player
  const getCorrectCount = (player) => {
    if (!player.answers) return 0;
    return Object.values(player.answers).filter(a => a?.isCorrect).length;
  };

  // Track score changes and show floating animation
  useEffect(() => {
    if (!players) return;

    const newFloatingScores = {};
    Object.entries(players).forEach(([id, player]) => {
      const currentScore = player.score || 0;
      const previousScore = prevScores[id] || 0;
      
      if (currentScore > previousScore) {
        const scoreDiff = currentScore - previousScore;
        newFloatingScores[id] = {
          value: scoreDiff,
          timestamp: Date.now()
        };
      }
    });

    if (Object.keys(newFloatingScores).length > 0) {
      setFloatingScores(newFloatingScores);
      
      // Remove floating scores after animation
      setTimeout(() => {
        setFloatingScores({});
      }, 2000);
    }

    // Update previous scores
    const newPrevScores = {};
    Object.entries(players).forEach(([id, player]) => {
      newPrevScores[id] = player.score || 0;
    });
    setPrevScores(newPrevScores);
  }, [players]);

  // Calculate position based on correct answers + streak bonus
  const getPosition = (player) => {
    const correctCount = getCorrectCount(player);
    const streak = getStreak(player);
    
    if (correctCount === 0) return 0; // Start at ground
    
    // Base height: 15% per correct answer
    let height = correctCount * 15;
    
    // Streak bonus: +5% per streak level
    if (streak >= 2) height += (streak - 1) * 5;
    
    // Cap at 90% to keep visible
    return Math.min(height, 90);
  };

  const isLeader = (index) => index === 0 && playersArray.length > 1;

  // Player color schemes
  const PLAYER_COLORS = [
    { body: '#ef4444', fire: '#ff6b6b', fin: '#dc2626' },  // Red
    { body: '#3b82f6', fire: '#60a5fa', fin: '#2563eb' },  // Blue
    { body: '#10b981', fire: '#34d399', fin: '#059669' },  // Green
    { body: '#f59e0b', fire: '#fbbf24', fin: '#d97706' },  // Yellow
    { body: '#a855f7', fire: '#c084fc', fin: '#9333ea' },  // Purple
    { body: '#ec4899', fire: '#f472b6', fin: '#db2777' },  // Pink
    { body: '#14b8a6', fire: '#2dd4bf', fin: '#0d9488' },  // Teal
    { body: '#f97316', fire: '#fb923c', fin: '#ea580c' },  // Orange
    { body: '#8b5cf6', fire: '#a78bfa', fin: '#7c3aed' },  // Violet
    { body: '#06b6d4', fire: '#22d3ee', fin: '#0891b2' },  // Cyan
  ];

  const getPlayerColor = (index) => PLAYER_COLORS[index % PLAYER_COLORS.length];

  return (
    <Paper
      p="md"
      radius="md"
      className="rocket-race-container"
      style={{
        background: 'linear-gradient(135deg, #0a0520 0%, #1a0f3a 50%, #2d1b4e 100%)',
        position: 'relative',
        overflow: 'hidden',
        height: '100%',
        minHeight: '300px',
      }}
    >
      {/* Enhanced space background */}
      <div className="stars"></div>
      <div className="stars2"></div>
      <div className="stars3"></div>
      <div className="nebula nebula-pink"></div>
      <div className="nebula nebula-cyan"></div>
      
      {/* Planets */}
      <div className="planet planet-destination"></div>
      <div className="planet planet-mars"></div>
      <div className="planet planet-small"></div>

      {/* Title */}
      <Text
        size="lg"
        fw={700}
        mb="md"
        style={{
          color: '#fff',
          textAlign: 'center',
          textShadow: '0 0 10px rgba(255,255,255,0.5)',
          position: 'relative',
          zIndex: 10,
        }}
      >
        🚀 Rocket Race 🚀
      </Text>

      {/* Horizontal race lanes */}
      <Box style={{ 
        position: 'relative', 
        zIndex: 5,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        height: 'calc(100% - 60px)',
        paddingTop: '10px'
      }}>
        {playersArray.map((player, index) => {
          const position = getPosition(player);
          const leader = isLeader(index);
          const streak = getStreak(player);
          const playerId = Object.keys(players).find(id => players[id].name === player.name);
          const floatingScore = floatingScores[playerId];
          const playerColor = getPlayerColor(index);

          return (
            <div
              key={player.name || index}
              className="race-lane"
              style={{
                position: 'relative',
                flex: '1',
                minHeight: '60px',
                display: 'flex',
                alignItems: 'center',
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '8px',
                padding: '8px',
              }}
            >
              {/* Player name - Left side */}
              <div style={{ 
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 1
              }}>
                <Text
                  size="xs"
                  fw={leader ? 700 : 500}
                  style={{
                    color: leader ? '#ffd700' : '#fff',
                    textShadow: leader ? '0 0 5px rgba(255,215,0,0.5)' : '0 0 3px rgba(0,0,0,0.5)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {player.name}
                </Text>
              </div>

              {/* Finish line - Right side */}
              <div className="finish-line" style={{
                position: 'absolute',
                right: '20px',
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '2rem',
                opacity: 0.3,
              }}>
                🏁
              </div>

              {/* Rocket - Moves horizontally */}
              <div
                className={`rocket-horizontal ${leader ? 'rocket-leader' : ''}`}
                style={{
                  position: 'absolute',
                  left: `calc(120px + ${position}% * 0.75)`, // Start after name, race to 75% width
                  top: '50%',
                  transform: 'translateY(-50%) rotate(-90deg)', // Rotate to point right
                  transition: 'left 0.8s cubic-bezier(0.4, 0.0, 0.2, 1)',
                  zIndex: 10,
                }}
              >
                <RocketSprite
                  streak={streak}
                  isLeader={leader}
                  color={playerColor}
                  score={player.score || 0}
                  className="rocket-sprite-racing"
                />
              </div>

              {/* Explosion burst effect */}
              {floatingScore && (
                <div
                  className="explosion-burst"
                  style={{
                    position: 'absolute',
                    left: `calc(120px + ${position}% * 0.75)`,
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'none',
                    zIndex: 15
                  }}
                >
                  <div className="burst-ring"></div>
                  <div className="burst-particles">
                    <span className="burst-particle">💥</span>
                    <span className="burst-particle">✨</span>
                    <span className="burst-particle">⭐</span>
                  </div>
                  <div className="score-popup">+{floatingScore.value}</div>
                </div>
              )}

              {/* Particle trail */}
              {position > 5 && (
                <div className="rocket-trail-horizontal" style={{ 
                  position: 'absolute',
                  left: `calc(120px + ${position}% * 0.75 - 80px)`,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  display: 'flex',
                  gap: '12px',
                  pointerEvents: 'none',
                }}>
                  <span className="particle">✨</span>
                  <span className="particle" style={{ animationDelay: '0.2s' }}>✨</span>
                  <span className="particle" style={{ animationDelay: '0.4s' }}>✨</span>
                </div>
              )}
            </div>
          );
        })}
      </Box>

      {/* No players message */}
      {playersArray.length === 0 && (
        <Text
          ta="center"
          c="dimmed"
          size="lg"
          style={{
            color: 'rgba(255,255,255,0.5)',
            marginTop: '60px',
          }}
        >
          Waiting for players to join the race...
        </Text>
      )}
    </Paper>
  );
};

export default RocketRaceChart;
