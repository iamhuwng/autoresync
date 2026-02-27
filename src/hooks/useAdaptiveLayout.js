import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';

/**
 * useAdaptiveLayout Hook
 * 
 * Intelligently calculates the optimal layout strategy for question content
 * based on available space, content length, and passage panel state.
 * 
 * @param {Object} options - Configuration options
 * @param {Array} options.items - Array of text items (options, labels, etc.)
 * @param {string} options.questionText - The question text
 * @param {boolean} options.isPassageOpen - Whether passage panel is open
 * @param {string} options.questionType - Type of question (multiple-choice, matching, etc.)
 * @param {Object} options.imageData - Image data for diagram questions {url, aspectRatio}
 * @returns {Object} Layout configuration and control functions
 */
export const useAdaptiveLayout = ({
  items = [],
  questionText = '',
  isPassageOpen = false,
  questionType = 'multiple-choice',
  imageData = null
}) => {
  const containerRef = useRef(null);
  const [availableHeight, setAvailableHeight] = useState(0);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [isScaled, setIsScaled] = useState(false);
  const [manualOverride, setManualOverride] = useState(null);
  const prevDimensionsRef = useRef({ width: 0, height: 0 });

  // Measure available space - use useLayoutEffect for immediate measurement after DOM update
  useLayoutEffect(() => {
    const measureSpace = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const newHeight = rect.height;
        const newWidth = rect.width;
        
        // Only update if values actually changed to avoid unnecessary re-renders
        if (newHeight !== prevDimensionsRef.current.height || newWidth !== prevDimensionsRef.current.width) {
          prevDimensionsRef.current = { width: newWidth, height: newHeight };
          setAvailableHeight(newHeight);
          setAvailableWidth(newWidth);
        }
      }
    };

    measureSpace();
    
    // Also measure after a short delay to catch any layout shifts
    const timeoutId = setTimeout(measureSpace, 100);
    
    window.addEventListener('resize', measureSpace);
    return () => {
      window.removeEventListener('resize', measureSpace);
      clearTimeout(timeoutId);
    };
  }, [isPassageOpen]); // Note: Don't include availableHeight/Width to avoid infinite loops

  // Calculate text metrics
  const textMetrics = useMemo(() => {
    const itemLengths = items.map(item => {
      if (typeof item === 'string') return item.length;
      if (item?.text) return item.text.length;
      return 0;
    });

    const totalLength = itemLengths.reduce((sum, len) => sum + len, 0);
    const avgLength = items.length > 0 ? totalLength / items.length : 0;
    const maxLength = Math.max(...itemLengths, 0);
    const minLength = Math.min(...itemLengths.filter(l => l > 0), 0);

    // Categorize text length
    const isShort = avgLength < 40;
    const isMedium = avgLength >= 40 && avgLength < 80;
    const isLong = avgLength >= 80;

    // Check if most items are short
    const shortCount = itemLengths.filter(len => len < 40).length;
    const mostAreShort = shortCount / items.length > 0.7;

    // Check if most items are long
    const longCount = itemLengths.filter(len => len >= 80).length;
    const mostAreLong = longCount / items.length > 0.5;

    return {
      totalLength,
      avgLength,
      maxLength,
      minLength,
      isShort,
      isMedium,
      isLong,
      mostAreShort,
      mostAreLong,
      itemCount: items.length
    };
  }, [items]);

  // Calculate optimal grid columns
  const calculateGridColumns = useCallback(() => {
    const { itemCount, mostAreShort, avgLength } = textMetrics;
    
    if (itemCount <= 2) return 1;
    
    // Adjust for passage panel
    const widthFactor = isPassageOpen ? 0.6 : 1;
    const effectiveWidth = availableWidth * widthFactor;

    if (mostAreShort) {
      // Short text: prefer grid layout
      if (effectiveWidth > 900 && itemCount >= 6) return 3;
      if (effectiveWidth > 600 && itemCount >= 4) return 2;
      if (itemCount >= 4) return 2;
    } else if (avgLength < 60) {
      // Medium text
      if (effectiveWidth > 800 && itemCount >= 4) return 2;
    }

    return 1; // Default to vertical
  }, [textMetrics, availableWidth, isPassageOpen]);

  // Calculate font scale level
  const calculateFontScale = useCallback(() => {
    if (manualOverride === 'reset') {
      return 'normal';
    }

    const { mostAreLong, itemCount } = textMetrics;
    
    // Estimate required height
    const questionHeight = Math.ceil(questionText.length / 80) * 60; // ~60px per line
    const baseItemHeight = 80; // Base height per item
    const itemsHeight = itemCount * baseItemHeight;
    const totalEstimatedHeight = questionHeight + itemsHeight + 100; // +100 for padding

    // Adjust threshold for passage panel
    const heightThreshold = isPassageOpen ? availableHeight * 0.9 : availableHeight * 0.95;

    if (totalEstimatedHeight <= heightThreshold) {
      return 'normal'; // 1.25rem question, 1rem options
    }

    if (mostAreLong || totalEstimatedHeight > heightThreshold * 1.3) {
      if (totalEstimatedHeight > heightThreshold * 1.6) {
        return 'compact'; // 1rem question, 0.8125rem options
      }
      return 'small'; // 1.125rem question, 0.875rem options
    }

    return 'medium'; // 1.1875rem question, 0.9375rem options
  }, [textMetrics, questionText, availableHeight, isPassageOpen, manualOverride]);

  // Calculate image layout for diagram questions
  const calculateImageLayout = useCallback(() => {
    if (!imageData || questionType !== 'diagram-labeling') {
      return { layout: 'vertical', imageSize: 'normal' };
    }

    const { aspectRatio = 1 } = imageData;
    const isHorizontal = aspectRatio > 1.2;
    const isVertical = aspectRatio < 0.8;
    const isSquare = aspectRatio >= 0.8 && aspectRatio <= 1.2;

    // Horizontal images: stack vertically (image top, labels bottom)
    if (isHorizontal) {
      return { layout: 'vertical', imageSize: 'normal' };
    }

    // Vertical or square: side-by-side (image left, labels right)
    if (isVertical || isSquare) {
      // Check if we have enough width
      const effectiveWidth = isPassageOpen ? availableWidth * 0.6 : availableWidth;
      if (effectiveWidth > 700) {
        return { layout: 'horizontal', imageSize: 'normal', split: '50/50' };
      }
    }

    // Fallback to vertical
    return { layout: 'vertical', imageSize: 'normal' };
  }, [imageData, questionType, availableWidth, isPassageOpen]);

  // Calculate grid columns
  const gridColumns = useMemo(() => {
    return calculateGridColumns();
  }, [calculateGridColumns]);

  // Calculate font scale
  const fontScale = useMemo(() => {
    return calculateFontScale();
  }, [calculateFontScale]);

  // Calculate image layout
  const imageLayout = useMemo(() => {
    return calculateImageLayout();
  }, [calculateImageLayout]);

  // Update isScaled based on fontScale
  useEffect(() => {
    if (manualOverride === 'reset') {
      setIsScaled(false);
    } else {
      setIsScaled(fontScale !== 'normal');
    }
  }, [fontScale, manualOverride]);

  // Control functions
  const resetSize = () => {
    setManualOverride('reset');
  };

  const expandImage = () => {
    setManualOverride('expand-image');
  };

  return {
    gridColumns,
    fontScale,
    imageLayout,
    isScaled,
    containerRef,
    resetSize,
    expandImage,
    textMetrics
  };
};

/**
 * Get font size based on scale level
 */
export const getFontSizes = (scale) => {
  const sizes = {
    normal: {
      question: 'clamp(1.25rem, 3vw, 1.75rem)',
      option: 'clamp(1rem, 2.5vw, 1.25rem)',
      label: 'clamp(0.875rem, 2vw, 1rem)'
    },
    medium: {
      question: 'clamp(1.1875rem, 2.8vw, 1.5rem)',
      option: 'clamp(0.9375rem, 2.3vw, 1.125rem)',
      label: 'clamp(0.8125rem, 1.8vw, 0.9375rem)'
    },
    small: {
      question: 'clamp(1.125rem, 2.6vw, 1.375rem)',
      option: 'clamp(0.875rem, 2.1vw, 1rem)',
      label: 'clamp(0.75rem, 1.6vw, 0.875rem)'
    },
    compact: {
      question: 'clamp(1rem, 2.4vw, 1.25rem)',
      option: 'clamp(0.8125rem, 1.9vw, 0.9375rem)',
      label: 'clamp(0.6875rem, 1.4vw, 0.8125rem)'
    }
  };

  return sizes[scale] || sizes.normal;
};

export default useAdaptiveLayout;
