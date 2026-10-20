import { canonicalActivityVersionStudentSafeProjection } from '../book-assembly/canonical-activity-version-repository.ts';
import type { NormalizedActivity } from '../../../../src/types/bookActivity.types.ts';
import type { BookAssemblyManifestCandidate, TrustedBookSourceVersionProjection } from '../../../../src/types/bookAssembly.types.ts';
import { buildFullPdfPublication } from '../../../../src/services/book-assembly/fullPdfPublication.adapter.ts';
import { buildComponentPdfPublication, aggregateComponentPdfPublications } from '../../../../src/services/book-assembly/componentPdfPublication.adapter.ts';
import { createCanonicalBookAssemblyPublicationService } from '../../../../src/services/book-assembly/canonicalPublication.service.ts';
import { buildMaterialBookIndexWrites } from '../../../../src/services/materialCatalog/materialBooks.service.ts';
import { createMaterialBookSummary } from '../../../../src/services/materialCatalog/materialSummaryAdapters.service.ts';
import { buildMaterialSummaryUpdatePayload } from '../../../../src/services/materialCatalog/materialSummaryPort.service.ts';
import { materialCatalogPaths } from '../../../../src/services/materialCatalog/materialCatalogPaths.ts';
import { FirebaseRtdbRestClient } from '../listening-authoring/rtdb.ts';
import { createFirebaseClaimTokenProvider, type BookFirebaseClaimTuple } from '../book-activity-authoring/firebase-token.ts';
import type { PreparedComponentPdfArtifact } from './component-preparation.ts';
import { BookSubmissionWorkerError, type BookSubmissionWorkerEnv } from './worker.ts';
import type { BookSubmissionOperation } from '../../../../src/services/materialCatalog/bookSubmission.contract.ts';
import { normalizeBookSubmissionMetadata } from '../../../../src/services/materialCatalog/bookSubmissionInput.service.ts';
import {
  activityPayloadsForUnit, isPreparedComponentArtifact, materialNodes, publicationId,
  publicationOperationUuid, publicationScopeWrites, preparedCandidate, record,
  sameComponentSourceSet, submissionAssemblySeedWrites,
  type PublicationScope, type RecordValue,
} from './publication-projections.ts';
import { qualifyBookSubmissionPublication } from './qualification.ts';
import { normalizeTrustedSourceUploadDatabaseUrl } from '../../../../src/services/book-source-delivery/sourceUpload.firebaseRtdbTransaction.ts';

export type BookSubmissionVerifiedSource = TrustedBookSourceVersionProjection & { readonly byteSize: number };

export const normalizeMetadata = (value: unknown): RecordValue => {
  try { return normalizeBookSubmissionMetadata(value); }
  catch { throw new BookSubmissionWorkerError('book_submission_metadata_invalid', 409); }
};

export interface BookSubmissionPreparedPublication {
  readonly strategy: 'full_pdf' | 'component_pdfs';
  readonly manifest: unknown;
  readonly activitiesByKey: Readonly<Record<string, NormalizedActivity>>;
  readonly componentArtifact?: PreparedComponentPdfArtifact;
}

export interface BookSubmissionPublicationFinalizer {
  /** Must prepare immutable publication artifacts and atomically expose the canonical Book. */
  readonly commit: (input: {
    readonly operation: BookSubmissionOperation;
    readonly uid: string;
    readonly operationId: string;
    readonly finalBookId: string;
    readonly fingerprint: string;
    readonly metadata: RecordValue;
    readonly prepared: BookSubmissionPreparedPublication;
    readonly sources: readonly BookSubmissionVerifiedSource[];
    readonly studentDocumentSource?: BookSubmissionVerifiedSource;
    readonly env: BookSubmissionWorkerEnv;
    readonly request: Request;
    readonly componentArtifact?: PreparedComponentPdfArtifact;
  }) => Promise<void>;
}

const scopedPublicationToken = (
  env: BookSubmissionWorkerEnv,
  operation: import('../../../../src/services/materialCatalog/bookSubmission.contract.ts').BookSubmissionOperation,
): (() => Promise<string>) => {
  const localEmulator = env.LOCAL_EMULATOR_AUTH === 'true';
  if (localEmulator) {
    if (env.FIREBASE_PROJECT_ID !== 'demo-luyentap-local' || typeof env.FIREBASE_DB_URL !== 'string') {
      throw new BookSubmissionWorkerError('book_submission_service_unavailable', 503);
    }
    normalizeTrustedSourceUploadDatabaseUrl(env.FIREBASE_DB_URL, true);
  }
  const identity = env.BOOK_SUBMISSION_SERVICE_IDENTITY;
  const raw = env.BOOK_SUBMISSION_GOOGLE_SA_KEY;
  const project = env.FIREBASE_PROJECT_ID;
  const apiKey = env.FIREBASE_WEB_API_KEY;
  if (typeof identity !== 'string' || typeof raw !== 'string' || typeof project !== 'string'
    || typeof apiKey !== 'string' || typeof operation.commitLeaseId !== 'string') {
    throw new BookSubmissionWorkerError('book_submission_service_unavailable', 503);
  }
  const provider = createFirebaseClaimTokenProvider({
    serviceAccountJson: raw,
    serviceIdentity: identity,
    firebaseProjectId: project,
    firebaseWebApiKey: apiKey,
    localEmulator,
  });
  const claims: BookFirebaseClaimTuple = {
    service: 'book_submission', ownerId: operation.ownerId, bookId: operation.finalBookId,
    operationId: operation.operationId, fingerprint: operation.fingerprint,
    leaseId: operation.commitLeaseId,
  };
  return () => provider(claims);
};

export const createProductionBookSubmissionPublicationFinalizer = (): BookSubmissionPublicationFinalizer => ({
  commit: async (input) => {
    const metadata = normalizeMetadata(input.metadata);
    const manifestValue = input.prepared.manifest;
    const manifest = manifestValue as BookAssemblyManifestCandidate;
    if (!record(manifestValue) || manifest.bookId !== input.finalBookId
      || !Array.isArray(manifest.units) || manifest.units.length === 0
      || !record(manifest.sourceSet)
      || (input.prepared.strategy === 'component_pdfs' && manifest.sourceSet.sourceStrategy !== 'component_pdfs')
      || !Array.isArray(manifest.sourceSet.sources)) {
      throw new BookSubmissionWorkerError('book_submission_authoring_invalid', 409);
    }
    const componentArtifact = input.componentArtifact;
    if (input.prepared.strategy === 'component_pdfs') {
      if (!isPreparedComponentArtifact(componentArtifact) || componentArtifact.operationId !== input.operationId
        || componentArtifact.ownerId !== input.uid || componentArtifact.bookId !== input.finalBookId
        || componentArtifact.fingerprint !== input.fingerprint
        || componentArtifact.active !== false || componentArtifact.sourceSet.sourceStrategy !== 'component_pdfs'
        || !sameComponentSourceSet(componentArtifact.sourceSet, manifest.sourceSet)
        || componentArtifact.sourceReceipts.length !== input.sources.length
        || componentArtifact.sourceReceipts.some((source) => !input.sources.some((receipt) =>
          receipt.sourceKey === source.sourceKey && receipt.sourceVersionId === source.sourceVersionId
          && receipt.checksum.value.toLowerCase() === source.checksum.value.toLowerCase()
          && receipt.byteSize === source.byteSize && receipt.physicalPageCount === source.physicalPageCount))
        || componentArtifact.descriptor.sourceVersionId !== componentArtifact.studentDocument.sourceVersionId
        || componentArtifact.descriptor.sha256Hex !== componentArtifact.studentDocument.sha256Hex
        || componentArtifact.descriptor.compositionFingerprint !== componentArtifact.composition.sha256Hex
        || componentArtifact.descriptor.compositionFingerprint !== componentArtifact.studentDocument.sha256Hex
        || componentArtifact.descriptor.byteSize !== componentArtifact.studentDocument.byteSize
        || componentArtifact.descriptor.physicalPageCount !== componentArtifact.studentDocument.physicalPageCount) {
        throw new BookSubmissionWorkerError('book_submission_component_preparation_required', 409);
      }
    }
    const now = new Date().toISOString();
    const commandId = publicationOperationUuid(input.operationId);
    const candidateFor = (unitKey: string) => preparedCandidate(input.uid, input.finalBookId, unitKey, manifest, now);
    const planId = publicationId('plan', commandId, 'root');
    const manifestVersionId = publicationId('manifest', commandId, 'root');
    const publicationIdValue = publicationId('publication', commandId, 'root');
    const idsFor = (unitKey: string) => ({
      planId, manifestVersionId, publicationId: publicationIdValue, publicationRevision: 1,
      unitProjectionId: publicationId('unit', commandId, unitKey),
      deliveryPlanId: publicationId('delivery', commandId, unitKey),
      activitiesByKey: Object.fromEntries((manifest.units.find((u) => u.unitKey === unitKey)?.activitySlots ?? [])
        .map((slot) => [slot.activityKey, {
          activityId: publicationId('activity', commandId, `${unitKey}-${slot.activityKey}`),
          activityVersionId: publicationId('activity-version', commandId, `${unitKey}-${slot.activityKey}`),
          activityVersion: 1,
          projectionId: publicationId('projection', commandId, `${unitKey}-${slot.activityKey}`),
          placementId: publicationId('placement', commandId, `${unitKey}-${slot.activityKey}`),
        }])),
    });
    const { authority, studentDocument: committedStudentDocument, activation } = qualifyBookSubmissionPublication({ ...input, now, idsFor });
    const fullOutputs = input.prepared.strategy === 'full_pdf'
      ? manifest.units.map((unit) => buildFullPdfPublication({
        operationId: input.operationId, now, ownerId: input.uid, unitKey: unit.unitKey,
        candidate: candidateFor(unit.unitKey), authority, expectedCandidateRevision: 1,
        expectedBookRevision: 1, expectedSourceSetRevision: 1, ids: idsFor(unit.unitKey),
        activitiesByKey: activityPayloadsForUnit(input.uid, unit.unitKey, input.prepared.activitiesByKey),
      })) : [];
    const first = fullOutputs[0];
    const publication = input.prepared.strategy === 'full_pdf'
      ? {
        manifestVersionId, publicationId: publicationIdValue, publicationRevision: 1,
        plan: {
          ...first!.plan, candidateId: `submission-${input.finalBookId}`, manifest,
          studentSafeProjection: { ...first!.plan.studentSafeProjection, units: manifest.units },
          atomicWrites: {
            activityVersions: fullOutputs.flatMap((e) => e.plan.atomicWrites.activityVersions),
            activitySafeProjections: fullOutputs.flatMap((e) => e.plan.atomicWrites.activitySafeProjections),
            placements: fullOutputs.flatMap((e) => e.plan.atomicWrites.placements),
            unitProjections: fullOutputs.flatMap((e) => e.plan.atomicWrites.unitProjections),
            deliveryPlans: [{
              ...first!.plan.atomicWrites.deliveryPlans[0]!,
              placementIds: fullOutputs.flatMap((e) => e.plan.atomicWrites.placements).map((e) => e.placementId),
              unitProjectionIds: fullOutputs.flatMap((e) => e.plan.atomicWrites.unitProjections).map((e) => e.unitProjectionId),
            }],
          },
        },
        canonicalActivityVersions: fullOutputs.flatMap((e) => e.canonicalActivityVersions),
      }
      : (() => {
        const output = aggregateComponentPdfPublications({
          aggregateCandidateId: `submission-${input.finalBookId}`, manifest,
          outputs: manifest.units.map((unit) => buildComponentPdfPublication({
            operationId: input.operationId, now, ownerId: input.uid, unitKey: unit.unitKey,
            candidate: candidateFor(unit.unitKey), authority, expectedCandidateRevision: 1,
            expectedBookRevision: 1, expectedSourceSetRevision: 1, ids: idsFor(unit.unitKey),
            activitiesByKey: activityPayloadsForUnit(input.uid, unit.unitKey, input.prepared.activitiesByKey),
          })),
        });
        return { manifestVersionId, publicationId: publicationIdValue, publicationRevision: 1,
          plan: {
            ...output.plan,
            atomicWrites: {
              ...output.plan.atomicWrites,
              deliveryPlans: output.plan.atomicWrites.deliveryPlans,
            },
          },
          canonicalActivityVersions: output.canonicalActivityVersions };
      })();
    const { InMemoryBookAssemblyPublicationRepository } = await import('../../../../src/services/book-assembly/publicationRepository.ts');
    const { InMemoryCanonicalActivityVersionRepository } = await import('../../../../src/services/book-assembly/canonicalPublicationRepository.ts');
    const publicationRepository = new InMemoryBookAssemblyPublicationRepository<import('../../../../src/services/book-assembly/publicationTransaction.service.ts').BookAssemblyPublicationResult>();
    const canonicalWriter = new InMemoryCanonicalActivityVersionRepository();
    const publicationService = createCanonicalBookAssemblyPublicationService(publicationRepository, canonicalWriter);
    const result = await publicationService.publish({
      operationId: commandId, expectedCurrentPublicationId: null,
      manifestVersionId: publication.manifestVersionId, publicationId: publication.publicationId,
      publicationRevision: publication.publicationRevision, plan: publication.plan,
      canonicalActivityVersions: publication.canonicalActivityVersions,
      operationFingerprint: input.fingerprint, now,
    });
    if (result.status !== 'published' && result.status !== 'replayed')
      throw new BookSubmissionWorkerError('book_submission_publication_failed', 503);
    const scope = await publicationRepository.readScope(input.finalBookId) as PublicationScope;
    const publicationToken = scopedPublicationToken(input.env, input.operation);
    const db = new FirebaseRtdbRestClient({
      env: input.env as never, fetchImpl: globalThis.fetch, firebaseAuthToken: true,
      getFirebaseAuthToken: publicationToken,
    });
    const finalBook = {
      bookId: input.finalBookId, bookMode: 'pdf' as const, ownerId: input.uid,
      title: metadata.title, subtitle: metadata.subtitle, authors: metadata.authors,
      publisher: metadata.publisher, edition: metadata.edition, series: metadata.series, isbn: metadata.isbn,
      coverUrl: metadata.coverUrl, testTypeIds: metadata.testTypeIds, tags: metadata.tags,
      description: metadata.description, visibility: 'private' as const, status: 'ready' as const,
      bookRevision: 1, sourceSetRevision: 1, sourceSet: manifest.sourceSet,
      ...(input.prepared.strategy === 'component_pdfs' && componentArtifact
        ? { studentDocument: committedStudentDocument,
          setupActivations: [activation!],
        } : {}),
      createdAt: now, updatedAt: now, createdBy: input.uid, updatedBy: input.uid,
    };
    const summary = createMaterialBookSummary(finalBook as never);
    const writes = [
      ...submissionAssemblySeedWrites(
        input.uid, input.finalBookId, input.operationId, manifest, input.prepared.activitiesByKey, now,
        (unitKey) => {
          const ids = idsFor(unitKey);
          return {
            unitProjectionId: ids.unitProjectionId,
            deliveryPlanId: ids.deliveryPlanId,
            activitiesByKey: ids.activitiesByKey,
          };
        },
      ),
      ...publicationScopeWrites(input.finalBookId, scope),
      ...publication.canonicalActivityVersions.flatMap((entry) => [
        { path: `book_activity/versions/${entry.activityId}/${entry.activityVersionId}`, value: entry },
        { path: `book_activity/student_safe_projections/${entry.activityId}/${entry.activityVersionId}`, value: canonicalActivityVersionStudentSafeProjection(entry) },
      ]),
      { path: materialCatalogPaths.books(input.finalBookId), value: finalBook },
      ...(input.prepared.strategy === 'component_pdfs' && componentArtifact ? [{
        path: `book_assembly_publications/books/${input.finalBookId}/student_documents/${componentArtifact.descriptor.sourceVersionId}`,
        value: committedStudentDocument,
      }] : []),
      ...materialNodes(manifest, input.finalBookId, now, input.uid, input.operationId,
        metadata.testTypeIds as string[], publication.plan.atomicWrites.placements)
        .map((node) => ({ path: materialCatalogPaths.bookNodes(input.finalBookId, node.nodeId), value: node })),
      ...buildMaterialBookIndexWrites(finalBook as never).map((entry) => ({ path: entry.path, value: entry.value })),
      ...Object.entries(buildMaterialSummaryUpdatePayload(summary, null)).map(([path, value]) => ({ path, value })),
      { path: `book_submission_operations/${input.uid}/operations/${input.operationId}`, value: {
        ...input.operation,
        state: 'committed',
        committedAt: now,
        updatedAt: now,
        commitLeaseId: null,
        commitLeaseExpiresAt: null,
      } },
    ];
    await db.patchMultiLocation(writes);
  },
});
