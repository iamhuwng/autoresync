/**
 * DiagnosticLogger - Captures console logs and events for mobile debugging
 * Automatically saves to localStorage and provides download functionality
 */

class DiagnosticLogger {
  constructor(maxLogs = 500) {
    this.logs = [];
    this.maxLogs = maxLogs;
    this.storageKey = 'diagnostic_logs';
    this.startTime = Date.now();
    this.storageAvailable = this.testLocalStorage();
    
    // Load existing logs from localStorage if available
    if (this.storageAvailable) {
      this.loadLogs();
    }
    
    // Intercept console methods
    this.interceptConsole();
    
    // Auto-save every 2 seconds (only if localStorage is available)
    if (this.storageAvailable) {
      this.autoSaveInterval = setInterval(() => {
        this.saveLogs();
      }, 2000);
    }
    
    // Add initial log to confirm logger is working
    this.log('info', 'DiagnosticLogger initialized', { 
      storageAvailable: this.storageAvailable,
      mode: this.storageAvailable ? 'localStorage' : 'memory-only'
    });
  }

  testLocalStorage() {
    try {
      const testKey = '__test_storage__';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      // localStorage not available (incognito mode, quota exceeded, etc.)
      return false;
    }
  }

  loadLogs() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.logs = JSON.parse(stored);
      }
    } catch (e) {
      // Silently fail - will use memory-only mode
    }
  }

  saveLogs() {
    if (!this.storageAvailable) return;
    
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.logs));
    } catch (e) {
      // If localStorage is full, remove oldest logs
      if (this.logs.length > 100) {
        this.logs = this.logs.slice(-100);
        try {
          localStorage.setItem(this.storageKey, JSON.stringify(this.logs));
        } catch (e2) {
          // Give up on localStorage
          this.storageAvailable = false;
        }
      }
    }
  }

  log(level, message, data = null) {
    const timestamp = Date.now() - this.startTime;
    const entry = {
      timestamp,
      time: new Date().toISOString(),
      level,
      message,
      data: data ? JSON.stringify(data) : null,
      userAgent: navigator.userAgent,
      screenSize: `${window.innerWidth}x${window.innerHeight}`
    };

    this.logs.push(entry);

    // Keep only the last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Auto-save is handled by interval
  }

  interceptConsole() {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const self = this;

    const formatArg = (arg) => {
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    };

    console.log = function(...args) {
      const message = args.map(formatArg).join(' ');
      self.log('log', message);
      originalLog.apply(console, args);
    };

    console.warn = function(...args) {
      const message = args.map(formatArg).join(' ');
      self.log('warn', message);
      originalWarn.apply(console, args);
    };

    console.error = function(...args) {
      const message = args.map(formatArg).join(' ');
      self.log('error', message);
      originalError.apply(console, args);
    };
  }

  getLogs() {
    return this.logs;
  }

  getLogsAsText() {
    return this.logs.map(log => {
      const parts = [
        `[${log.time}]`,
        `[+${log.timestamp}ms]`,
        `[${log.level.toUpperCase()}]`,
        log.message
      ];
      if (log.data) {
        parts.push(`\nData: ${log.data}`);
      }
      return parts.join(' ');
    }).join('\n\n');
  }

  downloadLogs() {
    const text = this.getLogsAsText();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diagnostic-logs-${new Date().toISOString().replace(/:/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  copyToClipboard() {
    const text = this.getLogsAsText();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text)
        .then(() => true)
        .catch(() => false);
    }
    return Promise.resolve(false);
  }

  clear() {
    this.logs = [];
    localStorage.removeItem(this.storageKey);
  }

  destroy() {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
    this.saveLogs();
  }
}

// Create a singleton instance
let diagnosticLoggerInstance = null;

export const getDiagnosticLogger = () => {
  if (!diagnosticLoggerInstance) {
    diagnosticLoggerInstance = new DiagnosticLogger();
  }
  return diagnosticLoggerInstance;
};

export default DiagnosticLogger;
