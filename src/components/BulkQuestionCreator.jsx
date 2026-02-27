import React, { useState } from 'react';
import { Modal, Text, Textarea, Select, FileButton } from '@mantine/core';
import { Button } from './modern';
import { parseTextToQuiz } from '../utils/parsers/textParser';

const BulkQuestionCreator = ({ show, onClose, onSave, passages, inline = false }) => {
  const [inputText, setInputText] = useState('');
  const [selectedPassage, setSelectedPassage] = useState(null);
  const [file, setFile] = useState(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState('');

  const handleFileUpload = async (uploadedFile) => {
    setFile(uploadedFile);
    setParseError('');

    if (uploadedFile) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        setInputText(text);
      };

      if (uploadedFile.type === 'application/pdf') {
        setParseError('PDF parsing requires additional library. Please paste text instead.');
      } else {
        reader.readAsText(uploadedFile);
      }
    }
  };

  const handleParse = async () => {
    if (!inputText.trim()) {
      setParseError('Please enter or upload some text to parse');
      return;
    }

    setIsParsing(true);
    setParseError('');

    try {
      // Use the text parser to parse questions
      const result = parseTextToQuiz(inputText);
      
      if (!result.success || !result.quiz || !result.quiz.questions || result.quiz.questions.length === 0) {
        setParseError(result.error || 'No questions were found in the text. Please check the format and try again.');
        setIsParsing(false);
        return;
      }

      // Add passage if selected
      const questionsWithPassage = result.quiz.questions.map(q => {
        const question = { ...q };
        if (selectedPassage !== null && passages && passages[selectedPassage]) {
          question.passage = passages[selectedPassage];
        }
        return question;
      });

      onSave(questionsWithPassage);
      onClose();
    } catch (error) {
      console.error('Error parsing questions:', error);
      setParseError(`Error: ${error.message || 'Failed to parse questions. Please check the format.'}`);
    } finally {
      setIsParsing(false);
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
              Add Bulk Questions
            </Text>
            <Text size="sm" style={{ color: '#64748b', marginTop: '0.25rem' }}>
              Paste text or upload a file for AI parsing
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* File Upload */}
          <div>
            <Text size="sm" fw={600} mb="xs" style={{ color: '#1e293b' }}>
              Upload File (Optional)
            </Text>
            <FileButton
              onChange={handleFileUpload}
              accept=".txt,.md,.doc,.docx"
            >
              {(props) => (
                <Button {...props} variant="glass" style={{ width: '100%' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.5rem' }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  {file ? file.name : 'Choose File (.txt, .md, .doc, .docx)'}
                </Button>
              )}
            </FileButton>
            {file && (
              <Text size="xs" style={{ color: '#10b981', marginTop: '0.5rem' }}>
                ✓ File loaded: {file.name}
              </Text>
            )}
          </div>

          {/* Text Input */}
          <div>
            <Text size="sm" fw={600} mb="xs" style={{ color: '#1e293b' }}>
              Questions Text *
            </Text>
            <Textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`Paste your questions here...

Example format:
1. What is the capital of France?
A. London
B. Paris
C. Berlin
D. Madrid
Answer: B

2. Which of the following are programming languages? (Select all that apply)
A. Python
B. HTML
C. JavaScript
D. CSS
Answer: A, C`}
              minRows={12}
              styles={{
                input: {
                  borderRadius: '0.5rem',
                  border: '2px solid #cbd5e1',
                  fontSize: '0.875rem',
                  color: '#1e293b',
                  fontFamily: 'monospace',
                  lineHeight: 1.6
                }
              }}
            />
            <Text size="xs" style={{ color: '#64748b', marginTop: '0.5rem' }}>
              AI will automatically detect question types and parse the content
            </Text>
          </div>

          {/* Passage Selection */}
          {passages && passages.length > 0 && (
            <div>
              <Text size="sm" fw={600} mb="xs" style={{ color: '#1e293b' }}>
                Link All Questions to Passage (Optional)
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
              <Text size="xs" style={{ color: '#64748b', marginTop: '0.5rem' }}>
                All parsed questions will be associated with this passage
              </Text>
            </div>
          )}

          {/* Format Tips */}
          <div style={{
            padding: '1rem',
            background: 'rgba(59, 130, 246, 0.05)',
            borderRadius: '0.5rem',
            border: '1px solid rgba(59, 130, 246, 0.1)'
          }}>
            <Text size="sm" fw={600} style={{ color: '#3b82f6', marginBottom: '0.5rem' }}>
              💡 Tips for best results:
            </Text>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.875rem', color: '#64748b', lineHeight: 1.8 }}>
              <li>Number your questions (1., 2., 3., etc.)</li>
              <li>Label options with letters (A., B., C., D.)</li>
              <li>Include "Answer:" or "Correct:" followed by the answer</li>
              <li>For multiple answers, separate with commas: "Answer: A, C"</li>
              <li>Clear formatting helps AI parse accurately</li>
            </ul>
          </div>

          {/* Error Display */}
          {parseError && (
            <div style={{
              padding: '1rem',
              background: 'rgba(239, 68, 68, 0.05)',
              borderRadius: '0.5rem',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'flex-start'
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#ef4444" style={{ flexShrink: 0, marginTop: '0.125rem' }}>
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12" stroke="white" strokeWidth="2"/>
                <line x1="12" y1="16" x2="12.01" y2="16" stroke="white" strokeWidth="2"/>
              </svg>
              <Text size="sm" style={{ color: '#ef4444', flex: 1 }}>
                {parseError}
              </Text>
            </div>
          )}
        </div>
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
        <Button variant="glass" onClick={onClose} disabled={isParsing}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleParse} disabled={isParsing || !inputText.trim()}>
          {isParsing ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.5rem', animation: 'spin 1s linear infinite' }}>
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
              </svg>
              Parsing...
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.5rem' }}>
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
              </svg>
              Parse Questions
            </>
          )}
        </Button>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
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

export default BulkQuestionCreator;
