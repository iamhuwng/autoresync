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
import type {
  BookActivityEvaluationBrowserClient,
} from '../../services/book-activity/activityEvaluation.browser';
import {
  BookResultAdapter,
  resetBookResultAdapterCacheForTests,
} from './BookResultAdapter';

const { mockTrackAction, mockToastInfo, mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockTrackAction: vi.fn(),
  mockToastInfo: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock('../../hooks/useFeatureTracking', () => ({
  useFeatureTracking: () => ({ trackAction: mockTrackAction }),
}));

vi.mock('../../components/modern', () => ({
  toast: { info: mockToastInfo, success: mockToastSuccess, error: mockToastError },
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
    switchingAttempt,
    evaluationProjection,
    evaluationLoading,
    evaluationError,
    onAttemptChange,
  }: {
    group: BookResultGroupSummary;
    selectedAttemptId: string;
    detail: BookResultAttemptDetail | null;
    refreshing: boolean;
    switchingAttempt: boolean;
    evaluationProjection: unknown;
    evaluationLoading: boolean;
    evaluationError: string | null;
    onAttemptChange: (attemptId: string) => void;
  }) => (
    <div data-testid="grouped-result">
      <span>{`${group.groupKey}:${selectedAttemptId}:${detail?.resultId ?? 'no-detail'}`}</span>
      <span data-testid="atomic-context">
        {detail
          ? JSON.stringify({
            response: detail.response,
            source: detail.attemptSourceContext?.metadata?.sourceVersionId,
            page: detail.attemptSourceContext?.metadata?.physicalPageNumber,
            pageGroup: detail.attemptSourceContext?.metadata?.pageGroupId,
            placement: detail.attemptSourceContext?.metadata?.placementId,
            activityVersion: detail.attemptSourceContext?.metadata?.activityVersionId,
            focus: detail.attemptSourceContext?.metadata?.interactionFocusId,
          })
          : 'no-context'}
      </span>
      {refreshing && <span>refreshing</span>}
      {switchingAttempt && <span>switching</span>}
      <span data-testid="evaluation-state">
        {JSON.stringify({ evaluationProjection, evaluationLoading, evaluationError })}
      </span>
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
  surface: 'homework',
  completionStatus: 'completed',
  evaluationStatus: 'graded',
  evaluation: {
    status: 'graded',
    score: { earnedScore: 1, maximumScore: 1, displayScore: '1.00 / 1.00' },
  },
  feedback: { release: 'withheld', available: false },
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
  response: { submitted: summary.attemptId },
  attemptSourceContext: {
    schemaVersion: 1,
    state: 'available',
    metadata: {
      attemptId: summary.attemptId,
      resultId: summary.resultId,
      bookId: 'book-1',
      studentId: 'student-1',
      surface: 'homework',
      contextId: `homework-${summary.attemptNumber}`,
      ownerId: 'teacher-1',
      componentId: `component-${summary.attemptNumber}`,
      sourceKey: `component-${summary.attemptNumber}`,
      sourceVersionId: `source-version-${summary.attemptNumber}`,
      physicalPageNumber: summary.attemptNumber + 4,
      pageGroupId: `page-group-${summary.attemptNumber}`,
      placementId: `placement-${summary.attemptNumber}`,
      activityId: 'activity-1',
      activityVersionId: `activity-version-${summary.attemptNumber}`,
      activityVersion: summary.attemptNumber,
      interactionFocusId: `interaction-${summary.attemptNumber}`,
      correspondence: 'source-assisted',
    },
    documentResource: {
      sourceKey: `component-${summary.attemptNumber}`,
      sourceVersionId: `source-version-${summary.attemptNumber}`,
      opaqueRouteKey: `opaque-${summary.attemptNumber}`,
      localPageScope: { kind: 'pages', pages: [summary.attemptNumber + 4] },
    },
  },
} as BookResultAttemptDetail);

const client = (): BookResultBrowserClient => ({
  releaseFeedback: vi.fn(async (_address, resultId) => ({ status: 'released' as const, resultId, releasedAt: '2026-09-22T00:00:00.000Z' })),
  readGroup: vi.fn(async () => group),
  readDetail: vi.fn(async (_address, resultId) => (
    detail(resultId === 'result-2' ? latest : first)
  )),
});

describe('BookResultAdapter', () => {
  it('shows Public practice as ungraded without pending feedback and returns to Library', async () => {
    const publicAttempt = { ...latest, surface: 'public' as const, evaluationStatus: 'submitted' as const,
      evaluation: { status: 'submitted' as const }, feedback: { release: 'not-applicable' as const, available: false } };
    const publicGroup = { ...group, attempts: [publicAttempt] };
    const publicDetail = { ...detail(publicAttempt), surface: 'public' as const, feedback: publicAttempt.feedback };
    const resultClient = { ...client(), readGroup: vi.fn(async () => publicGroup), readDetail: vi.fn(async () => publicDetail) };
    const onBack = vi.fn();
    render(<BookResultAdapter routeHandle={createBookResultRouteHandle({ ...routeAddress, contextKind: 'public', contextId: 'public-1' })} viewerRole="student" viewerId="student-1" client={resultClient} onBackToHomework={onBack} />);
    await screen.findByText('Public practice');
    await screen.findByText('Feedback does not apply to Public practice.');
    expect(screen.getByText('Not applicable')).toBeInTheDocument();
    expect(screen.queryByText('Feedback pending')).not.toBeInTheDocument();
    expect(screen.queryByText('Homework', { exact: true })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to library' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    resetBookResultAdapterCacheForTests();
  });

  it.each(['released', 'withheld'] as const)('renders canonical policy feedback when %s without a second evaluation service', async (release) => {
    const resultClient = client();
    vi.mocked(resultClient.readDetail).mockResolvedValue({
      ...detail(latest), feedbackPolicy: 'manual',
      feedback: { release, available: release === 'released', text: 'Teacher feedback', correctionNote: 'Regrade correction' },
    });
    render(<BookResultAdapter routeHandle={routeHandle} viewerRole="student" viewerId="student-1" client={resultClient} />);
    await screen.findByRole('heading', { name: 'Activity result' });
    if (release === 'released') {
      await screen.findByText('Teacher feedback');
      expect(screen.getByText('Regrade correction')).toBeInTheDocument();
    }
    else {
      await screen.findByText('Feedback is not available yet');
      expect(screen.queryByText('Teacher feedback')).not.toBeInTheDocument();
      expect(screen.queryByText('Regrade correction')).not.toBeInTheDocument();
      expect(screen.queryByText('1.00 / 1.00')).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'Release feedback for this attempt' })).not.toBeInTheDocument();
  });

  it('keeps trusted released fields when a later legacy read returns conflicting graded data', async () => {
    const resultClient = client();
    vi.mocked(resultClient.readDetail).mockResolvedValue({
      ...detail(latest),
      feedbackPolicy: 'manual',
      feedback: { release: 'released', available: true, text: 'Trusted feedback' },
    });
    const evaluationClient = {
      readTeacherEvaluation: vi.fn(),
      grade: vi.fn(),
      regrade: vi.fn(),
      readStudentResult: vi.fn(async () => ({
        attemptId: 'attempt-2',
        status: 'graded' as const,
        score: { earnedScore: 0, maximumScore: 1, displayScore: '0.00 / 1.00' },
        feedback: 'Stale legacy feedback',
      })),
    } satisfies BookActivityEvaluationBrowserClient;
    render(
      <BookResultAdapter
        routeHandle={routeHandle}
        viewerRole="student"
        viewerId="student-1"
        client={resultClient}
        evaluationClient={evaluationClient}
      />,
    );
    await screen.findByText('Trusted feedback');
    expect(screen.getByText('Trusted feedback')).toBeInTheDocument();
    expect(screen.getByText('1.00 / 1.00')).toBeInTheDocument();
    expect(screen.queryByText('Stale legacy feedback')).not.toBeInTheDocument();
    expect(screen.queryByText('0.00 / 1.00')).not.toBeInTheDocument();
  });

  it('enriches missing trusted released fields from the later graded read', async () => {
    const resultClient = client();
    vi.mocked(resultClient.readDetail).mockResolvedValue({
      ...detail(latest),
      evaluation: { status: 'pending_review' },
      feedbackPolicy: 'manual',
      feedback: { release: 'released', available: true },
    });
    const evaluationClient = {
      readTeacherEvaluation: vi.fn(),
      grade: vi.fn(),
      regrade: vi.fn(),
      readStudentResult: vi.fn(async () => ({
        attemptId: 'attempt-2',
        status: 'graded' as const,
        score: { earnedScore: 0.75, maximumScore: 1, displayScore: '0.75 / 1.00' },
        feedback: 'Later graded feedback',
      })),
    } satisfies BookActivityEvaluationBrowserClient;
    render(
      <BookResultAdapter
        routeHandle={routeHandle}
        viewerRole="student"
        viewerId="student-1"
        client={resultClient}
        evaluationClient={evaluationClient}
      />,
    );
    await screen.findByText('Later graded feedback');
    expect(screen.getByText('0.75 / 1.00')).toBeInTheDocument();
  });

  it('lets the teacher release the selected manual result once and refreshes trusted reads', async () => {
    const homeworkAddress = { ...routeAddress, homeworkId: 'homework-1' };
    const resultClient = client();
    let released = false;
    vi.mocked(resultClient.readDetail).mockImplementation(async () => ({
      ...detail(latest), feedbackPolicy: 'manual',
      feedback: { release: 'released', available: true },
      studentFeedbackRelease: released ? 'released' : 'withheld',
    }));
    vi.mocked(resultClient.releaseFeedback).mockImplementation(async (_address, resultId) => {
      released = true;
      return { status: 'released', resultId, releasedAt: '2026-09-22T00:00:00.000Z' };
    });
    render(<BookResultAdapter routeHandle={createBookResultRouteHandle(homeworkAddress)}
      viewerRole="teacher" viewerId="teacher-1" client={resultClient} />);
    const button = await screen.findByRole('button', { name: 'Release feedback for this attempt' });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(resultClient.releaseFeedback).toHaveBeenCalledTimes(1));
    expect(resultClient.releaseFeedback).toHaveBeenCalledWith(homeworkAddress, 'result-2');
    await waitFor(() => expect(resultClient.readDetail).toHaveBeenCalledTimes(2));
    expect(mockToastSuccess).toHaveBeenCalledWith('Feedback released for this attempt.');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Release feedback for this attempt' })).not.toBeInTheDocument());
  });

  it('announces a denied release without changing local visibility', async () => {
    const resultClient = client();
    vi.mocked(resultClient.readDetail).mockResolvedValue({ ...detail(latest), feedbackPolicy: 'manual', studentFeedbackRelease: 'withheld' });
    vi.mocked(resultClient.releaseFeedback).mockRejectedValue(new BookResultBrowserError('forbidden', 403));
    render(<BookResultAdapter routeHandle={createBookResultRouteHandle({ ...routeAddress, homeworkId: 'homework-1' })}
      viewerRole="teacher" viewerId="teacher-1" client={resultClient} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Release feedback for this attempt' }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(resultClient.readDetail).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Release feedback for this attempt' })).toBeEnabled();
  });

  it('loads one summary and only the selected detail in the student shell', async () => {
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
    await screen.findByRole('heading', { name: 'Activity result' });
    expect(screen.getByText('Complete')).toBeInTheDocument();
    expect(screen.getByText('Feedback is not available yet')).toBeInTheDocument();
    expect(resultClient.readGroup).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(resultClient.readDetail).toHaveBeenCalledTimes(1);
      expect(resultClient.readDetail).toHaveBeenCalledWith(routeAddress, 'result-2');
    });
  });

  it('keeps student output completion-safe and omits canonical result identities', async () => {
    const resultClient = client();
    render(
      <BookResultAdapter
        routeHandle={routeHandle}
        viewerRole="student"
        viewerId="student-1"
        client={resultClient}
      />,
    );

    await screen.findByText('Complete');
    expect(screen.getByText('Feedback is not available yet')).toBeInTheDocument();
    expect(screen.queryByText(routeAddress.groupKey)).not.toBeInTheDocument();
    expect(screen.queryByText('student-1')).not.toBeInTheDocument();
    expect(screen.queryByText('activity-1')).not.toBeInTheDocument();
    expect(screen.queryByText('pending_review')).not.toBeInTheDocument();
    expect(screen.queryByText('1.00 / 1.00')).not.toBeInTheDocument();
  });

  it('does not render an attempt selector for a single student attempt', async () => {
    const singleGroup = {
      ...group,
      attemptCount: 1,
      attempts: [latest],
      latestAttemptId: latest.attemptId,
    };
    const resultClient: BookResultBrowserClient = {
      ...client(),
      readGroup: vi.fn(async () => singleGroup),
      readDetail: vi.fn(async () => detail(latest)),
    };
    render(
      <BookResultAdapter
        routeHandle={routeHandle}
        viewerRole="student"
        viewerId="student-1"
        client={resultClient}
      />,
    );

    await screen.findByText('Complete');
    expect(screen.queryByTestId('ah-root')).not.toBeInTheDocument();
  });

  it('tracks result back and retries through the shared result actions', async () => {
    const resultClient = client();
    const onBackToHomework = vi.fn();
    const firstRender = render(
      <BookResultAdapter
        routeHandle={routeHandle}
        viewerRole="student"
        viewerId="student-1"
        client={resultClient}
        onBackToHomework={onBackToHomework}
      />,
    );

    await screen.findByText('Complete');
    fireEvent.click(screen.getByRole('button', { name: 'Back to homework' }));

    expect(onBackToHomework).toHaveBeenCalledTimes(1);
    expect(mockTrackAction).toHaveBeenCalledWith('bookActivityResultBack', {
      surface: 'bookActivityResult',
      viewerRole: 'student',
    });
    firstRender.unmount();

    const failedClient: BookResultBrowserClient = {
      ...client(),
      readGroup: vi.fn(async () => {
        throw new BookResultBrowserError('route_disabled', 503);
      }),
      readDetail: vi.fn(),
    };
    render(
      <BookResultAdapter
        routeHandle={createBookResultRouteHandle({
          ...routeAddress,
          groupKey: `${routeAddress.groupKey}-retry`,
        })}
        viewerRole="student"
        viewerId="student-1"
        client={failedClient}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(failedClient.readGroup).toHaveBeenCalledTimes(2));
    expect(mockTrackAction).toHaveBeenCalledWith('bookActivityResultRetried', {
      surface: 'bookActivityResult',
    });
    expect(mockToastInfo).toHaveBeenCalledWith('Refreshing Activity result…');
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

  it('switches result, response, source context, version, page, and focus in one commit', async () => {
    let resolveFirst!: (value: BookResultAttemptDetail) => void;
    const resultClient: BookResultBrowserClient = {
      ...client(),
      readGroup: vi.fn(async () => group),
      readDetail: vi.fn(async (_address, resultId) => {
        if (resultId === 'result-2') return detail(latest);
        return new Promise<BookResultAttemptDetail>((resolve) => { resolveFirst = resolve; });
      }),
    };
    render(
      <BookResultAdapter
        routeHandle={routeHandle}
        viewerRole="teacher"
        viewerId="teacher-1"
        client={resultClient}
      />,
    );
    await screen.findByText(`${routeAddress.groupKey}:attempt-2:result-2`);
    const secondContext = JSON.stringify({
      response: { submitted: 'attempt-2' },
      source: 'source-version-2',
      page: 6,
      pageGroup: 'page-group-2',
      placement: 'placement-2',
      activityVersion: 'activity-version-2',
      focus: 'interaction-2',
    });
    const firstContext = JSON.stringify({
      response: { submitted: 'attempt-1' },
      source: 'source-version-1',
      page: 5,
      pageGroup: 'page-group-1',
      placement: 'placement-1',
      activityVersion: 'activity-version-1',
      focus: 'interaction-1',
    });
    expect(screen.getByTestId('atomic-context')).toHaveTextContent(secondContext);

    fireEvent.click(screen.getByRole('button', { name: 'Choose first' }));

    expect(screen.getByText(`${routeAddress.groupKey}:attempt-2:result-2`)).toBeInTheDocument();
    expect(screen.getByTestId('atomic-context')).toHaveTextContent(secondContext);
    expect(screen.getByText('switching')).toBeInTheDocument();
    expect(screen.queryByText(`${routeAddress.groupKey}:attempt-1:result-2`)).not.toBeInTheDocument();
    resolveFirst(detail(first));
    await screen.findByText(`${routeAddress.groupKey}:attempt-1:result-1`);
    expect(screen.getByTestId('atomic-context')).toHaveTextContent(firstContext);
    expect(screen.queryByText(`${routeAddress.groupKey}:attempt-2:result-1`)).not.toBeInTheDocument();
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
      ...client(),
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
    await screen.findByRole('heading', { name: 'Activity result' });
    firstRender.unmount();

    const deniedClient: BookResultBrowserClient = {
      ...client(),
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
    await screen.findByRole('heading', { name: 'Activity result' });

    const deniedClient: BookResultBrowserClient = {
      ...client(),
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
      ...client(),
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

  it('reads the policy-filtered evaluation for the exact selected student attempt', async () => {
    const resultClient = client();
    vi.mocked(resultClient.readDetail).mockImplementation(async (_address, resultId) => ({
      ...detail(resultId === 'result-2' ? latest : first),
      surface: 'homework',
      contextId: 'homework-1',
      placementId: 'placement-1',
      activityId: 'activity-1',
      activityVersionId: 'activity-version-2',
    }));
    const evaluationClient = {
      readTeacherEvaluation: vi.fn(),
      grade: vi.fn(),
      regrade: vi.fn(),
      readStudentResult: vi.fn(async () => ({
        attemptId: 'attempt-2',
        status: 'graded' as const,
        feedback: 'Policy released',
      })),
    } satisfies BookActivityEvaluationBrowserClient;
    render(
      <BookResultAdapter
        routeHandle={routeHandle}
        viewerRole="student"
        viewerId="student-1"
        client={resultClient}
        evaluationClient={evaluationClient}
      />,
    );

    await waitFor(() => expect(evaluationClient.readStudentResult).toHaveBeenCalledWith({
      bookId: 'book-1',
      studentId: 'student-1',
      contextKind: 'homework',
      contextId: 'homework-1',
      placementId: 'placement-1',
      activityId: 'activity-1',
      activityVersionId: 'activity-version-2',
      attemptId: 'attempt-2',
    }));
    await waitFor(() => expect(screen.getByText('Policy released')).toBeInTheDocument());
  });

  it('does not read evaluation history for a teacher', async () => {
    const evaluationClient = {
      readTeacherEvaluation: vi.fn(),
      grade: vi.fn(),
      regrade: vi.fn(),
      readStudentResult: vi.fn(),
    } satisfies BookActivityEvaluationBrowserClient;
    render(
      <BookResultAdapter
        routeHandle={routeHandle}
        viewerRole="teacher"
        viewerId="teacher-1"
        client={client()}
        evaluationClient={evaluationClient}
      />,
    );

    await screen.findByText(`${routeAddress.groupKey}:attempt-2:result-2`);
    expect(evaluationClient.readStudentResult).not.toHaveBeenCalled();
  });
});
