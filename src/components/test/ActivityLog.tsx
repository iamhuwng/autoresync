/**
 * Activity Log Component
 * Displays real-time student activity feed during test sessions
 * 
 * Features:
 * - Student join events
 * - Answer submission events
 * - Test submission events
 * - Disconnect events
 * - Timestamped entries
 * - Auto-scrolling feed
 */

import React, { useEffect, useRef } from 'react';
import { Card, CardBody } from '../modern';

export interface ActivityLogEntry {
  id: string;
  timestamp: number;
  studentName: string;
  action: 'joined' | 'answered' | 'submitted' | 'disconnected';
  details?: string;
}

interface ActivityLogProps {
  /**
   * Array of activity entries
   */
  activities: ActivityLogEntry[];
  
  /**
   * Maximum number of entries to display
   */
  maxEntries?: number;
  
  /**
   * Whether to auto-scroll to latest
   */
  autoScroll?: boolean;
}

export const ActivityLog: React.FC<ActivityLogProps> = ({
  activities,
  maxEntries = 50,
  autoScroll = true,
}) => {
  
  const logEndRef = useRef<HTMLDivElement>(null);
  
  /**
   * Auto-scroll to bottom when new activities arrive
   */
  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activities, autoScroll]);
  
  /**
   * Get activity icon and color
   */
  const getActivityStyle = (action: ActivityLogEntry['action']) => {
    switch (action) {
      case 'joined':
        return { icon: '👋', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.1)' };
      case 'answered':
        return { icon: '✍️', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)' };
      case 'submitted':
        return { icon: '✓', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' };
      case 'disconnected':
        return { icon: '⚠', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' };
      default:
        return { icon: '•', color: '#64748b', bg: 'rgba(100, 116, 139, 0.1)' };
    }
  };
  
  /**
   * Format timestamp
   */
  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };
  
  /**
   * Get action text
   */
  const getActionText = (action: ActivityLogEntry['action'], details?: string): string => {
    switch (action) {
      case 'joined':
        return 'joined the session';
      case 'answered':
        return details || 'answered a question';
      case 'submitted':
        return 'submitted the test';
      case 'disconnected':
        return 'disconnected';
      default:
        return details || 'performed an action';
    }
  };
  
  // Limit entries displayed
  const displayedActivities = activities.slice(-maxEntries);
  
  return (
    <Card variant="glass">
      <CardBody style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: '#1e293b' }}>
              Activity Log
            </h3>
            <div
              style={{
                padding: '0.25rem 0.75rem',
                background: 'rgba(139, 92, 246, 0.1)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#8b5cf6',
              }}
            >
              {activities.length} events
            </div>
          </div>
          
          {/* Activity Feed */}
          <div
            style={{
              maxHeight: '400px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              padding: '0.5rem',
              background: 'rgba(248, 250, 252, 0.5)',
              borderRadius: '0.5rem',
            }}
          >
            {displayedActivities.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '2rem',
                  color: '#94a3b8',
                  fontSize: '0.875rem',
                  fontStyle: 'italic',
                }}
              >
                No activity yet. Waiting for students to join...
              </div>
            ) : (
              <>
                {displayedActivities.map((activity) => {
                  const style = getActivityStyle(activity.action);
                  
                  return (
                    <div
                      key={activity.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.75rem',
                        background: 'white',
                        borderRadius: '0.5rem',
                        borderLeft: `3px solid ${style.color}`,
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {/* Icon */}
                      <div
                        style={{
                          width: '2rem',
                          height: '2rem',
                          borderRadius: '50%',
                          background: style.bg,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1rem',
                          flexShrink: 0,
                        }}
                      >
                        {style.icon}
                      </div>
                      
                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.875rem', color: '#1e293b', lineHeight: 1.4 }}>
                          <strong style={{ fontWeight: 600 }}>{activity.studentName}</strong>
                          {' '}
                          <span style={{ color: '#64748b' }}>
                            {getActionText(activity.action, activity.details)}
                          </span>
                        </div>
                      </div>
                      
                      {/* Timestamp */}
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: '#94a3b8',
                          fontFamily: 'monospace',
                          fontWeight: 500,
                          flexShrink: 0,
                        }}
                      >
                        {formatTime(activity.timestamp)}
                      </div>
                    </div>
                  );
                })}
                
                {/* Scroll anchor */}
                <div ref={logEndRef} />
              </>
            )}
          </div>
          
          {/* Stats Footer */}
          {activities.length > 0 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-around',
                padding: '0.75rem',
                background: 'rgba(248, 250, 252, 0.8)',
                borderRadius: '0.5rem',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>👋</span>
                <span style={{ color: '#64748b' }}>
                  {activities.filter(a => a.action === 'joined').length} joined
                </span>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>✓</span>
                <span style={{ color: '#64748b' }}>
                  {activities.filter(a => a.action === 'submitted').length} submitted
                </span>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>⚠</span>
                <span style={{ color: '#64748b' }}>
                  {activities.filter(a => a.action === 'disconnected').length} disconnected
                </span>
              </div>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
};
