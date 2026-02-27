/**
 * Test Error Boundary Component
 * Specialized error boundary for test pages
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { sessionService } from '../../services/sessionService';

interface Props {
  children: ReactNode;
  sessionCode?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCount: number;
}

export class TestErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Test Error Boundary caught error:', error, errorInfo);
    
    this.setState(prev => ({
      errorInfo,
      errorCount: prev.errorCount + 1
    }));
    
    // Log error with context
    const errorContext = {
      sessionCode: this.props.sessionCode,
      playerId: sessionService.getPlayerId(),
      playerName: sessionService.getPlayerName(),
      timestamp: new Date().toISOString(),
      error: error.toString(),
      stack: errorInfo.componentStack,
    };
    
    console.error('Test Error Context:', errorContext);
    
    // TODO: Send to error tracking service
    // Example: Sentry.captureException(error, { extra: errorContext });
  }

  handleRecoverSession = () => {
    // Try to recover by refreshing the page
    // Session data is preserved in sessionStorage
    window.location.reload();
  };

  handleReturnHome = () => {
    // Clear session and return to login
    sessionService.clearSession();
    window.location.href = '/';
  };

  handleRetry = () => {
    // Reset error state to try again
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      // If error count is high, suggest going home
      const shouldSuggestHome = this.state.errorCount > 2;

      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '2rem',
        }}>
          <div style={{
            background: 'white',
            borderRadius: '1.5rem',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
            maxWidth: '600px',
            width: '100%',
            padding: '3rem',
          }}>
            {/* Error Icon */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              marginBottom: '2rem',
            }}>
              <div style={{
                width: '80px',
                height: '80px',
                background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '3rem',
              }}>
                ⚠️
              </div>
            </div>

            {/* Error Message */}
            <h2 style={{
              fontSize: '1.75rem',
              fontWeight: '700',
              color: '#1e293b',
              textAlign: 'center',
              marginBottom: '1rem',
            }}>
              Test Session Error
            </h2>
            
            <p style={{
              fontSize: '1rem',
              color: '#64748b',
              textAlign: 'center',
              marginBottom: '2rem',
            }}>
              {shouldSuggestHome
                ? "We're having trouble with this test session. Your answers have been saved."
                : "Something went wrong with the test. Don't worry, your progress is safe."}
            </p>

            {/* Session Info */}
            {this.props.sessionCode && (
              <div style={{
                background: '#f1f5f9',
                borderRadius: '0.5rem',
                padding: '1rem',
                marginBottom: '2rem',
              }}>
                <div style={{ fontSize: '0.875rem', color: '#475569', marginBottom: '0.5rem' }}>
                  Session Code: <strong>{this.props.sessionCode}</strong>
                </div>
                <div style={{ fontSize: '0.875rem', color: '#475569' }}>
                  Student: <strong>{sessionService.getPlayerName() || 'Unknown'}</strong>
                </div>
              </div>
            )}

            {/* Error Details (Development Only) */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '0.5rem',
                padding: '1rem',
                marginBottom: '2rem',
              }}>
                <summary style={{
                  cursor: 'pointer',
                  fontWeight: '600',
                  color: '#dc2626',
                  marginBottom: '0.5rem',
                }}>
                  Error Details (Dev Mode)
                </summary>
                <pre style={{
                  fontSize: '0.75rem',
                  color: '#991b1b',
                  overflow: 'auto',
                  maxHeight: '200px',
                  marginTop: '0.5rem',
                }}>
                  {this.state.error.toString()}
                  {this.state.error.stack && '\n\nStack:\n' + this.state.error.stack}
                </pre>
              </details>
            )}

            {/* Actions */}
            <div style={{
              display: 'flex',
              gap: '1rem',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}>
              {!shouldSuggestHome && (
                <button
                  onClick={this.handleRetry}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    fontSize: '1rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'transform 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                  Try Again
                </button>
              )}
              
              <button
                onClick={this.handleRecoverSession}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'transform 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                Refresh Session
              </button>
              
              <button
                onClick={this.handleReturnHome}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: shouldSuggestHome ? '#ef4444' : '#e2e8f0',
                  color: shouldSuggestHome ? 'white' : '#475569',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'transform 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                {shouldSuggestHome ? 'Exit Test' : 'Return Home'}
              </button>
            </div>

            {/* Error Count Warning */}
            {this.state.errorCount > 1 && (
              <p style={{
                fontSize: '0.75rem',
                color: '#f59e0b',
                textAlign: 'center',
                marginTop: '1.5rem',
              }}>
                ⚠️ Multiple errors detected ({this.state.errorCount}). Consider refreshing or exiting.
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default TestErrorBoundary;
