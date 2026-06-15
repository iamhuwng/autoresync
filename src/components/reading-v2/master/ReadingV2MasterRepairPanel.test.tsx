import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReadingV2MasterRepairPanel } from './ReadingV2MasterRepairPanel';

const brokenRef = {
  refId: 'ref-archived',
  passageMaterialId: 'passage-archived',
  snapshotVersionId: 'snapshot-archived',
  titleSnapshot: 'Archived Passage',
  questionCountSnapshot: 13,
  testTypeIdsSnapshot: ['ielts'],
  reason: 'archived',
  affordances: ['restore', 'choose-existing', 'remove-ref', 'clone-remake'],
};

const replacement = {
  materialId: 'passage-replacement',
  title: 'Replacement Passage',
  ownerId: 'teacher-1',
  currentVersionId: 'snapshot-replacement',
  publishedSnapshotVersionId: 'snapshot-replacement',
  questionCount: 13,
  testTypeIds: ['ielts'],
  state: 'published',
};

describe('ReadingV2MasterRepairPanel', () => {
  it('maps broken reason codes to exact repair actions without canonical hydration', async () => {
    const user = userEvent.setup();
    const onAddExisting = vi.fn();
    const onRemove = vi.fn();
    const onRemake = vi.fn();
    const onRestore = vi.fn();
    const loadCanonicalPassage = vi.fn();

    render(
      <ReadingV2MasterRepairPanel
        brokenRefs={[brokenRef]}
        replacementPassages={[replacement]}
        currentTeacherId="teacher-1"
        onAddExisting={onAddExisting}
        onRemove={onRemove}
        onRemake={onRemake}
        onRestore={onRestore}
        loadCanonicalPassage={loadCanonicalPassage}
      />,
    );

    const row = screen.getByTestId('master-repair-ref-passage-archived');
    expect(row).toHaveTextContent('Removed');
    expect(row).toHaveTextContent('Archived Passage');

    await user.selectOptions(within(row).getByLabelText(/replacement for archived passage/i), 'passage-replacement');
    await user.click(within(row).getByRole('button', { name: 'Add existing passage' }));
    await user.click(within(row).getByRole('button', { name: 'Restore source passage' }));
    await user.click(within(row).getByRole('button', { name: 'Remove passage' }));
    await user.click(within(row).getByRole('button', { name: 'Remake manually' }));

    expect(onAddExisting).toHaveBeenCalledWith({ brokenRef, replacement });
    expect(onRestore).toHaveBeenCalledWith(brokenRef);
    expect(onRemove).toHaveBeenCalledWith(brokenRef);
    expect(onRemake).toHaveBeenCalledWith(brokenRef);
    expect(loadCanonicalPassage).not.toHaveBeenCalled();
  });

  it('shows blocked and empty states explicitly', () => {
    const { rerender } = render(
      <ReadingV2MasterRepairPanel
        brokenRefs={[]}
        replacementPassages={[]}
        currentTeacherId="teacher-1"
        loading
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Checking broken references');

    rerender(
      <ReadingV2MasterRepairPanel
        brokenRefs={[]}
        replacementPassages={[]}
        currentTeacherId="teacher-1"
      />,
    );

    expect(screen.getByText('No broken Reading Passage refs.')).toBeInTheDocument();

    rerender(
      <ReadingV2MasterRepairPanel
        brokenRefs={[{ ...brokenRef, affordances: ['blocked'], reason: 'unknown' }]}
        replacementPassages={[]}
        currentTeacherId="teacher-1"
        error="Repair data unavailable."
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Repair data unavailable.');
    expect(screen.getByTestId('master-repair-ref-passage-archived')).toHaveTextContent('No repair action is available yet.');
  });
});
