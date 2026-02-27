import React, { useState } from 'react';
import { Checkbox, Stack, Text, Button, Group, Box, Paper, ActionIcon } from '@mantine/core';
import { IconZoomReset } from '@tabler/icons-react';
import { useAdaptiveLayout, getFontSizes } from '../../hooks/useAdaptiveLayout';

/**
 * MultipleSelectView Component
 *
 * Displays a multiple-select question where students can choose multiple answers
 * using checkboxes. For teacher view, shows correct answers highlighted.
 */
const MultipleSelectView = ({ question, onSubmit, disabled = false, isPassageOpen = false }) => {
  const [selectedAnswers, setSelectedAnswers] = useState([]);
  
  const { gridColumns, fontScale, isScaled, resetSize, containerRef } = useAdaptiveLayout({
    items: question.options || [],
    questionText: question.question,
    isPassageOpen,
    questionType: 'multiple-select'
  });

  const fontSizes = getFontSizes(fontScale);
  const badgeSize = fontScale === 'compact' ? '40px' : fontScale === 'small' ? '44px' : '48px';

  const handleCheckboxChange = (option) => {
    setSelectedAnswers((prev) => {
      if (prev.includes(option)) {
        return prev.filter((item) => item !== option);
      } else {
        return [...prev, option];
      }
    });
  };

  const handleSubmit = () => {
    if (onSubmit && selectedAnswers.length > 0) {
      onSubmit(selectedAnswers);
    }
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
            lineHeight: 1.4, 
            color: '#1e293b',
            fontSize: fontSizes.question
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
          ✓ Select all that apply
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
                    borderRadius: '0.5rem',
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
                      color: '#1e293b', 
                      fontWeight: 600,
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
        {onSubmit && (
          <Group mt="md">
            <Button
              onClick={handleSubmit}
              disabled={disabled || selectedAnswers.length === 0}
              size="lg"
            >
              Submit ({selectedAnswers.length} selected)
            </Button>
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

export default MultipleSelectView;
