import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ActivityRendererProps } from '../../../../services/book-activity/runtime/activityRenderer.types';
import type { MatchingResponse } from '../../../../services/book-activity/runtime/codecs/matchingResponseCodec';
import type { StudentActivityInteraction } from '../../../../types/bookActivity.types';
import { MatchingRenderer } from './MatchingRenderer';

const interaction = (overrides: Partial<Extract<StudentActivityInteraction, { family: 'matching' }>> = {}) => ({
  interactionId: 'matching-1',
  family: 'matching' as const,
  prompt: 'Match each item.',
  leftItems: [
    { itemId: 'left-a', label: 'Left A' },
    { itemId: 'left-b', label: 'Left B' },
  ],
  rightItems: [
    { itemId: 'right-1', label: 'Right 1' },
    { itemId: 'right-2', label: 'Right 2' },
  ],
  ...overrides,
});

const props = (overrides: Partial<ActivityRendererProps<MatchingResponse | null>> = {}): ActivityRendererProps<MatchingResponse | null> => ({
  interaction: interaction(),
  answerRule: { defaultPoints: 1, normalization: 'exact', allowOptionReuse: false },
  stimulus: null,
  response: null,
  validation: { status: 'valid' },
  mode: 'editable',
  onChange: vi.fn(),
  ...overrides,
});

describe('MatchingRenderer', () => {
  it('supports native pointer/keyboard selection and rejects reused options', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<MatchingRenderer {...props({ onChange })} />);

    const first = screen.getByRole('combobox', { name: 'Match Left A' });
    await user.selectOptions(first, 'right-1');
    expect(onChange).toHaveBeenCalledWith({
      interactionId: 'matching-1',
      pairs: [{ leftItemId: 'left-a', rightItemId: 'right-1' }],
    });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Match Left B' }), 'right-1');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('already used');
  });

  it('restores partial state and exposes source/validation associations', () => {
    render(<MatchingRenderer {...props({
      response: {
        interactionId: 'matching-1',
        pairs: [{ leftItemId: 'left-b', rightItemId: 'right-2' }],
      },
      sourceContext: { available: true, description: 'Book page 4.' },
      validation: { status: 'invalid', message: 'Review this match.' },
      mode: 'review',
    })} />);

    expect(screen.getByRole('combobox', { name: 'Match Left B' })).toHaveValue('right-2');
    expect(screen.getByText('Book page 4.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Review this match.');
    expect(screen.getByRole('combobox', { name: 'Match Left A' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Match Left A' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Left B — Right 2')).toBeInTheDocument();
  });

  it('fails closed for duplicate items and malformed responses', () => {
    const { rerender } = render(<MatchingRenderer {...props({
      interaction: interaction({
        leftItems: [{ itemId: 'left-a', label: 'A' }, { itemId: 'left-a', label: 'Again' }],
      }),
    })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Unsupported matching activity.');
    rerender(<MatchingRenderer {...props({
      response: { interactionId: 'matching-1', pairs: [{ leftItemId: 'unknown', rightItemId: 'right-1' }] },
    })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Unsupported matching response.');
  });
});
