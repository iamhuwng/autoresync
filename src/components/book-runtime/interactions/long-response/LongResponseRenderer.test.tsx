import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActivityRendererProps } from '../../../../services/book-activity/runtime/activityRenderer.types';
import type { LongResponseResponse } from '../../../../services/book-activity/runtime/codecs/longResponseResponseCodec';
import type { StudentActivityInteraction } from '../../../../types/bookActivity.types';
import {
  LongResponseRenderer,
  MAX_LONG_RESPONSE_CHARACTERS,
  type LongResponseRendererProps,
} from './LongResponseRenderer';

const interaction = (overrides: Partial<Extract<StudentActivityInteraction, { family: 'long-response' }>> = {}) => ({
  interactionId: 'long-1',
  family: 'long-response' as const,
  prompt: 'Explain your answer.',
  ...overrides,
});

const props = (overrides: Partial<LongResponseRendererProps> = {}): LongResponseRendererProps => ({
  interaction: interaction(),
  answerRule: { defaultPoints: 0, normalization: 'exact' },
  stimulus: null,
  response: null,
  validation: { status: 'valid' },
  mode: 'editable',
  onChange: vi.fn(),
  ...overrides,
});

describe('Ticket #40 long-response renderer', () => {
  afterEach(() => cleanup());

  it('renders accessible prompt, source context, counter, and exact changes', () => {
    const onChange = vi.fn();
    render(<LongResponseRenderer {...props({
      onChange,
      sourceContext: { available: true, description: 'Page 4, Exercise 2.' },
      interaction: interaction({
        sourceAssisted: {
          questionLabel: '2.1',
          accessiblePrompt: 'Write a complete response for question 2.1.',
          responseShape: 'long-response',
        },
      }),
    })} />);
    const input = screen.getByRole('textbox', { name: 'Explain your answer.' });
    expect(input.getAttribute('maxlength')).toBe(String(MAX_LONG_RESPONSE_CHARACTERS));
    expect(screen.getByText('Page 4, Exercise 2.')).not.toBeNull();
    expect(screen.getByText('Write a complete response for question 2.1.')).not.toBeNull();
    fireEvent.change(input, { target: { value: 'draft\nwith Unicode 🌿' } });
    expect(onChange).toHaveBeenCalledWith({ interactionId: 'long-1', text: 'draft\nwith Unicode 🌿' });
  });

  it('keeps read-only and pending-review states locked and exposes validation', () => {
    const onChange = vi.fn();
    const { rerender } = render(<LongResponseRenderer {...props({
      onChange,
      mode: 'read-only',
      response: { interactionId: 'long-1', text: 'saved' },
    })} />);
    const input = screen.getByRole('textbox');
    expect(input.hasAttribute('readonly')).toBe(true);
    fireEvent.change(input, { target: { value: 'blocked' } });
    expect(onChange).not.toHaveBeenCalled();
    rerender(<LongResponseRenderer {...props({
      onChange,
      mode: 'review',
      pendingReview: true,
      reviewText: 'Teacher feedback released.',
      response: { interactionId: 'long-1', text: 'saved' },
      validation: { status: 'invalid', message: 'Review required.' },
    })} />);
    expect(screen.getByText('Pending review: Teacher feedback released.')).not.toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('Review required.');
    expect(screen.getByRole('textbox').hasAttribute('readonly')).toBe(true);
  });

  it('fails closed for malformed interaction or response', () => {
    render(<LongResponseRenderer {...props({
      response: { interactionId: 'long-1', text: 'x'.repeat(MAX_LONG_RESPONSE_CHARACTERS + 1) },
    })} />);
    expect(screen.getByRole('alert').textContent).toMatch(/Unsupported long-response response/);
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
