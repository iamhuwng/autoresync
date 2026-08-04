import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActivityResponseCodec } from '../../services/book-activity/runtime/activityResponseCodec.types';
import { createActivityRendererRegistry } from '../../services/book-activity/runtime/activityRendererRegistry';
import {
  registerActivityRenderer,
  type ActivityRendererProps,
} from '../../services/book-activity/runtime/activityRenderer.types';
import { createDefaultBookIntegrityPolicy } from '../../services/book-activity/bookIntegrityCapture.service';
import type {
  BookIntegritySignalRequest,
} from '../../services/book-activity/bookIntegrityCapture.types';
import type { BookRuntimeDeliveryProjection } from '../../services/book-delivery/bookDelivery.types';
import { BookRuntimeShell } from './BookRuntimeShell';

afterEach(cleanup);

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

const Renderer = ({ interaction, response, onChange }: ActivityRendererProps<string>) => (
  <label>
    {interaction.prompt}
    <input aria-label={interaction.prompt} onChange={(event) => onChange(event.target.value)} value={response} />
  </label>
);

const registry = (sourceAssisted = false) => createActivityRendererRegistry([registerActivityRenderer({
  family: 'choice',
  variant: 'v1',
  presentationMode: sourceAssisted ? 'source-assisted' : 'structured',
  responseCodec: 'test-text-v1',
  rendererId: 'test-choice-v1',
  codecId: 'test-text-v1',
  renderer: Renderer,
  codec,
})]);

const projection = (sourceAssisted = false) => ({
  schemaVersion: 1,
  title: 'Activity',
  taskProfile: null,
  presentationMode: sourceAssisted ? 'source-assisted' as const : 'structured' as const,
  contextRequirement: sourceAssisted
    ? { mode: 'required' as const, acceptedKinds: ['book-pages'] }
    : { mode: 'none' as const, acceptedKinds: [] },
  instructions: [{ text: 'Answer once.' }],
  interaction: { family: 'choice' as const, variant: 'v1' },
  answerRule: { defaultPoints: 1, normalization: 'exact' as const },
  stimulus: null,
  assetRefs: [],
  interactions: [{
    interactionId: 'interaction-1',
    family: 'choice' as const,
    prompt: 'Choose an answer.',
    options: [{ itemId: 'a', label: 'A' }],
    ...(sourceAssisted ? {
      sourceAssisted: {
        questionLabel: '1.1',
        accessiblePrompt: 'Choose answer for question 1.1.',
        responseShape: 'single-choice',
        sourceExerciseLabel: 'Exercise 1',
      },
    } : {}),
  }],
  scoring: { mode: 'auto-where-possible' as const, feedbackVisibility: 'none' as const },
});

const delivery = (sourceAvailable = false): BookRuntimeDeliveryProjection => ({
  schemaVersion: 1,
  projectionKind: 'book-runtime-delivery',
  bindingId: 'binding-1',
  bindingRevision: 1,
  recipientId: 'student-1',
  context: { contextId: 'context-1', kind: 'homework', entitlementBasis: 'assignment' },
  book: {
    bookId: 'book-1',
    bookMode: 'pdf',
    bookRevision: 1,
    publicationId: 'publication-1',
    publicationRevision: 1,
    publicationStatus: 'published',
  },
  scope: { kind: 'subtree', nodeKeys: ['group-1', 'group-2'], placementIds: ['placement-1', 'placement-2', 'placement-3'] },
  sourceSet: {
    strategy: 'full_pdf',
    sources: [{ sourceKey: 'pdf', sourceVersionId: 'source-1', lifecycle: 'verified-usable', localPageScope: { kind: 'all', pages: [] } }],
  },
  documentRequests: [{ sourceKey: 'pdf', sourceVersionId: 'source-1', opaqueRouteKey: 'route-1', localPageScope: { kind: 'all', pages: [] } }],
  activities: [
    { placementId: 'placement-1', activityId: 'activity-1', activityVersion: 1, nodeKey: 'group-1', order: 1, contextMode: 'none', sourceContext: { available: false, description: 'No source context.', sourcePageScopes: [] } },
    { placementId: 'placement-2', activityId: 'activity-2', activityVersion: 1, nodeKey: 'group-1', order: 2, contextMode: sourceAvailable ? 'required' : 'none', sourceContext: { available: sourceAvailable, description: sourceAvailable ? 'Page 3.' : '', sourcePageScopes: [] } },
    { placementId: 'placement-3', activityId: 'activity-3', activityVersion: 1, nodeKey: 'group-2', order: 3, contextMode: 'none', sourceContext: { available: false, description: 'No source context.', sourcePageScopes: [] } },
  ],
  actionFlags: { canAutosave: true, canSubmit: true, canReview: false },
  provenance: { publicationId: 'publication-1', publicationRevision: 1, bindingId: 'binding-1', bindingRevision: 1 },
});

const viewer = {
  title: 'PDF reference',
  status: { state: 'ready' as const, message: 'Ready.' },
  render: ({ pageGroupKey }: { pageGroupKey: string }) => <div>PDF {pageGroupKey}</div>,
};

const shellProps = (overrides: Record<string, unknown> = {}) => ({
  deliveryProjection: delivery(),
  activities: [
    { activityId: 'activity-1', projection: projection(), label: 'First' },
    { activityId: 'activity-2', projection: projection(), label: 'Second' },
    { activityId: 'activity-3', projection: projection(), label: 'Third' },
  ],
  registry: registry(),
  viewer,
  responses: {},
  onResponseChange: vi.fn(),
  ...overrides,
});

describe('BookRuntimeShell', () => {
  it('derives the exact active placement through the dedicated integrity seam', async () => {
    const requests: BookIntegritySignalRequest[] = [];
    const policy = createDefaultBookIntegrityPolicy('accountable', {
      policyId: 'policy-1',
      policyRevision: 1,
    });
    render(<BookRuntimeShell {...shellProps({
      integrityCapture: {
        client: {
          recordSignal: async (request: BookIntegritySignalRequest) => {
            requests.push(request);
            return request.signal === 'concurrent_attempt'
              ? {
                  status: 'ignored' as const,
                  signal: request.signal,
                  reason: 'not_concurrent' as const,
                  recordedEventCount: 0,
                }
              : {
                  status: 'recorded' as const,
                  eventId: 'integrity-v1-0000000000000000000000000000000000000001',
                  signal: request.signal,
                  recordedAt: '2026-08-02T00:00:00.000Z',
                  recordedEventCount: 1,
                };
          },
        },
        frozenPoliciesByPlacementId: { 'placement-1': policy },
        enabled: true,
        active: true,
        onWarning: vi.fn(),
      },
    })} />);

    fireEvent.paste(document);
    await waitFor(() => expect(requests.some((request) => request.signal === 'paste')).toBe(true));
    expect(requests.find((request) => request.signal === 'paste')?.target).toEqual({
      bookId: 'book-1',
      bindingId: 'binding-1',
      bindingRevision: 1,
      contextKind: 'homework',
      contextId: 'context-1',
      placementId: 'placement-1',
      activityId: 'activity-1',
      activityVersion: 1,
    });
    expect(screen.getByTestId('book-integrity-protected-content')).toBeInTheDocument();
  });

  it('keeps projection order, navigates groups, focuses PDF, and preserves response callbacks', async () => {
    const user = userEvent.setup();
    const flush = vi.fn();
    const onResponseChange = vi.fn();
    render(<BookRuntimeShell {...shellProps({ onFlushBeforeNavigate: flush, onResponseChange })} />);

    expect(screen.getByRole('heading', { name: 'First' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page Group 1' })).toHaveAttribute('aria-current', 'page');
    await user.click(screen.getByRole('button', { name: 'Next Activity' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Second' })).toBeInTheDocument());
    expect(flush).toHaveBeenCalledWith('next-activity', expect.objectContaining({ activityId: 'activity-1' }));

    fireEvent.change(screen.getByRole('textbox', { name: 'Choose an answer.' }), { target: { value: 'local' } });
    expect(onResponseChange).toHaveBeenCalledWith('interaction-1', 'local');

    await user.click(screen.getByRole('button', { name: 'Focus PDF' }));
    expect(screen.getByTestId('book-runtime-shell')).toHaveAttribute('data-desktop-view', 'pdf-focus');
    expect(screen.getByRole('button', { name: 'Restore split view' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Restore split view' }));
    expect(screen.getByTestId('book-runtime-shell')).toHaveAttribute('data-desktop-view', 'split');
  });

  it('does not show pending review for another Activity or an empty response', () => {
    const longProjection = {
      ...projection(),
      interaction: { family: 'long-response' as const, variant: 'v1' },
      interactions: [{ interactionId: 'long-1', family: 'long-response' as const, prompt: 'Draft.' }],
      scoring: { mode: 'review-required' as const, feedbackVisibility: 'after-review' as const },
    };
    const longRegistry = createActivityRendererRegistry([registerActivityRenderer({
      family: 'long-response',
      variant: 'v1',
      presentationMode: 'structured',
      responseCodec: 'test-text-v1',
      rendererId: 'test-long-v1',
      codecId: 'test-text-v1',
      renderer: Renderer,
      codec,
    })]);

    const { rerender } = render(<BookRuntimeShell {...shellProps({
      registry: longRegistry,
      activities: [
        { activityId: 'activity-1', projection: longProjection, label: 'Draft' },
        { activityId: 'activity-2', projection: projection(), label: 'Other' },
        { activityId: 'activity-3', projection: projection(), label: 'Third' },
      ],
      responses: { 'interaction-1': 'answer' },
    })} />);
    expect(screen.queryByRole('status')).toBeNull();

    rerender(<BookRuntimeShell {...shellProps({
      registry: longRegistry,
      activities: [
        { activityId: 'activity-1', projection: longProjection, label: 'Draft' },
        { activityId: 'activity-2', projection: projection(), label: 'Other' },
        { activityId: 'activity-3', projection: projection(), label: 'Third' },
      ],
      responses: { 'long-1': '   ' },
    })} />);
    expect(screen.queryByRole('status')).toBeNull();

    rerender(<BookRuntimeShell {...shellProps({
      registry: longRegistry,
      activities: [
        { activityId: 'activity-1', projection: longProjection, label: 'Draft' },
        { activityId: 'activity-2', projection: projection(), label: 'Other' },
        { activityId: 'activity-3', projection: projection(), label: 'Third' },
      ],
      responses: { 'long-1': 'draft' },
    })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Pending review');
  });

  it('exposes mobile tabs and fail-closed unsupported registry state', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<BookRuntimeShell {...shellProps({ registry: createActivityRendererRegistry([]) })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Activity unavailable');
    unmount();

    render(<BookRuntimeShell {...shellProps()} />);
    await user.click(screen.getByRole('tab', { hidden: true, name: 'Activity' }));
    expect(screen.getByRole('tab', { hidden: true, name: 'Activity' })).toHaveAttribute('aria-selected', 'true');
    expect(document.querySelector('nav[aria-label="Activities in this Page Group"]')).toBeInTheDocument();
  });

  it('blocks source-assisted response rendering when the Delivery source context is missing', () => {
    render(
      <BookRuntimeShell
        {...shellProps({
          activities: [
            { activityId: 'activity-1', projection: projection(true), label: 'Missing source' },
            { activityId: 'activity-2', projection: projection(true), label: 'Second' },
            { activityId: 'activity-3', projection: projection(true), label: 'Third' },
          ],
          deliveryProjection: delivery(false),
          registry: registry(true),
        })}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Required source context is unavailable.');
  });

  it('composes optional personal timer UI without changing runtime response state', () => {
    const onResponseChange = vi.fn();
    render(<BookRuntimeShell {...shellProps({
      onResponseChange,
      personalTimer: <span data-testid="personal-timer-slot">Personal timer</span>,
    })} />);

    expect(screen.getByTestId('personal-timer-slot')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Choose an answer.' }), { target: { value: 'answer' } });
    expect(onResponseChange).toHaveBeenCalledWith('interaction-1', 'answer');
  });
});
