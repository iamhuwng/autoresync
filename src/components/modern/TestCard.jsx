import React from 'react';
import { Card, CardBody, CardFooter, Button } from './index';
import { EditIcon, DeleteIcon, PlayIcon, ViewIcon } from './icons.jsx';
import './TestCard.css';

const TestCard = ({ test, index, canEdit, isOwner, onEdit, onDelete, onStartTest, onTogglePublic }) => {
  const isWritingTest = test?.testType === 'IELTS' && String(test?.skill || '').toLowerCase() === 'writing';
  const itemCount = isWritingTest
    ? (Array.isArray(test?.tasks) ? test.tasks.length : (test?.metadata?.format === 'full-test' ? 2 : 1))
    : (test.questionCount || test.questions?.length || 0);
  const itemLabel = isWritingTest ? 'task' : 'question';
  const title = isWritingTest
    ? (test?.metadata?.title || test?.title || 'Untitled Writing Test')
    : (test?.title || test?.metadata?.title || 'Untitled Test');
  const duration = isWritingTest
    ? (test?.metadata?.duration || test?.duration || 60)
    : (test?.duration || test?.metadata?.duration || 0);
  const testTypeLabel = test?.testType || test?.type || 'Test';
  const skillLabel = test?.skill || 'Unknown';
  const variants = ['lavender', 'sky', 'mint', 'rose', 'peach'];
  const variant = variants[index % variants.length];

  // Check if test is incomplete (missing answer keys)
  const isIncomplete = test.isComplete === false;
  const missingCount = test.missingAnswerCount || 0;

  return (
    <Card
      key={test.id}
      variant={isIncomplete ? 'glass' : variant}
      hover={!isIncomplete}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        animation: `slideUp 0.5s ease-out ${index * 0.1}s backwards`,
        ...(isIncomplete && {
          opacity: 0.7,
          filter: 'grayscale(40%)',
          border: '2px dashed rgba(251, 191, 36, 0.5)',
        })
      }}
    >
      <CardBody style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <h3
              title={title}
              style={{
                fontSize: '1.25rem',
                fontWeight: '700',
                color: isIncomplete ? '#94a3b8' : '#1e293b',
                margin: 0,
                flex: 1,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                lineHeight: 1.35,
              }}
            >
              {title}
            </h3>
            {isIncomplete && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0.125rem 0.5rem',
                background: 'rgba(251, 191, 36, 0.15)',
                borderRadius: '9999px',
                fontSize: '0.6875rem',
                fontWeight: '700',
                color: '#b45309',
                border: '1px solid rgba(251, 191, 36, 0.3)',
              }}>
                ⚠️ Incomplete
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div className="test-card-badge test-card-badge--gray">
              {itemCount} {itemLabel}{itemCount === 1 ? '' : 's'}
            </div>
            <div className="test-card-badge" style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>
              {testTypeLabel} - {skillLabel}
            </div>
            <div className="test-card-badge test-card-badge--green">
              {duration} min
            </div>
            {isIncomplete && missingCount > 0 && (
              <div className="test-card-badge test-card-badge--warning">
                {missingCount} missing answer{missingCount === 1 ? '' : 's'}
              </div>
            )}
          </div>
        </div>
      </CardBody>

      <CardFooter style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
        <Button
          variant="glass"
          size="sm"
          onClick={() => onEdit(test)}
          style={{ flex: '1 1 auto' }}
        >
          {canEdit ? (
            <EditIcon size={14} style={{ marginRight: '0.25rem' }} />
          ) : (
            <ViewIcon size={14} style={{ marginRight: '0.25rem' }} />
          )}
          {canEdit ? (isIncomplete ? 'Complete' : 'Edit') : 'View Only'}
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={() => canEdit && onDelete(test)}
          disabled={!canEdit}
          style={{ flex: '1 1 auto', opacity: canEdit ? 1 : 0.5, cursor: canEdit ? 'pointer' : 'not-allowed' }}
        >
          <DeleteIcon size={14} style={{ marginRight: '0.25rem' }} />
          Delete
        </Button>
        <Button
          variant={isIncomplete ? 'glass' : 'primary'}
          size="sm"
          onClick={() => !isIncomplete && onStartTest(test.id)}
          disabled={isIncomplete}
          style={{
            flex: '1 1 100%',
            ...(isIncomplete && {
              opacity: 0.5,
              cursor: 'not-allowed',
            })
          }}
          title={isIncomplete ? 'Complete the test first by adding missing answer keys' : 'Start test session'}
        >
          <PlayIcon size={14} style={{ marginRight: '0.25rem' }} />
          {isIncomplete ? 'Cannot Start (Incomplete)' : 'Start Test'}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default React.memo(TestCard);
