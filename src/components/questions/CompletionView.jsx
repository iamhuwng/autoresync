import React, { useState, useMemo } from 'react';
import { Stack, Text, Button, Group, Paper, TextInput, Box, ActionIcon, Badge, Alert } from '@mantine/core';
import { IconZoomReset, IconAlertCircle, IconPencil } from '@tabler/icons-react';
import { useAdaptiveLayout, getFontSizes } from '../../hooks/useAdaptiveLayout';
import WordBank from '../WordBank';

const CompletionView = ({ question, onSubmit, disabled = false, isPassageOpen = false }) => {
  const [typedAnswer, setTypedAnswer] = useState('');
  const [selectedWord, setSelectedWord] = useState(null);
  const [filledAnswer, setFilledAnswer] = useState(null);

  const hasWordBank = question.wordBank && question.wordBank.length > 0;
  const hasContext = question.context && question.context.contextLines && question.context.contextLines.length > 0;

  /**
   * Extract word count limit from question text
   * Matches IELTS patterns like "ONE WORD ONLY", "NO MORE THAN TWO WORDS", etc.
   */
  const extractWordCountLimit = (text) => {
    if (!text) return null;
    
    const patterns = [
      /ONE WORD ONLY/i,
      /NO MORE THAN TWO WORDS/i,
      /NO MORE THAN THREE WORDS AND\/OR A NUMBER/i,
      /NO MORE THAN THREE WORDS/i,
      /ONE WORD AND\/OR A NUMBER/i,
      /TWO WORDS ONLY/i,
      /THREE WORDS ONLY/i,
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[0].toUpperCase();
      }
    }
    
    return null;
  };

  const wordCountLimit = useMemo(() => {
    // Check in question text first
    let limit = extractWordCountLimit(question.question);
    
    // If not found, check in context lines
    if (!limit && hasContext && question.context.contextLines) {
      for (const line of question.context.contextLines) {
        limit = extractWordCountLimit(line);
        if (limit) break;
      }
    }
    
    return limit;
  }, [question.question, hasContext, question.context]);

  const { gridColumns, fontScale, isScaled, resetSize, containerRef } = useAdaptiveLayout({
    items: hasWordBank ? question.wordBank : [],
    questionText: question.question,
    isPassageOpen,
    questionType: 'completion'
  });

  const fontSizes = getFontSizes(fontScale);

  const parseQuestionText = (questionText) => {
    const parts = [];
    const blankPattern = /_+/g;
    let lastIndex = 0;
    let match;

    while ((match = blankPattern.exec(questionText)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: questionText.substring(lastIndex, match.index) });
      }
      parts.push({ type: 'blank', content: match[0] });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < questionText.length) {
      parts.push({ type: 'text', content: questionText.substring(lastIndex) });
    }

    return parts;
  };

  const questionParts = useMemo(() => parseQuestionText(question.question), [question.question]);

  // Render structured context for IELTS-style questions
  const renderStructuredContext = () => {
    if (!hasContext) return null;

    const { sectionHeading, subsectionLabel, contextLines, currentLineIndex } = question.context;

    return (
      <Box mb="md">
        {/* Question Number */}
        {question.number && (
          <Text
            size="lg"
            fw={700}
            style={{
              color: '#3b82f6',
              marginBottom: '0.5rem',
              fontSize: fontSizes.label
            }}
          >
            Question {question.number}:
          </Text>
        )}

        {/* Section Heading */}
        {sectionHeading && (
          <Text
            size="lg"
            fw={700}
            style={{
              color: '#1e293b',
              marginBottom: '0.5rem',
              fontSize: fontSizes.label
            }}
          >
            {sectionHeading}
          </Text>
        )}

        {/* Subsection Label */}
        {subsectionLabel && (
          <Text
            size="md"
            fw={600}
            style={{
              color: '#475569',
              marginBottom: '0.5rem',
              fontSize: fontSizes.label
            }}
          >
            {subsectionLabel}
          </Text>
        )}

        {/* Context Lines */}
        <Box
          style={{
            paddingLeft: '1rem',
            borderLeft: '3px solid #cbd5e1'
          }}
        >
          {contextLines.map((line, index) => {
            const isCurrentLine = index === currentLineIndex;
            const parts = parseQuestionText(line);

            return (
              <Text
                key={index}
                size="md"
                style={{
                  color: isCurrentLine ? '#1e293b' : '#94a3b8',
                  fontWeight: isCurrentLine ? 600 : 400,
                  fontSize: fontSizes.question,
                  lineHeight: 1.8,
                  padding: isCurrentLine ? '0.5rem' : '0.25rem',
                  backgroundColor: isCurrentLine ? '#f0f9ff' : 'transparent',
                  borderRadius: '0.25rem',
                  border: isCurrentLine ? '2px solid #3b82f6' : 'none',
                  marginBottom: '0.25rem'
                }}
              >
                {parts.map((part, partIndex) => {
                  if (part.type === 'text') {
                    return <span key={partIndex}>{part.content}</span>;
                  } else {
                    // Render blank
                    if (isCurrentLine && hasWordBank) {
                      return (
                        <span
                          key={partIndex}
                          style={{
                            display: 'inline-block',
                            minWidth: '150px',
                            padding: '4px 12px',
                            margin: '0 4px',
                            borderBottom: '3px solid #3b82f6',
                            fontWeight: 700,
                            color: filledAnswer ? '#3b82f6' : '#94a3b8',
                            textAlign: 'center'
                          }}
                        >
                          {filledAnswer || '___'}
                        </span>
                      );
                    } else if (isCurrentLine && !hasWordBank) {
                      return (
                        <TextInput
                          key={partIndex}
                          style={{
                            display: 'inline-block',
                            margin: '0 4px',
                            minWidth: wordCountLimit ? '180px' : '150px'
                          }}
                          styles={{
                            input: {
                              borderBottom: '3px solid #3b82f6',
                              borderTop: 'none',
                              borderLeft: 'none',
                              borderRight: 'none',
                              borderRadius: 0,
                              fontWeight: 600,
                              backgroundColor: '#f0f9ff',
                              textAlign: 'center'
                            }
                          }}
                          value={typedAnswer}
                          onChange={(event) => setTypedAnswer(event.currentTarget.value)}
                          placeholder={wordCountLimit ? "Answer..." : "Type answer"}
                          disabled={disabled}
                          size="md"
                        />
                      );
                    } else {
                      return (
                        <span
                          key={partIndex}
                          style={{
                            display: 'inline-block',
                            minWidth: '80px',
                            borderBottom: '2px solid #cbd5e1',
                            color: '#cbd5e1',
                            margin: '0 4px'
                          }}
                        >
                          ______
                        </span>
                      );
                    }
                  }
                })}
              </Text>
            );
          })}
        </Box>
      </Box>
    );
  };

  const handleWordClick = (word) => {
    setSelectedWord(word);
    setFilledAnswer(word);
  };

  const handleClearAnswer = () => {
    setSelectedWord(null);
    setFilledAnswer(null);
    setTypedAnswer('');
  };

  const handleSubmit = () => {
    if (onSubmit) {
      if (hasWordBank && filledAnswer) {
        onSubmit(filledAnswer);
      } else if (!hasWordBank && typedAnswer) {
        onSubmit(typedAnswer);
      }
    }
  };

  const usedWords = filledAnswer ? [filledAnswer] : [];
  const canSubmit = hasWordBank ? !!filledAnswer : typedAnswer.trim() !== '';

  return (
    <Box 
      ref={containerRef}
      style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        height: '100%',
        maxHeight: '100%',
        overflow: 'auto',
        padding: '1rem',
        position: 'relative'
      }}
    >
      <Stack spacing="lg" style={{ flex: 1 }}>
        {/* Word Count Limit Badge - Prominently displayed like IELTS exams */}
        {wordCountLimit && (
          <Alert
            icon={<IconAlertCircle size={24} />}
            title="Word Limit Instruction"
            color="orange"
            variant="filled"
            style={{
              backgroundColor: '#f59e0b',
              borderRadius: '0.5rem',
              boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)'
            }}
          >
            <Text size="lg" fw={700} style={{ color: '#ffffff', fontSize: fontSizes.label }}>
              {wordCountLimit}
            </Text>
          </Alert>
        )}

        <Paper 
          p="xl" 
          withBorder 
          style={{ 
            backgroundColor: '#ffffff',
            borderColor: '#cbd5e1',
            borderWidth: '2px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)'
          }}
        >
          {hasContext ? (
            // Render structured context for IELTS-style questions
            renderStructuredContext()
          ) : (
            // Render simple question text for non-IELTS questions
            <Box>
              {/* Question Type Badge */}
              <Group mb="md" spacing="sm">
                {question.number && (
                  <Badge 
                    size="lg" 
                    variant="filled" 
                    color="blue"
                    style={{ fontSize: fontSizes.label }}
                  >
                    Question {question.number}
                  </Badge>
                )}
                <Badge 
                  size="lg" 
                  variant="outline" 
                  color="gray"
                  leftSection={<IconPencil size={14} />}
                  style={{ fontSize: fontSizes.label }}
                >
                  {hasWordBank ? 'Fill in the blank' : 'Short Answer'}
                </Badge>
              </Group>

              <Text 
                size="xl" 
                fw={600} 
                component="div" 
                style={{ 
                  color: '#1e293b',
                  fontSize: fontSizes.question,
                  lineHeight: 1.8,
                  marginBottom: '1rem'
                }}
              >
                {questionParts.map((part, index) => {
                if (part.type === 'text') {
                  return <span key={index}>{part.content}</span>;
                } else {
                  if (hasWordBank) {
                    return (
                      <span
                        key={index}
                        style={{
                          display: 'inline-block',
                          minWidth: '150px',
                          padding: '8px 16px',
                          margin: '0 8px',
                          borderBottom: '3px solid #3b82f6',
                          fontWeight: 700,
                          color: filledAnswer ? '#3b82f6' : '#94a3b8',
                          textAlign: 'center',
                          fontSize: fontSizes.option
                        }}
                      >
                        {filledAnswer || '___'}
                      </span>
                    );
                  } else {
                    return (
                      <TextInput
                        key={index}
                        style={{ 
                          display: 'inline-block', 
                          margin: '0 8px',
                          minWidth: wordCountLimit ? '200px' : '150px'
                        }}
                        styles={{
                          input: {
                            borderBottom: '3px solid #3b82f6',
                            borderTop: 'none',
                            borderLeft: 'none',
                            borderRight: 'none',
                            borderRadius: 0,
                            fontWeight: 600,
                            fontSize: fontSizes.option,
                            backgroundColor: 'transparent',
                            textAlign: 'center'
                          }
                        }}
                        value={typedAnswer}
                        onChange={(event) => setTypedAnswer(event.currentTarget.value)}
                        placeholder={wordCountLimit ? "Your answer..." : "Type answer"}
                        disabled={disabled}
                        size="lg"
                      />
                    );
                  }
                }
              })}
              </Text>
            </Box>
          )}
        </Paper>

        {hasWordBank ? (
          <>
            <Text 
              size="md" 
              fw={600} 
              style={{ 
                color: '#64748b',
                fontSize: fontSizes.label,
                padding: '0.5rem 1rem',
                background: 'rgba(59, 130, 246, 0.1)',
                borderRadius: '0.5rem',
                border: '2px solid rgba(59, 130, 246, 0.3)'
              }}
            >
              Select a word from the word bank below
            </Text>
            
            {/* Word Bank Grid */}
            <Box
              style={{
                display: 'grid',
                gridTemplateColumns: gridColumns === 3 ? 'repeat(3, 1fr)' : gridColumns === 2 ? 'repeat(2, 1fr)' : '1fr',
                gap: fontScale === 'compact' ? '0.75rem' : '1rem'
              }}
            >
              {(question.wordBank || []).map((word, index) => {
                const isUsed = usedWords.includes(word);
                const isSelected = selectedWord === word;
                
                return (
                  <Button
                    key={index}
                    onClick={() => !disabled && !isUsed && handleWordClick(word)}
                    disabled={disabled || isUsed}
                    variant={isSelected ? 'filled' : 'light'}
                    color={isSelected ? 'blue' : 'dark'}
                    size={fontScale === 'compact' ? 'sm' : 'md'}
                    style={{
                      fontSize: fontSizes.option,
                      opacity: isUsed ? 0.5 : 1,
                      cursor: isUsed ? 'not-allowed' : 'pointer',
                      fontWeight: 700,
                      color: isSelected ? undefined : '#000000'
                    }}
                  >
                    {word}
                  </Button>
                );
              })}
            </Box>
          </>
        ) : (
          <Box>
            <Text 
              size="md" 
              fw={600} 
              style={{ 
                color: '#64748b',
                fontSize: fontSizes.label,
                marginBottom: wordCountLimit ? '0.5rem' : 0
              }}
            >
              {wordCountLimit ? (
                <>
                  <IconPencil size={16} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
                  Type your answer in the box above. Remember: <strong>{wordCountLimit}</strong>
                </>
              ) : (
                <>
                  <IconPencil size={16} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
                  Type your answer in the box above.
                </>
              )}
            </Text>
            {wordCountLimit && (
              <Alert 
                icon={<IconAlertCircle size={16} />}
                color="yellow" 
                variant="light"
                style={{ fontSize: '0.9rem' }}
              >
                Ensure your answer follows the word count restriction
              </Alert>
            )}
          </Box>
        )}

        {onSubmit && (
          <Group mt="md" spacing="md">
            <Button
              onClick={handleSubmit}
              disabled={disabled || !canSubmit}
              size="lg"
              color="blue"
            >
              Submit Answer
            </Button>
            {(filledAnswer || typedAnswer) && !disabled && (
              <Button onClick={handleClearAnswer} size="lg" variant="outline" color="gray">
                Clear
              </Button>
            )}
          </Group>
        )}
      </Stack>

      {/* Reset Size Button */}
      {isScaled && (
        <ActionIcon
          onClick={resetSize}
          size="lg"
          variant="filled"
          color="blue"
          style={{
            position: 'absolute',
            bottom: '1rem',
            left: '1rem',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: 10
          }}
          title="Reset to original size"
        >
          <IconZoomReset size={20} />
        </ActionIcon>
      )}
    </Box>
  );
};

export default CompletionView;
