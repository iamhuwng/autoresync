import { describe, expect, it, vi } from 'vitest';
import { createBookClassImpactAdapter } from './bookClassImpactAdapter.service';
import { createBookContextImpactAdapterRegistry } from './bookContextImpactAdapterRegistry.service';
import { createBookCourseImpactAdapter } from './bookCourseImpactAdapter.service';
import { createBookPublicImpactAdapter } from './bookPublicImpactAdapter.service';
import type { BookContextImpactInput, BookContextImpactKind, BookContextImpactReader } from './bookContextImpactDiscovery.types';

const now = '2026-08-05T00:00:00.000Z';
const query = { actorId: 'teacher-1', evaluatedAt: now };
const context = (kind: BookContextImpactKind): BookContextImpactInput => ({
  contextId: `${kind}-context-1`, kind, ownerId: 'teacher-1', recipientId: 'student-1', bindingId: `${kind}-binding-1`, bindingRevision: 1,
  bookId: 'book-1', publicationId: 'publication-1', manifestVersionId: 'manifest-1', status: 'active', lifecycle: 'in-progress', observedAt: '2026-08-04T00:00:00.000Z',
  identity: kind === 'course' ? { kind, courseId: 'course-1', moduleId: 'module-1', courseMaterialId: 'material-1', unitStableKey: 'unit-1', unitVersionId: 'unit-version-1', sourceVersionId: 'source-version-1', placementRevision: 1 }
    : kind === 'class' ? { kind, classId: 'class-1', copyId: 'copy-1', classPlacementId: 'class-placement-1', courseMaterialId: 'material-1', unitStableKey: 'unit-1', unitVersionId: 'unit-version-1', sourceVersionId: 'source-version-1', placementRevision: 1 }
      : { kind, referenceKind: 'fork', referenceId: 'reference-1', sourceBookId: 'book-1', targetBookId: 'book-2', targetPlacementId: 'placement-1', sourceOwnerId: 'teacher-1', downstreamOwnerId: 'teacher-1', provenanceId: 'fork-1' },
  placements: [{ placementId: 'placement-1', activityId: 'activity-1', activityVersionId: 'activity-version-1', sourceVersionId: 'source-version-1', order: 0 }],
  classification: { primaryEffect: 'display-only', effects: ['display-only'], reasons: ['title'], requiresRedo: false, requiresRegrade: false },
  sourceReplacement: { mode: kind === 'public-reference' ? 'invalidation-only' : 'owner-adopts-replacement', ownerChoice: 'retain-owner', replacementSourceVersionId: null },
});
const reader = (kind: BookContextImpactKind, records: readonly unknown[], options: { readonly authorization?: boolean } = {}): BookContextImpactReader => ({
  authorize: vi.fn(async () => options.authorization === false ? { authorized: false as const, code: 'unauthorized' as const } : { authorized: true as const, actorId: 'teacher-1', contextKind: kind, ownerScope: kind === 'course' ? 'teacher-owned-course' as const : kind === 'class' ? 'teacher-owned-class' as const : 'source-owner-public-reference' as const, maxContexts: 100 }),
  readAuthorizedContexts: vi.fn(async () => ({ complete: true as const, contexts: records })),
});

describe('39D Book context impact adapters', () => {
  it.each([
    ['course', createBookCourseImpactAdapter],
    ['class', createBookClassImpactAdapter],
    ['public-reference', createBookPublicImpactAdapter],
  ] as const)('authorizes before bounded %s projection and freezes the exact identity', async (kind, create) => {
    const source = reader(kind, [context(kind)]);
    const result = await create(source).discover(query);
    expect(source.authorize).toHaveBeenCalledBefore(source.readAuthorizedContexts as ReturnType<typeof vi.fn>);
    expect(result).toMatchObject({ status: 'ok', contextKind: kind, impacts: [{ identity: { kind } }] });
    if (result.status === 'ok') expect(Object.isFrozen(result.impacts[0])).toBe(true);
  });

  it('fails closed without materializing contexts when authorization is revoked', async () => {
    const source = reader('course', [context('course')], { authorization: false });
    await expect(createBookCourseImpactAdapter(source).discover(query)).resolves.toMatchObject({ status: 'blocked', code: 'unauthorized' });
    expect(source.readAuthorizedContexts).not.toHaveBeenCalled();
  });

  it('rejects cross-owner Course/Class and stale public provenance without mutation', async () => {
    const course = { ...context('course'), ownerId: 'teacher-2' };
    const classRecord = { ...context('class'), identity: { ...context('class').identity, copyId: 'copy-2' } };
    const stalePublic = { ...context('public-reference'), observedAt: '2026-08-05T01:00:00.000Z' };
    await expect(createBookCourseImpactAdapter(reader('course', [course])).discover(query)).resolves.toMatchObject({ status: 'blocked', code: 'malformed' });
    await expect(createBookClassImpactAdapter(reader('class', [classRecord, classRecord])).discover(query)).resolves.toMatchObject({ status: 'blocked', code: 'ambiguous' });
    await expect(createBookPublicImpactAdapter(reader('public-reference', [stalePublic])).discover(query)).resolves.toMatchObject({ status: 'blocked', code: 'malformed' });
  });

  it('keeps downstream owner visibility scoped to source-owner public provenance', async () => {
    const allowed = { ...context('public-reference'), ownerId: 'downstream-owner', identity: { ...context('public-reference').identity, downstreamOwnerId: 'downstream-owner' } };
    const denied = { ...allowed, identity: { ...allowed.identity, sourceOwnerId: 'teacher-2' } };
    await expect(createBookPublicImpactAdapter(reader('public-reference', [allowed])).discover(query)).resolves.toMatchObject({ status: 'ok', impacts: [{ ownerId: 'downstream-owner' }] });
    await expect(createBookPublicImpactAdapter(reader('public-reference', [denied])).discover(query)).resolves.toMatchObject({ status: 'blocked', code: 'malformed' });
  });

  it('registers exactly the 39D context kinds without activation', () => {
    const registry = createBookContextImpactAdapterRegistry();
    expect(registry.declarations.map((entry) => entry.contextKind).sort()).toEqual(['class', 'course', 'public-reference']);
    expect(registry.declarations.every((entry) => entry.conformance.status === 'verified' && entry.sourceReplacement.automaticUpdate === false)).toBe(true);
  });
});
