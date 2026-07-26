import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ActivityResponseCodec } from '../../../services/book-activity/runtime/activityResponseCodec.types';
import { createActivityRendererRegistry } from '../../../services/book-activity/runtime/activityRendererRegistry';
import {
  registerActivityRenderer,
  type ActivityRendererProps,
} from '../../../services/book-activity/runtime/activityRenderer.types';
import { ActivityRendererHost } from './ActivityRendererHost';

const projection = {
  schemaVersion: 1,
  title: 'Choose one',
  taskProfile: null,
  presentationMode: 'source-assisted' as const,
  contextRequirement: { mode: 'required' as const, acceptedKinds: ['book-pages'] },
  instructions: [{ text: 'Choose.' }],
  interaction: { family: 'choice' as const, variant: 'v1' },
  answerRule: { defaultPoints: 1, normalization: 'exact' as const },
  stimulus: null,
  assetRefs: [],
  interactions: [{
    interactionId: 'interaction-1',
    family: 'choice' as const,
    prompt: 'Choose one.',
    options: [{ itemId: 'a', label: 'A' }],
    sourceAssisted: {
      questionLabel: '1.1',
      accessiblePrompt: 'Choose answer for question 1.1.',
      responseShape: 'single-choice',
      sourceExerciseLabel: 'Exercise 1',
    },
  }],
  scoring: { mode: 'auto-where-possible' as const, feedbackVisibility: 'none' as const },
};

const codec: ActivityResponseCodec<string> = {
  maxSerializedBytes: 100,
  createEmpty: () => '',
  decode: (input) => typeof input === 'string'
    ? { valid: true, value: input, diagnostics: [] }
    : { valid: false, diagnostics: [{ code: 'malformed-response', path: '$', message: 'Expected text.' }] },
  validate: (value) => value.length <= 8
    ? { valid: true, value, diagnostics: [] }
    : { valid: false, diagnostics: [{ code: 'response-too-large', path: '$', message: 'Response too long.' }] },
  serialize: (value) => value.trim(),
  equals: (left, right) => left === right,
  toReviewProjection: (value) => ({ text: value }),
};

const AccessibleRenderer = ({ interaction, mode, sourceContext, response, onChange }: ActivityRendererProps<string>) => (
  <section aria-describedby="source-context" aria-label={interaction.prompt} aria-readonly={mode !== 'editable'}>
    <p id="source-context">{sourceContext?.description}</p>
    <output>{response}</output>
    <button onClick={() => onChange(' answer ')} type="button">Change response</button>
    <button onClick={() => onChange('x'.repeat(9))} type="button">Invalid response</button>
  </section>
);

const registry = () => createActivityRendererRegistry([registerActivityRenderer({
  family: 'choice', variant: 'v1', presentationMode: 'source-assisted', responseCodec: 'short-text-v1',
  rendererId: 'accessible-choice-v1', codecId: 'short-text-v1', renderer: AccessibleRenderer, codec,
})]);

describe('ActivityRendererHost accessibility and codec boundary', () => {
  it('labels and focuses structural unsupported fallback', async () => {
    const onResponseChange = vi.fn();
    const { rerender } = render(
      <ActivityRendererHost
        context={{ surface: 'student-runtime', mode: 'editable' }}
        onResponseChange={onResponseChange}
        projection={{ ...projection, interaction: { family: 'choice', variant: 'missing' } }}
        registry={createActivityRendererRegistry([])}
        responses={{}}
        validationByInteractionId={{}}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(screen.getByRole('heading', { name: 'Activity unavailable' })).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(alert));

    rerender(
      <ActivityRendererHost
        context={{ surface: 'student-runtime', mode: 'editable', sourceContext: { available: true, description: 'PDF page 3.' } }}
        onResponseChange={onResponseChange}
        projection={{ ...projection }}
        registry={registry()}
        responses={{}}
        validationByInteractionId={{}}
      />,
    );
    expect(screen.queryByRole('heading', { name: 'Activity unavailable' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change response' })).toBeInTheDocument();
  });

  it('decodes and validates state before renderer, then serializes only valid editable changes', async () => {
    const onResponseChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <ActivityRendererHost
        context={{ surface: 'student-runtime', mode: 'editable', sourceContext: { available: true, description: 'PDF page 3, Exercise 1, question 1.1.' } }}
        onResponseChange={onResponseChange}
        projection={{ ...projection }}
        registry={registry()}
        responses={{ 'interaction-1': 'saved' }}
        validationByInteractionId={{}}
      />,
    );
    expect(screen.getByText('saved')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Change response' }));
    expect(onResponseChange).toHaveBeenCalledWith('interaction-1', 'answer');
    await user.click(screen.getByRole('button', { name: 'Invalid response' }));
    expect(onResponseChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Response too long.');
    expect(screen.getByRole('button', { name: 'Change response' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Change response' }));
    expect(onResponseChange).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Invalid response' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Response too long.');
    rerender(
      <ActivityRendererHost
        context={{ surface: 'student-runtime', mode: 'editable', sourceContext: { available: true, description: 'PDF page 4, Exercise 2.' } }}
        onResponseChange={onResponseChange}
        projection={{ ...projection, title: 'Next activity' }}
        registry={registry()}
        responses={{ 'interaction-1': 'next' }}
        validationByInteractionId={{}}
      />,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('next')).toBeInTheDocument();

    rerender(
      <ActivityRendererHost
        context={{ surface: 'student-runtime', mode: 'editable', sourceContext: { available: true, description: 'PDF page 3, Exercise 1, question 1.1.' } }}
        onResponseChange={onResponseChange}
        projection={{ ...projection }}
        registry={registry()}
        responses={{ 'interaction-1': 42 }}
        validationByInteractionId={{}}
      />,
    );
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Expected text.'));
  });

  it('passes read-only source correspondence and never invokes callback in review mode', async () => {
    const onResponseChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ActivityRendererHost
        context={{ surface: 'result-review', mode: 'review', sourceContext: { available: true, description: 'PDF page 3, Exercise 1, question 1.1.' } }}
        onResponseChange={onResponseChange}
        projection={projection}
        registry={registry()}
        responses={{ 'interaction-1': '' }}
        validationByInteractionId={{}}
      />,
    );
    expect(screen.getByLabelText('Choose one.')).toHaveAttribute('aria-readonly', 'true');
    expect(screen.getByText('PDF page 3, Exercise 1, question 1.1.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Change response' }));
    expect(onResponseChange).not.toHaveBeenCalled();
  });
});
