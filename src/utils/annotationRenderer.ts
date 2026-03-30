/**
 * Annotation Renderer — PRD-0030 Task 5.4 [GAP-16]
 * Shared utility for rendering annotated essay text.
 * Used by both AnnotatedEssayRenderer (grading) and AnnotatedEssayReadOnly (results).
 * NO MANTINE.
 */

import React from 'react';
import type { WritingAnnotation } from '../types/ielts-writing.types';

interface RenderOptions {
    readOnly: boolean;
    onAnnotationClick?: (annotation: WritingAnnotation, anchorElement?: HTMLElement | null) => void;
    onAnnotationDelete?: (id: string) => void;
}

/**
 * Render essay text with annotation styling applied.
 * Algorithm:
 * 1. Sort annotations by startOffset
 * 2. Walk text building segments at annotation boundaries
 * 3. Apply overlapping annotation styles as combined <span>
 */
export function renderAnnotatedText(
    essayText: string,
    annotations: WritingAnnotation[],
    options: RenderOptions
): React.ReactNode[] {
    if (!essayText || annotations.length === 0) {
        return [React.createElement('span', { key: 'plain' }, essayText || '')];
    }

    // Collect all boundary points
    const boundaries = new Set<number>();
    boundaries.add(0);
    boundaries.add(essayText.length);

    for (const a of annotations) {
        boundaries.add(Math.max(0, a.startOffset));
        boundaries.add(Math.min(essayText.length, a.endOffset));
    }

    const sortedBounds = Array.from(boundaries).sort((a, b) => a - b);
    const segments: React.ReactNode[] = [];

    for (let i = 0; i < sortedBounds.length - 1; i++) {
        const start = sortedBounds[i];
        const end = sortedBounds[i + 1];
        const text = essayText.slice(start, end);

        if (!text) continue;

        // Find all annotations overlapping this segment
        const overlapping = annotations.filter(
            a => a.startOffset <= start! && a.endOffset >= end!
        );

        if (overlapping.length === 0) {
            segments.push(React.createElement('span', { key: `s-${i}` }, text));
            continue;
        }

        // Build combined styles
        const style: React.CSSProperties = {};
        const decorations: string[] = [];
        let hasComment = false;
        let correction: WritingAnnotation | null = null;

        for (const a of overlapping) {
            switch (a.type) {
                case 'highlight':
                    style.backgroundColor = `${a.color || '#fbbf24'}33`;
                    break;
                case 'strikethrough':
                    decorations.push('line-through');
                    style.color = style.color || '#94a3b8';
                    break;
                case 'correction':
                    decorations.push('line-through');
                    correction = a;
                    break;
                case 'textColor':
                    style.color = a.color || '#ef4444';
                    break;
                case 'comment':
                    style.borderBottom = '2px dotted ' + (a.color || '#3b82f6');
                    style.cursor = 'pointer';
                    hasComment = true;
                    break;
            }
        }

        if (decorations.length > 0) {
            style.textDecoration = decorations.join(' ');
        }

        // Create the element
        const mainSpan = React.createElement(
            'span',
            {
                key: `a-${i}`,
                style,
                onClick: hasComment && options.onAnnotationClick
                    ? (event: React.MouseEvent<HTMLSpanElement>) => {
                        const commentAnnotation = overlapping.find(a => a.type === 'comment');
                        if (commentAnnotation) options.onAnnotationClick!(commentAnnotation, event.currentTarget);
                    }
                    : undefined,
                title: hasComment
                    ? overlapping.find(a => a.type === 'comment')?.commentText || ''
                    : undefined,
            },
            text
        );

        const children: React.ReactNode[] = [mainSpan];

        // Add correction replacement
        if (correction?.correctionText) {
            children.push(
                React.createElement(
                    'sup',
                    {
                        key: `corr-${i}`,
                        style: { color: '#10b981', fontWeight: 600, fontSize: '0.8em', marginLeft: '2px' },
                    },
                    correction.correctionText
                )
            );
        }

        // Add delete button for non-readonly mode
        if (!options.readOnly && options.onAnnotationDelete && i === 0) {
            // Only show delete on the first segment of each annotation
            for (const a of overlapping) {
                if (a.startOffset === start) {
                    children.push(
                        React.createElement(
                            'button',
                            {
                                key: `del-${a.id}`,
                                onClick: (e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    options.onAnnotationDelete!(a.id);
                                },
                                style: {
                                    display: 'none',  // Show on hover via CSS
                                    position: 'relative' as const,
                                    top: '-8px',
                                    width: '14px',
                                    height: '14px',
                                    borderRadius: '50%',
                                    border: 'none',
                                    background: '#ef4444',
                                    color: '#fff',
                                    fontSize: '9px',
                                    cursor: 'pointer',
                                    padding: 0,
                                    lineHeight: '14px',
                                },
                                className: 'annotation-delete-btn',
                            },
                            '×'
                        )
                    );
                }
            }
        }

        if (children.length === 1) {
            segments.push(mainSpan);
        } else {
            segments.push(
                React.createElement('span', { key: `wrap-${i}`, className: 'annotation-group' }, ...children)
            );
        }
    }

    return segments;
}
