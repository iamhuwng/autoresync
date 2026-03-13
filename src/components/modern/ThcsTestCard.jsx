import React from 'react';
import { Card, CardBody, CardFooter, Button } from './index';
import { EditIcon, DeleteIcon, PlayIcon, UseAsIsIcon, CloneIcon } from './icons.jsx';
import './ThcsTestCard.css';
import './TestCard.css'; // Shared badge classes

const ThcsTestCard = ({ test, index, canEdit, isOwner, isPublicLibrary, onEdit, onDelete, onStartTest, onUseAsIs, onClone, onAssignHw }) => {
  const meta = test.metadata || {};
  const variants = ['lavender', 'sky', 'mint', 'rose', 'peach'];
  const variant = variants[index % variants.length];

  return (
    <Card
      key={test.id}
      variant={variant}
      hover
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        animation: `slideUp 0.5s ease-out ${index * 0.1}s backwards`,
        ...(isPublicLibrary && { borderLeft: '4px solid #7c3aed' }),
      }}
    >
      <CardBody style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <h3
              title={meta.title || 'Untitled THCS Test'}
              style={{
                fontSize: '1.25rem', fontWeight: '700', color: '#1e293b',
                margin: 0, flex: 1,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                overflow: 'hidden', textOverflow: 'ellipsis',
                lineHeight: '1.4',
              }}
            >
              {meta.title || 'Untitled THCS Test'}
            </h3>
            <span style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '0.125rem 0.5rem',
              background: 'rgba(139, 92, 246, 0.15)',
              borderRadius: '9999px',
              fontSize: '0.6875rem', fontWeight: '700', color: '#7c3aed',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              THCS-THPT
            </span>
          </div>
          {isPublicLibrary && (
            <div className="thcs-test-card__author">
              by {test.ownerName || 'Teacher'}
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div className="test-card-badge test-card-badge--gray">
              {test.questionCount || 0} question{(test.questionCount || 0) === 1 ? '' : 's'}
            </div>
            <div className="test-card-badge test-card-badge--purple">
              Grade {meta.gradeLevel}{meta.examType ? ` · ${meta.examType}` : ''}
            </div>
            <div className="test-card-badge test-card-badge--green">
              {meta.duration || 45} min
            </div>
          </div>
        </div>
      </CardBody>

      <CardFooter style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
        {isPublicLibrary ? (
          <>
            <Button
              variant="glass"
              size="sm"
              onClick={() => onUseAsIs(test)}
              style={{ flex: '1 1 auto', color: '#7c3aed', borderColor: 'rgba(139, 92, 246, 0.3)' }}
            >
              <UseAsIsIcon size={14} style={{ marginRight: '0.25rem' }} />
              Use as-is
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => onClone(test)}
              style={{ flex: '1 1 auto' }}
            >
              <CloneIcon size={14} style={{ marginRight: '0.25rem' }} />
              Clone & Customize
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="glass"
              size="sm"
              onClick={() => onEdit(test)}
              style={{ flex: '1 1 auto' }}
            >
              <EditIcon size={14} style={{ marginRight: '0.25rem' }} />
              {canEdit ? 'Edit' : 'View'}
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
              variant="primary"
              size="sm"
              onClick={() => onStartTest(test.id)}
              style={{ flex: '1 1 45%' }}
            >
              <PlayIcon size={14} style={{ marginRight: '0.25rem' }} />
              Start Test
            </Button>
            <Button
              variant="glass"
              size="sm"
              onClick={() => onAssignHw(test)}
              style={{ flex: '1 1 45%', color: '#7c3aed', borderColor: 'rgba(139, 92, 246, 0.3)' }}
            >
              <CloneIcon size={14} style={{ marginRight: '0.25rem' }} />
              Assign HW
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
};

export default React.memo(ThcsTestCard);
