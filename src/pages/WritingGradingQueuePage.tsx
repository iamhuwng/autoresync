/**
 * WritingGradingQueuePage — PRD-0030 Task 5.x (Placeholder)
 * Queue of pending writing submissions for teacher grading.
 * Full implementation in Phase 5.
 */

import { useNavigate } from 'react-router-dom';

export default function WritingGradingQueuePage() {
    const navigate = useNavigate();

    return (
        <div style={{ padding: 32, maxWidth: 800, margin: '0 auto' }}>
            <button
                onClick={() => navigate(-1)}
                style={{
                    padding: '8px 16px',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    background: 'transparent',
                    cursor: 'pointer',
                    marginBottom: 24,
                }}
            >
                ← Back
            </button>
            <h1 style={{ fontSize: 24, fontWeight: 600, color: '#0f172a' }}>
                ✍️ Writing Grading Queue
            </h1>
            <p style={{ color: '#64748b', marginTop: 8 }}>
                Pending writing submissions will appear here.
                Full implementation coming in Phase 5.
            </p>
        </div>
    );
}
