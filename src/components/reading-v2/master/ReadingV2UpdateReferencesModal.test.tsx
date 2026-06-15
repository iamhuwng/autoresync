import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReadingV2UpdateReferencesModal } from './ReadingV2UpdateReferencesModal';

const summary = {
  passageMaterialId: 'passage-1',
  previousSnapshotVersionId: 'snapshot-old',
  nextSnapshotVersionId: 'snapshot-new',
  targets: [
    {
      id: 'master:composition-1:ref-1',
      kind: 'master',
      title: 'Owned master',
      ownerId: 'teacher-1',
      refId: 'ref-1',
      materialId: 'passage-1',
      currentSnapshotVersionId: 'snapshot-old',
      nextSnapshotVersionId: 'snapshot-new',
      selectable: true,
    },
    {
      id: 'book:book-1:node-1:book-ref-1',
      kind: 'book',
      title: 'Owned book',
      ownerId: 'teacher-1',
      refId: 'book-ref-1',
      materialId: 'passage-1',
      currentSnapshotVersionId: 'snapshot-old',
      nextSnapshotVersionId: 'snapshot-new',
      selectable: true,
    },
  ],
  excluded: {
    nonOwnedReferenceCount: 1,
    alreadyCurrentCount: 0,
    frozenAssignmentCount: 2,
    resultSnapshotCount: 5,
  },
};

describe('ReadingV2UpdateReferencesModal', () => {
  it('opens after single-passage publish with all update targets unchecked by default', () => {
    render(
      <ReadingV2UpdateReferencesModal
        open
        passageTitle="Making Time for Science"
        summary={summary}
        onClose={vi.fn()}
        onSkipAll={vi.fn()}
        onUpdateSelected={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: /update references/i })).toBeInTheDocument();
    expect(screen.getByText('Making Time for Science')).toBeInTheDocument();
    expect(screen.getByText(/assignments and results stay frozen/i)).toBeInTheDocument();
    screen.getAllByRole('checkbox').forEach((checkbox) => {
      expect(checkbox).not.toBeChecked();
    });
    expect(screen.getByRole('button', { name: /update selected references/i })).toBeDisabled();
  });

  it('submits only explicitly selected master and book references', async () => {
    const user = userEvent.setup();
    const onUpdateSelected = vi.fn();

    render(
      <ReadingV2UpdateReferencesModal
        open
        passageTitle="Making Time for Science"
        summary={summary}
        onClose={vi.fn()}
        onSkipAll={vi.fn()}
        onUpdateSelected={onUpdateSelected}
      />,
    );

    await user.click(within(screen.getByTestId('reference-target-master:composition-1:ref-1')).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /update selected references/i }));

    expect(onUpdateSelected).toHaveBeenCalledWith(['master:composition-1:ref-1']);
  });

  it('allows an explicit skip without updating owned references', async () => {
    const user = userEvent.setup();
    const onSkipAll = vi.fn();
    const onUpdateSelected = vi.fn();

    render(
      <ReadingV2UpdateReferencesModal
        open
        passageTitle="Making Time for Science"
        summary={summary}
        onClose={vi.fn()}
        onSkipAll={onSkipAll}
        onUpdateSelected={onUpdateSelected}
      />,
    );

    await user.click(screen.getByRole('button', { name: /keep existing tests and books unchanged/i }));

    expect(onSkipAll).toHaveBeenCalled();
    expect(onUpdateSelected).not.toHaveBeenCalled();
  });
});
