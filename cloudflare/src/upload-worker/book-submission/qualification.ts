import { createCandidateUnitPreview, wholeActivationApprovalFingerprint } from '../../../../src/services/book-assembly/unitPreview.service.ts';
import { validateBookAssemblyManifestCandidate } from '../../../../src/services/book-assembly/manifestCandidate.service.ts';
import { createComponentStudentDocument } from '../../../../src/services/book-assembly/componentStudentDocument.types.ts';
import { createComponentPdfActivationReceipt, fingerprintComponentPdfActivationValue } from '../../../../src/services/book-assembly/componentPdfActivation.service.ts';
import type { BookAssemblyBookAuthority } from '../../../../src/services/book-assembly/unitAssembly.types.ts';
import type { BookAssemblyManifestCandidate } from '../../../../src/types/bookAssembly.types.ts';
import { readReadyBookSourceSafety, readTrustedSourceSafety } from '../book-source/trusted-source-contract.ts';
import type { BookSubmissionPublicationFinalizer } from './publication.ts';
import { preparedCandidate, publicationId } from './publication-projections.ts';
import { BookSubmissionWorkerError } from './worker.ts';

/** Qualifies server-rebuilt inputs, without issuing teacher approval or delivery authority. */
export const qualifyBookSubmissionPublication = (input: Parameters<BookSubmissionPublicationFinalizer['commit']>[0] & {
  readonly now: string;
  readonly idsFor: (unitKey: string) => { readonly activitiesByKey: Readonly<Record<string, { readonly activityId: string }>> };
}) => {
  try {
    const { operation, uid, finalBookId, fingerprint, sources } = input;
    const registry = input.env.BOOK_ASSEMBLY_PREVIEW_REGISTRY_VERSION;
    if (typeof registry !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u.test(registry)) {
      throw new Error('registry_unavailable');
    }
    if (operation.ownerId !== uid || operation.finalBookId !== finalBookId
      || operation.operationId !== input.operationId || operation.fingerprint !== fingerprint
      || operation.state !== 'committing' || !operation.commitLeaseId
      || !Number.isFinite(operation.commitLeaseExpiresAt) || operation.commitLeaseExpiresAt! <= Date.parse(input.now)) {
      throw new Error('operation_not_current');
    }
    const manifest = input.prepared.manifest as BookAssemblyManifestCandidate;
    const sourceById = new Map(sources.map((source) => [source.sourceVersionId, source]));
    const projections = sources.map(({ byteSize: _byteSize, ...projection }) => projection);
    const projectionById = new Map(projections.map((projection) => [projection.sourceVersionId, projection]));
    if (sourceById.size !== sources.length || sources.length !== manifest.sourceSet.sources.length
      || sources.some((source) => source.bookId !== finalBookId || source.purpose !== 'book-source'
        || !source.verifiedUsable || !readReadyBookSourceSafety(source, source.sourceVersionId))
      || manifest.sourceSet.sources.some((source) => sourceById.get(source.sourceVersionId)?.sourceKey !== source.sourceKey)) {
      throw new Error('source_not_ready');
    }
    const authority: BookAssemblyBookAuthority = {
      bookId: finalBookId, ownerId: uid, bookMode: 'pdf', bookRevision: 1, sourceSetRevision: 1,
      sourceSet: manifest.sourceSet, sourceVersionAuthority: { getSourceVersion: (id) => projectionById.get(id) },
    };
    if (manifest.bookId !== finalBookId || manifest.sourceSet.sourceStrategy !== input.prepared.strategy
      || !validateBookAssemblyManifestCandidate(manifest, authority.sourceVersionAuthority).valid) {
      throw new Error('manifest_invalid');
    }
    const unitKeys = manifest.units.map((unit) => unit.unitKey);
    const activityKeys = manifest.units.flatMap((unit) => unit.activitySlots.map((slot) => `${unit.unitKey}:${slot.activityKey}`));
    const actualKeys = Object.keys(input.prepared.activitiesByKey);
    if (new Set(unitKeys).size !== unitKeys.length || new Set(activityKeys).size !== activityKeys.length
      || actualKeys.length !== activityKeys.length || actualKeys.some((key) => !activityKeys.includes(key))) {
      throw new Error('activity_coverage_invalid');
    }
    const artifact = input.componentArtifact;
    const studentDocument = artifact ? createComponentStudentDocument({ ...artifact.descriptor, descriptorRevision: 1 }) : undefined;
    if (studentDocument && artifact) {
      const documentSource = input.studentDocumentSource;
      if (!documentSource || documentSource.bookId !== finalBookId || documentSource.purpose !== 'student-document'
        || documentSource.sourceVersionId !== studentDocument.sourceVersionId
        || !documentSource.verifiedUsable || documentSource.studentSafeStatus !== 'ready'
        || !readTrustedSourceSafety(documentSource, { sourceVersionId: documentSource.sourceVersionId,
          purpose: 'student-document', checksum: documentSource.checksum })?.studentSafeDecision
        || documentSource.checksum.value !== studentDocument.sha256Hex
        || documentSource.byteSize !== studentDocument.byteSize
        || documentSource.physicalPageCount !== studentDocument.physicalPageCount
        || artifact.composition.sha256Hex !== studentDocument.sha256Hex
        || studentDocument.compositionFingerprint !== studentDocument.sha256Hex
        || studentDocument.components.some((component, index) => {
          const source = manifest.sourceSet.sources[index];
          const trusted = sourceById.get(component.sourceVersionId);
          const receipt = artifact.sourceReceipts[index];
          const mapping = artifact.composition.mapping[index];
          const composedInput = artifact.composition.inputManifest[index];
          return !source || !('ownerNodeKey' in source) || !trusted || !receipt || !mapping || !composedInput
            || component.sourceKey !== source.sourceKey || component.sourceVersionId !== source.sourceVersionId
            || component.ownerNodeKey !== source.ownerNodeKey || component.sourceOrder !== source.sourceOrder
            || component.localPageCount !== trusted.physicalPageCount
            || receipt.sourceKey !== source.sourceKey || receipt.sourceVersionId !== source.sourceVersionId
            || receipt.checksum.value !== trusted.checksum.value || receipt.byteSize !== trusted.byteSize
            || receipt.physicalPageCount !== trusted.physicalPageCount
            || mapping.componentIndex !== index || mapping.startPage !== component.combinedStartPage
            || mapping.endPage !== component.combinedEndPage || mapping.pageCount !== trusted.physicalPageCount
            || composedInput.componentIndex !== index || composedInput.sha256Hex !== trusted.checksum.value
            || composedInput.byteSize !== trusted.byteSize || composedInput.pageCount !== trusted.physicalPageCount;
        })) throw new Error('component_document_changed');
    }
    const units = manifest.units.map((unit) => ({
      unitKey: unit.unitKey, candidateId: `submission-${finalBookId}`, candidateRevision: 1,
      manifestFingerprint: fingerprintComponentPdfActivationValue(manifest), manifest,
    }));
    const activities = manifest.units.flatMap((unit) => unit.activitySlots.map((slot) => ({
      unitKey: unit.unitKey, activityKey: slot.activityKey,
      activityId: input.idsFor(unit.unitKey).activitiesByKey[slot.activityKey].activityId,
      activityCandidateId: publicationId('activity-candidate', operation.operationId, `${unit.unitKey}-${slot.activityKey}`),
      activityCandidateRevision: 1,
      activityPayloadFingerprint: fingerprintComponentPdfActivationValue(input.prepared.activitiesByKey[`${unit.unitKey}:${slot.activityKey}`]),
    })));
    const activation = studentDocument ? createComponentPdfActivationReceipt({
      operationId: operation.operationId, ownerId: uid, bookId: finalBookId,
      expectedBookRevision: 0, expectedSourceSetRevision: 0, sourceSet: manifest.sourceSet,
      unitCandidates: units.map(({ manifest: _manifest, ...unit }) => unit).sort((a, b) => a.unitKey < b.unitKey ? -1 : a.unitKey > b.unitKey ? 1 : 0),
      studentDocument: { sourceVersionId: studentDocument.sourceVersionId, descriptorRevision: 1,
        descriptorFingerprint: fingerprintComponentPdfActivationValue(studentDocument) },
      activities: activities.slice().sort((a, b) => `${a.unitKey}:${a.activityKey}` < `${b.unitKey}:${b.activityKey}` ? -1 : 1),
      activatedAt: input.now,
    }) : undefined;
    for (const unit of manifest.units) {
      createCandidateUnitPreview({
        candidate: preparedCandidate(uid, finalBookId, unit.unitKey, manifest, input.now),
        sourceVersions: projections,
        sourceIsPreviewReady: (source) => !!readReadyBookSourceSafety(source, source.sourceVersionId),
        activitiesByKey: Object.fromEntries(unit.activitySlots.map((slot) => [slot.activityKey, input.prepared.activitiesByKey[`${unit.unitKey}:${slot.activityKey}`]])),
        registryVersion: registry,
        ...(studentDocument ? { studentDocument: { descriptor: studentDocument,
          request: { opaqueRouteKey: studentDocument.sourceVersionId, expectedByteLength: studentDocument.byteSize } } } : {}),
      });
    }
    if (activation && studentDocument) wholeActivationApprovalFingerprint({
      ownerId: uid, bookId: finalBookId, bookRevision: 1, sourceSetRevision: 1,
      sourceSet: manifest.sourceSet, activationReceipt: activation, units, studentDocument, registryVersion: registry, activities,
    });
    return { authority, studentDocument, activation };
  } catch (cause) {
    const failure = new BookSubmissionWorkerError('book_submission_preview_invalid', 409);
    failure.cause = cause;
    throw failure;
  }
};
