
import React from 'react';
import { Card, CardBody } from '../modern';

interface WritingSpeakingPlaceholderProps {
    type: 'writing' | 'speaking';
    submission?: {
        text?: string;
        wordCount?: number;
        audioUrl?: string;
        duration?: number;
    };
    status?: 'auto-marked' | 'pending-review' | 'manually-marked';
}

export const WritingSpeakingPlaceholder: React.FC<WritingSpeakingPlaceholderProps> = ({
    type,
    submission,
    status = 'pending-review'
}) => {
    if (!submission) return null;

    return (
        <Card variant="glass" style={{ marginTop: '2rem' }}>
            <CardBody style={{ padding: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
                        {type === 'writing' ? 'Writing Submission' : 'Speaking Submission'}
                    </h3>
                    <span
                        style={{
                            padding: '0.25rem 0.75rem',
                            borderRadius: '9999px',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            background: status === 'pending-review' ? '#fef3c7' : '#d1fae5',
                            color: status === 'pending-review' ? '#d97706' : '#059669'
                        }}
                    >
                        {status === 'pending-review' ? 'Pending Review' : 'Marked'}
                    </span>
                </div>

                {type === 'writing' && submission.text && (
                    <div style={{ background: 'white', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
                        <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'serif', lineHeight: 1.8, fontSize: '1.1rem', color: '#334155' }}>
                            {submission.text}
                        </div>
                        <div style={{ marginTop: '1rem', textAlign: 'right', fontSize: '0.875rem', color: '#64748b' }}>
                            Word Count: {submission.wordCount || 0}
                        </div>
                    </div>
                )}

                {type === 'speaking' && submission.audioUrl && (
                    <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                        <audio controls src={submission.audioUrl} style={{ width: '100%' }} />
                        <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#64748b' }}>
                            Duration: {Math.round(submission.duration || 0)}s
                        </div>
                    </div>
                )}
            </CardBody>
        </Card>
    );
};
