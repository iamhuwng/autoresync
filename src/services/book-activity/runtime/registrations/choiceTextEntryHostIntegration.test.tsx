import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActivityRendererHost } from '../../../../components/book-runtime/interactions/ActivityRendererHost';
import { bookActivityRendererRegistry } from '../activityRendererRegistry';

const projection = {
  schemaVersion: 1,
  title: 'Sentence completion',
  taskProfile: {
    taxonomyId: 'ielts-reading',
    typeId: 'sentence-completion',
    taxonomyVersion: 1,
  },
  presentationMode: 'structured',
  contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] },
  instructions: [{ text: 'Complete the sentence.' }],
  interaction: { family: 'text-entry', variant: 'inline-blank' },
  answerRule: { defaultPoints: 1, normalization: 'trim-case-and-spacing' },
  stimulus: { kind: 'embedded-text', text: 'The answer is ____.' },
  assetRefs: [],
  interactions: [{
    interactionId: 'text-1',
    family: 'text-entry',
    prompt: 'Complete the sentence.',
  }],
  scoring: { mode: 'auto-where-possible', feedbackVisibility: 'none' },
};

describe('Ticket #38 host integration', () => {
  it('applies shared answer-rule case/whitespace normalization before render and serialization', () => {
    const onResponseChange = vi.fn();
    render(
      <ActivityRendererHost
        context={{
          surface: 'student-runtime',
          mode: 'editable',
          sourceContext: { available: true, description: 'Book page 3.' },
        }}
        onResponseChange={onResponseChange}
        projection={projection}
        registry={bookActivityRendererRegistry}
        responses={{
          'text-1': {
            interactionId: 'text-1',
            text: '  Mixed   CASE  ',
          },
        }}
        validationByInteractionId={{}}
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Complete the sentence.' });
    expect(input).toHaveValue('mixed case');
    fireEvent.change(input, { target: { value: '  Next   ANSWER  ' } });
    expect(onResponseChange).toHaveBeenCalledWith(
      'text-1',
      { interactionId: 'text-1', text: 'next answer' },
    );
  });
});
