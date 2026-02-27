import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import { Stack, Text, Box, Card, ActionIcon } from '@mantine/core';
import { IconZoomReset } from '@tabler/icons-react';
import { useAdaptiveLayout, getFontSizes } from '../../hooks/useAdaptiveLayout';

/**
 * MatchingView Component
 *
 * Displays a matching question on the teacher screen.
 * Supports two formats:
 * 1. Grouped matching: items array + options array + answers object
 * 2. Individual matching (IELTS): options array + answer string
 */
const MatchingView = ({ question, isPassageOpen = false }) => {
  // Debug: Log question structure
  console.log('[MatchingView] Question structure:', {
    hasItems: !!question.items,
    hasOptions: !!question.options,
    hasAnswer: !!question.answer,
    hasAnswers: !!question.answers,
    optionsType: question.options ? typeof question.options : 'undefined',
    optionsIsArray: Array.isArray(question.options),
    optionsLength: question.options?.length,
    answerType: question.answer ? typeof question.answer : 'undefined',
    questionNumber: question.number
  });

  // Determine if this is individual (IELTS) or grouped format
  // Allow missing/empty answer for teacher view (will show as unanswered)
  const isIndividualFormat = !question.items && Array.isArray(question.options) && question.options.length > 0;
  const isGroupedFormat = question.items && Array.isArray(question.options) && question.answers;

  // Validate format
  if (!isIndividualFormat && !isGroupedFormat) {
    console.error('[MatchingView] Invalid format detected:', {
      question: question.question?.substring(0, 50),
      hasItems: !!question.items,
      hasOptions: !!question.options,
      optionsIsArray: Array.isArray(question.options),
      hasAnswer: !!question.answer,
      hasAnswers: !!question.answers
    });
    
    return (
      <Box p="md">
        <Text c="red" size="lg" fw={600} mb="sm">
          Invalid matching question: missing required fields
        </Text>
        <Text c="dimmed" size="sm" mb="xs">Question {question.number || '?'}</Text>
        <Text c="dimmed" size="sm">Debug info:</Text>
        <Text c="dimmed" size="xs" style={{ fontFamily: 'monospace' }}>
          • items: {question.items ? '✓' : '✗'}<br/>
          • options: {question.options ? (Array.isArray(question.options) ? `✓ (array, ${question.options.length} items)` : '✗ (not array)') : '✗'}<br/>
          • answer: {question.answer ? `✓ (${typeof question.answer})` : '✗'}<br/>
          • answers: {question.answers ? '✓' : '✗'}
        </Text>
      </Box>
    );
  }

  const { gridColumns, fontScale, isScaled, resetSize, containerRef, textMetrics } = useAdaptiveLayout({
    items: isIndividualFormat ? question.options : [...(question.items || []), ...(question.options || [])],
    questionText: question.question,
    isPassageOpen,
    questionType: 'matching'
  });

  const fontSizes = getFontSizes(fontScale);

  // Determine layout: horizontal (side-by-side) or vertical (stacked)
  const useVerticalLayout = useMemo(() => {
    // Use vertical layout if most text is long or passage is open
    return textMetrics.mostAreLong || (isPassageOpen && textMetrics.avgLength > 50);
  }, [textMetrics, isPassageOpen]);

  // Render individual format (IELTS style - like multiple choice)
  if (isIndividualFormat) {
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
          <Text 
            size="xl" 
            fw={700} 
            style={{ 
              color: '#1e293b',
              fontSize: fontSizes.question,
              lineHeight: 1.4
            }}
          >
            {question.number && <span style={{ color: '#3b82f6', marginRight: '0.5rem' }}>Question {question.number}:</span>}
            {question.question}
          </Text>

          {/* Options - Responsive Grid Layout */}
          <Box
            style={{
              display: 'grid',
              gridTemplateColumns: gridColumns === 3 ? 'repeat(3, 1fr)' : gridColumns === 2 ? 'repeat(2, 1fr)' : '1fr',
              gap: fontScale === 'compact' ? '0.75rem' : '1rem',
              flex: 1
            }}
          >
            {question.options.map((option, index) => {
              const isCorrect = question.answer && option === question.answer;
              const noAnswer = !question.answer || question.answer === '' || question.answer === '[answer]';
              return (
                <Card
                  key={index}
                  p={fontScale === 'compact' ? 'sm' : 'md'}
                  shadow="sm"
                  radius="md"
                  style={{
                    backgroundColor: isCorrect ? '#d1fae5' : noAnswer ? '#fef3c7' : '#f8fafc',
                    border: isCorrect ? '3px solid #10b981' : noAnswer ? '2px solid #fbbf24' : '2px solid #e2e8f0',
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', width: '100%' }}>
                    <Text 
                      size="lg" 
                      fw={700} 
                      style={{ 
                        color: isCorrect ? '#059669' : noAnswer ? '#d97706' : '#64748b',
                        fontSize: fontSizes.option,
                        flex: 1
                      }}
                    >
                      {option}
                    </Text>
                    {isCorrect && (
                      <Box
                        style={{
                          marginLeft: 'auto',
                          padding: '0.25rem 0.75rem',
                          background: '#10b981',
                          borderRadius: '9999px',
                          color: 'white',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          flexShrink: 0
                        }}
                      >
                        ✓ Correct Answer
                      </Box>
                    )}
                    {noAnswer && index === 0 && (
                      <Box
                        style={{
                          marginLeft: 'auto',
                          padding: '0.25rem 0.75rem',
                          background: '#fbbf24',
                          borderRadius: '9999px',
                          color: '#78350f',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          flexShrink: 0
                        }}
                      >
                        ⚠️ Answer Not Set
                      </Box>
                    )}
                  </div>
                </Card>
              );
            })}
          </Box>
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
  }

  const getOptionText = (optionId) => {
    const option = question.options.find((o) => o.id === optionId);
    return option ? option.text : 'N/A';
  };

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
        <Text 
          size="xl" 
          fw={700} 
          style={{ 
            color: '#1e293b',
            fontSize: fontSizes.question,
            lineHeight: 1.4
          }}
        >
          {question.number && <span style={{ color: '#3b82f6', marginRight: '0.5rem' }}>Question {question.number}:</span>}
          {question.question}
        </Text>

        {/* Instruction banner for students */}
        <Box
          style={{
            padding: '1rem 1.5rem',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '0.75rem',
            border: '2px solid rgba(139, 92, 246, 0.3)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
          }}
        >
          <Text
            size="lg"
            fw={600}
            style={{
              color: '#ffffff',
              textAlign: 'center',
              fontSize: fontSizes.label
            }}
          >
            📱 Students: Drag and drop items on your device to match pairs
          </Text>
        </Box>

        <Box style={{ 
          display: 'flex', 
          flexDirection: useVerticalLayout ? 'column' : 'row',
          gap: '1.5rem', 
          flexWrap: useVerticalLayout ? 'nowrap' : 'wrap'
        }}>
          {/* Left side: Items to be matched */}
          <Box style={{ flex: useVerticalLayout ? '1' : '1 1 300px', minWidth: useVerticalLayout ? 'auto' : '280px' }}>
            <Text 
              size="lg" 
              fw={700} 
              mb="md" 
              style={{ 
                color: '#1e293b',
                fontSize: fontSizes.label
              }}
            >
              Items to Match:
            </Text>
            <Stack spacing={fontScale === 'compact' ? 'xs' : 'sm'}>
              {question.items.map((item) => (
                <Card
                  key={item.id}
                  p={fontScale === 'compact' ? 'sm' : 'md'}
                  shadow="sm"
                  radius="md"
                  style={{
                    backgroundColor: '#f1f5f9',
                    border: '2px solid #cbd5e1'
                  }}
                >
                  <Text 
                    size="md" 
                    fw={600} 
                    style={{ 
                      color: '#1e293b',
                      fontSize: fontSizes.option
                    }}
                  >
                    {item.text}
                  </Text>
                </Card>
              ))}
            </Stack>
          </Box>

          {/* Right side: Answer pool options */}
          <Box style={{ flex: useVerticalLayout ? '1' : '1 1 300px', minWidth: useVerticalLayout ? 'auto' : '280px' }}>
            <Text 
              size="lg" 
              fw={700} 
              mb="md" 
              style={{ 
                color: '#1e293b',
                fontSize: fontSizes.label
              }}
            >
              Answer Pool:
            </Text>
            <Stack spacing={fontScale === 'compact' ? 'xs' : 'sm'}>
              {question.options.map((option) => (
                <Card
                  key={option.id}
                  p={fontScale === 'compact' ? 'sm' : 'md'}
                  shadow="sm"
                  radius="md"
                  style={{
                    backgroundColor: '#dbeafe',
                    border: '2px solid #3b82f6'
                  }}
                >
                  <Text 
                    size="md" 
                    fw={600} 
                    style={{ 
                      color: '#1e293b',
                      fontSize: fontSizes.option
                    }}
                  >
                    {option.text}
                  </Text>
                </Card>
              ))}
            </Stack>
          </Box>
        </Box>

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

MatchingView.propTypes = {
  question: PropTypes.shape({
    question: PropTypes.string.isRequired,
    items: PropTypes.arrayOf(PropTypes.shape({
      id: PropTypes.string.isRequired,
      text: PropTypes.string.isRequired,
    })).isRequired,
    options: PropTypes.arrayOf(PropTypes.shape({
      id: PropTypes.string.isRequired,
      text: PropTypes.string.isRequired,
    })).isRequired,
    answers: PropTypes.object.isRequired,
    points: PropTypes.number,
    reusableAnswers: PropTypes.bool,
  }).isRequired
};

export default MatchingView;
