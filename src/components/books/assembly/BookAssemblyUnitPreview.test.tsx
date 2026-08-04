import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ActivityResponseCodec } from '../../../services/book-activity/runtime/activityResponseCodec.types';
import { createActivityRendererRegistry } from '../../../services/book-activity/runtime/activityRendererRegistry';
import { registerActivityRenderer, type ActivityRendererProps } from '../../../services/book-activity/runtime/activityRenderer.types';
import type { CandidateUnitPreviewProjection } from '../../../services/book-assembly/unitPreview.service';
import { BookAssemblyUnitPreview } from './BookAssemblyUnitPreview';

const codec: ActivityResponseCodec<string> = {
  maxSerializedBytes: 100,
  createEmpty: () => '', decode: (value) => typeof value === 'string'
    ? { valid: true, value, diagnostics: [] }
    : { valid: false, diagnostics: [{ code: 'malformed-response', path: '$', message: 'Expected text.' }] },
  validate: (value) => ({ valid: true, value, diagnostics: [] }), serialize: (value) => value,
  equals: (left, right) => left === right, toReviewProjection: (value) => ({ text: value }),
};
const Renderer = ({ response, onChange }: ActivityRendererProps<string>) => (
  <><p data-testid="preview-response">{response || 'empty'}</p><button type="button" onClick={() => onChange('draft')}>Draft answer</button></>
);
const registry = createActivityRendererRegistry([registerActivityRenderer({
  family: 'choice', variant: 'v1', presentationMode: 'structured', responseCodec: 'short-text-v1',
  rendererId: 'preview-choice', codecId: 'preview-short-text', renderer: Renderer, codec,
})]);
const preview = (revision = 1, sourceSetRevision = 2, registryVersion = 'registry-v1', unitKey = 'unit-1'): CandidateUnitPreviewProjection => ({
  bookId: 'book-1', candidateId: 'candidate-1', candidateRevision: revision, sourceSetRevision, unitKey, registryVersion,
  activities: [{ activityKey: 'activity-1', sourceContext: { available: true, description: 'Candidate source context: full page 2.' }, projection: {
    schemaVersion: 1, title: 'Choose', taskProfile: null, presentationMode: 'structured', contextRequirement: { mode: 'none', acceptedKinds: [] },
    instructions: [{ text: 'Read.' }], interaction: { family: 'choice', variant: 'v1' }, answerRule: { defaultPoints: 1, normalization: 'exact' },
    stimulus: null, assetRefs: [], interactions: [{ family: 'choice', interactionId: 'choice-1', prompt: 'Choose', options: [{ itemId: 'a', label: 'A' }] }],
    scoring: { mode: 'auto-where-possible', feedbackVisibility: 'none' },
  } }],
});

describe('BookAssemblyUnitPreview', () => {
  it('uses shared runtime frame while retaining answers only for current candidate identity', async () => {
    const user = userEvent.setup();
    const rendered = render(<BookAssemblyUnitPreview preview={preview()} registry={registry} />);
    expect(screen.getByRole('heading', { name: /candidate preview/i })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Preview answers stay in memory');
    await user.click(screen.getByRole('button', { name: 'Draft answer' }));
    expect(screen.getByTestId('preview-response')).toHaveTextContent('draft');
    rendered.rerender(<BookAssemblyUnitPreview preview={preview(2)} registry={registry} />);
    expect(screen.getByTestId('preview-response')).toHaveTextContent('empty');
    await user.click(screen.getByRole('button', { name: 'Draft answer' }));
    rendered.rerender(<BookAssemblyUnitPreview preview={preview(2, 3)} registry={registry} />);
    expect(screen.getByTestId('preview-response')).toHaveTextContent('empty');
    await user.click(screen.getByRole('button', { name: 'Draft answer' }));
    rendered.rerender(<BookAssemblyUnitPreview preview={preview(2, 3, 'registry-v2')} registry={registry} />);
    expect(screen.getByTestId('preview-response')).toHaveTextContent('empty');
    await user.click(screen.getByRole('button', { name: 'Draft answer' }));
    rendered.rerender(<BookAssemblyUnitPreview preview={preview(2, 3, 'registry-v2', 'unit-2')} registry={registry} />);
    expect(screen.getByTestId('preview-response')).toHaveTextContent('empty');
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
  });

  it('navigates only candidate Activities and fails closed for an unsupported registration', async () => {
    const user = userEvent.setup();
    const first = preview();
    const second = {
      ...first.activities[0]!,
      activityKey: 'activity-2',
      projection: {
        ...first.activities[0]!.projection,
        title: 'Second candidate Activity',
        instructions: [{ text: 'Second candidate instructions.' }],
        interactions: [{ ...first.activities[0]!.projection.interactions[0]!, interactionId: 'choice-2', prompt: 'Second candidate choice' }],
      },
    };
    render(<BookAssemblyUnitPreview preview={{ ...first, activities: [first.activities[0]!, second] }} registry={registry} />);
    await user.click(screen.getByRole('button', { name: 'Next preview activity' }));
    expect(screen.getByText('Second candidate instructions.')).toBeInTheDocument();

    const unsupported = {
      ...first,
      activities: [{
        ...first.activities[0]!,
        projection: { ...first.activities[0]!.projection, interaction: { family: 'choice' as const, variant: 'missing-v1' } },
      }],
    };
    render(<BookAssemblyUnitPreview preview={unsupported} registry={registry} />);
    expect(screen.getByText('Activity unavailable')).toBeInTheDocument();
  });

});
