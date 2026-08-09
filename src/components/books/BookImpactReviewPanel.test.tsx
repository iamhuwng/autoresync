import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { BookImpactSnapshot } from '../../services/book-delivery/bookImpactSnapshot.types';
import { BookImpactReviewPanel } from './BookImpactReviewPanel';

const snapshot = (expiresAt = '2026-08-10T00:15:00.000Z'): BookImpactSnapshot => ({
  schemaVersion: 1,
  snapshotId: 'snapshot-1',
  actorId: 'teacher-1',
  ownerId: 'teacher-1',
  bookId: 'book-1',
  inputFingerprint: 'a'.repeat(64),
  immutableInputs: {
    oldActivityVersionId: 'activity-v1', newActivityVersionId: 'activity-v2',
    oldActivityFingerprint: 'a'.repeat(64), newActivityFingerprint: 'b'.repeat(64),
    placementFingerprint: 'c'.repeat(64), manifestFingerprint: 'd'.repeat(64),
    sourceFingerprint: 'e'.repeat(64), scheduleFingerprint: 'f'.repeat(64),
  },
  adapters: [{ adapterId: 'book-homework-impact-v1', adapterVersion: 1, contextKind: 'homework', contractVersion: 1 }],
  contexts: [{
    contextKey: 'homework:homework-1',
    impact: {
      contextId: 'homework-1', contextKind: 'homework', ownerId: 'teacher-1', recipientId: 'student-1',
      bindingId: 'binding-1', bindingRevision: 1, status: 'active', lifecycle: 'in-progress',
      bookId: 'book-1', bookRevision: 1, publicationId: 'publication-1', publicationRevision: 1,
      effectiveWindow: null,
      placements: [{
        placementId: 'placement-1', activityId: 'activity-1', activityVersionId: 'activity-v1',
        activityVersion: 1, nodeKey: 'unit-1', order: 0, effectiveWindow: null,
        sourceRefs: [{ sourceKey: 'source-1', sourceVersionId: 'source-v1', availability: 'available', pages: [1] }],
      }],
      attempts: [],
      sources: [{
        sourceKey: 'source-1', sourceVersionId: 'source-v1', availability: 'available', pages: [1],
        placementIds: ['placement-1'],
      }],
      classification: {
        primaryEffect: 'redo-required', effects: ['redo-required'], reasons: ['answer-rule'],
        requiresRedo: true, requiresRegrade: false,
      },
      replacement: [],
    },
    updateAuthority: { ownerId: 'teacher-1', actorId: 'teacher-1', permitted: true },
    recipientScope: { recipientId: 'student-1', lifecycle: 'in-progress', status: 'active' },
    activityChoices: [{
      activityId: 'activity-1', activityVersionId: 'activity-v1', placementId: 'placement-1',
      primaryEffect: 'redo-required', allowedChoices: ['retain-current', 'apply-with-redo'],
      selectedChoice: null,
    }],
    estimatedCheckpointCount: 1,
    estimatedNotificationCount: 1,
  }],
  createdAt: '2026-08-10T00:00:00.000Z',
  expiresAt,
  recovery: {
    backupInventory: 'include-metadata', restoreBehavior: 'retain-read-only',
    expiryBehavior: 'retain-audit-deny-reuse', sideEffectsOnReplay: 'none',
    recoveryLedgerRoot: 'book_impact_snapshot_recovery',
  },
});

describe('BookImpactReviewPanel', () => {
  it('shows mixed-impact facts with no preselected target and keeps choices local', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    const onTrackAction = vi.fn();
    render(<BookImpactReviewPanel
      snapshot={snapshot()}
      now="2026-08-10T00:05:00.000Z"
      onSelectionChange={onSelectionChange}
      onTrackAction={onTrackAction}
    />);

    expect(screen.getByText('Nothing is selected by default. Choices stay local until the later update action is reviewed.')).toBeInTheDocument();
    expect(screen.getByText('student-1')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getAllByRole('radio').every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);

    await user.click(screen.getByRole('radio', { name: 'apply with redo' }));
    expect(onSelectionChange).toHaveBeenCalledWith([{
      contextKey: 'homework:homework-1', placementId: 'placement-1', choice: 'apply-with-redo',
    }]);
    expect(onTrackAction).toHaveBeenCalledWith(
      'teacher_materials_book_impact_choice_selected',
      expect.objectContaining({ snapshotId: 'snapshot-1', choice: 'apply-with-redo' }),
    );
  });

  it('fails closed after expiry and dismisses without any domain mutation callback', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<BookImpactReviewPanel
      snapshot={snapshot('2026-08-10T00:04:00.000Z')}
      now="2026-08-10T00:05:00.000Z"
      onDismiss={onDismiss}
    />);
    expect(screen.getByRole('alert')).toHaveTextContent('expired');
    expect(screen.getAllByRole('radio').every((radio) => (radio as HTMLInputElement).disabled)).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Close review' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
