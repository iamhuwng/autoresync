import React, { useEffect, useState } from 'react';
import { Button, Card, NativeSelect } from './modern';

type LogLevelFilter = 'all' | 'log' | 'warn' | 'error' | 'info';

export interface DiagnosticLogEntry {
  time?: string;
  timestamp?: number;
  level?: string;
  message?: string;
  data?: string | null;
}

export interface DiagnosticBreadcrumbEntry {
  type?: string;
  target?: string;
  timestamp?: number;
  timeSincePageLoad?: number;
}

export interface DiagnosticBundle {
  errorId?: string;
  timestamp?: number;
  error?: {
    message?: string;
    stack?: string;
    componentStack?: string | null;
  };
  user?: {
    id?: string;
    name?: string;
    role?: string;
  };
  environment?: {
    browser?: string;
    screenSize?: string;
    page?: string;
    buildVersion?: string;
  };
  breadcrumbs?: DiagnosticBreadcrumbEntry[];
  diagnosticLogs?: DiagnosticLogEntry[];
}

interface DiagnosticViewerModalProps {
  opened: boolean;
  diagnosticUrl: string | null;
  errorTitle?: string;
  errorFeature?: string;
  errorSeverity?: string;
  onClose: () => void;
  onCopyForAntigravity?: () => void;
  onBundleLoaded?: (bundle: DiagnosticBundle) => void;
}

function formatTimestamp(timestamp?: number): string {
  if (!timestamp) {
    return 'Unknown';
  }

  return new Date(timestamp).toLocaleString();
}

function getLogTone(level?: string): { color: string; background: string } {
  if (level === 'error') {
    return {
      color: '#b91c1c',
      background: 'rgba(239, 68, 68, 0.12)',
    };
  }

  if (level === 'warn') {
    return {
      color: '#b45309',
      background: 'rgba(245, 158, 11, 0.14)',
    };
  }

  return {
    color: '#1d4ed8',
    background: 'rgba(37, 99, 235, 0.1)',
  };
}

const DiagnosticViewerModal: React.FC<DiagnosticViewerModalProps> = ({
  opened,
  diagnosticUrl,
  errorTitle,
  errorFeature,
  errorSeverity,
  onClose,
  onCopyForAntigravity,
  onBundleLoaded,
}) => {
  const [bundle, setBundle] = useState<DiagnosticBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState<LogLevelFilter>('all');

  useEffect(() => {
    if (!opened) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [opened, onClose]);

  useEffect(() => {
    if (!opened || !diagnosticUrl) {
      return;
    }

    let active = true;
    setLoading(true);
    setErrorMessage(null);

    fetch(diagnosticUrl)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        return response.json();
      })
      .then((result) => {
        if (!active) {
          return;
        }

        setBundle(result as DiagnosticBundle);
        onBundleLoaded?.(result as DiagnosticBundle);
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : 'Failed to load diagnostic bundle'
        );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [diagnosticUrl, onBundleLoaded, opened]);

  if (!opened) {
    return null;
  }

  const filteredLogs = (bundle?.diagnosticLogs || []).filter((entry) => {
    if (logFilter === 'all') {
      return true;
    }

    return entry.level === logFilter;
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        background: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(10px)',
        padding: '1.5rem',
        display: 'flex',
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '24px',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.98))',
          boxShadow: '0 30px 80px rgba(15, 23, 42, 0.28)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid rgba(226, 232, 240, 0.9)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.35rem 0.75rem',
                borderRadius: '999px',
                background: 'rgba(37, 99, 235, 0.08)',
                color: '#1d4ed8',
                fontWeight: 700,
                marginBottom: '0.75rem',
              }}
            >
              Full Diagnostic Bundle
            </div>
            <h2
              style={{
                margin: 0,
                color: '#0f172a',
                fontSize: '1.4rem',
                fontWeight: 800,
              }}
            >
              {bundle?.error?.message || errorTitle || 'Diagnostic Viewer'}
            </h2>
            <p style={{ margin: '0.45rem 0 0', color: '#475569', lineHeight: 1.6 }}>
              {errorFeature || 'Unknown feature'} · {errorSeverity || 'Unknown severity'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Button variant="glass" onClick={onCopyForAntigravity}>
              Copy for Antigravity
            </Button>
            <Button variant="glass" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.5fr) minmax(320px, 0.9fr)',
            gap: '1rem',
            padding: '1rem 1.5rem 1.5rem',
          }}
        >
          <Card variant="glass" style={{ padding: '1rem', minHeight: 0 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
                marginBottom: '1rem',
              }}
            >
              <div>
                <h3 style={{ margin: 0, color: '#0f172a' }}>Diagnostic Logs</h3>
                <p style={{ margin: '0.35rem 0 0', color: '#64748b' }}>
                  {filteredLogs.length} entries
                </p>
              </div>
              <div style={{ minWidth: '160px' }}>
                <NativeSelect
                  options={[
                    { value: 'all', label: 'All levels' },
                    { value: 'log', label: 'Log' },
                    { value: 'info', label: 'Info' },
                    { value: 'warn', label: 'Warn' },
                    { value: 'error', label: 'Error' },
                  ]}
                  value={logFilter}
                  onChange={(value) => setLogFilter(value as LogLevelFilter)}
                />
              </div>
            </div>

            <div
              style={{
                maxHeight: '100%',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                paddingRight: '0.35rem',
              }}
            >
              {loading && (
                <div style={{ color: '#475569', lineHeight: 1.6 }}>
                  Loading diagnostic bundle...
                </div>
              )}

              {errorMessage && (
                <div
                  style={{
                    padding: '0.9rem 1rem',
                    borderRadius: '14px',
                    background: 'rgba(239, 68, 68, 0.12)',
                    color: '#b91c1c',
                    fontWeight: 700,
                  }}
                >
                  {errorMessage}
                </div>
              )}

              {!loading && !errorMessage && filteredLogs.length === 0 && (
                <div style={{ color: '#475569', lineHeight: 1.6 }}>
                  No diagnostic logs were stored in this bundle.
                </div>
              )}

              {filteredLogs.map((entry, index) => {
                const tone = getLogTone(entry.level);

                return (
                  <div
                    key={`${entry.time || 'log'}-${index}`}
                    style={{
                      borderRadius: '16px',
                      padding: '0.85rem 1rem',
                      background: tone.background,
                      border: '1px solid rgba(226, 232, 240, 0.9)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.75rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          color: tone.color,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          fontSize: '0.8rem',
                        }}
                      >
                        <span
                          style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '999px',
                            background: tone.color,
                            flexShrink: 0,
                          }}
                        />
                        {entry.level || 'log'}
                      </span>
                      <span style={{ color: '#64748b', fontSize: '0.82rem' }}>
                        {entry.time || formatTimestamp(entry.timestamp)}
                      </span>
                    </div>
                    <div
                      style={{
                        marginTop: '0.6rem',
                        color: '#0f172a',
                        fontWeight: 600,
                        lineHeight: 1.6,
                      }}
                    >
                      {entry.message || 'No message'}
                    </div>
                    {entry.data && (
                      <pre
                        style={{
                          margin: '0.75rem 0 0',
                          padding: '0.75rem',
                          borderRadius: '12px',
                          background: 'rgba(15, 23, 42, 0.06)',
                          color: '#334155',
                          overflowX: 'auto',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {entry.data}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          <div
            style={{
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <Card variant="glass" style={{ padding: '1rem' }}>
              <h3 style={{ marginTop: 0, color: '#0f172a' }}>Environment</h3>
              <div style={{ display: 'grid', gap: '0.65rem' }}>
                {[
                  { label: 'Page', value: bundle?.environment?.page || 'Unknown' },
                  {
                    label: 'Screen',
                    value: bundle?.environment?.screenSize || 'Unknown',
                  },
                  {
                    label: 'Build',
                    value: bundle?.environment?.buildVersion || 'Unknown',
                  },
                  {
                    label: 'Captured At',
                    value: formatTimestamp(bundle?.timestamp),
                  },
                ].map((item) => (
                  <div key={item.label}>
                    <div
                      style={{
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        color: '#64748b',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {item.label}
                    </div>
                    <div style={{ marginTop: '0.2rem', color: '#0f172a', lineHeight: 1.5 }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card
              variant="glass"
              style={{ padding: '1rem', flex: 1, minHeight: 0, overflowY: 'auto' }}
            >
              <h3 style={{ marginTop: 0, color: '#0f172a' }}>Breadcrumbs</h3>
              {!bundle?.breadcrumbs?.length ? (
                <p style={{ margin: 0, color: '#475569', lineHeight: 1.6 }}>
                  No breadcrumb trail was available for this bundle.
                </p>
              ) : (
                <ol style={{ margin: '0.75rem 0 0', paddingLeft: '1.25rem', color: '#334155' }}>
                  {bundle.breadcrumbs.map((entry, index) => (
                    <li key={`${entry.timestamp || index}-${entry.target || 'crumb'}`}>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>
                        {entry.type || 'event'} · {entry.target || 'Unknown target'}
                      </div>
                      <div style={{ color: '#64748b', fontSize: '0.85rem' }}>
                        {formatTimestamp(entry.timestamp)} · +{entry.timeSincePageLoad || 0}
                        ms
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiagnosticViewerModal;
