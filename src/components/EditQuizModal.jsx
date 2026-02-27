import React, { useState } from 'react';
import { Text, Stack, NumberInput, TextInput } from '@mantine/core';
import { Button, Card, CardBody, CardFooter } from './modern';

const EditQuizModal = ({
  quiz: propQuiz,
  editedQuestions,
  onQuestionSelect,
  selectedQuestionIndex,
  selectedPassageIndex,
  onSaveChanges,
  onCancel,
  showEditor,
  onSetAllTimers,
  onUpdateQuestionTimer,
  onHideQuestion,
  onDeleteQuestion,
  onAddQuestion,
  isSaving,
  showSaveSuccess,
  onTitleChange,
  editedTitle,
  editMode,
  onEditModeToggle,
  passages,
  onPassageSelect,
  onAddPassage,
  onDeletePassage,
  showAddOptions,
  onSelectSingle,
  onSelectBulk,
  onCancelAdd
}) => {
  const [commonTimer, setCommonTimer] = useState(10);
  const [editingTimerIndex, setEditingTimerIndex] = useState(null);
  const [tempTimerValue, setTempTimerValue] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [showBulkTimer, setShowBulkTimer] = useState(false);

  // Create a default empty quiz for new quiz creation
  const defaultQuiz = {
    id: null,
    title: 'New Quiz',
    questions: [],
    version: 1,
    editHistory: [],
    passages: [],
  };

  // Use prop quiz if provided, otherwise use default for new quiz flow
  const quiz = propQuiz || defaultQuiz;
  const isNewQuiz = !propQuiz;

  const handleApplyToAll = () => {
    if (onSetAllTimers) {
      onSetAllTimers(commonTimer);
    }
  };

  const handleTimerDoubleClick = (index) => {
    const currentTimer = (editedQuestions && editedQuestions[index] ? editedQuestions[index].timer : quiz.questions[index].timer) || 10;
    setEditingTimerIndex(index);
    setTempTimerValue(currentTimer.toString());
  };

  const handleTimerChange = (value) => {
    setTempTimerValue(value);
  };

  const handleTimerBlur = (index) => {
    const newTimer = parseInt(tempTimerValue) || 10;
    // Clamp between 5 and 300
    const clampedTimer = Math.max(5, Math.min(300, newTimer));

    // Update the question timer through parent
    if (onUpdateQuestionTimer) {
      const question = editedQuestions && editedQuestions[index] ? editedQuestions[index] : quiz.questions[index];
      const updated = { ...question, timer: clampedTimer };
      onUpdateQuestionTimer(index, updated);
    }

    setEditingTimerIndex(null);
  };

  const handleTimerKeyDown = (e, index) => {
    if (e.key === 'Enter') {
      handleTimerBlur(index);
    } else if (e.key === 'Escape') {
      setEditingTimerIndex(null);
    }
  };

  // Use editedQuestions if available, otherwise fall back to quiz.questions
  const questionsToDisplay = editedQuestions && Object.keys(editedQuestions).length > 0
    ? Object.values(editedQuestions)
    : quiz.questions;

  return (
    <Card
      variant="glass"
      hover={false}
      style={{
        width: showEditor ? '350px' : '450px',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.3s ease',
        overflow: 'hidden',
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(250, 245, 255, 0.95) 100%)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(139, 92, 246, 0.2)',
        boxShadow: '0 8px 32px rgba(139, 92, 246, 0.15)'
      }}
    >
      {/* Compact Header */}
      <div style={{
        padding: '1rem 1.25rem',
        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%)',
        borderBottom: '1px solid rgba(139, 92, 246, 0.15)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem'
      }}>
        {/* Title Row - Inline Title Editor */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" style={{ flexShrink: 0 }}>
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>

          {/* Inline Title Editor */}
          {isEditingTitle ? (
            <>
              <TextInput
                value={editedTitle || quiz.title}
                onChange={(e) => onTitleChange && onTitleChange(e.target.value)}
                placeholder="Quiz title..."
                size="sm"
                style={{ flex: 1 }}
                styles={{
                  input: {
                    fontSize: '1rem',
                    fontWeight: 700,
                    color: '#1e293b',
                    border: '2px solid rgba(139, 92, 246, 0.4)',
                    borderRadius: '0.375rem'
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setIsEditingTitle(false);
                  else if (e.key === 'Escape') {
                    onTitleChange && onTitleChange(quiz.title);
                    setIsEditingTitle(false);
                  }
                }}
                autoFocus
              />
              <button
                onClick={() => setIsEditingTitle(false)}
                style={{
                  padding: '0.375rem',
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Save title"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </button>
            </>
          ) : (
            <div
              onClick={() => setIsEditingTitle(true)}
              style={{
                flex: 1,
                fontSize: '1.125rem',
                fontWeight: 700,
                color: '#1e293b',
                cursor: 'pointer',
                padding: '0.25rem 0.5rem',
                borderRadius: '0.375rem',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(139, 92, 246, 0.08)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              title="Click to edit title"
            >
              {editedTitle || quiz.title}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" style={{ opacity: 0.5 }}>
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </div>
          )}
        </div>

        {/* Version and Material Link Badges */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* Quiz Version Badge */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.25rem 0.5rem',
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            borderRadius: '9999px',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: '#3b82f6',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>v{quiz.version || 1}</span>
          </div>

          {/* Material Link Badge - show if quiz is linked to a material */}
          {quiz.materialLink && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.375rem',
              padding: '0.25rem 0.625rem',
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(124, 58, 237, 0.15) 100%)',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#7c3aed',
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <span>Linked to Material v{quiz.materialLink.materialVersion || 1}</span>
              <span style={{
                fontSize: '0.625rem',
                color: '#64748b',
                marginLeft: '0.25rem',
              }}>
                • Changes may affect linked material
              </span>
            </div>
          )}
        </div>

        {/* Mode Toggle and Action Buttons Row */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Mode Toggle Buttons */}
          <div style={{
            display: 'flex',
            gap: '0.25rem',
            background: 'rgba(139, 92, 246, 0.05)',
            borderRadius: '0.5rem',
            padding: '0.25rem',
            border: '1px solid rgba(139, 92, 246, 0.15)'
          }}>
            <button
              onClick={() => onEditModeToggle && onEditModeToggle('questions')}
              style={{
                padding: '0.375rem 0.75rem',
                background: editMode === 'questions' ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%)' : 'transparent',
                border: editMode === 'questions' ? '1px solid rgba(139, 92, 246, 0.3)' : '1px solid transparent',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: editMode === 'questions' ? '#8b5cf6' : '#64748b',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem'
              }}
              title="Edit questions"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 11H3v2h6v-2zm0 4H3v2h6v-2zm0-8H3v2h6V7zm12 6h-6v2h6v-2zm0 4h-6v2h6v-2zm0-8h-6v2h6V7z" />
              </svg>
              Questions
            </button>
            <button
              onClick={() => onEditModeToggle && onEditModeToggle('passages')}
              style={{
                padding: '0.375rem 0.75rem',
                background: editMode === 'passages' ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%)' : 'transparent',
                border: editMode === 'passages' ? '1px solid rgba(139, 92, 246, 0.3)' : '1px solid transparent',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: editMode === 'passages' ? '#8b5cf6' : '#64748b',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem'
              }}
              title="Edit passages"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              Passages
            </button>
          </div>

          {/* Add Question Button */}
          {editMode === 'questions' && onAddQuestion && (
            <Button
              variant="primary"
              size="xs"
              onClick={onAddQuestion}
              style={{ whiteSpace: 'nowrap' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '0.25rem' }}>
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
              </svg>
              Add
            </Button>
          )}

          {/* Add Passage Button */}
          {editMode === 'passages' && onAddPassage && (
            <Button
              variant="primary"
              size="xs"
              onClick={onAddPassage}
              style={{ whiteSpace: 'nowrap' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '0.25rem' }}>
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
              </svg>
              Add
            </Button>
          )}

          {/* Bulk Timer Toggle */}
          <button
            onClick={() => setShowBulkTimer(!showBulkTimer)}
            style={{
              padding: '0.5rem 0.75rem',
              background: showBulkTimer ? 'rgba(139, 92, 246, 0.15)' : 'rgba(255, 255, 255, 0.5)',
              border: '1px solid rgba(139, 92, 246, 0.2)',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: '#64748b',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              if (!showBulkTimer) e.currentTarget.style.background = 'rgba(139, 92, 246, 0.1)';
            }}
            onMouseLeave={(e) => {
              if (!showBulkTimer) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.5)';
            }}
            title="Set timer for all questions"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Bulk Timer
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{
                transform: showBulkTimer ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease'
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>

        {/* Collapsible Bulk Timer Section */}
        {showBulkTimer && (
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.7)',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              border: '1px solid rgba(139, 92, 246, 0.2)',
              animation: 'slideDown 0.2s ease-out'
            }}
          >
            <Text size="xs" fw={600} mb="xs" style={{ color: '#64748b' }}>
              Set timer for all questions at once
            </Text>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <NumberInput
                value={commonTimer}
                onChange={setCommonTimer}
                min={5}
                max={300}
                step={5}
                suffix="s"
                size="xs"
                style={{ flex: 1 }}
                styles={{
                  input: {
                    borderRadius: '0.375rem',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    textAlign: 'center',
                    color: '#8b5cf6',
                    background: '#ffffff'
                  }
                }}
              />
              <Button
                variant="primary"
                size="xs"
                onClick={() => {
                  handleApplyToAll();
                  setShowBulkTimer(false);
                }}
                style={{ whiteSpace: 'nowrap' }}
              >
                Apply to All
              </Button>
            </div>
          </div>
        )}
      </div>

      <style>{`
          @keyframes slideDown {
            from {
              opacity: 0;
              transform: translateY(-10px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
        <Stack spacing="sm">
          {/* Show Add Options when in add mode */}
          {editMode === 'questions' && showAddOptions && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              padding: '2rem 1rem'
            }}>
              <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                <Text size="lg" fw={700} style={{ color: '#1e293b', marginBottom: '0.5rem' }}>
                  Add Questions
                </Text>
                <Text size="sm" style={{ color: '#64748b' }}>
                  Choose how you want to add questions
                </Text>
              </div>

              {/* Add Single Question Button */}
              <button
                onClick={onSelectSingle}
                style={{
                  padding: '1.5rem',
                  background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%)',
                  border: '2px solid rgba(139, 92, 246, 0.2)',
                  borderRadius: '0.75rem',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.75rem'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(59, 130, 246, 0.15) 100%)';
                  e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.4)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 16px rgba(139, 92, 246, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%)';
                  e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.2)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '0.75rem',
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <Text size="md" fw={700} style={{ color: '#1e293b', marginBottom: '0.25rem' }}>
                    Add 1 Question
                  </Text>
                  <Text size="sm" style={{ color: '#64748b' }}>
                    Create a single question with custom fields
                  </Text>
                </div>
              </button>

              {/* Add Bulk Questions Button */}
              <button
                onClick={onSelectBulk}
                style={{
                  padding: '1.5rem',
                  background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(14, 165, 233, 0.08) 100%)',
                  border: '2px solid rgba(59, 130, 246, 0.2)',
                  borderRadius: '0.75rem',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.75rem'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(14, 165, 233, 0.15) 100%)';
                  e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.4)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 16px rgba(59, 130, 246, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(14, 165, 233, 0.08) 100%)';
                  e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.2)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '0.75rem',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <Text size="md" fw={700} style={{ color: '#1e293b', marginBottom: '0.25rem' }}>
                    Add Bulk Questions
                  </Text>
                  <Text size="sm" style={{ color: '#64748b' }}>
                    Paste text or upload files for AI parsing
                  </Text>
                </div>
              </button>

              {/* Cancel Button */}
              <Button
                variant="glass"
                onClick={onCancelAdd}
                style={{ marginTop: '0.5rem' }}
              >
                Cancel
              </Button>
            </div>
          )}

          {/* Show Question List when not in add mode */}
          {editMode === 'questions' && !showAddOptions && quiz.questions.map((question, index) => {
            // Get the edited version of this question if it exists
            const displayQuestion = editedQuestions && editedQuestions[index] ? editedQuestions[index] : question;
            const isSelected = selectedQuestionIndex === index;
            const isHidden = displayQuestion.hidden || false;

            return (
              <div
                key={index}
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  alignItems: 'center',
                  padding: '1rem',
                  background: isSelected
                    ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(59, 130, 246, 0.15) 100%)'
                    : isHidden
                      ? 'rgba(203, 213, 225, 0.3)'
                      : 'rgba(255, 255, 255, 0.5)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  borderRadius: '0.75rem',
                  border: isSelected ? '2px solid rgba(139, 92, 246, 0.5)' : '1px solid rgba(255, 255, 255, 0.3)',
                  boxShadow: isSelected ? '0 4px 12px rgba(139, 92, 246, 0.15)' : '0 2px 8px rgba(0, 0, 0, 0.05)',
                  transition: 'all 0.3s ease',
                  position: 'relative',
                  opacity: isHidden ? 0.6 : 1
                }}
              >
                <div
                  style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                  onClick={() => onQuestionSelect(index)}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.parentElement.style.background = 'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%)';
                      e.currentTarget.parentElement.style.borderColor = 'rgba(139, 92, 246, 0.3)';
                      e.currentTarget.parentElement.style.transform = 'translateY(-2px)';
                      e.currentTarget.parentElement.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.parentElement.style.background = isHidden ? 'rgba(203, 213, 225, 0.3)' : 'rgba(255, 255, 255, 0.5)';
                      e.currentTarget.parentElement.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                      e.currentTarget.parentElement.style.transform = 'translateY(0)';
                      e.currentTarget.parentElement.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.05)';
                    }
                  }}
                >
                  <Text size="sm" fw={700} style={{ color: '#1e293b', marginBottom: '0.25rem' }}>
                    Question {index + 1} {isHidden && <span style={{ color: '#64748b', fontWeight: 400 }}>(Hidden)</span>}
                  </Text>
                  <Text size="sm" style={{
                    color: '#475569',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {(() => {
                      if (typeof question.question === 'string') {
                        return question.question;
                      } else if (question.question && typeof question.question === 'object') {
                        return question.question.text || '(Empty)';
                      }
                      return '(Empty)';
                    })()}
                  </Text>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.75rem',
                    color: '#64748b',
                    fontWeight: 600
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    handleTimerDoubleClick(index);
                  }}
                  title="Double-click to edit timer"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  {editingTimerIndex === index ? (
                    <input
                      type="number"
                      value={tempTimerValue}
                      onChange={(e) => handleTimerChange(e.target.value)}
                      onBlur={() => handleTimerBlur(index)}
                      onKeyDown={(e) => handleTimerKeyDown(e, index)}
                      autoFocus
                      min={5}
                      max={300}
                      style={{
                        width: '40px',
                        padding: '0.125rem 0.25rem',
                        border: '2px solid #8b5cf6',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        textAlign: 'center',
                        color: '#1e293b',
                        background: '#ffffff',
                        outline: 'none'
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span style={{ cursor: 'pointer' }}>{displayQuestion.timer || 10}s</span>
                  )}
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                  {onHideQuestion && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onHideQuestion(index);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '0.375rem',
                        borderRadius: '0.25rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'background 0.2s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(100, 116, 139, 0.1)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      title={isHidden ? "Unhide question" : "Hide question"}
                    >
                      {isHidden ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      )}
                    </button>
                  )}
                  {onDeleteQuestion && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Are you sure you want to delete Question ${index + 1}? This cannot be undone.`)) {
                          onDeleteQuestion(index);
                        }
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '0.375rem',
                        borderRadius: '0.25rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'background 0.2s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      title="Delete question"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Passages List */}
          {editMode === 'passages' && (passages && passages.length > 0 ? passages.map((passage, index) => {
            const isSelected = selectedPassageIndex === index;

            return (
              <div
                key={index}
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  alignItems: 'center',
                  padding: '1rem',
                  background: isSelected
                    ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(59, 130, 246, 0.15) 100%)'
                    : 'rgba(255, 255, 255, 0.5)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  borderRadius: '0.75rem',
                  border: isSelected ? '2px solid rgba(139, 92, 246, 0.5)' : '1px solid rgba(255, 255, 255, 0.3)',
                  boxShadow: isSelected ? '0 4px 12px rgba(139, 92, 246, 0.15)' : '0 2px 8px rgba(0, 0, 0, 0.05)',
                  transition: 'all 0.3s ease',
                  cursor: 'pointer'
                }}
                onClick={() => onPassageSelect && onPassageSelect(index)}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = 'rgba(139, 92, 246, 0.08)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.5)';
                  }
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text size="sm" fw={600} style={{ color: '#1e293b', marginBottom: '0.25rem' }}>
                    {passage.title || `Passage ${index + 1} (Untitled)`}
                  </Text>
                  <Text size="xs" style={{ color: '#64748b' }}>
                    Questions {passage.questionStart}-{passage.questionEnd}
                  </Text>
                  {passage.content && (
                    <Text
                      size="xs"
                      style={{
                        color: '#94a3b8',
                        marginTop: '0.25rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {passage.content.substring(0, 80)}...
                    </Text>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                  {onDeletePassage && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeletePassage(index);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '0.375rem',
                        borderRadius: '0.25rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'background 0.2s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      title="Delete passage"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          }) : (
            <div style={{
              padding: '2rem 1rem',
              textAlign: 'center',
              background: 'rgba(139, 92, 246, 0.05)',
              borderRadius: '0.75rem',
              border: '2px dashed rgba(139, 92, 246, 0.2)'
            }}>
              <div style={{
                fontSize: '2.5rem',
                marginBottom: '0.5rem',
                opacity: 0.3
              }}>📄</div>
              <Text size="sm" fw={600} style={{ color: '#64748b', marginBottom: '0.5rem' }}>
                No passages yet
              </Text>
              <Text size="xs" style={{ color: '#94a3b8' }}>
                Click "Add" to create your first passage
              </Text>
            </div>
          ))}
        </Stack>
      </div>

      <CardFooter style={{
        gap: '0.75rem',
        justifyContent: 'flex-end',
        borderTop: '1px solid rgba(139, 92, 246, 0.15)',
        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.03) 0%, rgba(59, 130, 246, 0.03) 100%)'
      }}>
        <Button variant="glass" onClick={onCancel} disabled={isSaving}>Cancel</Button>
        <Button
          variant="primary"
          onClick={onSaveChanges}
          disabled={isSaving}
          style={showSaveSuccess ? {
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            transition: 'all 0.3s ease'
          } : {}}
        >
          {isSaving ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.5rem', animation: 'spin 1s linear infinite' }}>
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
              </svg>
              Saving...
            </>
          ) : showSaveSuccess ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.5rem' }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Saved!
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '0.5rem' }}>
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" fill="white" />
                <polyline points="7 3 7 8 15 8" fill="white" />
              </svg>
              Save Changes
            </>
          )}
        </Button>
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </CardFooter>
    </Card>
  );
};

export default EditQuizModal;