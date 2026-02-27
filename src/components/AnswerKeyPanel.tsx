import React, { useState, useMemo } from 'react';
import { Text, TextInput, Stack } from '@mantine/core';
import { Button } from './modern';

interface Question {
  question: string;
  answer?: string | string[];
  answers?: Record<string, string>;
  type?: string;
  number?: number;
}

interface AnswerKeyPanelProps {
  questions: Record<number, Question>;
  onUpdateAnswer: (index: number, answer: string) => void;
  onClose: () => void;
  totalQuestions: number;
  readOnly?: boolean;
}

const AnswerKeyPanel: React.FC<AnswerKeyPanelProps> = ({
  questions,
  onUpdateAnswer,
  onClose,
  totalQuestions,
  readOnly = false
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [tempValue, setTempValue] = useState('');

  // Get display value for answer
  const getAnswerDisplay = (q: Question): string => {
    if (!q) return '';

    // Handle matching questions with answers object
    if (q.answers && typeof q.answers === 'object') {
      return Object.entries(q.answers).map(([k, v]) => `${k}:${v}`).join(', ');
    }

    // Handle array answers
    if (Array.isArray(q.answer)) {
      return q.answer.join(', ');
    }

    // Handle string answer
    if (typeof q.answer === 'string') {
      return q.answer;
    }

    return '';
  };

  // Filter questions based on search
  const filteredQuestions = useMemo(() => {
    const entries: Array<[number, Question]> = [];
    for (let i = 0; i < totalQuestions; i++) {
      const q = questions[i];
      if (q) {
        entries.push([i, q]);
      }
    }

    if (!searchTerm.trim()) return entries;

    const term = searchTerm.toLowerCase();
    return entries.filter(([index, q]) => {
      const questionText = typeof q.question === 'string' ? q.question : '';
      const answerText = getAnswerDisplay(q);
      return (
        (index + 1).toString().includes(term) ||
        questionText.toLowerCase().includes(term) ||
        answerText.toLowerCase().includes(term)
      );
    });
  }, [questions, totalQuestions, searchTerm]);

  // Count missing answers
  const missingCount = useMemo(() => {
    let count = 0;
    for (let i = 0; i < totalQuestions; i++) {
      const q = questions[i];
      if (!q) continue;
      const answer = getAnswerDisplay(q);
      if (!answer || answer.trim() === '') {
        count++;
      }
    }
    return count;
  }, [questions, totalQuestions]);

  const handleStartEdit = (index: number) => {
    const q = questions[index];
    setEditingIndex(index);
    setTempValue(q ? getAnswerDisplay(q) : '');
  };

  const handleSaveEdit = (index: number) => {
    onUpdateAnswer(index, tempValue);
    setEditingIndex(null);
    setTempValue('');
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setTempValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Enter') {
      handleSaveEdit(index);
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
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
        borderBottom: '1px solid rgba(139, 92, 246, 0.15)',
        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <Text size="lg" fw={700} style={{ color: '#1e293b' }}>
            Answer Key Editor
          </Text>
          <Text size="xs" style={{ color: '#64748b', marginTop: '0.25rem' }}>
            {totalQuestions} questions • {missingCount > 0 ? (
              <span style={{ color: '#ef4444' }}>{missingCount} missing answers</span>
            ) : (
              <span style={{ color: '#10b981' }}>All answers set</span>
            )}
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
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(139, 92, 246, 0.1)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0' }}>
        <TextInput
          placeholder="Search by question number, text, or answer..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          leftSection={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          }
          styles={{
            input: {
              borderRadius: '0.5rem',
              border: '2px solid #cbd5e1',
              fontSize: '0.875rem'
            }
          }}
        />
      </div>

      {/* Answer Key List - Card-based design matching Questions/Passages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem' }}>
        <Stack gap="sm">
          {filteredQuestions.map(([index, question]) => {
            const answerValue = getAnswerDisplay(question);
            const isMissing = !answerValue || answerValue.trim() === '';
            const isEditing = editingIndex === index;

            return (
              <div
                key={index}
                style={{
                  display: 'flex',
                  gap: '0.75rem',
                  alignItems: 'flex-start',
                  padding: '1rem',
                  background: isMissing
                    ? 'rgba(239, 68, 68, 0.05)'
                    : 'rgba(255, 255, 255, 0.5)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  borderRadius: '0.75rem',
                  border: isMissing ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(255, 255, 255, 0.3)',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  if (!isMissing) {
                    e.currentTarget.style.background = 'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%)';
                    e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.3)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isMissing ? 'rgba(239, 68, 68, 0.05)' : 'rgba(255, 255, 255, 0.5)';
                  e.currentTarget.style.borderColor = isMissing ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.3)';
                }}
              >
                {/* Question Number Badge */}
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '0.5rem',
                  background: isMissing
                    ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                    : 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  flexShrink: 0
                }}>
                  {index + 1}
                </div>

                {/* Question Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text size="xs" style={{
                    color: '#64748b',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginBottom: '0.5rem'
                  }}>
                    {typeof question.question === 'string'
                      ? question.question.substring(0, 60) + (question.question.length > 60 ? '...' : '')
                      : '(Empty question)'}
                    {question.type && (
                      <span style={{
                        marginLeft: '0.5rem',
                        padding: '0.125rem 0.375rem',
                        background: 'rgba(139, 92, 246, 0.1)',
                        borderRadius: '0.25rem',
                        fontSize: '0.625rem',
                        color: '#8b5cf6',
                        fontWeight: 600
                      }}>
                        {question.type}
                      </span>
                    )}
                  </Text>

                  {/* Answer Field */}
                  {isEditing ? (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <TextInput
                        value={tempValue}
                        onChange={(e) => setTempValue(e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, index)}
                        autoFocus
                        placeholder="Enter answer..."
                        size="sm"
                        style={{ flex: 1 }}
                        styles={{
                          input: {
                            border: '2px solid #8b5cf6',
                            borderRadius: '0.5rem',
                            fontSize: '0.875rem'
                          }
                        }}
                      />
                      <button
                        onClick={() => handleSaveEdit(index)}
                        style={{
                          padding: '0.5rem 0.75rem',
                          background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                          border: 'none',
                          borderRadius: '0.375rem',
                          cursor: 'pointer',
                          color: 'white',
                          fontSize: '0.75rem',
                          fontWeight: 600
                        }}
                      >
                        Save
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        style={{
                          padding: '0.5rem 0.75rem',
                          background: '#64748b',
                          border: 'none',
                          borderRadius: '0.375rem',
                          cursor: 'pointer',
                          color: 'white',
                          fontSize: '0.75rem',
                          fontWeight: 600
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => !readOnly && handleStartEdit(index)}
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '0.5rem',
                        background: isMissing ? 'rgba(239, 68, 68, 0.1)' : 'rgba(139, 92, 246, 0.1)',
                        color: isMissing ? '#ef4444' : '#8b5cf6',
                        fontWeight: 600,
                        fontSize: '0.875rem',
                        cursor: readOnly ? 'default' : 'pointer',
                        border: isMissing ? '1px dashed #ef4444' : '1px solid transparent',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.2s ease'
                      }}
                      title={readOnly ? undefined : "Click to edit answer"}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                      {isMissing ? (
                        <span style={{ fontStyle: 'italic', opacity: 0.7 }}>{readOnly ? '(Missing answer)' : 'Click to add answer...'}</span>
                      ) : (
                        answerValue
                      )}
                    </div>
                  )}
                </div>

                {/* Status Icon */}
                <div style={{ flexShrink: 0, paddingTop: '0.25rem' }}>
                  {isMissing ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                  )}
                </div>
              </div>
            );
          })}

          {filteredQuestions.length === 0 && (
            <div style={{
              padding: '2rem',
              textAlign: 'center',
              color: '#64748b'
            }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" style={{ margin: '0 auto 1rem', display: 'block' }}>
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <Text size="sm" fw={600}>No questions found</Text>
              <Text size="xs" style={{ color: '#94a3b8' }}>Try a different search term</Text>
            </div>
          )}
        </Stack>
      </div>

      {/* Footer */}
      <div style={{
        padding: '1rem 1.5rem',
        borderTop: '1px solid rgba(139, 92, 246, 0.15)',
        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.03) 0%, rgba(59, 130, 246, 0.03) 100%)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <Text size="xs" style={{ color: '#64748b' }}>
          {readOnly ? 'Viewing only' : 'Click on any answer to edit it directly'}
        </Text>
        <Button variant="glass" size="sm" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
};

export default AnswerKeyPanel;
