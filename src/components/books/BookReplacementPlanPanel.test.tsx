import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  ReplacementPlanClient,
  ReplacementPlanClientCreateRequest,
  ReplacementPlanRecord,
} from '../../services/book-source-delivery/replacementPlan.types';
import BookReplacementPlanPanel from './BookReplacementPlanPanel';

const { trackAction, toast } = vi.hoisted(() => ({
  trackAction: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock('../../hooks/useFeatureTracking', () => ({ useFeatureTracking: () => ({ trackAction }) }));
vi.mock('../modern', () => ({ toast }));

const plan = {
  schemaVersion: 1, planId: 'plan-1', ownerId: 'teacher-1', bookId: 'book-1', bookRevision: 1, publicationRevision: 1,
  sourceSetRevision: 1, targetSourceSetRevision: 2, sourceVersionRevisions: { full: 1 }, sourceSetDelta: { mappings: [{ mappingId: 'p1' }] },
  deltaFingerprint: 'a'.repeat(64), impactSnapshotId: 'snapshot-1', impactSnapshotFingerprint: 'b'.repeat(64), impactSnapshotRevisionVector: { book: 1 },
  impactSnapshotExpiresAt: '2099-08-11T01:00:00.000Z', adapters: [], contexts: [{ contextKey: 'solo-1', contextKind: 'solo', classification: 'display-only', effects: [], reasons: [], lifecycle: 'not-started', status: 'active', sourceScopes: [{ sourceKey: 'full', pageCount: 1, placementCount: 1 }], activityCount: 1, placementCount: 1, checkpointCount: 0, notificationCount: 0 }],
  selectedContextKeys: [], capacity: { current: { trackedAccountBytes: 1, pendingUploadBytes: 0, replacementUploadBytes: 0, temporaryBytes: 0 }, additionalBytes: 1, projected: 2, limit: 9_000_000_000, available: true }, reviewState: 'unreviewed', createdAt: '2026-08-11T00:00:00.000Z', expiresAt: '2099-08-11T01:00:00.000Z', planFingerprint: 'c'.repeat(64),
} as unknown as ReplacementPlanRecord;
const request = { bookId: 'book-1', currentRevisions: { bookRevision: 1, publicationRevision: 1, sourceSetRevision: 1, sourceVersionRevisions: { full: 1 } }, targetSourceSetRevision: 2, sourceSetDelta: {} as never, capacity: { current: { trackedAccountBytes: 1, pendingUploadBytes: 0, replacementUploadBytes: 0, temporaryBytes: 0 }, additionalBytes: 1 }, now: '2026-08-11T00:00:00.000Z' } as ReplacementPlanClientCreateRequest;

const client: ReplacementPlanClient = {
  create: vi.fn(async () => plan),
  readCurrent: vi.fn(),
  review: vi.fn(async () => ({ plan, review: { reviewId: 'review-1' } as never, handoff: { purpose: 'replacement-confirmation', token: 'opaque', ownerId: 'teacher-1', bookId: 'book-1', planId: 'plan-1', reviewId: 'review-1', planFingerprint: plan.planFingerprint, deltaFingerprint: plan.deltaFingerprint, snapshotFingerprint: plan.impactSnapshotFingerprint, revisionVector: { book: 1 }, expiresAt: plan.expiresAt } })),
  cancel: vi.fn(async () => ({ operationId: 'operation-1', fingerprint: 'd'.repeat(64), status: 'canceled', createdAt: plan.createdAt })),
};

describe('BookReplacementPlanPanel', () => {
  it('renders an exact safe matrix, no default selections, and immediate in-memory handoff only', async () => {
    const onHandoff = vi.fn();
    render(<BookReplacementPlanPanel bookTitle="Book" client={client} request={request} onConfirmationHandoff={onHandoff} />);
    expect(screen.getByText(/No contexts are selected automatically/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create plan' }));
    await waitFor(() => expect(screen.getByRole('table', { name: 'All-context replacement impact matrix' })).toBeInTheDocument());
    expect(screen.getByText(/solo - solo-1/)).toBeInTheDocument();
    expect(screen.queryByText('opaque')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review exact plan' }));
    await waitFor(() => expect(onHandoff).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'replacement-confirmation' })));
    expect(screen.queryByText('opaque')).not.toBeInTheDocument();
    expect(trackAction).toHaveBeenCalledWith('teacher_materials_book_replacement_plan_created', expect.anything());
    expect(trackAction).toHaveBeenCalledWith('teacher_materials_book_replacement_plan_reviewed', expect.anything());
  });
});
