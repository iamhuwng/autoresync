import { describe, expect, it } from 'vitest';
import { createBookAssemblyWorkerHandlers, type BookAssemblyRepositoryPort } from '../../../cloudflare/src/upload-worker/book-assembly/worker';
import type { BookAssemblyBookAuthority, BookAssemblyCandidateRecord } from './unitAssembly.types';
import type { BookAssemblyScope } from '../../../cloudflare/src/upload-worker/book-assembly/repository';
import { createComponentPdfActivationReceipt, fingerprintComponentPdfActivationValue } from './componentPdfActivation.service';
import { canonicalActivityPayloadFingerprint } from './unitPreview.service';
import type { BookAssemblyManifestCandidate } from '../../types/bookAssembly.types';

const operationId = '123e4567-e89b-42d3-a456-426614174000';
const activity = {
  schemaVersion: 1 as const, title: 'Activity', taskProfile: null, presentationMode: 'structured' as const,
  contextRequirement: { mode: 'none' as const, acceptedKinds: [] }, instructions: [{ text: 'Choose.' }],
  interaction: { family: 'choice' as const, variant: 'single-choice' as const },
  answerRule: { defaultPoints: 1, normalization: 'exact' as const, requiredSelectionCount: 1 },
  stimulus: null, assetRefs: [], interactions: [{ prompt: 'Pick', options: ['A'], acceptedOptionIndexes: [0] }],
  scoring: { mode: 'auto-where-possible' as const },
};
const sourceSet = { sourceStrategy: 'component_pdfs' as const, sources: [
  { sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 1, ownerNodeKey: 'unit-a' },
  { sourceKey: 'b', sourceVersionId: 'b-v1', sourceOrder: 2, ownerNodeKey: 'unit-b' },
] };
const manifest: BookAssemblyManifestCandidate = {
  bookId: 'book-1', sourceSet,
  nodes: [
    { nodeKey: 'unit-a', parentNodeKey: null, nodeType: 'unit', order: 1 },
    { nodeKey: 'unit-b', parentNodeKey: null, nodeType: 'unit', order: 2 },
  ],
  units: [
    { unitKey: 'unit-a', activitySlots: [{ activityKey: 'activity-a', order: 1, contextRequirement: 'none', pageGroupKeys: [] }], pageGroups: [] },
    { unitKey: 'unit-b', activitySlots: [], pageGroups: [] },
  ],
};
const candidate: BookAssemblyCandidateRecord = {
  candidateId: 'assembly-a', ownerId: 'teacher-1', bookId: 'book-1', bookRevision: 4,
  sourceSetRevision: 6, unitKey: 'unit-a', revision: 1, lifecycle: 'validated', manifest,
  validation: { valid: true, errors: [] }, updatedAt: '2026-09-20T00:00:00.000Z',
};
const receipt = createComponentPdfActivationReceipt({
  operationId, ownerId: 'teacher-1', bookId: 'book-1', expectedBookRevision: 3,
  expectedSourceSetRevision: 5, sourceSet,
  unitCandidates: [
    { unitKey: 'unit-a', candidateId: candidate.candidateId, candidateRevision: 1, manifestFingerprint: fingerprintComponentPdfActivationValue(manifest) },
    { unitKey: 'unit-b', candidateId: 'assembly-b', candidateRevision: 1, manifestFingerprint: fingerprintComponentPdfActivationValue(manifest) },
  ],
  studentDocument: { sourceVersionId: 'student-v1', descriptorRevision: 6, descriptorFingerprint: 'a'.repeat(64) },
  activities: [{ unitKey: 'unit-a', activityKey: 'activity-a', activityId: 'activity-id',
    activityCandidateId: 'activity-candidate', activityCandidateRevision: 2,
    activityPayloadFingerprint: canonicalActivityPayloadFingerprint(activity) }],
  activatedAt: '2026-09-20T00:00:00.000Z',
});
const authority: BookAssemblyBookAuthority = {
  bookId: 'book-1', ownerId: 'teacher-1', bookMode: 'pdf', bookRevision: 4,
  sourceSetRevision: 6, sourceSet, setupActivations: [receipt],
  sourceVersionAuthority: { getSourceVersion: () => undefined },
};

class Repository implements BookAssemblyRepositoryPort {
  scope: BookAssemblyScope = { candidates: { [candidate.candidateId]: candidate } };
  readValue = async () => ({ role: 'teacher', status: 'active' });
  readScope = async () => structuredClone(this.scope);
  transaction = async <T,>(_bookId: string, _unitKey: string, mutate: (scope: BookAssemblyScope) => { outcome: T; next?: BookAssemblyScope; write: boolean }) => {
    const result = mutate(structuredClone(this.scope));
    if (result.write) this.scope = structuredClone(result.next ?? this.scope);
    return result.outcome;
  };
}

describe('A0 Material-qualified Assembly worker', () => {
  it('fails closed unless exact receipt-pinned Activity references verify', async () => {
    const repository = new Repository();
    const create = (verified: boolean) => createBookAssemblyWorkerHandlers({
      repository, readBookAuthority: async () => authority,
      verifyActivatedActivities: async (input) => verified && input.activityKeys.join() === 'activity-a',
    });
    await expect(create(false).loadCurrent({ env: {} as never, uid: 'teacher-1', bookId: 'book-1', unitKey: 'unit-a' }))
      .resolves.toMatchObject({ body: { status: 'empty' } });
    await expect(create(true).loadCurrent({ env: {} as never, uid: 'teacher-1', bookId: 'book-1', unitKey: 'unit-a' }))
      .resolves.toMatchObject({ body: { status: 'loaded', savedActivityKeysByUnit: { 'unit-a': ['activity-a'] } } });
  });

  it('rejects in-place mutation of the exact activated Assembly candidate', async () => {
    const repository = new Repository();
    const handlers = createBookAssemblyWorkerHandlers({ repository, readBookAuthority: async () => authority });
    const response = await handlers.discard({
      request: new Request('https://assembly.test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        operationId: '123e4567-e89b-42d3-a456-426614174001', bookId: 'book-1', unitKey: 'unit-a',
        candidateId: candidate.candidateId, expectedCandidateRevision: candidate.revision,
      }) }),
      env: { BOOK_ASSEMBLY_MUTATIONS_ENABLED: 'true' } as never, uid: 'teacher-1', bookId: 'book-1',
    });
    expect(response).toMatchObject({ init: { status: 409 }, body: { status: 'conflict' } });
    expect(repository.scope.candidates?.[candidate.candidateId]).toEqual(candidate);
  });
});
