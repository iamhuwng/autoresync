import { describe, expect, it } from 'vitest';
import { InMemoryBookDeliveryRepository } from './bookDelivery.entitlementRepository';
import type { BookDeliveryPublishedPublicationReference } from './bookDelivery.publication';
import type { ClassBookCopyIdentity, ClassBookPlacement } from './classBookPlacement.types';
import {
  ClassBookDeliveryProductionError,
  createClassBookDeliveryProductionAdapter,
  type ClassBookDeliveryPorts,
} from '../../../cloudflare/src/upload-worker/class-book-placement/production.ts';
import { createBookRuntimeWorkerHandlers } from '../../../cloudflare/src/upload-worker/book-runtime/worker.ts';
import { InMemoryBookRuntimeRepository } from '../../../cloudflare/src/upload-worker/book-runtime/repository.ts';
import type { NormalizedActivity } from '../../types/bookActivity.types';

const now = '2026-08-08T00:00:00.000Z';
const operation = '11111111-1111-4111-8111-111111111111';
const laterOperation = '22222222-2222-4222-8222-222222222222';

const placement: ClassBookPlacement = {
  schemaVersion: 1,
  classPlacementId: 'placement-1',
  classId: 'class-1',
  copyId: 'copy-1',
  classCourseId: 'class-course-1',
  sourceCourseId: 'course-1',
  courseMaterialId: 'class-material-1',
  sourceCourseMaterialId: 'course-material-1',
  ownerId: 'teacher-1',
  sourcePlacementRevision: 1,
  placementRevision: 1,
  status: 'active',
  pins: {
    bookId: 'book-1', publicationId: 'publication-1', publicationRevision: 2,
    manifestVersionId: 'manifest-1', unitStableKey: 'unit-1', unitVersionId: 'unit-version-1',
    sourceVersionId: 'source-version-1', bindingRevision: 'legacy-binding-1',
  },
  selection: { kind: 'placements', nodeKeys: [], placementIds: ['placement-1'] },
  activities: [{
    placementId: 'placement-1', activityId: 'activity-1', activityVersionId: 'activity-version-1',
    unitStableKey: 'unit-1', unitVersionId: 'unit-version-1', sourceVersionId: 'source-version-1',
    pageGroupId: 'page-group-1', physicalPageNumber: 1, order: 0, title: 'Activity one',
  }],
  sourceFingerprint: 'source-fingerprint',
  title: 'Class Book',
  createdAt: now,
  createdBy: 'teacher-1',
  updatedAt: now,
  updatedBy: 'teacher-1',
};

const copy: ClassBookCopyIdentity = {
  schemaVersion: 1,
  copyId: 'copy-1', classId: 'class-1', classCourseId: 'class-course-1',
  sourceCourseId: 'course-1', sourceCourseMaterialId: 'course-material-1', ownerId: 'teacher-1',
  status: 'active', copyRevision: 1, createdAt: now, createdBy: 'teacher-1', updatedAt: now, updatedBy: 'teacher-1',
};

const publication: BookDeliveryPublishedPublicationReference = {
  bookId: 'book-1', bookMode: 'pdf', bookRevision: 1,
  manifestVersionId: 'manifest-1', publicationId: 'publication-1', publicationRevision: 2, publicationStatus: 'published', ownerId: 'teacher-1',
  scope: { kind: 'placements', nodeKeys: [], placementIds: ['placement-1'] },
  outline: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1, titleSnapshot: 'Unit one' }],
  sourceSet: { strategy: 'full_pdf', sources: [{
    sourceKey: 'source-1', sourceVersionId: 'source-version-1', lifecycle: 'verified-usable',
    localPageScope: { kind: 'all', pages: [] },
  }] },
  placements: [{
    placementId: 'placement-1', activityId: 'activity-1', activityVersionId: 'activity-version-1', activityVersion: 1,
    nodeKey: 'unit-1', order: 1, contextMode: 'required', pageGroupKeys: ['page-group-1'],
    sourcePageScopes: [{ sourceKey: 'source-1', pages: [1] }],
  }],
  schedulePolicy: { policyId: 'class-policy', policyRevision: 1, basis: 'immutable-reference' },
};

const setup = (selected = placement, published = publication) => {
  const repository = new InMemoryBookDeliveryRepository();
  let classRecord: unknown = { createdBy: 'teacher-1', status: 'active' };
  let membership: unknown = { uid: 'student-1', status: 'active' };
  let lock: unknown = null;
  let current: ClassBookPlacement | null = selected;
  const ports: ClassBookDeliveryPorts = {
    readValue: async (path) => path.endsWith('/students/student-1') ? membership : classRecord,
    placements: {
      readCurrent: async () => current,
      readCopy: async () => copy,
      readLock: async () => lock as never,
    },
    deliveryRepository: repository,
    loadPublication: async () => published,
    now: () => now,
  };
  return {
    adapter: createClassBookDeliveryProductionAdapter(ports),
    repository,
    setMembership: (value: unknown) => { membership = value; },
    setClass: (value: unknown) => { classRecord = value; },
    setLock: (value: unknown) => { lock = value; },
    setCurrent: (value: ClassBookPlacement | null) => { current = value; },
  };
};

const identity = {
  classId: 'class-1', copyId: 'copy-1', classPlacementId: 'placement-1',
  classCourseMaterialId: 'class-material-1', studentId: 'student-1',
};

describe('canonical Class Book delivery production adapter', () => {
  it('prepares and resolves only canonical runtime projections from exact frozen authority', async () => {
    const { adapter, repository } = setup();
    const prepared = await adapter.prepare({ ...identity, operationId: operation });
    expect(prepared).toMatchObject({
      projectionKind: 'book-runtime-delivery',
      context: {
        kind: 'class', entitlementBasis: 'membership',
        contextId: 'class-class-1-copy-copy-1-material-class-material-1-placement-placement-1',
      },
      book: { publicationId: 'publication-1', publicationRevision: 2 },
    });
    const binding = await repository.readBinding(prepared.bindingId);
    expect(binding?.binding.context).toMatchObject({
      classLocator: {
        classId: placement.classId, copyId: placement.copyId,
        classPlacementId: placement.classPlacementId, courseMaterialId: placement.courseMaterialId,
      },
    });
    expect(prepared).not.toHaveProperty('binding');
    await expect(adapter.resolve({ ...identity, bindingId: prepared.bindingId })).resolves.toEqual(prepared);
    await expect(adapter.resolve({ ...identity, bindingId: 'forged-binding' }))
      .rejects.toMatchObject({ code: 'class_book_delivery_context_denied' });
  });

  it('fails closed when membership, class status, placement, or frozen publication authority changes', async () => {
    const { adapter, setMembership, setClass, setCurrent } = setup();
    setMembership({ uid: 'student-1', status: 'removed' });
    await expect(adapter.prepare({ ...identity, operationId: operation })).rejects.toMatchObject({ code: 'class_book_enrollment_denied' });
    setMembership({ uid: 'student-1', status: 'active' });
    setClass({ createdBy: 'teacher-1', status: 'archived' });
    await expect(adapter.prepare({ ...identity, operationId: operation })).rejects.toMatchObject({ code: 'class_book_class_unavailable' });
    setClass({ createdBy: 'teacher-1', status: 'active' });
    setCurrent({ ...placement, status: 'superseded' });
    await expect(adapter.prepare({ ...identity, operationId: operation })).rejects.toMatchObject({ code: 'class_book_placement_unavailable' });
  });

  it('does not treat legacy frozen records without the exact publication revision as runnable', async () => {
    const { adapter, setCurrent } = setup();
    setCurrent({ ...placement, pins: { ...placement.pins, publicationRevision: 0 } });
    await expect(adapter.prepare({ ...identity, operationId: operation })).rejects.toBeInstanceOf(ClassBookDeliveryProductionError);
  });

  it('blocks new issuance after Class archive while preserving existing pinned delivery resolution', async () => {
    const { adapter, setClass } = setup();
    const existing = await adapter.prepare({ ...identity, operationId: operation });
    setClass({ createdBy: 'teacher-1', status: 'archived' });
    await expect(adapter.resolve({ ...identity, bindingId: existing.bindingId })).resolves.toEqual(existing);
    await expect(adapter.prepare({ ...identity, operationId: laterOperation }))
      .rejects.toMatchObject({ code: 'class_book_class_unavailable' });
  });

  it('denies Class delivery issuance when the placement is locked', async () => {
    const { adapter, setLock } = setup();
    setLock({
      classId: 'class-1', classPlacementId: 'placement-1', state: 'locked', revision: 1,
      changedBy: 'teacher-1', changedAt: now, operationId: operation,
    });
    await expect(adapter.prepare({ ...identity, operationId: operation }))
      .rejects.toMatchObject({ code: 'class_book_locked' });
  });

  it('keeps same-Activity placements independent through canonical Class issuance, draft and terminal submission', async () => {
    const selected = {
      ...placement, selection: { ...placement.selection, placementIds: ['placement-1', 'placement-2'] },
      activities: [...placement.activities, { ...placement.activities[0]!, placementId: 'placement-2', order: 1 }],
    };
    const published = { ...publication, scope: selected.selection, placements: [
      ...publication.placements, { ...publication.placements[0]!, placementId: 'placement-2', order: 2 },
    ] };
    const { adapter, repository, setClass, setLock, setMembership } = setup(selected, published);
    const projection = await adapter.prepare({ ...identity, operationId: operation });
    const binding = (await repository.readBinding(projection.bindingId))!.binding;
    const runtimeRepository = new InMemoryBookRuntimeRepository();
    const activity: NormalizedActivity = {
      schemaVersion: 1, title: 'Shared Activity', taskProfile: null, presentationMode: 'structured',
      contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] }, instructions: [{ text: 'Answer.' }],
      stimulus: null, assetRefs: [], interaction: { family: 'text-entry', variant: 'generic' },
      answerRule: { defaultPoints: 1, normalization: 'exact' }, scoring: { mode: 'auto-where-possible' },
      interactions: [{ family: 'text-entry', interactionId: 'interaction-1', prompt: 'Answer.',
        itemIdentities: { family: 'text-entry', itemIds: [] },
        answerKey: { family: 'text-entry', acceptedAnswers: ['first'] } }],
    };
    const authorize = async () => {
      try { await adapter.resolve({ ...identity, bindingId: binding.bindingId }); return { outcome: 'allowed' as const }; }
      catch { return { outcome: 'denied' as const, code: 'runtime_class_membership_denied' }; }
    };
    const runtime = createBookRuntimeWorkerHandlers({
      repository: runtimeRepository, resolveBinding: async () => binding, resolveActivity: async () => activity,
      resolveAttemptPolicy: async () => ({ maxAttempts: 2, feedbackPolicy: 'after_completion' }),
      schedulePolicy: { authorize, revalidate: authorize }, requireCanonicalDraftForSubmit: true, now: () => now,
    });
    let operationNumber = 3;
    const command = (placementId: string, commandKind: 'autosave' | 'submit', answer: string, clientRevision: number) => runtime.command({
      request: new Request('https://worker.test/book-runtime/commands', { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({
          operationId: `00000000-0000-4000-8000-${String(operationNumber++).padStart(12, '0')}`,
          commandKind, bindingId: binding.bindingId, bindingRevision: binding.revision,
          contextId: binding.context.contextId, placementId, activityId: 'activity-1', activityVersion: 1,
          interactionId: 'interaction-1', clientRevision, response: [{ interactionId: 'interaction-1', answer }],
        }) }), env: {}, uid: 'student-1',
    });
    expect((await command('placement-1', 'autosave', 'first', 0)).body.status).toBe('accepted');
    expect((await command('placement-2', 'autosave', 'second', 0)).body.status).toBe('accepted');
    const first = await command('placement-1', 'submit', 'first', 1);
    expect(first.body.status).toBe('accepted');
    const rows = (placementId: string) => runtimeRepository.listTerminalTuples({ recipientId: 'student-1',
      contextId: binding.context.contextId, placementId, activityId: 'activity-1', activityVersion: 1, limit: 50 });
    expect(await rows('placement-2')).toHaveLength(0);
    const second = await command('placement-2', 'submit', 'second', 1);
    expect(second.body.status).toBe('accepted');
    const left = (await rows('placement-1'))[0]!;
    const right = (await rows('placement-2'))[0]!;
    expect(left.attempt.attemptId).not.toBe(right.attempt.attemptId);
    expect(left.attempt.response).toEqual([{ interactionId: 'interaction-1', answer: 'first' }]);
    expect(right.attempt.response).toEqual([{ interactionId: 'interaction-1', answer: 'second' }]);
    expect(left.attempt.attemptNumber).toBe(1);
    expect(right.attempt.attemptNumber).toBe(1);
    setClass({ createdBy: 'teacher-1', status: 'archived' });
    expect(await adapter.resolve({ ...identity, bindingId: binding.bindingId })).toEqual(projection);
    await expect(adapter.prepare({ ...identity, operationId: laterOperation })).rejects.toMatchObject({ code: 'class_book_class_unavailable' });
    setLock({ classId: 'class-1', classPlacementId: 'placement-1', state: 'locked', revision: 1 });
    expect((await command('placement-2', 'autosave', 'changed', 1)).init.status).toBe(403);
    setLock(null);
    setMembership({ uid: 'student-1', status: 'removed' });
    expect((await command('placement-1', 'autosave', 'changed', 1)).init.status).toBe(403);
    expect(await rows('placement-1')).toEqual([left]);
    expect(await rows('placement-2')).toEqual([right]);
  });
});
