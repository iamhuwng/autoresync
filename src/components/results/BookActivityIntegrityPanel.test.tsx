import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BookIntegrityReport } from '../../services/book-activity/bookIntegrityReport.types';
import type { BookIntegrityReportBrowserClient } from '../../services/book-activity/bookIntegrityReport.browser';
import { BookActivityIntegrityPanel } from './BookActivityIntegrityPanel';

const locator = { bookId: 'book-1', terminalId: 'attempt-1:completion' } as const;

const report: BookIntegrityReport = {
  schemaVersion: 1,
  reportId: 'book-integrity-report-v1-attempt-1',
  status: 'sealed',
  visibility: 'teacher-only',
  sealedAt: '2026-08-02T00:00:10.000Z',
  terminal: {
    attemptId: 'attempt-1',
    terminalId: 'attempt-1:completion',
    resultId: 'attempt-1:result',
    completionId: 'attempt-1:completion',
    attemptNumber: 1,
    submittedAt: '2026-08-02T00:00:10.000Z',
    recipientId: 'student-1',
    ownerId: 'teacher-1',
    bookId: 'book-1',
    bindingId: 'binding-1',
    bindingRevision: 1,
    contextKind: 'homework',
    contextId: 'homework-1',
    placementId: 'placement-1',
    activityId: 'activity-1',
    activityVersion: 1,
    activityVersionId: 'activity-version-1',
    submissionScope: 'activity',
    resultStatus: 'pending_review',
    completionStatus: 'completed',
  },
  policy: {
    schemaVersion: 1,
    policyId: 'book-integrity-risk',
    policyRevision: 1,
    flaggedEventCount: 2,
    highRiskEventCount: 4,
    highRiskSignals: ['concurrent_attempt', 'focus_mode_exit'],
  },
  risk: 'integrity_flagged',
  totalEventCount: 2,
  counts: {
    visibility_loss: 0,
    focus_loss: 1,
    route_reload_close: 0,
    paste: 1,
    protected_copy: 0,
    focus_mode_exit: 0,
    concurrent_attempt: 0,
    inactivity: 0,
  },
  eventRefs: [
    { eventId: `integrity-v1-${'a'.repeat(40)}`, signal: 'paste', recordedAt: '2026-08-02T00:00:01.000Z' },
    { eventId: `integrity-v1-${'b'.repeat(40)}`, signal: 'focus_loss', recordedAt: '2026-08-02T00:00:02.000Z' },
  ],
};

const client = (readTeacherReport: BookIntegrityReportBrowserClient['readTeacherReport']): BookIntegrityReportBrowserClient => ({
  readTeacherReport,
});

describe('BookActivityIntegrityPanel', () => {
  it('shows only cautious teacher-facing report details after submission', async () => {
    const onAction = vi.fn();
    const readTeacherReport = vi.fn(async () => report);
    render(
      <BookActivityIntegrityPanel
        locator={locator}
        studentName="Student One"
        activityLabel="Activity One"
        client={client(readTeacherReport)}
        onAction={onAction}
      />,
    );

    expect(await screen.findByText('Bounded integrity signals were recorded for teacher review.')).toBeInTheDocument();
    expect(screen.getByText('Total signals')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getAllByText('Paste')).not.toHaveLength(0);
    expect(screen.getAllByText('Focus loss')).not.toHaveLength(0);
    expect(screen.queryByText(/penalt|block|consequence|disciplin/iu)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /grade|release|block|penalt/iu })).not.toBeInTheDocument();
    expect(onAction).toHaveBeenCalledWith('bookActivityIntegrityLoaded', {
      activityId: 'activity-1',
      totalEventCount: 2,
      risk: 'integrity_flagged',
    });
  });

  it('keeps teacher report failure non-mutating and retries explicitly', async () => {
    const user = userEvent.setup();
    const readTeacherReport = vi.fn()
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValueOnce(report);
    const onAction = vi.fn();
    render(
      <BookActivityIntegrityPanel
        locator={locator}
        studentName="Student One"
        activityLabel="Activity One"
        client={client(readTeacherReport)}
        onAction={onAction}
      />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('The integrity report could not be loaded. Try again.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(readTeacherReport).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Sealed after submission')).toBeInTheDocument();
    expect(onAction).toHaveBeenCalledWith('bookActivityIntegrityRetried', {
      terminalId: 'attempt-1:completion',
    });
  });
});
