import { describe, expect, it, vi } from 'vitest';
import {
  buildReadingV2AuditEvent,
  getReadingV2AuditEventPath,
  validateReadingV2AuditEvent,
  writeReadingV2AuditEvent,
} from './readingV2AuditTrail.service';

describe('readingV2AuditTrail.service', () => {
  const baseInput = {
    eventId: 'audit-1',
    createdAt: '2026-06-09T12:00:00.000Z',
    actorUserId: 'teacher-1',
    actorRole: 'teacher' as const,
    action: 'reading_passage_archived' as const,
    entityType: 'reading-passage' as const,
    entityId: 'passage-1',
    ownerId: 'teacher-1',
    materialId: 'passage-1',
    versionId: 'snapshot-1',
    titleSnapshot: 'Archive passage',
    usedElsewhere: true,
    usageCategories: ['master', 'book'],
    adminOverride: false,
    correlationId: 'corr-1',
    sourceFeatureId: 'teacher-materials-reading-passage',
    sourceRoute: '/lobby',
  };

  it('builds append-only Reading V2 audit events at the approved path', () => {
    const event = buildReadingV2AuditEvent(baseInput);

    expect(getReadingV2AuditEventPath(event.eventId)).toBe('reading_v2/audit_events/audit-1');
    expect(event).toMatchObject({
      schemaVersion: 1,
      eventId: 'audit-1',
      action: 'reading_passage_archived',
      actorUserId: 'teacher-1',
      entityType: 'reading-passage',
      entityId: 'passage-1',
      correlationId: 'corr-1',
    });
    expect(JSON.stringify(event)).not.toMatch(/passageBody|document|answerKey|studentAnswers|scoringRule/);
  });

  it('fails closed when required state-changing audit fields are missing', () => {
    expect(() =>
      buildReadingV2AuditEvent({
        ...baseInput,
        actorUserId: '',
      }),
    ).toThrow(/actorUserId/);
  });

  it('strips optional undefined fields before RTDB writes', () => {
    const event = buildReadingV2AuditEvent({
      ...baseInput,
      adminOverride: undefined,
      after: {
        state: 'archived',
        archivedAt: undefined,
      },
    });

    expect(Object.prototype.hasOwnProperty.call(event, 'adminOverride')).toBe(false);
    expect(event.after).toEqual({ state: 'archived' });
  });

  it('accepts every PRD-0054 required state-changing audit action', () => {
    const requiredActions = [
      ['reading_passage_archived', 'reading-passage'],
      ['reading_passage_restored', 'reading-passage'],
      ['reading_master_removed', 'reading-master'],
      ['reading_master_broken_ref_repaired', 'reading-master'],
      ['reading_book_broken_ref_repaired', 'reading-book'],
      ['reading_duplicate_warning_existing_used', 'duplicate-warning'],
      ['reading_duplicate_warning_restore_used', 'duplicate-warning'],
      ['reading_duplicate_warning_bypassed', 'duplicate-warning'],
      ['reading_super_admin_passage_archived', 'reading-passage'],
    ] as const;

    requiredActions.forEach(([action, entityType]) => {
      expect(buildReadingV2AuditEvent({
        ...baseInput,
        eventId: `audit-${action}`,
        action,
        entityType,
        entityId: `${entityType}-1`,
      })).toEqual(expect.objectContaining({
        action,
        entityType,
      }));
    });
  });

  it('rejects unknown audit actions, actor roles, and entity types', () => {
    expect(() =>
      validateReadingV2AuditEvent({
        ...baseInput,
        schemaVersion: 1,
        action: 'reading_duplicate_warning_shown',
      }),
    ).toThrow(/action is not allowed/);

    expect(() =>
      validateReadingV2AuditEvent({
        ...baseInput,
        schemaVersion: 1,
        actorRole: 'student',
      }),
    ).toThrow(/actorRole is not allowed/);

    expect(() =>
      validateReadingV2AuditEvent({
        ...baseInput,
        schemaVersion: 1,
        entityType: 'view-only',
      }),
    ).toThrow(/entityType is not allowed/);
  });

  it('rejects unsafe canonical, answer, scoring, AI, provenance, and import fields', () => {
    expect(() =>
      validateReadingV2AuditEvent({
        ...baseInput,
        schemaVersion: 1,
        passageBody: 'raw passage text must never be audited',
      }),
    ).toThrow(/unsafe audit field.*passageBody/);

    expect(() =>
      validateReadingV2AuditEvent({
        ...baseInput,
        schemaVersion: 1,
        after: {
          refId: 'ref-1',
          answerKey: { q1: 'A' },
        },
      }),
    ).toThrow(/unsafe audit field.*answerKey/);
  });

  it('writes through the approved path without touching legacy audit logs', async () => {
    const write = vi.fn(async (_path: string, _value: unknown) => undefined);

    await writeReadingV2AuditEvent(baseInput, { write });

    expect(write).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith(
      'reading_v2/audit_events/audit-1',
      expect.objectContaining({ eventId: 'audit-1' }),
    );
    expect(write.mock.calls[0]?.[0]).not.toContain('audit_logs');
  });
});
