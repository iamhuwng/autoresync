/**
 * AnnotatedEssayRenderer — PRD-0030 Task 5.4
 * Renders student essay with annotation overlays for grading page.
 * Imports and uses renderAnnotatedText() from shared utility.
 * NO MANTINE.
 */

import { forwardRef } from 'react';
import { renderAnnotatedText } from '../../utils/annotationRenderer';
import type { WritingAnnotation } from '../../types/ielts-writing.types';

interface AnnotatedEssayRendererProps {
    essayText: string;
    annotations: WritingAnnotation[];
    onAnnotationClick?: (annotation: WritingAnnotation) => void;
    onAnnotationDelete?: (id: string) => void;
}

const AnnotatedEssayRenderer = forwardRef<HTMLDivElement, AnnotatedEssayRendererProps>(
    function AnnotatedEssayRenderer(
        { essayText, annotations, onAnnotationClick, onAnnotationDelete },
        ref,
    ) {
        const rendered = renderAnnotatedText(essayText, annotations, {
            readOnly: false,
            onAnnotationClick,
            onAnnotationDelete,
        });

        return (
            <div
                ref={ref}
                style={{
                    padding: '1.5rem',
                    background: '#fff',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '16px',
                    lineHeight: '1.8',
                    color: '#1e293b',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    minHeight: '200px',
                    userSelect: 'text',
                    cursor: 'text',
                }}
            >
                {rendered}
                <style>{`
          .annotation-group:hover .annotation-delete-btn {
            display: inline-block !important;
          }
        `}</style>
            </div>
        );
    }
);

export default AnnotatedEssayRenderer;
