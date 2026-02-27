import React from 'react';

/**
 * RocketSprite Component
 * 
 * A unified SVG rocket with integrated exhaust flame.
 * Rocket and flame are a single entity that moves together.
 * 
 * @param {Object} props
 * @param {number} props.streak - Current streak (0-10+), affects flame size
 * @param {boolean} props.isLeader - If true, applies golden glow
 * @param {Object} props.color - Player color scheme { body, fire, fin }
 * @param {number} props.score - Player score to display
 * @param {string} props.className - Additional CSS classes
 * @param {Object} props.style - Additional inline styles
 */
const RocketSprite = ({ 
  streak = 0, 
  isLeader = false, 
  color = { body: '#3b82f6', fire: '#60a5fa', fin: '#2563eb' },
  score = 0,
  className = '',
  style = {}
}) => {
  // Calculate flame size based on streak
  const baseFlameHeight = 20;
  const flameHeight = streak > 0 ? baseFlameHeight + (streak * 15) : 0;
  
  // Total SVG height: rocket (80px) + flame
  const totalHeight = 80 + flameHeight;
  const viewBox = `0 0 60 ${totalHeight}`;
  
  // Unique gradient ID for this sprite
  const flameGradientId = `flame-gradient-${Math.random().toString(36).substr(2, 9)}`;
  
  return (
    <svg
      className={`rocket-sprite ${className}`}
      viewBox={viewBox}
      width="60"
      height={totalHeight}
      style={{
        filter: isLeader ? 'drop-shadow(0 0 15px rgba(255, 215, 0, 0.8))' : 'none',
        ...style
      }}
    >
      <defs>
        {/* Flame gradient - hot white to player color to yellow */}
        <linearGradient id={flameGradientId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(255, 255, 255, 0.95)" />
          <stop offset="20%" stopColor={color.fire} stopOpacity="0.9" />
          <stop offset="60%" stopColor="rgba(255, 200, 0, 0.7)" />
          <stop offset="100%" stopColor="rgba(255, 255, 100, 0.3)" />
        </linearGradient>
        
        {/* Rocket body gradient */}
        <linearGradient id={`body-gradient-${flameGradientId}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color.body} />
          <stop offset="100%" stopColor={color.body} stopOpacity="0.8" />
        </linearGradient>
      </defs>
      
      {/* Exhaust flame - only if streak > 0 */}
      {streak > 0 && (
        <g className="rocket-flame">
          {/* Main flame shape */}
          <path
            d={`
              M 30 80
              Q 20 ${80 + flameHeight * 0.5} 22 ${80 + flameHeight}
              Q 30 ${80 + flameHeight * 0.85} 38 ${80 + flameHeight}
              Q 40 ${80 + flameHeight * 0.5} 30 80
              Z
            `}
            fill={`url(#${flameGradientId})`}
            opacity="0.9"
          />
          
          {/* Inner bright core */}
          <path
            d={`
              M 30 80
              Q 25 ${80 + flameHeight * 0.4} 26 ${80 + flameHeight * 0.7}
              Q 30 ${80 + flameHeight * 0.6} 34 ${80 + flameHeight * 0.7}
              Q 35 ${80 + flameHeight * 0.4} 30 80
              Z
            `}
            fill="rgba(255, 255, 255, 0.8)"
            opacity="0.9"
          />
        </g>
      )}
      
      {/* Rocket body */}
      <g className="rocket-body">
        {/* Nose cone */}
        <path
          d="M 30 5 L 18 28 L 42 28 Z"
          fill={`url(#body-gradient-${flameGradientId})`}
          stroke={color.body}
          strokeWidth="1"
        />
        
        {/* Main body */}
        <rect
          x="18"
          y="28"
          width="24"
          height="42"
          fill={`url(#body-gradient-${flameGradientId})`}
          rx="2"
          stroke={color.body}
          strokeWidth="1"
        />
        
        {/* Window */}
        <circle
          cx="30"
          cy="45"
          r="7"
          fill="rgba(100, 200, 255, 0.7)"
          stroke="rgba(50, 150, 255, 0.9)"
          strokeWidth="1.5"
        />
        
        {/* Window highlight */}
        <circle
          cx="28"
          cy="43"
          r="2.5"
          fill="rgba(255, 255, 255, 0.8)"
        />
        
        {/* Left fin */}
        <path
          d="M 18 60 L 8 75 L 18 75 Z"
          fill={color.fin}
          stroke={color.body}
          strokeWidth="1"
        />
        
        {/* Right fin */}
        <path
          d="M 42 60 L 52 75 L 42 75 Z"
          fill={color.fin}
          stroke={color.body}
          strokeWidth="1"
        />
        
        {/* Score display */}
        <text
          x="30"
          y="50"
          textAnchor="middle"
          fontSize="9"
          fontWeight="bold"
          fill="white"
          stroke="rgba(0, 0, 0, 0.5)"
          strokeWidth="0.5"
        >
          {score}
        </text>
      </g>
      
      {/* Leader crown */}
      {isLeader && (
        <text
          x="30"
          y="0"
          textAnchor="middle"
          fontSize="14"
          transform="translate(0, -5)"
        >
          👑
        </text>
      )}
    </svg>
  );
};

export default RocketSprite;
