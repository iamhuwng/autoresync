
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const LogContext = createContext();

export const useLog = () => useContext(LogContext);

export const LogProvider = ({ children }) => {
  const [logs, setLogs] = useState([]);
  const [showTextarea, setShowTextarea] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isOpen, setIsOpen] = useState(false); // Start hidden
  const textareaRef = React.useRef(null);
  const saveTimerRef = React.useRef(null);

  useEffect(() => {
    const storedLogs = sessionStorage.getItem('debugLogs');
    if (storedLogs) {
      setLogs(JSON.parse(storedLogs));
    }
  }, []);

  // Memoize addLog to prevent infinite re-render loops
  // PERFORMANCE FIX: Debounce sessionStorage writes to avoid blocking I/O during drawing
  const addLog = useCallback((log) => {
    const newLog = `[${new Date().toISOString()}] ${log}`;
    setLogs(prevLogs => {
      const updatedLogs = [...prevLogs, newLog];
      
      // Debounce sessionStorage writes (save after 500ms of inactivity)
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(() => {
        sessionStorage.setItem('debugLogs', JSON.stringify(updatedLogs));
      }, 500);
      
      return updatedLogs;
    });
  }, []);

  // Memoize clearLogs to prevent infinite re-render loops
  const clearLogs = useCallback(() => {
    setLogs([]);
    sessionStorage.removeItem('debugLogs');
  }, []);

  const handleSelectAll = () => {
    setShowTextarea(true);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.select();
        textareaRef.current.setSelectionRange(0, 99999); // For mobile devices
      }
    }, 100);
  };

  const handleCopy = async () => {
    const logsText = logs.join('\n');
    
    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(logsText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      } catch (err) {
        console.log('Clipboard API failed, using fallback');
      }
    }
    
    // Fallback: use textarea selection
    setShowTextarea(true);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.select();
        textareaRef.current.setSelectionRange(0, 99999);
        try {
          document.execCommand('copy');
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch (err) {
          alert('Please manually select and copy the text');
        }
      }
    }, 100);
  };

  return (
    <LogContext.Provider value={{ addLog, clearLogs }}>
      {children}
      
      {/* Minimized: Small floating button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          style={{
            position: 'fixed',
            bottom: '10px',
            left: '10px',
            width: '50px',
            height: '50px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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
          title="Open Debug Logs"
        >
          🐛
        </button>
      )}
      
      {/* Maximized: Full debug panel */}
      {isOpen && (
        <div style={{
          position: 'fixed',
          bottom: '10px',
          left: '10px',
          width: 'min(90vw, 400px)',
          maxHeight: '50vh',
          background: 'rgba(0, 0, 0, 0.95)',
          color: 'white',
          borderRadius: '12px',
          zIndex: 9999,
          fontSize: '12px',
          fontFamily: 'monospace',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* Header with minimize button */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            padding: '12px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderTopLeftRadius: '12px',
            borderTopRightRadius: '12px'
          }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>
              🐛 Debug Logs ({logs.length})
            </h3>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                color: 'white',
                border: 'none',
                padding: '4px 8px',
                cursor: 'pointer',
                borderRadius: '4px',
                fontSize: '16px',
                fontWeight: 'bold',
                lineHeight: 1
              }}
              title="Minimize"
            >
              ─
            </button>
          </div>
          
          {/* Action buttons */}
          <div style={{
            padding: '8px',
            display: 'flex',
            gap: '5px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            flexWrap: 'wrap'
          }}>
            <button 
              onClick={handleSelectAll} 
              style={{ 
                flex: '1 1 auto',
                background: '#3b82f6', 
                color: 'white', 
                border: 'none', 
                padding: '6px 10px', 
                cursor: 'pointer',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: '600',
                whiteSpace: 'nowrap'
              }}
            >
              📝 Select All
            </button>
            <button 
              onClick={handleCopy} 
              style={{ 
                flex: '1 1 auto',
                background: copied ? '#10b981' : '#8b5cf6', 
                color: 'white', 
                border: 'none', 
                padding: '6px 10px', 
                cursor: 'pointer',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: '600',
                whiteSpace: 'nowrap'
              }}
            >
              {copied ? '✓ Copied!' : '📋 Copy'}
            </button>
            <button 
              onClick={clearLogs} 
              style={{ 
                flex: '1 1 auto',
                background: '#ef4444', 
                color: 'white', 
                border: 'none', 
                padding: '6px 10px', 
                cursor: 'pointer',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: '600',
                whiteSpace: 'nowrap'
              }}
            >
              🗑️ Clear
            </button>
          </div>
          
          {/* Hidden textarea for mobile copy/select */}
          {showTextarea && (
            <div style={{ padding: '8px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <textarea
                ref={textareaRef}
                value={logs.join('\n')}
                readOnly
                style={{
                  width: '100%',
                  height: '120px',
                  padding: '8px',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  background: '#1e293b',
                  color: '#fff',
                  border: '1px solid #475569',
                  borderRadius: '4px',
                  resize: 'vertical',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          )}
          
          {/* Log display */}
          <div style={{ 
            flex: 1,
            overflowY: 'auto', 
            padding: '12px',
            minHeight: '100px'
          }}>
            {logs.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#888', padding: '20px' }}>
                No logs yet
              </div>
            ) : (
              logs.map((log, index) => (
                <div key={index} style={{ 
                  marginBottom: '6px', 
                  padding: '6px',
                  background: 'rgba(59, 130, 246, 0.1)',
                  borderLeft: '3px solid #3b82f6',
                  paddingLeft: '8px',
                  borderRadius: '2px',
                  wordBreak: 'break-word',
                  fontSize: '11px',
                  lineHeight: '1.4'
                }}>
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </LogContext.Provider>
  );
};
