import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { RichContent } from '../../core/components/RichContent';
import type { PublishedCommentData, PublishedCorrectionData } from './writingResultSurface';
import { getAlignedRailTranslateY, revealRailItemInViewport } from '../writing-grading/annotationRailPosition';

interface PublishedFeedbackPanelProps {
    comments: PublishedCommentData[];
    corrections: PublishedCorrectionData[];
    selectedFeedbackId?: string | null;
    selectedFeedbackAnchorViewportTop?: number | null;
    alignToEssay?: boolean;
    emptyMessage?: string;
    maxHeight?: string;
}

export default function PublishedFeedbackPanel({
    comments,
    corrections,
    selectedFeedbackId = null,
    selectedFeedbackAnchorViewportTop = null,
    alignToEssay = false,
    emptyMessage = 'No published comments or corrections for this task.',
    maxHeight = 'min(68vh, 720px)',
}: PublishedFeedbackPanelProps) {
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const stackRef = useRef<HTMLDivElement | null>(null);
    const feedbackRefs = useRef<Record<string, HTMLElement | null>>({});
    const feedbackHeaderRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const [feedbackStackTranslateY, setFeedbackStackTranslateY] = useState(0);
    const sortedComments = useMemo(
        () => comments.slice().sort((left, right) => left.from - right.from),
        [comments],
    );
    const sortedCorrections = useMemo(
        () => corrections.slice().sort((left, right) => left.from - right.from),
        [corrections],
    );
    const hasFeedback = sortedComments.length > 0 || sortedCorrections.length > 0;

    useLayoutEffect(() => {
        if (!selectedFeedbackId) {
            setFeedbackStackTranslateY(0);
            return;
        }

        const viewportElement = viewportRef.current;
        const stackElement = stackRef.current;
        const selectedFeedbackElement = feedbackRefs.current[selectedFeedbackId];
        const selectedFeedbackHeaderElement = feedbackHeaderRefs.current[selectedFeedbackId] ?? null;

        if (!selectedFeedbackElement || !stackElement || !selectedFeedbackHeaderElement) {
            setFeedbackStackTranslateY(0);
            return;
        }

        if (alignToEssay && viewportElement && selectedFeedbackAnchorViewportTop !== null) {
            const railPadding = 12;
            setFeedbackStackTranslateY(getAlignedRailTranslateY({
                viewportElement,
                stackElement,
                headerElement: selectedFeedbackHeaderElement,
                anchorViewportTop: selectedFeedbackAnchorViewportTop,
                paddingTop: railPadding,
                paddingBottom: railPadding,
            }));
            return;
        }

        setFeedbackStackTranslateY(0);
        if (viewportElement) {
            revealRailItemInViewport({
                viewportElement,
                itemElement: selectedFeedbackHeaderElement ?? selectedFeedbackElement,
                paddingTop: 12,
                paddingBottom: 12,
            });
        }
    }, [alignToEssay, selectedFeedbackAnchorViewportTop, selectedFeedbackId]);

    if (!hasFeedback) {
        return <EmptyPanelMessage message={emptyMessage} />;
    }

    return (
        <div
            ref={viewportRef}
            data-feedback-viewport="true"
            style={{
                maxHeight: alignToEssay ? maxHeight : undefined,
                overflowY: alignToEssay ? 'auto' : undefined,
                paddingRight: alignToEssay ? '0.25rem' : undefined,
            }}
        >
            <div
                ref={stackRef}
                data-feedback-shifted={alignToEssay && selectedFeedbackId && selectedFeedbackAnchorViewportTop !== null ? 'true' : 'false'}
                data-feedback-stack="true"
                style={{
                    display: 'grid',
                    gap: '1rem',
                    transform: alignToEssay ? `translateY(${feedbackStackTranslateY}px)` : 'none',
                    transition: 'transform 0.22s ease',
                }}
            >
                {sortedComments.length > 0 && (
                    <FeedbackSection title="Comments">
                        {sortedComments.map((comment) => (
                            <PublishedFeedbackCard
                                key={comment.id}
                                id={comment.id}
                                selected={selectedFeedbackId === comment.id}
                                headerLabel={comment.categoryLabel}
                                anchorText={comment.anchorText}
                            >
                                <RichContent content={comment.text} style={{ color: '#374151', lineHeight: 1.55, fontSize: '0.86rem' }} />
                            </PublishedFeedbackCard>
                        ))}
                    </FeedbackSection>
                )}

                {sortedCorrections.length > 0 && (
                    <FeedbackSection title="Corrections">
                        {sortedCorrections.map((correction) => (
                            <PublishedFeedbackCard
                                key={correction.id}
                                id={correction.id}
                                selected={selectedFeedbackId === correction.id}
                                headerLabel={correction.label}
                                anchorText={correction.anchorText}
                            >
                                <div style={{ display: 'grid', gap: '0.35rem', color: '#374151', fontSize: '0.86rem', lineHeight: 1.55 }}>
                                    <div>
                                        <span style={{ fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: '#6b7280', marginRight: '0.45rem' }}>
                                            Replace with
                                        </span>
                                        <span>{correction.correctionText || 'No replacement text'}</span>
                                    </div>
                                </div>
                            </PublishedFeedbackCard>
                        ))}
                    </FeedbackSection>
                )}
            </div>
        </div>
    );

    function PublishedFeedbackCard({
        id,
        selected,
        headerLabel,
        anchorText,
        children,
    }: {
        id: string;
        selected: boolean;
        headerLabel: string;
        anchorText: string;
        children: React.ReactNode;
    }) {
        return (
            <article
                ref={(node) => {
                    feedbackRefs.current[id] = node;
                }}
                data-feedback-card-id={id}
                data-highlighted={selected ? 'true' : 'false'}
                style={{
                    ...mutedPanelStyle(),
                    border: selected ? '1px solid #818cf8' : '1px solid #e5e7eb',
                    background: selected ? '#eef2ff' : '#f9fafb',
                    boxShadow: selected ? '0 0 0 3px rgba(99, 102, 241, 0.18), 0 16px 32px rgba(79, 70, 229, 0.12)' : 'none',
                    transition: 'border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease',
                }}
            >
                <div
                    ref={(node) => {
                        feedbackHeaderRefs.current[id] = node;
                    }}
                    data-feedback-header-id={id}
                    style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'baseline', marginBottom: '0.35rem', flexWrap: 'wrap' }}
                >
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#4f46e5' }}>
                        {headerLabel}
                    </span>
                    {anchorText ? (
                        <span style={{ fontSize: '0.76rem', color: '#6b7280' }}>{anchorText}</span>
                    ) : null}
                </div>
                {children}
            </article>
        );
    }
}

function FeedbackSection({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <section style={{ display: 'grid', gap: '0.8rem' }}>
            <div style={{ fontSize: '0.74rem', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#64748b' }}>
                {title}
            </div>
            <div style={{ display: 'grid', gap: '0.8rem' }}>{children}</div>
        </section>
    );
}

function EmptyPanelMessage({
    message,
}: {
    message: string;
}) {
    return (
        <div style={{ padding: '0.95rem', borderRadius: '16px', border: '1px dashed #cbd5e1', background: '#f8fafc', color: '#94a3b8', fontSize: '0.88rem' }}>
            {message}
        </div>
    );
}

function mutedPanelStyle(): React.CSSProperties {
    return {
        padding: '0.95rem',
        borderRadius: '16px',
        background: '#f9fafb',
        border: '1px solid #e5e7eb',
    };
}
