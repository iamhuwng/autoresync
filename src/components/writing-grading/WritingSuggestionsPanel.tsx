import React from 'react';
import type {
    WritingSuggestionCacheDoc,
    WritingSuggestionItem,
    WritingSuggestionTaskResult,
    WritingSuggestionTaskRunState,
} from '../../types/ielts-writing.types';
import './WritingSuggestionsPanel.css';

interface WritingSuggestionsPanelProps {
    cache: WritingSuggestionCacheDoc | null;
    taskNumber: 1 | 2;
    loading: boolean;
    reloading: boolean;
    runState?: WritingSuggestionTaskRunState | null;
    canApprove: boolean;
    canGenerateMore: boolean;
    approvalBlockedReason?: string | null;
    onReload: () => void;
    onGenerateMore: () => void;
    onOpenReview: () => void;
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

function SuggestionHeader({
    message,
    secondaryMessage,
    onReload,
    onGenerateMore,
    onOpenReview,
    reloadLabel,
    reloadDisabled,
    generateMoreDisabled,
    showGenerateMore,
    openDisabled,
}: {
    message: string;
    secondaryMessage?: string | null;
    onReload: () => void;
    onGenerateMore: () => void;
    onOpenReview: () => void;
    reloadLabel: string;
    reloadDisabled: boolean;
    generateMoreDisabled: boolean;
    showGenerateMore: boolean;
    openDisabled: boolean;
}) {
    return (
        <div className="wgp-panel-card">
            <div className="wsp-toolbar">
                <div>
                    <div className="wgp-card-title">Suggestions</div>
                    <p className="wsp-status-copy">{message}</p>
                    {secondaryMessage && <p className="wsp-status-copy">{secondaryMessage}</p>}
                </div>
                <div className="wsp-toolbar-actions">
                    <button
                        type="button"
                        className="wsp-secondary-btn"
                        onClick={onReload}
                        disabled={reloadDisabled}
                    >
                        {reloadLabel}
                    </button>
                    {showGenerateMore && (
                        <button
                            type="button"
                            className="wsp-secondary-btn"
                            onClick={onGenerateMore}
                            disabled={generateMoreDisabled}
                        >
                            Generate More
                        </button>
                    )}
                    <button
                        type="button"
                        className="wsp-primary-btn"
                        onClick={onOpenReview}
                        disabled={openDisabled}
                    >
                        Open Review
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function WritingSuggestionsPanel({
    cache,
    taskNumber,
    loading,
    reloading,
    runState = null,
    canApprove,
    canGenerateMore,
    approvalBlockedReason = null,
    onReload,
    onGenerateMore,
    onOpenReview,
}: WritingSuggestionsPanelProps) {
    const taskResult = cache?.perTask?.[taskNumber] || createEmptyTaskResult(taskNumber);
    const suggestions = getTaskSuggestions(taskResult);
    const counts = suggestions.reduce((acc, suggestion) => {
        acc.total += 1;
        acc[suggestion.reviewStatus] += 1;
        return acc;
    }, {
        total: 0,
        pending: 0,
        approved: 0,
        dismissed: 0,
    });
    const reloadButtonLabel = reloading ? 'Regenerating...' : 'Force Regenerate';
    const isGenerating = loading || reloading || runState?.status === 'generating';
    const progressMessage = isGenerating && runState?.phase
        ? `${runState.phase.replace(/-/g, ' ')}. ${runState.acceptedCount} finding${runState.acceptedCount === 1 ? '' : 's'} accepted so far.`
        : null;

    if (isGenerating) {
        return (
            <SuggestionHeader
                message={`Scanning Task ${taskNumber} suggestions in this browser.`}
                secondaryMessage={progressMessage
                    ? `Safe: keep reading or grading on this page. Avoid refreshing, closing the tab, navigating away, signing out, or starting another suggestion run until this finishes. ${progressMessage}`
                    : 'Safe: keep reading or grading on this page. Avoid refreshing, closing the tab, navigating away, signing out, or starting another suggestion run until this finishes.'}
                onReload={onReload}
                onGenerateMore={onGenerateMore}
                onOpenReview={onOpenReview}
                reloadLabel={reloadButtonLabel}
                reloadDisabled
                generateMoreDisabled
                showGenerateMore={false}
                openDisabled
            />
        );
    }

    if (cache?.status === 'failed') {
        return (
            <SuggestionHeader
                message={cache.error || 'Suggestions could not be generated.'}
                onReload={onReload}
                onGenerateMore={onGenerateMore}
                onOpenReview={onOpenReview}
                reloadLabel={reloadButtonLabel}
                reloadDisabled={reloading}
                generateMoreDisabled
                showGenerateMore={false}
                openDisabled
            />
        );
    }

    return (
        <div className="wgp-panel-stack">
            <SuggestionHeader
                message={counts.total > 0
                    ? `${counts.total} suggestion${counts.total === 1 ? '' : 's'} ready for Task ${taskNumber}.`
                    : `No worthwhile suggestions found for Task ${taskNumber}.`}
                secondaryMessage={runState?.status === 'incomplete'
                    ? 'The latest run completed with partial failures. You can keep these findings and generate more later.'
                    : null}
                onReload={onReload}
                onGenerateMore={onGenerateMore}
                onOpenReview={onOpenReview}
                reloadLabel={reloadButtonLabel}
                reloadDisabled={reloading}
                generateMoreDisabled={reloading || isGenerating}
                showGenerateMore={canGenerateMore}
                openDisabled={counts.total === 0}
            />

            <div className="wgp-panel-card">
                <div className="wsp-summary-grid">
                    <div className="wsp-summary-tile">
                        <span>Pending</span>
                        <strong>{counts.pending}</strong>
                    </div>
                    <div className="wsp-summary-tile">
                        <span>Approved</span>
                        <strong>{counts.approved}</strong>
                    </div>
                    <div className="wsp-summary-tile">
                        <span>Dismissed</span>
                        <strong>{counts.dismissed}</strong>
                    </div>
                </div>
            </div>

            {!canApprove && (
                <div className="wgp-panel-card">
                    <p className="wsp-note">Open the grading session to approve suggestions into comments or corrections.</p>
                </div>
            )}

            {canApprove && approvalBlockedReason && (
                <div className="wgp-panel-card">
                    <p className="wsp-note">{approvalBlockedReason}</p>
                </div>
            )}
        </div>
    );
}
