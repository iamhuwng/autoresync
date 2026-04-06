/**
 * AnnotatedEssayReadOnly - PRD-0030 Task 6.2
 * Read-only rendition of legacy compatibility annotations.
 * [GAP-16] MUST reuse renderAnnotatedText() from shared utility.
 * Aligns tooltip and feedback-selection behavior with the published viewer.
 * NO MANTINE.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RichContent } from '../../core/components/RichContent';
import { renderAnnotatedText } from '../../utils/annotationRenderer';
import type { WritingAnnotation } from '../../types/ielts-writing.types';
import {
    getCommentTooltipOverlayPosition,
    type CommentTooltipPlacement,
    type OverlayPosition,
} from '../writing-grading/annotationOverlayPosition';

interface AnnotatedEssayReadOnlyProps {
    essayText: string;
    annotations: WritingAnnotation[];
    onFeedbackSelect?: (feedbackId: string, anchorViewportTop: number | null) => void;
}

interface TooltipState extends OverlayPosition {
    annotation: WritingAnnotation;
    placement: CommentTooltipPlacement;
}

export default function AnnotatedEssayReadOnly({
    essayText,
    annotations,
    onFeedbackSelect,
}: AnnotatedEssayReadOnlyProps) {
    const [tooltip, setTooltip] = useState<TooltipState | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const overlayPortalRoot = typeof document !== 'undefined' ? document.body : null;

    const handleAnnotationClick = useCallback((annotation: WritingAnnotation, anchorElement?: HTMLElement | null) => {
        const anchorRect = anchorElement?.getBoundingClientRect();

        if (!anchorRect) {
            return;
        }

        const position = getCommentTooltipOverlayPosition(anchorRect);
        setTooltip({
            annotation,
            top: position.top,
            left: position.left,
            placement: position.placement,
        });
        onFeedbackSelect?.(annotation.id, anchorRect.top);
    }, [onFeedbackSelect]);

    useEffect(() => {
        if (!tooltip || typeof window === 'undefined') {
            return undefined;
        }

        const dismissTooltip = () => {
            setTooltip(null);
        };

        window.addEventListener('resize', dismissTooltip);
        window.addEventListener('scroll', dismissTooltip, true);

        return () => {
            window.removeEventListener('resize', dismissTooltip);
            window.removeEventListener('scroll', dismissTooltip, true);
        };
    }, [tooltip]);

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

            {tooltip && (overlayPortalRoot
                ? createPortal(
                    <LegacyAnnotationTooltip tooltip={tooltip} />,
                    overlayPortalRoot,
                )
                : <LegacyAnnotationTooltip tooltip={tooltip} />)}
        </div>
    );
}

function LegacyAnnotationTooltip({
    tooltip,
}: {
    tooltip: TooltipState;
}) {
    const { annotation } = tooltip;
    const isCorrection = annotation.type === 'correction';

    return (
        <div
            className="essay-comment-tooltip"
            data-comment-tooltip="true"
            data-placement={tooltip.placement}
            style={{
                position: 'fixed',
                top: tooltip.top,
                left: tooltip.left,
                zIndex: 9999,
                maxWidth: 320,
            }}
        >
            <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#cbd5e1', marginBottom: '0.4rem' }}>
                {isCorrection ? (annotation.categoryLabel || 'Correction') : (annotation.categoryLabel || 'Comment')}
            </div>
            {isCorrection ? (
                <div style={{ display: 'grid', gap: '0.3rem', fontSize: '0.84rem', lineHeight: 1.5 }}>
                    <div style={{ color: '#cbd5e1' }}>Replace with</div>
                    <div>{annotation.correctionText || 'No replacement text'}</div>
                </div>
            ) : (
                <RichContent
                    content={annotation.commentText || ''}
                    className="essay-comment-tooltip-body"
                />
            )}
        </div>
    );
}
