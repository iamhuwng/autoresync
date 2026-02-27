import React, { useState, useEffect } from 'react';
import { getDiagnosticLogger } from '../utils/diagnosticLogger';

/**
 * DiagnosticPanel - Floating panel to view and manage diagnostic logs
 * Shows a small button that expands to show logs
 */
const DiagnosticPanel = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState([]);
  const [copied, setCopied] = useState(false);
  const logger = getDiagnosticLogger();

  useEffect(() => {
    if (isOpen) {
      // Refresh logs when panel is opened
      setLogs(logger.getLogs());
      
      // Refresh every second while open
      const interval = setInterval(() => {
        setLogs(logger.getLogs());
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [isOpen, logger]);

  const handleDownload = () => {
    logger.downloadLogs();
  };

  const handleCopy = async () => {
    const success = await logger.copyToClipboard();
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      alert('Failed to copy to clipboard');
    }
  };

  const handleClear = () => {
    if (window.confirm('Clear all diagnostic logs?')) {
      logger.clear();
      setLogs([]);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => {
          console.log('Diagnostic panel button clicked');
          setIsOpen(true);
        }}
        onTouchEnd={() => {
          console.log('Diagnostic panel button touched');
        }}
        style={{
          position: 'fixed',
          bottom: '10px',
          right: '10px',
          width: '50px',
          height: '50px',
          borderRadius: '50%',
          backgroundColor: '#8b5cf6',
          color: 'white',
          border: 'none',
          fontSize: '20px',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 'bold'
        }}
      >
        🔧
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '10px',
        right: '10px',
        width: 'min(90vw, 400px)',
        maxHeight: '70vh',
        backgroundColor: 'rgba(0, 0, 0, 0.95)',
        color: '#fff',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          backgroundColor: '#8b5cf6',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTopLeftRadius: '12px',
          borderTopRightRadius: '12px'
        }}
      >
        <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
          📊 Diagnostic Logs ({logs.length})
        </div>
        <button
          onClick={() => setIsOpen(false)}
          style={{
            background: 'none',
            border: 'none',
            color: 'white',
            fontSize: '20px',
            cursor: 'pointer',
            padding: '0',
            width: '24px',
            height: '24px'
          }}
        >
          ×
        </button>
      </div>

      {/* Action Buttons */}
      <div
        style={{
          padding: '8px',
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
        }}
      >
        <button
          onClick={handleDownload}
          style={{
            flex: 1,
            padding: '8px',
            backgroundColor: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '12px',
            cursor: 'pointer',
            fontWeight: '600'
          }}
        >
          💾 Download
        </button>
        <button
          onClick={handleCopy}
          style={{
            flex: 1,
            padding: '8px',
            backgroundColor: copied ? '#10b981' : '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '12px',
            cursor: 'pointer',
            fontWeight: '600'
          }}
        >
          {copied ? '✓ Copied!' : '📋 Copy'}
        </button>
        <button
          onClick={handleClear}
          style={{
            flex: 1,
            padding: '8px',
            backgroundColor: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '12px',
            cursor: 'pointer',
            fontWeight: '600'
          }}
        >
          🗑️ Clear
        </button>
      </div>

      {/* Logs Display */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px',
          fontSize: '11px',
          fontFamily: 'monospace',
          lineHeight: '1.4'
        }}
      >
        {logs.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#888', padding: '20px' }}>
            No logs yet
          </div>
        ) : (
          logs.slice().reverse().map((log, index) => (
            <div
              key={index}
              style={{
                marginBottom: '8px',
                padding: '8px',
                backgroundColor: 
                  log.level === 'error' ? 'rgba(239, 68, 68, 0.2)' :
                  log.level === 'warn' ? 'rgba(245, 158, 11, 0.2)' :
                  'rgba(59, 130, 246, 0.1)',
                borderRadius: '4px',
                borderLeft: `3px solid ${
                  log.level === 'error' ? '#ef4444' :
                  log.level === 'warn' ? '#f59e0b' :
                  '#3b82f6'
                }`
              }}
            >
              <div style={{ color: '#888', fontSize: '10px', marginBottom: '4px' }}>
                {new Date(log.time).toLocaleTimeString()} (+{log.timestamp}ms)
              </div>
              <div style={{ color: '#fff', wordBreak: 'break-word' }}>
                {log.message}
              </div>
              {log.data && (
                <div style={{ color: '#aaa', fontSize: '10px', marginTop: '4px', wordBreak: 'break-all' }}>
                  {log.data}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Info Footer */}
      <div
        style={{
          padding: '8px 12px',
          fontSize: '10px',
          color: '#888',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          textAlign: 'center'
        }}
      >
        {logger.storageAvailable ? 'Auto-saved to localStorage' : 'Memory-only (Incognito mode)'} • {navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop'}
      </div>
    </div>
  );
};

export default DiagnosticPanel;
