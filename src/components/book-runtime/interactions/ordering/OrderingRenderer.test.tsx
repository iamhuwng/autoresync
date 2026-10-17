import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ActivityRendererProps } from '../../../../services/book-activity/runtime/activityRenderer.types';
import type { OrderingResponse } from '../../../../services/book-activity/runtime/codecs/orderingResponseCodec';
import type { StudentActivityInteraction } from '../../../../types/bookActivity.types';
import { OrderingRenderer } from './OrderingRenderer';

const interaction = (overrides: Partial<Extract<StudentActivityInteraction, { family: 'ordering' }>> = {}) => ({
  interactionId: 'ordering-1',
  family: 'ordering' as const,
  prompt: 'Put the steps in order.',
  items: [
    { itemId: 'item-a', label: 'Step A' },
    { itemId: 'item-b', label: 'Step B' },
    { itemId: 'item-c', label: 'Step C' },
  ],
  ...overrides,
});

const props = (overrides: Partial<ActivityRendererProps<OrderingResponse | null>> = {}): ActivityRendererProps<OrderingResponse | null> => ({
  interaction: interaction(),
  answerRule: { defaultPoints: 1, normalization: 'exact' },
  stimulus: null,
  response: null,
  validation: { status: 'valid' },
  mode: 'editable',
  onChange: vi.fn(),
  ...overrides,
});

describe('OrderingRenderer', () => {
  it('supports pointer and keyboard-accessible add/move controls with partial state', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<OrderingRenderer {...props({ onChange })} />);

    await user.click(screen.getByRole('button', { name: 'Add Step B to order' }));
    expect(onChange).toHaveBeenCalledWith({
      interactionId: 'ordering-1',
      orderedItemIds: ['item-b'],
    });
    expect(document.activeElement).toHaveAccessibleName('Remove Step B');
    const addA = screen.getByRole('button', { name: 'Add Step A to order' });
    addA.focus();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith({
      interactionId: 'ordering-1',
      orderedItemIds: ['item-b', 'item-a'],
    });
    await user.click(screen.getByRole('button', { name: 'Move Step A up' }));
    expect(onChange).toHaveBeenLastCalledWith({
      interactionId: 'ordering-1',
      orderedItemIds: ['item-a', 'item-b'],
    });
    expect(document.activeElement).toHaveAccessibleName('Remove Step A');
  });

  it('restores read-only order without exposing edit controls', () => {
    render(<OrderingRenderer {...props({
      mode: 'review',
      response: { interactionId: 'ordering-1', orderedItemIds: ['item-c', 'item-a'] },
    })} />);

    expect(screen.getByText('Step C')).toBeInTheDocument();
    expect(screen.getByText('Step A')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Current order' })).toBeInTheDocument();
  });

  it('fails closed for malformed or duplicate item data', () => {
    render(<OrderingRenderer {...props({
      interaction: interaction({
        items: [{ itemId: 'item-a', label: 'A' }, { itemId: 'item-a', label: 'Again' }],
      }),
    })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Unsupported ordering activity.');
  });
});
