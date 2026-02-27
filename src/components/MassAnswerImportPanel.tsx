import React, { useState } from 'react';
import { Text, Textarea, Stack } from '@mantine/core';
import { Button } from './modern';
// @ts-ignore - aiService has parseAnswerKeyOnly method
import { aiService } from '../services/ai/router.service';

interface Question {
  question: string;
  answer?: string | string[];
  type?: string;
  number?: number;
}

interface MassAnswerImportPanelProps {
  questions: Record<number, Question>;
  onApplyAnswers: (answers: Record<number, string>) => void;
  onClose: () => void;
  totalQuestions: number;
  readOnly?: boolean;
}

const MassAnswerImportPanel: React.FC<MassAnswerImportPanelProps> = ({
  questions,
  onApplyAnswers,
  onClose,
  totalQuestions,
  readOnly = false
}) => {
  const [answerKeyText, setAnswerKeyText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedPreview, setParsedPreview] = useState<Record<number, string> | null>(null);

  const handleParseAnswerKey = async () => {
    if (!answerKeyText.trim()) {
      setParseError('Please paste the answer key text');
      return;
    }

    setIsParsing(true);
    setParseError(null);
    setParsedPreview(null);

    try {
      // Parse using AI
      const result = await aiService.parseAnswerKeyOnly(answerKeyText, 1, totalQuestions);

      if (result.success && result.data) {
        const parsedAnswers = result.data.answerKey;
        const foundCount = Object.keys(parsedAnswers).length;

        if (foundCount === 0) {
          setParseError('Could not find any answers in the text. Please check the format and try again.');
        } else {
          setParsedPreview(parsedAnswers);
        }
      } else {
        setParseError(!result.success ? result.error : 'Failed to parse answers. Please check the format.');
      }
    } catch (error) {
      console.error('Error parsing answer key:', error);
      setParseError('An error occurred while parsing. Please try again.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleApplyAnswers = () => {
    if (parsedPreview) {
      onApplyAnswers(parsedPreview);
      onClose();
    }
  };

  const handleClear = () => {
    setAnswerKeyText('');
    setParsedPreview(null);
    setParseError(null);
  };

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      height: '100%',
      minHeight: 0
    }}>
      {/* Header */}
      <div style={{
        padding: '1.5rem',
        borderBottom: '1px solid rgba(16, 185, 129, 0.15)',
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(5, 150, 105, 0.08) 100%)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <Text size="lg" fw={700} style={{ color: '#1e293b' }}>
            Mass Import Answers
          </Text>
          <Text size="xs" style={{ color: '#64748b', marginTop: '0.25rem' }}>
            Paste answer key text and let AI parse it automatically
          </Text>
        </div>

        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '0.5rem',
            borderRadius: '0.375rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s ease'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.1)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
        <Stack gap="md">
          {/* Instructions */}
          <div style={{
            padding: '1rem',
            background: 'rgba(59, 130, 246, 0.05)',
            borderRadius: '0.5rem',
            border: '1px solid rgba(59, 130, 246, 0.1)'
          }}>
            <Text size="sm" fw={600} style={{ color: '#1e293b', marginBottom: '0.5rem' }}>
              Supported Formats:
            </Text>
            <Text size="xs" style={{ color: '#64748b', lineHeight: 1.6 }}>
              • <strong>Numbered:</strong> 1. A, 2. B, 3. TRUE<br />
              • <strong>Simple list:</strong> A, B, C, D, A, B<br />
              • <strong>Line by line:</strong> Each answer on a new line<br />
              • <strong>With question numbers:</strong> Q1: A, Q2: FALSE
            </Text>
          </div>

          {/* Input Area */}
          <div>
            <Text size="sm" fw={600} style={{ color: '#1e293b', marginBottom: '0.5rem' }}>
              Paste Answer Key Text
            </Text>
            <Textarea
              value={answerKeyText}
              onChange={(e) => !readOnly && setAnswerKeyText(e.target.value)}
              disabled={readOnly}
              placeholder={`Example:\n1. A\n2. B\n3. TRUE\n4. NOT GIVEN\n5. C\n\nOr: A, B, TRUE, NOT GIVEN, C`}
              minRows={8}
              maxRows={12}
              styles={{
                input: {
                  borderRadius: '0.5rem',
                  border: '2px solid #cbd5e1',
                  fontSize: '0.875rem',
                  fontFamily: 'monospace'
                }
              }}
            />
          </div>

          {/* Error Message */}
          {parseError && (
            <div style={{
              padding: '0.75rem 1rem',
              background: 'rgba(239, 68, 68, 0.1)',
              borderRadius: '0.5rem',
              border: '1px solid rgba(239, 68, 68, 0.2)'
            }}>
              <Text size="sm" style={{ color: '#ef4444' }}>
                ⚠️ {parseError}
              </Text>
            </div>
          )}

          {/* Parse Button */}
          {!parsedPreview && (
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <Button
                variant="primary"
                onClick={() => !readOnly && handleParseAnswerKey()}
                disabled={isParsing || !answerKeyText.trim() || readOnly}
                style={{
                  flex: 1,
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  opacity: readOnly ? 0.5 : 1,
                  cursor: readOnly ? 'not-allowed' : undefined
                }}
              >
                {isParsing ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.5rem', animation: 'spin 1s linear infinite' }}>
                      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                    </svg>
                    Parsing with AI...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.5rem' }}>
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    Parse Answers
                  </>
                )}
              </Button>
              <Button variant="glass" onClick={handleClear}>
                Clear
              </Button>
            </div>
          )}

          {/* Preview Results */}
          {parsedPreview && (
            <>
              <div style={{
                padding: '1rem',
                background: 'rgba(16, 185, 129, 0.1)',
                borderRadius: '0.5rem',
                border: '1px solid rgba(16, 185, 129, 0.2)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <Text size="sm" fw={700} style={{ color: '#059669' }}>
                    Found {Object.keys(parsedPreview).length} answers
                  </Text>
                </div>

                <div style={{
                  maxHeight: '200px',
                  overflowY: 'auto',
                  background: 'white',
                  borderRadius: '0.375rem',
                  padding: '0.75rem'
                }}>
                  <Stack gap="xs">
                    {Object.entries(parsedPreview).sort(([a], [b]) => Number(a) - Number(b)).map(([qNum, answer]) => (
                      <div key={qNum} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.5rem',
                        background: 'rgba(16, 185, 129, 0.05)',
                        borderRadius: '0.375rem'
                      }}>
                        <div style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '0.25rem',
                          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontSize: '0.6875rem',
                          fontWeight: 700
                        }}>
                          {qNum}
                        </div>
                        <Text size="sm" fw={600} style={{ color: '#1e293b' }}>
                          {answer}
                        </Text>
                      </div>
                    ))}
                  </Stack>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <Button
                  variant="primary"
                  onClick={() => !readOnly && handleApplyAnswers()}
                  disabled={readOnly}
                  style={{
                    flex: 1,
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    opacity: readOnly ? 0.5 : 1,
                    cursor: readOnly ? 'not-allowed' : undefined
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.5rem' }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Apply {Object.keys(parsedPreview).length} Answers
                </Button>
                <Button variant="glass" onClick={() => {
                  setParsedPreview(null);
                  setParseError(null);
                }}>
                  Edit Text
                </Button>
              </div>
            </>
          )}
        </Stack>
      </div>

      {/* Footer */}
      <div style={{
        padding: '1rem 1.5rem',
        borderTop: '1px solid rgba(16, 185, 129, 0.15)',
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.03) 0%, rgba(5, 150, 105, 0.03) 100%)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <Text size="xs" style={{ color: '#64748b' }}>
          AI will automatically match answers to question numbers
        </Text>
        <Button variant="glass" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default MassAnswerImportPanel;
