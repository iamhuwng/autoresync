import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookActivityGradingPanel } from '../components/results/BookActivityGradingPanel';
import { BookActivityResultFeedback } from '../components/results/BookActivityResultFeedback';
import { TeacherBookHomeworkProgressPanel } from './TeacherHomeworkDetailPage';
import {
  createBookActivityEvaluationBrowserClient,
  type BookActivityEvaluationLocator,
} from '../services/book-activity/activityEvaluation.browser';
import type {
  BookActivityStudentResultProjection,
} from '../services/book-activity/bookResultVisibility.service';
import type {
  BookHomeworkProgressProjection,
} from '../services/book-homework/bookHomeworkProgress.types';

const baseLocator = {
  bookId: 'ticket90-book',
  studentId: 'ticket90-student',
  contextKind: 'homework' as const,
  contextId: 'ticket90-homework',
};

const subjectiveLocator: BookActivityEvaluationLocator = {
  ...baseLocator,
  placementId: 'placement-subjective',
  activityId: 'activity-subjective',
  activityVersionId: 'activity-subjective-v1',
  terminalId: 'attempt-subjective',
};

const objectiveLocator: BookActivityEvaluationLocator = {
  ...baseLocator,
  placementId: 'placement-objective',
  activityId: 'activity-objective',
  activityVersionId: 'activity-objective-v1',
  terminalId: 'attempt-objective',
};

const client = createBookActivityEvaluationBrowserClient({
  baseUrl: 'http://localhost:8790',
  env: { VITE_BOOK_ACTIVITY_EVALUATION_PRESENTATION: 'enabled' },
  getIdToken: async () => 'ticket90-browser-token',
});

const teacherProgress: BookHomeworkProgressProjection = {
  schemaVersion: 1,
  manifestVersionId: 'ticket90-manifest',
  recipientId: 'ticket90-student',
  contextId: 'ticket90-homework',
  deliveryBindingId: 'ticket90-delivery',
  bindingRevision: 1,
  completion: {
    submittedCount: 2,
    requiredCount: 2,
    status: 'completed',
    isComplete: true,
  },
  grading: {
    scoredCount: 1,
    pendingReviewCount: 1,
    ungradedSubmittedCount: 0,
  },
  activities: [{
    bindingId: 'binding-subjective',
    placementId: subjectiveLocator.placementId,
    activityId: subjectiveLocator.activityId,
    activityVersion: 1,
    activityVersionId: subjectiveLocator.activityVersionId,
    order: 1,
    contextMode: 'required',
    submitted: true,
    gradingState: 'review_required',
    terminalId: 'attempt-subjective',
  }, {
    bindingId: 'binding-objective',
    placementId: objectiveLocator.placementId,
    activityId: objectiveLocator.activityId,
    activityVersion: 1,
    activityVersionId: objectiveLocator.activityVersionId,
    order: 2,
    contextMode: 'required',
    submitted: true,
    gradingState: 'scored',
    terminalId: 'attempt-objective',
    score: { earnedScore: 2, maximumScore: 2, displayScore: '2.00 / 2.00' },
  }],
  excludedHistoricalRows: [],
};

const StudentCard = ({
  label,
  locator,
}: {
  label: string;
  locator: BookActivityEvaluationLocator;
}) => {
  const [projection, setProjection] = React.useState<BookActivityStudentResultProjection | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [retry, setRetry] = React.useState(0);
  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void client.readStudentResult(locator).then((next) => {
      if (active) setProjection(next);
    }).catch(() => {
      if (active) setError('Released evaluation details could not be refreshed.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [locator, retry]);
  return (
    <article aria-label={label} style={{ minWidth: 0 }}>
      <h2>{label}</h2>
      <BookActivityResultFeedback
        projection={projection}
        loading={loading}
        error={error}
        onRetry={() => setRetry((value) => value + 1)}
      />
    </article>
  );
};

export default function BookActivityEvaluationSmokePage() {
  const [searchParams] = useSearchParams();
  const role = searchParams.get('role') === 'teacher' ? 'teacher' : 'student';
  const [selected, setSelected] = React.useState<{
    locator: BookActivityEvaluationLocator;
    label: string;
  } | null>(null);

  if (role === 'teacher') {
    return (
      <main style={{ minHeight: '100vh', background: '#f8fafc', padding: 'clamp(1rem, 4vw, 2rem)' }}>
        <TeacherBookHomeworkProgressPanel
          rows={[{ studentId: 'ticket90-student', completion: teacherProgress }]}
          error={null}
          studentNames={new Map([['ticket90-student', 'Ticket 90 Student']])}
          onBack={() => undefined}
          onGradeActivity={(_studentId, activity) => setSelected({
            locator: activity.activityId === 'activity-objective'
              ? objectiveLocator
              : subjectiveLocator,
            label: activity.activityId === 'activity-objective'
              ? 'Objective Activity'
              : 'Subjective Activity',
          })}
        />
        {selected && (
          <BookActivityGradingPanel
            locator={selected.locator}
            studentName="Ticket 90 Student"
            activityLabel={selected.label}
            client={client}
          />
        )}
      </main>
    );
  }

  return (
    <main
      className="student-view-root"
      style={{
        minHeight: '100vh',
        background: '#f8f9fa',
        display: 'grid',
        gap: '1rem',
        padding: 'clamp(1rem, 4vw, 2rem)',
      }}
    >
      <h1>Ticket 90 released Activity results</h1>
      <StudentCard label="Objective Activity result" locator={objectiveLocator} />
      <StudentCard label="Subjective Activity result" locator={subjectiveLocator} />
      <StudentCard
        label="Denied student result"
        locator={{ ...objectiveLocator, studentId: 'student-denied' }}
      />
    </main>
  );
}
