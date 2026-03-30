/**
 * AnnotatedEssayReadOnly — PRD-0030 Task 6.2
 * Read-only rendition of an annotated essay.
 * [GAP-16] MUST reuse renderAnnotatedText() from shared utility.
 * Comment click shows tooltip at click position.
 * NO MANTINE.
 */

import { useState, useCallback, useRef } from 'react';
import { renderAnnotatedText } from '../../utils/annotationRenderer';
import type { WritingAnnotation } from '../../types/ielts-writing.types';

interface AnnotatedEssayReadOnlyProps {
    essayText: string;
    annotations: WritingAnnotation[];
}

interface Tooltip {
    text: string;
    left: number;
    top: number;
}

export default function AnnotatedEssayReadOnly({
    essayText,
    annotations,
}: AnnotatedEssayReadOnlyProps) {
    const [tooltip, setTooltip] = useState<Tooltip | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    const handleAnnotationClick = useCallback((annotation: WritingAnnotation, anchorElement?: HTMLElement | null) => {
        if (!annotation.commentText) return;
        const containerRect = containerRef.current?.getBoundingClientRect();
        const anchorRect = anchorElement?.getBoundingClientRect();

        if (containerRect && anchorRect) {
            const tooltipWidth = 280;
            const centeredLeft = anchorRect.left - containerRect.left + (anchorRect.width / 2);
            const boundedLeft = Math.min(
                Math.max(centeredLeft, (tooltipWidth / 2) + 12),
                Math.max((tooltipWidth / 2) + 12, containerRect.width - (tooltipWidth / 2) - 12),
            );
            const relativeTop = Math.max(anchorRect.top - containerRect.top - 56, 12);

            setTooltip({
                text: annotation.commentText,
                left: boundedLeft,
                top: relativeTop,
            });
        } else {
            setTooltip({ text: annotation.commentText, left: 160, top: 12 });
        }

        // Auto-dismiss after 4s
        setTimeout(() => setTooltip(null), 4000);
    }, []);

    const rendered = renderAnnotatedText(essayText, annotations, {
        readOnly: true,
        onAnnotationClick: handleAnnotationClick,
    });

    return (
        <div ref={containerRef} style={{ position: 'relative' }}>
            <div
                style={{
                    padding: '1.5rem',
                    background: '#fff',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '15px',
                    lineHeight: '1.85',
                    color: '#1e293b',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    minHeight: '150px',
                }}
            >
                {rendered}
            </div>

            {/* Floating tooltip for comments */}
            {tooltip && (
                <div
                    style={{
                        position: 'absolute',
                        left: tooltip.left,
                        top: tooltip.top,
                        transform: 'translate(-50%, -100%)',
                        maxWidth: '280px',
                        padding: '10px 14px',
                        background: '#1e293b',
                        color: '#fff',
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                        lineHeight: '1.4',
                        zIndex: 9999,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                        pointerEvents: 'none',
                        animation: 'fadeIn 0.15s ease',
                    }}
                    onClick={() => setTooltip(null)}
                >
                    💬 {tooltip.text}
                </div>
            )}
        </div>
    );
}
