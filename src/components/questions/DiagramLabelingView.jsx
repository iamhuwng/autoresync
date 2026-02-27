import React, { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { Stack, Text, Box, Card, Image, ActionIcon } from '@mantine/core';
import { IconZoomReset, IconMaximize } from '@tabler/icons-react';
import { useAdaptiveLayout, getFontSizes } from '../../hooks/useAdaptiveLayout';

const DiagramLabelingView = ({ question, isPassageOpen = false }) => {
  const [imageAspectRatio, setImageAspectRatio] = useState(null);
  const [imageExpanded, setImageExpanded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Load image and detect aspect ratio
  useEffect(() => {
    if (!question.diagramUrl) return;

    const img = document.createElement('img');
    img.onload = () => {
      const aspectRatio = img.width / img.height;
      setImageAspectRatio(aspectRatio);
      setImageError(false);
    };
    img.onerror = () => {
      setImageAspectRatio(1); // Default to square on error
      setImageError(true);
    };
    img.src = question.diagramUrl;
  }, [question.diagramUrl]);

  const { fontScale, isScaled, resetSize, containerRef } = useAdaptiveLayout({
    items: question.labels || [],
    questionText: question.question,
    isPassageOpen,
    questionType: 'diagram-labeling',
    imageData: { aspectRatio: imageAspectRatio }
  });

  const fontSizes = getFontSizes(fontScale);

  // Determine layout based on aspect ratio
  const imageLayout = useMemo(() => {
    if (!imageAspectRatio) return 'vertical'; // Default while loading

    const isHorizontal = imageAspectRatio > 1.2;
    const isVertical = imageAspectRatio < 0.8;
    const isSquare = imageAspectRatio >= 0.8 && imageAspectRatio <= 1.2;

    // Horizontal images: vertical layout (image top, labels bottom)
    if (isHorizontal) {
      return 'vertical';
    }

    // Vertical or square: horizontal layout if enough width
    if (isVertical || isSquare) {
      const effectiveWidth = isPassageOpen ? window.innerWidth * 0.6 : window.innerWidth;
      if (effectiveWidth > 700) {
        return 'horizontal';
      }
    }

    return 'vertical';
  }, [imageAspectRatio, isPassageOpen]);
  if (!question || !question.diagramUrl || !question.labels) {
    return (
      <Box p="md">
        <Text c="red">Invalid diagram labeling question: missing diagramUrl or labels</Text>
      </Box>
    );
  }

  return (
    <Box 
      ref={containerRef}
      style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        height: '100%',
        maxHeight: '100%',
        overflow: imageExpanded ? 'auto' : 'hidden',
        padding: '1rem',
        position: 'relative'
      }}
    >
      <Stack spacing="lg" style={{ flex: 1, overflow: imageExpanded ? 'visible' : 'hidden' }}>
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

        <Box style={{
          display: 'flex',
          flexDirection: imageLayout === 'horizontal' ? 'row' : 'column',
          gap: '1.5rem',
          flex: 1
        }}>
          {/* Image Section */}
          <Box style={{ 
            flex: imageLayout === 'horizontal' ? '1' : 'auto',
            position: 'relative'
          }}>
            <Card 
              withBorder 
              p="lg" 
              style={{
                backgroundColor: '#ffffff',
                borderColor: '#cbd5e1',
                borderWidth: '2px',
                position: 'relative'
              }}
            >
              {imageError ? (
                <Box style={{ 
                  minHeight: '200px', 
                  display: 'flex', 
                  flexDirection: 'column',
                  alignItems: 'center', 
                  justifyContent: 'center',
                  gap: '1rem'
                }}>
                  <Text c="red" size="lg">Failed to load image</Text>
                  <ActionIcon
                    onClick={() => {
                      setImageError(false);
                      setImageAspectRatio(null);
                    }}
                    size="lg"
                    variant="filled"
                    color="blue"
                  >
                    Retry
                  </ActionIcon>
                </Box>
              ) : (
                <Image 
                  src={question.diagramUrl} 
                  alt="Diagram for labeling" 
                  fit="contain"
                  style={{ 
                    maxHeight: imageExpanded ? 'none' : (imageLayout === 'horizontal' ? '300px' : '400px'),
                    width: '100%'
                  }}
                />
              )}
              
              {/* Expand Image Button */}
              {!imageExpanded && !imageError && imageAspectRatio && (
                <ActionIcon
                  onClick={() => setImageExpanded(true)}
                  size="lg"
                  variant="filled"
                  color="blue"
                  style={{
                    position: 'absolute',
                    top: '1rem',
                    right: '1rem',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    zIndex: 10
                  }}
                  title="Expand to original size"
                >
                  <IconMaximize size={20} />
                </ActionIcon>
              )}

              {/* Collapse Image Button */}
              {imageExpanded && (
                <ActionIcon
                  onClick={() => setImageExpanded(false)}
                  size="lg"
                  variant="filled"
                  color="blue"
                  style={{
                    position: 'absolute',
                    top: '1rem',
                    right: '1rem',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    zIndex: 10
                  }}
                  title="Collapse image"
                >
                  <IconZoomReset size={20} />
                </ActionIcon>
              )}
            </Card>
          </Box>

          {/* Labels Section */}
          <Box style={{ flex: imageLayout === 'horizontal' ? '1' : 'auto' }}>
            <Text 
              size="lg" 
              fw={700} 
              mb="md"
              style={{ 
                color: '#1e293b',
                fontSize: fontSizes.label
              }}
            >
              Labels:
            </Text>

            <Stack spacing={fontScale === 'compact' ? 'xs' : 'sm'}>
              {question.labels.map((label, index) => (
                <Card 
                  key={label.id} 
                  withBorder 
                  p={fontScale === 'compact' ? 'sm' : 'md'}
                  style={{
                    backgroundColor: '#ffffff',
                    borderColor: '#cbd5e1',
                    borderWidth: '2px'
                  }}
                >
                  <Text 
                    style={{ 
                      color: '#1e293b', 
                      fontWeight: 600,
                      fontSize: fontSizes.option
                    }}
                  >
                    <strong>{index + 1}.</strong> {label.sentence}
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

DiagramLabelingView.propTypes = {
  question: PropTypes.shape({
    question: PropTypes.string.isRequired,
    diagramUrl: PropTypes.string.isRequired,
    labels: PropTypes.arrayOf(
      PropTypes.shape({
        id: PropTypes.string.isRequired,
        sentence: PropTypes.string.isRequired,
        answer: PropTypes.string.isRequired,
        inputType: PropTypes.string,
        options: PropTypes.arrayOf(PropTypes.string),
      })
    ).isRequired,
  }).isRequired,
};

export default DiagramLabelingView;
