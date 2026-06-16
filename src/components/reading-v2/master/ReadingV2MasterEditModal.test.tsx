import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReadingV2MasterEditModal } from './ReadingV2MasterEditModal';

const passages = [
  {
    passageMaterialId: 'passage-a',
    materialId: 'passage-a',
    snapshotVersionId: 'snapshot-a',
    currentVersionId: 'snapshot-a',
    title: 'Passage A',
    titleSnapshot: 'Passage A',
    source: 'Cambridge 18',
    sourceSnapshot: 'Cambridge 18',
    testTypeIdsSnapshot: ['ielts'],
    visibility: 'private',
    ownerId: 'teacher-1',
    questionCount: 13,
    questionCountSnapshot: 13,
    order: 1,
  },
  {
    passageMaterialId: 'passage-b',
    materialId: 'passage-b',
    snapshotVersionId: 'snapshot-b',
    currentVersionId: 'snapshot-b',
    title: 'Public Passage B',
    titleSnapshot: 'Public Passage B',
    source: 'British Council',
    sourceSnapshot: 'British Council',
    testTypeIdsSnapshot: ['ielts'],
    visibility: 'public',
    ownerId: 'teacher-2',
    questionCount: 14,
    questionCountSnapshot: 14,
    order: 2,
  },
];

const master = {
  compositionId: 'composition-1',
  testMaterialId: 'master-1',
  title: 'Published Master',
  source: 'Selected passages',
  ownerId: 'teacher-1',
  visibility: 'private',
  primaryTestTypeId: 'ielts',
  testTypeIds: ['ielts'],
  durationMinutes: 60,
  passageRefs: passages,
  publishedVersionId: 'version-1',
  questionCount: 27,
};

describe('ReadingV2MasterEditModal', () => {
  it('opens in published mode and never mounts full-test Studio', () => {
    render(
      <ReadingV2MasterEditModal
        open
        mode="published"
        currentTeacherId="teacher-1"
        master={master}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: /edit reading v2 master/i })).toBeInTheDocument();
    expect(screen.getByText('Published master')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Published Master')).toBeInTheDocument();
    expect(screen.getByText('Passage A')).toBeInTheDocument();
    expect(screen.queryByText('ReadingV2StudioShell')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /reading v2 studio/i })).not.toBeInTheDocument();
  });

  it('blocks publish when a published master opens without resolved passage references', async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn();

    render(
      <ReadingV2MasterEditModal
        open
        mode="published"
        currentTeacherId="teacher-1"
        master={{
          ...master,
          passageRefs: [],
          passages: [],
          questionCount: 40,
        }}
        onClose={vi.fn()}
        onPublish={onPublish}
      />,
    );

    expect(screen.getByRole('status', { name: /master reference load state/i }))
      .toHaveTextContent('Published master references are not loaded.');
    expect(screen.getByRole('button', { name: /publish master/i })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /publish master/i }));
    expect(onPublish).not.toHaveBeenCalled();
  });

  it('opens in draft mode and keeps the master unpublished until explicit publish', async () => {
    const user = userEvent.setup();
    const onSaveDraft = vi.fn();
    const onPublish = vi.fn();

    render(
      <ReadingV2MasterEditModal
        open
        mode="draft"
        currentTeacherId="teacher-1"
        master={{ ...master, title: 'Draft From Existing', publishedVersionId: undefined }}
        onClose={vi.fn()}
        onSaveDraft={onSaveDraft}
        onPublish={onPublish}
      />,
    );

    expect(screen.getByText('Unpublished draft')).toBeInTheDocument();
    expect(onPublish).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /save draft/i }));
    expect(onSaveDraft).toHaveBeenCalledWith(expect.objectContaining({ mode: 'draft' }));
    expect(onPublish).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /publish master/i }));
    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({ mode: 'draft' }));
  });

  it('edits metadata and passage order', async () => {
    const user = userEvent.setup();

    render(
      <ReadingV2MasterEditModal
        open
        mode="published"
        currentTeacherId="teacher-1"
        master={master}
        onClose={vi.fn()}
      />,
    );

    await user.clear(screen.getByLabelText(/master title/i));
    await user.type(screen.getByLabelText(/master title/i), 'Updated Master');
    await user.selectOptions(screen.getByLabelText(/visibility/i), 'public');
    await user.click(within(screen.getByTestId('master-passage-row-passage-a')).getByRole('button', { name: /move down/i }));

    const rows = screen.getAllByTestId(/master-passage-row-/);
    expect(screen.getByDisplayValue('Updated Master')).toBeInTheDocument();
    expect(screen.getByLabelText(/visibility/i)).toHaveValue('public');
    expect(rows[0]).toHaveTextContent('Public Passage B');
    expect(screen.getByText(/Unsaved changes/i)).toBeInTheDocument();
  });

  it('does not require numbering review for metadata-only edits', async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn();

    render(
      <ReadingV2MasterEditModal
        open
        mode="published"
        currentTeacherId="teacher-1"
        master={master}
        onClose={vi.fn()}
        onPublish={onPublish}
      />,
    );

    await user.clear(screen.getByLabelText(/master title/i));
    await user.type(screen.getByLabelText(/master title/i), 'Updated Master');
    await user.selectOptions(screen.getByLabelText(/visibility/i), 'public');

    expect(screen.getByText(/Unsaved changes/i)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /numbering review/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /publish master/i }));

    expect(screen.queryByText(/Confirm numbering changes before publishing/i)).not.toBeInTheDocument();
    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Updated Master',
      visibility: 'public',
    }));
  });

  it('opens passage slots through the single-passage Studio route and blocks non-owned direct edit', async () => {
    const user = userEvent.setup();
    const onOpenPassageStudio = vi.fn();

    render(
      <ReadingV2MasterEditModal
        open
        mode="published"
        currentTeacherId="teacher-1"
        master={master}
        onClose={vi.fn()}
        onOpenPassageStudio={onOpenPassageStudio}
      />,
    );

    await user.click(within(screen.getByTestId('master-passage-row-passage-a')).getByRole('button', { name: /open single-passage studio/i }));
    expect(onOpenPassageStudio).toHaveBeenCalledWith({
      routeName: 'TEACHER_READING_V2_REVISE',
      params: { materialId: 'passage-a' },
      target: 'new-tab',
    });

    const publicRow = screen.getByTestId('master-passage-row-passage-b');
    expect(within(publicRow).getByRole('button', { name: /open single-passage studio/i })).toBeDisabled();
    expect(within(publicRow).getByRole('button', { name: /clone to my library/i })).toBeInTheDocument();
  });

  it('clones a public non-owned slot into a teacher-owned ref and replaces only that master slot', async () => {
    const user = userEvent.setup();
    const onClonePassage = vi.fn(async () => ({
      passageMaterialId: 'passage-b-clone',
      materialId: 'passage-b-clone',
      snapshotVersionId: 'snapshot-b-clone',
      currentVersionId: 'snapshot-b-clone',
      title: 'Public Passage B',
      titleSnapshot: 'Public Passage B',
      visibility: 'private',
      ownerId: 'teacher-1',
      questionCount: 14,
      questionCountSnapshot: 14,
      order: 2,
    }));
    const onPublish = vi.fn();

    render(
      <ReadingV2MasterEditModal
        open
        mode="published"
        currentTeacherId="teacher-1"
        master={master}
        onClose={vi.fn()}
        onClonePassage={onClonePassage}
        onPublish={onPublish}
      />,
    );

    await user.click(within(screen.getByTestId('master-passage-row-passage-b')).getByRole('button', { name: /clone to my library/i }));

    expect(onClonePassage).toHaveBeenCalledWith(expect.objectContaining({
      passageRef: expect.objectContaining({
        passageMaterialId: 'passage-b',
        ownerId: 'teacher-2',
        snapshotVersionId: 'snapshot-b',
      }),
      master,
    }));
    expect(screen.queryByTestId('master-passage-row-passage-b')).not.toBeInTheDocument();
    expect(screen.getByTestId('master-passage-row-passage-b-clone')).toHaveTextContent('Public Passage B');
    expect(within(screen.getByTestId('master-passage-row-passage-b-clone')).queryByRole('button', { name: /clone to my library/i }))
      .not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /I reviewed the passage order and question numbering/i }));
    await user.click(screen.getByRole('button', { name: /publish master/i }));

    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({
      passageRefs: [
        expect.objectContaining({ passageMaterialId: 'passage-a' }),
        expect.objectContaining({
          passageMaterialId: 'passage-b-clone',
          ownerId: 'teacher-1',
          snapshotVersionId: 'snapshot-b-clone',
        }),
      ],
    }));
  });

  it('keeps the original non-owned ref when clone fails', async () => {
    const user = userEvent.setup();
    const onClonePassage = vi.fn(async () => {
      throw new Error('Clone failed in service.');
    });

    render(
      <ReadingV2MasterEditModal
        open
        mode="published"
        currentTeacherId="teacher-1"
        master={master}
        onClose={vi.fn()}
        onClonePassage={onClonePassage}
      />,
    );

    await user.click(within(screen.getByTestId('master-passage-row-passage-b')).getByRole('button', { name: /clone to my library/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('Clone failed in service.');
    expect(screen.getByTestId('master-passage-row-passage-b')).toHaveTextContent('Public Passage B');
  });

  it('refreshes passage version status through an explicit action', async () => {
    const user = userEvent.setup();
    const onRefreshVersionStatus = vi.fn();

    render(
      <ReadingV2MasterEditModal
        open
        mode="published"
        currentTeacherId="teacher-1"
        master={master}
        onClose={vi.fn()}
        onRefreshVersionStatus={onRefreshVersionStatus}
      />,
    );

    await user.click(screen.getByRole('button', { name: /refresh version status/i }));
    expect(onRefreshVersionStatus).toHaveBeenCalledWith(master);
  });

  it('opens with archived ref warning and blocks publish while unresolved refs remain', async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn();

    render(
      <ReadingV2MasterEditModal
        open
        mode="published"
        currentTeacherId="teacher-1"
        master={master}
        onClose={vi.fn()}
        onPublish={onPublish}
        brokenRefSummary={{
          hasBrokenRefs: true,
          brokenRefCount: 1,
          brokenRefReasons: ['archived'],
          brokenRefs: [{
            refId: 'passage-a',
            passageMaterialId: 'passage-a',
            snapshotVersionId: 'snapshot-a',
            titleSnapshot: 'Passage A',
            questionCountSnapshot: 13,
            reason: 'archived',
            affordances: ['restore', 'choose-existing', 'remove-ref', 'clone-remake'],
          }],
        }}
      />,
    );

    expect(screen.getByRole('status', { name: /broken reading passage refs/i })).toHaveTextContent('1 passage needs repair');
    expect(screen.getByTestId('master-repair-ref-passage-a')).toHaveTextContent('Removed');

    await user.click(screen.getByRole('button', { name: /publish master/i }));

    expect(screen.getByText(/Repair or remove every broken passage before publishing/i)).toBeInTheDocument();
    expect(onPublish).not.toHaveBeenCalled();
  });

  it('repairs by choosing an existing passage and requires numbering review when question count changes', async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn();
    const onRepairWithExisting = vi.fn();

    render(
      <ReadingV2MasterEditModal
        open
        mode="published"
        currentTeacherId="teacher-1"
        master={master}
        onClose={vi.fn()}
        onPublish={onPublish}
        onRepairWithExisting={onRepairWithExisting}
        replacementPassages={[
          {
            materialId: 'passage-c',
            title: 'Replacement Passage',
            ownerId: 'teacher-1',
            currentVersionId: 'snapshot-c',
            publishedSnapshotVersionId: 'snapshot-c',
            questionCount: 15,
            testTypeIds: ['ielts'],
            state: 'published',
          },
        ]}
        brokenRefSummary={{
          hasBrokenRefs: true,
          brokenRefCount: 1,
          brokenRefReasons: ['archived'],
          brokenRefs: [{
            refId: 'passage-a',
            passageMaterialId: 'passage-a',
            snapshotVersionId: 'snapshot-a',
            titleSnapshot: 'Passage A',
            questionCountSnapshot: 13,
            testTypeIdsSnapshot: ['ielts'],
            reason: 'archived',
            affordances: ['choose-existing', 'remove-ref'],
          }],
        }}
      />,
    );

    await user.selectOptions(screen.getByLabelText(/replacement for passage a/i), 'passage-c');
    await user.click(screen.getByRole('button', { name: 'Add existing passage' }));

    expect(onRepairWithExisting).toHaveBeenCalledWith(expect.objectContaining({
      brokenRef: expect.objectContaining({ passageMaterialId: 'passage-a' }),
      replacement: expect.objectContaining({ materialId: 'passage-c' }),
    }));
    expect(screen.getByTestId('master-passage-row-passage-c')).toHaveTextContent('Replacement Passage');
    expect(screen.getByRole('region', { name: /numbering review/i })).toHaveTextContent('29 questions');

    await user.click(screen.getByRole('button', { name: /publish master/i }));
    expect(screen.getByText(/Confirm numbering changes before publishing/i)).toBeInTheDocument();
    expect(onPublish).not.toHaveBeenCalled();

    await user.click(screen.getByRole('checkbox', { name: /I reviewed the passage order and question numbering/i }));
    await user.click(screen.getByRole('button', { name: /publish master/i }));

    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({
      passageRefs: expect.arrayContaining([
        expect.objectContaining({ passageMaterialId: 'passage-c', questionCount: 15 }),
      ]),
    }));
  });

  it('allows different-Test-Type repair only after explicit confirmation', async () => {
    const user = userEvent.setup();
    const onRepairWithExisting = vi.fn();

    render(
      <ReadingV2MasterEditModal
        open
        mode="published"
        currentTeacherId="teacher-1"
        master={master}
        onClose={vi.fn()}
        onRepairWithExisting={onRepairWithExisting}
        replacementPassages={[
          {
            materialId: 'passage-det',
            title: 'DET Passage',
            ownerId: 'teacher-1',
            currentVersionId: 'snapshot-det',
            publishedSnapshotVersionId: 'snapshot-det',
            questionCount: 13,
            testTypeIds: ['det'],
            state: 'published',
          },
        ]}
        brokenRefSummary={{
          hasBrokenRefs: true,
          brokenRefCount: 1,
          brokenRefReasons: ['archived'],
          brokenRefs: [{
            refId: 'passage-a',
            passageMaterialId: 'passage-a',
            snapshotVersionId: 'snapshot-a',
            titleSnapshot: 'Passage A',
            questionCountSnapshot: 13,
            testTypeIdsSnapshot: ['ielts'],
            reason: 'archived',
            affordances: ['choose-existing'],
          }],
        }}
      />,
    );

    await user.selectOptions(screen.getByLabelText(/replacement for passage a/i), 'passage-det');
    await user.click(screen.getByRole('button', { name: 'Add existing passage' }));

    expect(screen.getByText(/Confirm mixed Test Type replacement/i)).toBeInTheDocument();
    expect(onRepairWithExisting).not.toHaveBeenCalled();

    await user.click(screen.getByRole('checkbox', { name: /I understand this replacement uses a different Test Type/i }));
    await user.click(screen.getByRole('button', { name: 'Add existing passage' }));

    expect(onRepairWithExisting).toHaveBeenCalled();
  });

  it('removes a broken passage and opens remake flow without normal update references', async () => {
    const user = userEvent.setup();
    const onRemoveBrokenRef = vi.fn();
    const onRemakeBrokenRef = vi.fn();
    const onOpenPassageStudio = vi.fn();

    render(
      <ReadingV2MasterEditModal
        open
        mode="published"
        currentTeacherId="teacher-1"
        master={master}
        onClose={vi.fn()}
        onRemoveBrokenRef={onRemoveBrokenRef}
        onRemakeBrokenRef={onRemakeBrokenRef}
        onOpenPassageStudio={onOpenPassageStudio}
        brokenRefSummary={{
          hasBrokenRefs: true,
          brokenRefCount: 1,
          brokenRefReasons: ['deleted'],
          brokenRefs: [{
            refId: 'passage-a',
            passageMaterialId: 'passage-a',
            snapshotVersionId: 'snapshot-a',
            titleSnapshot: 'Passage A',
            questionCountSnapshot: 13,
            reason: 'deleted',
            affordances: ['remove-ref', 'clone-remake'],
          }],
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Remake manually' }));

    expect(onRemakeBrokenRef).toHaveBeenCalledWith(expect.objectContaining({ passageMaterialId: 'passage-a' }));
    expect(onOpenPassageStudio).toHaveBeenCalledWith(expect.objectContaining({
      routeName: 'TEACHER_READING_V2_CREATE',
      target: 'new-tab',
    }));
    expect(screen.queryByRole('dialog', { name: /Update references/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove passage' }));

    expect(onRemoveBrokenRef).toHaveBeenCalledWith(expect.objectContaining({ passageMaterialId: 'passage-a' }));
    expect(screen.queryByTestId('master-passage-row-passage-a')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: /numbering review/i })).toHaveTextContent('14 questions');
  });
});
