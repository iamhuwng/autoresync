import React from 'react';
import type { WritingSuggestionCacheDoc, WritingSuggestionItem, WritingSuggestionTaskResult } from '../../types/ielts-writing.types';
import './WritingSuggestionsPanel.css';

interface WritingSuggestionsPanelProps {
    cache: WritingSuggestionCacheDoc | null;
    taskNumber: 1 | 2;
    loading: boolean;
    reloading: boolean;
    canInject: boolean;
    onReload: () => void;
    onFocusSuggestion: (suggestion: WritingSuggestionItem) => void;
    onInjectComment: (suggestion: WritingSuggestionItem) => void;
    onInjectCorrection: (suggestion: WritingSuggestionItem) => void;
}

function createEmptyTaskResult(taskNumber: 1 | 2): WritingSuggestionTaskResult {
    return {
        taskNumber,
        grammar: { comments: [], corrections: [] },
        vocabularyExpression: { comments: [], corrections: [] },
    };
}

function SuggestionSection({
    title,
    suggestions,
    kindLabel,
    canInject,
    onFocusSuggestion,
    onInject,
}: {
    title: string;
    suggestions: WritingSuggestionItem[];
    kindLabel: 'comment' | 'correction';
    canInject: boolean;
    onFocusSuggestion: (suggestion: WritingSuggestionItem) => void;
    onInject: (suggestion: WritingSuggestionItem) => void;
}) {
    return (
        <section className="wsp-section">
            <div className="wsp-section-header">
                <h4>{title}</h4>
                <span>{suggestions.length}</span>
            </div>
            {suggestions.length === 0 ? (
                <p className="wsp-empty-copy">No {kindLabel} suggestions for this group.</p>
            ) : (
                <div className="wsp-list">
                    {suggestions.map((suggestion) => (
                        <article key={suggestion.id} className="wsp-card">
                            <div className="wsp-card-header">
                                <strong>{suggestion.title}</strong>
                                <span>Sentence {suggestion.sentenceIndex + 1}</span>
                            </div>
                            <div className="wsp-anchor">"{suggestion.anchorText}"</div>
                            <p className="wsp-reason">{suggestion.reason}</p>
                            <div className="wsp-proposal">
                                {kindLabel === 'comment'
                                    ? suggestion.suggestedCommentText
                                    : suggestion.replacementText}
                            </div>
                            <div className="wsp-actions">
                                <button type="button" className="wsp-secondary-btn" onClick={() => onFocusSuggestion(suggestion)}>
                                    Focus in Essay
                                </button>
                                <button
                                    type="button"
                                    className="wsp-primary-btn"
                                    disabled={!canInject}
                                    onClick={() => onInject(suggestion)}
                                >
                                    {kindLabel === 'comment' ? 'Inject to Comment' : 'Inject to Correction'}
                                </button>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </section>
    );
}

function SuggestionGroup({
    title,
    comments,
    corrections,
    canInject,
    onFocusSuggestion,
    onInjectComment,
    onInjectCorrection,
}: {
    title: string;
    comments: WritingSuggestionItem[];
    corrections: WritingSuggestionItem[];
    canInject: boolean;
    onFocusSuggestion: (suggestion: WritingSuggestionItem) => void;
    onInjectComment: (suggestion: WritingSuggestionItem) => void;
    onInjectCorrection: (suggestion: WritingSuggestionItem) => void;
}) {
    return (
        <div className="wsp-group">
            <div className="wsp-group-title">{title}</div>
            <SuggestionSection
                title="Comment Ideas"
                suggestions={comments}
                kindLabel="comment"
                canInject={canInject}
                onFocusSuggestion={onFocusSuggestion}
                onInject={onInjectComment}
            />
            <SuggestionSection
                title="Corrections"
                suggestions={corrections}
                kindLabel="correction"
                canInject={canInject}
                onFocusSuggestion={onFocusSuggestion}
                onInject={onInjectCorrection}
            />
        </div>
    );
}

const WritingSuggestionsPanel: React.FC<WritingSuggestionsPanelProps> = ({
    cache,
    taskNumber,
    loading,
    reloading,
    canInject,
    onReload,
    onFocusSuggestion,
    onInjectComment,
    onInjectCorrection,
}) => {
    const taskResult = cache?.perTask?.[taskNumber] || createEmptyTaskResult(taskNumber);
    const totalSuggestions = taskResult.grammar.comments.length
        + taskResult.grammar.corrections.length
        + taskResult.vocabularyExpression.comments.length
        + taskResult.vocabularyExpression.corrections.length;

    if (loading || cache?.status === 'generating') {
        return (
            <div className="wgp-panel-card">
                <div className="wgp-card-title">Suggestions</div>
                <p className="wsp-status-copy">Generating grammar and vocabulary suggestions for this submission.</p>
            </div>
        );
    }

    if (cache?.status === 'failed') {
        return (
            <div className="wgp-panel-card">
                <div className="wgp-card-title">Suggestions</div>
                <p className="wsp-status-copy">{cache.error || 'Suggestions could not be generated.'}</p>
                <button type="button" className="wsp-primary-btn" onClick={onReload} disabled={reloading}>
                    {reloading ? 'Reloading...' : 'Reload Suggestions'}
                </button>
            </div>
        );
    }

    return (
        <div className="wgp-panel-stack">
            <div className="wgp-panel-card">
                <div className="wsp-toolbar">
                    <div>
                        <div className="wgp-card-title">Suggestions</div>
                        <p className="wsp-status-copy">
                            {totalSuggestions > 0
                                ? `${totalSuggestions} suggestion${totalSuggestions === 1 ? '' : 's'} ready for Task ${taskNumber}.`
                                : `No worthwhile suggestions found for Task ${taskNumber}.`}
                        </p>
                    </div>
                    <button type="button" className="wsp-secondary-btn" onClick={onReload} disabled={reloading}>
                        {reloading ? 'Reloading...' : 'Reload Suggestions'}
                    </button>
                </div>
                {!canInject && (
                    <p className="wsp-note">Open the grading session to inject suggestions into comments or corrections.</p>
                )}
            </div>

            <div className="wgp-panel-card">
                <SuggestionGroup
                    title="Grammar"
                    comments={taskResult.grammar.comments}
                    corrections={taskResult.grammar.corrections}
                    canInject={canInject}
                    onFocusSuggestion={onFocusSuggestion}
                    onInjectComment={onInjectComment}
                    onInjectCorrection={onInjectCorrection}
                />
            </div>

            <div className="wgp-panel-card">
                <SuggestionGroup
                    title="Vocabulary & Expression"
                    comments={taskResult.vocabularyExpression.comments}
                    corrections={taskResult.vocabularyExpression.corrections}
                    canInject={canInject}
                    onFocusSuggestion={onFocusSuggestion}
                    onInjectComment={onInjectComment}
                    onInjectCorrection={onInjectCorrection}
                />
            </div>
        </div>
    );
};

export default WritingSuggestionsPanel;
