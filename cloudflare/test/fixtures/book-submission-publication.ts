import { normalizeActivity } from '../../../src/services/book-activity/activityCanonical.service.ts';
import { createComponentStudentDocument } from '../../../src/services/book-assembly/componentStudentDocument.types.ts';
import type { ComponentPdfsSourceSetCandidate } from '../../../src/types/bookAssembly.types.ts';

export const fingerprint = 'a'.repeat(64);
export const operationId = '11111111-1111-4111-8111-111111111111';
export const ownerId = 'teacher-1';
export const bookId = 'book-1';
export const now = '2026-10-09T00:00:00.000Z';

export const sourceReceipt = (sourceKey: string, sourceVersionId: string) => ({
  sourceKey, sourceVersionId, purpose: 'book-source', sha256Hex: fingerprint,
  byteSize: 10, physicalPageCount: 1, verifiedUsable: true, studentSafeStatus: 'ready',
});

export const editableActivity = {
  schemaVersion: 1, title: 'Activity', taskProfile: null, presentationMode: 'structured',
  contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] }, instructions: [{ text: 'Choose.' }],
  interaction: { family: 'choice', variant: 'single-choice' },
  answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 }, stimulus: null,
  assetRefs: [], interactions: [{ prompt: 'Pick', options: ['A', 'B'], acceptedOptionIndexes: [0] }],
  scoring: { mode: 'auto-where-possible' },
};
export const activity = normalizeActivity(editableActivity as never);

export const manifest = (strategy: 'full_pdf' | 'component_pdfs') => ({
  bookId,
  sourceSet: strategy === 'full_pdf'
    ? { sourceStrategy: 'full_pdf' as const, sources: [{ sourceKey: 'full', sourceVersionId: 'full-v1', sourceOrder: 1 }] as const }
    : { sourceStrategy: 'component_pdfs' as const, sources: [
      { sourceKey: 'part-a', sourceVersionId: 'part-a-v1', sourceOrder: 1, ownerNodeKey: 'unit-1' },
      { sourceKey: 'part-b', sourceVersionId: 'part-b-v1', sourceOrder: 2, ownerNodeKey: 'unit-1' },
    ] as const },
  nodes: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1, title: 'Vocabulary Unit' }],
  units: [{ unitKey: 'unit-1', activitySlots: [{ activityKey: 'activity-1', order: 1, contextRequirement: 'required', pageGroupKeys: ['pages-1'] }],
    pageGroups: [{ pageGroupKey: 'pages-1', sourceKey: strategy === 'full_pdf' ? 'full' : 'part-a', pages: [1], activityKeys: ['activity-1'], mode: 'activity' }] }],
});

export const verifiedSource = (receipt: ReturnType<typeof sourceReceipt>, purpose: 'book-source' | 'student-document' = 'book-source') => ({
  bookId, sourceKey: receipt.sourceKey, sourceVersionId: receipt.sourceVersionId,
  checksum: { algorithm: 'sha-256' as const, value: receipt.sha256Hex },
  byteSize: receipt.byteSize, physicalPageCount: receipt.physicalPageCount, verifiedUsable: true,
  purpose, studentSafeStatus: 'ready' as const,
  studentSafeDecision: { decidedBy: ownerId, decidedAt: now, sourceVersionId: receipt.sourceVersionId,
    sha256Hex: receipt.sha256Hex, reasonCode: 'teacher-reviewed' as const },
});

export const operation = {
  schemaVersion: 1 as const, operationId, ownerId, finalBookId: bookId,
  idempotencyKey: 'submission-1', fingerprint, state: 'committing' as const,
  completedSteps: ['begin', 'commit'] as const, createdAt: now, updatedAt: now,
  commitLeaseId: 'lease-1', commitLeaseExpiresAt: Date.now() + 60_000,
};

export const env = {
  FIREBASE_DB_URL: 'https://firebase.test', FIREBASE_PROJECT_ID: 'project-1',
  FIREBASE_WEB_API_KEY: 'web-key', BOOK_SUBMISSION_SERVICE_IDENTITY: 'worker@project-1.iam.gserviceaccount.com',
  BOOK_ASSEMBLY_PREVIEW_REGISTRY_VERSION: 'activity-renderer-manifest-v1@sha256:8024a3676ee93496c00ca1f958385e86a4ab78560153e856c18eb219ef34323f',
  BOOK_SUBMISSION_GOOGLE_SA_KEY: '',
};

export const request = new Request('https://worker.test/v1/book-submissions', { method: 'POST' });

export const componentArtifact = () => {
  const sourceSet = manifest('component_pdfs').sourceSet as ComponentPdfsSourceSetCandidate;
  const descriptor = createComponentStudentDocument({
    sourceVersionId: 'student-document-v1', descriptorRevision: 38, sha256Hex: fingerprint,
    byteSize: 20, physicalPageCount: 2, compositionFingerprint: fingerprint,
    components: [
      { sourceKey: 'part-a', sourceVersionId: 'part-a-v1', sourceOrder: 1, ownerNodeKey: 'unit-1', localPageCount: 1, combinedStartPage: 1, combinedEndPage: 1 },
      { sourceKey: 'part-b', sourceVersionId: 'part-b-v1', sourceOrder: 2, ownerNodeKey: 'unit-1', localPageCount: 1, combinedStartPage: 2, combinedEndPage: 2 },
    ],
  });
  return {
    schemaVersion: 1 as const, kind: 'component-pdf-prepared-artifact' as const,
    operationId, ownerId, bookId, fingerprint, active: false as const,
    sourceSet,
    sourceReceipts: [
      { sourceKey: 'part-a', sourceVersionId: 'part-a-v1', checksum: { algorithm: 'sha-256' as const, value: fingerprint }, byteSize: 10, physicalPageCount: 1 },
      { sourceKey: 'part-b', sourceVersionId: 'part-b-v1', checksum: { algorithm: 'sha-256' as const, value: fingerprint }, byteSize: 10, physicalPageCount: 1 },
    ],
    composition: { sha256Hex: fingerprint,
      mapping: [0, 1].map((componentIndex) => ({ componentIndex, fileName: `part-${componentIndex}.pdf`, pageCount: 1, startPage: componentIndex + 1, endPage: componentIndex + 1 })),
      inputManifest: [0, 1].map((componentIndex) => ({ componentIndex, sha256Hex: fingerprint, byteSize: 10, pageCount: 1 })) },
    studentDocument: { sourceVersionId: descriptor.sourceVersionId, sha256Hex: fingerprint, byteSize: 20, physicalPageCount: 2, verifiedUsable: true as const, studentSafeStatus: 'ready' as const },
    descriptor,
  };
};
