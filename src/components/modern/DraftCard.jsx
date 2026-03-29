import React from 'react';
import { Card, CardBody, CardFooter, Button } from './index';
import { EditIcon, DeleteIcon, ClockIcon } from './icons.jsx';
import './DraftCard.css';
import './TestCard.css'; // Shared badge classes

// Internal utility — NOT exported
function timeAgo(updatedAt) {
  const date = updatedAt instanceof Date ? updatedAt : new Date(updatedAt || 0);
  const timeDiff = Date.now() - date.getTime();
  const minutes = Math.floor(timeDiff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

const DraftCard = ({ draft, index, onResume, onDelete }) => {
  const meta = draft.metadata || {};
  const isWritingDraft = draft?.draftKind === 'writing' || (draft?.testType === 'IELTS' && String(draft?.skill || '').toLowerCase() === 'writing');
  const taskCount = Array.isArray(draft?.tasks)
    ? draft.tasks.length
    : (meta.format === 'full-test' ? 2 : (meta.format ? 1 : 0));
  const variants = ['lavender', 'sky', 'mint', 'rose', 'peach'];
  const variant = variants[index % variants.length];

  const statusClass = draft.status === 'published' ? 'draft-card__status--published' : 'draft-card__status--editing';

  return (
    <Card
      key={draft.id}
      variant={variant}
      hover
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        animation: `slideUp 0.5s ease-out ${index * 0.08}s backwards`,
        borderLeft: '4px solid rgba(139, 92, 246, 0.5)',
      }}
    >
      <CardBody style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <h3
              title={meta.title || 'Untitled Draft'}
              style={{
                fontSize: '1.25rem', fontWeight: '700', color: '#1e293b',
                margin: 0, flex: 1,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                overflow: 'hidden', textOverflow: 'ellipsis',
                lineHeight: '1.4',
              }}
            >
              {meta.title || 'Untitled Draft'}
            </h3>
            <span className={`draft-card__status ${statusClass}`}>
              {draft.status || 'editing'}
            </span>
          </div>

          {/* Badges row */}
          <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
            {isWritingDraft ? (
              <>
                <div className="test-card-badge test-card-badge--gray">
                  {taskCount} task{taskCount === 1 ? '' : 's'}
                </div>
                <div className="test-card-badge test-card-badge--purple">
                  IELTS Writing
                </div>
                <div className="test-card-badge test-card-badge--green">
                  {meta.duration || 60} min
                </div>
              </>
            ) : (
              <>
                <div className="test-card-badge test-card-badge--gray">
                  {draft.questionCount || 0} Q
                </div>
                <div className="test-card-badge test-card-badge--purple">
                  Grade {meta.gradeLevel || '?'}
                </div>
              </>
            )}
            {!isWritingDraft && meta.examType && (
              <div className="test-card-badge test-card-badge--green">
                {meta.examType}
              </div>
            )}
          </div>
        </div>

        {/* Last edited timestamp */}
        <div style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <ClockIcon size={12} />
          Last edited {timeAgo(draft.updatedAt)}
        </div>
      </CardBody>

      <CardFooter style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
        <Button
          variant="primary"
          size="sm"
          onClick={() => onResume(draft)}
          style={{ flex: '1 1 60%' }}
        >
          <EditIcon size={14} style={{ marginRight: '0.25rem' }} />
          Resume Editing
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={() => onDelete(draft)}
          style={{ flex: '1 1 30%' }}
        >
          <DeleteIcon size={14} style={{ marginRight: '0.25rem' }} />
          Delete
        </Button>
      </CardFooter>
    </Card>
  );
};

export default React.memo(DraftCard);
