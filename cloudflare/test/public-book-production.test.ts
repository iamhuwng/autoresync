import { describe, expect, it, vi } from 'vitest';
import { InMemoryBookAssemblyPublicationRepository } from '../../src/services/book-assembly/publicationRepository';
import { InMemoryBookDeliveryRepository } from '../../src/services/book-delivery/bookDelivery.entitlementRepository';
import { createPublicBookProductionHandlers, authorizePublicBookBinding } from '../src/upload-worker/book-public/production';
import { makeBookAssemblyPublicationScope } from './book-delivery.fixture';
import { resolveBookResultVisibility } from '../src/upload-worker/book-results/authorization';
import { bookResultGroupsPath } from '../src/upload-worker/book-results/repository';
import { composeGeneratedBookRules, FINAL_BOOK_RULE_FRAGMENT_IDS } from '../src/upload-worker/book-rules/generated-fragment-composer';
import rollbackRules from '../../firebase.prd0062-118-rules.rollback.json';

const fragments = import.meta.glob('../src/upload-worker/book-rules/fragments/*.json', { eager: true, import: 'default' });

const setup = () => {
  const metadata = { bookId: 'book-pdf-1', ownerId: 'teacher-1', status: 'ready', visibility: 'public-library-published' };
  const projection = { bookId: 'book-pdf-1', title: 'Public practice', status: 'ready', visibility: 'public-library-published' };
  const profile = { role: 'student', status: 'active' };
  const env = { readDatabaseValue: async (path: string) => path.startsWith('users/') ? profile : path.includes('public_book_projections') ? projection : metadata } as any;
  const delivery = new InMemoryBookDeliveryRepository();
  const publicationRepository = new InMemoryBookAssemblyPublicationRepository({ 'book-pdf-1': makeBookAssemblyPublicationScope() });
  const sourceAuthority = { publicationStatus: 'published', scheduleOpen: true, revokedSourceVersionIds: [], sourceVersionIds: ['source-v1'], sourceLocations: [{ sourceVersionId: 'source-v1' }] } as any;
  const readDocumentAuthority = vi.fn(async () => sourceAuthority);
  const handlers = createPublicBookProductionHandlers({ delivery, publicationRepository, readDocumentAuthority, now: () => '2026-10-03T00:00:00.000Z' });
  const launch = (uid = 'student-1', operationId = '00000000-0000-4000-8000-000000000001') => handlers.launch({ env, uid, bookId: 'book-pdf-1', request: new Request('https://worker.test/v1/book-public/books/book-pdf-1/launch', { method: 'POST', body: JSON.stringify({ operationId }) }) });
  return { metadata, profile, env, delivery, publicationRepository, sourceAuthority, readDocumentAuthority, launch };
};

describe('Public practice canonical production authority', () => {
  it('composes the Public native candidate without replacing unrelated authorization', () => {
    const candidate = composeGeneratedBookRules(Object.entries(fragments).map(([sourcePath, fragment]) => ({ sourcePath, fragment })), {
      baseRules: rollbackRules.rules, requiredFragmentIds: FINAL_BOOK_RULE_FRAGMENT_IDS,
    });
    expect(candidate.rules.book_runtime.scopes.$recipientId.$contextId.$placementId.$interactionId.results.$resultId['.validate']).toContain("!newData.child('score').exists()");
    expect(candidate.rules.book_result_read_models.contexts.$contextKind.$contextId.students.$studentId.books.$bookId.group_summaries['.read']).toContain("$contextKind == 'public'");
  });
  it('isolates Public results and denies the publication owner and another student', async () => {
    const scope = { bookId: 'book-pdf-1', studentId: 'student-1', contextKind: 'public' as const, contextId: 'public-context' };
    expect(bookResultGroupsPath(scope)).toBe('book_result_read_models/contexts/public/public-context/students/student-1/books/book-pdf-1/group_summaries');
    const authorize = (uid: string, role: 'student' | 'teacher') => resolveBookResultVisibility({
      uid, scope, env: {}, request: new Request('https://worker.test'),
      resolveViewerRole: async () => role, resolveHomeworkAuthorities: async () => ({}),
      resolveContextAuthority: async () => ({ ...scope, ownerId: 'teacher-1' }),
    });
    expect((await authorize('student-1', 'student')).viewer.uid).toBe('student-1');
    await expect(authorize('teacher-1', 'teacher')).rejects.toThrow('book_result_context_not_current_or_owned');
    await expect(authorize('student-2', 'student')).rejects.toThrow('book_result_context_not_current_or_owned');
  });
  it('creates a student-specific Public delivery from actual publication and replays without a teacher issuance', async () => {
    const state = setup();
    const first = await state.launch();
    expect(first.init.status).toBe(200);
    const projection = (first.body as any).projection;
    expect(projection.bindingId).toMatch(/^bd_[a-f0-9]{40}$/u);
    expect(projection.documentRequests[0].opaqueRouteKey).toMatch(/^bd_[a-f0-9]{40}-1-full-source-v1$/u);
    expect(projection).toMatchObject({ recipientId: 'student-1', context: { kind: 'public' }, actionFlags: { canAutosave: true, canSubmit: true } });
    expect(projection.documentRequests).toHaveLength(1);
    expect(JSON.stringify(first.body)).not.toMatch(/providerObjectKey|credentials|answerKey/);
    const current = await state.delivery.resolveCurrent('student-1', projection.context.contextId);
    expect(current?.record.binding.issuer).toEqual({ ownerId: 'teacher-1', authorityBoundary: 'public-library' });
    const replay = await state.launch();
    expect(replay.body).toEqual(first.body);
    const other = await state.launch('student-2', '00000000-0000-4000-8000-000000000002');
    expect(other.init.status).toBe(200);
    expect((other.body as any).projection.bindingId).not.toBe(projection.bindingId);
  });

  it('rejects a forged public context before document authority access', async () => {
    const state = setup();
    const first = await state.launch();
    const current = await state.delivery.resolveCurrent('student-1', (first.body as any).projection.context.contextId);
    state.readDocumentAuthority.mockClear();
    expect(await authorizePublicBookBinding(state.env, {
      ...current!.record.binding,
      context: { ...current!.record.binding.context, contextId: 'public-forged-context' },
    }, { publicationRepository: state.publicationRepository, readDocumentAuthority: state.readDocumentAuthority })).toBe(false);
    expect(state.readDocumentAuthority).not.toHaveBeenCalled();
  });

  it('denies wrong role and archival without creating an entitlement, and reauthorization revokes existing public access', async () => {
    const state = setup();
    state.profile.role = 'teacher';
    expect((await state.launch()).init.status).toBe(403);
    expect(state.readDocumentAuthority).not.toHaveBeenCalled();
    state.profile.role = 'student';
    const first = await state.launch();
    expect(first.init.status).toBe(200);
    const current = await state.delivery.resolveCurrent('student-1', (first.body as any).projection.context.contextId);
    state.readDocumentAuthority.mockClear();
    state.metadata.status = 'archived';
    expect(await authorizePublicBookBinding(state.env, current!.record.binding, { publicationRepository: state.publicationRepository, readDocumentAuthority: state.readDocumentAuthority })).toBe(false);
    expect((await state.launch('student-2')).init.status).toBe(403);
    expect(state.readDocumentAuthority).not.toHaveBeenCalled();
  });

  it('blocks private, disabled, missing or revoked source authority before issuance', async () => {
    for (const deny of [
      (state: ReturnType<typeof setup>) => { state.metadata.visibility = 'private'; },
      (state: ReturnType<typeof setup>) => { state.profile.status = 'blocked'; },
      (state: ReturnType<typeof setup>) => { state.sourceAuthority.sourceLocations = []; },
      (state: ReturnType<typeof setup>) => { state.sourceAuthority.revokedSourceVersionIds = ['source-v1']; },
    ]) {
      const state = setup();
      deny(state);
      expect((await state.launch()).init.status).not.toBe(200);
    }
  });
});
