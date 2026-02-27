import React, { useState } from 'react';
import { Modal, Text, TextInput, Textarea, NumberInput, Select, Radio, Checkbox, Stack } from '@mantine/core';
import { Button, Card } from './modern';

const QUESTION_TYPES = [
  { value: 'multiple-choice', label: 'Multiple Choice' },
  { value: 'multiple-select', label: 'Multiple Select' },
  { value: 'completion', label: 'Completion (Fill in the Blank)' },
  { value: 'matching', label: 'Matching' },
  { value: 'true-false-not-given', label: 'True/False/Not Given' },
  { value: 'yes-no-not-given', label: 'Yes/No/Not Given' },
  { value: 'diagram-labeling', label: 'Diagram Labeling' }
];

const SingleQuestionCreator = ({ show, onClose, onSave, quizQuestionsLength, passages, inline = false }) => {
  const [questionType, setQuestionType] = useState('multiple-choice');
  const [questionText, setQuestionText] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [correctAnswers, setCorrectAnswers] = useState([]);
  const [points, setPoints] = useState(10);
  const [timer, setTimer] = useState(30);
  const [selectedPassage, setSelectedPassage] = useState(null);
  const [optionLabelFormat, setOptionLabelFormat] = useState('letter'); // 'letter' or 'roman'

  const handleOptionChange = (index, value) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const handleAddOption = () => {
    setOptions([...options, '']);
  };

  const handleRemoveOption = (index) => {
    if (options.length > 2) {
      const newOptions = options.filter((_, i) => i !== index);
      setOptions(newOptions);
    }
  };

  const handleMultipleAnswerToggle = (optionLetter) => {
    setCorrectAnswers(prev =>
      prev.includes(optionLetter)
        ? prev.filter(a => a !== optionLetter)
        : [...prev, optionLetter]
    );
  };

  const handleSave = () => {
    // Validate
    if (!questionText.trim()) {
      alert('Please enter a question');
      return;
    }

    // Build question object based on type
    const newQuestion = {
      question: questionText,
      type: questionType,
      points,
      timer,
      number: quizQuestionsLength + 1
    };

    // Add type-specific fields
    switch (questionType) {
      case 'multiple-choice':
        if (options.some(opt => !opt.trim())) {
          alert('Please fill in all options');
          return;
        }
        if (!correctAnswer) {
          alert('Please select a correct answer');
          return;
        }
        newQuestion.options = options;
        newQuestion.answer = correctAnswer;
        break;

      case 'matching':
      case 'matching-headings':
      case 'matching-information':
      case 'matching-features':
      case 'matching-sentence-endings':
        if (options.some(opt => !opt.trim())) {
          alert('Please fill in all options');
          return;
        }
        if (!correctAnswer) {
          alert('Please select a correct answer');
          return;
        }
        newQuestion.options = options;
        newQuestion.answer = correctAnswer;
        newQuestion.optionLabelFormat = optionLabelFormat; // Store the label format
        break;

      case 'multiple-select':
        if (options.some(opt => !opt.trim())) {
          alert('Please fill in all options');
          return;
        }
        if (correctAnswers.length === 0) {
          alert('Please select at least one correct answer');
          return;
        }
        newQuestion.options = options;
        newQuestion.answer = correctAnswers;
        break;

      case 'completion':
        if (!correctAnswer.trim()) {
          alert('Please enter the correct answer');
          return;
        }
        newQuestion.answer = correctAnswer;
        break;

      case 'true-false-not-given':
        if (!correctAnswer) {
          alert('Please select a correct answer');
          return;
        }
        newQuestion.options = ['True', 'False', 'Not Given'];
        newQuestion.answer = correctAnswer;
        break;

      case 'yes-no-not-given':
        if (!correctAnswer) {
          alert('Please select a correct answer');
          return;
        }
        newQuestion.options = ['Yes', 'No', 'Not Given'];
        newQuestion.answer = correctAnswer;
        break;

      case 'diagram-labeling':
        if (options.some(opt => !opt.trim())) {
          alert('Please fill in all labels');
          return;
        }
        newQuestion.options = options;
        newQuestion.answer = options; // For diagram labeling, all labels are correct
        break;
    }

    // Add passage if selected
    if (selectedPassage !== null && passages && passages[selectedPassage]) {
      newQuestion.passage = passages[selectedPassage];
    }

    onSave(newQuestion);
    onClose();
  };

  const renderOptionsFields = () => {
    switch (questionType) {
      case 'multiple-choice':
        return (
          <div>
            <Text size="sm" fw={600} mb="xs" style={{ color: '#1e293b' }}>
              Options *
            </Text>
            <Stack spacing="sm">
              {options.map((option, index) => (
                <div key={index} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <Text size="sm" fw={600} style={{ color: '#64748b', minWidth: '24px' }}>
                    {String.fromCharCode(65 + index)}.
                  </Text>
                  <TextInput
                    value={option}
                    onChange={(e) => handleOptionChange(index, e.target.value)}
                    placeholder={`Option ${String.fromCharCode(65 + index)}`}
                    style={{ flex: 1 }}
                  />
                  {options.length > 2 && (
                    <button
                      onClick={() => handleRemoveOption(index)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#ef4444',
                        padding: '0.25rem'
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </Stack>
            <Button
              variant="glass"
              size="xs"
              onClick={handleAddOption}
              style={{ marginTop: '0.5rem' }}
            >
              + Add Option
            </Button>

            <Text size="sm" fw={600} mt="md" mb="xs" style={{ color: '#1e293b' }}>
              Correct Answer *
            </Text>
            <Radio.Group value={correctAnswer} onChange={setCorrectAnswer}>
              <Stack spacing="xs">
                {options.map((option, index) => (
                  <Radio
                    key={index}
                    value={String.fromCharCode(65 + index)}
                    label={`${String.fromCharCode(65 + index)}. ${option || '(empty)'}`}
                  />
                ))}
              </Stack>
            </Radio.Group>
          </div>
        );

      case 'matching':
      case 'matching-headings':
      case 'matching-information':
      case 'matching-features':
      case 'matching-sentence-endings':
        return (
          <div>
            <Text size="sm" fw={600} mb="xs" style={{ color: '#1e293b' }}>
              Option Label Format
            </Text>
            <Text size="xs" style={{ color: '#64748b', marginBottom: '0.5rem' }}>
              Choose how options are labeled (based on the original passage content)
            </Text>
            <Radio.Group value={optionLabelFormat} onChange={setOptionLabelFormat}>
              <Stack spacing="xs" mb="md">
                <Radio value="letter" label="Letters (A, B, C, D...)" />
                <Radio value="roman" label="Roman Numerals (i, ii, iii, iv...)" />
              </Stack>
            </Radio.Group>

            <Text size="sm" fw={600} mb="xs" style={{ color: '#1e293b' }}>
              Options *
            </Text>
            <Stack spacing="sm">
              {options.map((option, index) => (
                <div key={index} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <Text size="sm" fw={600} style={{ color: '#64748b', minWidth: '24px' }}>
                    {String.fromCharCode(65 + index)}.
                  </Text>
                  <TextInput
                    value={option}
                    onChange={(e) => handleOptionChange(index, e.target.value)}
                    placeholder={`Option ${String.fromCharCode(65 + index)}`}
                    style={{ flex: 1 }}
                  />
                  {options.length > 2 && (
                    <button
                      onClick={() => handleRemoveOption(index)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#ef4444',
                        padding: '0.25rem'
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </Stack>
            <Button
              variant="glass"
              size="xs"
              onClick={handleAddOption}
              style={{ marginTop: '0.5rem' }}
            >
              + Add Option
            </Button>

            <Text size="sm" fw={600} mt="md" mb="xs" style={{ color: '#1e293b' }}>
              Correct Answer *
            </Text>
            <Radio.Group value={correctAnswer} onChange={setCorrectAnswer}>
              <Stack spacing="xs">
                {options.map((option, index) => (
                  <Radio
                    key={index}
                    value={String.fromCharCode(65 + index)}
                    label={`${String.fromCharCode(65 + index)}. ${option || '(empty)'}`}
                  />
                ))}
              </Stack>
            </Radio.Group>
          </div>
        );

      case 'multiple-select':
        return (
          <div>
            <Text size="sm" fw={600} mb="xs" style={{ color: '#1e293b' }}>
              Options *
            </Text>
            <Stack spacing="sm">
              {options.map((option, index) => (
                <div key={index} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <Text size="sm" fw={600} style={{ color: '#64748b', minWidth: '24px' }}>
                    {String.fromCharCode(65 + index)}.
                  </Text>
                  <TextInput
                    value={option}
                    onChange={(e) => handleOptionChange(index, e.target.value)}
                    placeholder={`Option ${String.fromCharCode(65 + index)}`}
                    style={{ flex: 1 }}
                  />
                  {options.length > 2 && (
                    <button
                      onClick={() => handleRemoveOption(index)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#ef4444',
                        padding: '0.25rem'
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </Stack>
            <Button
              variant="glass"
              size="xs"
              onClick={handleAddOption}
              style={{ marginTop: '0.5rem' }}
            >
              + Add Option
            </Button>

            <Text size="sm" fw={600} mt="md" mb="xs" style={{ color: '#1e293b' }}>
              Correct Answers * (select all that apply)
            </Text>
            <Stack spacing="xs">
              {options.map((option, index) => {
                const optionLetter = String.fromCharCode(65 + index);
                return (
                  <Checkbox
                    key={index}
                    checked={correctAnswers.includes(optionLetter)}
                    onChange={() => handleMultipleAnswerToggle(optionLetter)}
                    label={`${optionLetter}. ${option || '(empty)'}`}
                  />
                );
              })}
            </Stack>
          </div>
        );

      case 'completion':
        return (
          <div>
            <Text size="sm" fw={600} mb="xs" style={{ color: '#1e293b' }}>
              Correct Answer *
            </Text>
            <TextInput
              value={correctAnswer}
              onChange={(e) => setCorrectAnswer(e.target.value)}
              placeholder="Enter the correct answer"
            />
            <Text size="xs" style={{ color: '#64748b', marginTop: '0.25rem' }}>
              The blank will be represented as _____ in the question text
            </Text>
          </div>
        );

      case 'true-false-not-given':
      case 'yes-no-not-given':
        const optionsForType = questionType === 'true-false-not-given'
          ? ['True', 'False', 'Not Given']
          : ['Yes', 'No', 'Not Given'];
        return (
          <div>
            <Text size="sm" fw={600} mb="xs" style={{ color: '#1e293b' }}>
              Correct Answer *
            </Text>
            <Radio.Group value={correctAnswer} onChange={setCorrectAnswer}>
              <Stack spacing="xs">
                {optionsForType.map((option) => (
                  <Radio key={option} value={option} label={option} />
                ))}
              </Stack>
            </Radio.Group>
          </div>
        );

      case 'diagram-labeling':
        return (
          <div>
            <Text size="sm" fw={600} mb="xs" style={{ color: '#1e293b' }}>
              Labels *
            </Text>
            <Stack spacing="sm">
              {options.map((option, index) => (
                <div key={index} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <Text size="sm" fw={600} style={{ color: '#64748b', minWidth: '50px' }}>
                    Label {index + 1}:
                  </Text>
                  <TextInput
                    value={option}
                    onChange={(e) => handleOptionChange(index, e.target.value)}
                    placeholder={`Label ${index + 1}`}
                    style={{ flex: 1 }}
                  />
                  {options.length > 2 && (
                    <button
                      onClick={() => handleRemoveOption(index)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#ef4444',
                        padding: '0.25rem'
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </Stack>
            <Button
              variant="glass"
              size="xs"
              onClick={handleAddOption}
              style={{ marginTop: '0.5rem' }}
            >
              + Add Label
            </Button>
            <Text size="xs" style={{ color: '#64748b', marginTop: '0.5rem' }}>
              You'll need to upload a diagram image separately
            </Text>
          </div>
        );

      default:
        return null;
    }
  };

  const content = (
    <>
      {/* Header */}
      <div style={{
        padding: '1.5rem',
        borderBottom: '1px solid rgba(59, 130, 246, 0.15)',
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(14, 165, 233, 0.08) 100%)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Text size="xl" fw={700} style={{ color: '#1e293b' }}>
              Create New Question
            </Text>
            <Text size="sm" style={{ color: '#64748b', marginTop: '0.25rem' }}>
              Fill in the details below
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
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '1.5rem'
      }}>
        <Stack spacing="lg">
          {/* Question Type */}
          <div>
            <Text size="sm" fw={600} mb="xs" style={{ color: '#1e293b' }}>
              Question Type *
            </Text>
            <Select
              value={questionType}
              onChange={(value) => {
                setQuestionType(value);
                setCorrectAnswer('');
                setCorrectAnswers([]);
                if (value === 'completion') {
                  setOptions([]);
                } else {
                  setOptions(['', '', '', '']);
                }
              }}
              data={QUESTION_TYPES}
              styles={{
                input: {
                  borderRadius: '0.5rem',
                  border: '2px solid #cbd5e1',
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  color: '#1e293b'
                }
              }}
            />
          </div>

          {/* Question Text */}
          <div>
            <Text size="sm" fw={600} mb="xs" style={{ color: '#1e293b' }}>
              Question Text *
            </Text>
            <Textarea
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="Enter your question here..."
              minRows={3}
              styles={{
                input: {
                  borderRadius: '0.5rem',
                  border: '2px solid #cbd5e1',
                  fontSize: '0.9375rem',
                  color: '#1e293b'
                }
              }}
            />
          </div>

          {/* Dynamic Fields Based on Question Type */}
          {renderOptionsFields()}

          {/* Points and Timer */}
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <Text size="sm" fw={600} mb="xs" style={{ color: '#1e293b' }}>
                Points
              </Text>
              <NumberInput
                value={points}
                onChange={setPoints}
                min={1}
                max={100}
                step={5}
                styles={{
                  input: {
                    borderRadius: '0.5rem',
                    border: '2px solid #cbd5e1',
                    fontSize: '0.9375rem',
                    fontWeight: 600,
                    color: '#1e293b'
                  }
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <Text size="sm" fw={600} mb="xs" style={{ color: '#1e293b' }}>
                Timer (seconds)
              </Text>
              <NumberInput
                value={timer}
                onChange={setTimer}
                min={5}
                max={300}
                step={5}
                suffix=" s"
                styles={{
                  input: {
                    borderRadius: '0.5rem',
                    border: '2px solid #cbd5e1',
                    fontSize: '0.9375rem',
                    fontWeight: 600,
                    color: '#1e293b'
                  }
                }}
              />
            </div>
          </div>

          {/* Passage Selection */}
          {passages && passages.length > 0 && (
            <div>
              <Text size="sm" fw={600} mb="xs" style={{ color: '#1e293b' }}>
                Link to Passage (Optional)
              </Text>
              <Select
                value={selectedPassage !== null ? selectedPassage.toString() : null}
                onChange={(value) => setSelectedPassage(value !== null ? parseInt(value) : null)}
                placeholder="No passage"
                clearable
                data={[
                  ...passages.map((passage, index) => ({
                    value: index.toString(),
                    label: passage.title || `Passage ${index + 1}`
                  }))
                ]}
                styles={{
                  input: {
                    borderRadius: '0.5rem',
                    border: '2px solid #cbd5e1',
                    fontSize: '0.9375rem',
                    color: '#1e293b'
                  }
                }}
              />
            </div>
          )}
        </Stack>
      </div>

      {/* Footer */}
      <div style={{
        padding: '1.5rem',
        borderTop: '1px solid rgba(59, 130, 246, 0.15)',
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.03) 0%, rgba(14, 165, 233, 0.03) 100%)',
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '0.75rem'
      }}>
        <Button variant="glass" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSave}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '0.5rem' }}>
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
          </svg>
          Create Question
        </Button>
      </div>
    </>
  );

  if (inline) {
    return content;
  }

  return (
    <Modal
      opened={show}
      onClose={onClose}
      size="lg"
      withCloseButton={false}
      padding={0}
      styles={{
        body: { padding: 0 },
        content: {
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(240, 249, 255, 0.98) 100%)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          boxShadow: '0 8px 32px rgba(59, 130, 246, 0.15)',
          borderRadius: '1rem',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column'
        }
      }}
    >
      {content}
    </Modal>
  );
};

export default SingleQuestionCreator;
