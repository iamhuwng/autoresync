import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFeatureTracking } from '../hooks/useFeatureTracking';
import { FEATURE_IDS } from '../config/featureRegistry';
import { BookHomeworkProgressPanel } from './StudentHomeworkDetailPage';
import { TeacherBookHomeworkProgressPanel } from './TeacherHomeworkDetailPage';
import {
  deriveBookHomeworkProgress,
  type BookHomeworkTerminalFact,
} from '../services/book-homework/bookHomeworkProgress.service';
import type { BookHomeworkManifest } from '../types/homework.types';

const manifest: BookHomeworkManifest = {
  schemaVersion: 1,
  assignmentKind: 'book_activity_bundle',
  manifestVersionId: 'ticket88-manifest-2',
  ownerId: 'ticket88-teacher',
  createdByCommandId: 'ticket88-smoke-command',
  createdAt: '2026-08-01T00:00:00.000Z',
  bindingRevision: 2,
  book: {
    bookId: 'ticket88-book',
    bookMode: 'pdf',
    bookRevision: 1,
    manifestVersionId: 'ticket88-manifest-2',
    publicationId: 'ticket88-publication',
    publicationRevision: 1,
    publicationStatus: 'published',
  },
  context: {
    contextId: 'ticket88-homework',
    recipientId: 'ticket88-student',
    kind: 'homework',
    entitlementBasis: 'assignment',
  },
  selectedTarget: { kind: 'book', bookId: 'ticket88-book' },
  outline: [{ nodeKey: 'ticket88-unit', parentNodeKey: null, nodeType: 'unit', order: 1 }],
  scheduleRules: [],
  bindings: [{
    bindingId: 'ticket88-binding-subjective',
    placementId: 'ticket88-placement-subjective',
    activityId: 'ticket88-activity-subjective',
    nodeKey: 'ticket88-unit',
    order: 1,
    contextMode: 'none',
    pageGroupKeys: [],
    sourceReadiness: 'not-required',
    state: 'required',
    activityVersion: 1,
    activityVersionId: 'ticket88-activity-subjective-v1',
    sourceContext: [],
  }, {
    bindingId: 'ticket88-binding-scored',
    placementId: 'ticket88-placement-scored',
    activityId: 'ticket88-activity-scored',
    nodeKey: 'ticket88-unit',
    order: 2,
    contextMode: 'none',
    pageGroupKeys: [],
    sourceReadiness: 'not-required',
    state: 'required',
    activityVersion: 1,
    activityVersionId: 'ticket88-activity-scored-v1',
    sourceContext: [],
  }],
  completion: {
    aggregation: 'required-activities-submitted-over-required-activities',
    requiredBindingCount: 2,
    excludedBindingCount: 0,
    legacyScoreFields: 'untouched',
  },
};

const historicalFact: BookHomeworkTerminalFact = {
  terminalId: 'ticket88-removed-completion',
  recipientId: 'ticket88-student',
  contextId: 'ticket88-homework',
  bindingId: 'ticket88-delivery',
  bindingRevision: 1,
  placementId: 'ticket88-placement-removed',
  activityId: 'ticket88-activity-removed',
  activityVersion: 1,
  activityVersionId: 'ticket88-activity-removed-v1',
  submissionScope: 'activity',
  requiredInteractionIds: ['ticket88-interaction-removed'],
  submittedInteractionIds: ['ticket88-interaction-removed'],
  result: {
    status: 'submitted',
    score: { status: 'scored', earnedScore: 2, maximumScore: 2, displayScore: '2 / 2' },
  },
};

const subjectiveFact: BookHomeworkTerminalFact = {
  terminalId: 'ticket88-subjective-completion',
  recipientId: 'ticket88-student',
  contextId: 'ticket88-homework',
  bindingId: 'ticket88-delivery',
  bindingRevision: 2,
  placementId: 'ticket88-placement-subjective',
  activityId: 'ticket88-activity-subjective',
  activityVersion: 1,
  activityVersionId: 'ticket88-activity-subjective-v1',
  submissionScope: 'activity',
  requiredInteractionIds: ['ticket88-interaction-subjective'],
  submittedInteractionIds: ['ticket88-interaction-subjective'],
  result: {
    status: 'pending_review',
    score: { status: 'review_required' },
  },
};

const scoredFact: BookHomeworkTerminalFact = {
  terminalId: 'ticket88-scored-completion',
  recipientId: 'ticket88-student',
  contextId: 'ticket88-homework',
  bindingId: 'ticket88-delivery',
  bindingRevision: 2,
  placementId: 'ticket88-placement-scored',
  activityId: 'ticket88-activity-scored',
  activityVersion: 1,
  activityVersionId: 'ticket88-activity-scored-v1',
  submissionScope: 'activity',
  requiredInteractionIds: ['ticket88-interaction-scored'],
  submittedInteractionIds: ['ticket88-interaction-scored'],
  result: {
    status: 'submitted',
    score: { status: 'scored', earnedScore: 1, maximumScore: 1, displayScore: '1 / 1' },
  },
};

const project = (facts: readonly BookHomeworkTerminalFact[]) => deriveBookHomeworkProgress({
  manifest,
  deliveryBindingId: 'ticket88-delivery',
  terminalFacts: [historicalFact, ...facts],
});

const teacherProjection = project([subjectiveFact, scoredFact]);

const SubmitActivityControls = ({
  submitted,
  onSubmit,
}: {
  submitted: number;
  onSubmit: (fact: BookHomeworkTerminalFact) => void;
}) => (
  <section aria-label="Ticket 88 Activity submissions" style={{ padding: '1rem 1.5rem' }}>
    <button
      type="button"
      disabled={submitted >= 1}
      onClick={() => onSubmit(subjectiveFact)}
    >
      Submit subjective Activity
    </button>
    <button
      type="button"
      disabled={submitted >= 2}
      onClick={() => onSubmit(scoredFact)}
      style={{ marginLeft: '0.75rem' }}
    >
      Submit scored Activity
    </button>
  </section>
);

export default function BookHomeworkCompletionSmokePage() {
  const { trackAction } = useFeatureTracking(FEATURE_IDS.homework);
  const [searchParams] = useSearchParams();
  const [facts, setFacts] = useState<readonly BookHomeworkTerminalFact[]>([]);
  const role = searchParams.get('role') === 'teacher' ? 'teacher' : 'student';
  const studentProjection = useMemo(() => project(facts), [facts]);
  if (role === 'teacher') {
    return (
      <main style={{ minHeight: '100vh', background: '#f8fafc', padding: '2rem' }}>
        <TeacherBookHomeworkProgressPanel
          rows={[{ studentId: 'ticket88-student', completion: teacherProjection }]}
          error={null}
          studentNames={new Map([['ticket88-student', 'Ticket 88 Student']])}
          onBack={() => undefined}
        />
      </main>
    );
  }
  return (
    <main className="student-view-root" style={{ minHeight: '100vh', background: '#f8f9fa' }}>
      <SubmitActivityControls
        submitted={facts.length}
        onSubmit={(fact) => {
          trackAction(
            fact === subjectiveFact
              ? 'bookHomeworkCompletionSmokeSubjectiveSubmitted'
              : 'bookHomeworkCompletionSmokeScoredSubmitted',
          );
          setFacts((current) => current.some((item) => item.terminalId === fact.terminalId)
            ? current
            : [...current, fact]);
        }}
      />
      <BookHomeworkProgressPanel
        progress={studentProjection}
        error={null}
        title="Ticket 88 Book Homework"
        isMobile={false}
        onBack={() => undefined}
      />
    </main>
  );
}
