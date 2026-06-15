import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadingV2StudioModalAdapter } from './ReadingV2StudioModalAdapter';

const {
  publishReadingV2StudioDraftMock,
  discoverTargetsMock,
  applySelectedMock,
} = vi.hoisted(() => ({
  publishReadingV2StudioDraftMock: vi.fn(),
  discoverTargetsMock: vi.fn(),
  applySelectedMock: vi.fn(),
}));

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

describe('ReadingV2StudioModalAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });

  it('does not expose legacy TestEditor as modal content', () => {
    render(<ReadingV2StudioModalAdapter mode="resume-draft" draftId="draft-1" />);

    expect(screen.queryByText(/TestEditor/i)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Missing draft draft-1/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeInTheDocument();
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

    expect(await screen.findAllByText('Published successfully.')).not.toHaveLength(0);
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
