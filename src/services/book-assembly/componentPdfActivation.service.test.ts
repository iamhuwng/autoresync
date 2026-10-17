import { describe, expect, it } from 'vitest';
import {
  activateComponentPdf,
  activeComponentPdfActivation,
  appendComponentPdfActivationReceipt,
  createComponentPdfActivationReceipt,
  fingerprintComponentPdfActivation,
  type ComponentPdfActivationInput,
} from './componentPdfActivation.service';
import type { BookAssemblyManifestCandidate } from '../../types/bookAssembly.types';
import { createComponentStudentDocument } from './componentStudentDocument.types';

const hash = (value: string) => value.repeat(64).slice(0, 64);
const input = (operationId = 'operation-1'): ComponentPdfActivationInput => ({
  operationId, ownerId: 'teacher-1', bookId: 'book-1', expectedBookRevision: 3,
  expectedSourceSetRevision: 5, activatedAt: '2026-09-20T00:00:00.000Z',
  sourceSet: { sourceStrategy: 'component_pdfs', sources: [
    { sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 1, ownerNodeKey: 'unit-a' },
    { sourceKey: 'b', sourceVersionId: 'b-v1', sourceOrder: 2, ownerNodeKey: 'unit-b' },
  ] },
  unitCandidates: [
    { unitKey: 'unit-a', candidateId: 'assembly-a', candidateRevision: 1, manifestFingerprint: hash('a') },
    { unitKey: 'unit-b', candidateId: 'assembly-b', candidateRevision: 1, manifestFingerprint: hash('b') },
  ],
  studentDocument: { sourceVersionId: 'student-v1', descriptorRevision: 6, descriptorFingerprint: hash('c') },
  activities: [
    { unitKey: 'unit-a', activityKey: 'activity-a', activityId: 'authoring-a', activityCandidateId: 'activity-candidate-a', activityCandidateRevision: 2, activityPayloadFingerprint: hash('d') },
  ],
});

const manifest: BookAssemblyManifestCandidate = {
  bookId: 'book-1',
  sourceSet: input().sourceSet,
  nodes: [
    { nodeKey: 'unit-a', parentNodeKey: null, nodeType: 'unit', order: 1 },
    { nodeKey: 'unit-b', parentNodeKey: null, nodeType: 'unit', order: 2 },
  ],
  units: [
    { unitKey: 'unit-a', activitySlots: [{ activityKey: 'activity-a', order: 1, contextRequirement: 'optional', pageGroupKeys: ['group-a'] }], pageGroups: [{ pageGroupKey: 'group-a', sourceKey: 'a', pages: [1], activityKeys: ['activity-a'], mode: 'activity', defaultPhysicalPageNumber: 1 }] },
    { unitKey: 'unit-b', activitySlots: [], pageGroups: [] },
  ],
};

describe('component PDF activation', () => {
  it('hydrates RTDB empty activities while preserving receipt fingerprint validation', () => {
    const receipt = createComponentPdfActivationReceipt({ ...input(), activities: [] });
    const { activities: _activities, ...wire } = receipt;
    expect(activeComponentPdfActivation({ ...receipt, setupActivations: [wire as typeof receipt] })).toEqual(receipt);
    const populated = createComponentPdfActivationReceipt(input());
    const { activities: _populatedActivities, ...tampered } = populated;
    expect(activeComponentPdfActivation({ ...populated, setupActivations: [tampered as typeof populated] })).toBeNull();
  });
  it('creates one exact tuple-qualified receipt and selects it only at the resulting tuple', () => {
    const receipt = createComponentPdfActivationReceipt(input());
    expect(receipt).toMatchObject({ bookRevision: 4, sourceSetRevision: 6 });
    expect(activeComponentPdfActivation({ ...receipt, setupActivations: [receipt] })).toEqual(receipt);
    expect(activeComponentPdfActivation({ ...receipt, bookRevision: 5, setupActivations: [receipt] })).toBeNull();
  });

  it('fingerprints expected revisions and every exact cross-domain reference', () => {
    const base = input();
    expect(fingerprintComponentPdfActivation({ ...base, expectedBookRevision: 4 }))
      .not.toBe(fingerprintComponentPdfActivation(base));
    expect(fingerprintComponentPdfActivation({ ...base, activities: [{ ...base.activities[0]!, activityCandidateRevision: 3 }] }))
      .not.toBe(fingerprintComponentPdfActivation(base));
    expect(fingerprintComponentPdfActivation({ ...base, activatedAt: '2026-09-20T00:00:01.000Z' }))
      .not.toBe(fingerprintComponentPdfActivation(base));
  });

  it('rejects empty, unsorted, duplicate, and cross-Unit references', () => {
    expect(() => createComponentPdfActivationReceipt({ ...input(), unitCandidates: [] })).toThrow();
    expect(() => createComponentPdfActivationReceipt({ ...input(), unitCandidates: [...input().unitCandidates].reverse() })).toThrow();
    expect(() => createComponentPdfActivationReceipt({ ...input(), activities: [{ ...input().activities[0]!, unitKey: 'missing' }] })).toThrow();
  });

  it('retains only the newest 32 receipts', () => {
    let receipts = [] as ReturnType<typeof createComponentPdfActivationReceipt>[];
    for (let index = 0; index < 33; index += 1) {
      receipts = [...appendComponentPdfActivationReceipt(receipts, createComponentPdfActivationReceipt(input(`operation-${index}`)))];
    }
    expect(receipts).toHaveLength(32);
    expect(receipts[0]?.operationId).toBe('operation-1');
    expect(receipts.at(-1)?.operationId).toBe('operation-32');
  });

  it.each([
    ['wrong owner', (receipt: ReturnType<typeof createComponentPdfActivationReceipt>) => ({ ...receipt, ownerId: 'teacher-2' })],
    ['wrong tuple', (receipt: ReturnType<typeof createComponentPdfActivationReceipt>) => ({ ...receipt, sourceSetRevision: 7 })],
    ['wrong descriptor', (receipt: ReturnType<typeof createComponentPdfActivationReceipt>) => ({ ...receipt, studentDocument: { ...receipt.studentDocument, descriptorRevision: 5 } })],
    ['wrong candidate order', (receipt: ReturnType<typeof createComponentPdfActivationReceipt>) => ({ ...receipt, unitCandidates: [...receipt.unitCandidates].reverse() })],
    ['wrong Activity revision', (receipt: ReturnType<typeof createComponentPdfActivationReceipt>) => ({ ...receipt, activities: [{ ...receipt.activities[0]!, activityCandidateRevision: 0 }] })],
    ['wrong fingerprint', (receipt: ReturnType<typeof createComponentPdfActivationReceipt>) => ({ ...receipt, inputFingerprint: hash('f') })],
  ])('fails closed on malformed persisted receipt history: %s', (_label, mutate) => {
    const receipt = createComponentPdfActivationReceipt(input());
    expect(activeComponentPdfActivation({ ...receipt, setupActivations: [mutate(receipt)] })).toBeNull();
  });

  it('prepares every exact record before the final and last durable activation write', async () => {
    const events: string[] = [];
    const descriptor = createComponentStudentDocument({
      sourceVersionId: 'student-v1', descriptorRevision: 6, sha256Hex: hash('c'),
      byteSize: 10, physicalPageCount: 2, compositionFingerprint: 'composition-1',
      components: [
        { sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 1, ownerNodeKey: 'unit-a', localPageCount: 1, combinedStartPage: 1, combinedEndPage: 1 },
        { sourceKey: 'b', sourceVersionId: 'b-v1', sourceOrder: 2, ownerNodeKey: 'unit-b', localPageCount: 1, combinedStartPage: 2, combinedEndPage: 2 },
      ],
    });
    const receipt = await activateComponentPdf({
      operationId: 'operation-1', ownerId: 'teacher-1', bookId: 'book-1',
      expectedBookRevision: 3, expectedSourceSetRevision: 5,
      sourceSet: input().sourceSet, manifest, studentDocumentSourceVersionId: 'student-v1',
      activatedAt: '2026-09-20T00:00:00.000Z',
    }, {
      readStudentDocument: async () => { events.push('descriptor'); return descriptor; },
      stageUnitCandidate: async (candidate) => {
        events.push(`candidate:${candidate.unitKey}`);
        return { candidateId: candidate.candidateId, ownerId: candidate.ownerId, bookId: candidate.bookId,
          bookRevision: candidate.bookRevision, sourceSetRevision: candidate.sourceSetRevision,
          unitKey: candidate.unitKey, revision: 1, lifecycle: 'validated', manifest: candidate.manifest,
          validation: { valid: true, errors: [] }, updatedAt: candidate.activatedAt };
      },
      readActivity: async () => { events.push('activity'); return { activityId: 'authoring-a',
        activityCandidateId: 'activity-candidate-a', activityCandidateRevision: 2,
        lifecycle: 'saved', payload: { prompt: 'A' } }; },
      activateMaterialBook: async (activation) => {
        events.push('activate');
        return createComponentPdfActivationReceipt(activation);
      },
    });
    expect(events).toEqual(['descriptor', 'candidate:unit-a', 'candidate:unit-b', 'activity', 'activate']);
    expect(receipt.unitCandidates.map((candidate) => candidate.unitKey)).toEqual(['unit-a', 'unit-b']);
  });

  it('does not activate when any prepared Activity readback fails', async () => {
    let activated = false;
    await expect(activateComponentPdf({
      operationId: 'operation-1', ownerId: 'teacher-1', bookId: 'book-1',
      expectedBookRevision: 3, expectedSourceSetRevision: 5,
      sourceSet: input().sourceSet, manifest, studentDocumentSourceVersionId: 'student-v1',
      activatedAt: '2026-09-20T00:00:00.000Z',
    }, {
      readStudentDocument: async () => createComponentStudentDocument({
        sourceVersionId: 'student-v1', descriptorRevision: 6, sha256Hex: hash('c'), byteSize: 10,
        physicalPageCount: 2, compositionFingerprint: 'composition-1', components: [
          { sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 1, ownerNodeKey: 'unit-a', localPageCount: 1, combinedStartPage: 1, combinedEndPage: 1 },
          { sourceKey: 'b', sourceVersionId: 'b-v1', sourceOrder: 2, ownerNodeKey: 'unit-b', localPageCount: 1, combinedStartPage: 2, combinedEndPage: 2 },
        ],
      }),
      stageUnitCandidate: async (candidate) => ({ candidateId: candidate.candidateId, ownerId: candidate.ownerId,
        bookId: candidate.bookId, bookRevision: candidate.bookRevision, sourceSetRevision: candidate.sourceSetRevision,
        unitKey: candidate.unitKey, revision: 1, lifecycle: 'validated', manifest: candidate.manifest,
        validation: { valid: true, errors: [] }, updatedAt: candidate.activatedAt }),
      readActivity: async () => null,
      activateMaterialBook: async (activation) => { activated = true; return createComponentPdfActivationReceipt(activation); },
    })).rejects.toThrow('component_pdf_activation_activity_unavailable');
    expect(activated).toBe(false);
  });
});
