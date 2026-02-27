/**
 * TestReviewEditor
 * 
 * Component for reviewing and editing test content before saving.
 * Integrates PassageEditorPanel and QuestionEditorPanel for inline editing.
 * 
 * Features:
 * - Display passages and questions in test view format
 * - Click to edit passages (with image upload via cloud storage)
 * - Click to edit questions (with image upload for diagrams)
 * - Track modified items
 * - Summary statistics
 * 
 * @module components/test/TestReviewEditor
 */

import { useState } from 'react';
import { Modal } from '@mantine/core';
import { Card, CardBody, Button } from '../modern';
// @ts-ignore - JS components without type declarations
import PassageEditorPanel from '../PassageEditorPanel';
// @ts-ignore - JS components without type declarations
import QuestionEditorPanel from '../QuestionEditorPanel';
import { MissingAnswerKeyDialog } from '../modals/MissingAnswerKeyDialog';
import type { Passage, ParsedQuestion } from '../../types/document.types';

// ============================================================================
// TYPES
// ============================================================================

interface TestReviewEditorProps {
  passages: Passage[];
  questions: ParsedQuestion[];
  metadata: {
    title: string;
    type: string;
    skill: string;
    duration: number;
  };
  onPassagesChange: (passages: Passage[]) => void;
  onQuestionsChange: (questions: ParsedQuestion[]) => void;
  onSave: (forceIncomplete?: boolean) => void;
  onBack: () => void;
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

interface PassageCardProps {
  passage: Passage;
  index: number;
  isModified: boolean;
  onClick: () => void;
}

function PassageCard({ passage, index, isModified, onClick }: PassageCardProps) {
  const wordCount = passage.wordCount || passage.content.split(/\s+/).length;
  const hasImage = !!passage.imageUrl;

  return (
    <div
      onClick={onClick}
      style={{
        padding: '1rem',
        background: isModified
          ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(99, 102, 241, 0.08) 100%)'
          : 'rgba(255, 255, 255, 0.6)',
        borderRadius: '0.75rem',
        border: isModified
          ? '2px solid rgba(139, 92, 246, 0.3)'
          : '1px solid rgba(203, 213, 225, 0.3)',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.5rem'
          }}>
            <span style={{ fontSize: '1.25rem' }}>📄</span>
            <h4 style={{
              fontSize: '0.9375rem',
              fontWeight: 600,
              color: '#1e293b',
              margin: 0
            }}>
              {passage.title || `Passage ${index + 1}`}
            </h4>
            {isModified && (
              <span style={{
                fontSize: '0.6875rem',
                fontWeight: 600,
                color: '#8b5cf6',
                background: 'rgba(139, 92, 246, 0.1)',
                padding: '0.125rem 0.5rem',
                borderRadius: '9999px',
              }}>
                Modified
              </span>
            )}
            {hasImage && (
              <span style={{
                fontSize: '0.6875rem',
                fontWeight: 600,
                color: '#10b981',
                background: 'rgba(16, 185, 129, 0.1)',
                padding: '0.125rem 0.5rem',
                borderRadius: '9999px',
              }}>
                🖼️ Has Image
              </span>
            )}
          </div>
          <p style={{
            fontSize: '0.8125rem',
            color: '#64748b',
            margin: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}>
            {passage.content.substring(0, 200)}...
          </p>
        </div>
        <div style={{
          textAlign: 'right',
          marginLeft: '1rem',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
            {wordCount} words
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
            Q{passage.questionStart || '?'}-{passage.questionEnd || '?'}
          </div>
        </div>
      </div>
      <div style={{
        marginTop: '0.75rem',
        display: 'flex',
        justifyContent: 'flex-end'
      }}>
        <span style={{
          fontSize: '0.75rem',
          color: '#8b5cf6',
          fontWeight: 500
        }}>
          Click to edit →
        </span>
      </div>
    </div>
  );
}

interface QuestionCardProps {
  question: ParsedQuestion;
  index: number;
  isModified: boolean;
  isImagePassage: boolean;
  onClick: () => void;
}

function QuestionCard({ question, index, isModified, isImagePassage, onClick }: QuestionCardProps) {
  const hasImage = !!(question as any).imageUrl;

  return (
    <div
      onClick={onClick}
      style={{
        padding: '0.75rem 1rem',
        background: isModified
          ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(5, 150, 105, 0.08) 100%)'
          : 'rgba(255, 255, 255, 0.6)',
        borderRadius: '0.5rem',
        border: isModified
          ? '2px solid rgba(16, 185, 129, 0.3)'
          : '1px solid rgba(203, 213, 225, 0.2)',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = isModified
          ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(5, 150, 105, 0.12) 100%)'
          : 'rgba(255, 255, 255, 0.9)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = isModified
          ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(5, 150, 105, 0.08) 100%)'
          : 'rgba(255, 255, 255, 0.6)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{
          width: '2rem',
          height: '2rem',
          borderRadius: '50%',
          background: isModified
            ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
            : 'rgba(148, 163, 184, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.75rem',
          fontWeight: 700,
          color: isModified ? 'white' : '#64748b',
          flexShrink: 0,
        }}>
          {question.number || index + 1}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.25rem',
          }}>
            <span style={{
              fontSize: '0.6875rem',
              fontWeight: 600,
              color: '#64748b',
              background: 'rgba(148, 163, 184, 0.15)',
              padding: '0.125rem 0.375rem',
              borderRadius: '0.25rem',
              textTransform: 'uppercase',
            }}>
              {question.type || 'unknown'}
            </span>
            {isModified && (
              <span style={{
                fontSize: '0.6875rem',
                fontWeight: 600,
                color: '#10b981',
              }}>
                ✓ Modified
              </span>
            )}
            {hasImage && (
              <span style={{
                fontSize: '0.6875rem',
                color: '#f59e0b',
              }}>
                🖼️
              </span>
            )}
          </div>
          <p style={{
            fontSize: '0.8125rem',
            color: '#475569',
            margin: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {question.questionText || question.question || (isImagePassage ? '(Question in Image)' : '(No question text)')}
          </p>
        </div>
        <div style={{
          fontSize: '0.75rem',
          color: '#94a3b8',
          flexShrink: 0,
        }}>
          {question.answer ? '✓' : '—'}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function TestReviewEditor({
  passages,
  questions,
  metadata,
  onPassagesChange,
  onQuestionsChange,
  onSave,
  onBack,
}: TestReviewEditorProps) {
  // Editor state
  const [selectedPassageIndex, setSelectedPassageIndex] = useState<number | null>(null);
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState<number | null>(null);
  const [modifiedPassages, setModifiedPassages] = useState<Set<number>>(new Set());
  const [modifiedQuestions, setModifiedQuestions] = useState<Set<number>>(new Set());

  // View mode state
  const [viewMode, setViewMode] = useState<'passages' | 'questions'>('passages');

  // Missing answer key dialog state
  const [showMissingAnswerDialog, setShowMissingAnswerDialog] = useState(false);

  // Handle passage update
  const handlePassageUpdate = (updatedPassage: any) => {
    if (selectedPassageIndex === null) return;

    const newPassages = [...passages];
    newPassages[selectedPassageIndex] = updatedPassage;
    onPassagesChange(newPassages);

    setModifiedPassages(prev => new Set(prev).add(selectedPassageIndex));
  };

  // Handle question update
  const handleQuestionUpdate = (updatedQuestion: any) => {
    if (selectedQuestionIndex === null) return;

    const newQuestions = [...questions];
    newQuestions[selectedQuestionIndex] = updatedQuestion;
    onQuestionsChange(newQuestions);

    setModifiedQuestions(prev => new Set(prev).add(selectedQuestionIndex));
  };

  // Close editors
  const handleClosePassageEditor = () => setSelectedPassageIndex(null);
  const handleCloseQuestionEditor = () => setSelectedQuestionIndex(null);

  // Navigation within editors
  const handlePreviousPassage = () => {
    if (selectedPassageIndex !== null && selectedPassageIndex > 0) {
      setSelectedPassageIndex(selectedPassageIndex - 1);
    }
  };

  const handleNextPassage = () => {
    if (selectedPassageIndex !== null && selectedPassageIndex < passages.length - 1) {
      setSelectedPassageIndex(selectedPassageIndex + 1);
    }
  };

  const handlePreviousQuestion = () => {
    if (selectedQuestionIndex !== null && selectedQuestionIndex > 0) {
      setSelectedQuestionIndex(selectedQuestionIndex - 1);
    }
  };

  const handleNextQuestion = () => {
    if (selectedQuestionIndex !== null && selectedQuestionIndex < questions.length - 1) {
      setSelectedQuestionIndex(selectedQuestionIndex + 1);
    }
  };

  // Reset a question to original
  const handleResetQuestion = () => {
    // For now, just close the editor - could implement full reset logic
    handleCloseQuestionEditor();
  };

  // Stats
  const totalModified = modifiedPassages.size + modifiedQuestions.size;
  const questionsWithAnswers = questions.filter(q =>
    q.answer &&
    (typeof q.answer !== 'string' || q.answer.trim() !== '') &&
    (!Array.isArray(q.answer) || q.answer.length > 0)
  ).length;
  const questionsWithoutAnswers = questions.filter(q =>
    !q.answer ||
    (typeof q.answer === 'string' && q.answer.trim() === '') ||
    (Array.isArray(q.answer) && q.answer.length === 0)
  ).map(q => ({
    number: q.number || q.questionNumber || 0,
    questionText: q.questionText || q.question || '',
    type: q.type,
    options: q.options,
  }));

  // Build test content for AI suggestions (combine passages text)
  const testContentForAI = passages.map(p => p.content || '').join('\n\n');

  // Handle save with missing answer check
  const handleSaveClick = () => {
    if (questionsWithoutAnswers.length > 0) {
      setShowMissingAnswerDialog(true);
    } else {
      onSave();
    }
  };

  // Handle answers parsed from dialog
  const handleAnswersParsed = (answers: Record<number, string>) => {
    // Apply parsed answers to questions
    const updatedQuestions = questions.map(q => {
      const qNum = q.number || q.questionNumber || 0;
      if (answers[qNum]) {
        return {
          ...q,
          answer: answers[qNum],
          answerSource: 'answer-key' as const,
        };
      }
      return q;
    });

    onQuestionsChange(updatedQuestions);
    setShowMissingAnswerDialog(false);

    // Mark all updated questions as modified
    const newModified = new Set(modifiedQuestions);
    Object.keys(answers).forEach(numStr => {
      const num = parseInt(numStr);
      const idx = questions.findIndex(q => (q.number || q.questionNumber) === num);
      if (idx >= 0) newModified.add(idx);
    });
    setModifiedQuestions(newModified);
  };

  // Handle save as incomplete
  const handleSaveIncomplete = () => {
    setShowMissingAnswerDialog(false);
    onSave(true); // Pass true to indicate saving as incomplete
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: '800', marginBottom: '0.5rem', color: '#1e293b' }}>
          Review & Edit Test
        </h1>
        <p style={{ fontSize: '1rem', color: '#64748b' }}>
          Click on any passage or question to edit. Add images where needed.
        </p>
      </div>

      {/* Summary Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
        <Card variant="mint">
          <CardBody style={{ textAlign: 'center', padding: '1rem' }}>
            <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#10b981' }}>
              {passages.length}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Passages</div>
          </CardBody>
        </Card>
        <Card variant="sky">
          <CardBody style={{ textAlign: 'center', padding: '1rem' }}>
            <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#3b82f6' }}>
              {questions.length}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Questions</div>
          </CardBody>
        </Card>
        <Card variant="lavender">
          <CardBody style={{ textAlign: 'center', padding: '1rem' }}>
            <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#8b5cf6' }}>
              {questionsWithAnswers}/{questions.length}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>With Answers</div>
          </CardBody>
        </Card>
        <Card variant="peach">
          <CardBody style={{ textAlign: 'center', padding: '1rem' }}>
            <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#f59e0b' }}>
              {totalModified}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Modified</div>
          </CardBody>
        </Card>
      </div>

      {/* Test Info */}
      <Card variant="glass">
        <CardBody>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#1e293b', margin: 0 }}>
                {metadata.title || 'Untitled Test'}
              </h3>
              <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0.25rem 0 0 0' }}>
                {metadata.type} • {metadata.skill} • {metadata.duration} minutes
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button
                variant={viewMode === 'passages' ? 'primary' : 'glass'}
                size="sm"
                onClick={() => setViewMode('passages')}
              >
                📄 Passages ({passages.length})
              </Button>
              <Button
                variant={viewMode === 'questions' ? 'primary' : 'glass'}
                size="sm"
                onClick={() => setViewMode('questions')}
              >
                ❓ Questions ({questions.length})
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Content Area */}
      {viewMode === 'passages' ? (
        <Card variant="glass">
          <CardBody>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1e293b', margin: 0 }}>
                Passages
              </h3>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Click to edit • Add images via cloud storage
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {passages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                  No passages found
                </div>
              ) : (
                passages.map((passage, index) => (
                  <PassageCard
                    key={passage.id || index}
                    passage={passage}
                    index={index}
                    isModified={modifiedPassages.has(index)}
                    onClick={() => setSelectedPassageIndex(index)}
                  />
                ))
              )}
            </div>
          </CardBody>
        </Card>
      ) : (
        <Card variant="glass">
          <CardBody>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1e293b', margin: 0 }}>
                Questions
              </h3>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Click to edit • Add images for diagram questions
              </span>
            </div>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              maxHeight: '400px',
              overflowY: 'auto',
            }}>
              {questions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                  No questions found
                </div>
              ) : (
                questions.map((question, index) => (
                  <QuestionCard
                    key={question.id || index}
                    question={question}
                    index={index}
                    isModified={modifiedQuestions.has(index)}
                    isImagePassage={(() => {
                      const p = passages.find(pass => pass.id === question.passageId);
                      return !!(p?.type === 'image' || p?.imageUrl);
                    })()}
                    onClick={() => setSelectedQuestionIndex(index)}
                  />
                ))
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Action Buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button variant="glass" onClick={onBack}>← Back</Button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {questionsWithoutAnswers.length > 0 && (
            <span style={{
              fontSize: '0.8125rem',
              color: '#f59e0b',
              fontWeight: '500',
            }}>
              ⚠️ {questionsWithoutAnswers.length} questions missing answers
            </span>
          )}
          <Button
            variant="primary"
            onClick={handleSaveClick}
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              border: 'none',
            }}
          >
            ✓ Save Test {totalModified > 0 && `(${totalModified} changes)`}
          </Button>
        </div>
      </div>

      {/* Missing Answer Key Dialog */}
      <MissingAnswerKeyDialog
        isOpen={showMissingAnswerDialog}
        onClose={() => setShowMissingAnswerDialog(false)}
        missingCount={questionsWithoutAnswers.length}
        totalCount={questions.length}
        questionsWithoutAnswers={questionsWithoutAnswers}
        onAnswersParsed={handleAnswersParsed}
        onSaveIncomplete={handleSaveIncomplete}
        testContent={testContentForAI}
      />

      {/* Passage Editor Modal */}
      <Modal
        opened={selectedPassageIndex !== null}
        onClose={handleClosePassageEditor}
        size="xl"
        padding={0}
        withCloseButton={false}
        styles={{
          body: { padding: 0 },
          content: {
            background: 'transparent',
            boxShadow: 'none',
          },
        }}
      >
        {selectedPassageIndex !== null && passages[selectedPassageIndex] && (
          <Card variant="glass" style={{ maxHeight: '80vh', overflow: 'auto' }}>
            <PassageEditorPanel
              passage={passages[selectedPassageIndex]}
              passageIndex={selectedPassageIndex}
              totalPassages={passages.length}
              onUpdate={handlePassageUpdate}
              onClose={handleClosePassageEditor}
              onPrevious={handlePreviousPassage}
              onNext={handleNextPassage}
              isFirst={selectedPassageIndex === 0}
              isLast={selectedPassageIndex === passages.length - 1}
              quizQuestionsLength={questions.length}
            />
          </Card>
        )}
      </Modal>

      {/* Question Editor Modal */}
      <Modal
        opened={selectedQuestionIndex !== null}
        onClose={handleCloseQuestionEditor}
        size="xl"
        padding={0}
        withCloseButton={false}
        styles={{
          body: { padding: 0 },
          content: {
            background: 'transparent',
            boxShadow: 'none',
          },
        }}
      >
        {selectedQuestionIndex !== null && questions[selectedQuestionIndex] && (
          <Card variant="glass" style={{ maxHeight: '80vh', overflow: 'auto' }}>
            <QuestionEditorPanel
              question={questions[selectedQuestionIndex]}
              questionIndex={selectedQuestionIndex}
              totalQuestions={questions.length}
              onUpdate={handleQuestionUpdate}
              onClose={handleCloseQuestionEditor}
              onReset={handleResetQuestion}
              onPrevious={handlePreviousQuestion}
              onNext={handleNextQuestion}
              isFirst={selectedQuestionIndex === 0}
              isLast={selectedQuestionIndex === questions.length - 1}
              isImagePassage={(() => {
                const q = questions[selectedQuestionIndex!];
                const p = passages.find(pass => pass.id === q?.passageId);
                return !!(p?.type === 'image' || p?.imageUrl);
              })()}
            />
          </Card>
        )}
      </Modal>
    </div>
  );
}

export default TestReviewEditor;
