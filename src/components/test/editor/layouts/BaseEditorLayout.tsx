import React from 'react';
import { Text } from '@mantine/core';
import { Card } from '../../../modern';
import { EditorLayoutProps } from './EditorLayoutTypes';
import { EditTestFrame } from '../EditTestFrame';

export interface BaseEditorLayoutProps extends EditorLayoutProps {
    skillTheme: 'reading' | 'listening';
}

const THEME_COLORS = {
    reading: {
        questionBg: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(240, 249, 255, 0.95) 100%)',
        questionBorder: 'rgba(139, 92, 246, 0.2)',
        questionShadow: '0 8px 32px rgba(139, 92, 246, 0.15)',
    },
    listening: {
        questionBg: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(236, 254, 255, 0.95) 100%)',
        questionBorder: 'rgba(6, 182, 212, 0.2)',
        questionShadow: '0 8px 32px rgba(6, 182, 212, 0.15)',
    },
};

export const BaseEditorLayout: React.FC<BaseEditorLayoutProps> = (props) => {
    const {
        activeTab,
        questionList,
        resourceManager,
        questionEditor,
        singleQuestionCreator,
        bulkQuestionCreator,
        answerKeySelector,
        answerKeyEditor,
        showEditor,
        showSingleCreator,
        showBulkCreator,
        skillTheme,
        ...frameProps
    } = props;

    const theme = THEME_COLORS[skillTheme];

    const editorCardStyle: React.CSSProperties = {
        width: '650px',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        opacity: 1,
        animation: 'slideInFromRight 0.3s ease',
        overflow: 'hidden',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
        border: '1px solid rgba(255, 255, 255, 0.2)'
    };

    const questionStyle = {
        ...editorCardStyle,
        background: theme.questionBg,
        borderColor: theme.questionBorder,
        boxShadow: theme.questionShadow
    };

    const creatorStyle = {
        ...editorCardStyle,
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(240, 253, 250, 0.95) 100%)',
        borderColor: 'rgba(16, 185, 129, 0.2)',
        boxShadow: '0 8px 32px rgba(16, 185, 129, 0.15)'
    };

    const answerKeyStyle = {
        ...editorCardStyle,
        height: '80vh',
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(245, 243, 255, 0.95) 100%)',
        borderColor: 'rgba(139, 92, 246, 0.2)'
    };

    return (
        <EditTestFrame {...frameProps} activeTab={activeTab}>
            {/* Context Tab: Full Width Resource Manager */}
            {activeTab === 'context' && (
                <div style={{ width: '100%', height: '100%', padding: 0 }}>
                    {resourceManager}
                </div>
            )}

            {/* Questions Tab: Full Width Layout */}
            {activeTab === 'questions' && (
                <div style={{ display: 'flex', gap: '1.5rem', height: '100%', padding: '1rem' }}>
                    {/* Left Panel: Question List */}
                    <div style={{ width: '380px', height: '100%', flexShrink: 0 }}>
                        <Card variant="glass" style={{ height: '100%', padding: 0, overflow: 'hidden' }}>
                            {questionList}
                        </Card>
                    </div>

                    {/* Right Panel: Editor or Placeholder */}
                    <div style={{ flex: 1, height: '100%', overflow: 'hidden' }}>
                        {showEditor ? (
                            <>
                                {showSingleCreator ? (
                                    <Card variant="glass" hover={false} style={creatorStyle}>
                                        {singleQuestionCreator}
                                    </Card>
                                ) : showBulkCreator ? (
                                    <Card variant="glass" hover={false} style={creatorStyle}>
                                        {bulkQuestionCreator}
                                    </Card>
                                ) : (
                                    <Card variant="glass" hover={false} style={questionStyle}>
                                        {questionEditor}
                                    </Card>
                                )}
                            </>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', opacity: 0.5 }}>
                                <Text size="xl">Select a question to edit</Text>
                                <Text size="sm" c="dimmed">Detailed editor will appear here</Text>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Answer Key Tab: Full Width Layout */}
            {activeTab === 'answerKey' && (
                <div style={{ display: 'flex', gap: '1.5rem', height: '100%', padding: '1rem' }}>
                    {/* Left Panel: Answer Key Selector */}
                    <div style={{ width: '380px', height: '100%', flexShrink: 0 }}>
                        <Card variant="glass" style={{ height: '100%', overflow: 'hidden' }}>
                            {answerKeySelector}
                        </Card>
                    </div>

                    {/* Right Panel: Answer Key Editor */}
                    <div style={{ flex: 1, height: '100%', overflow: 'hidden' }}>
                        {showEditor ? (
                            <Card variant="glass" hover={false} style={answerKeyStyle}>
                                {answerKeyEditor}
                            </Card>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', opacity: 0.5 }}>
                                <Text size="xl">Select an option to edit answers</Text>
                                <Text size="sm" c="dimmed">Answer key editor will appear here</Text>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <style>{`
                @keyframes slideInFromRight {
                  from { opacity: 0; transform: translateX(20px); }
                  to { opacity: 1; transform: translateX(0); }
                }
            `}</style>
        </EditTestFrame>
    );
};
