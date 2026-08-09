import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookRuntimeDeliveryProjection } from '../../services/book-delivery/bookDelivery.types';
import type { BookRuntimeShellActivity } from './BookRuntimeShell';
import { BookPlacementRuntimeHost } from './BookPlacementRuntimeHost';

const { navigateToMock, onActionMock, shellMock } = vi.hoisted(() => ({
  navigateToMock: vi.fn(),
  onActionMock: vi.fn(),
  shellMock: vi.fn(),
}));

vi.mock('../../hooks/useNavigation', () => ({
  useNavigation: () => ({ navigateTo: navigateToMock }),
}));

vi.mock('./BookRuntimeShell', () => ({
  BookRuntimeShell: (props: { activities: readonly BookRuntimeShellActivity[] }) => {
    shellMock(props);
    return <div data-testid="standalone-book-runtime-shell" />;
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

describe('BookPlacementRuntimeHost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    const readActivities = vi.fn(async () => { throw new Error('launch failed'); });
    render(
      <BookPlacementRuntimeHost
        activityClient={{ readActivities }}
        onAction={onActionMock}
        projection={projection}
        viewer={{ title: 'Book', render: () => null }}
      />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('launch failed');
    await user.click(screen.getByRole('button', { name: 'Return' }));
    expect(onActionMock).toHaveBeenCalledWith('bookRuntimeReturn', expect.objectContaining({
      surface: 'course',
      contextId: 'course-material-1',
      bindingId: 'binding-1',
      outcome: 'returned',
    }));
    expect(navigateToMock).toHaveBeenCalledWith('STUDENT_COURSES', undefined, expect.objectContaining({ reason: 'book_runtime_return' }));
  });
});
