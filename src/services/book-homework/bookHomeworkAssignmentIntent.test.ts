import { describe, expect, it } from 'vitest';
import type { BookRuntimeDeliveryProjection } from '../book-delivery/bookDelivery.types';
import {
  buildBookHomeworkPreview,
  createDefaultBookHomeworkPolicy,
  type BookHomeworkPreviewDraft,
} from './bookHomeworkPreview.service';
import { createBookHomeworkManifest } from './bookHomeworkManifest.service';
import {
  createBookHomeworkAssignmentIntent,
  type BookHomeworkAssignmentPreviewSource,
} from './bookHomeworkAssignmentIntent';

const delivery: BookRuntimeDeliveryProjection = {
  schemaVersion: 1,
  projectionKind: 'book-runtime-delivery',
  bindingId: 'binding-1',
  bindingRevision: 2,
  recipientId: 'student-1',
  context: { contextId: 'homework-1', kind: 'homework', entitlementBasis: 'assignment' },
  book: {
    bookId: 'book-1',
    bookMode: 'pdf',
    bookRevision: 4,
    manifestVersionId: 'manifest-v1',
    publicationId: 'publication-4',
    publicationRevision: 2,
    publicationStatus: 'published',
  },
  scope: { kind: 'subtree', nodeKeys: ['unit-1'], placementIds: ['placement-1'] },
  outline: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1, titleSnapshot: 'Unit 1' }],
  sourceSet: {
    strategy: 'full_pdf',
    sources: [{ sourceKey: 'full-pdf', sourceVersionId: 'source-4', lifecycle: 'verified-usable', localPageScope: { kind: 'all', pages: [] } }],
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
  provenance: { publicationId: 'publication-4', publicationRevision: 2, bindingId: 'binding-1', bindingRevision: 2 },
};

const source: BookHomeworkAssignmentPreviewSource = {
  delivery,
  bookTitle: '  Preview Book  ',
  classId: 'class-1',
  identity: {
    manifestVersionId: 'manifest-v1',
    ownerId: 'teacher-1',
    createdByCommandId: 'command-1',
    createdAt: '2026-07-28T00:00:00.000Z',
    bindingRevision: 2,
  },
  selectedRecipientIds: ['student-1', 'student-2'],
};

const draft = (): BookHomeworkPreviewDraft => {
  const manifest = createBookHomeworkManifest({
    resolution: { delivery },
    target: { kind: 'unit', bookId: 'book-1', nodeKey: 'unit-1' },
    manifestVersionId: 'manifest-v1',
    ownerId: 'teacher-1',
    createdByCommandId: 'command-1',
    createdAt: '2026-07-28T00:00:00.000Z',
    bindingRevision: 2,
  });
  const policy = createDefaultBookHomeworkPolicy(manifest, 'practice');
  const preview = buildBookHomeworkPreview({ source, manifest, policy });
  return {
    manifest: preview.manifest,
    policy: preview.policy,
    schedule: {
      availableFrom: '2026-08-01T08:00',
      dueDate: '2026-08-10T20:00',
      scheduleRules: [{ nodeKey: 'unit-1', availableFrom: '', dueAt: '2026-08-09T20:00' }],
    },
    deadlineMutationIntents: [],
    warnings: preview.warnings,
  };
};

describe('createBookHomeworkAssignmentIntent', () => {
  it('projects only bounded untrusted choices and optimistic identities', () => {
    let next = 0;
    const command = createBookHomeworkAssignmentIntent({
      source,
      draft: draft(),
      studentExtensions: [{ studentId: 'student-1', nodeKey: 'unit-1', dueAt: '2026-08-11T20:00:00.000Z' }],
      createId: () => `00000000-0000-4000-8000-00000000000${++next}`,
    });

    expect(command.assignmentId).toBe('00000000-0000-4000-8000-000000000001');
    expect(command.selectedRecipientIds).toEqual(['student-1', 'student-2']);
    expect(command.intent).toEqual({
      bookId: 'book-1',
      target: { kind: 'unit', bookId: 'book-1', nodeKey: 'unit-1', classId: 'class-1' },
      schedule: {
        availableFrom: '2026-08-01T01:00:00.000Z',
        finalDueAt: '2026-08-10T13:00:00.000Z',
        nodeOverrides: [{ nodeKey: 'unit-1', dueAt: '2026-08-09T13:00:00.000Z' }],
        studentExtensions: [{ studentId: 'student-1', nodeKey: 'unit-1', dueAt: '2026-08-11T20:00:00.000Z' }],
      },
      policy: {
        intent: 'practice',
        integrityCapture: false,
        integrityOverride: false,
        activityPolicies: [{
          placementId: 'placement-1',
          maxAttempts: null,
          feedbackRelease: 'after_completion',
          lateSubmissionAllowed: false,
        }],
      },
      expectedPublication: {
        publicationId: 'publication-4',
        publicationRevision: 2,
        manifestVersionId: 'manifest-v1',
      },
      presentation: { title: 'Preview Book' },
    });
    expect(command).not.toHaveProperty('ownerId');
    expect(command).not.toHaveProperty('createdAt');
    expect(command).not.toHaveProperty('manifest');
    expect(command).not.toHaveProperty('delivery');
    expect(JSON.stringify(command)).not.toContain('source-4');
    expect(JSON.stringify(command)).not.toContain('activity-1-v1');
  });

  it('rejects extensions outside the selected recipient and outline boundaries', () => {
    expect(() => createBookHomeworkAssignmentIntent({
      source,
      draft: draft(),
      studentExtensions: [{ studentId: 'other-student', nodeKey: 'unit-1', dueAt: '2026-08-11T20:00:00.000Z' }],
      createId: () => '00000000-0000-4000-8000-000000000001',
    })).toThrow(/unselected identity/);
  });

  it('sanitizes and freezes the bounded presentation snapshot', () => {
    const command = createBookHomeworkAssignmentIntent({
      source: {
        ...source,
        presentation: {
          title: '  Assignment title  ',
          description: '  Assignment description  ',
        },
      },
      draft: draft(),
      createId: () => '00000000-0000-4000-8000-000000000001',
    });

    expect(command.intent.presentation).toEqual({
      title: 'Assignment title',
      description: 'Assignment description',
    });
    expect(Object.isFrozen(command.intent.presentation)).toBe(true);
  });

  it('rejects an empty required presentation title', () => {
    expect(() => createBookHomeworkAssignmentIntent({
      source: {
        ...source,
        presentation: { title: '   ' },
      },
      draft: draft(),
      createId: () => '00000000-0000-4000-8000-000000000001',
    })).toThrow(/presentation title is unavailable/iu);
  });
});
