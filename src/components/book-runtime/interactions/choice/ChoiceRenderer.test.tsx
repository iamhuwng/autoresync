import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ActivityRendererProps } from '../../../../services/book-activity/runtime/activityRenderer.types';
import type { ChoiceResponse } from '../../../../services/book-activity/runtime/codecs/choiceResponseCodec';
import type { StudentActivityInteraction } from '../../../../types/bookActivity.types';
import { ChoiceRenderer, MultipleChoiceRenderer, SingleChoiceRenderer } from './ChoiceRenderer';

const interaction = (overrides: Partial<Extract<StudentActivityInteraction, { family: 'choice' }>> = {}) => ({
  interactionId: 'choice-1',
  family: 'choice' as const,
  prompt: 'Which answer is correct?',
  options: [
    { itemId: 'a', label: 'Answer A' },
    { itemId: 'b', label: 'Answer B' },
    { itemId: 'c', label: 'Answer C' },
  ],
  ...overrides,
});

const props = (overrides: Partial<ActivityRendererProps<ChoiceResponse>> = {}): ActivityRendererProps<ChoiceResponse> => ({
  interaction: interaction(),
  answerRule: { defaultPoints: 1, normalization: 'trim-case-and-spacing' },
  stimulus: null,
  response: null,
  validation: { status: 'valid' },
  mode: 'editable',
  onChange: vi.fn(),
  ...overrides,
});

describe('ChoiceRenderer', () => {
  it('renders single-choice controls in a labelled fieldset and changes selected item', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SingleChoiceRenderer {...props({
      onChange,
      interaction: interaction({
        sourceAssisted: {
          questionLabel: '1.1',
          accessiblePrompt: 'Choose one answer for question 1.1.',
          responseShape: 'single-choice',
          sourceExerciseLabel: 'Exercise 1',
        },
      }),
    })} />);

    expect(screen.getByRole('group', { name: 'Which answer is correct?' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByText('Choose one answer for question 1.1.')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Answer B'));
    expect(onChange).toHaveBeenCalledWith({ interactionId: 'choice-1', selectedOptionId: 'b' });
  });

  it('renders multiple-choice checkboxes and preserves native keyboard controls', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<MultipleChoiceRenderer {...props({
      onChange,
      answerRule: {
        defaultPoints: 1,
        normalization: 'trim-case-and-spacing',
        requiredSelectionCount: 2,
      },
      response: { interactionId: 'choice-1', selectedOptionIds: [] },
    })} />);

    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(screen.getByText('Select 2 options.')).toBeInTheDocument();
    screen.getByLabelText('Answer A').focus();
    await user.keyboard(' ');
    expect(onChange).not.toHaveBeenCalled();
    screen.getByLabelText('Answer B').focus();
    await user.keyboard(' ');
    expect(onChange).toHaveBeenCalledWith({ interactionId: 'choice-1', selectedOptionIds: ['a', 'b'] });
    screen.getByLabelText('Answer C').focus();
    await user.keyboard(' ');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('locks read-only and review modes while exposing validation errors', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SingleChoiceRenderer {...props({
      onChange,
      mode: 'review',
      response: { interactionId: 'choice-1', selectedOptionId: 'a' },
      validation: { status: 'invalid', message: 'Select a valid answer.' },
    })} />);

    expect(screen.getByRole('group')).toHaveAttribute('aria-readonly', 'true');
    expect(screen.getByRole('group')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByLabelText('Answer A')).not.toBeDisabled();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Select a valid answer.');
    expect(screen.getByLabelText('Answer A')).toHaveAttribute('aria-describedby', alert.id);
    await user.click(screen.getByLabelText('Answer B'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([
    ['duplicate option IDs', interaction({ options: [{ itemId: 'a', label: 'A' }, { itemId: 'a', label: 'Again' }] }), null],
    ['unknown single response', interaction(), { interactionId: 'choice-1', selectedOptionId: 'unknown' }],
    ['duplicate multiple response', interaction(), { interactionId: 'choice-1', selectedOptionIds: ['a', 'a'] }],
    ['wrong multiple cardinality shape', interaction(), { interactionId: 'choice-1', selectedOptionIds: 'a' }],
  ])('fails closed for %s', (_name, value, response) => {
    render(<MultipleChoiceRenderer {...props({ interaction: value, response })} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Unsupported choice/);
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
