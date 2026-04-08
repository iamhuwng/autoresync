/**
 * Passage Renderer Component
 * Reading-specific component for rendering passage text with highlighting support
 * 
 * Uses native HTML/CSS approach:
 * - Text rendering: Native browser (fast, accessible)
 * - Font size: CSS (instant, no re-render)
 * - Highlights: CSS background-color (simple, performant)
 * - Selection: Native browser API (works perfectly)
 * 
 * Converted from PassageRenderer_v2.jsx to TypeScript (Phase 2 Step 2.4)
 * Moved from src/components/ to src/skills/reading/components/
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';

// ═══════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════

interface Passage {
  type: 'text' | 'image' | 'both';
  content?: string;
  imageUrl?: string;
  caption?: string;
  title?: string;
  id?: string;
}

interface Highlight {
  id: number;
  text: string;
  color: string;
  startPos: number;
  endPos: number;
}

interface ParagraphPosition {
  start: number;
  end: number;
  textStart: number;
  text: string;
  label?: string;     // Detected paragraph label (A, B, i, ii, Section A, etc.)
  labelEnd?: number;  // End position of label in original content (for highlight offset)
}

interface PassageRendererProps {
  passage: Passage | null;
  fontSize?: number;
  onFontSizeChange?: (size: number) => void;
  lineSpacing?: number;
  highlighterActive?: boolean;
  highlightColor?: string;
  clearHighlightsTrigger?: number;
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export const PassageRenderer: React.FC<PassageRendererProps> = ({
  passage,
  fontSize: externalFontSize,
  onFontSizeChange,
  lineSpacing = 1.5,
  highlighterActive = false,
  highlightColor = '#ffeb3b',
  clearHighlightsTrigger = 0
}) => {
  const [imageModalOpen, setImageModalOpen] = useState(false);

  // Font size state
  const [internalFontSize, setInternalFontSize] = useState<number>(() => {
    const saved = localStorage.getItem('passage_font_size');
    return saved ? parseInt(saved, 10) : 16;
  });

  const fontSize = externalFontSize !== undefined ? externalFontSize : internalFontSize;
  const setFontSize = onFontSizeChange || setInternalFontSize;

  // Highlights: array of {text, color, id}
  const [highlights, setHighlights] = useState<Highlight[]>([]);

  // Ref for the content container (excludes title for accurate position calculation)
  const contentContainerRef = useRef<HTMLDivElement>(null);

  // Persist font size
  useEffect(() => {
    if (externalFontSize === undefined) {
      localStorage.setItem('passage_font_size', internalFontSize.toString());
    }
  }, [externalFontSize, internalFontSize]);

  // Clear highlights when triggered
  useEffect(() => {
    if (clearHighlightsTrigger > 0) {
      setHighlights([]);
    }
  }, [clearHighlightsTrigger]);

  // Handle text selection - calculate character positions for precise highlighting
  // Uses the content container ref (NOT including title) for accurate position mapping
  const handleMouseUp = useCallback(() => {
    if (!highlighterActive) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const contentContainer = contentContainerRef.current;
    if (!contentContainer) return;

    try {
      const range = selection.getRangeAt(0);

      // Verify selection is within our content container
      if (!contentContainer.contains(range.commonAncestorContainer)) {
        return;
      }

      const startContainer = getClosestTextContainer(range.startContainer);
      const endContainer = getClosestTextContainer(range.endContainer);
      if (!startContainer || !endContainer) {
        return;
      }

      const startBase = Number(startContainer.dataset.passageTextStart || '0');
      const startLimit = Number(startContainer.dataset.passageTextEnd || String(startBase));
      const endBase = Number(endContainer.dataset.passageTextStart || '0');
      const endLimit = Number(endContainer.dataset.passageTextEnd || String(endBase));

      const startOffset = getOffsetWithinContainer(startContainer, range.startContainer, range.startOffset);
      const endOffset = getOffsetWithinContainer(endContainer, range.endContainer, range.endOffset);

      const startPos = Math.min(startLimit, Math.max(startBase, startBase + startOffset));
      const endPos = Math.min(endLimit, Math.max(endBase, endBase + endOffset));
      if (startPos >= endPos) {
        return;
      }

      const selectedText = (passage?.content || '').slice(startPos, endPos);
      if (!selectedText.trim()) {
        return;
      }

      // Add highlight with position data
      const newHighlight: Highlight = {
        id: Date.now() + Math.random(),
        text: selectedText,
        color: highlightColor,
        startPos,
        endPos
      };

      setHighlights(prev => [...prev, newHighlight]);
    } catch (err) {
      console.error('Error creating highlight:', err);
    }

    // Clear selection
    selection.removeAllRanges();
  }, [highlighterActive, highlightColor, passage?.content]);

  // Remove highlight - memoized to prevent unnecessary re-renders
  const removeHighlight = useCallback((id: number) => {
    setHighlights(prev => prev.filter(h => h.id !== id));
  }, []);

  // Process text with highlights - uses stored positions instead of text matching
  // This function processes the FULL content text, not individual paragraphs
  const processTextWithHighlights = (fullText: string, paragraphStart: number, paragraphEnd: number): React.ReactNode => {
    const paragraphText = fullText.substring(paragraphStart, paragraphEnd);

    if (!paragraphText || highlights.length === 0) {
      return paragraphText;
    }

    // Filter highlights that overlap with this paragraph
    const relevantHighlights = highlights.filter(h => {
      // Check if highlight overlaps with paragraph range
      return h.startPos < paragraphEnd && h.endPos > paragraphStart;
    });

    if (relevantHighlights.length === 0) {
      return paragraphText;
    }

    // Sort by start position (numeric)
    const sortedHighlights = [...relevantHighlights].sort((a, b) => a.startPos - b.startPos);

    // Build result with highlights
    const result: React.ReactNode[] = [];
    let lastIndex = paragraphStart;

    sortedHighlights.forEach((highlight) => {
      const { startPos, endPos, color, id } = highlight;

      // Clamp positions to paragraph boundaries
      const clampedStart = Math.max(startPos, paragraphStart);
      const clampedEnd = Math.min(endPos, paragraphEnd);

      // Skip if this highlight was already covered (overlapping)
      if (clampedStart < lastIndex) return;

      // Skip invalid ranges
      if (clampedStart >= clampedEnd) return;

      // Add text before highlight
      if (clampedStart > lastIndex) {
        result.push(fullText.substring(lastIndex, clampedStart));
      }

      // Add highlighted text
      result.push(
        <mark
          key={`highlight-${id}-${clampedStart}`}
          onClick={() => removeHighlight(id)}
          style={{
            backgroundColor: color,
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
          {fullText.substring(clampedStart, clampedEnd)}
        </mark>
      );

      lastIndex = clampedEnd;
    });

    // Add remaining text in paragraph
    if (lastIndex < paragraphEnd) {
      result.push(fullText.substring(lastIndex, paragraphEnd));
    }

    return result.length > 0 ? result : paragraphText;
  };

  if (!passage) {
    return (
      <div style={{
        backgroundColor: 'white',
        padding: '2rem',
        textAlign: 'center',
        minHeight: '200px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center'
      }}>
        <p style={{ color: '#94a3b8', fontStyle: 'italic', margin: 0, fontFamily: "'Georgia', serif" }}>
          No passage available for this question.
        </p>
      </div>
    );
  }

  const { type, content, imageUrl, caption } = passage;

  // Memoize paragraph positions calculation - only recalculate when content changes
  // Helper to strip markdown bold markers from labels (e.g., "**A**" → "A")
  const stripBold = (text: string): string => text.replace(/^\*\*|\*\*$/g, '').trim();

  // Regex to detect standalone label-only lines: "A", "**A**", "**B**", "i", "**Section A**", etc.
  const STANDALONE_LABEL_REGEX = /^(?:\*\*)?(?:[A-Z]|[ivxlIVXL]+|(?:Section|Paragraph|Part)\s+[A-Za-z0-9]+)(?:\*\*)?\s*$/;
  // Regex to detect inline labels at the start of text: "A  text...", "**A**  text...", etc.
  const INLINE_LABEL_REGEX = /^((?:\*\*)?(?:[A-Z]|[ivxlIVXL]+|(?:Section|Paragraph|Part)\s+[A-Za-z0-9]+)(?:\*\*)?\s{2,})/;

  const paragraphPositions = useMemo((): ParagraphPosition[] => {
    if (!content) return [];

    // Step 1: Build raw line positions
    const rawPositions: ParagraphPosition[] = [];
    let currentPos = 0;
    const contentLines = content.split('\n');

    contentLines.forEach((line) => {
      if (line.trim()) {
        rawPositions.push({
          start: currentPos,
          end: currentPos + line.length,
          textStart: currentPos,
          text: line
        });
      }
      currentPos += line.length + 1; // +1 for the newline character
    });

    // Step 2: Merge standalone labels with the following paragraph
    const merged: ParagraphPosition[] = [];
    let pendingLabel: ParagraphPosition | null = null;

    for (let i = 0; i < rawPositions.length; i++) {
      const pos = rawPositions[i]!;
      const trimmedText = pos.text.trim();

      // Check if this line is a standalone label (just "A", "**A**", "Section A", etc.)
      if (STANDALONE_LABEL_REGEX.test(trimmedText)) {
        pendingLabel = pos;
        continue;
      }

      // Check if this line starts with an inline label (A  text..., **A**  text...)
      const inlineMatch = pos.text.match(INLINE_LABEL_REGEX);

      if (pendingLabel) {
        // Previous line was a standalone label — merge with this text
        merged.push({
          start: pendingLabel.start,
          end: pos.end,
          textStart: pos.start,
          text: pos.text,
          label: stripBold(pendingLabel.text),
          labelEnd: pendingLabel.end,
        });
        pendingLabel = null;
      } else if (inlineMatch) {
        // Label is inline at the start of this paragraph (**A**  The text...)
        const matchedLabel = inlineMatch[1]!;
        merged.push({
          start: pos.start,
          end: pos.end,
          textStart: pos.start + matchedLabel.length,
          text: pos.text.substring(matchedLabel.length),
          label: stripBold(matchedLabel),
          labelEnd: pos.start + matchedLabel.length,
        });
      } else {
        // No label — plain paragraph
        merged.push(pos);
      }
    }

    // If there's a dangling label with no following text, add it as-is
    if (pendingLabel) {
      merged.push({
        start: pendingLabel.start,
        end: pendingLabel.end,
        text: pendingLabel.text,
        label: stripBold(pendingLabel.text),
        labelEnd: pendingLabel.end,
        textStart: pendingLabel.end,
      });
    }

    return merged;
  }, [content]);

  // Render text content
  // CRITICAL FIX: Title is now OUTSIDE the content container with onMouseUp
  // This ensures position calculation matches the content string exactly
  const renderTextContent = () => {
    if (!content) return null;

    return (
      <div
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
          transition: 'font-size 0.2s ease',
        }}
      >
        {/* Title - OUTSIDE content container to not affect position calculations */}
        {passage.title && (
          <>
            <h2 style={{
              fontSize: `${Math.max(fontSize + 4, 20)}px`,
              fontWeight: 700,
              color: '#1a1a1a',
              margin: '0 0 0.5rem 0',
              lineHeight: '1.35',
              letterSpacing: '-0.01em',
              wordWrap: 'break-word',
              userSelect: highlighterActive ? 'text' : 'none'
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

        {/* Content container - ONLY this div has onMouseUp for accurate position tracking */}
        <div
          ref={contentContainerRef}
          onMouseUp={handleMouseUp}
          data-passage-content="true"
          style={{
            userSelect: highlighterActive ? 'text' : 'none',
            cursor: highlighterActive ? 'text' : 'default',
          }}
        >
          {paragraphPositions.map((para, index) => {
            // Detect paragraph breaks: if gap between previous position end and current start > 1,
            // there was an empty line (\n\n) indicating a new paragraph
            const prevPara = index > 0 ? paragraphPositions[index - 1] : undefined;
            const prevEnd = prevPara ? prevPara.end : para.start;
            const gapSize = para.start - prevEnd;
            const isNewParagraph = index > 0 && gapSize > 1;

            // Use the pre-merged label from paragraphPositions
            const label = para.label || null;
            // Text content starts after the label's end position (if merged)
            const textStart = para.labelEnd || para.start;

            return (
              <p key={index} style={{
                margin: isNewParagraph ? '1.25em 0 0.85em 0' : '0 0 0.85em 0',
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
                textAlign: 'justify' as const,
                ...(isNewParagraph && index > 0 ? { paddingTop: '0.25em' } : {}),
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
                    <span
                      data-passage-text-start={textStart}
                      data-passage-text-end={para.end}
                    >
                      {processTextWithHighlights(content, textStart, para.end)}
                    </span>
                  </>
                ) : (
                  <span
                    data-passage-text-start={para.textStart}
                    data-passage-text-end={para.end}
                  >
                    {processTextWithHighlights(content, para.start, para.end)}
                  </span>
                )}
              </p>
            );
          })}
        </div>
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
        padding: '0',
        marginTop: type === 'both' ? '1rem' : '0',
      }}>
        <img
          src={imageUrl}
          alt={caption || 'Passage image'}
          style={{
            width: '100%',
            height: 'auto',
            borderRadius: '6px',
            cursor: 'pointer',
            transition: 'opacity 0.2s, transform 0.2s',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          }}
          onClick={() => setImageModalOpen(true)}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '0.92';
            e.currentTarget.style.transform = 'scale(1.002)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '1';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        />
        <p style={{
          marginTop: '10px',
          fontSize: '0.7em',
          color: '#9c8b75',
          textAlign: 'center',
          marginBottom: 0,
          fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
          letterSpacing: '0.02em',
        }}>
          📷 Click image to enlarge
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
          backgroundColor: 'rgba(15, 12, 8, 0.88)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          cursor: 'pointer',
          backdropFilter: 'blur(4px)',
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
              borderRadius: '10px',
              boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            }}
          />
          <button
            style={{
              position: 'absolute',
              top: '-48px',
              right: '0',
              backgroundColor: 'rgba(255,255,255,0.95)',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 18px',
              cursor: 'pointer',
              fontSize: '0.875em',
              fontWeight: 600,
              color: '#2d2b29',
              fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              transition: 'background-color 0.15s ease',
            }}
            onClick={(e) => {
              e.stopPropagation();
              setImageModalOpen(false);
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.95)'}
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

export default PassageRenderer;

function getClosestTextContainer(node: Node | null): HTMLElement | null {
  if (!node) {
    return null;
  }

  const element = node instanceof HTMLElement ? node : node.parentElement;
  return element?.closest('[data-passage-text-start]') as HTMLElement | null;
}

function getOffsetWithinContainer(container: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(container);

  try {
    range.setEnd(node, offset);
  } catch {
    return container.textContent?.length ?? 0;
  }

  return range.toString().length;
}
