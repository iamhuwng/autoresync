import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { EditableActivity } from '../../../types/bookActivity.types';
import { normalizeActivity } from '../../../services/book-activity/activityCanonical.service';
import { diffActivities } from '../../../services/book-activity/activityDiff.service';
import { projectStudentActivity } from '../../../services/book-activity/activityProjection.service';
import type {
  ActivityRevisionCandidate,
  ActivityRevisionPreviewResult,
  ActivityRevisionPublishResult,
  ActivityRevisionPublishService,
  ActivityRevisionVersionRecord,
} from '../../../services/book-activity/activityRevisionPublish.service';
import BookActivityRevisionPanel from './BookActivityRevisionPanel';

vi.mock('../../../core/platform', () => ({
  useClipboard: () => ({ writeText: vi.fn(async () => true) }),
}));

vi.mock('../../modern', () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const editable: EditableActivity = {
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
  interactions: [{ prompt: 'I _____ here.', acceptedAnswers: ['have lived'] }],
  scoring: { mode: 'auto-where-possible' },
};

const normalized = normalizeActivity(editable, { createId: () => 'interaction-1' });
const current: ActivityRevisionVersionRecord = {
  schemaVersion: 1,
  activityId: 'activity-1',
  versionId: 'activity-1-v1',
  version: 1,
  ownerId: 'teacher-1',
  editable,
  activity: normalized,
  projection: projectStudentActivity(normalized),
  semanticImpact: diffActivities(null, normalized),
  sourceContextFingerprint: 'context-1',
  placementIds: ['placement-1'],
  evidenceRefs: ['import:activity-1'],
  sourceEvidenceRefs: ['source:full:page:4'],
  answerEvidenceRefs: ['answer:activity-1:v1'],
  createdByOperationId: 'operation-1',
  createdAt: '2026-07-28T00:00:00.000Z',
};

const candidate: ActivityRevisionCandidate = {
  activityId: current.activityId,
  ownerId: current.ownerId,
  candidateId: 'candidate-1',
  candidateRevision: 1,
  expectedCurrentVersionId: current.versionId,
  expectedCurrentVersion: current.version,
  expectedContextFingerprint: current.sourceContextFingerprint,
  sourceContext: { fingerprint: 'context-1' },
  editable,
  normalized,
  projection: current.projection,
  semanticImpact: { classification: 'display-only', reasons: ['title'], requiresRedo: false },
  fingerprint: 'candidate-fingerprint',
  placementIds: current.placementIds ?? [],
  evidenceRefs: current.evidenceRefs,
  sourceEvidenceRefs: current.sourceEvidenceRefs,
  answerEvidenceRefs: current.answerEvidenceRefs,
};

const ready: ActivityRevisionPreviewResult = { status: 'ready', candidate };
const published: ActivityRevisionPublishResult = {
  status: 'revised',
  activityId: 'activity-1',
  activityVersionId: 'activity-1-v2',
  activityVersion: 2,
  predecessorActivityVersionId: 'activity-1-v1',
  candidateId: 'candidate-1',
  candidateRevision: 1,
  placementIds: ['placement-1'],
  diff: candidate.semanticImpact,
  projection: candidate.projection,
  impact: { classification: 'display-only', affectedInteractionIds: ['interaction-1'] },
};

const service = (preview: ActivityRevisionPreviewResult = ready): ActivityRevisionPublishService => ({
  preview: vi.fn(async () => preview),
  loadCandidate: vi.fn(async () => candidate),
  publish: vi.fn(async () => published),
  rollback: vi.fn(async () => ({ status: 'rolled-back', failureCode: 'rollback:activity-1-v1' })),
});

const renderPanel = (publisher = service(), overrides: Partial<React.ComponentProps<typeof BookActivityRevisionPanel>> = {}) => render(
  <BookActivityRevisionPanel
    current={current}
    currentEditable={editable}
    publisher={publisher}
    onPublished={vi.fn()}
    onConflictReload={vi.fn()}
    {...overrides}
  />,
);

describe('BookActivityRevisionPanel', () => {
  it('shows complete editable prompt, evidence references, and manual-copy fallback', async () => {
    const user = userEvent.setup();
    renderPanel();
    expect(screen.getByTestId('ticket68-prompt')).toHaveTextContent('Current editable Activity JSON');
    expect(screen.getByTestId('ticket68-prompt')).toHaveTextContent('"schemaVersion": 1');
    expect(screen.getByTestId('ticket68-prompt')).toHaveTextContent('source:full:page:4');
    expect(screen.getByTestId('ticket68-prompt')).toHaveTextContent('answer:activity-1:v1');
    expect(screen.getByTestId('ticket68-prompt')).toHaveTextContent('Manual-copy fallback');
    await user.click(screen.getByRole('button', { name: 'Copy prompt' }));
    expect(screen.getByRole('button', { name: 'Prompt copied' })).toBeInTheDocument();
  });

  it('requires exact preview before publish and passes complete imported replacement', async () => {
    const user = userEvent.setup();
    const publisher = service();
    const onPublished = vi.fn();
    const onPreview = vi.fn();
    renderPanel(publisher, { onPublished, onPreview });
    const replacement = { ...editable, title: 'Imported complete replacement' };
    const editor = screen.getByTestId('ticket68-replacement-json');
    fireEvent.change(editor, { target: { value: JSON.stringify(replacement) } });
    expect(screen.getByTestId('ticket68-publish')).toBeDisabled();
    await user.click(screen.getByTestId('ticket68-preview'));
    await waitFor(() => expect(onPreview).toHaveBeenCalledWith(ready));
    expect(publisher.preview).toHaveBeenCalledWith(expect.objectContaining({ replacement }));
    await user.click(screen.getByTestId('ticket68-publish'));
    await waitFor(() => expect(publisher.publish).toHaveBeenCalledWith(expect.objectContaining({
      candidate,
      previewApproval: expect.objectContaining({ approvalId: candidate.fingerprint }),
    })));
    expect(onPublished).toHaveBeenCalledWith(published, candidate);
  });

  it('keeps publish blocked and exposes authority failure', async () => {
    const user = userEvent.setup();
    const publisher = service({ status: 'conflict', failureCode: 'stale-current-activity-version' });
    const onConflictReload = vi.fn();
    renderPanel(publisher, { onConflictReload });
    await user.click(screen.getByTestId('ticket68-preview'));
    expect(screen.getByRole('alert')).toHaveTextContent('stale-current-activity-version');
    expect(screen.getByTestId('ticket68-publish')).toBeDisabled();
    await user.click(screen.getByTestId('ticket68-reload'));
    await waitFor(() => expect(publisher.loadCandidate).toHaveBeenCalledWith('candidate-1'));
    expect(onConflictReload).toHaveBeenCalledWith(candidate);
  });
});
