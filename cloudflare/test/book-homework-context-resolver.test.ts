import { describe, expect, it, vi } from 'vitest';

import {
  BookHomeworkAuthoritativeContextResolver,
  type BookHomeworkContextResolverDependencies,
} from '../src/upload-worker/book-homework/context-resolver.ts';
import { isBookHomeworkCompatibilityProjection } from '../../src/services/book-homework/bookHomeworkCompatibilityProjection.service.ts';

const assignmentId = 'assignment-vocab-u1-ac994b46-0f53-47f5-a697-659c54b54fb4';
const ownerId = 'glMHCrzMnyS6AqFcb9I0nlOqQ6X2';
const recipientId = 'x3hDfjYVN7cJtSbwq0ChIjl1Bk62';
const authorityId = `${assignmentId}--${recipientId}--authority`;
const bindingId = `${assignmentId}--${recipientId}--delivery`;

const compatibilityShell = () => ({
  schemaVersion: 1,
  assignmentKind: 'book_homework_compatibility',
  id: assignmentId,
  createdBy: ownerId,
  createdAt: 1_786_709_204_227,
  updatedAt: 1_786_709_204_227,
  materialId: 'book-vocab-u1-d43935c735245dc8',
  materialTitle: 'Vocabulary U1',
  materialType: 'book',
  materialSkill: 'mixed',
  title: 'Vocabulary U1',
  target: { type: 'students', studentIds: [recipientId] },
  scheduling: { dueDate: 1_787_270_400_000 },
  config: { timerMinutes: null, maxAttempts: null, feedbackTiming: 'never', lateSubmissionAllowed: false },
  visibility: { showTimer: false, showAttempts: false, showDueDate: true, showQuestionCount: false, showDuration: false },
  archived: false,
  tags: [],
  bookHomeworkCompatibility: {
    schemaVersion: 1,
    assignmentId,
    sourceSagaRevision: 7,
    sourceFingerprint: 'fnv1a64:cc3d88a5107df2b5',
  },
});

const root = () => ({
  assignmentId,
  contextId: assignmentId,
  ownerId,
  state: 'committed',
  visibility: 'committed',
  manifestVersionId: 'manifest-vocab-u1',
  publicationId: 'publication-vocab-u1',
  publicationRevision: 4,
  recipientCount: 1,
  committedRecipientCount: 1,
  recipients: [{ recipientId, authorityId, bindingId, authorityRevision: 7, bindingRevision: 3, state: 'committed' }],
});

const authority = () => ({
  assignmentId: authorityId,
  ownerId,
  revision: 7,
  saga: { sagaId: assignmentId, state: 'committed' },
  visibility: { status: 'committed', revision: 7 },
  bookManifest: {
    ownerId,
    manifestVersionId: 'manifest-vocab-u1',
    bindingRevision: 3,
    context: { contextId: assignmentId, recipientId },
    book: {
      bookId: 'book-vocab-u1-d43935c735245dc8',
      bookRevision: 2,
      manifestVersionId: 'manifest-vocab-u1',
      publicationId: 'publication-vocab-u1',
      publicationRevision: 4,
    },
    bindings: [{
      placementId: 'placement-vocab-u1',
      activityId: 'activity-vocab-u1',
      activityVersionId: 'activity-version-vocab-u1',
      activityVersion: 5,
    }],
  },
});

const delivery = () => ({
  record: {
    status: 'active',
    recordRevision: 11,
    binding: {
      bindingId,
      revision: 3,
      status: 'active',
      issuer: { ownerId },
      recipient: { recipientId },
      context: { ownerId, recipientId, contextId: assignmentId, kind: 'homework' },
      book: {
        bookId: 'book-vocab-u1-d43935c735245dc8',
        bookRevision: 2,
        manifestVersionId: 'manifest-vocab-u1',
        publicationId: 'publication-vocab-u1',
        publicationRevision: 4,
        publicationStatus: 'published',
      },
      placements: [{
        placementId: 'placement-vocab-u1',
        activityId: 'activity-vocab-u1',
        activityVersionId: 'activity-version-vocab-u1',
        activityVersion: 5,
      }],
    },
  },
  pointer: {
    status: 'active',
    bindingId,
    bindingRevision: 3,
    contextId: assignmentId,
    recipientId,
    contextKind: 'homework',
  },
});

const publicationScope = () => ({
  current: {
    manifestVersionId: 'manifest-vocab-u1',
    publicationId: 'publication-vocab-u1',
    publicationRevision: 4,
    bookRevision: 2,
  },
  versions: {
    'manifest-vocab-u1': {
      lifecycle: 'published',
      ownerId,
      bookId: 'book-vocab-u1-d43935c735245dc8',
      bookRevision: 2,
      manifestVersionId: 'manifest-vocab-u1',
      publicationId: 'publication-vocab-u1',
      publicationRevision: 4,
    },
  },
  placements: {
    'placement-vocab-u1': {
      placementId: 'placement-vocab-u1',
      ownerId,
      bookId: 'book-vocab-u1-d43935c735245dc8',
      manifestVersionId: 'manifest-vocab-u1',
      publicationId: 'publication-vocab-u1',
      publicationRevision: 4,
      activityId: 'activity-vocab-u1',
      activityVersionId: 'activity-version-vocab-u1',
    },
  },
  activityVersions: {
    'activity-version-vocab-u1': {
      ownerId,
      bookId: 'book-vocab-u1-d43935c735245dc8',
      manifestVersionId: 'manifest-vocab-u1',
      publicationId: 'publication-vocab-u1',
      publicationRevision: 4,
      activityId: 'activity-vocab-u1',
      activityVersionId: 'activity-version-vocab-u1',
      activityVersion: 5,
      canonicalPayloadFingerprint: 'fnv1a64:0123456789abcdef',
    },
  },
});

const canonical = () => ({
  lifecycle: 'published',
  ownerId,
  activityId: 'activity-vocab-u1',
  activityVersionId: 'activity-version-vocab-u1',
  activityVersion: 5,
  payloadFingerprint: 'fnv1a64:0123456789abcdef',
  placementIds: ['placement-vocab-u1'],
  projection: { schemaVersion: 1, activityId: 'activity-vocab-u1', title: 'Vocabulary U1' },
});

const dependencies = (): BookHomeworkContextResolverDependencies => ({
  roots: { read: vi.fn(async () => root() as never) },
  authorities: { read: vi.fn(async () => authority() as never) },
  deliveries: { resolveCurrent: vi.fn(async () => delivery() as never) },
  publications: { readScope: vi.fn(async () => publicationScope() as never) },
  exactActivityVersions: { readExact: vi.fn(async () => canonical() as never) },
});

describe('Book Homework authoritative return-path resolver', () => {
  it.each([
    ['student launch', recipientId, { kind: 'student-launch', placementId: 'placement-vocab-u1' } as const],
    ['teacher read', ownerId, { kind: 'teacher-read', recipientId, placementId: 'placement-vocab-u1' } as const],
  ])('enriches compatibility locator + authenticated actor for %s from authoritative owners', async (
    _label,
    actorUid,
    action,
  ) => {
    const ports = dependencies();
    const resolver = new BookHomeworkAuthoritativeContextResolver(ports);
    const shell = compatibilityShell();
    expect(isBookHomeworkCompatibilityProjection(shell)).toBe(true);
    const locator = shell.bookHomeworkCompatibility.assignmentId;

    const resolved = await resolver.resolve({ assignmentId: locator, actorUid, action });

    expect(resolved).toEqual({
      assignmentId,
      actorUid,
      ownerId,
      recipientId,
      authorityId,
      authorityRevision: 7,
      bindingId,
      bindingRevision: 3,
      deliveryRecordRevision: 11,
      bookId: 'book-vocab-u1-d43935c735245dc8',
      manifestVersionId: 'manifest-vocab-u1',
      publicationId: 'publication-vocab-u1',
      publicationRevision: 4,
      placementId: 'placement-vocab-u1',
      activityId: 'activity-vocab-u1',
      activityVersionId: 'activity-version-vocab-u1',
      activityVersion: 5,
      trustedBookProjection: canonical().projection,
    });
    expect(ports.authorities.read).toHaveBeenCalledWith({ authorityId, assignmentId, ownerId });
    expect(ports.publications.readScope).toHaveBeenCalledWith('book-vocab-u1-d43935c735245dc8');
    expect(ports.exactActivityVersions.readExact).toHaveBeenCalledWith({
      bookId: 'book-vocab-u1-d43935c735245dc8',
      manifestVersionId: 'manifest-vocab-u1',
      publicationId: 'publication-vocab-u1',
      ownerId,
      activityId: 'activity-vocab-u1',
      activityVersionId: 'activity-version-vocab-u1',
      activityVersion: 5,
      payloadFingerprint: 'fnv1a64:0123456789abcdef',
    });
  });

  it.each([
    ['root owner', () => ({ roots: { read: vi.fn(async () => ({ ...root(), ownerId: 'crossed-owner' }) as never) } })],
    ['authority recipient', () => ({ authorities: { read: vi.fn(async () => ({
      ...authority(),
      bookManifest: { ...authority().bookManifest, context: { contextId: assignmentId, recipientId: 'crossed-student' } },
    }) as never) } })],
    ['Delivery binding revision', () => ({ deliveries: { resolveCurrent: vi.fn(async () => ({
      ...delivery(),
      record: { ...delivery().record, binding: { ...delivery().record.binding, revision: 99 } },
    }) as never) } })],
    ['publication revision', () => ({ publications: { readScope: vi.fn(async () => ({
      ...publicationScope(),
      versions: { 'manifest-vocab-u1': { ...publicationScope().versions['manifest-vocab-u1'], publicationRevision: 99 } },
    }) as never) } })],
    ['canonical Activity Version', () => ({ exactActivityVersions: { readExact: vi.fn(async () => ({
      ...canonical(), activityVersion: 99,
    }) as never) } })],
  ])('fails closed on missing or crossed %s provenance', async (_label, override) => {
    const base = dependencies();
    const resolver = new BookHomeworkAuthoritativeContextResolver({ ...base, ...override() } as BookHomeworkContextResolverDependencies);

    await expect(resolver.resolve({
      assignmentId,
      actorUid: recipientId,
      action: { kind: 'student-launch', placementId: 'placement-vocab-u1' },
    })).resolves.toBeNull();
  });
});
