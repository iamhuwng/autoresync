import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BookResultAttemptDetail,
  BookResultAttemptSummary,
  BookResultGroupSummary,
} from '../../services/book-activity/results/bookResult.types';
import {
  BookResultBrowserError,
  createBookResultRouteHandle,
  type BookResultBrowserClient,
} from '../../services/bookResult.browser';
import {
  BookResultAdapter,
  resetBookResultAdapterCacheForTests,
} from './BookResultAdapter';

vi.mock('../../hooks/useFeatureTracking', () => ({
  useFeatureTracking: () => ({ trackAction: vi.fn() }),
}));

vi.mock('../layout/StudentLayout', () => ({
  StudentLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="student-layout">{children}</div>
  ),
}));

vi.mock('../layout/StudentSidebar', () => ({
  StudentSidebar: () => <div data-testid="student-sidebar" />,
}));

vi.mock('./BookGroupedResultView', () => ({
  BookGroupedResultView: ({
    group,
    selectedAttemptId,
    detail,
    refreshing,
    onAttemptChange,
  }: {
    group: BookResultGroupSummary;
    selectedAttemptId: string;
    detail: BookResultAttemptDetail | null;
    refreshing: boolean;
    onAttemptChange: (attemptId: string) => void;
  }) => (
    <div data-testid="grouped-result">
      <span>{`${group.groupKey}:${selectedAttemptId}:${detail?.resultId ?? 'no-detail'}`}</span>
      {refreshing && <span>refreshing</span>}
      <button type="button" onClick={() => onAttemptChange('attempt-1')}>Choose first</button>
    </div>
  ),
}));

const routeAddress = {
  bookId: 'book-1',
  studentId: 'student-1',
  groupKey: 'g_WyJzdHVkZW50LTEiLCJhY3Rpdml0eS0xIl0',
} as const;
const routeHandle = createBookResultRouteHandle(routeAddress);

const attempt = (
  attemptId: string,
  resultId: string,
  attemptNumber: number,
): BookResultAttemptSummary => ({
  attemptId,
  resultId,
  attemptNumber,
  studentId: 'student-1',
  recipientId: 'student-1',
  activityId: 'activity-1',
  submittedAt: `2026-07-${29 + attemptNumber}T00:00:00.000Z`,
} as BookResultAttemptSummary);

const latest = attempt('attempt-2', 'result-2', 2);
const first = attempt('attempt-1', 'result-1', 1);
const group = {
  groupKey: routeAddress.groupKey,
  studentId: 'student-1',
  recipientId: 'student-1',
  activityId: 'activity-1',
  attemptCount: 2,
  attempts: [latest, first],
  contexts: [],
  latestAttemptId: 'attempt-2',
} as BookResultGroupSummary;

const detail = (summary: BookResultAttemptSummary): BookResultAttemptDetail => ({
  ...summary,
  response: { submitted: true },
} as BookResultAttemptDetail);

const client = (): BookResultBrowserClient => ({
  readGroup: vi.fn(async () => group),
  readDetail: vi.fn(async (_address, resultId) => (
    detail(resultId === 'result-2' ? latest : first)
  )),
});

describe('BookResultAdapter', () => {
  beforeEach(() => {
    resetBookResultAdapterCacheForTests();
  });

  it('loads one grouped summary and only the selected detail in the student shell', async () => {
    const resultClient = client();
    render(
      <BookResultAdapter
        routeHandle={routeHandle}
        viewerRole="student"
        viewerId="student-1"
        client={resultClient}
      />,
    );

    expect(screen.getByTestId('student-layout')).toBeInTheDocument();
    await screen.findByText(`${routeAddress.groupKey}:attempt-2:result-2`);
    expect(resultClient.readGroup).toHaveBeenCalledTimes(1);
    expect(resultClient.readDetail).toHaveBeenCalledTimes(1);
    expect(resultClient.readDetail).toHaveBeenCalledWith(routeAddress, 'result-2');
  });

  it('loads exactly one new detail when attempt identity changes', async () => {
    const resultClient = client();
    render(
      <BookResultAdapter
        routeHandle={routeHandle}
        viewerRole="teacher"
        viewerId="teacher-1"
        client={resultClient}
      />,
    );
    await screen.findByText(`${routeAddress.groupKey}:attempt-2:result-2`);

    fireEvent.click(screen.getByRole('button', { name: 'Choose first' }));
    await screen.findByText(`${routeAddress.groupKey}:attempt-1:result-1`);
    expect(resultClient.readDetail).toHaveBeenCalledTimes(2);
    expect(resultClient.readDetail).toHaveBeenLastCalledWith(routeAddress, 'result-1');
  });

  it('retains cached content while revalidating on revisit', async () => {
    const firstClient = client();
    const firstRender = render(
      <BookResultAdapter
        routeHandle={routeHandle}
        viewerRole="teacher"
        viewerId="teacher-1"
        client={firstClient}
      />,
    );
    await screen.findByText(`${routeAddress.groupKey}:attempt-2:result-2`);
    firstRender.unmount();

    let resolveGroup: ((value: BookResultGroupSummary) => void) | undefined;
    let resolveDetail: ((value: BookResultAttemptDetail) => void) | undefined;
    const refreshClient: BookResultBrowserClient = {
      readGroup: vi.fn(() => new Promise((resolve) => { resolveGroup = resolve; })),
      readDetail: vi.fn(() => new Promise((resolve) => { resolveDetail = resolve; })),
    };
    render(
      <BookResultAdapter
        routeHandle={routeHandle}
        viewerRole="teacher"
        viewerId="teacher-1"
        client={refreshClient}
      />,
    );

    expect(screen.getByText(`${routeAddress.groupKey}:attempt-2:result-2`)).toBeInTheDocument();
    expect(screen.getByText('refreshing')).toBeInTheDocument();
    resolveGroup?.(group);
    resolveDetail?.(detail(latest));
    await waitFor(() => expect(refreshClient.readGroup).toHaveBeenCalledTimes(1));
  });

  it('rejects a cross-student route before making any read', () => {
    const resultClient = client();
    render(
      <BookResultAdapter
        routeHandle={routeHandle}
        viewerRole="student"
        viewerId="student-2"
        client={resultClient}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('do not have access');
    expect(resultClient.readGroup).not.toHaveBeenCalled();
    expect(resultClient.readDetail).not.toHaveBeenCalled();
  });

  it('does not share cached result content across viewers', async () => {
    const firstClient = client();
    const firstRender = render(
      <BookResultAdapter
        routeHandle={routeHandle}
        viewerRole="student"
        viewerId="student-1"
        client={firstClient}
      />,
    );
    await screen.findByText(`${routeAddress.groupKey}:attempt-2:result-2`);
    firstRender.unmount();

    const deniedClient: BookResultBrowserClient = {
      readGroup: vi.fn(async () => {
        throw new BookResultBrowserError('forbidden', 403);
      }),
      readDetail: vi.fn(),
    };
    render(
      <BookResultAdapter
        routeHandle={routeHandle}
        viewerRole="teacher"
        viewerId="teacher-2"
        client={deniedClient}
      />,
    );

    expect(screen.queryByTestId('grouped-result')).not.toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('do not have access');
    expect(deniedClient.readDetail).not.toHaveBeenCalled();
  });

  it('remounts viewer-scoped state when the authenticated viewer changes', async () => {
    const firstClient = client();
    const rendered = render(
      <BookResultAdapter
        routeHandle={routeHandle}
        viewerRole="student"
        viewerId="student-1"
        client={firstClient}
      />,
    );
    await screen.findByText(`${routeAddress.groupKey}:attempt-2:result-2`);

    const deniedClient: BookResultBrowserClient = {
      readGroup: vi.fn(async () => {
        throw new BookResultBrowserError('forbidden', 403);
      }),
      readDetail: vi.fn(),
    };
    rendered.rerender(
      <BookResultAdapter
        routeHandle={routeHandle}
        viewerRole="teacher"
        viewerId="teacher-2"
        client={deniedClient}
      />,
    );

    expect(screen.queryByTestId('grouped-result')).not.toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('do not have access');
  });

  it('evicts same-viewer cached content when revalidation loses authority', async () => {
    const firstClient = client();
    const firstRender = render(
      <BookResultAdapter
        routeHandle={routeHandle}
        viewerRole="teacher"
        viewerId="teacher-1"
        client={firstClient}
      />,
    );
    await screen.findByText(`${routeAddress.groupKey}:attempt-2:result-2`);
    firstRender.unmount();

    const deniedClient: BookResultBrowserClient = {
      readGroup: vi.fn(async () => {
        throw new BookResultBrowserError('forbidden', 403);
      }),
      readDetail: vi.fn(async () => {
        throw new BookResultBrowserError('forbidden', 403);
      }),
    };
    render(
      <BookResultAdapter
        routeHandle={routeHandle}
        viewerRole="teacher"
        viewerId="teacher-1"
        client={deniedClient}
      />,
    );

    expect(screen.getByTestId('grouped-result')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('do not have access');
    expect(screen.queryByTestId('grouped-result')).not.toBeInTheDocument();
  });
});
