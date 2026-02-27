/**
 * Two Column Layout Component
 * Resizable two-column layout with draggable divider
 * Used for IELTS-style test interface (passages | questions)
 */

import React, { useState, useRef, useEffect, ReactNode } from 'react';

interface TwoColumnLayoutProps {
  leftColumn: ReactNode;
  rightColumn: ReactNode;
  minLeftWidth?: number;
  maxLeftWidth?: number;
  defaultLeftWidth?: number;
  onResize?: (leftWidth: number) => void;
}

export const TwoColumnLayout: React.FC<TwoColumnLayoutProps> = ({
  leftColumn,
  rightColumn,
  minLeftWidth = 30,
  maxLeftWidth = 70,
  defaultLeftWidth = 50,
  onResize,
}) => {
  const [leftWidth, setLeftWidth] = useState(defaultLeftWidth);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  /**
   * Handle mouse down on divider
   */
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  /**
   * Handle mouse move during drag
   */
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;
      
      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      const containerWidth = containerRect.width;
      
      // Calculate new left width as percentage
      const newLeftWidth = ((e.clientX - containerRect.left) / containerWidth) * 100;
      
      // Apply constraints
      const constrainedWidth = Math.min(
        Math.max(newLeftWidth, minLeftWidth),
        maxLeftWidth
      );
      
      setLeftWidth(constrainedWidth);
      
      // Callback for parent component
      if (onResize) {
        onResize(constrainedWidth);
      }
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
    };
    
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      // Prevent text selection while dragging
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging, minLeftWidth, maxLeftWidth, onResize]);
  
  return (
    <div 
      ref={containerRef}
      style={{ 
        display: 'flex',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Left Column */}
      <div
        style={{
          width: `${leftWidth}%`,
          height: '100%',
          overflow: 'auto',
          background: 'white',
          transition: isDragging ? 'none' : 'width 0.1s ease',
        }}
      >
        {leftColumn}
      </div>
      
      {/* Resizable Divider */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          width: '4px',
          height: '100%',
          background: isDragging ? '#8b5cf6' : '#e2e8f0',
          cursor: 'col-resize',
          flexShrink: 0,
          position: 'relative',
          transition: isDragging ? 'none' : 'background 0.2s ease',
        }}
        onMouseEnter={(e) => {
          if (!isDragging) {
            e.currentTarget.style.background = '#cbd5e1';
          }
        }}
        onMouseLeave={(e) => {
          if (!isDragging) {
            e.currentTarget.style.background = '#e2e8f0';
          }
        }}
      >
        {/* Drag Handle (visible on hover) */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '20px',
            height: '60px',
            background: isDragging ? '#8b5cf6' : '#94a3b8',
            borderRadius: '4px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            opacity: isDragging ? 1 : 0,
            transition: 'opacity 0.2s ease',
            pointerEvents: 'none',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '1';
          }}
        >
          <div style={{ 
            width: '2px', 
            height: '4px', 
            background: 'white', 
            borderRadius: '1px' 
          }} />
          <div style={{ 
            width: '2px', 
            height: '4px', 
            background: 'white', 
            borderRadius: '1px' 
          }} />
          <div style={{ 
            width: '2px', 
            height: '4px', 
            background: 'white', 
            borderRadius: '1px' 
          }} />
        </div>
      </div>
      
      {/* Right Column */}
      <div
        style={{
          width: `${100 - leftWidth}%`,
          height: '100%',
          overflow: 'auto',
          background: '#fafafa',
          transition: isDragging ? 'none' : 'width 0.1s ease',
        }}
      >
        {rightColumn}
      </div>
      
      {/* Dragging Overlay */}
      {isDragging && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            cursor: 'col-resize',
          }}
        />
      )}
    </div>
  );
};
