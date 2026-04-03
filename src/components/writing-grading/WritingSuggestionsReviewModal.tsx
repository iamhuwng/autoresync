import React, { useEffect, useMemo, useState } from 'react';
import type {
    WritingSuggestionCacheDoc,
    WritingSuggestionFocus,
    WritingSuggestionItem,
    WritingSuggestionKind,
    WritingSuggestionTaskResult,
    WritingSuggestionTaskRunState,
} from '../../types/ielts-writing.types';
import './WritingSuggestionsReviewModal.css';

type ReviewFilter = 'pending' | 'approved' | 'dismissed' | 'all';
type FocusFilter = 'all' | WritingSuggestionFocus;
type KindFilter = 'all' | WritingSuggestionKind;

interface WritingSuggestionsReviewModalProps {
    open: boolean;
    cache: WritingSuggestionCacheDoc | null;
    taskNumber: 1 | 2;
    loading: boolean;
    reloading: boolean;
    runState?: WritingSuggestionTaskRunState | null;
    canApprove: boolean;
    canGenerateMore: boolean;
    approvalBlocked: boolean;
    approvalBlockedReason?: string | null;
    onClose: () => void;
    onReload: () => void;
    onGenerateMore: () => void;
    onApproveSuggestion: (suggestion: WritingSuggestionItem) => void;
    onDismissSuggestion: (suggestion: WritingSuggestionItem) => void;
    onRestoreSuggestion: (suggestion: WritingSuggestionItem) => void;
}

function createEmptyTaskResult(taskNumber: 1 | 2): WritingSuggestionTaskResult {
    return {
        taskNumber,
        grammar: { comments: [], corrections: [] },
        vocabularyExpression: { comments: [], corrections: [] },
    };
}

function getTaskSuggestions(taskResult: WritingSuggestionTaskResult): WritingSuggestionItem[] {
    return [
        ...taskResult.grammar.comments,
        ...taskResult.grammar.corrections,
        ...taskResult.vocabularyExpression.comments,
        ...taskResult.vocabularyExpression.corrections,
    ];
}

function getProposalText(suggestion: WritingSuggestionItem) {
    return suggestion.kind === 'comment'
        ? suggestion.suggestedCommentText || ''
        : suggestion.replacementText || '';
}

export default function WritingSuggestionsReviewModal({
    open,
    cache,
    taskNumber,
    loading,
    reloading,
    runState = null,
    canApprove,
    canGenerateMore,
    approvalBlocked,
    approvalBlockedReason = null,
    onClose,
    onReload,
    onGenerateMore,
    onApproveSuggestion,
    onDismissSuggestion,
    onRestoreSuggestion,
}: WritingSuggestionsReviewModalProps) {
    const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('pending');
    const [focusFilter, setFocusFilter] = useState<FocusFilter>('all');
    const [kindFilter, setKindFilter] = useState<KindFilter>('all');

    const taskResult = cache?.perTask?.[taskNumber] || createEmptyTaskResult(taskNumber);
    const allSuggestions = useMemo(() => {
        return [...getTaskSuggestions(taskResult)].sort((left, right) => {
            if (left.sentenceIndex !== right.sentenceIndex) {
                return left.sentenceIndex - right.sentenceIndex;
            }
            if (left.from !== right.from) {
                return left.from - right.from;
            }
            return left.title.localeCompare(right.title);
        });
    }, [taskResult]);

    const counts = useMemo(() => {
        return allSuggestions.reduce((acc, suggestion) => {
            acc.all += 1;
            acc[suggestion.reviewStatus] += 1;
            return acc;
        }, {
            all: 0,
            pending: 0,
            approved: 0,
            dismissed: 0,
        });
    }, [allSuggestions]);

    const filteredSuggestions = useMemo(() => {
        return allSuggestions.filter((suggestion) => {
            if (reviewFilter !== 'all' && suggestion.reviewStatus !== reviewFilter) {
                return false;
            }
            if (focusFilter !== 'all' && suggestion.focus !== focusFilter) {
                return false;
            }
            if (kindFilter !== 'all' && suggestion.kind !== kindFilter) {
                return false;
            }
            return true;
        });
    }, [allSuggestions, focusFilter, kindFilter, reviewFilter]);

    const groupedSuggestions = useMemo(() => {
        const groups = new Map<number, WritingSuggestionItem[]>();
        for (const suggestion of filteredSuggestions) {
            const existing = groups.get(suggestion.sentenceIndex);
            if (existing) {
                existing.push(suggestion);
            } else {
                groups.set(suggestion.sentenceIndex, [suggestion]);
            }
        }
        return [...groups.entries()]
            .sort((left, right) => left[0] - right[0])
            .map(([sentenceIndex, suggestions]) => ({
                sentenceIndex,
                suggestions,
            }));
    }, [filteredSuggestions]);

    useEffect(() => {
        if (!open) {
            return;
        }

        setReviewFilter('pending');
        setFocusFilter('all');
        setKindFilter('all');
    }, [open, taskNumber]);

    if (!open) {
        return null;
    }

    const reloadLabel = reloading ? 'Regenerating...' : 'Force Regenerate';
    const isGenerating = loading || reloading || runState?.status === 'generating';

    return (
        <div className="wsm-backdrop" onClick={onClose}>
            <div
                className="wsm-modal"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={`Task ${taskNumber} suggestion review`}
            >
                <div className="wsm-header">
                    <div>
                        <h2>Task {taskNumber} Suggestion Review</h2>
                        <p>Review, approve, dismiss, or restore grammar and vocabulary suggestions.</p>
                    </div>
                    <div className="wsm-header-actions">
                        <button type="button" className="wsp-secondary-btn" onClick={onReload} disabled={reloading || isGenerating}>
                            {reloadLabel}
                        </button>
                        {canGenerateMore && (
                            <button type="button" className="wsp-secondary-btn" onClick={onGenerateMore} disabled={reloading || isGenerating}>
                                Generate More
                            </button>
                        )}
                        <button type="button" className="wsp-secondary-btn" onClick={onClose}>
                            Close
                        </button>
                    </div>
                </div>

                {isGenerating && (
                    <div className="wsm-state-card">
                        <p>Scanning Task {taskNumber} suggestions in this browser.</p>
                        <p>Safe: keep grading on this page. Avoid refreshing, closing the tab, navigating away, signing out, or starting another suggestion run until this finishes.</p>
                        {runState?.phase && (
                            <p>{runState.phase.replace(/-/g, ' ')}. {runState.acceptedCount} finding{runState.acceptedCount === 1 ? '' : 's'} accepted so far.</p>
                        )}
                    </div>
                )}

                {!isGenerating && cache?.status === 'failed' && (
                    <div className="wsm-state-card">
                        <p>{cache.error || 'Suggestions could not be generated.'}</p>
                    </div>
                )}

                {!isGenerating && cache?.status !== 'failed' && (
                    <>
                        {runState?.status === 'incomplete' && (
                            <div className="wsm-state-card wsm-state-card-warning">
                                <p>The latest run completed with partial failures. The findings below were kept, and you can generate more later.</p>
                            </div>
                        )}

                        <div className="wsm-toolbar">
                            <div className="wsm-filter-group">
                                <span>Status</span>
                                <div className="wsm-chip-row">
                                    <button type="button" className={`wsm-chip ${reviewFilter === 'pending' ? 'active' : ''}`} onClick={() => setReviewFilter('pending')}>
                                        Pending {counts.pending}
                                    </button>
                                    <button type="button" className={`wsm-chip ${reviewFilter === 'approved' ? 'active' : ''}`} onClick={() => setReviewFilter('approved')}>
                                        Approved {counts.approved}
                                    </button>
                                    <button type="button" className={`wsm-chip ${reviewFilter === 'dismissed' ? 'active' : ''}`} onClick={() => setReviewFilter('dismissed')}>
                                        Dismissed {counts.dismissed}
                                    </button>
                                    <button type="button" className={`wsm-chip ${reviewFilter === 'all' ? 'active' : ''}`} onClick={() => setReviewFilter('all')}>
                                        All {counts.all}
                                    </button>
                                </div>
                            </div>

                            <div className="wsm-filter-group">
                                <span>Focus</span>
                                <div className="wsm-chip-row">
                                    <button type="button" className={`wsm-chip ${focusFilter === 'all' ? 'active' : ''}`} onClick={() => setFocusFilter('all')}>
                                        All
                                    </button>
                                    <button type="button" className={`wsm-chip ${focusFilter === 'grammar' ? 'active' : ''}`} onClick={() => setFocusFilter('grammar')}>
                                        Grammar
                                    </button>
                                    <button type="button" className={`wsm-chip ${focusFilter === 'vocabulary-expression' ? 'active' : ''}`} onClick={() => setFocusFilter('vocabulary-expression')}>
                                        Vocabulary
                                    </button>
                                </div>
                            </div>

                            <div className="wsm-filter-group">
                                <span>Type</span>
                                <div className="wsm-chip-row">
                                    <button type="button" className={`wsm-chip ${kindFilter === 'all' ? 'active' : ''}`} onClick={() => setKindFilter('all')}>
                                        All
                                    </button>
                                    <button type="button" className={`wsm-chip ${kindFilter === 'comment' ? 'active' : ''}`} onClick={() => setKindFilter('comment')}>
                                        Comment
                                    </button>
                                    <button type="button" className={`wsm-chip ${kindFilter === 'correction' ? 'active' : ''}`} onClick={() => setKindFilter('correction')}>
                                        Correction
                                    </button>
                                </div>
                            </div>
                        </div>

                        {approvalBlockedReason && (
                            <div className="wsm-state-card wsm-state-card-warning">
                                <p>{canApprove ? approvalBlockedReason : 'Open the grading session to approve suggestions into comments or corrections.'}</p>
                            </div>
                        )}

                        {groupedSuggestions.length === 0 ? (
                            <div className="wsm-state-card">
                                <p>No suggestions match the current filters.</p>
                            </div>
                        ) : (
                            <div className="wsm-list">
                                {groupedSuggestions.map((group) => (
                                    <section key={`sentence-${group.sentenceIndex}`} className="wsm-sentence-group">
                                        <div className="wsm-sentence-group-header">
                                            <span className="wsm-sentence-label">Sentence {group.sentenceIndex + 1}</span>
                                            <span className="wsm-sentence-count">
                                                {group.suggestions.length} item{group.suggestions.length === 1 ? '' : 's'}
                                            </span>
                                        </div>

                                        {group.suggestions.map((suggestion) => (
                                            <article key={suggestion.reviewKey} className="wsm-card">
                                                <div className="wsm-card-header">
                                                    <div>
                                                        <strong>{suggestion.title}</strong>
                                                        <div className="wsm-meta-row">
                                                            <span className="wsm-meta-pill">{suggestion.focus === 'grammar' ? 'Grammar' : 'Vocabulary'}</span>
                                                            <span className="wsm-meta-pill">{suggestion.kind === 'comment' ? 'Comment' : 'Correction'}</span>
                                                            <span className={`wsm-meta-pill status-${suggestion.reviewStatus}`}>{suggestion.reviewStatus}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="wsm-anchor">"{suggestion.anchorText}"</div>
                                                <p className="wsm-reason">{suggestion.reason}</p>
                                                <div className="wsm-proposal">{getProposalText(suggestion)}</div>

                                                <div className="wsm-actions">
                                                    {suggestion.reviewStatus === 'pending' ? (
                                                        <>
                                                            <button
                                                                type="button"
                                                                className="wsp-primary-btn"
                                                                disabled={approvalBlocked}
                                                                onClick={() => onApproveSuggestion(suggestion)}
                                                            >
                                                                Approve
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="wsp-secondary-btn"
                                                                onClick={() => onDismissSuggestion(suggestion)}
                                                            >
                                                                Dismiss
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            className="wsp-secondary-btn"
                                                            onClick={() => onRestoreSuggestion(suggestion)}
                                                        >
                                                            Restore to Pending
                                                        </button>
                                                    )}
                                                </div>
                                            </article>
                                        ))}
                                    </section>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
