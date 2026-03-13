// DEPRECATED: Quiz card rendering — moved from TeacherLobbyPage.jsx on 2026-03-12. See PRD-0033.
import React from 'react';

export const renderQuizCard = (quiz, index, {
  user,
  profile,
  contentFilter,
  handleEditQuiz,
  handleDelete,
  handleStartSession,
  Card,
  CardBody,
  CardFooter,
  Button,
}) => {
  const questionCount = Array.isArray(quiz.questions) ? quiz.questions.length : 0;
  const variants = ['lavender', 'sky', 'mint', 'rose', 'peach'];
  const variant = variants[index % variants.length];

  const isOwner = user && (quiz.ownerId === user.uid || quiz.createdBy === user.uid || (!quiz.ownerId && !quiz.createdBy));
  const isAdmin = profile?.role === 'super_admin';
  const canEdit = isOwner || isAdmin;

  return (
    <Card
      key={quiz.id}
      variant={variant}
      hover
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        animation: `slideUp 0.5s ease-out ${index * 0.1}s backwards`
      }}
    >
      <CardBody style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <h3 style={{
            fontSize: '1.25rem',
            fontWeight: '700',
            marginBottom: '0.5rem',
            color: '#1e293b'
          }}>
            {quiz.title}
          </h3>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '0.25rem 0.75rem',
            background: 'rgba(255, 255, 255, 0.5)',
            borderRadius: '9999px',
            fontSize: '0.8125rem',
            fontWeight: '600',
            color: '#64748b'
          }}>
            {questionCount} question{questionCount === 1 ? '' : 's'}
          </div>
        </div>
      </CardBody>

      <CardFooter style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
        <Button
          variant="glass"
          size="sm"
          onClick={() => handleEditQuiz(quiz)}
          style={{ flex: '1 1 auto' }}
        >
          {canEdit ? 'Edit' : 'View Only'}
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={() => canEdit && handleDelete(quiz.id)}
          disabled={!canEdit}
          style={{ flex: '1 1 auto', opacity: canEdit ? 1 : 0.5, cursor: canEdit ? 'pointer' : 'not-allowed' }}
        >
          Delete
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => handleStartSession(quiz.id, 'quiz')}
          style={{ flex: '1 1 100%' }}
        >
          Start Quiz
        </Button>
      </CardFooter>
    </Card>
  );
};
