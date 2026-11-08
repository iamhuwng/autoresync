import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadingV2StudioModalAdapter } from './ReadingV2StudioModalAdapter';
import { createReadingV2CanonicalFixture } from '../../../services/reading-v2/fixtures/readingV2CanonicalFixtures';
import { createReadingV2StudioDefaultMetadata } from '../../../services/reading-v2/readingV2StudioWorkflow.service';
import { readingV2Ids, type ReadingV2DraftRecord } from '../../../types/readingV2.types';
import type { ReadingV2StudioWorkflowSnapshot } from '../../../services/reading-v2/readingV2StudioWorkflow.service';

const {
  publishReadingV2StudioDraftMock,
  discoverTargetsMock,
  applySelectedMock,
  openDraftMock,
  saveDraftMock,
  duplicateDraftMock,
  useAuthMock,
} = vi.hoisted(() => ({
  publishReadingV2StudioDraftMock: vi.fn(),
  discoverTargetsMock: vi.fn(),
  applySelectedMock: vi.fn(),
  openDraftMock: vi.fn(),
  saveDraftMock: vi.fn(),
  duplicateDraftMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock('../../../contexts/AuthContext', () => ({ useAuth: useAuthMock }));

vi.mock('../../../services/reading-v2/readingV2StudioFirebaseHydration.service', async () => {
  const { createReadingV2CanonicalFixture } = await vi.importActual<typeof import('../../../services/reading-v2/fixtures/readingV2CanonicalFixtures')>(
    '../../../services/reading-v2/fixtures/readingV2CanonicalFixtures',
  );

  return {
    loadReadingV2PublishedRevisionSource: vi.fn(async (materialId: string) => {
      const document = {
        ...createReadingV2CanonicalFixture('matching-headings'),
        title: 'Modal hydrated Reading V2',
      };

      return {
        status: 'loaded',
        materialId,
        metadata: {
          materialId,
          ownerId: 'current-teacher',
          deliveryEngine: 'reading-v2',
          productLabel: 'Reading V2',
          title: document.title,
          materialKind: materialId === 'single-passage-1' ? 'reading-passage' : 'full-test',
          durationMinutes: 60,
          difficulty: 'intermediate',
          targetBand: 'Band 6-7',
          description: '',
          tags: [],
          visibility: 'private',
          publishedSnapshotVersionId: 'snapshot-modal',
          updatedAt: '2026-04-29T00:00:00.000Z',
          relationshipSurfaces: ['teacher-lobby'],
        },
        snapshot: {
          snapshotVersionId: 'snapshot-modal',
          materialId,
          ownerId: 'current-teacher',
          document,
          publishedAt: '2026-04-29T00:00:00.000Z',
          publishedBy: 'current-teacher',
        },
      };
    }),
  };
});

vi.mock('../../../services/reading-v2/readingV2StudioWorkflow.service', async () => {
  const actual = await vi.importActual<typeof import('../../../services/reading-v2/readingV2StudioWorkflow.service')>(
    '../../../services/reading-v2/readingV2StudioWorkflow.service',
  );

  return {
    ...actual,
    openReadingV2StudioDraft: openDraftMock,
    saveReadingV2StudioDraft: saveDraftMock,
    duplicateReadingV2StudioDraft: duplicateDraftMock,
    publishReadingV2StudioDraft: publishReadingV2StudioDraftMock,
  };
});

vi.mock('../../../services/reading-v2/readingV2ReferenceUpdateFirebaseRepository.service', () => ({
  createFirebaseReadingV2ReferenceUpdateRepository: () => ({
    discoverTargets: discoverTargetsMock,
    applySelected: applySelectedMock,
  }),
}));

const referenceUpdateSummary = {
  passageMaterialId: 'single-passage-1',
  previousSnapshotVersionId: 'snapshot-modal',
  nextSnapshotVersionId: 'snapshot-new',
  targets: [
    {
      id: 'master:composition-1:ref-1',
      kind: 'master',
      title: 'Owned master',
      ownerId: 'current-teacher',
      refId: 'ref-1',
      materialId: 'single-passage-1',
      currentSnapshotVersionId: 'snapshot-modal',
      nextSnapshotVersionId: 'snapshot-new',
      selectable: true,
    },
  ],
  excluded: {
    nonOwnedReferenceCount: 0,
    alreadyCurrentCount: 0,
    frozenAssignmentCount: 0,
    resultSnapshotCount: 0,
  },
};

const draftFromSnapshot = (snapshot: ReadingV2StudioWorkflowSnapshot): ReadingV2DraftRecord => ({
  draftId: readingV2Ids.draftId(snapshot.draftId),
  materialId: snapshot.materialId ? readingV2Ids.materialId(snapshot.materialId) : undefined,
  ownerId: snapshot.metadata.ownerId,
  document: snapshot.document,
  studioMetadata: { ...snapshot.metadata },
  authoringContext: snapshot.authoringContext,
  workflowOrigin: snapshot.workflowOrigin,
  revision: snapshot.revision + 1,
  lastOperationId: 'operation-modal',
  state: 'draft',
  createdAt: '2026-11-06T00:00:00.000Z',
  updatedAt: '2026-11-06T00:00:00.000Z',
});

describe('ReadingV2StudioModalAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ user: { uid: 'current-teacher' }, profile: { role: 'teacher' }, loading: false });
    openDraftMock.mockImplementation(async (input) => {
      if (input.mode === 'resume-draft' && input.draftId === 'draft-1') throw new Error('No persisted draft was found for draft-1.');
      const document = input.sourceSnapshot?.document ?? createReadingV2CanonicalFixture('matching-headings');
      return {
        status: 'ready',
        mode: input.mode,
        draftId: input.draftId,
        materialId: input.materialId ?? 'modal-material',
        document,
        metadata: createReadingV2StudioDefaultMetadata({ ...input.sourceMetadata, title: document.title, ownerId: input.actor.uid }),
        revision: 1,
        workflowOrigin: {
          mode: input.mode,
          sourceMaterialId: input.materialId,
          sourceSnapshotVersionId: input.sourceSnapshot?.snapshotVersionId,
        },
      };
    });
    saveDraftMock.mockImplementation(async (snapshot) => ({ draft: draftFromSnapshot(snapshot) }));
    duplicateDraftMock.mockImplementation(async (snapshot) => ({
      draft: {
        ...draftFromSnapshot(snapshot),
        draftId: readingV2Ids.draftId('copy-acknowledged'),
        materialId: readingV2Ids.materialId('new-copy-material'),
        revision: 1,
        workflowOrigin: { mode: 'duplicate-material', sourceMaterialId: snapshot.materialId },
      },
    }));
    publishReadingV2StudioDraftMock.mockResolvedValue({
      materialId: 'single-passage-1',
      snapshotVersionId: 'snapshot-new',
      firebaseCommitStatus: 'committed',
      firebaseCommitPath: 'reading_v2/publish_commits/single-passage-1:snapshot-new',
      firebaseOperationCount: 1,
    });
    discoverTargetsMock.mockResolvedValue(referenceUpdateSummary);
    applySelectedMock.mockResolvedValue({
      updatedMasters: [{ compositionId: 'composition-1' }],
      updatedBooks: [],
      skippedTargetIds: [],
      immutableFrozenCounts: {
        frozenAssignmentCount: 0,
        resultSnapshotCount: 0,
      },
    });
  });

  it('hydrates and hosts the same Studio shell for Teacher Lobby modal entry', async () => {
    render(<ReadingV2StudioModalAdapter mode="revise-published" materialId="material-1" />);

    expect(screen.getByRole('dialog', { name: 'Reading V2 Studio modal adapter' })).toBeInTheDocument();
    expect(screen.getByText('Loading published Reading V2 material...')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('main')).toHaveAttribute('data-host', 'modal'));
    expect(screen.getByRole('main')).toHaveAttribute('data-mode', 'revise-published');
    expect(screen.getAllByText('Modal hydrated Reading V2').length).toBeGreaterThan(0);
    expect(openDraftMock).toHaveBeenCalledWith(expect.objectContaining({ actor: { uid: 'current-teacher', role: 'teacher' } }));
    expect(screen.getByRole('link', { name: 'Open saved draft' })).toHaveAttribute('href', expect.stringMatching(/^\/teacher\/reading-v2\/drafts\/studio-/));
  });

  it('fails a missing durable draft without exposing editable fallback content', async () => {
    render(<ReadingV2StudioModalAdapter mode="resume-draft" draftId="draft-1" />);

    expect(screen.queryByText(/TestEditor/i)).not.toBeInTheDocument();
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('No persisted draft was found for draft-1.');
    expect(screen.queryByRole('button', { name: 'Save Draft' })).not.toBeInTheDocument();
  });

  it('does not open private drafts for an unauthenticated or student session', async () => {
    useAuthMock.mockReturnValue({ user: { uid: 'student-1' }, profile: { role: 'student' }, loading: false });
    render(<ReadingV2StudioModalAdapter mode="create-blank" />);

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Sign in with a teacher account');
    expect(openDraftMock).not.toHaveBeenCalled();
  });

  it('acknowledges a complete local copy after source saving fails', async () => {
    const user = userEvent.setup();
    saveDraftMock.mockRejectedValue(new Error('Source revision is stale.'));
    render(<ReadingV2StudioModalAdapter mode="revise-published" materialId="single-passage-1" />);
    await waitFor(() => expect(screen.getByRole('main')).toBeInTheDocument());
    await user.dblClick(screen.getByRole('heading', { name: 'Modal hydrated Reading V2' }));
    const title = screen.getByRole('textbox', { name: 'Test title' });
    await user.clear(title);
    await user.type(title, 'Unsaved local copy{Enter}');
    await user.click(screen.getByRole('button', { name: 'Save Draft' }));
    await user.click(await screen.findByRole('button', { name: 'Keep as a copy' }));

    await waitFor(() => expect(screen.getByRole('link', { name: 'Open saved draft' })).toHaveAttribute('href', '/teacher/reading-v2/drafts/copy-acknowledged'));
    expect(duplicateDraftMock).toHaveBeenCalledWith(expect.objectContaining({
      document: expect.any(Object),
      metadata: expect.objectContaining({ title: 'Unsaved local copy', ownerId: 'current-teacher' }),
      workflowOrigin: expect.objectContaining({ mode: 'revise-published', sourceSnapshotVersionId: 'snapshot-modal' }),
    }), { uid: 'current-teacher', role: 'teacher' });
    expect(saveDraftMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Unsaved local copy' })).toBeInTheDocument();
  });

  it('opens update references after publishing a revised single passage and applies selected targets only', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();

    render(
      <ReadingV2StudioModalAdapter
        mode="revise-published"
        materialId="single-passage-1"
        onAction={onAction}
      />,
    );

    await waitFor(() => expect(screen.getByRole('main')).toHaveAttribute('data-host', 'modal'));
    const publishButton = screen.getByRole('button', { name: 'Publish' });
    expect(publishButton).toBeEnabled();

    fireEvent.click(publishButton);

    await waitFor(() => expect(discoverTargetsMock).toHaveBeenCalledWith({
      ownerId: 'current-teacher',
      passageMaterialId: 'single-passage-1',
      previousSnapshotVersionId: 'snapshot-modal',
      nextSnapshotVersionId: 'snapshot-new',
    }));
    expect(await screen.findByRole('dialog', { name: /update references/i })).toBeInTheDocument();
    expect(screen.getByText(/assignments and results stay frozen/i)).toBeInTheDocument();

    await user.click(within(screen.getByTestId('reference-target-master:composition-1:ref-1')).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /update selected references/i }));

    await waitFor(() => expect(applySelectedMock).toHaveBeenCalledWith({
      summary: referenceUpdateSummary,
      selectedTargetIds: ['master:composition-1:ref-1'],
    }));
    expect(onAction).toHaveBeenCalledWith('reading_v2_update_references_submitted', expect.objectContaining({
      selectedTargetCount: 1,
      updatedMasterCount: 1,
      updatedBookCount: 0,
    }));
  });

  it('keeps publish successful when update-reference discovery fails after commit', async () => {
    const onAction = vi.fn();
    discoverTargetsMock.mockRejectedValueOnce(new Error('PERMISSION_DENIED: Permission denied'));

    render(
      <ReadingV2StudioModalAdapter
        mode="revise-published"
        materialId="single-passage-1"
        onAction={onAction}
      />,
    );

    await waitFor(() => expect(screen.getByRole('main')).toHaveAttribute('data-host', 'modal'));
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(publishReadingV2StudioDraftMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(discoverTargetsMock).toHaveBeenCalledWith({
      ownerId: 'current-teacher',
      passageMaterialId: 'single-passage-1',
      previousSnapshotVersionId: 'snapshot-modal',
      nextSnapshotVersionId: 'snapshot-new',
    }));
    expect(onAction).toHaveBeenCalledWith('publish', expect.objectContaining({ outcome: 'success' }));
    expect(onAction).toHaveBeenCalledWith('reading_v2_update_references_skipped', expect.objectContaining({
      materialId: 'single-passage-1',
      outcome: 'discovery-failed-after-publish',
    }));
    expect(screen.queryByText(/Publish permission denied/i)).not.toBeInTheDocument();
  });

  it('surfaces duplicate warnings from publish result without blocking the completed publish', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    publishReadingV2StudioDraftMock.mockResolvedValueOnce({
      materialId: 'single-passage-1',
      snapshotVersionId: 'snapshot-new',
      firebaseCommitStatus: 'committed',
      firebaseCommitPath: 'reading_v2/publish_commits/single-passage-1:snapshot-new',
      firebaseOperationCount: 1,
      duplicateWarnings: [
        {
          passageMaterialId: 'single-passage-1',
          result: {
            shouldWarn: true,
            blockPublish: false,
            matches: [
              {
                materialId: 'existing-passage',
                title: 'Existing similar passage',
                source: {},
                ownerId: 'current-teacher',
                visibility: 'private',
                state: 'published',
                currentVersionId: 'snapshot-existing',
                bodySimilarityPercent: 91,
                questionSimilarityPercent: 89,
                combinedSimilarityPercent: 90,
                shouldWarn: true,
                actions: ['use-existing', 'create-new-anyway'],
                answerKey: 'unsafe',
              },
            ],
          },
        },
      ],
    });

    render(
      <ReadingV2StudioModalAdapter
        mode="revise-published"
        materialId="single-passage-1"
        onAction={onAction}
      />,
    );

    await waitFor(() => expect(screen.getByRole('main')).toHaveAttribute('data-host', 'modal'));
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByRole('status', { name: /duplicate reading passage warning/i })).toHaveTextContent('non-blocking');
    expect(screen.getByText('Existing similar passage')).toBeInTheDocument();
    expect(screen.queryByText('answerKey')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /create new anyway/i }));

    expect(onAction).toHaveBeenCalledWith('reading_passage_duplicate_warning_shown', expect.objectContaining({
      materialId: 'existing-passage',
      similarity: 90,
    }));
    expect(onAction).toHaveBeenCalledWith('reading_passage_duplicate_create_new_anyway', expect.objectContaining({
      materialId: 'existing-passage',
    }));
  });
});
