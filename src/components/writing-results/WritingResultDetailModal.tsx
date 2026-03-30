import type { WritingSubmission } from '../../types/ielts-writing.types';
import WritingTeacherResultSurface from './WritingTeacherResultSurface';
import { buildWritingResultSurfaceData, type WritingResultViewerMode } from './writingResultSurface';

interface WritingResultDetailModalProps {
  submission: WritingSubmission;
  onClose: () => void;
  onEditGrades?: () => void;
  viewerMode?: Exclude<WritingResultViewerMode, 'student'>;
}

export default function WritingResultDetailModal({
  submission,
  onClose,
  onEditGrades,
  viewerMode = onEditGrades ? 'teacher-actionable' : 'teacher-read-only',
}: WritingResultDetailModalProps) {
  const data = buildWritingResultSurfaceData(submission, {
    viewerMode,
    canRevealPublishedData: true,
  });

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={onClose}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(8px)' }} />
      <div
        style={{
          position: 'relative',
          width: 'min(1280px, 96vw)',
          maxHeight: '92vh',
          overflowY: 'auto',
          background: '#f8fafc',
          borderRadius: '24px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
          padding: '1.25rem',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <WritingTeacherResultSurface
          data={data}
          submission={submission}
          onClose={onClose}
          onOpenGrading={data.phase === 'pending-review' ? onEditGrades : undefined}
          onReopen={data.phase === 'published' ? onEditGrades : undefined}
        />
      </div>
    </div>
  );
}
