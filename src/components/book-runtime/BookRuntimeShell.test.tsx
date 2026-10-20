import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import { BookRuntimeShell, type BookRuntimeViewerRenderInput } from './BookRuntimeShell';

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

const Renderer = ({ interaction, response, onChange, mode }: ActivityRendererProps<string>) => (
  <label>
    {interaction.prompt}
    <input aria-label={interaction.prompt} disabled={mode === 'read-only'} onChange={(event) => onChange(event.target.value)} value={response} />
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
    strategy: 'component_pdfs',
    sources: [],
  },
  pageGroups: [
    { pageGroupKey: 'group-1', combinedPhysicalPages: [2, 3] },
    { pageGroupKey: 'group-2', combinedPhysicalPages: [7] },
  ],
  documentRequests: [{ opaqueRouteKey: 'route-1', expectedByteLength: 100, expectedEtag: 'etag-1' }],
  activities: [
    { placementId: 'placement-1', activityId: 'activity-1', activityVersionId: 'activity-1-v1', activityVersion: 1, nodeKey: 'unit-1', order: 1, contextMode: 'none', sourceContext: { available: false, description: 'No source context.', pageGroupKeys: ['group-1'], sourcePageScopes: [] } },
    { placementId: 'placement-2', activityId: 'activity-2', activityVersionId: 'activity-2-v1', activityVersion: 1, nodeKey: 'unit-1', order: 2, contextMode: sourceAvailable ? 'required' : 'none', sourceContext: { available: sourceAvailable, description: sourceAvailable ? 'Page 3.' : '', pageGroupKeys: ['group-1'], sourcePageScopes: [] } },
    { placementId: 'placement-3', activityId: 'activity-3', activityVersionId: 'activity-3-v1', activityVersion: 1, nodeKey: 'unit-1', order: 3, contextMode: 'none', sourceContext: { available: false, description: 'No source context.', pageGroupKeys: ['group-2'], sourcePageScopes: [] } },
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
    { activityId: 'activity-1', activityVersionId: 'activity-1-v1', projection: projection(), label: 'First' },
    { activityId: 'activity-2', activityVersionId: 'activity-2-v1', projection: projection(), label: 'Second' },
    { activityId: 'activity-3', activityVersionId: 'activity-3-v1', projection: projection(), label: 'Third' },
  ],
  registry: registry(),
  viewer,
  responses: {},
  onResponseChange: vi.fn(),
  ...overrides,
});

describe('BookRuntimeShell', () => {
  it('defaults candidate previews to read-only and permits explicit temporary practice answers', async () => {
    const base = delivery();
    const candidate = { ...base, projectionKind: 'book-runtime-candidate-preview', candidateId: 'candidate-1', candidateRevision: 1, sourceSetRevision: 1, unitKey: 'unit-1', context: { contextId: 'candidate-1', kind: 'preview', entitlementBasis: 'candidate-preview' }, actionFlags: { canAutosave: false, canSubmit: false, canReview: false } };
    const onResponseChange = vi.fn();
    const props = shellProps({ deliveryProjection: candidate, onResponseChange });
    const { rerender } = render(<BookRuntimeShell {...props} />);
    expect(screen.getAllByRole('textbox')[0]).toBeDisabled();
    expect(screen.getByText('Read-only preview')).toBeVisible();
    rerender(<BookRuntimeShell {...props} responseMode="editable" />);
    expect(screen.getAllByRole('textbox')[0]).toBeEnabled();
    await userEvent.setup().type(screen.getAllByRole('textbox')[0], 'A');
    expect(onResponseChange).toHaveBeenCalledWith('interaction-1', 'A');
    expect(screen.getByText('Practice preview · answers are temporary')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Submit/ })).not.toBeInTheDocument();
  });

  it('retains independent drafts and flags for two placements of the same immutable Activity', async () => {
    const user = userEvent.setup();
    const base = delivery();
    const first = base.activities[0];
    const repeated = { ...base, activities: [first, { ...first, placementId: 'repeated', order: 2 }] };
    const props = shellProps({ deliveryProjection: repeated, activities: [shellProps().activities[0]],
      renderActivity: (activity: { placement: { placementId: string } }, tools: (id: string, index: number) => React.ReactNode) => <>
        <input aria-label={activity.placement.placementId} defaultValue="" />{tools('interaction-1', 0)}
      </> });
    const { rerender } = render(<BookRuntimeShell {...props} />);
    await user.type(screen.getByRole('textbox', { name: 'placement-1' }), 'first draft');
    await user.type(screen.getByRole('textbox', { name: 'repeated' }), 'second draft');
    const flags = screen.getAllByRole('button', { name: 'Flag question 1' });
    await waitFor(() => expect(flags[0]).toBeEnabled());
    await user.click(flags[0]);
    expect(flags[0]).toHaveAttribute('aria-pressed', 'true');
    expect(flags[1]).toHaveAttribute('aria-pressed', 'false');
    rerender(<BookRuntimeShell {...props} deliveryProjection={{ ...repeated, bindingRevision: 2 }} />);
    expect(screen.getByRole('textbox', { name: 'placement-1' })).toHaveValue('first draft');
    expect(screen.getByRole('textbox', { name: 'repeated' })).toHaveValue('second draft');
    expect(screen.getAllByRole('button', { name: 'Flag question 1' })[0]).toHaveAttribute('aria-pressed', 'true');
    rerender(<BookRuntimeShell {...props} deliveryProjection={{ ...repeated, context: { ...repeated.context, contextId: 'new-context' } }} />);
    expect(screen.getByRole('textbox', { name: 'placement-1' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'repeated' })).toHaveValue('');
  });

  it('rejects missing or contradictory immutable version pins', () => {
    const props = shellProps();
    const { rerender } = render(<BookRuntimeShell {...props} activities={props.activities.map((activity) => ({ ...activity, activityVersionId: undefined }))} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Activity projections do not match');
    rerender(<BookRuntimeShell {...props} activities={props.activities.map((activity) => ({ ...activity,
      projection: { ...activity.projection, activityVersionId: 'wrong-version', activityVersion: 1 },
    }))} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Activity projections do not match');
  });

  it('mounts only successful-page Activities, retains visited work, and expands reference-only pages', async () => {
    const inputs: BookRuntimeViewerRenderInput[] = [];
    const renderActivity = vi.fn((activity: { activityId: string }) => <input aria-label={activity.activityId} defaultValue="retained" />);
    const base = delivery();
    render(<BookRuntimeShell {...shellProps({ deliveryProjection: { ...base, pageGroups: [...base.pageGroups!, { pageGroupKey: 'reference', combinedPhysicalPages: [9] }] },
      renderActivity, viewer: { ...viewer, reportsPageReady: true, render: (input: BookRuntimeViewerRenderInput) => { inputs.push(input); return <div>PDF</div>; } } })} />);
    expect(renderActivity).not.toHaveBeenCalled();
    act(() => inputs.at(-1)!.onPageReady?.(2));
    expect(screen.getByRole('textbox', { name: 'activity-1' })).toHaveValue('retained');
    expect(screen.queryByRole('textbox', { name: 'activity-3' })).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'activity-1' }), { target: { value: 'local answer' } });
    act(() => inputs.at(-1)!.onPageChange?.(7));
    await waitFor(() => expect(inputs.at(-1)!.combinedPhysicalPage).toBe(7));
    expect(screen.getByRole('textbox', { name: 'activity-1' })).toHaveValue('local answer');
    expect(screen.queryByRole('textbox', { name: 'activity-3' })).toBeNull();
    act(() => inputs.at(-1)!.onPageReady?.(7));
    expect(screen.getByRole('textbox', { name: 'activity-3' })).toBeInTheDocument();
    expect(document.querySelector('[data-book-activity*="activity-1"] input')).toHaveValue('local answer');
    act(() => inputs.at(-1)!.onPageChange?.(9));
    await waitFor(() => expect(inputs.at(-1)!.combinedPhysicalPage).toBe(9));
    act(() => inputs.at(-1)!.onPageReady?.(9));
    expect(screen.getByTestId('book-runtime-shell')).toHaveAttribute('data-reference-only', 'true');
    expect(screen.getByRole('tab', { hidden: true, name: 'Activity' })).toBeDisabled();
    expect(document.querySelectorAll('[data-book-activity]')).toHaveLength(3);
  });

  it('focuses and flags exact questions without changing the PDF page and supports keyboard resizing', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const renderViewer = vi.fn(() => <div>PDF</div>);
    render(<BookRuntimeShell {...shellProps({ onAction, viewer: { ...viewer, render: renderViewer } })} />);
    await user.click(screen.getByRole('button', { name: /^Second, question 1, unanswered/u }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getAllByRole('textbox', { name: 'Choose an answer.' })[1]));
    expect(renderViewer).toHaveBeenLastCalledWith(expect.objectContaining({ combinedPhysicalPage: 2 }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Flag question 1' })[1]).toBeEnabled());
    await user.click(screen.getAllByRole('button', { name: 'Flag question 1' })[1]);
    expect(screen.getByRole('button', { name: 'Second, question 1, unanswered, flagged' })).toHaveAttribute('data-flagged', 'true');
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' });
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '48');
    expect(onAction).toHaveBeenCalledWith('bookRuntimeQuestionFocused', { activityId: 'activity-2', runtimeKey: JSON.stringify(['placement-2', 'activity-2', 'activity-2-v1']), interactionId: 'interaction-1' });
  });
  it('passes through the single canonical full-PDF request for Delivery and preview without fabricating byte length', () => {
    const request = { sourceKey: 'pdf', sourceVersionId: 'source-1', opaqueRouteKey: 'legacy-route', localPageScope: { kind: 'all' as const, pages: [] } };
    const renderViewer = vi.fn(() => <div>Full PDF</div>);
    const fullPdf = {
      ...delivery(),
      sourceSet: { strategy: 'full_pdf' as const, sources: [{ sourceKey: 'pdf', sourceVersionId: 'source-1', lifecycle: 'verified-usable' as const, localPageScope: request.localPageScope }] },
      documentRequests: [request],
    };
    const { rerender } = render(<BookRuntimeShell {...shellProps({ deliveryProjection: fullPdf, viewer: { ...viewer, render: renderViewer } })} />);
    expect(renderViewer).toHaveBeenCalledWith(expect.objectContaining({ request }));
    expect(renderViewer.mock.lastCall?.[0].request).not.toHaveProperty('expectedByteLength');
    rerender(<BookRuntimeShell {...shellProps({ deliveryProjection: { ...fullPdf, projectionKind: 'book-runtime-candidate-preview', candidateId: 'candidate-1', candidateRevision: 1, sourceSetRevision: 1, unitKey: 'unit-1', context: { contextId: 'candidate-1', kind: 'preview', entitlementBasis: 'candidate-preview' }, actionFlags: { canAutosave: false, canSubmit: false, canReview: false } }, viewer: { ...viewer, render: renderViewer } })} />);
    expect(screen.getByTestId('book-runtime-shell')).toBeInTheDocument();
    expect(renderViewer).toHaveBeenLastCalledWith(expect.objectContaining({ request }));
  });

  it('rejects multiple requests and source requests on a component projection', () => {
    const base = delivery();
    const sourceRequest = { sourceKey: 'pdf', sourceVersionId: 'source-1', opaqueRouteKey: 'legacy-route', localPageScope: { kind: 'all' as const, pages: [] } };
    const { rerender } = render(<BookRuntimeShell {...shellProps({ deliveryProjection: { ...base, documentRequests: [...base.documentRequests, sourceRequest] } })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Book document context is unavailable');
    rerender(<BookRuntimeShell {...shellProps({ deliveryProjection: { ...base, documentRequests: [sourceRequest] } })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Book document context is unavailable');
  });
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
        frozenPoliciesByPlacementId: { 'placement-1': policy, 'placement-2': policy },
        captureSlotsByPlacementId: {
          'placement-1': { captureSlotId: 'book-integrity-slot-v1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', captureAttemptNumber: 1 },
          'placement-2': { captureSlotId: 'book-integrity-slot-v1-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', captureAttemptNumber: 1 },
        },
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
    fireEvent.click(screen.getByRole('button', { name: /^Second, question 1, unanswered/u }));
    fireEvent.paste(document);
    await waitFor(() => expect(requests.filter((request) => request.signal === 'paste')).toHaveLength(2));
    expect(requests.filter((request) => request.signal === 'paste')[1].target.placementId).toBe('placement-2');
    expect(requests.some((request) => request.signal === 'route_reload_close')).toBe(false);
  });

  it('stacks mapped Activities in projection order, focuses PDF, and preserves response callbacks', async () => {
    const user = userEvent.setup();
    const flush = vi.fn();
    const onResponseChange = vi.fn();
    render(<BookRuntimeShell {...shellProps({ onFlushBeforeNavigate: flush, onResponseChange })} />);

    expect(screen.getByRole('heading', { name: 'First' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Second' })).toBeInTheDocument();
    expect(screen.getAllByRole('article').map((card) => within(card).getByRole('heading', { level: 3 }).textContent)).toEqual(['First', 'Second']);

    fireEvent.change(screen.getAllByRole('textbox', { name: 'Choose an answer.' })[0], { target: { value: 'local' } });
    expect(onResponseChange).toHaveBeenCalledWith('interaction-1', 'local');

    await user.click(screen.getByRole('button', { name: 'Only book' }));
    expect(screen.getByTestId('book-runtime-shell')).toHaveAttribute('data-desktop-view', 'pdf-focus');
    await user.click(screen.getByRole('button', { name: 'Restore Activities' }));
    expect(screen.getByTestId('book-runtime-shell')).toHaveAttribute('data-desktop-view', 'split');
  });

  it('uses declared Page Groups instead of structural node keys and reaches every group for one Activity', async () => {
    const user = userEvent.setup();
    const renderViewer = vi.fn(() => <div>PDF</div>);
    const base = delivery();
    render(<BookRuntimeShell {...shellProps({
      deliveryProjection: {
        ...base,
        activities: base.activities.map((placement, index) => index === 0
          ? { ...placement, nodeKey: 'unit-1', sourceContext: { ...placement.sourceContext, pageGroupKeys: ['group-1', 'group-2'] } }
          : placement),
      },
      viewer: { ...viewer, render: renderViewer },
    })} />);

    expect(renderViewer).toHaveBeenLastCalledWith(expect.objectContaining({ pageGroupKey: 'group-1' }));
    expect(renderViewer).not.toHaveBeenCalledWith(expect.objectContaining({ pageGroupKey: 'unit-1' }));
    await user.click(screen.getByText('Pages'));
    await user.click(screen.getByRole('button', { name: 'Page Group 2 · 7' }));
    await waitFor(() => expect(renderViewer).toHaveBeenLastCalledWith(expect.objectContaining({
      activeActivityId: 'activity-1',
      pageGroupKey: 'group-2',
      combinedPhysicalPage: 7,
    })));
    fireEvent.click(screen.getByRole('button', { name: 'First, question 1, unanswered' }));
    await waitFor(() => expect(renderViewer).toHaveBeenLastCalledWith(expect.objectContaining({
      activeActivityId: 'activity-1',
      pageGroupKey: 'group-2',
      combinedPhysicalPage: 7,
    })));
  });

  it('keeps a context-none Activity with no declared Page Groups reachable across the safe map', async () => {
    const user = userEvent.setup();
    const renderViewer = vi.fn(() => <div>PDF</div>);
    const base = delivery();
    render(<BookRuntimeShell {...shellProps({
      deliveryProjection: {
        ...base,
        activities: base.activities.map((placement, index) => index === 0
          ? { ...placement, nodeKey: 'unit-1', contextMode: 'none' as const, sourceContext: { ...placement.sourceContext, pageGroupKeys: [] } }
          : placement),
      },
      viewer: { ...viewer, render: renderViewer },
    })} />);

    expect(screen.getByRole('heading', { name: 'First' })).toBeInTheDocument();
    expect(renderViewer).toHaveBeenLastCalledWith(expect.objectContaining({ activeActivityId: 'activity-1', pageGroupKey: 'group-1' }));
    await user.click(screen.getByText('Pages'));
    await user.click(screen.getByRole('button', { name: 'Page Group 2 · 7' }));
    await waitFor(() => expect(renderViewer).toHaveBeenLastCalledWith(expect.objectContaining({
      activeActivityId: 'activity-1',
      pageGroupKey: 'group-2',
      combinedPhysicalPage: 7,
    })));
    expect(renderViewer).not.toHaveBeenCalledWith(expect.objectContaining({ pageGroupKey: 'unit-1' }));
  });

  it('renders one source-free combined document request and navigates only its Page Group pages', async () => {
    const renderViewer = vi.fn(() => <div>Combined PDF</div>);
    const flush = vi.fn();
    render(<BookRuntimeShell {...shellProps({ viewer: { ...viewer, render: renderViewer }, onFlushBeforeNavigate: flush })} />);
    expect(renderViewer).toHaveBeenCalledWith(expect.objectContaining({
      pageGroupKey: 'group-1',
      combinedPhysicalPage: 2,
      request: { opaqueRouteKey: 'route-1', expectedByteLength: 100, expectedEtag: 'etag-1' },
    }));
    fireEvent.click(screen.getByText('Pages'));
    fireEvent.click(screen.getByRole('button', { name: 'Page Group 2 · 7' }));
    await waitFor(() => expect(renderViewer).toHaveBeenLastCalledWith(expect.objectContaining({ combinedPhysicalPage: 7 })));
    expect(flush).toHaveBeenCalledWith('page-group-selected', expect.objectContaining({ combinedPhysicalPage: 2 }));
    expect(screen.queryByTestId('book-runtime-component-selector')).not.toBeInTheDocument();
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
        { activityId: 'activity-1', activityVersionId: 'activity-1-v1', projection: longProjection, label: 'Draft' },
        { activityId: 'activity-2', activityVersionId: 'activity-2-v1', projection: projection(), label: 'Other' },
        { activityId: 'activity-3', activityVersionId: 'activity-3-v1', projection: projection(), label: 'Third' },
      ],
      responses: { 'interaction-1': 'answer' },
    })} />);
    expect(screen.queryByText('Submitted for review')).toBeNull();

    rerender(<BookRuntimeShell {...shellProps({
      registry: longRegistry,
      activities: [
        { activityId: 'activity-1', activityVersionId: 'activity-1-v1', projection: longProjection, label: 'Draft' },
        { activityId: 'activity-2', activityVersionId: 'activity-2-v1', projection: projection(), label: 'Other' },
        { activityId: 'activity-3', activityVersionId: 'activity-3-v1', projection: projection(), label: 'Third' },
      ],
      responses: { 'long-1': '   ' },
    })} />);
    expect(screen.queryByText('Submitted for review')).toBeNull();

    rerender(<BookRuntimeShell {...shellProps({
      registry: longRegistry,
      activities: [
        { activityId: 'activity-1', activityVersionId: 'activity-1-v1', projection: longProjection, label: 'Draft' },
        { activityId: 'activity-2', activityVersionId: 'activity-2-v1', projection: projection(), label: 'Other' },
        { activityId: 'activity-3', activityVersionId: 'activity-3-v1', projection: projection(), label: 'Third' },
      ],
      responses: { 'long-1': 'draft' },
      activitySummaries: { [JSON.stringify(['placement-1', 'activity-1', 'activity-1-v1'])]: { answered: ['long-1'], status: 'saved', dirty: false, submitted: true, reviewRequired: true, captureActive: false } },
    })} />);
    expect(screen.getByText('Submitted for review')).toBeInTheDocument();
  });

  it('exposes mobile tabs and fail-closed unsupported registry state', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<BookRuntimeShell {...shellProps({ registry: createActivityRendererRegistry([]) })} />);
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent('Activity unavailable');
    unmount();

    render(<BookRuntimeShell {...shellProps()} />);
    await user.click(screen.getByRole('tab', { hidden: true, name: 'Activity' }));
    expect(screen.getByRole('tab', { hidden: true, name: 'Activity' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('navigation', { name: 'Activity and question navigator' })).toBeInTheDocument();
  });

  it('blocks source-assisted response rendering when the Delivery source context is missing', () => {
    render(
      <BookRuntimeShell
        {...shellProps({
          activities: [
            { activityId: 'activity-1', activityVersionId: 'activity-1-v1', projection: projection(true), label: 'Missing source' },
            { activityId: 'activity-2', activityVersionId: 'activity-2-v1', projection: projection(true), label: 'Second' },
            { activityId: 'activity-3', activityVersionId: 'activity-3-v1', projection: projection(true), label: 'Third' },
          ],
          deliveryProjection: delivery(false),
          registry: registry(true),
        })}
      />,
    );
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent('Required source context is unavailable.');
  });

  it('composes optional personal timer UI without changing runtime response state', () => {
    const onResponseChange = vi.fn();
    render(<BookRuntimeShell {...shellProps({
      onResponseChange,
      personalTimer: <span data-testid="personal-timer-slot">Personal timer</span>,
    })} />);

    expect(screen.getByTestId('personal-timer-slot')).toBeInTheDocument();
    fireEvent.change(screen.getAllByRole('textbox', { name: 'Choose an answer.' })[0], { target: { value: 'answer' } });
    expect(onResponseChange).toHaveBeenCalledWith('interaction-1', 'answer');
  });
});
