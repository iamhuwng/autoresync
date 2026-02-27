import React from 'react';
import { Stack, Text, Paper, Box, ActionIcon } from '@mantine/core';
import { IconZoomReset } from '@tabler/icons-react';
import PropTypes from 'prop-types';
import { useAdaptiveLayout, getFontSizes } from '../../hooks/useAdaptiveLayout';

/**
 * MultipleChoiceView Component
 *
 * Displays a multiple-choice question on the teacher screen.
 * Shows the full question text and all answer options.
 * This is for teacher display only - students see simplified interface.
 */
const MultipleChoiceView = ({ question, isPassageOpen = false }) => {
  const { gridColumns, fontScale, isScaled, resetSize, containerRef } = useAdaptiveLayout({
    items: question.options || [],
    questionText: question.question,
    isPassageOpen,
    questionType: 'multiple-choice'
  });

  const fontSizes = getFontSizes(fontScale);
  const badgeSize = fontScale === 'compact' ? '40px' : fontScale === 'small' ? '44px' : '48px';

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
            lineHeight: 1.4, 
            color: '#1e293b',
            fontSize: fontSizes.question,
            marginBottom: '0.5rem'
          }}
        >
          {question.number && <span style={{ color: '#3b82f6', marginRight: '0.5rem' }}>Question {question.number}:</span>}
          {question.question}
        </Text>

        <Box
          style={{
            display: 'grid',
            gridTemplateColumns: gridColumns === 3 ? 'repeat(3, 1fr)' : gridColumns === 2 ? 'repeat(2, 1fr)' : '1fr',
            gap: fontScale === 'compact' ? '0.75rem' : '1rem',
            flex: 1
          }}
        >
          {question.options && question.options.map((option, index) => {
            const optionLabel = String.fromCharCode(65 + index);

            return (
              <Paper
                key={index}
                p={fontScale === 'compact' ? 'md' : 'lg'}
                withBorder
                style={{
                  backgroundColor: '#ffffff',
                  borderColor: '#cbd5e1',
                  borderWidth: '2px',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', width: '100%' }}>
                  <div style={{
                    minWidth: badgeSize,
                    height: badgeSize,
                    borderRadius: '50%',
                    backgroundColor: '#64748b',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: '700',
                    fontSize: fontScale === 'compact' ? '1rem' : '1.25rem',
                    flexShrink: 0
                  }}>
                    {optionLabel}
                  </div>
                  <Text 
                    size="lg" 
                    style={{ 
                      flex: 1, 
                      color: '#0f172a', 
                      fontWeight: 700,
                      fontSize: fontSizes.option,
                      lineHeight: 1.5
                    }}
                  >
                    {option}
                  </Text>
                </div>
              </Paper>
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
};

MultipleChoiceView.propTypes = {
  question: PropTypes.shape({
    question: PropTypes.string.isRequired,
    options: PropTypes.arrayOf(PropTypes.string).isRequired,
    answer: PropTypes.string.isRequired
  }).isRequired
};

export default MultipleChoiceView;
