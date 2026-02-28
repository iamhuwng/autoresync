/**
 * AnnotatedEssayReadOnly — PRD-0030 Task 6.2
 * Read-only rendition of an annotated essay.
 * [GAP-16] MUST reuse renderAnnotatedText() from shared utility.
 * Comment click shows tooltip at click position.
 * NO MANTINE.
 */

import { useState, useCallback } from 'react';
import { renderAnnotatedText } from '../../utils/annotationRenderer';
import type { WritingAnnotation } from '../../types/ielts-writing.types';

interface AnnotatedEssayReadOnlyProps {
    essayText: string;
    annotations: WritingAnnotation[];
}

interface Tooltip {
    text: string;
    x: number;
    y: number;
}

export default function AnnotatedEssayReadOnly({
    essayText,
    annotations,
}: AnnotatedEssayReadOnlyProps) {
    const [tooltip, setTooltip] = useState<Tooltip | null>(null);

    const handleAnnotationClick = useCallback((annotation: WritingAnnotation) => {
        if (!annotation.commentText) return;
        // Position tooltip at cursor
        const selection = document.getSelection();
        if (selection && selection.rangeCount > 0) {
            const rect = selection.getRangeAt(0).getBoundingClientRect();
            setTooltip({
                text: annotation.commentText,
                x: rect.left + rect.width / 2,
                y: rect.top - 10,
            });
        } else {
            setTooltip({ text: annotation.commentText, x: 0, y: 0 });
        }
        // Auto-dismiss after 4s
        setTimeout(() => setTooltip(null), 4000);
    }, []);

    const rendered = renderAnnotatedText(essayText, annotations, {
        readOnly: true,
        onAnnotationClick: handleAnnotationClick,
    });

    return (
        <div style={{ position: 'relative' }}>
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
                        position: 'fixed',
                        left: Math.max(20, tooltip.x - 120),
                        top: Math.max(20, tooltip.y - 60),
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
