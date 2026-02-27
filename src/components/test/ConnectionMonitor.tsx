/**
 * Connection Monitor Component
 * Monitors Firebase connection and displays warning when offline
 */

import React, { useState, useEffect } from 'react';
// @ts-ignore - Firebase is a .js file
import { database } from '../../services/firebase';
// @ts-ignore - Firebase is a .js file
import { ref, onValue } from 'firebase/database';

interface ConnectionMonitorProps {
  sessionCode?: string;
  onConnectionChange?: (isConnected: boolean) => void;
}

export const ConnectionMonitor: React.FC<ConnectionMonitorProps> = ({ 
  sessionCode, 
  onConnectionChange 
}) => {
  const [, setIsConnected] = useState(true); // State used only for updates
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    
    // Monitor Firebase connection state
    const connectedRef = ref(database, '.info/connected');
    
    const unsubscribe = onValue(connectedRef, (snapshot) => {
      const connected = snapshot.val() === true;
      setIsConnected(connected);
      
      if (!connected) {
        // Show warning after a brief delay to avoid flashing on quick disconnects
        timer = setTimeout(() => {
          setShowWarning(true);
          setReconnectAttempts(prev => prev + 1);
        }, 1000);
      } else {
        // Connected - hide warning
        setShowWarning(false);
        if (reconnectAttempts > 0) {
          // Successfully reconnected
          console.log('Connection restored after', reconnectAttempts, 'attempts');
        }
        // Clear timer if it exists
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      }
      
      // Notify parent component
      if (onConnectionChange) {
        onConnectionChange(connected);
      }
    });

    // Also monitor browser online/offline events
    const handleOnline = () => {
      console.log('Browser went online');
      // Firebase connection will update automatically
    };

    const handleOffline = () => {
      console.log('Browser went offline');
      setIsConnected(false);
      setShowWarning(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      // Clean up timer if it exists
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [reconnectAttempts, onConnectionChange]);

  if (!showWarning) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 10000,
      animation: 'slideDown 0.3s ease-out',
    }}>
      <style>
        {`
          @keyframes slideDown {
            from {
              opacity: 0;
              transform: translateX(-50%) translateY(-20px);
            }
            to {
              opacity: 1;
              transform: translateX(-50%) translateY(0);
            }
          }
          
          @keyframes pulse {
            0%, 100% {
              opacity: 1;
            }
            50% {
              opacity: 0.5;
            }
          }
        `}
      </style>
      
      <div style={{
        background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
        color: 'white',
        padding: '1rem 2rem',
        borderRadius: '1rem',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        minWidth: '300px',
      }}>
        {/* Warning Icon with Pulse Animation */}
        <div style={{
          fontSize: '1.5rem',
          animation: 'pulse 2s ease-in-out infinite',
        }}>
          ⚠️
        </div>
        
        {/* Message */}
        <div style={{ flex: 1 }}>
          <div style={{
            fontWeight: '600',
            fontSize: '1rem',
            marginBottom: '0.25rem',
          }}>
            Connection Lost
          </div>
          <div style={{
            fontSize: '0.875rem',
            opacity: 0.9,
          }}>
            {reconnectAttempts > 2 
              ? 'Having trouble reconnecting...' 
              : 'Attempting to reconnect...'}
          </div>
          {sessionCode && (
            <div style={{
              fontSize: '0.75rem',
              opacity: 0.8,
              marginTop: '0.25rem',
            }}>
              Session: {sessionCode}
            </div>
          )}
        </div>
        
        {/* Spinner */}
        <div style={{
          width: '20px',
          height: '20px',
          border: '2px solid rgba(255, 255, 255, 0.3)',
          borderTop: '2px solid white',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }}>
          <style>
            {`
              @keyframes spin {
                to {
                  transform: rotate(360deg);
                }
              }
            `}
          </style>
        </div>
      </div>
      
      {/* Additional Info for Long Disconnects */}
      {reconnectAttempts > 5 && (
        <div style={{
          marginTop: '0.5rem',
          background: 'white',
          color: '#1e293b',
          padding: '0.75rem 1.5rem',
          borderRadius: '0.5rem',
          boxShadow: '0 5px 15px rgba(0, 0, 0, 0.2)',
          fontSize: '0.875rem',
        }}>
          <strong>Tips:</strong>
          <ul style={{ margin: '0.5rem 0 0 1.5rem', padding: 0 }}>
            <li>Check your internet connection</li>
            <li>Your answers are auto-saved</li>
            <li>Try refreshing if problem persists</li>
          </ul>
        </div>
      )}
    </div>
  );
};

/**
 * Connection Status Indicator
 * Small indicator to show current connection status
 */
export const ConnectionStatusIndicator: React.FC = () => {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    const connectedRef = ref(database, '.info/connected');
    
    const unsubscribe = onValue(connectedRef, (snapshot) => {
      setIsConnected(snapshot.val() === true);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div 
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 1rem',
        background: isConnected ? '#10b981' : '#ef4444',
        color: 'white',
        borderRadius: '2rem',
        fontSize: '0.75rem',
        fontWeight: '600',
        opacity: isConnected ? 0.8 : 1,
        transition: 'all 0.3s ease',
        cursor: 'default',
      }}
      title={isConnected ? 'Connected to server' : 'Connection lost'}
    >
      <div style={{
        width: '8px',
        height: '8px',
        background: 'white',
        borderRadius: '50%',
        animation: isConnected ? 'none' : 'pulse 2s ease-in-out infinite',
      }} />
      {isConnected ? 'Connected' : 'Offline'}
    </div>
  );
};

export default ConnectionMonitor;
