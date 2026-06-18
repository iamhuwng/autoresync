import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReadingV2MobileUtilities } from './ReadingV2MobileUtilities';

const instructionGroups = [
  {
    taskGroupId: 'group-1',
    rangeLabel: 'Questions 1-2',
    texts: ['Complete the sentences below.', 'Choose NO MORE THAN TWO WORDS from the passage.'],
  },
];

describe('ReadingV2MobileUtilities', () => {
  it('renders an accessible text-size dialog and reports slider changes', async () => {
    const onTextSizeChange = vi.fn();

    render(
      <ReadingV2MobileUtilities
        panel="text-size"
        textSize={18}
        instructionGroups={instructionGroups}
        onTextSizeChange={onTextSizeChange}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Text size' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('18px')).toBeInTheDocument();
    const slider = screen.getByRole('slider', { name: 'Reading text size' });
    expect(slider).toHaveAttribute('min', '14');
    expect(slider).toHaveAttribute('max', '22');

    fireEvent.change(slider, { target: { value: '20' } });
    expect(onTextSizeChange).toHaveBeenCalledWith(20);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus());
  });

  it('renders projected instructions and closes on Escape', () => {
    const onClose = vi.fn();

    render(
      <ReadingV2MobileUtilities
        panel="instructions"
        textSize={16}
        instructionGroups={instructionGroups}
        onTextSizeChange={vi.fn()}
        onClose={onClose}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Instructions' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Questions 1-2')).toBeInTheDocument();
    expect(screen.getByText('Complete the sentences below.')).toBeInTheDocument();
    expect(screen.getByText(/NO MORE THAN TWO WORDS/)).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
