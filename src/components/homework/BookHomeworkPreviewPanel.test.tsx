import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { BookRuntimeDeliveryProjection } from '../../services/book-delivery/bookDelivery.types';
import type { BookHomeworkScheduleDraft } from '../../services/book-homework/bookHomeworkPreview.service';
import BookHomeworkPreviewPanel from './BookHomeworkPreviewPanel';
import previewStyles from './BookHomeworkPreviewPanel.css?raw';

const delivery: BookRuntimeDeliveryProjection = {
  schemaVersion: 1,
  projectionKind: 'book-runtime-delivery',
  bindingId: 'binding-panel-1',
  bindingRevision: 1,
  recipientId: 'student-1',
  context: { contextId: 'homework-1', kind: 'homework', entitlementBasis: 'assignment' },
  book: {
    bookId: 'book-1',
    bookMode: 'pdf',
    bookRevision: 4,
    publicationId: 'publication-4',
    publicationRevision: 2,
    publicationStatus: 'published',
  },
  scope: { kind: 'subtree', nodeKeys: ['section-1', 'unit-1'], placementIds: ['placement-1'] },
  outline: [
    { nodeKey: 'section-1', parentNodeKey: null, nodeType: 'section', order: 1, titleSnapshot: 'Section 1' },
    { nodeKey: 'unit-1', parentNodeKey: 'section-1', nodeType: 'unit', order: 1, titleSnapshot: 'Unit 1' },
  ],
  sourceSet: {
    strategy: 'full_pdf',
    sources: [{
      sourceKey: 'full-pdf',
      sourceVersionId: 'source-v4',
      lifecycle: 'verified-usable',
      localPageScope: { kind: 'all', pages: [] },
    }],
  },
  documentRequests: [],
  activities: [{
    placementId: 'placement-1',
    activityId: 'activity-1',
    activityVersion: 1,
    activityVersionId: 'activity-1-v1',
    nodeKey: 'unit-1',
    order: 1,
    titleSnapshot: 'Activity 1',
    contextMode: 'none',
    sourceContext: { available: false, description: 'No source required.', pageGroupKeys: [], sourcePageScopes: [] },
  }],
  actionFlags: { canAutosave: false, canSubmit: true, canReview: false },
  provenance: {
    publicationId: 'publication-4',
    publicationRevision: 2,
    bindingId: 'binding-panel-1',
    bindingRevision: 1,
  },
};

const source = {
  delivery,
  identity: {
    manifestVersionId: 'manifest-v1',
    ownerId: 'teacher-1',
    createdByCommandId: 'command-1',
    createdAt: '2026-07-28T00:00:00.000Z',
    bindingRevision: 1,
  },
  bookTitle: 'Preview Book',
};

const renderScheduleEditor = ({ value, onChange }: {
  value: BookHomeworkScheduleDraft;
  onChange: (next: BookHomeworkScheduleDraft) => void;
}) => (
  <label>
    Due Date
    <input
      aria-label="Due Date"
      value={value.dueDate}
      onChange={(event) => onChange({ ...value, dueDate: event.target.value })}
    />
  </label>
);

const componentSource = {
  ...source,
  delivery: {
    ...delivery,
    sourceSet: {
      strategy: 'component_pdfs' as const,
      sources: [{
        sourceKey: 'component-unit-1',
        sourceVersionId: 'component-v1',
        lifecycle: 'verified-usable' as const,
        sourceOrder: 1,
        ownerNodeKey: 'unit-1',
        localPageScope: { kind: 'pages' as const, pages: [1, 2] },
      }],
    },
  },
};

describe('BookHomeworkPreviewPanel', () => {
  it('shows frozen facts, keeps confirm read-only, and hands off the draft', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const onAction = vi.fn();

    render(
      <BookHomeworkPreviewPanel
        source={source}
        renderScheduleEditor={renderScheduleEditor}
        onConfirm={onConfirm}
        onCancel={onCancel}
        onAction={onAction}
      />,
    );

    expect(screen.getByText('Preview Book')).toBeInTheDocument();
    expect(screen.getByText('Section 1')).toBeInTheDocument();
    expect(screen.getByText('Activity Version activity-1-v1')).toBeInTheDocument();
    expect(screen.getByText(/complete published PDF/i)).toBeInTheDocument();
    expect(screen.getByText(/creates no whole-Book attempt/i)).toBeInTheDocument();

    const confirm = screen.getByRole('button', { name: /confirm preview/i });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Due Date'), { target: { value: '2026-08-01T12:00' } });
    expect(confirm).toBeEnabled();

    fireEvent.click(screen.getByLabelText(/Practice/));
    expect(screen.getByLabelText(/Capture Book integrity signals/)).not.toBeChecked();
    fireEvent.click(screen.getByLabelText(/Capture Book integrity signals/));
    expect(screen.getByLabelText(/Capture Book integrity signals/)).toBeChecked();
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({
      manifest: { book: { publicationId: 'publication-4' } },
      policy: { intent: 'practice', integrityCapture: true, integrityOverride: true },
    });
    expect(onAction).toHaveBeenCalledWith('bookHomeworkPreviewConfirmed', expect.any(Object));

    fireEvent.click(screen.getByRole('button', { name: /cancel preview/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows exact component breadth and cancels without writing', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const onAction = vi.fn();

    render(
      <BookHomeworkPreviewPanel
        source={componentSource}
        renderScheduleEditor={renderScheduleEditor}
        onConfirm={onConfirm}
        onCancel={onCancel}
        onAction={onAction}
      />,
    );

    fireEvent.change(screen.getByLabelText('Assignment scope'), { target: { value: 'activity:placement-1' } });
    expect(await screen.findByText(/component-unit-1 is broader than the selected structural scope/i)).toBeInTheDocument();
    expect(screen.getByText('component-v1')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Due Date'), { target: { value: '2026-08-01T12:00' } });
    expect(screen.getByRole('button', { name: /confirm preview/i })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /cancel preview/i }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith('bookHomeworkPreviewCanceled', expect.any(Object));
  });

  it('offers fork-before-assign when prior results meet delayed feedback', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const onForkBeforeAssign = vi.fn();
    const onAction = vi.fn();

    render(
      <BookHomeworkPreviewPanel
        source={{ ...source, priorResultAccess: true, soloAccess: true }}
        renderScheduleEditor={renderScheduleEditor}
        onConfirm={onConfirm}
        onCancel={onCancel}
        onForkBeforeAssign={onForkBeforeAssign}
        onAction={onAction}
      />,
    );

    const fork = screen.getByRole('button', { name: /fork before assign/i });
    fireEvent.click(fork);

    expect(onForkBeforeAssign).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onAction).toHaveBeenCalledWith('bookHomeworkForkRequested', { reason: 'prior-feedback-risk' });
  });

  it('compiles nested schedule rules into the typed manifest handoff', () => {
    const onConfirm = vi.fn();
    render(
      <BookHomeworkPreviewPanel
        source={source}
        renderScheduleEditor={({ value, onChange }) => (
          <button
            type="button"
            onClick={() => onChange({
              ...value,
              dueDate: '2026-08-30T12:00',
              scheduleRules: [{
                nodeKey: 'unit-1',
                availableFrom: '2026-08-05T12:00',
                dueAt: '2026-08-20T12:00',
              }],
            })}
          >
            Apply nested schedule
          </button>
        )}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Apply nested schedule' }));
    fireEvent.click(screen.getByRole('button', { name: /confirm preview/i }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      manifest: expect.objectContaining({
        scheduleRules: [{
          nodeKey: 'unit-1',
          availableFrom: new Date('2026-08-05T12:00').toISOString(),
          dueAt: new Date('2026-08-20T12:00').toISOString(),
        }],
      }),
      deadlineMutationIntents: [],
    }));
  });

  it('resolves a unique Activity target without widening to whole-Book scope', () => {
    render(
      <BookHomeworkPreviewPanel
        source={{
          ...source,
          initialTarget: {
            kind: 'activity',
            bookId: 'book-1',
            activityId: 'activity-1',
          },
        }}
        renderScheduleEditor={renderScheduleEditor}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Assignment scope')).toHaveValue('activity:placement-1');
  });

  it('filters hidden rules and carries fail-closed mutation intent to the trusted handoff', () => {
    const onConfirm = vi.fn();
    render(
      <BookHomeworkPreviewPanel
        source={{
          ...source,
          initialSchedule: {
            availableFrom: '',
            dueDate: '2026-08-30T12:00',
            scheduleRules: [{
              nodeKey: 'outside-selected-scope',
              availableFrom: '',
              dueAt: '2026-08-20T12:00',
            }],
          },
        }}
        renderScheduleEditor={({ onIntent }) => (
          <button
            type="button"
            onClick={() => onIntent?.({
              kind: 'add',
              nodeKey: 'unit-1',
              nextDueAt: new Date('2026-08-20T12:00').toISOString(),
              affectedStudentStates: [],
              affectedStudentStateKnown: false,
              requiresTrustedDenial: true,
            })}
          >
            Record deadline intent
          </button>
        )}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Record deadline intent' }));
    fireEvent.click(screen.getByRole('button', { name: /confirm preview/i }));

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      manifest: expect.objectContaining({ scheduleRules: [] }),
      deadlineMutationIntents: [expect.objectContaining({
        kind: 'add',
        nodeKey: 'unit-1',
        affectedStudentStateKnown: false,
        requiresTrustedDenial: true,
      })],
    }));
  });

  it('announces unsupported-content blockers to assistive technology', () => {
    render(
      <BookHomeworkPreviewPanel
        source={{
          ...source,
          excludedActivities: [{
            placementId: 'placement-excluded',
            activityId: 'activity-excluded',
            nodeKey: 'unit-1',
            order: 3,
            contextMode: 'required',
            titleSnapshot: 'Unavailable Activity',
            reason: 'missing-source',
          }],
        }}
        renderScheduleEditor={renderScheduleEditor}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/cannot be delivered safely/i);
  });

  it('keeps native action controls focusable and resets local state after reload', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const view = render(
      <BookHomeworkPreviewPanel
        source={source}
        renderScheduleEditor={renderScheduleEditor}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    fireEvent.change(screen.getByLabelText('Due Date'), { target: { value: '2026-08-01T12:00' } });
    const confirm = screen.getByRole('button', { name: /confirm preview/i });
    confirm.focus();
    expect(confirm).toHaveAttribute('type', 'button');
    expect(document.activeElement).toBe(confirm);
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    const cancel = screen.getByRole('button', { name: /cancel preview/i });
    cancel.focus();
    expect(cancel).toHaveAttribute('type', 'button');
    expect(document.activeElement).toBe(cancel);
    await user.click(cancel);
    expect(onCancel).toHaveBeenCalledTimes(1);

    view.unmount();
    render(
      <BookHomeworkPreviewPanel
        source={source}
        renderScheduleEditor={renderScheduleEditor}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByLabelText('Due Date')).toHaveValue('');
  });

  it('keeps 44px targets and responsive layouts for 200% zoom and mobile widths', () => {
    expect(previewStyles).toMatch(/min-height:\s*44px/);
    expect(previewStyles).toMatch(
      /@media \(max-width: 700px\)[\s\S]*?book-homework-preview__activity-heading[\s\S]*?flex-direction:\s*column/,
    );
    expect(previewStyles).toMatch(
      /@media \(max-width: 560px\)[\s\S]*?book-homework-preview__activity-controls[\s\S]*?grid-template-columns:\s*1fr/,
    );
  });
});
