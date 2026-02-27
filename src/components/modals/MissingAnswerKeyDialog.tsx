/**
 * MissingAnswerKeyDialog
 * 
 * Dialog shown when a test is about to be saved without complete answer keys.
 * Allows user to:
 * 1. Paste answer key text for AI parsing
 * 2. Save as incomplete (grayed out in lobby)
 * 3. Cancel and go back to edit
 */

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardBody, Button } from '../modern';
// @ts-ignore - aiService has parseAnswerKeyOnly method
import { aiService } from '../../services/ai/router.service';

interface MissingAnswerKeyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  missingCount: number;
  totalCount: number;
  questionsWithoutAnswers: Array<{ number: number; questionText: string; type?: string; options?: string[] }>;
  onAnswersParsed: (answers: Record<number, string>) => void;
  onSaveIncomplete: () => void;
  /** Full test content for AI to generate suggestions */
  testContent?: string;
}

export const MissingAnswerKeyDialog: React.FC<MissingAnswerKeyDialogProps> = ({
  isOpen,
  onClose,
  missingCount,
  totalCount,
  questionsWithoutAnswers,
  onAnswersParsed,
  onSaveIncomplete,
  testContent,
}) => {
  const [answerKeyText, setAnswerKeyText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedPreview, setParsedPreview] = useState<Record<number, string> | null>(null);
  
  // AI auto-suggestion states
  const [isLoadingAISuggestions, setIsLoadingAISuggestions] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<Record<number, string> | null>(null);
  const [aiSuggestionError, setAiSuggestionError] = useState<string | null>(null);
  const hasFetchedRef = useRef(false);
  
  // Auto-fetch AI suggestions when dialog opens
  useEffect(() => {
    if (isOpen && !hasFetchedRef.current && questionsWithoutAnswers.length > 0) {
      hasFetchedRef.current = true;
      fetchAISuggestions();
    }
    
    // Reset when dialog closes
    if (!isOpen) {
      hasFetchedRef.current = false;
      setAiSuggestions(null);
      setAiSuggestionError(null);
      setIsLoadingAISuggestions(false);
      setAnswerKeyText('');
      setParsedPreview(null);
      setParseError(null);
    }
  }, [isOpen, questionsWithoutAnswers.length]);
  
  // Fetch AI suggestions by asking AI to solve the questions from passage content
  const fetchAISuggestions = async () => {
    setIsLoadingAISuggestions(true);
    setAiSuggestionError(null);
    
    try {
      // Check network connectivity first
      if (!navigator.onLine) {
        setAiSuggestionError('You are offline. Please check your internet connection and try again, or paste the answer key manually.');
        setIsLoadingAISuggestions(false);
        return;
      }
      
      // Check if we have passage content to work with
      if (!testContent || testContent.trim().length === 0) {
        setAiSuggestionError('No passage content available for AI to generate answers. Please paste the answer key manually.');
        setIsLoadingAISuggestions(false);
        return;
      }
      
      // Prepare questions for AI
      const questionsForAI = questionsWithoutAnswers.map(q => ({
        number: q.number,
        questionText: q.questionText,
        type: q.type,
        options: q.options,
      }));
      
      console.log(`🤖 Asking AI to generate answers for ${questionsForAI.length} questions...`);
      
      // Use the new generateAnswersFromContent method
      // @ts-ignore - method exists on aiService
      const result = await aiService.generateAnswersFromContent(testContent, questionsForAI);
      
      if (result.success && result.data) {
        const suggestions = result.data.answerKey;
        const foundCount = Object.keys(suggestions).length;
        
        if (foundCount > 0) {
          setAiSuggestions(suggestions);
          console.log(`✅ AI generated ${foundCount} answers (confidence: ${result.data.confidence}%)`);
        } else {
          setAiSuggestionError('AI could not generate suggestions. Please paste the answer key manually.');
        }
      } else {
        setAiSuggestionError((result as any).error || 'Could not generate AI suggestions. Please paste the answer key manually.');
      }
    } catch (error) {
      console.error('Error fetching AI suggestions:', error);
      setAiSuggestionError('Failed to fetch AI suggestions. Please paste the answer key manually.');
    } finally {
      setIsLoadingAISuggestions(false);
    }
  };

  if (!isOpen) return null;

  const handleParseAnswerKey = async () => {
    if (!answerKeyText.trim()) {
      setParseError('Please paste the answer key text');
      return;
    }

    setIsParsing(true);
    setParseError(null);
    setParsedPreview(null);

    try {
      // Get the question numbers that need answers
      const questionNumbers = questionsWithoutAnswers.map(q => q.number);
      const startQuestion = Math.min(...questionNumbers);
      const endQuestion = Math.max(...questionNumbers);

      // Use AI to parse the answer key
      const result = await aiService.parseAnswerKeyOnly(answerKeyText, startQuestion, endQuestion);

      if (result.success && result.data) {
        const parsedAnswers = result.data.answerKey;
        const foundCount = Object.keys(parsedAnswers).length;

        if (foundCount === 0) {
          setParseError('Could not find any answers in the text. Please check the format and try again.');
        } else {
          setParsedPreview(parsedAnswers);
          console.log(`✅ Parsed ${foundCount} answers from answer key`);
        }
      } else {
        setParseError((result as any).error || 'Failed to parse answer key. Please try again.');
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
      onAnswersParsed(parsedPreview);
    }
  };

  const handleSaveIncomplete = () => {
    onSaveIncomplete();
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
    }}>
      {/* Backdrop */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)',
        }}
        onClick={onClose}
      />

      {/* Dialog */}
      <Card
        variant="glass"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '600px',
          maxHeight: '90vh',
          overflow: 'auto',
          animation: 'slideUp 0.3s ease-out',
        }}
      >
        <CardBody style={{ padding: '1.5rem' }}>
          {/* Header */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '2rem' }}>⚠️</span>
              <h2 style={{
                fontSize: '1.5rem',
                fontWeight: '700',
                color: '#1e293b',
                margin: 0,
              }}>
                Missing Answer Keys
              </h2>
            </div>
            <p style={{ fontSize: '0.9375rem', color: '#64748b', margin: 0 }}>
              <strong style={{ color: '#f59e0b' }}>{missingCount} of {totalCount}</strong> questions are missing answer keys.
              Tests without complete answer keys will be <strong>grayed out</strong> and cannot be used in sessions.
            </p>
          </div>

          {/* AI Suggestions Section */}
          {(isLoadingAISuggestions || aiSuggestions || aiSuggestionError) && (
            <div style={{
              background: isLoadingAISuggestions 
                ? 'rgba(139, 92, 246, 0.1)' 
                : aiSuggestions 
                  ? 'rgba(16, 185, 129, 0.1)' 
                  : 'rgba(251, 191, 36, 0.1)',
              border: `1px solid ${
                isLoadingAISuggestions 
                  ? 'rgba(139, 92, 246, 0.3)' 
                  : aiSuggestions 
                    ? 'rgba(16, 185, 129, 0.3)' 
                    : 'rgba(251, 191, 36, 0.3)'
              }`,
              borderRadius: '0.75rem',
              padding: '1rem',
              marginBottom: '1.5rem',
            }}>
              {isLoadingAISuggestions ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ 
                    fontSize: '1.5rem', 
                    marginBottom: '0.5rem',
                    animation: 'pulse 1.5s ease-in-out infinite',
                  }}>
                    🤖
                  </div>
                  <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#7c3aed' }}>
                    AI is generating suggested answers...
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#8b5cf6', marginTop: '0.25rem' }}>
                    This may take a few seconds
                  </div>
                </div>
              ) : aiSuggestions ? (
                <>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.75rem',
                  }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#047857' }}>
                      🤖 AI Suggested {Object.keys(aiSuggestions).length} answers
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Review before applying</span>
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                    gap: '0.5rem',
                    maxHeight: '180px',
                    overflowY: 'auto',
                  }}>
                    {Object.entries(aiSuggestions).map(([num, answer]) => (
                      <div
                        key={num}
                        style={{
                          padding: '0.5rem',
                          background: 'rgba(16, 185, 129, 0.15)',
                          borderRadius: '0.375rem',
                          fontSize: '0.8125rem',
                        }}
                      >
                        <span style={{ fontWeight: '600', color: '#047857' }}>Q{num}:</span>{' '}
                        <span style={{ color: '#1e293b' }}>
                          {typeof answer === 'string' ? answer : JSON.stringify(answer)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="success"
                    onClick={() => onAnswersParsed(aiSuggestions)}
                    style={{ marginTop: '1rem', width: '100%' }}
                  >
                    ✓ Apply AI Suggestions & Continue Editing
                  </Button>
                </>
              ) : aiSuggestionError ? (
                <div style={{ textAlign: 'center', color: '#92400e', fontSize: '0.875rem' }}>
                  ⚠️ {aiSuggestionError}
                </div>
              ) : null}
            </div>
          )}

          {/* Missing Questions Preview */}
          <div style={{
            background: 'rgba(251, 191, 36, 0.1)',
            border: '1px solid rgba(251, 191, 36, 0.3)',
            borderRadius: '0.75rem',
            padding: '1rem',
            marginBottom: '1.5rem',
            maxHeight: '120px',
            overflowY: 'auto',
          }}>
            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#92400e', marginBottom: '0.5rem' }}>
              Questions without answers:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {questionsWithoutAnswers.slice(0, 20).map(q => (
                <span
                  key={q.number}
                  style={{
                    padding: '0.25rem 0.5rem',
                    background: 'rgba(251, 191, 36, 0.2)',
                    borderRadius: '0.25rem',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    color: '#92400e',
                  }}
                >
                  Q{q.number}
                </span>
              ))}
              {questionsWithoutAnswers.length > 20 && (
                <span style={{ fontSize: '0.75rem', color: '#92400e' }}>
                  +{questionsWithoutAnswers.length - 20} more
                </span>
              )}
            </div>
          </div>

          {/* Divider */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            margin: '1rem 0',
          }}>
            <div style={{ flex: 1, height: '1px', background: 'rgba(203, 213, 225, 0.5)' }} />
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '500' }}>OR PASTE MANUALLY</span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(203, 213, 225, 0.5)' }} />
          </div>

          {/* Answer Key Input */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: '600',
              color: '#1e293b',
              marginBottom: '0.5rem',
            }}>
              Paste Answer Key Text (Optional)
            </label>
            <textarea
              value={answerKeyText}
              onChange={(e) => {
                setAnswerKeyText(e.target.value);
                setParseError(null);
                setParsedPreview(null);
              }}
              placeholder={`Paste your answer key here. Supported formats:\n\n1. A\n2. B\n3. TRUE\n4. rivers\n\nOr: 1-A, 2-B, 3-TRUE\nOr: | 1 | A | 2 | B |`}
              rows={6}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                border: parseError ? '2px solid #ef4444' : '2px solid rgba(203, 213, 225, 0.5)',
                fontSize: '0.875rem',
                color: '#1e293b',
                background: 'rgba(255, 255, 255, 0.8)',
                fontFamily: 'monospace',
                resize: 'vertical',
              }}
              disabled={isParsing}
            />
            {parseError && (
              <div style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                {parseError}
              </div>
            )}
          </div>

          {/* Parse Button */}
          <Button
            variant="primary"
            onClick={handleParseAnswerKey}
            disabled={isParsing || !answerKeyText.trim()}
            style={{
              marginBottom: '1rem',
              width: '100%',
              background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
            }}
          >
            {isParsing ? (
              <>⏳ Parsing with AI...</>
            ) : (
              <>🤖 Parse Answer Key with AI</>
            )}
          </Button>

          {/* Parsed Preview */}
          {parsedPreview && (
            <div style={{
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '0.75rem',
              padding: '1rem',
              marginBottom: '1.5rem',
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.75rem',
              }}>
                <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#047857' }}>
                  ✅ Found {Object.keys(parsedPreview).length} answers
                </div>
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                gap: '0.5rem',
                maxHeight: '150px',
                overflowY: 'auto',
              }}>
                {Object.entries(parsedPreview).map(([num, answer]) => (
                  <div
                    key={num}
                    style={{
                      padding: '0.375rem 0.5rem',
                      background: 'rgba(16, 185, 129, 0.15)',
                      borderRadius: '0.25rem',
                      fontSize: '0.75rem',
                    }}
                  >
                    <span style={{ fontWeight: '600', color: '#047857' }}>Q{num}:</span>{' '}
                    <span style={{ color: '#1e293b' }}>
                      {typeof answer === 'string' ? answer : JSON.stringify(answer)}
                    </span>
                  </div>
                ))}
              </div>
              <Button
                variant="success"
                onClick={handleApplyAnswers}
                style={{ marginTop: '1rem', width: '100%' }}
              >
                ✓ Apply Answers & Continue Editing
              </Button>
            </div>
          )}

          {/* Divider */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            margin: '1.5rem 0',
          }}>
            <div style={{ flex: 1, height: '1px', background: 'rgba(203, 213, 225, 0.5)' }} />
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '500' }}>OR</span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(203, 213, 225, 0.5)' }} />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Button
              variant="glass"
              onClick={onClose}
              style={{ flex: 1 }}
            >
              ← Back to Edit
            </Button>
            <Button
              variant="warning"
              onClick={handleSaveIncomplete}
              style={{
                flex: 1,
                background: 'rgba(251, 191, 36, 0.15)',
                color: '#92400e',
                border: '1px solid rgba(251, 191, 36, 0.3)',
              }}
            >
              Save as Incomplete
            </Button>
          </div>

          {/* Info Note */}
          <div style={{
            marginTop: '1rem',
            padding: '0.75rem',
            background: 'rgba(148, 163, 184, 0.1)',
            borderRadius: '0.5rem',
            fontSize: '0.75rem',
            color: '#64748b',
          }}>
            <strong>Note:</strong> Incomplete tests will appear grayed out in the Teacher Lobby and Session Management.
            You can complete them later by editing the test.
          </div>
        </CardBody>
      </Card>

      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
};

export default MissingAnswerKeyDialog;
