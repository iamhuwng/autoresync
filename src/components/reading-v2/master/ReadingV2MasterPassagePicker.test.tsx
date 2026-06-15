import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReadingV2MasterPassagePicker } from './ReadingV2MasterPassagePicker';

const rows = [
  {
    materialId: 'passage-published',
    title: 'Published Passage',
    source: 'Cambridge 18',
    testTypeIds: ['ielts'],
    visibility: 'private',
    ownerId: 'teacher-1',
    currentVersionId: 'snapshot-published',
    publishedSnapshotVersionId: 'snapshot-published',
    questionCount: 13,
    state: 'published',
  },
  {
    materialId: 'passage-public',
    title: 'Public Passage',
    source: 'BC',
    testTypeIds: ['ielts'],
    visibility: 'public',
    ownerId: 'teacher-2',
    currentVersionId: 'snapshot-public',
    publishedSnapshotVersionId: 'snapshot-public',
    questionCount: 12,
    state: 'published',
  },
  {
    materialId: 'passage-draft',
    title: 'Draft Passage',
    ownerId: 'teacher-1',
    state: 'draft',
  },
  {
    materialId: 'passage-archived',
    title: 'Archived Passage',
    ownerId: 'teacher-1',
    state: 'archived',
    archivedAt: '2026-06-01T00:00:00.000Z',
    publishedSnapshotVersionId: 'snapshot-archived',
  },
];

describe('ReadingV2MasterPassagePicker', () => {
  it('lists only published unarchived Reading Passage rows without canonical hydration', () => {
    const loadCanonicalPassage = vi.fn();

    render(
      <ReadingV2MasterPassagePicker
        rows={rows}
        currentTeacherId="teacher-1"
        selectedPassageIds={[]}
        onSelectPassage={vi.fn()}
        loadCanonicalPassage={loadCanonicalPassage}
      />,
    );

    expect(screen.getByText('Published Passage')).toBeInTheDocument();
    expect(screen.getByText('Public Passage')).toBeInTheDocument();
    expect(screen.queryByText('Draft Passage')).not.toBeInTheDocument();
    expect(screen.queryByText('Archived Passage')).not.toBeInTheDocument();
    expect(loadCanonicalPassage).not.toHaveBeenCalled();
  });

  it('blocks duplicate passage selection until duplicate confirmation is explicit', async () => {
    const user = userEvent.setup();
    const onSelectPassage = vi.fn();

    render(
      <ReadingV2MasterPassagePicker
        rows={rows}
        currentTeacherId="teacher-1"
        selectedPassageIds={['passage-published']}
        onSelectPassage={onSelectPassage}
      />,
    );

    const row = screen.getByTestId('master-passage-picker-row-passage-published');
    await user.click(within(row).getByRole('button', { name: /already selected/i }));

    expect(onSelectPassage).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('already selected');
  });
});
