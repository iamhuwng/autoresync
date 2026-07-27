import { useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useFeatureTracking } from '../hooks/useFeatureTracking';
import { FEATURE_IDS } from '../config/featureRegistry';
import BookActivityRevisionPanel from '../components/books/assembly/BookActivityRevisionPanel';
import type { EditableActivity } from '../types/bookActivity.types';
import { normalizeActivity } from '../services/book-activity/activityCanonical.service';
import { diffActivities } from '../services/book-activity/activityDiff.service';
import { projectStudentActivity } from '../services/book-activity/activityProjection.service';
import {
  createActivityRevisionPublishService,
  type ActivityRevisionRepository,
  type ActivityRevisionScope,
  type ActivityRevisionVersionRecord,
  type ActivityRevisionPublishResult,
  type ActivityRevisionCandidate,
} from '../services/book-activity/activityRevisionPublish.service';

const OWNER_ID = 'teacher-1';
const ACTIVITY_ID = 'activity-68';
const PLACEMENT_ID = 'placement-68';
const NOW = '2026-07-28T00:00:00.000Z';

const currentEditable: EditableActivity = {
  schemaVersion: 1,
  title: 'Vocabulary practice',
  taskProfile: null,
  presentationMode: 'structured',
  contextRequirement: { mode: 'none', acceptedKinds: [] },
  instructions: [{ text: 'Complete each item.' }],
  interaction: { family: 'text-entry', variant: 'fill-blank' },
  answerRule: { defaultPoints: 1, normalization: 'trim-case-and-spacing' },
  stimulus: null,
  assetRefs: [],
  interactions: [
    { prompt: 'I _____ here.', acceptedAnswers: ['have lived'] },
    { prompt: 'She _____ early.', acceptedAnswers: ['arrived'] },
  ],
  scoring: { mode: 'auto-where-possible' },
};

const sourceContext = {
  fingerprint: 'context-68',
  sourceVersionId: 'source-full-v1',
  pageGroupId: 'page-group-68',
  mappedBookPageRefs: ['book-page:full:4'],
} as const;

const initialActivity = normalizeActivity(currentEditable, {
  createId: (() => {
    const ids = ['interaction-68-1', 'interaction-68-2'];
    return () => ids.shift() ?? 'interaction-68-overflow';
  })(),
});

const initialVersion: ActivityRevisionVersionRecord = {
  schemaVersion: 1,
  activityId: ACTIVITY_ID,
  versionId: 'activity-68-v1',
  version: 1,
  ownerId: OWNER_ID,
  editable: currentEditable,
  activity: initialActivity,
  projection: projectStudentActivity(initialActivity),
  semanticImpact: diffActivities(null, initialActivity),
  sourceContextFingerprint: sourceContext.fingerprint,
  placementIds: [PLACEMENT_ID],
  evidenceRefs: ['import:activity-68'],
  sourceEvidenceRefs: ['source:full:page:4'],
  answerEvidenceRefs: ['answer:activity-68:v1'],
  createdByOperationId: '00000000-0000-4000-8000-000000000068',
  createdAt: NOW,
};

class InMemoryActivityRevisionRepository implements ActivityRevisionRepository {
  private scope: ActivityRevisionScope;

  constructor(scope: ActivityRevisionScope) {
    this.scope = structuredClone(scope);
  }

  async readScope(): Promise<ActivityRevisionScope> {
    return structuredClone(this.scope);
  }

  async transaction<T>(
    _activityId: string,
    mutate: (scope: ActivityRevisionScope) => {
      outcome: T;
      next?: ActivityRevisionScope;
      write: boolean;
    },
  ): Promise<T> {
    const snapshot = structuredClone(this.scope);
    const result = mutate(snapshot);
    if (result.write) this.scope = structuredClone(result.next ?? snapshot);
    return result.outcome;
  }
}

const createFixture = () => {
  const repository = new InMemoryActivityRevisionRepository({
    current: {
      activityId: ACTIVITY_ID,
      versionId: initialVersion.versionId,
      version: initialVersion.version,
      contextFingerprint: sourceContext.fingerprint,
    },
    currentContext: sourceContext,
    versions: { [initialVersion.versionId]: initialVersion },
    candidates: {},
    operations: {},
  });
  const identityIds = ['interaction-68-3', 'interaction-68-4'];
  const versionIds = ['activity-68-v2', 'activity-68-v3'];
  const publisher = createActivityRevisionPublishService(repository, {
    idProvider: { createId: () => identityIds.shift() ?? 'interaction-68-overflow' },
    versionIdProvider: { createId: () => versionIds.shift() ?? 'activity-68-v-overflow' },
    validationContext: { mappedBookPageRefs: sourceContext.mappedBookPageRefs },
  });
  return { publisher };
};

export default function BookAssemblyActivityRevisionSmokePage() {
  const { user, profile } = useAuth();
  const { trackAction } = useFeatureTracking(FEATURE_IDS.readingV2Studio);
  const { publisher } = useMemo(createFixture, []);
  const [current, setCurrent] = useState(initialVersion);
  const [history, setHistory] = useState([initialVersion.versionId]);
  const [lastAction, setLastAction] = useState('review-opened');
  const [candidateState, setCandidateState] = useState('not-previewed');
  const [publicationState, setPublicationState] = useState('not-published');
  const signedInLabel = profile?.displayName || profile?.email || user?.email || 'dev fixture';

  const onAction = (action: string, metadata?: Record<string, unknown>) => {
    setLastAction(action);
    trackAction(action, metadata);
  };

  const onPublished = (result: ActivityRevisionPublishResult, candidate: ActivityRevisionCandidate) => {
    if (result.status !== 'revised' && result.status !== 'replayed') return;
    setCurrent({
      ...current,
      versionId: result.activityVersionId,
      version: result.activityVersion,
      editable: candidate.editable,
      activity: candidate.normalized,
      projection: candidate.projection,
      semanticImpact: candidate.semanticImpact,
      sourceContextFingerprint: candidate.expectedContextFingerprint,
      predecessorVersionId: current.versionId,
      placementIds: candidate.placementIds,
      evidenceRefs: candidate.evidenceRefs,
      sourceEvidenceRefs: candidate.sourceEvidenceRefs,
      answerEvidenceRefs: candidate.answerEvidenceRefs,
      createdByOperationId: `ticket68-${result.activityVersionId}`,
      createdAt: new Date().toISOString(),
    });
    setHistory((previous) => previous.includes(result.activityVersionId) ? previous : [...previous, result.activityVersionId]);
    setPublicationState(result.status);
  };

  return (
    <main style={{ display: 'grid', gap: 16, maxWidth: 960, margin: '0 auto', overflowX: 'clip', padding: 'clamp(12px, 4vw, 24px)' }}>
      <header>
        <p style={{ margin: 0, color: '#5d687b', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Ticket 68 / PRD0062 19</p>
        <h1 style={{ margin: '4px 0 0' }}>Revise one Activity safely</h1>
        <p style={{ margin: '8px 0 0' }}>Teacher fixture. Signed in: {signedInLabel}</p>
        <p data-testid="ticket68-last-action">Last action: {lastAction}</p>
      </header>

      <section aria-label="Ticket 68 current Activity state" style={{ display: 'grid', gap: 8, border: '1px solid #d4dce3', borderRadius: 6, padding: 12 }}>
        <h2 style={{ margin: 0 }}>Current Activity state</h2>
        <p data-testid="ticket68-current-version-summary">Current Activity Version: {current.versionId} (v{current.version})</p>
        <p data-testid="ticket68-lineage">Activity {current.activityId}; compatible Placement {current.placementIds?.join(', ') || 'none'}; predecessor {current.predecessorVersionId ?? 'initial'}</p>
        <p data-testid="ticket68-version-history">Immutable versions retained: {history.join(', ')}</p>
        <p data-testid="ticket68-context-handoff">Affected-context handoff: {current.sourceContextFingerprint ?? 'none'}; mapping does not override presentation mode.</p>
        <p data-testid="ticket68-candidate-state">Candidate persistence: {candidateState}</p>
        <p data-testid="ticket68-publication-state">Publication state: {publicationState}</p>
      </section>

      <BookActivityRevisionPanel
        key={current.versionId}
        current={current}
        currentEditable={current.editable}
        publisher={publisher}
        onPreview={(result) => setCandidateState(result.status === 'ready' ? 'saved-and-reloadable' : result.failureCode)}
        onPublished={onPublished}
        onConflictReload={(candidate) => {
          setCandidateState(candidate ? 'reloaded-current' : 'candidate-missing');
          onAction('teacher_materials_book_assembly_activity_revision_conflict_reloaded', { activityId: current.activityId });
        }}
        onAction={onAction}
      />
    </main>
  );
}
