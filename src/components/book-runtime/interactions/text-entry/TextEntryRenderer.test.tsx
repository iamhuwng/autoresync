import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ActivityRendererProps } from '../../../../services/book-activity/runtime/activityRenderer.types';
import type { TextEntryResponse } from '../../../../services/book-activity/runtime/codecs/textEntryResponseCodec';
import type { StudentActivityInteraction } from '../../../../types/bookActivity.types';
import { MAX_TEXT_ENTRY_LENGTH, TextAreaEntryRenderer, TextEntryRenderer } from './TextEntryRenderer';

const interaction = (overrides: Partial<Extract<StudentActivityInteraction, { family: 'text-entry' }>> = {}) => ({
  interactionId: 'text-1',
  family: 'text-entry' as const,
  prompt: 'Complete the sentence.',
  ...overrides,
});

const props = (overrides: Partial<ActivityRendererProps<TextEntryResponse | null>> = {}): ActivityRendererProps<TextEntryResponse | null> => ({
  interaction: interaction(),
  answerRule: { defaultPoints: 1, normalization: 'trim-case-and-spacing' },
  stimulus: null,
  response: null,
  validation: { status: 'valid' },
  mode: 'editable',
  onChange: vi.fn(),
  ...overrides,
});

describe('TextEntryRenderer', () => {
  it('renders labelled input, source correspondence, and bounded controlled changes', async () => {
    const onChange = vi.fn();
    render(<TextEntryRenderer {...props({
      onChange,
      sourceContext: { available: true, description: 'Book page 3, Exercise 1.' },
      interaction: interaction({
        sourceAssisted: {
          questionLabel: '1.2',
          accessiblePrompt: 'Type the missing word for question 1.2.',
          responseShape: 'short-text',
          sourceExerciseLabel: 'Exercise 1',
        },
      }),
    })} />);

    const input = screen.getByRole('textbox', { name: 'Complete the sentence.' });
    expect(input).toHaveAttribute('maxLength', String(MAX_TEXT_ENTRY_LENGTH));
    expect(screen.getByText('Book page 3, Exercise 1.')).toBeInTheDocument();
    expect(screen.getByText('Type the missing word for question 1.2.')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'answer' } });
    expect(onChange).toHaveBeenLastCalledWith({ interactionId: 'text-1', text: 'answer' });
  });

  it('uses textarea for multiline variants and exposes validation state', () => {
    render(<TextAreaEntryRenderer {...props({
      response: { interactionId: 'text-1', text: 'draft' },
      validation: { status: 'invalid', message: 'Answer needs correction.' },
    })} />);

    expect(screen.getByRole('textbox', { name: 'Complete the sentence.' }).tagName).toBe('TEXTAREA');
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Answer needs correction.');
  });

  it('keeps read-only and review states non-editable', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<TextEntryRenderer {...props({
      onChange,
      mode: 'read-only',
      response: { interactionId: 'text-1', text: 'saved' },
    })} />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('readonly');
    expect(input).toHaveAttribute('aria-readonly', 'true');
    await user.type(input, 'x');
    expect(onChange).not.toHaveBeenCalled();

    rerender(<TextEntryRenderer {...props({ onChange, mode: 'review', response: { interactionId: 'text-1', text: 'saved' } })} />);
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-readonly', 'true');
    expect(screen.getByRole('textbox')).not.toBeDisabled();
    await user.type(screen.getByRole('textbox'), 'x');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('fails closed for malformed or over-bound responses', () => {
    render(<TextEntryRenderer {...props({ response: { interactionId: 'text-1', text: 'x'.repeat(MAX_TEXT_ENTRY_LENGTH + 1) } })} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Unsupported text-entry response/);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
