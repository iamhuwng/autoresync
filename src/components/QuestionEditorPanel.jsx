import React, { useState, useEffect } from 'react';
import { Text, Textarea, TextInput, NumberInput, Radio, Checkbox, Stack, Group, Modal } from '@mantine/core';
import { Button } from './modern';
import r2StorageService from '../services/r2Storage';
import SummaryMasterBlock from './SummaryMasterBlock';
import SummaryQuestionCard from './SummaryQuestionCard';
import { parseToAST, findGroupLeader } from '../utils/summaryGroupUtils';

const QuestionEditorPanel = ({
  question,
  questionIndex,
  totalQuestions,
  onUpdate,
  onClose,
  onReset,
  onPrevious,
  onNext,
  isFirst,
  isLast,
  isImagePassage = false,
  groupQuestions = null,
  onGroupUpdate = null,
  readOnly = false,
}) => {
  const [localQuestion, setLocalQuestion] = useState(question);
  const [validationWarnings, setValidationWarnings] = useState({});
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  useEffect(() => {
    setLocalQuestion(question);
    validateFields(question);
  }, [question, questionIndex]);

  const isCanonicalTableMember =
    question?.groupTaskType === 'table-completion' &&
    question?.groupId &&
    question?.blankId &&
    question?.anchorId;

  const validateFields = (q) => {
    if (!q) return; // Safety check for undefined question

    const warnings = {};

    const isSummaryGroupMember =
      (q.type === 'summary-completion-list' || q.type === 'summary-completion-text') &&
      groupQuestions !== null &&
      groupQuestions.length > 1;

    if (!isImagePassage && !isSummaryGroupMember && (!q.question || q.question.trim() === '')) {
      warnings.question = 'Question text is empty';
    }

    if (q.options) {
      q.options.forEach((opt, index) => {
        // Handle string options (multiple-choice)
        if (typeof opt === 'string' && (!opt || opt.trim() === '')) {
          warnings[`option_${index}`] = `Option ${String.fromCharCode(65 + index)} is empty`;
        }
        // Handle object options (matching, etc.) - check if they have required properties
        else if (typeof opt === 'object' && opt !== null && !opt.text) {
          warnings[`option_${index}`] = `Option ${String.fromCharCode(65 + index)} is missing text`;
        }
      });
    }

    // Handle different answer types based on question type
    if (q.type === 'matching') {
      // Matching questions support TWO formats:
      // 1. Grouped format: answers object
      // 2. Individual format (IELTS): answer string
      const hasGroupedAnswers = q.answers && typeof q.answers === 'object' && Object.keys(q.answers).length > 0;
      const hasIndividualAnswer = q.answer && typeof q.answer === 'string' && q.answer.trim() !== '';

      if (!hasGroupedAnswers && !hasIndividualAnswer) {
        warnings.answer = 'Correct answer is not set';
      }
    } else {
      // Handle different answer types (string, array, etc.) for other question types
      if (!q.answer) {
        warnings.answer = 'Correct answer is not set';
      } else if (typeof q.answer === 'string' && q.answer.trim() === '') {
        warnings.answer = 'Correct answer is not set';
      } else if (Array.isArray(q.answer) && q.answer.length === 0) {
        warnings.answer = 'Correct answer is not set';
      }
    }

    setValidationWarnings(warnings);
  };

  const handleFieldChange = (field, value) => {
    const updated = { ...localQuestion, [field]: value };
    setLocalQuestion(updated);
    validateFields(updated);
    onUpdate(updated);
  };

  const handleOptionChange = (index, value) => {
    const newOptions = [...(localQuestion.options || [])];
    newOptions[index] = value;
    const updated = { ...localQuestion, options: newOptions };
    setLocalQuestion(updated);
    validateFields(updated);
    onUpdate(updated);
  };

  const handleCorrectAnswerChange = (value) => {
    const updated = { ...localQuestion, answer: value };
    setLocalQuestion(updated);
    validateFields(updated);
    onUpdate(updated);
  };

  const handleMultipleAnswerToggle = (optionValue) => {
    const currentAnswers = Array.isArray(localQuestion.answer) ? localQuestion.answer : [];
    const newAnswers = currentAnswers.includes(optionValue)
      ? currentAnswers.filter(a => a !== optionValue)
      : [...currentAnswers, optionValue];
    const updated = { ...localQuestion, answer: newAnswers };
    setLocalQuestion(updated);
    validateFields(updated);
    onUpdate(updated);
  };

  const handleImageUploadClick = () => {
    setShowImageUpload(true);
    setUploadError(null);
  };

  // R2 doesn't need authentication - always ready
  const handleAuthenticate = async () => {
    setIsAuthenticated(true);
    console.log('✅ R2 Storage ready - no sign-in needed');
  };

  const processFile = async (file) => {
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setUploadError('Please upload a valid image file (JPEG, PNG, GIF, or WebP)');
      return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setUploadError('Image size must be less than 10MB');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const imageData = await r2StorageService.uploadImage(file);
      console.log('✅ Image uploaded to R2:', imageData.url);

      // Add image URL to question's imageUrl field
      const updated = { ...localQuestion, imageUrl: imageData.url };
      setLocalQuestion(updated);
      onUpdate(updated);

      // Close modal
      setShowImageUpload(false);
      setIsAuthenticated(false);
    } catch (err) {
      console.error('Upload error:', err);
      setUploadError(err.message || 'Failed to upload image. Please try again.');

      if (err.message?.includes('authentication') || err.message?.includes('token')) {
        setIsAuthenticated(false);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
      // Reset file input
      e.target.value = '';
    }
  };

  // Enable pasting from clipboard when modal is open and authenticated
  useEffect(() => {
    if (!showImageUpload || !isAuthenticated) return;

    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          e.preventDefault();
          const file = items[i].getAsFile();
          processFile(file);
          break;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [showImageUpload, isAuthenticated]);

  if (isCanonicalTableMember) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid rgba(59, 130, 246, 0.15)',
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(14, 165, 233, 0.08) 100%)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <Text size="lg" fw={700} style={{ color: '#1e293b' }}>
              Canonical Table Group
            </Text>
            <Text size="xs" style={{ color: '#64748b', marginTop: '0.25rem' }}>
              Question {questionIndex + 1} is part of a published canonical table-completion group.
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
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          <div style={{
            padding: '1rem 1.125rem',
            borderRadius: '0.75rem',
            border: '1px solid #bfdbfe',
            background: '#eff6ff',
            color: '#1e3a8a',
            lineHeight: 1.6
          }}>
            Phase 1 keeps published canonical table groups read-only in the flat editor.
            Re-open this content through the grouped review flow if the table needs repair.
          </div>
        </div>

        <div style={{
          padding: '1.5rem',
          borderTop: '1px solid rgba(59, 130, 246, 0.15)',
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.03) 0%, rgba(14, 165, 233, 0.03) 100%)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <Button variant="glass" size="sm" onClick={onReset} disabled={readOnly}>
            Reset to Original
          </Button>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
            Read-only canonical group member
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: '1.5rem',
        borderBottom: '1px solid rgba(59, 130, 246, 0.15)',
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(14, 165, 233, 0.08) 100%)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <Text size="lg" fw={700} style={{ color: '#1e293b' }}>
            Editing Question {questionIndex + 1} of {totalQuestions}
          </Text>
          <Text size="xs" style={{ color: '#64748b', marginTop: '0.25rem' }}>
            Changes are auto-saved to your browser
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
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Navigation Buttons */}
      <div style={{
        padding: '1rem 1.5rem',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        gap: '0.5rem'
      }}>
        <Button
          variant="glass"
          size="sm"
          onClick={onPrevious}
          disabled={isFirst}
          style={{ flex: 1 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '0.25rem' }}>
            <polyline points="15 18 9 12 15 6" stroke="currentColor" fill="none" strokeWidth="2" />
          </svg>
          Previous
        </Button>
        <Button
          variant="glass"
          size="sm"
          onClick={onNext}
          disabled={isLast}
          style={{ flex: 1 }}
        >
          Next
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '0.25rem' }}>
            <polyline points="9 18 15 12 9 6" stroke="currentColor" fill="none" strokeWidth="2" />
          </svg>
        </Button>
      </div>

      {/* Editor Content */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '1.5rem'
      }}>
        <Stack spacing="lg">
          {/* ── SUMMARY GROUP MODE ── */}
          {(question.type === 'summary-completion-list' || question.type === 'summary-completion-text') &&
            groupQuestions && groupQuestions.length > 0 && onGroupUpdate ? (
            <>
              {/* Master block — paragraph + word bank */}
              <SummaryMasterBlock
                groupQuestions={groupQuestions}
                onGroupUpdate={onGroupUpdate}
              />

              {/* Individual cards for each blank */}
              {groupQuestions.map((q, i) => {
                // Compute usedAnswers: letters already assigned to OTHER blanks
                const usedAnswers = groupQuestions
                  .filter((_, j) => j !== i)
                  .map(sq => sq.answer)
                  .filter(Boolean);

                // Find the index of this question in allQuestions
                // We use questionIndex as an anchor: if this q matches the selected question,
                // its index is questionIndex. For others, we offset by their position.
                // We reconstruct the real allIndex by finding groupQuestions position delta.
                const selectedGroupIndex = groupQuestions.findIndex(
                  sq => sq.number === question.number
                );
                const delta = i - selectedGroupIndex;
                const realIndex = questionIndex + delta;

                return (
                  <SummaryQuestionCard
                    key={q.number}
                    question={q}
                    questionIndex={realIndex}
                    allSegments={
                      // Pull AST from the group leader
                      (() => {
                        const leader = findGroupLeader(groupQuestions);
                        if (leader.summaryAST && leader.summaryAST.length > 0) return leader.summaryAST;
                        return parseToAST(leader.question || '', groupQuestions);
                      })()
                    }
                    isHighlighted={q.number === question.number}
                    onUpdate={onUpdate}
                    usedAnswers={usedAnswers}
                  />
                );
              })}
            </>
          ) : (
            <>
              {/* Question Text */}
              {!isImagePassage ? (
                <div>
                  <Text size="sm" fw={600} mb="xs" style={{ color: '#1e293b' }}>
                    Question Text *
                  </Text>
                  <Textarea
                    value={typeof localQuestion.question === 'string' ? localQuestion.question : (localQuestion.question?.text || '')}
                    onChange={(e) => handleFieldChange('question', e.target.value)}
                    placeholder="Enter the question text..."
                    minRows={3}
                    maxRows={6}
                    styles={{
                      input: {
                        borderRadius: '0.5rem',
                        border: validationWarnings.question ? '2px solid #ef4444' : '2px solid #cbd5e1',
                        fontSize: '0.9375rem',
                        color: '#1e293b',
                        background: '#ffffff'
                      }
                    }}
                  />
                  {validationWarnings.question && (
                    <Text size="xs" style={{ color: '#ef4444', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                      </svg>
                      {validationWarnings.question}
                    </Text>
                  )}
                </div>
              ) : (
                <div style={{
                  marginBottom: '1rem',
                  padding: '1rem',
                  background: '#f8fafc',
                  borderRadius: '0.5rem',
                  border: '1px dashed #cbd5e1',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem'
                }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: 'rgba(59, 130, 246, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#3b82f6'
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  </div>
                  <div>
                    <Text size="sm" fw={600} style={{ color: '#475569' }}>
                      Question Text in Image
                    </Text>
                    <Text size="xs" style={{ color: '#94a3b8' }}>
                      Refer to the passage image for the question text.
                    </Text>
                  </div>
                </div>
              )}

              {/* Universal Answer Key Field - Always Visible */}
              <div style={{
                padding: '1rem',
                background: 'rgba(255, 255, 255, 0.5)',
                borderRadius: '0.75rem',
                border: validationWarnings.answer ? '2px solid #ef4444' : '2px solid #cbd5e1'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <Text size="sm" fw={600} style={{ color: '#1e293b' }}>
                    Answer Key *
                  </Text>
                  {localQuestion.answer && (
                    <span style={{
                      marginLeft: 'auto',
                      padding: '0.125rem 0.5rem',
                      background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                      color: 'white',
                      borderRadius: '0.25rem',
                      fontSize: '0.6875rem',
                      fontWeight: 600
                    }}>
                      SET
                    </span>
                  )}
                </div>
                <TextInput
                  value={(() => {
                    if (!localQuestion.answer) return '';
                    if (Array.isArray(localQuestion.answer)) return localQuestion.answer.join(', ');
                    if (typeof localQuestion.answer === 'object') {
                      return Object.entries(localQuestion.answer).map(([k, v]) => `${k}:${v}`).join(', ');
                    }
                    return String(localQuestion.answer);
                  })()}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Parse comma-separated values as array if applicable
                    if (value.includes(',') && localQuestion.type !== 'multiple-choice') {
                      handleFieldChange('answer', value.split(',').map(v => v.trim()));
                    } else {
                      handleFieldChange('answer', value);
                    }
                  }}
                  placeholder="Enter correct answer (e.g., A, TRUE, word)"
                  styles={{
                    input: {
                      borderRadius: '0.5rem',
                      border: '2px solid #cbd5e1',
                      fontSize: '0.9375rem',
                      color: '#1e293b',
                      background: '#ffffff'
                    }
                  }}
                />
                <Text size="xs" style={{ color: '#64748b', marginTop: '0.5rem' }}>
                  {localQuestion.type === 'multiple-choice' && 'Enter the correct option letter (A, B, C, D)'}
                  {localQuestion.type === 'true-false-not-given' && 'Enter TRUE, FALSE, or NOT GIVEN'}
                  {localQuestion.type === 'yes-no-not-given' && 'Enter YES, NO, or NOT GIVEN'}
                  {localQuestion.type === 'completion' && 'Enter the word(s) from the passage'}
                  {localQuestion.type === 'matching' && 'Enter the matching letter/number'}
                  {!localQuestion.type && 'Enter the correct answer'}
                </Text>
                {validationWarnings.answer && (
                  <Text size="xs" style={{ color: '#ef4444', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                    </svg>
                    {validationWarnings.answer}
                  </Text>
                )}
              </div>

              {/* Image Upload for Diagram Labeling */}
              {(localQuestion.type === 'diagram-labeling' || localQuestion.type === 'completion') && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <Text size="sm" fw={600} style={{ color: '#1e293b' }}>
                      Question Image {localQuestion.type === 'diagram-labeling' ? '*' : '(Optional)'}
                    </Text>
                    {localQuestion.imageUrl && (
                      <Text size="xs" style={{ color: '#10b981', fontWeight: 600 }}>
                        ✅ Image Added
                      </Text>
                    )}
                  </div>
                  <Button
                    onClick={handleImageUploadClick}
                    variant="light"
                    size="sm"
                    style={{
                      background: 'linear-gradient(135deg, rgba(66, 133, 244, 0.1) 0%, rgba(52, 168, 83, 0.1) 100%)',
                      border: '1px solid rgba(66, 133, 244, 0.3)',
                      color: '#1e293b'
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.5rem' }}>
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    {localQuestion.imageUrl ? 'Change Image' : 'Upload Image'}
                  </Button>

                  {localQuestion.imageUrl && (
                    <Button
                      onClick={() => {
                        const updated = { ...localQuestion, imageUrl: null };
                        setLocalQuestion(updated);
                        onUpdate(updated);
                      }}
                      variant="light"
                      size="sm"
                      style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#dc2626',
                        marginLeft: '0.5rem'
                      }}
                      title="Remove Image"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    </Button>
                  )}
                  {localQuestion.imageUrl && (
                    <div style={{
                      marginTop: '0.5rem',
                      padding: '0.75rem',
                      background: '#f0fdf4',
                      border: '1px solid #10b981',
                      borderRadius: '0.5rem'
                    }}>
                      <img
                        src={localQuestion.imageUrl}
                        alt="Question diagram"
                        style={{
                          maxWidth: '100%',
                          maxHeight: '200px',
                          borderRadius: '0.375rem'
                        }}
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'block';
                        }}
                      />
                      <Text size="xs" style={{ color: '#059669', marginTop: '0.5rem', display: 'none' }}>
                        Image uploaded: {localQuestion.imageUrl}
                      </Text>
                    </div>
                  )}
                </div>
              )}

              {/* Answer Options */}
              {localQuestion.options && (
                <div>
                  <Text size="sm" fw={600} mb="xs" style={{ color: '#1e293b' }}>
                    Answer Options *
                  </Text>
                  <Stack spacing="sm">
                    {localQuestion.options.map((option, index) => (
                      <div key={index}>
                        <TextInput
                          value={typeof option === 'string' ? option : (option?.text || '')}
                          onChange={(e) => handleOptionChange(index, e.target.value)}
                          placeholder={`Option ${String.fromCharCode(65 + index)}`}
                          label={
                            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#475569' }}>
                              {String.fromCharCode(65 + index)}
                            </span>
                          }
                          styles={{
                            input: {
                              borderRadius: '0.5rem',
                              border: validationWarnings[`option_${index}`] ? '2px solid #ef4444' : '2px solid #cbd5e1',
                              fontSize: '0.9375rem',
                              color: '#1e293b',
                              background: '#ffffff'
                            }
                          }}
                        />
                        {validationWarnings[`option_${index}`] && (
                          <Text size="xs" style={{ color: '#ef4444', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                            </svg>
                            {validationWarnings[`option_${index}`]}
                          </Text>
                        )}
                      </div>
                    ))}
                  </Stack>
                </div>
              )}

              {/* Correct Answer Selection - Multiple Choice, Multiple Select, Individual Matching, True/False/Not Given, Yes/No/Not Given */}
              {localQuestion.options && (
                localQuestion.type === 'multiple-choice' ||
                localQuestion.type === 'multiple-select' ||
                localQuestion.type === 'true-false-not-given' ||
                localQuestion.type === 'yes-no-not-given' ||
                (localQuestion.type === 'matching' && !localQuestion.items)
              ) && (
                  <div>
                    <Text size="sm" fw={600} mb="xs" style={{ color: '#1e293b' }}>
                      Correct Answer{localQuestion.type === 'multiple-select' ? 's' : ''} *
                    </Text>

                    {localQuestion.type === 'multiple-select' ? (
                      // Multiple Select: Use Checkboxes
                      <Stack spacing="xs">
                        {localQuestion.options.map((option, index) => {
                          const optionValue = typeof option === 'string' ? option : (option?.text || '');
                          const currentAnswers = Array.isArray(localQuestion.answer) ? localQuestion.answer : [];
                          return (
                            <Checkbox
                              key={index}
                              checked={currentAnswers.includes(optionValue)}
                              onChange={() => handleMultipleAnswerToggle(optionValue)}
                              label={
                                <span style={{ fontSize: '0.875rem', color: '#1e293b' }}>
                                  <strong>{String.fromCharCode(65 + index)}:</strong> {typeof option === 'string' ? option : (option?.text || '(Empty)')}
                                </span>
                              }
                              styles={{
                                input: {
                                  cursor: 'pointer'
                                },
                                label: {
                                  cursor: 'pointer',
                                  paddingLeft: '0.5rem'
                                }
                              }}
                            />
                          );
                        })}
                      </Stack>
                    ) : (
                      // Multiple Choice & Individual Matching (IELTS): Use Radio Buttons
                      (() => {
                        // Helper function: Check if answer matches option
                        // Handles both "A" and "A. Full Text" formats
                        const isAnswerMatch = (answer, optionValue, optionLetter) => {
                          if (!answer) return false;
                          // Direct match
                          if (answer === optionValue) return true;
                          // Letter-only match (e.g., answer="C", option="C. Peter Bourne")
                          if (answer === optionLetter) return true;
                          // Prefix match (e.g., answer="C", option starts with "C. " or "C.")
                          if (optionValue.startsWith(answer + '.') || optionValue.startsWith(answer + ' ')) return true;
                          return false;
                        };

                        // Find which option is selected
                        let selectedValue = localQuestion.answer || '';
                        if (selectedValue && !localQuestion.options.includes(selectedValue)) {
                          // Answer is letter-only, find matching option
                          const matchedOption = localQuestion.options.find((opt, idx) => {
                            const letter = String.fromCharCode(65 + idx);
                            return isAnswerMatch(selectedValue, opt, letter);
                          });
                          if (matchedOption) {
                            selectedValue = matchedOption;
                          }
                        }

                        return (
                          <Radio.Group
                            value={selectedValue}
                            onChange={handleCorrectAnswerChange}
                          >
                            <Stack spacing="xs">
                              {localQuestion.options.map((option, index) => {
                                const optionValue = typeof option === 'string' ? option : (option?.text || '');
                                const optionLetter = String.fromCharCode(65 + index);

                                return (
                                  <Radio
                                    key={index}
                                    value={optionValue}
                                    label={
                                      <span style={{ fontSize: '0.875rem', color: '#1e293b' }}>
                                        <strong>{optionLetter}:</strong> {typeof option === 'string' ? option : (option?.text || '(Empty)')}
                                      </span>
                                    }
                                    styles={{
                                      radio: {
                                        cursor: 'pointer'
                                      },
                                      label: {
                                        cursor: 'pointer',
                                        paddingLeft: '0.5rem'
                                      }
                                    }}
                                  />
                                );
                              })}
                            </Stack>
                          </Radio.Group>
                        );
                      })()
                    )}

                    {validationWarnings.answer && (
                      <Text size="xs" style={{ color: '#ef4444', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                        </svg>
                        {validationWarnings.answer}
                      </Text>
                    )}
                  </div>
                )}

              {/* Completion Answer */}
              {localQuestion.type === 'completion' && (
                <div>
                  <Text size="sm" fw={600} mb="xs" style={{ color: '#1e293b' }}>
                    Correct Answer{Array.isArray(localQuestion.answer) ? 's (Acceptable Variations)' : ''} *
                  </Text>
                  {localQuestion.wordBank ? (
                    // Word Bank: Select from options
                    <Radio.Group
                      value={localQuestion.answer || ''}
                      onChange={handleCorrectAnswerChange}
                    >
                      <Stack spacing="xs">
                        {localQuestion.wordBank.map((word, index) => (
                          <Radio
                            key={index}
                            value={word}
                            label={
                              <span style={{ fontSize: '0.875rem', color: '#1e293b' }}>
                                {word}
                              </span>
                            }
                            styles={{
                              radio: { cursor: 'pointer' },
                              label: { cursor: 'pointer', paddingLeft: '0.5rem' }
                            }}
                          />
                        ))}
                      </Stack>
                    </Radio.Group>
                  ) : (
                    // Free Text: Enter acceptable answers
                    <TextInput
                      value={Array.isArray(localQuestion.answer) ? localQuestion.answer.join(', ') : (localQuestion.answer || '')}
                      onChange={(e) => {
                        const value = e.target.value;
                        const answers = value.includes(',') ? value.split(',').map(a => a.trim()) : value;
                        handleFieldChange('answer', answers);
                      }}
                      placeholder="Enter answer(s), separate multiple with commas"
                      styles={{
                        input: {
                          borderRadius: '0.5rem',
                          border: '2px solid #cbd5e1',
                          fontSize: '0.9375rem',
                          color: '#1e293b',
                          background: '#ffffff'
                        }
                      }}
                    />
                  )}
                  {validationWarnings.answer && (
                    <Text size="xs" style={{ color: '#ef4444', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                      </svg>
                      {validationWarnings.answer}
                    </Text>
                  )}
                </div>
              )}

              {/* Option Label Format for Matching Questions */}
              {(localQuestion.type?.startsWith('matching') || localQuestion.type === 'matching') && (
                <div>
                  <Text size="sm" fw={600} mb="xs" style={{ color: '#1e293b' }}>
                    Option Label Format
                  </Text>
                  <Text size="xs" style={{ color: '#64748b', marginBottom: '0.5rem' }}>
                    Choose how options are labeled (based on the original passage content)
                  </Text>
                  <Radio.Group
                    value={localQuestion.optionLabelFormat || 'letter'}
                    onChange={(value) => handleFieldChange('optionLabelFormat', value)}
                  >
                    <Group spacing="md">
                      <Radio
                        value="letter"
                        label="Letters (A, B, C, D...)"
                        styles={{
                          radio: { cursor: 'pointer' },
                          label: { cursor: 'pointer', fontSize: '0.875rem' }
                        }}
                      />
                      <Radio
                        value="roman"
                        label="Roman Numerals (i, ii, iii, iv...)"
                        styles={{
                          radio: { cursor: 'pointer' },
                          label: { cursor: 'pointer', fontSize: '0.875rem' }
                        }}
                      />
                    </Group>
                  </Radio.Group>
                </div>
              )}

              {/* Matching Answers */}
              {localQuestion.type === 'matching' && localQuestion.items && localQuestion.options && (
                <div>
                  <Text size="sm" fw={600} mb="xs" style={{ color: '#1e293b' }}>
                    Match Items to Options *
                  </Text>
                  <Text size="xs" style={{ color: '#64748b', marginBottom: '0.75rem' }}>
                    Select the correct option for each item
                  </Text>
                  <Stack spacing="sm">
                    {localQuestion.items.map((item, index) => (
                      <div key={item.id} style={{
                        padding: '0.75rem',
                        background: '#f8fafc',
                        borderRadius: '0.5rem',
                        border: '1px solid #e2e8f0'
                      }}>
                        <Text size="sm" fw={600} mb="xs" style={{ color: '#1e293b' }}>
                          {item.text}
                        </Text>
                        <Radio.Group
                          value={localQuestion.answers?.[item.id] || ''}
                          onChange={(value) => {
                            const updated = {
                              ...localQuestion,
                              answers: { ...(localQuestion.answers || {}), [item.id]: value }
                            };
                            setLocalQuestion(updated);
                            validateFields(updated);
                            onUpdate(updated);
                          }}
                        >
                          <Group spacing="sm">
                            {localQuestion.options.map((option) => (
                              <Radio
                                key={option.id}
                                value={option.id}
                                label={option.text}
                                styles={{
                                  radio: { cursor: 'pointer' },
                                  label: { cursor: 'pointer', fontSize: '0.8125rem' }
                                }}
                              />
                            ))}
                          </Group>
                        </Radio.Group>
                      </div>
                    ))}
                  </Stack>
                </div>
              )}

              {/* Diagram Labeling Answers */}
              {localQuestion.type === 'diagram-labeling' && localQuestion.labels && (
                <div>
                  <Text size="sm" fw={600} mb="xs" style={{ color: '#1e293b' }}>
                    Label Answers *
                  </Text>
                  <Stack spacing="sm">
                    {localQuestion.labels.map((label, index) => (
                      <div key={label.id}>
                        <Text size="xs" fw={600} mb="xs" style={{ color: '#475569' }}>
                          Label {index + 1}: {label.sentence}
                        </Text>
                        <TextInput
                          value={label.answer || ''}
                          onChange={(e) => {
                            const newLabels = [...localQuestion.labels];
                            newLabels[index] = { ...newLabels[index], answer: e.target.value };
                            const updated = { ...localQuestion, labels: newLabels };
                            setLocalQuestion(updated);
                            validateFields(updated);
                            onUpdate(updated);
                          }}
                          placeholder="Enter correct answer"
                          styles={{
                            input: {
                              borderRadius: '0.5rem',
                              border: '2px solid #cbd5e1',
                              fontSize: '0.9375rem',
                              color: '#1e293b',
                              background: '#ffffff'
                            }
                          }}
                        />
                      </div>
                    ))}
                  </Stack>
                </div>
              )}

              {/* Timer */}
              <div>
                <Text size="sm" fw={600} mb="xs" style={{ color: '#1e293b' }}>
                  Timer (seconds) *
                </Text>
                <NumberInput
                  value={localQuestion.timer || 10}
                  onChange={(value) => handleFieldChange('timer', value)}
                  min={5}
                  max={300}
                  step={5}
                  suffix=" seconds"
                  styles={{
                    input: {
                      borderRadius: '0.5rem',
                      border: '2px solid #cbd5e1',
                      fontSize: '0.9375rem',
                      fontWeight: 600,
                      color: '#1e293b',
                      background: '#ffffff'
                    }
                  }}
                />
              </div>

              {/* Question Type (if applicable) */}
              {localQuestion.type && (
                <div>
                  <Text size="sm" fw={600} mb="xs" style={{ color: '#1e293b' }}>
                    Question Type
                  </Text>
                  <TextInput
                    value={localQuestion.type || 'multiple-choice'}
                    onChange={(e) => handleFieldChange('type', e.target.value)}
                    disabled
                    styles={{
                      input: {
                        borderRadius: '0.5rem',
                        border: '2px solid #cbd5e1',
                        fontSize: '0.9375rem',
                        color: '#64748b',
                        background: '#f8fafc'
                      }
                    }}
                  />
                  <Text size="xs" style={{ color: '#64748b', marginTop: '0.25rem' }}>
                    Question type cannot be changed
                  </Text>
                </div>
              )}

              {/* Passage (if applicable) */}
              {localQuestion.passage && (
                <div>
                  <Text size="sm" fw={600} mb="xs" style={{ color: '#1e293b' }}>
                    Passage
                  </Text>
                  <Textarea
                    value={localQuestion.passage || ''}
                    onChange={(e) => handleFieldChange('passage', e.target.value)}
                    placeholder="Enter passage text..."
                    minRows={4}
                    maxRows={8}
                    styles={{
                      input: {
                        borderRadius: '0.5rem',
                        border: '2px solid #cbd5e1',
                        fontSize: '0.875rem',
                        color: '#1e293b',
                        background: '#ffffff'
                      }
                    }}
                  />
                </div>
              )}
            </>
          )}
          {/* ── END SUMMARY GROUP MODE ── */}
        </Stack>
      </div>

      {/* Footer Actions */}
      <div style={{
        padding: '1.5rem',
        borderTop: '1px solid rgba(59, 130, 246, 0.15)',
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.03) 0%, rgba(14, 165, 233, 0.03) 100%)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <Button
          variant="glass"
          size="sm"
          onClick={onReset}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.25rem' }}>
            <polyline points="1 4 1 10 7 10" />
            <polyline points="23 20 23 14 17 14" />
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
          </svg>
          Reset to Original
        </Button>

        <div style={{ fontSize: '0.75rem', color: '#64748b', textAlign: 'right' }}>
          {Object.keys(validationWarnings).length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#ef4444' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
              </svg>
              {Object.keys(validationWarnings).length} validation warning{Object.keys(validationWarnings).length === 1 ? '' : 's'}
            </div>
          )}
        </div>
      </div>

      {/* Image Upload Modal */}
      <Modal
        opened={showImageUpload}
        onClose={() => {
          setShowImageUpload(false);
          setIsAuthenticated(false);
          setUploadError(null);
        }}
        title="Upload Question Image to Cloud Storage"
        size="md"
        centered
      >
        <Stack spacing="md">
          {/* Step 1: Authentication */}
          {!isAuthenticated && (
            <>
              <Text size="sm" style={{ color: '#64748b' }}>
                <strong>Step 1:</strong> Click to enable cloud upload
              </Text>
              <Button
                onClick={handleAuthenticate}
                loading={isAuthenticating}
                fullWidth
                variant="filled"
                style={{
                  background: 'linear-gradient(135deg, #4285f4 0%, #34a853 100%)',
                  color: 'white'
                }}
              >
                {isAuthenticating ? 'Connecting...' : '☁️ Enable Cloud Upload'}
              </Button>
            </>
          )}

          {/* Step 2: File Selection */}
          {isAuthenticated && (
            <>
              <Text size="sm" style={{ color: '#10b981', fontWeight: 600 }}>
                ✅ Authenticated! Now select your image file.
              </Text>
              <Text size="sm" style={{ color: '#64748b' }}>
                <strong>Step 2:</strong> Choose an image file to upload
              </Text>
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleImageUpload}
                disabled={isUploading}
                style={{
                  padding: '0.75rem',
                  border: '2px dashed #cbd5e1',
                  borderRadius: '0.5rem',
                  cursor: isUploading ? 'not-allowed' : 'pointer',
                  width: '100%'
                }}
              />
              {isUploading && (
                <Text size="sm" style={{ color: '#3b82f6', fontWeight: 600 }}>
                  ⏳ Uploading image to cloud storage...
                </Text>
              )}
            </>
          )}

          {/* Error Display */}
          {uploadError && (
            <div style={{
              padding: '1rem',
              background: '#fee2e2',
              border: '1px solid #ef4444',
              borderRadius: '0.5rem',
              color: '#dc2626'
            }}>
              <Text size="sm" fw={600} style={{ marginBottom: '0.25rem' }}>
                ❌ Upload Error
              </Text>
              <Text size="xs">{uploadError}</Text>
            </div>
          )}

          {/* Instructions */}
          {!isAuthenticated && !uploadError && (
            <div style={{
              padding: '1rem',
              background: '#eff6ff',
              border: '1px solid #3b82f6',
              borderRadius: '0.5rem'
            }}>
              <Text size="xs" style={{ color: '#1e40af' }}>
                <strong>📝 Note:</strong> Images will be uploaded to cloud storage (Cloudflare R2) and made publicly accessible.
                <br /><br />
                Supported formats: JPEG, PNG, GIF, WebP (max 10MB)
              </Text>
            </div>
          )}
        </Stack>
      </Modal>
    </div>
  );
};

export default QuestionEditorPanel;
