import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ActivityResponseCodec } from '../../services/book-activity/runtime/activityResponseCodec.types';
import { createActivityRendererRegistry } from '../../services/book-activity/runtime/activityRendererRegistry';
import {
  registerActivityRenderer,
  type ActivityRendererProps,
} from '../../services/book-activity/runtime/activityRenderer.types';
import { BookRuntimeFrame } from './BookRuntimeFrame';

const projection = {
  schemaVersion: 1,
  title: 'Choose one',
  taskProfile: null,
  presentationMode: 'structured' as const,
  contextRequirement: { mode: 'none' as const, acceptedKinds: [] },
  instructions: [{ text: 'Read the prompt once.' }],
  interaction: { family: 'choice' as const, variant: 'v1' },
  answerRule: { defaultPoints: 1, normalization: 'exact' as const },
  stimulus: null,
  assetRefs: [],
  interactions: [{
    interactionId: 'interaction-1',
    family: 'choice' as const,
    prompt: 'Choose one.',
    options: [{ itemId: 'a', label: 'A' }],
  }],
  scoring: { mode: 'auto-where-possible' as const, feedbackVisibility: 'none' as const },
};

const codec: ActivityResponseCodec<string> = {
  maxSerializedBytes: 100,
  createEmpty: () => '',
  decode: (value) => typeof value === 'string'
    ? { valid: true, value, diagnostics: [] }
    : { valid: false, diagnostics: [{ code: 'malformed-response', path: '$', message: 'Expected text.' }] },
  validate: (value) => ({ valid: true, value, diagnostics: [] }),
  serialize: (value) => value,
  equals: (left, right) => left === right,
  toReviewProjection: (value) => ({ text: value }),
};

const Renderer = ({ interaction }: ActivityRendererProps<string>) => <p>{interaction.prompt}</p>;

describe('BookRuntimeFrame', () => {
  it('renders instructions once and exposes labelled previous/next navigation', () => {
    const previous = vi.fn();
    const next = vi.fn();
    const registry = createActivityRendererRegistry([registerActivityRenderer({
      family: 'choice', variant: 'v1', presentationMode: 'structured', responseCodec: 'short-text-v1',
      rendererId: 'test-choice-v1', codecId: 'test-short-text-v1', renderer: Renderer, codec,
    })]);
    render(
      <BookRuntimeFrame
        registry={registry}
        viewModel={{
          title: 'Book Unit',
          activity: {
            projection,
            context: { surface: 'student-runtime', mode: 'editable' },
            responses: {},
            validationByInteractionId: {},
            onResponseChange: () => undefined,
          },
          previous: { label: 'Previous activity', onActivate: previous },
          next: { label: 'Next activity', onActivate: next },
        }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Book Unit' })).toBeInTheDocument();
    expect(screen.getByLabelText('Activity instructions')).toHaveTextContent('Read the prompt once.');
    expect(screen.getAllByText('Read the prompt once.')).toHaveLength(1);
    expect(screen.getByRole('navigation', { name: 'Book activity navigation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous activity' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next activity' })).toBeEnabled();
  });
});
