import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReadingV2DuplicateWarningPanel } from './ReadingV2DuplicateWarningPanel';

const warning = {
  passageMaterialId: 'new-passage',
  result: {
    shouldWarn: true,
    blockPublish: false,
    matches: [
      {
        materialId: 'active-passage',
        title: 'Active similar passage',
        source: { sourceFullTestId: 'full-1' },
        ownerId: 'teacher-1',
        visibility: 'private',
        state: 'published',
        currentVersionId: 'snapshot-active',
        bodySimilarityPercent: 88,
        questionSimilarityPercent: 92,
        combinedSimilarityPercent: 90,
        shouldWarn: true,
        actions: ['use-existing', 'create-new-anyway'],
        answerKey: 'A',
        canonicalPayload: { hidden: true },
      },
      {
        materialId: 'archived-passage',
        title: 'Archived similar passage',
        source: {},
        ownerId: 'teacher-1',
        visibility: 'private',
        state: 'archived',
        currentVersionId: 'snapshot-archived',
        bodySimilarityPercent: 84,
        questionSimilarityPercent: 90,
        combinedSimilarityPercent: 87,
        shouldWarn: true,
        actions: ['restore-and-use', 'create-new-anyway'],
        hiddenProvenance: 'unsafe',
      },
    ],
  },
} as any;

describe('ReadingV2DuplicateWarningPanel', () => {
  it('shows warning matches, stays non-blocking, and emits all duplicate decisions safely', async () => {
    const user = userEvent.setup();
    const onUseExisting = vi.fn();
    const onRestoreAndUse = vi.fn();
    const onCreateNewAnyway = vi.fn();

    render(
      <ReadingV2DuplicateWarningPanel
        warnings={[warning]}
        onUseExisting={onUseExisting}
        onRestoreAndUse={onRestoreAndUse}
        onCreateNewAnyway={onCreateNewAnyway}
      />,
    );

    expect(screen.getByRole('status', { name: /duplicate reading passage warning/i })).toHaveTextContent('non-blocking');
    expect(screen.getByText('Active similar passage')).toBeInTheDocument();
    expect(screen.getByText('90% similar')).toBeInTheDocument();
    expect(screen.getByText('Archived similar passage')).toBeInTheDocument();
    expect(screen.getByText('87% similar')).toBeInTheDocument();
    expect(screen.queryByText('answerKey')).not.toBeInTheDocument();
    expect(screen.queryByText('canonicalPayload')).not.toBeInTheDocument();
    expect(screen.queryByText('hiddenProvenance')).not.toBeInTheDocument();

    await user.click(within(screen.getByTestId('duplicate-match-active-passage')).getByRole('button', { name: /use existing/i }));
    await user.click(within(screen.getByTestId('duplicate-match-active-passage')).getByRole('button', { name: /create new anyway/i }));
    await user.click(within(screen.getByTestId('duplicate-match-archived-passage')).getByRole('button', { name: /restore and use/i }));

    expect(onUseExisting).toHaveBeenCalledWith(expect.objectContaining({ materialId: 'active-passage' }), warning);
    expect(onCreateNewAnyway).toHaveBeenCalledWith(expect.objectContaining({ materialId: 'active-passage' }), warning);
    expect(onRestoreAndUse).toHaveBeenCalledWith(expect.objectContaining({ materialId: 'archived-passage' }), warning);
  });
});
