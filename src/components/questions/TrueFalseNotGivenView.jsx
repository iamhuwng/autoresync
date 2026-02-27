import React from 'react';
import { Stack, Text, Paper, Box, ActionIcon } from '@mantine/core';
import { IconZoomReset } from '@tabler/icons-react';
import PropTypes from 'prop-types';
import { useAdaptiveLayout, getFontSizes } from '../../hooks/useAdaptiveLayout';

/**
 * TrueFalseNotGivenView Component
 *
 * Displays a True/False/Not Given question on the teacher screen.
 * This is commonly used in reading comprehension tests (IELTS-style).
 * Shows the statement and the three possible answers.
 */
const TrueFalseNotGivenView = ({ question, isPassageOpen = false }) => {
  const options = ['True', 'False', 'Not Given'];
  
  const { gridColumns, fontScale, isScaled, resetSize, containerRef } = useAdaptiveLayout({
    items: options,
    questionText: question.question,
    isPassageOpen,
    questionType: 'true-false-not-given'
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

        <Text 
          size="md" 
          fw={600} 
          style={{ 
            color: '#8b5cf6',
            fontSize: fontSizes.label,
            padding: '0.5rem 1rem',
            background: 'rgba(139, 92, 246, 0.1)',
            borderRadius: '0.5rem',
            border: '2px solid rgba(139, 92, 246, 0.3)'
          }}
        >
          ℹ️ True/False/Not Given
        </Text>

        <Box
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: fontScale === 'compact' ? '0.75rem' : '1rem',
            flex: 1
          }}
        >
          {options.map((option, index) => {
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

TrueFalseNotGivenView.propTypes = {
  question: PropTypes.shape({
    question: PropTypes.string.isRequired,
    answer: PropTypes.oneOf(['True', 'False', 'Not Given']).isRequired,
    timer: PropTypes.number,
    points: PropTypes.number
  }).isRequired,
  isPassageOpen: PropTypes.bool
};

export default TrueFalseNotGivenView;
