import React, { useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';

/**
 * PassageRenderer v2 - Rewritten with Context-Based Highlighting
 * 
 * Architecture:
 * - Text rendering: Native browser (fast, accessible)
 * - Font size: CSS (instant, no re-render)
 * - Highlights: Context-based matching (robust, position-independent)
 * - Selection: Native browser API
 * 
 * Highlight Storage Format:
 * {
 *   id: number,
 *   text: string,           // The exact highlighted text
 *   contextBefore: string,  // ~30 chars before for unique identification
 *   contextAfter: string,   // ~30 chars after for unique identification
 *   color: string
 * }
 * 
 * This approach is immune to:
 * - CRLF vs LF issues
 * - DOM structure changes
 * - Paragraph index miscalculations
 * - Text node splitting from existing highlights
 */

const CONTEXT_LENGTH = 30; // Characters of context to store for matching

const PassageRendererV2 = ({
  passage,
  fontSize: externalFontSize,
  onFontSizeChange,
  lineSpacing = 1.5,
  highlighterActive = false,
  highlightColor = '#ffeb3b',
  clearHighlightsTrigger = 0,
  showSectionLabels = false
}) => {
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [highlights, setHighlights] = useState([]);

  // Font size state with localStorage persistence
  const [internalFontSize, setInternalFontSize] = useState(() => {
    const saved = localStorage.getItem('passage_font_size');
    return saved ? parseInt(saved, 10) : 16;
  });

  const fontSize = externalFontSize !== undefined ? externalFontSize : internalFontSize;

  // Persist font size
  useEffect(() => {
    localStorage.setItem('passage_font_size', fontSize.toString());
  }, [fontSize]);

  // Clear highlights when triggered
  useEffect(() => {
    if (clearHighlightsTrigger > 0) {
      setHighlights([]);
    }
  }, [clearHighlightsTrigger]);

  // Normalize content once - remove all \r characters and clean up markdown formatting
  const normalizedContent = useMemo(() => {
    if (!passage?.content) return '';
    let content = passage.content.replace(/\r/g, '');
    // Clean markdown bold labels: **A** → A, **B** → B, etc.
    // Also handles *A*, ***A***, and variations
    content = content.replace(/^\*{1,3}([A-Z]|[ivxlIVXL]+|(?:Section|Paragraph|Part)\s+[A-Za-z0-9]+)\*{1,3}/gm, '$1');
    return content;
  }, [passage?.content]);

  // Regex to detect standalone label-only lines (just "A", "B", "i", "ii", "Section A", etc.)
  const STANDALONE_LABEL_REGEX = /^(?:[A-Z]|[ivxlIVXL]+|(?:Section|Paragraph|Part)\s+[A-Za-z0-9]+)\s*$/;

  // Regex to detect inline labels at the start of text (A  text..., Section B  text...)
  const INLINE_LABEL_REGEX = /^((?:[A-Z]|[ivxlIVXL]+|(?:Section|Paragraph|Part)\s+[A-Za-z0-9]+)(?:\s{1,}|\t))(.+)/s;

  // Split content into paragraphs and merge standalone labels with their text
  // Returns array of { label: string|null, text: string } objects
  const paragraphs = useMemo(() => {
    if (!normalizedContent) return [];

    // Step 1: Split into raw segments
    let rawSegments;
    const doubleNewlineSplit = normalizedContent.split(/\n\n+/).filter(s => s.trim());

    if (doubleNewlineSplit.length > 1) {
      rawSegments = doubleNewlineSplit;
    } else {
      // Fallback for legacy data without double newlines
      const singleNewlineSplit = normalizedContent.split('\n').filter(s => s.trim());
      if (singleNewlineSplit.length > 1 && normalizedContent.length > 200) {
        rawSegments = singleNewlineSplit;
      } else {
        rawSegments = doubleNewlineSplit;
      }
    }

    // Step 2: Merge standalone labels with the following paragraph
    const merged = [];
    let pendingLabel = null;

    for (let i = 0; i < rawSegments.length; i++) {
      const segment = rawSegments[i].trim();

      // Check if this segment is a standalone label (just "A", "B", "Section A", etc.)
      if (STANDALONE_LABEL_REGEX.test(segment)) {
        pendingLabel = segment;
        continue;
      }

      // Check if this segment starts with an inline label (A  The text...)
      const inlineMatch = segment.match(INLINE_LABEL_REGEX);

      if (pendingLabel) {
        // Previous segment was a standalone label - merge with this text
        merged.push({ label: pendingLabel, text: segment });
        pendingLabel = null;
      } else if (inlineMatch) {
        // Label is inline at the start of this paragraph
        merged.push({ label: inlineMatch[1].trim(), text: inlineMatch[2] });
      } else {
        // No label - plain paragraph
        merged.push({ label: null, text: segment });
      }
    }

    // If there's a dangling label with no following text, add it as-is
    if (pendingLabel) {
      merged.push({ label: pendingLabel, text: '' });
    }

    return merged;
  }, [normalizedContent]);

  /**
   * Find the position of a highlight in the normalized content using context matching.
   * Returns { start, end } or null if not found.
   */
  const findHighlightPosition = useCallback((highlight) => {
    if (!normalizedContent || !highlight.text) return null;

    const { text, contextBefore, contextAfter } = highlight;

    // Build search pattern: contextBefore + text + contextAfter
    const searchPattern = contextBefore + text + contextAfter;
    const index = normalizedContent.indexOf(searchPattern);

    if (index !== -1) {
      return {
        start: index + contextBefore.length,
        end: index + contextBefore.length + text.length
      };
    }

    // Fallback: Try matching with just contextBefore + text
    const fallbackPattern1 = contextBefore + text;
    const fallbackIndex1 = normalizedContent.indexOf(fallbackPattern1);
    if (fallbackIndex1 !== -1) {
      return {
        start: fallbackIndex1 + contextBefore.length,
        end: fallbackIndex1 + contextBefore.length + text.length
      };
    }

    // Fallback: Try matching with just text + contextAfter
    const fallbackPattern2 = text + contextAfter;
    const fallbackIndex2 = normalizedContent.indexOf(fallbackPattern2);
    if (fallbackIndex2 !== -1) {
      return {
        start: fallbackIndex2,
        end: fallbackIndex2 + text.length
      };
    }

    // Last resort: Try matching the text alone (may match wrong occurrence)
    const textOnlyIndex = normalizedContent.indexOf(text);
    if (textOnlyIndex !== -1) {
      return {
        start: textOnlyIndex,
        end: textOnlyIndex + text.length
      };
    }

    return null;
  }, [normalizedContent]);

  /**
   * Handle text selection - extract text with context for robust storage
   */
  const handleMouseUp = useCallback(() => {
    if (!highlighterActive) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const selectedText = selection.toString();
    if (!selectedText || !selectedText.trim()) return;

    // Get the full text content from the passage container
    const passageContainer = document.querySelector('.passage-content-container');
    if (!passageContainer) return;

    const fullTextContent = passageContainer.textContent || '';

    // Find where the selection appears in the full text
    const selectionIndex = fullTextContent.indexOf(selectedText);
    if (selectionIndex === -1) {
      console.warn('Could not locate selection in content');
      return;
    }

    // Extract context before and after the selection
    const contextBefore = fullTextContent.substring(
      Math.max(0, selectionIndex - CONTEXT_LENGTH),
      selectionIndex
    );
    const contextAfter = fullTextContent.substring(
      selectionIndex + selectedText.length,
      selectionIndex + selectedText.length + CONTEXT_LENGTH
    );

    // Create highlight with context
    const newHighlight = {
      id: Date.now() + Math.random(),
      text: selectedText,
      contextBefore,
      contextAfter,
      color: highlightColor
    };

    setHighlights(prev => [...prev, newHighlight]);
    selection.removeAllRanges();
  }, [highlighterActive, highlightColor]);

  /**
   * Remove a highlight by ID
   */
  const removeHighlight = useCallback((id) => {
    setHighlights(prev => prev.filter(h => h.id !== id));
  }, []);

  /**
   * Compute resolved highlight positions for all highlights
   * Memoized to avoid recalculation on every render
   */
  const resolvedHighlights = useMemo(() => {
    return highlights
      .map(h => {
        const position = findHighlightPosition(h);
        if (!position) return null;
        return { ...h, ...position };
      })
      .filter(Boolean)
      .sort((a, b) => a.start - b.start);
  }, [highlights, findHighlightPosition]);

  /**
   * Render text with highlights applied
   * Takes a text segment and the global start offset
   */
  const renderTextWithHighlights = useCallback((text, globalOffset) => {
    if (!text || resolvedHighlights.length === 0) {
      return text;
    }

    const segmentStart = globalOffset;
    const segmentEnd = globalOffset + text.length;

    // Filter highlights that overlap with this segment
    const relevantHighlights = resolvedHighlights.filter(h =>
      h.start < segmentEnd && h.end > segmentStart
    );

    if (relevantHighlights.length === 0) {
      return text;
    }

    const result = [];
    let lastIndex = 0;

    relevantHighlights.forEach(highlight => {
      // Calculate local positions within this text segment
      const localStart = Math.max(0, highlight.start - globalOffset);
      const localEnd = Math.min(text.length, highlight.end - globalOffset);

      // Skip if already covered
      if (localStart < lastIndex) return;
      if (localStart >= localEnd) return;

      // Add text before highlight
      if (localStart > lastIndex) {
        result.push(text.substring(lastIndex, localStart));
      }

      // Add highlighted text
      result.push(
        <mark
          key={`hl-${highlight.id}-${localStart}`}
          onClick={() => highlighterActive && removeHighlight(highlight.id)}
          style={{
            backgroundColor: highlight.color,
            color: 'inherit',
            cursor: highlighterActive ? 'pointer' : 'default',
            padding: '2px 0',
            borderRadius: '2px',
            transition: 'opacity 0.2s'
          }}
          onMouseEnter={(e) => highlighterActive && (e.currentTarget.style.opacity = '0.7')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          title={highlighterActive ? 'Click to remove highlight' : ''}
        >
          {text.substring(localStart, localEnd)}
        </mark>
      );

      lastIndex = localEnd;
    });

    // Add remaining text
    if (lastIndex < text.length) {
      result.push(text.substring(lastIndex));
    }

    return result.length > 0 ? result : text;
  }, [resolvedHighlights, highlighterActive, removeHighlight]);

  /**
   * Calculate the global offset for each paragraph's text in normalizedContent
   */
  const paragraphOffsets = useMemo(() => {
    if (!normalizedContent || paragraphs.length === 0) return [];

    const offsets = [];
    let currentOffset = 0;

    // Walk through the normalized content to find each paragraph's text position
    paragraphs.forEach(para => {
      const searchText = para.text || para.label || '';
      const index = normalizedContent.indexOf(searchText, currentOffset);
      offsets.push(index !== -1 ? index : currentOffset);
      currentOffset = index !== -1 ? index + searchText.length + 2 : currentOffset + searchText.length + 2;
    });

    return offsets;
  }, [normalizedContent, paragraphs]);

  // Early return if no passage
  if (!passage) {
    return (
      <div style={{
        backgroundColor: '#f0f8ff',
        padding: '20px',
        borderRadius: '8px',
        border: '2px dashed #b0d4f1',
        textAlign: 'center',
        minHeight: '200px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center'
      }}>
        <p style={{ color: '#5a9fd4', fontStyle: 'italic', margin: 0 }}>
          No passage available for this question.
        </p>
      </div>
    );
  }

  const { type, imageUrl, caption } = passage;

  // Check if any paragraph has a detected label
  const hasAnyLabels = useMemo(() => {
    return paragraphs.some(para => para.label !== null);
  }, [paragraphs]);

  // Render text content - clean article style
  const renderTextContent = () => {
    if (!normalizedContent) return null;

    return (
      <div
        className="passage-content-container"
        onMouseUp={handleMouseUp}
        style={{
          width: '100%',
          maxWidth: '100%',
          boxSizing: 'border-box',
          backgroundColor: 'transparent',
          padding: '0',
          marginBottom: type === 'both' ? '20px' : '0',
          fontFamily: "'Georgia', 'Cambria', 'Times New Roman', serif",
          fontSize: `${fontSize}px`,
          lineHeight: lineSpacing,
          color: '#2d2b29',
          userSelect: highlighterActive ? 'text' : 'none',
          cursor: highlighterActive ? 'text' : 'default',
          transition: 'font-size 0.2s ease',
        }}
      >
        {/* Title Block */}
        {passage.title && (
          <>
            <h2 style={{
              fontSize: `${Math.max(fontSize + 4, 20)}px`,
              fontWeight: 700,
              color: '#1a1a1a',
              margin: '0 0 0.5rem 0',
              lineHeight: '1.35',
              wordWrap: 'break-word',
              letterSpacing: '-0.01em',
              fontFamily: "'Georgia', serif",
            }}>
              {passage.title}
            </h2>
            <hr style={{
              border: 'none',
              borderTop: '1px solid #ddd',
              margin: '0 0 1.25rem 0',
            }} />
          </>
        )}

        {/* Content paragraphs with highlights and label detection */}
        {paragraphs.map((para, index) => {
          const { label, text } = para;

          return (
            <p key={index} style={{
              margin: '0 0 0.85em 0',
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word',
              textAlign: 'justify',
            }}>
              {label ? (
                <>
                  <strong style={{
                    fontWeight: 700,
                    color: '#1a1a1a',
                    marginRight: '0.6em',
                  }}>
                    {label}
                  </strong>
                  {renderTextWithHighlights(text, paragraphOffsets[index] || 0)}
                </>
              ) : (
                renderTextWithHighlights(text, paragraphOffsets[index] || 0)
              )}
            </p>
          );
        })}
      </div>
    );
  };

  // Render image content
  const renderImageContent = () => {
    if (!imageUrl) return null;

    return (
      <div style={{
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box',
        backgroundColor: 'transparent',
        padding: '0'
      }}>
        <img
          src={imageUrl}
          alt={caption || 'Passage image'}
          style={{
            width: '100%',
            height: 'auto',
            borderRadius: '4px',
            cursor: 'pointer',
            transition: 'opacity 0.2s'
          }}
          onClick={() => setImageModalOpen(true)}
          onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
          onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
        />
        <p style={{
          marginTop: '8px',
          fontSize: '0.75em',
          color: '#999',
          textAlign: 'center',
          marginBottom: 0
        }}>
          Click image to enlarge
        </p>
      </div>
    );
  };

  // Render image modal
  const renderImageModal = () => {
    if (!imageModalOpen || !imageUrl) return null;

    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          cursor: 'pointer'
        }}
        onClick={() => setImageModalOpen(false)}
      >
        <div style={{ position: 'relative', maxWidth: '90%', maxHeight: '90%' }}>
          <img
            src={imageUrl}
            alt={`${caption || 'Passage image'} - enlarged view`}
            style={{
              maxWidth: '100%',
              maxHeight: '90vh',
              borderRadius: '8px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
            }}
          />
          <button
            style={{
              position: 'absolute',
              top: '-40px',
              right: '0',
              backgroundColor: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '8px 16px',
              cursor: 'pointer',
              fontSize: '1em',
              fontWeight: 'bold'
            }}
            onClick={(e) => {
              e.stopPropagation();
              setImageModalOpen(false);
            }}
          >
            ✕ Close
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ width: '100%', maxWidth: '100%' }}>
      {type === 'text' && renderTextContent()}
      {type === 'image' && renderImageContent()}
      {type === 'both' && (
        <>
          {renderTextContent()}
          {renderImageContent()}
        </>
      )}
      {renderImageModal()}
    </div>
  );
};

PassageRendererV2.propTypes = {
  passage: PropTypes.shape({
    type: PropTypes.oneOf(['text', 'image', 'both']).isRequired,
    content: PropTypes.string,
    imageUrl: PropTypes.string,
    caption: PropTypes.string,
    title: PropTypes.string
  }),
  fontSize: PropTypes.number,
  onFontSizeChange: PropTypes.func,
  lineSpacing: PropTypes.number,
  highlighterActive: PropTypes.bool,
  highlightColor: PropTypes.string,
  clearHighlightsTrigger: PropTypes.number,
  showSectionLabels: PropTypes.bool
};

export default PassageRendererV2;
