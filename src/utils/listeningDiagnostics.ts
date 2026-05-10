const LISTENING_DIAGNOSTICS_STORAGE_KEY = 'listening_diagnostics';
const LISTENING_DIAGNOSTICS_QUERY_KEY = 'diagListening';

function readListeningDiagnosticsFlag(): boolean {
  if (import.meta.env.DEV) {
    return true;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const queryValue = new URLSearchParams(window.location.search).get(
      LISTENING_DIAGNOSTICS_QUERY_KEY,
    );
    if (queryValue === '1' || queryValue === 'true') {
      return true;
    }

    const storedValue = window.localStorage.getItem(LISTENING_DIAGNOSTICS_STORAGE_KEY);
    return storedValue === '1' || storedValue === 'true';
  } catch {
    return false;
  }
}

const listeningDiagnosticsEnabled = readListeningDiagnosticsFlag();

export const listeningDiagnostics = {
  enabled: listeningDiagnosticsEnabled,
  log: (...args: unknown[]) => {
    if (listeningDiagnosticsEnabled) {
      console.log(...args);
    }
  },
  info: (...args: unknown[]) => {
    if (listeningDiagnosticsEnabled) {
      console.info(...args);
    }
  },
  warn: (...args: unknown[]) => {
    if (listeningDiagnosticsEnabled) {
      console.warn(...args);
    }
  },
};

export const LISTENING_DIAGNOSTICS_KEYS = {
  query: LISTENING_DIAGNOSTICS_QUERY_KEY,
  storage: LISTENING_DIAGNOSTICS_STORAGE_KEY,
};
