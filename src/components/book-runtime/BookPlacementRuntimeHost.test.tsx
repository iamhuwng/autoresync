import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, Suspense, useState } from 'react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookRuntimeDeliveryProjection } from '../../services/book-delivery/bookDelivery.types';
import type { BookRuntimeShellActivity, BookRuntimeShellProps } from './BookRuntimeShell';
import { BookPlacementRuntimeHost } from './BookPlacementRuntimeHost';

const {
  navigateToMock,
  onActionMock,
  runtimeChangeMock,
  runtimeFlushMock,
  runtimeSubmitMock,
  runtimeTerminalState,
  runtimeResponsesState,
  runtimeHookOptionsMock,
  shellMock,
} = vi.hoisted(() => ({
  navigateToMock: vi.fn(),
  onActionMock: vi.fn(),
  runtimeChangeMock: vi.fn(() => true),
  runtimeFlushMock: vi.fn(async () => ({ status: 'saved', safeToLeave: true })),
  runtimeSubmitMock: vi.fn(async () => ({ resultStatus: 'submitted' })),
  runtimeTerminalState: {
    current: null as { resultStatus: 'pending_review' | 'submitted' } | null,
    status: 'confirmed-absent' as 'unknown' | 'unavailable' | 'confirmed-absent' | 'confirmed-present',
  },
  runtimeResponsesState: { current: {} as Readonly<Record<string, unknown>> },
  runtimeHookOptionsMock: vi.fn(),
  shellMock: vi.fn(),
}));

vi.mock('../../hooks/useNavigation', () => ({
  useNavigation: () => ({ navigateTo: navigateToMock }),
}));

vi.mock('../../services/book-activity/activityRuntime.browser', () => ({
  createBookRuntimeClient: () => ({}),
}));

vi.mock('../../hooks/book-runtime/useBookActivityRuntime', () => ({
  useBookActivityRuntime: (options: unknown) => {
    runtimeHookOptionsMock(options);
    return ({
    responses: runtimeResponsesState.current,
    status: 'idle',
    message: '',
    isDirty: false,
    conflict: null,
    change: runtimeChangeMock,
    flush: runtimeFlushMock,
    retry: vi.fn(),
    reload: vi.fn(),
    discardLocal: vi.fn(),
    submitActivity: runtimeSubmitMock,
    terminalResult: runtimeTerminalState.current,
    terminalReadStatus: runtimeTerminalState.current ? 'confirmed-present' : runtimeTerminalState.status,
    terminalReadResultStatus: runtimeTerminalState.current?.resultStatus ?? null,
  });
  },
}));

vi.mock('./BookRuntimeViewerAdapter', () => ({
  createBookRuntimeViewerAdapter: (options: { readonly onRouteExpired?: (reason: 'stale-binding') => void }) => ({
    title: 'Book',
    render: () => <button type="button" onClick={() => options.onRouteExpired?.('stale-binding')}>Expire viewer route</button>,
  }),
}));

vi.mock('../modern', () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

vi.mock('./BookRuntimeShell', () => ({
  BookRuntimeShell: (props: BookRuntimeShellProps) => {
    const [viewState, setViewState] = useState('page-1-fit-width');
    const [activityId, setActivityId] = useState(props.activities[0]?.activityId ?? '');
    shellMock(props);
    return <div data-testid="standalone-book-runtime-shell">
      <span data-testid="runtime-view-state">{viewState}</span>
      <span data-testid="runtime-activity-state">{activityId}</span>
      <button type="button" onClick={() => setViewState('page-2-zoom-125')}>Change viewer state</button>
      <button type="button" onClick={() => setActivityId(props.activities[1]?.activityId ?? activityId)}>Select second Activity</button>
      {props.viewer.render({})}
      {props.activities.filter((item, index) => index === 0 || item.activityId === activityId).map((activity) => <div key={activity.activityId}>
        {props.renderActivity?.({ ...activity,
          placement: props.deliveryProjection.activities.find((item) => item.activityId === activity.activityId)!,
          runtimeKey: JSON.stringify([props.deliveryProjection.activities.find((item) => item.activityId === activity.activityId)!.placementId,
            activity.activityId, activity.activityVersionId]),
          pageGroupKeys: [], label: activity.label ?? 'Activity',
        }, () => null)}
      </div>)}
    </div>;
  },
}));

const projection = {
  schemaVersion: 1,
  projectionKind: 'book-runtime-delivery',
  bindingId: 'binding-1',
  bindingRevision: 2,
  recipientId: 'student-1',
  context: { contextId: 'course-material-1', kind: 'course', entitlementBasis: 'enrollment' },
  book: {
    bookId: 'book-1', bookMode: 'pdf', bookRevision: 1,
    publicationId: 'publication-1', publicationRevision: 1, publicationStatus: 'published',
  },
  scope: { kind: 'subtree', nodeKeys: ['unit-1'], placementIds: ['placement-1'] },
  outline: [],
  sourceSet: { strategy: 'full_pdf', sources: [] },
  documentRequests: [],
  activities: [{
    placementId: 'placement-1', activityId: 'activity-1', activityVersion: 1,
    activityVersionId: 'activity-1-v1', nodeKey: 'unit-1', order: 1,
    contextMode: 'none', sourceContext: { available: false, description: 'No source.', pageGroupKeys: [], sourcePageScopes: [] },
  }],
  actionFlags: { canAutosave: true, canSubmit: true, canReview: false },
  provenance: { publicationId: 'publication-1', publicationRevision: 1, bindingId: 'binding-1', bindingRevision: 2 },
} as unknown as BookRuntimeDeliveryProjection;

const studentActivity = (interactionId: string) => ({
  schemaVersion: 1, title: 'Activity', taskProfile: null, presentationMode: 'structured',
  contextRequirement: { mode: 'none', acceptedKinds: [] }, instructions: [],
  interaction: { family: 'choice', variant: 'v1' }, answerRule: { defaultPoints: 1, normalization: 'exact' },
  stimulus: null, assetRefs: [], interactions: [{ interactionId, family: 'choice', prompt: 'Choose an answer.', options: [{ itemId: 'A', label: 'A' }] }],
  scoring: { mode: 'auto-where-possible', feedbackVisibility: 'none' },
});

const SuspendAfterHost = ({ suspend }: { readonly suspend: boolean }) => {
  if (suspend) throw new Promise<never>(() => undefined);
  return null;
};

describe('BookPlacementRuntimeHost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeTerminalState.current = null;
    runtimeTerminalState.status = 'confirmed-absent';
    runtimeResponsesState.current = {};
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    HTMLDialogElement.prototype.close = function () { this.open = false; };
  });

  it('loads the exact Delivery Activity pins once and renders a standalone shell', async () => {
    const activities: readonly BookRuntimeShellActivity[] = [{
      activityId: 'activity-1', activityVersionId: 'activity-1-v1', projection: {},
    }];
    const readActivities = vi.fn(async () => activities);
    const { rerender } = render(
      <BookPlacementRuntimeHost
        activityClient={{ readActivities }}
        projection={projection}
        viewer={{ title: 'Book', render: () => null }}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('standalone-book-runtime-shell')).toBeInTheDocument());
    expect(readActivities).toHaveBeenCalledTimes(1);
    expect(readActivities).toHaveBeenCalledWith({
      bindingId: 'binding-1',
      bindingRevision: 2,
      contextId: 'course-material-1',
      recipientId: 'student-1',
      activityPins: [{ activityId: 'activity-1', activityVersionId: 'activity-1-v1' }],
    });
    expect(shellMock).toHaveBeenCalledWith(expect.objectContaining({ activities }));

    rerender(
      <BookPlacementRuntimeHost
        activityClient={{ readActivities }}
        onAction={onActionMock}
        projection={projection}
        viewer={{ title: 'Book', render: () => null }}
      />,
    );
    expect(readActivities).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('student-layout')).not.toBeInTheDocument();
  });

  it('shows bounded loading errors and returns through the navigation abstraction', async () => {
    const user = userEvent.setup();
    const readActivities = vi.fn(async () => { throw new Error('provider objectKey at https://private.example/route'); });
    render(
      <BookPlacementRuntimeHost
        activityClient={{ readActivities }}
        onAction={onActionMock}
        projection={projection}
        viewer={{ title: 'Book', render: () => null }}
      />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Book Activities could not be loaded. Please retry or return.');
    expect(document.body).not.toHaveTextContent('provider');
    expect(document.body).not.toHaveTextContent('objectKey');
    expect(document.body).not.toHaveTextContent('private.example');
    await user.click(screen.getByRole('button', { name: 'Return' }));
    expect(onActionMock).toHaveBeenCalledWith('bookRuntimeReturn', expect.objectContaining({
      surface: 'course',
      contextId: 'course-material-1',
      bindingId: 'binding-1',
      outcome: 'returned',
    }));
    expect(navigateToMock).toHaveBeenCalledWith('STUDENT_COURSES', undefined, expect.objectContaining({ reason: 'book_runtime_return' }));
  });

  it('preserves unchanged-pin response, selected Activity, and viewer state after an abandoned StrictMode replacement render', async () => {
    const order: string[] = [];
    runtimeResponsesState.current = { 'interaction-1': { value: 'dirty answer' } };
    runtimeFlushMock.mockImplementation(async () => {
      order.push('flush');
      return { status: 'saved', safeToLeave: true };
    });
    const readActivities = vi.fn(async () => [{
      activityId: 'activity-1', activityVersionId: 'activity-1-v1',
      projection: studentActivity('interaction-1'),
    }, {
      activityId: 'activity-2', activityVersionId: 'activity-2-v1',
      projection: studentActivity('interaction-2'),
    }]);
    const onProjectionExpired = vi.fn(async () => { order.push('refresh'); });
    const soloProjection = {
      ...projection,
      context: { contextId: 'solo-1', kind: 'solo', entitlementBasis: 'solo' },
      activities: [projection.activities[0], {
        ...projection.activities[0], placementId: 'placement-2', activityId: 'activity-2',
        activityVersionId: 'activity-2-v1', order: 2,
      }],
    } as unknown as BookRuntimeDeliveryProjection;
    const user = userEvent.setup();
    const { rerender } = render(
      <StrictMode>
        <Suspense fallback={<div>Replacing Book authority</div>}>
          <BookPlacementRuntimeHost
            activityClient={{ readActivities }}
            onProjectionExpired={onProjectionExpired}
            projection={soloProjection}
          />
          <SuspendAfterHost suspend={false} />
        </Suspense>
      </StrictMode>,
    );

    await screen.findByTestId('standalone-book-runtime-shell');
    const initialActivityReads = readActivities.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Change viewer state' }));
    await user.click(screen.getByRole('button', { name: 'Select second Activity' }));
    await user.click(screen.getByRole('button', { name: 'Expire viewer route' }));
    await waitFor(() => expect(onProjectionExpired).toHaveBeenCalledTimes(1));
    expect(order).toEqual(['flush', 'flush', 'refresh']);

    rerender(
      <StrictMode>
        <Suspense fallback={<div>Replacing Book authority</div>}>
          <BookPlacementRuntimeHost
            activityClient={{ readActivities }}
            onProjectionExpired={onProjectionExpired}
            projection={{ ...soloProjection, bindingId: 'binding-2', bindingRevision: 3 }}
          />
          <SuspendAfterHost suspend />
        </Suspense>
      </StrictMode>,
    );
    expect(screen.getByTestId('runtime-view-state')).toHaveTextContent('page-2-zoom-125');

    rerender(
      <StrictMode>
        <Suspense fallback={<div>Replacing Book authority</div>}>
          <BookPlacementRuntimeHost
            activityClient={{ readActivities }}
            onProjectionExpired={onProjectionExpired}
            projection={{ ...soloProjection, bindingId: 'binding-2', bindingRevision: 3 }}
          />
          <SuspendAfterHost suspend={false} />
        </Suspense>
      </StrictMode>,
    );

    expect(screen.getByTestId('runtime-view-state')).toHaveTextContent('page-2-zoom-125');
    expect(screen.getByTestId('runtime-activity-state')).toHaveTextContent('activity-2');
    expect(readActivities).toHaveBeenCalledTimes(initialActivityReads);
    expect(runtimeHookOptionsMock.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({
      initialResponses: { 'interaction-1': { value: 'dirty answer' } },
    }));
  });

  it('wires the existing persistent runtime and submit command for Homework', async () => {
    const user = userEvent.setup();
    const homeworkProjection = {
      ...projection,
      bindingId: 'assignment-1',
      context: { contextId: 'assignment-1', kind: 'homework', entitlementBasis: 'assignment' },
      activities: [{
        ...projection.activities[0],
        scheduleWindow: { permissions: { canAutosave: true, canSubmit: true, canReview: false } },
      }],
    } as unknown as BookRuntimeDeliveryProjection;
    const activities: readonly BookRuntimeShellActivity[] = [{
      activityId: 'activity-1',
      activityVersionId: 'activity-1-v1',
      projection: studentActivity('interaction-1'),
    }];
    const readHomeworkActivities = vi.fn(async () => activities);

    render(
      <BookPlacementRuntimeHost
        activityClient={{ readActivities: vi.fn(), readHomeworkActivities }}
        onAction={onActionMock}
        projection={homeworkProjection}
        viewer={{ title: 'Book', render: () => null }}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('book-runtime-submit')).toBeEnabled());
    expect(readHomeworkActivities).toHaveBeenCalledWith({
      assignmentId: 'assignment-1',
      placements: [{
        placementId: 'placement-1',
        activityId: 'activity-1',
        activityVersionId: 'activity-1-v1',
      }],
    });
    fireEvent.click(screen.getByRole('radio', { name: 'A' }));
    expect(runtimeChangeMock).toHaveBeenCalledWith('interaction-1', { interactionId: 'interaction-1', selectedOptionId: 'A' });

    await user.click(screen.getByRole('button', { name: 'Submit Activity' }));
    expect(runtimeSubmitMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirm submission' }));
    expect(runtimeSubmitMock).toHaveBeenCalledWith('interaction-1');
    expect(onActionMock).toHaveBeenCalledWith('bookRuntimeSubmitActivity', { activityId: 'activity-1' });
  });

  it('uses the shared persistent runtime for Solo without a Homework schedule', async () => {
    const soloProjection = {
      ...projection,
      context: { contextId: 'solo-1', kind: 'solo', entitlementBasis: 'solo' },
    } as unknown as BookRuntimeDeliveryProjection;
    const readActivities = vi.fn(async () => [{
      activityId: 'activity-1', activityVersionId: 'activity-1-v1',
      projection: studentActivity('interaction-1'),
    }]);

    render(
      <BookPlacementRuntimeHost
        activityClient={{ readActivities }}
        projection={soloProjection}
        viewer={{ title: 'Book', render: () => null }}
      />,
    );

    expect(await screen.findByTestId('book-runtime-submit')).toBeEnabled();
    expect(readActivities).toHaveBeenCalledWith(expect.objectContaining({ contextId: 'solo-1' }));
    expect(shellMock.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({
      renderActivity: expect.any(Function),
    }));
  });

  it('disables submit when the runtime restores a completed terminal', async () => {
    runtimeTerminalState.current = { resultStatus: 'submitted' };
    const homeworkProjection = {
      ...projection,
      bindingId: 'assignment-1',
      context: { contextId: 'assignment-1', kind: 'homework', entitlementBasis: 'assignment' },
      activities: [{
        ...projection.activities[0],
        scheduleWindow: { permissions: { canAutosave: true, canSubmit: true, canReview: false } },
      }],
    } as unknown as BookRuntimeDeliveryProjection;
    const activities: readonly BookRuntimeShellActivity[] = [{
      activityId: 'activity-1',
      activityVersionId: 'activity-1-v1',
      projection: studentActivity('interaction-1'),
    }];

    render(
      <BookPlacementRuntimeHost
        activityClient={{ readActivities: vi.fn(), readHomeworkActivities: vi.fn(async () => activities) }}
        projection={homeworkProjection}
        viewer={{ title: 'Book', render: () => null }}
      />,
    );

    const submit = await screen.findByTestId('book-runtime-submit');
    expect(submit).toBeDisabled();
    expect(submit).toHaveTextContent('Activity submitted');
  });

  it('counts a restored long-response submission wire answer as answered', async () => {
    runtimeTerminalState.current = { resultStatus: 'submitted' };
    runtimeResponsesState.current = { 'interaction-1': [{ interactionId: 'interaction-1', answer: 'The source supports this interpretation.' }] };
    const activity = {
      ...studentActivity('interaction-1'),
      interaction: { family: 'long-response', variant: 'v1' },
      interactions: [{ interactionId: 'interaction-1', family: 'long-response', prompt: 'Explain the source.' }],
      scoring: { mode: 'review-required', feedbackVisibility: 'after-review' },
    };
    render(<BookPlacementRuntimeHost projection={projection}
      activityClient={{ readActivities: vi.fn(async () => [{ activityId: 'activity-1', activityVersionId: 'activity-1-v1', projection: activity }]) }}
      viewer={{ title: 'Book', render: () => null }} />);
    expect(await screen.findByDisplayValue('The source supports this interpretation.')).toBeInTheDocument();
    expect(screen.getByText(/1 of 1 answered/)).toBeInTheDocument();
    await waitFor(() => expect(shellMock.mock.calls.at(-1)?.[0].activitySummaries[JSON.stringify(['placement-1', 'activity-1', 'activity-1-v1'])].answered).toEqual(['interaction-1']));
    expect(runtimeSubmitMock).not.toHaveBeenCalled();
  });

  it('keeps submit disabled while terminal status is unknown', async () => {
    runtimeTerminalState.status = 'unknown';
    const homeworkProjection = {
      ...projection,
      bindingId: 'assignment-1',
      context: { contextId: 'assignment-1', kind: 'homework', entitlementBasis: 'assignment' },
      activities: [{
        ...projection.activities[0],
        scheduleWindow: { permissions: { canAutosave: true, canSubmit: true, canReview: false } },
      }],
    } as unknown as BookRuntimeDeliveryProjection;

    render(
      <BookPlacementRuntimeHost
        activityClient={{ readActivities: vi.fn(), readHomeworkActivities: vi.fn(async () => [{
          activityId: 'activity-1',
          activityVersionId: 'activity-1-v1',
          projection: studentActivity('interaction-1'),
        }]) }}
        projection={homeworkProjection}
        viewer={{ title: 'Book', render: () => null }}
      />,
    );

    expect(await screen.findByTestId('book-runtime-submit')).toBeDisabled();
  });
});
