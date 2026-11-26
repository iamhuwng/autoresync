/** Default #59 server composition. All records are read through durable RTDB adapters. */
import type { NormalizedActivity } from '../../../../src/types/bookActivity.types.ts';
import type { BookAssemblyCandidateRecord } from '../../../../src/services/book-assembly/unitAssembly.types.ts';
import type { UnitActivityBindingRepository } from '../../../../src/services/book-assembly/unitActivityBinding.repository.ts';
import type { BookRouteHandlersOptions } from '../book-route-handlers.ts';
import { FirebaseRestBookActivityAuthoringRepository } from '../book-activity-authoring/repository.ts';
import { activityMatchesAssemblyContract, createBookActivityAuthoringWorkerHandlers } from '../book-activity-authoring/worker.ts';
import { validateEditableActivity } from '../../../../src/services/book-activity/activitySchema.service.ts';
import { createFirebaseClaimTokenProvider, type BookFirebaseClaimTuple } from '../book-activity-authoring/firebase-token.ts';
import { FirebaseRestBookAssemblyRepository } from './repository.ts';
import { createBookAssemblyWorkerHandlers } from './worker.ts';
import { createFirebaseBookSourceAuthorityReader, MATERIAL_BOOK_PATH } from './book-source-authority-reader.ts';
import {
  activateComponentPdf,
  activeComponentPdfActivation,
  fingerprintComponentPdfActivationValue,
  fingerprintComponentPdfActivation,
  resolveMaterialQualifiedAssemblyCandidate,
  type ComponentPdfActivationCommandInput,
} from '../../../../src/services/book-assembly/componentPdfActivation.service.ts';
import { canonicalActivityPayloadFingerprint } from '../../../../src/services/book-assembly/unitPreview.service.ts';
import { FirebaseRestBookAssemblyPreviewApprovalRepository } from './preview-approval-repository.ts';
import { FirebaseRestUnitActivityBindingRepository } from './unit-activity-binding-repository.ts';
import { createBookResultReadProductionHandlers } from '../book-results/production-composition.ts';
import { createDefaultBookActivityEvaluationProductionHandlers } from '../book-activity-grading/production-composition.ts';
import type { SourceSetCandidate, TrustedBookSourceVersionProjection } from '../../../../src/types/bookAssembly.types.ts';
import { validateBookAssemblyManifestCandidate } from '../../../../src/services/book-assembly/manifestCandidate.service.ts';
import { FirebaseRestBookAssemblyPublicationRepository } from './publication-repository.ts';
import {
  createFirebaseMaterialBookSourceAttachmentRepository,
} from '../book-source/material-book-source-attachment-repository.ts';
import { createMaterialBookSourceAttachmentService } from '../../../../src/services/book-source-delivery/materialBookSourceAttachment.service.ts';
import { createTrustedFirebaseRtdbServiceAccountAccessTokenProvider } from '../../../../src/services/book-source-delivery/sourceUpload.firebaseRtdbTransaction.ts';
import { BOOK_ASSEMBLY_MAX_CANDIDATES_PER_SCOPE } from './repository.ts';
import { FirebaseRtdbRestClient } from '../listening-authoring/rtdb.ts';
import { sourceUploadAccountPath, validateBookSourceUploadAccountState } from '../../../../src/services/book-source-delivery/sourceUpload.rtdbRepository.ts';
import { readTrustedSourceSafety } from '../book-source/trusted-source-contract.ts';
import { opaqueBookDocumentEtag } from '../book-delivery/document-worker.ts';
import { prepareComponentPdfDescriptor } from '../../../../src/services/book-assembly/componentPdfStaging.service.ts';
import { createProductionBookUpdateHandlers } from '../book-updates/production-composition.ts';

type Env = Record<string, unknown>;
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : null;

export const readExactSavedActivityContent = (
  value: unknown,
  expected: { ownerId: string; bookId: string; candidateId: string; activityId: string; revision: number },
  savedActivity?: unknown,
): NormalizedActivity | null => {
  const candidate = record(value);
  const content = record(candidate?.content);
  const activity = record(savedActivity);
  const draft = record(activity?.draft);
  return candidate
    && content
    && candidate.candidateId === expected.candidateId
    && candidate.targetActivityId === expected.activityId
    && candidate.ownerId === expected.ownerId
    && candidate.bookId === expected.bookId
    && candidate.revision === expected.revision
    && candidate.lifecycle === 'saved'
    && record(candidate.validation)?.valid === true
    && activity?.ownerId === expected.ownerId
    && activity.activityId === expected.activityId
    && activity.lifecycle === 'draft'
    && activity.revision === Number(candidate.targetRevision) + 1
    && fingerprintComponentPdfActivationValue(activity.editableDraft)
      === fingerprintComponentPdfActivationValue(content)
    && draft
    ? draft as unknown as NormalizedActivity
    : null;
};

const savedActivityMatchesFinalManifest = (
  saved: unknown,
  manifest: ComponentPdfActivationCommandInput['manifest'],
  unitKey: string,
  activityKey: string,
  content: NormalizedActivity,
): boolean => {
  const unit = manifest.units.find((entry) => entry.unitKey === unitKey);
  const slot = unit?.activitySlots.find((entry) => entry.activityKey === activityKey);
  const isFullPdf = manifest.sourceSet.sourceStrategy === 'full_pdf';
  const seal = record(record(saved)?.assemblyDraft);
  const expectedManifestFingerprint = fingerprintComponentPdfActivationValue(manifest);
  const expectedSourceSetFingerprint = fingerprintComponentPdfActivationValue(manifest.sourceSet);
  const sealMatchesSourceSet = typeof seal?.sourceSetFingerprint === 'string'
    && seal.sourceSetFingerprint === expectedSourceSetFingerprint;
  const sealValid = isFullPdf
    ? Boolean(
      seal
      && seal.bookId === manifest.bookId
      && seal.unitKey === unitKey
      && seal.activityKey === activityKey
      && sealMatchesSourceSet,
    )
    : Boolean(
      seal
      && seal.bookId === manifest.bookId
      && seal.unitKey === unitKey
      && seal.activityKey === activityKey
      && seal.manifestFingerprint === expectedManifestFingerprint,
    );
  if (!unit || !slot || !sealValid
    || !activityMatchesAssemblyContract(content, { activityKey, contextRequirement: slot.contextRequirement })) return false;
  const groups = new Map(unit.pageGroups.map((group) => [group.pageGroupKey, group]));
  const allowedRefs = new Set<string>([`import:${activityKey}`]);
  const mappedBookPageRefs: string[] = [];
  for (const pageGroupKey of slot.pageGroupKeys) {
    const group = groups.get(pageGroupKey);
    if (!group) return false;
    allowedRefs.add(`pageGroup:${pageGroupKey}`);
    for (const page of group.pages) {
      const ref = `source:${group.sourceKey}:page:${page}`;
      allowedRefs.add(ref);
      mappedBookPageRefs.push(ref);
    }
  }
  if (!mappedBookPageRefs.length || !validateEditableActivity(record(saved)?.content, { mappedBookPageRefs }).valid) return false;
  const raw = record(saved);
  return ['evidenceRefs', 'sourceEvidenceRefs', 'answerEvidenceRefs'].every((key) => {
    const refs = raw?.[key];
    return refs === undefined || (Array.isArray(refs)
      && refs.every((ref) => typeof ref === 'string' && allowedRefs.has(ref)));
  });
};

/** Authoring-only saved slots; this proves no setup activation or publication. */
export const readVerifiedDraftActivityKeys = async (
  candidate: BookAssemblyCandidateRecord,
  bindingRepository: Pick<UnitActivityBindingRepository, 'read'>,
  activityRepository: Pick<FirebaseRestBookActivityAuthoringRepository, 'readOwnerRoot'>,
): Promise<readonly string[]> => {
  const { ownerId, bookId, unitKey, manifest } = candidate;
  const unit = manifest?.units.find((entry) => entry.unitKey === unitKey);
  if (!manifest || !unit) return [];
  const root = await activityRepository.readOwnerRoot(ownerId);
  const savedKeys: string[] = [];
  const isFullPdf = manifest.sourceSet.sourceStrategy === 'full_pdf';
  for (const { activityKey } of unit.activitySlots) {
    const binding = await bindingRepository.read({ ownerId, bookId, unitKey, activityKey });
    if (!binding || binding.candidateLifecycle !== 'saved'
      || binding.ownerId !== ownerId || binding.bookId !== bookId
      || binding.unitKey !== unitKey || binding.activityKey !== activityKey) continue;
    const saved = root.candidates?.[binding.candidateId];
    const seal = record(record(saved)?.assemblyDraft);
    const content = readExactSavedActivityContent(saved, {
      ownerId, bookId, candidateId: binding.candidateId,
      activityId: binding.activityId, revision: binding.candidateRevision,
    }, root.activities?.[binding.activityId]);
    const sealMatches = isFullPdf
      ? true
      : seal?.candidateId === candidate.candidateId && seal.candidateRevision === candidate.revision;
    if (sealMatches
      && content && savedActivityMatchesFinalManifest(saved, manifest, unitKey, activityKey, content)) {
      savedKeys.push(activityKey);
    }
  }
  return savedKeys;
};

export const sourceUploadAccess = (env: Env) => {
  const accountId = typeof env.BOOK_SOURCE_UPLOAD_ACCOUNT_ID === 'string' ? env.BOOK_SOURCE_UPLOAD_ACCOUNT_ID.trim() : '';
  const identity = typeof env.BOOK_SOURCE_UPLOAD_SERVICE_IDENTITY === 'string' ? env.BOOK_SOURCE_UPLOAD_SERVICE_IDENTITY.trim() : '';
  const raw = typeof env.BOOK_SOURCE_UPLOAD_GOOGLE_SA_KEY === 'string' ? env.BOOK_SOURCE_UPLOAD_GOOGLE_SA_KEY.trim() : '';
  let parsed: Record<string, unknown> | null = null;
  try { parsed = record(JSON.parse(raw)); } catch { /* rejected below */ }
  if (!accountId || parsed?.client_email !== identity || typeof parsed.private_key !== 'string') {
    throw new Error('book_source_upload_production_credentials_unavailable');
  }
  const provider = createTrustedFirebaseRtdbServiceAccountAccessTokenProvider({
    serviceAccountEmail: identity,
    serviceAccountPrivateKey: parsed.private_key.replace(/\\n/gu, '\n'),
  });
  return { accountId, getAccessToken: () => provider.getAccessToken() };
};

type AssemblyClaimService = 'book_assembly' | 'book_assembly_activation' | 'book_assembly_preview' | 'book_assembly_publication';
const claimProvider = (
  env: Env, ownerId: string, bookId: string, unitKey: string, service: AssemblyClaimService = 'book_assembly', activation?: { operationId: string; setupActivationIndex: string; expectedBookRevision: number; expectedSourceSetRevision: number; inputFingerprint: string },
) => {
  const identity = typeof env.BOOK_ASSEMBLY_SERVICE_IDENTITY === 'string' ? env.BOOK_ASSEMBLY_SERVICE_IDENTITY : '';
  const key = typeof env.BOOK_ASSEMBLY_GOOGLE_SA_KEY === 'string' ? env.BOOK_ASSEMBLY_GOOGLE_SA_KEY : '';
  if (!identity.trim() || !key.trim() || typeof env.FIREBASE_PROJECT_ID !== 'string' || typeof env.FIREBASE_WEB_API_KEY !== 'string') {
    throw new Error('book_assembly_production_credentials_unavailable');
  }
  const provider = createFirebaseClaimTokenProvider({ serviceAccountJson: key, serviceIdentity: identity,
    firebaseProjectId: env.FIREBASE_PROJECT_ID, firebaseWebApiKey: env.FIREBASE_WEB_API_KEY });
  const claims: BookFirebaseClaimTuple = service === 'book_assembly_publication'
    ? { service, ownerId, bookId }
    : service === 'book_assembly_activation'
      ? { service, ownerId, bookId, ...(activation ?? { operationId: '', setupActivationIndex: "0", expectedBookRevision: 0, expectedSourceSetRevision: 0, inputFingerprint: '' }) }
    : { service, ownerId, bookId, unitKey };
  return () => provider(claims);
};

const approvalClaimProvider = (
  env: Env,
  ownerId: string,
  bookId: string,
  unitKey: string,
  approvalId: string,
  service: 'book_assembly_preview_approval' | 'book_assembly_publication_approval',
) => {
  const identity = typeof env.BOOK_ASSEMBLY_SERVICE_IDENTITY === 'string' ? env.BOOK_ASSEMBLY_SERVICE_IDENTITY : '';
  const key = typeof env.BOOK_ASSEMBLY_GOOGLE_SA_KEY === 'string' ? env.BOOK_ASSEMBLY_GOOGLE_SA_KEY : '';
  if (!identity.trim() || !key.trim() || typeof env.FIREBASE_PROJECT_ID !== 'string' || typeof env.FIREBASE_WEB_API_KEY !== 'string') {
    throw new Error('book_assembly_production_credentials_unavailable');
  }
  const provider = createFirebaseClaimTokenProvider({ serviceAccountJson: key, serviceIdentity: identity,
    firebaseProjectId: env.FIREBASE_PROJECT_ID, firebaseWebApiKey: env.FIREBASE_WEB_API_KEY });
  return () => provider({ service, ownerId, bookId, unitKey, approvalId });
};

export const readProductionBookAssemblyAuthority = (
  env: Env,
  ownerId: string,
  bookId: string,
  unitKey: string,
  proposedSourceSet?: SourceSetCandidate,
) => createFirebaseBookSourceAuthorityReader({
  ...env,
  BOOK_SOURCE_UPLOAD_ACCOUNT_ID: typeof env.BOOK_SOURCE_UPLOAD_ACCOUNT_ID === 'string' ? env.BOOK_SOURCE_UPLOAD_ACCOUNT_ID : '',
  getFirebaseAuthToken: claimProvider(env, ownerId, bookId, unitKey),
}).read({ ownerId, bookId, proposedSourceSet });

export const resolveActiveComponentStudentDocument = (
  bookAuthority: Parameters<typeof activeComponentPdfActivation>[0],
  publicationScope: Pick<import('../../../../src/services/book-assembly/publicationRepository.ts').BookAssemblyPublicationScope, 'studentDocuments'>,
) => {
  const activation = activeComponentPdfActivation(bookAuthority);
  const descriptor = activation
    ? publicationScope.studentDocuments?.[activation.studentDocument.sourceVersionId]
    : undefined;
  return activation && descriptor
    && descriptor.descriptorRevision === activation.studentDocument.descriptorRevision
    && fingerprintComponentPdfActivationValue(descriptor) === activation.studentDocument.descriptorFingerprint
    ? { activation, descriptor } : null;
};

const authority = readProductionBookAssemblyAuthority;

const authoringCandidate = async (env: Env, ownerId: string, bookId: string, unitKey: string, suppliedAuthority?: Awaited<ReturnType<typeof authority>>) => {
  if (suppliedAuthority?.sourceSet.sourceStrategy === 'full_pdf') {
    const scope = await new FirebaseRestBookAssemblyRepository({ env: env as never, ownerId }).readScope(bookId, unitKey);
    const pointer = scope.current;
    const candidate = pointer && scope.candidates?.[pointer.candidateId];
    if (!candidate || candidate.lifecycle !== 'validated' || !candidate.manifest
      || candidate.ownerId !== ownerId || candidate.bookId !== bookId || candidate.unitKey !== unitKey
      || candidate.revision !== pointer.candidateRevision || candidate.bookRevision !== pointer.bookRevision
      || candidate.sourceSetRevision !== pointer.sourceSetRevision
      || candidate.bookRevision !== suppliedAuthority.bookRevision
      || candidate.sourceSetRevision !== suppliedAuthority.sourceSetRevision
      || fingerprintComponentPdfActivationValue(candidate.manifest.sourceSet)
        !== fingerprintComponentPdfActivationValue(suppliedAuthority.sourceSet)
      || !validateBookAssemblyManifestCandidate(candidate.manifest, suppliedAuthority.sourceVersionAuthority).valid) return null;
    return candidate;
  }
  const active = await materialQualified(env, ownerId, bookId, unitKey);
  if (active) return active.candidate;
  const scope = await new FirebaseRestBookAssemblyRepository({ env: env as never, ownerId }).readScope(bookId, unitKey);
  const pointer = scope.current;
  const candidate = pointer && scope.candidates?.[pointer.candidateId];
  if (!candidate || candidate.lifecycle !== 'validated' || !candidate.manifest
    || candidate.ownerId !== ownerId || candidate.bookId !== bookId || candidate.unitKey !== unitKey
    || candidate.revision !== pointer.candidateRevision
    || candidate.bookRevision !== pointer.bookRevision
    || candidate.sourceSetRevision !== pointer.sourceSetRevision) return null;
  const qualified = await authority(env, ownerId, bookId, unitKey, candidate.manifest.sourceSet)
    ?? await authority(env, ownerId, bookId, unitKey);
  if (!qualified || qualified.bookRevision !== candidate.bookRevision
    || qualified.sourceSetRevision !== candidate.sourceSetRevision
    || fingerprintComponentPdfActivationValue(qualified.sourceSet)
      !== fingerprintComponentPdfActivationValue(candidate.manifest.sourceSet)
    || !validateBookAssemblyManifestCandidate(candidate.manifest, qualified.sourceVersionAuthority).valid) return null;
  return candidate;
};

export const resolveReadyActiveStudentDocument = async (
  env: Env,
  ownerId: string,
  bookId: string,
  suppliedAuthority?: Awaited<ReturnType<typeof authority>>,
  suppliedPublicationScope?: Awaited<ReturnType<FirebaseRestBookAssemblyPublicationRepository['readScope']>>,
) => {
  const bookAuthority = suppliedAuthority ?? await authority(env, ownerId, bookId, 'preview');
  if (!bookAuthority) return null;
  const scope = suppliedPublicationScope
    ?? await new FirebaseRestBookAssemblyPublicationRepository({ env: env as never, ownerId }).readScope(bookId);
  const qualified = resolveActiveComponentStudentDocument(bookAuthority, scope);
  if (!qualified) return null;
  const access = sourceUploadAccess(env);
  const account = validateBookSourceUploadAccountState(await new FirebaseRtdbRestClient({
    env: env as never, fetchImpl: globalThis.fetch, getAccessToken: access.getAccessToken,
  }).readValue(sourceUploadAccountPath(access.accountId)));
  const operations = Object.values(account.operations).filter((operation) => {
    const safety = readTrustedSourceSafety(operation, {
      sourceVersionId: operation.sourceVersionId, purpose: 'student-document', checksum: operation.expectedChecksum,
    });
    return operation.status === 'verified_completed'
      && operation.ownerId === ownerId && operation.bookId === bookId
      && operation.sourceKey === 'student-document'
      && operation.sourceVersionId === qualified.descriptor.sourceVersionId
      && operation.verifiedStorage !== undefined
      && operation.verifiedStorage.byteSize === qualified.descriptor.byteSize
      && operation.verifiedStorage.checksum.value.toLowerCase() === qualified.descriptor.sha256Hex
      && safety?.studentSafeStatus === 'ready'
      && safety.studentSafeDecision?.sha256Hex === qualified.descriptor.sha256Hex;
  });
  return operations.length === 1 && operations[0]!.verifiedStorage
    ? { ...qualified, storage: operations[0]!.verifiedStorage,
      expectedEtag: await opaqueBookDocumentEtag(operations[0]!.verifiedStorage) }
    : null;
};

export const isFullPdfPublicationSourceReady = (
  source: TrustedBookSourceVersionProjection | undefined,
): boolean => {
  const decision = source?.studentSafeDecision;
  return source?.verifiedUsable === true
    && source.purpose === 'book-source'
    && source.studentSafeStatus === 'ready'
    && decision?.sourceVersionId === source.sourceVersionId
    && decision.sha256Hex.toLowerCase() === source.checksum.value;
};

const sourceIsTeacherPreviewReady = async (
  env: Env,
  actorId: string,
  bookId: string,
  sourceVersionId: string,
): Promise<boolean> => !!(await authority(env, actorId, bookId, 'preview'))
  ?.sourceVersionAuthority.getSourceVersion(sourceVersionId)?.verifiedUsable;

const sourceIsFullPdfPublicationReady = async (
  env: Env,
  actorId: string,
  bookId: string,
  sourceVersionId: string,
): Promise<boolean> => {
  const source = (await authority(env, actorId, bookId, 'publication'))
    ?.sourceVersionAuthority.getSourceVersion(sourceVersionId);
  return isFullPdfPublicationSourceReady(source);
};

const bindings = (env: Env) => new FirebaseRestUnitActivityBindingRepository({ env: env as never });

const materialQualified = async (
  env: Env,
  ownerId: string,
  bookId: string,
  unitKey: string,
  supplied?: {
    readonly bookAuthority?: Awaited<ReturnType<typeof authority>>;
    readonly publicationScope?: Awaited<ReturnType<FirebaseRestBookAssemblyPublicationRepository['readScope']>>;
    readonly assemblyScope?: Awaited<ReturnType<FirebaseRestBookAssemblyRepository['readScope']>>;
  },
) => {
  const bookAuthority = supplied?.bookAuthority ?? await authority(env, ownerId, bookId, 'current');
  if (!bookAuthority) return null;
  const activation = activeComponentPdfActivation(bookAuthority);
  if (!activation) return null;
  const pubScope = supplied?.publicationScope ?? await new FirebaseRestBookAssemblyPublicationRepository({
    env: env as never,
    ownerId,
  }).readScope(bookId);
  const descriptor = pubScope.studentDocuments?.[activation.studentDocument.sourceVersionId];
  if (!descriptor
    || descriptor.descriptorRevision !== activation.studentDocument.descriptorRevision
    || fingerprintComponentPdfActivationValue(descriptor) !== activation.studentDocument.descriptorFingerprint) return null;
  const scope = supplied?.assemblyScope
    ?? await new FirebaseRestBookAssemblyRepository({ env: env as never, ownerId }).readScope(bookId, unitKey);
  const candidate = resolveMaterialQualifiedAssemblyCandidate(bookAuthority, unitKey, scope.candidates);
  return candidate ? { activation, candidate } : null;
};

const activities = async (
  env: Env,
  ownerId: string,
  bookId: string,
  unitKey: string,
  activityKeys: readonly string[],
  suppliedAuthority?: Awaited<ReturnType<typeof authority>>,
  suppliedCandidate?: Awaited<ReturnType<typeof authoringCandidate>>,
  suppliedComponentCache?: {
    readonly publicationScope?: Awaited<ReturnType<FirebaseRestBookAssemblyPublicationRepository['readScope']>>;
    readonly assemblyScope?: Awaited<ReturnType<FirebaseRestBookAssemblyRepository['readScope']>>;
    readonly ownerRoot?: Awaited<ReturnType<FirebaseRestBookActivityAuthoringRepository['readOwnerRoot']>>;
  },
) => {
  const bookAuthority = suppliedAuthority ?? await authority(env, ownerId, bookId, unitKey);
  const qualified = bookAuthority?.sourceSet.sourceStrategy === 'full_pdf'
    ? suppliedCandidate ?? await authoringCandidate(env, ownerId, bookId, unitKey, bookAuthority)
    : (await materialQualified(env, ownerId, bookId, unitKey, {
      bookAuthority,
      publicationScope: suppliedComponentCache?.publicationScope,
      assemblyScope: suppliedComponentCache?.assemblyScope,
    }))?.candidate;
  if (!qualified) return {};
  const root = suppliedComponentCache?.ownerRoot
    ?? await new FirebaseRestBookActivityAuthoringRepository({ env: env as never }).readOwnerRoot(ownerId);
  const output: Record<string, { activityKey: string; ownerId: string; revision: number; lifecycle: 'draft'; activity: NormalizedActivity }> = {};
  for (const activityKey of activityKeys) {
    const reference = bookAuthority?.sourceSet.sourceStrategy === 'full_pdf'
      ? await bindings(env).read({ ownerId, bookId, unitKey, activityKey })
      : activeComponentPdfActivation(bookAuthority ?? {})?.activities.find((item) =>
        item.unitKey === unitKey && item.activityKey === activityKey);
    const content = reference ? readExactSavedActivityContent(root.candidates?.[reference.candidateId ?? reference.activityCandidateId], {
      ownerId,
      bookId,
      candidateId: reference.candidateId ?? reference.activityCandidateId,
      activityId: reference.activityId,
      revision: reference.candidateRevision ?? reference.activityCandidateRevision,
    }, root.activities?.[reference.activityId]) : null;
    if (!reference || !content || (bookAuthority?.sourceSet.sourceStrategy === 'component_pdfs'
      && canonicalActivityPayloadFingerprint(content) !== reference.activityPayloadFingerprint)) return {};
    output[activityKey] = {
      activityKey,
      ownerId,
      revision: reference.candidateRevision ?? reference.activityCandidateRevision,
      lifecycle: 'draft',
      activity: content as unknown as NormalizedActivity,
    };
  }
  return output;
};

const lineage = async (
  env: Env,
  ownerId: string,
  bookId: string,
  unitKey: string,
  suppliedAuthority?: Awaited<ReturnType<typeof authority>>,
  suppliedCandidate?: Awaited<ReturnType<typeof authoringCandidate>>,
  suppliedComponentCache?: {
    readonly publicationScope?: Awaited<ReturnType<FirebaseRestBookAssemblyPublicationRepository['readScope']>>;
    readonly assemblyScope?: Awaited<ReturnType<FirebaseRestBookAssemblyRepository['readScope']>>;
  },
) => {
  const bookAuthority = suppliedAuthority ?? await authority(env, ownerId, bookId, unitKey);
  if (bookAuthority?.sourceSet.sourceStrategy === 'full_pdf') {
    const candidate = suppliedCandidate ?? await authoringCandidate(env, ownerId, bookId, unitKey, bookAuthority);
    const slots = candidate?.manifest?.units.find((unit) => unit.unitKey === unitKey)?.activitySlots;
    const publicationScope = suppliedComponentCache?.publicationScope
      ?? await new FirebaseRestBookAssemblyPublicationRepository({ env: env as never, ownerId }).readScope(bookId);
    const currentManifestVersionId = publicationScope.current?.manifestVersionId ?? null;
    const result: Record<string, { activityId: string; lastActivityVersionId?: string; lastActivityVersion?: number }> = {};
    for (const slot of slots ?? []) {
      const binding = await bindings(env).read({ ownerId, bookId, unitKey, activityKey: slot.activityKey });
      if (!binding || binding.candidateLifecycle !== 'saved') return {};
      const prev = currentManifestVersionId
        ? Object.values(publicationScope.activityVersions ?? {})
          .filter((entry) => entry.manifestVersionId === currentManifestVersionId
            && entry.unitKey === unitKey
            && entry.activityKey === slot.activityKey)
          .sort((left, right) => right.activityVersion - left.activityVersion)[0]
        : undefined;
      result[slot.activityKey] = prev
        ? {
          activityId: prev.activityId,
          lastActivityVersionId: prev.activityVersionId,
          lastActivityVersion: prev.activityVersion,
        }
        : { activityId: binding.activityId };
    }
    return result;
  }
  const qualified = await materialQualified(env, ownerId, bookId, unitKey, {
    bookAuthority,
    publicationScope: suppliedComponentCache?.publicationScope,
    assemblyScope: suppliedComponentCache?.assemblyScope,
  });
  if (!qualified) return {};
  const result: Record<string, { activityId: string; lastActivityVersionId?: string; lastActivityVersion?: number }> = {};
  qualified.activation.activities
    .filter((activity) => activity.unitKey === unitKey)
    .forEach((activity) => { result[activity.activityKey] = { activityId: activity.activityId }; });
  return result;
};

const assemblyDraftActivityContext = async (
  env: Env, ownerId: string, bookId: string, unitKey: string, activityKey: string,
) => {
  const candidate = await authoringCandidate(env, ownerId, bookId, unitKey);
  const unit = candidate?.manifest?.units.find((entry) => entry.unitKey === unitKey);
  const slot = unit?.activitySlots.find((entry) => entry.activityKey === activityKey);
  if (!candidate?.manifest || !unit || !slot) return null;
  const groups = new Map(unit.pageGroups.map((group) => [group.pageGroupKey, group]));
  const mappedBookPageRefs = slot.pageGroupKeys.flatMap((pageGroupKey) => {
    const group = groups.get(pageGroupKey);
    return group ? group.pages.map((page) => `source:${group.sourceKey}:page:${page}`) : [];
  });
  if (!mappedBookPageRefs.length) return null;
  return {
    seal: {
      bookId, unitKey, activityKey, candidateId: candidate.candidateId,
      candidateRevision: candidate.revision,
      manifestFingerprint: fingerprintComponentPdfActivationValue(candidate.manifest),
      sourceSetFingerprint: fingerprintComponentPdfActivationValue(candidate.manifest.sourceSet),
    },
    contract: { activityKey, contextRequirement: slot.contextRequirement },
    mappedBookPageRefs,
  };
};

const activateComponentPdfInProduction = async (
  command: ComponentPdfActivationCommandInput,
  env: Env,
) => {
  const assemblyRepository = new FirebaseRestBookAssemblyRepository({ env: env as never, ownerId: command.ownerId });
  const publicationRepository = new FirebaseRestBookAssemblyPublicationRepository({
    env: env as never,
    ownerId: command.ownerId,
  });
  const activityRepository = new FirebaseRestBookActivityAuthoringRepository({ env: env as never });
  const attachmentAccess = sourceUploadAccess(env);
  let activationClaim = { operationId: command.operationId, setupActivationIndex: "0", expectedBookRevision: command.expectedBookRevision,
    expectedSourceSetRevision: command.expectedSourceSetRevision, inputFingerprint: fingerprintComponentPdfActivationValue(command) };
  const attachment = createMaterialBookSourceAttachmentService(
    createFirebaseMaterialBookSourceAttachmentRepository({
      env: env as never,
      accountId: attachmentAccess.accountId,
      firebaseAuthToken: true,
      getFirebaseAuthToken: () => claimProvider(env, command.ownerId, command.bookId, '', 'book_assembly_activation', activationClaim)(),
    }),
  );
  const currentAuthority = await authority(env, command.ownerId, command.bookId, 'activation')
    ?? await authority(env, command.ownerId, command.bookId, 'activation', command.sourceSet);
  if (!currentAuthority) throw new Error('component_pdf_activation_authority_unavailable');
  activationClaim.setupActivationIndex = String(currentAuthority.setupActivations?.length ?? 0);
  if (fingerprintComponentPdfActivationValue(currentAuthority.sourceSet)
    !== fingerprintComponentPdfActivationValue(command.sourceSet)
    || ((currentAuthority.bookRevision !== command.expectedBookRevision
      || currentAuthority.sourceSetRevision !== command.expectedSourceSetRevision)
      && activeComponentPdfActivation(currentAuthority)?.operationId !== command.operationId)) {
    throw new Error('component_pdf_activation_authority_changed');
  }
  const assertValidatedDraft = async () => {
    for (const unit of command.manifest.units) {
      const scope = await assemblyRepository.readScope(command.bookId, unit.unitKey);
      const pointer = scope.current;
      const draft = pointer && scope.candidates?.[pointer.candidateId];
      if (!draft || draft.lifecycle !== 'validated' || !draft.manifest
        || draft.ownerId !== command.ownerId || draft.bookId !== command.bookId
        || draft.unitKey !== unit.unitKey || draft.bookRevision !== command.expectedBookRevision
        || draft.sourceSetRevision !== command.expectedSourceSetRevision
        || draft.revision !== pointer.candidateRevision
        || pointer.bookRevision !== draft.bookRevision
        || pointer.sourceSetRevision !== draft.sourceSetRevision
        || fingerprintComponentPdfActivationValue(draft.manifest)
          !== fingerprintComponentPdfActivationValue(command.manifest)) {
        throw new Error('component_pdf_activation_draft_mismatch');
      }
    }
  };
  await assertValidatedDraft();

  const prepareStudentDocument = command.preparation ? async (
    preparation: NonNullable<ComponentPdfActivationCommandInput['preparation']>,
  ) => {
    const account = validateBookSourceUploadAccountState(await new FirebaseRtdbRestClient({
      env: env as never, fetchImpl: globalThis.fetch, getAccessToken: attachmentAccess.getAccessToken,
    }).readValue(sourceUploadAccountPath(attachmentAccess.accountId)));
    const completed = (reservationId: string) => {
      const operation = account.operations[reservationId];
      if (!operation || operation.reservationId !== reservationId || operation.ownerId !== command.ownerId
        || operation.bookId !== command.bookId || operation.status !== 'verified_completed'
        || !operation.verifiedStorage || !operation.physicalPageCount) {
        throw new Error('component_pdf_activation_completion_unavailable');
      }
      return {
        reservationId,
        ownerId: operation.ownerId,
        bookId: operation.bookId,
        sourceKey: operation.sourceKey,
        sourceVersionId: operation.sourceVersionId,
        purpose: operation.purpose,
        status: operation.status,
        checksum: operation.verifiedStorage.checksum,
        byteSize: operation.verifiedStorage.byteSize,
        physicalPageCount: operation.physicalPageCount,
        studentSafeStatus: operation.studentSafeStatus,
      } as const;
    };
    const result = await prepareComponentPdfDescriptor({
      ownerId: command.ownerId,
      bookId: command.bookId,
      descriptorRevision: command.expectedSourceSetRevision + 1,
      sourceSet: command.sourceSet as Extract<typeof command.sourceSet, { sourceStrategy: 'component_pdfs' }>,
      components: preparation.componentReservationIds.map(completed),
      studentDocument: completed(preparation.studentDocumentReservationId),
      publicationRepository,
    });
    return result.descriptor;
  } : undefined;

  return activateComponentPdf(command, {
    ...(prepareStudentDocument ? { prepareStudentDocument } : {}),
    readStudentDocument: async (bookId, sourceVersionId) =>
      (await publicationRepository.readScope(bookId)).studentDocuments?.[sourceVersionId] ?? null,
    stageUnitCandidate: async (input) => assemblyRepository.transaction(input.bookId, input.unitKey, (scope) => {
      const existing = scope.candidates?.[input.candidateId];
      if (existing) {
        const exact = existing.ownerId === input.ownerId
          && existing.bookId === input.bookId
          && existing.unitKey === input.unitKey
          && existing.bookRevision === input.bookRevision
          && existing.sourceSetRevision === input.sourceSetRevision
          && existing.lifecycle === 'validated'
          && existing.manifest !== null
          && fingerprintComponentPdfActivationValue(existing.manifest)
            === fingerprintComponentPdfActivationValue(input.manifest);
        if (!exact) throw new Error('component_pdf_activation_candidate_conflict');
        return { outcome: existing, write: false };
      }
      if (Object.keys(scope.candidates ?? {}).length >= BOOK_ASSEMBLY_MAX_CANDIDATES_PER_SCOPE) {
        throw new Error('book_assembly_candidate_capacity_exceeded');
      }
      const validation = validateBookAssemblyManifestCandidate(input.manifest, currentAuthority.sourceVersionAuthority);
      if (!validation.valid) throw new Error('component_pdf_activation_manifest_invalid');
      const candidate = {
        candidateId: input.candidateId,
        ownerId: input.ownerId,
        bookId: input.bookId,
        bookRevision: input.bookRevision,
        sourceSetRevision: input.sourceSetRevision,
        unitKey: input.unitKey,
        revision: 1,
        lifecycle: 'validated' as const,
        manifest: structuredClone(input.manifest),
        validation,
        updatedAt: input.activatedAt,
      };
      return {
        outcome: candidate,
        next: { ...scope, candidates: { ...(scope.candidates ?? {}), [candidate.candidateId]: candidate } },
        write: true,
      };
    }),
    readActivity: async ({ ownerId, bookId, unitKey, activityKey }) => {
      const unit = command.manifest.units.find((entry) => entry.unitKey === unitKey);
      const slot = unit?.activitySlots.find((entry) => entry.activityKey === activityKey);
      if (!unit || !slot) return null;
      const binding = await bindings(env).read({ ownerId, bookId, unitKey, activityKey });
      if (!binding || binding.candidateLifecycle !== 'saved') return null;
      const root = await activityRepository.readOwnerRoot(ownerId);
      const saved = root.candidates?.[binding.candidateId];
      const content = readExactSavedActivityContent(
        saved,
        { ownerId, bookId, candidateId: binding.candidateId, activityId: binding.activityId, revision: binding.candidateRevision },
        root.activities?.[binding.activityId],
      );
      if (!content || !savedActivityMatchesFinalManifest(saved, command.manifest, unitKey, activityKey, content)) return null;
      return {
        activityId: binding.activityId,
        activityCandidateId: binding.candidateId,
        activityCandidateRevision: binding.candidateRevision,
        lifecycle: 'saved' as const,
        payload: content,
      };
    },
    activateMaterialBook: async (input) => {
      await assertValidatedDraft();
      activationClaim = { operationId: input.operationId, setupActivationIndex: String(currentAuthority.setupActivations?.length ?? 0), expectedBookRevision: input.expectedBookRevision,
        expectedSourceSetRevision: input.expectedSourceSetRevision, inputFingerprint: fingerprintComponentPdfActivation(input) };
      for (const reference of input.activities) {
        const current = await bindings(env).read({
          ownerId: input.ownerId, bookId: input.bookId,
          unitKey: reference.unitKey, activityKey: reference.activityKey,
        });
        const root = current ? await activityRepository.readOwnerRoot(input.ownerId) : undefined;
        const savedRecord = current ? root?.candidates?.[current.candidateId] : undefined;
        const saved = current && readExactSavedActivityContent(
          savedRecord,
          { ownerId: input.ownerId, bookId: input.bookId, candidateId: current.candidateId,
            activityId: current.activityId, revision: current.candidateRevision },
          root?.activities?.[current.activityId],
        );
        if (!current || current.candidateId !== reference.activityCandidateId
          || current.candidateRevision !== reference.activityCandidateRevision
          || current.activityId !== reference.activityId || !saved
          || !savedActivityMatchesFinalManifest(savedRecord, command.manifest, reference.unitKey, reference.activityKey, saved)
          || canonicalActivityPayloadFingerprint(saved) !== reference.activityPayloadFingerprint) {
          throw new Error('component_pdf_activation_activity_changed');
        }
      }
      const result = await attachment.replace({
        ownerId: input.ownerId,
        bookId: input.bookId,
        operationId: input.operationId,
        expectedBookRevision: input.expectedBookRevision,
        expectedSourceSetRevision: input.expectedSourceSetRevision,
        sourceSet: input.sourceSet,
        activation: {
          unitCandidates: input.unitCandidates,
          studentDocument: input.studentDocument,
          activities: input.activities,
          activatedAt: input.activatedAt,
        },
      });
      if (!result.activation) throw new Error(`component_pdf_activation_${result.reason ?? result.status}`);
      return result.activation;
    },
  });
};

/** Concrete preview/publication ports used when `createUploadWorker()` receives no test injection. */
export const createProductionBookAssemblyRouteOptions = (): Pick<BookRouteHandlersOptions,
  'activityAuthoringHandlers' | 'assemblyHandlers' | 'assemblyPreview' | 'assemblyPublication' | 'resultReadHandlers' | 'evaluationHandlers' | 'futureHandlers'> => ({
  futureHandlers: createProductionBookUpdateHandlers(),
  resultReadHandlers: createBookResultReadProductionHandlers(),
  evaluationHandlers: createDefaultBookActivityEvaluationProductionHandlers(),
  assemblyHandlers: createBookAssemblyWorkerHandlers({
    readBookAuthority: async (_repository, bookId, context) => context
      ? context.proposedSourceSet
        ? await authority(context.env as Env, context.ownerId, bookId, 'candidate', context.proposedSourceSet)
          ?? authority(context.env as Env, context.ownerId, bookId, 'candidate')
        : authority(context.env as Env, context.ownerId, bookId, 'candidate')
      : null,
    bindingRepositoryFactory: (env) => bindings(env as Env),
    activateComponentPdf: (input, env) => activateComponentPdfInProduction(input, env as Env),
    verifyDraftActivities: ({ env, candidate }) => readVerifiedDraftActivityKeys(candidate,
      bindings(env as Env), new FirebaseRestBookActivityAuthoringRepository({ env: env as never })),
    verifyActivatedActivities: async ({ env, ownerId, bookId, unitKey, activityKeys }) =>
      Object.keys(await activities(env as Env, ownerId, bookId, unitKey, activityKeys)).length === activityKeys.length,
  }),
  activityAuthoringHandlers: createBookActivityAuthoringWorkerHandlers({
    resolveOwnedPdfBookId: async ({ env, ownerId, claimedBookId }) => {
      const resolved = await authority(env as Env, ownerId, claimedBookId, 'authoring');
      if (resolved && resolved.bookId === claimedBookId && resolved.ownerId === ownerId
        && resolved.bookMode === 'pdf' && resolved.sourceSet.sources.every((source) =>
          resolved.sourceVersionAuthority.getSourceVersion(source.sourceVersionId)?.verifiedUsable === true)) return claimedBookId;
      const book = record(await new FirebaseRtdbRestClient({
        env: env as never,
        fetchImpl: globalThis.fetch,
        firebaseAuthToken: true,
        getFirebaseAuthToken: claimProvider(env as Env, ownerId, claimedBookId, 'authoring'),
      }).readValue(MATERIAL_BOOK_PATH(claimedBookId)));
      return book?.bookId === claimedBookId && book.ownerId === ownerId
        && book.bookMode === 'pdf' && ['draft-empty', 'draft-in-progress', 'ready'].includes(String(book.status))
        && book.bookRevision === 0 && book.sourceSetRevision === 0
        && book.sourceSet == null && book.setupActivations === undefined ? claimedBookId : undefined;
    },
    bindingRepositoryFactory: (env) => bindings(env as Env),
    readAssemblyDraftActivityContext: async ({ env, ownerId, bookId: scopedBookId, unitKey, activityKey }) =>
      assemblyDraftActivityContext(env as Env, ownerId, scopedBookId, unitKey, activityKey),
    isCandidateActivated: async ({ env, ownerId, bookId, candidateId, candidateRevision }) => {
      const bookAuthority = await authority(env as Env, ownerId, bookId, 'authoring');
      return activeComponentPdfActivation(bookAuthority ?? {})?.activities.some((activity) =>
        activity.activityCandidateId === candidateId
        && activity.activityCandidateRevision === candidateRevision) === true;
    },
  }),
  assemblyPreview: {
    portFactory: (rawEnv, uid, scope) => {
      const bookAuthority = authority(rawEnv as Env, uid, scope.bookId, 'preview');
      const document = bookAuthority.then((value) => value
        ? resolveReadyActiveStudentDocument(rawEnv as Env, uid, scope.bookId, value) : null);
      const unitScopes = new Map<string, ReturnType<FirebaseRestBookAssemblyRepository['readScope']>>();
      const readUnit = (unitKey: string) => {
        if (!unitScopes.has(unitKey)) unitScopes.set(unitKey,
          new FirebaseRestBookAssemblyRepository({ env: rawEnv as never, ownerId: uid }).readScope(scope.bookId, unitKey));
        return unitScopes.get(unitKey)!;
      };
      const qualifiedUnit = async (unitKey: string) => {
        const value = await bookAuthority;
        return value ? resolveMaterialQualifiedAssemblyCandidate(value, unitKey, (await readUnit(unitKey)).candidates) : null;
      };
      return {
      readUser: async () => new FirebaseRestBookActivityAuthoringRepository({ env: rawEnv as never }).readValue(`users/${uid}`),
      readBookAuthority: (bookId) => bookId === scope.bookId ? bookAuthority : Promise.resolve(null),
      readCandidate: async ({ bookId, unitKey, candidateId }) => {
        const value = await bookAuthority;
        if (bookId !== scope.bookId || !value) return null;
        const unit = await readUnit(unitKey);
        if (value.sourceSet.sourceStrategy !== 'component_pdfs') return unit.candidates?.[candidateId] ?? null;
        const candidate = resolveMaterialQualifiedAssemblyCandidate(value, unitKey, unit.candidates);
        return candidate?.candidateId === candidateId ? candidate : null;
      },
      readActivities: ({ ownerId, activityKeys }) => activityKeys.length === 0 ? Promise.resolve([]) : bookAuthority.then((resolvedAuthority) => activities(rawEnv as Env, ownerId, scope.bookId, scope.unitKey, activityKeys, resolvedAuthority).then((value) => Object.entries(value).map(([activityKey, item]) => ({ activityKey, ownerId: item.ownerId, lifecycle: 'validated' as const, content: item.activity })))),
      sourceIsPreviewReady: async ({ bookId, sourceVersionId }) => bookId === scope.bookId
        && !!(await bookAuthority)?.sourceVersionAuthority.getSourceVersion(sourceVersionId)?.verifiedUsable,
      readStudentDocument: async ({ bookId, unitKey, candidateId, candidateRevision }) => {
        const qualified = bookId === scope.bookId ? await qualifiedUnit(unitKey) : null;
        const readyDocument = await document;
        return qualified?.candidateId === candidateId
          && qualified.revision === candidateRevision && readyDocument
          ? { descriptor: readyDocument.descriptor, request: {
            opaqueRouteKey: 'student-document', expectedByteLength: readyDocument.descriptor.byteSize,
            expectedEtag: readyDocument.expectedEtag,
          } } : null;
      },
      readWholeActivationApprovalInput: async (bookId) => {
        const value = await bookAuthority;
        const activation = activeComponentPdfActivation(value ?? {});
        const readyDocument = await document;
        if (bookId !== scope.bookId || !value || !activation || !readyDocument) return null;
        const units = [];
        for (const reference of activation.unitCandidates) {
          const qualified = await qualifiedUnit(reference.unitKey);
          if (!qualified || qualified.candidateId !== reference.candidateId
            || qualified.revision !== reference.candidateRevision) return null;
          units.push({ ...reference, manifest: qualified.manifest });
        }
        return {
          ownerId: uid,
          bookId,
          bookRevision: value.bookRevision,
          sourceSetRevision: value.sourceSetRevision,
          sourceSet: value.sourceSet,
          activationReceipt: activation,
          units,
          studentDocument: readyDocument.descriptor,
          registryVersion: typeof rawEnv.BOOK_ASSEMBLY_PREVIEW_REGISTRY_VERSION === 'string'
            ? rawEnv.BOOK_ASSEMBLY_PREVIEW_REGISTRY_VERSION : '',
          activities: activation.activities,
        };
      },
      };
    },
    approvalRepositoryFactory: (rawEnv, uid) => new FirebaseRestBookAssemblyPreviewApprovalRepository({
      env: rawEnv as never,
      getFirebaseAuthToken: (request) => {
         const match = /^book_assembly_preview_approvals\/books\/([^/]+)\/units\/([^/]+)\/(?:approvals|revocations)\/([^/]+)$/u.exec(request?.path ?? '');
         if (!match) throw new Error('preview_approval_scope_unavailable');
         return approvalClaimProvider(rawEnv as Env, uid, match[1]!, match[2]!, match[3]!, 'book_assembly_preview_approval')();
      },
    }),
  },
  assemblyPublication: {
    bindingRepositoryFactory: (env) => bindings(env as Env),
    fullPdf: {
      readUser: async ({ env, actorId }) => new FirebaseRestBookActivityAuthoringRepository({ env: env as never })
        .readValue(`users/${actorId}`),
      readAuthority: ({ env, actorId, bookId }) => authority(env as Env, actorId, bookId, 'publication'),
      readActivities: ({ env, ownerId, bookId, unitKey, activityKeys, authority: suppliedAuthority, candidate }) => typeof ownerId === 'string'
         && typeof bookId === 'string' && typeof unitKey === 'string'
         ? activities(env as Env, ownerId, bookId, unitKey, activityKeys, suppliedAuthority, candidate)
         : Promise.resolve({}),
      readLineage: ({ env, actorId, bookId, unitKey }, suppliedAuthority, candidate) => lineage(env as Env, actorId, bookId, unitKey, suppliedAuthority, candidate),
      readPreviewApproval: ({ env, actorId, bookId, unitKey, approvalId }) => new FirebaseRestBookAssemblyPreviewApprovalRepository({ env: env as never,
         getFirebaseAuthToken: approvalClaimProvider(env as Env, actorId, bookId, unitKey, approvalId, 'book_assembly_publication_approval') }).read(bookId, unitKey, approvalId),
      sourceIsPreviewReady: ({ env, actorId, bookId, sourceVersionId, authority: suppliedAuthority }) => suppliedAuthority
        ? isFullPdfPublicationSourceReady(suppliedAuthority.sourceVersionAuthority.getSourceVersion(sourceVersionId))
        : sourceIsFullPdfPublicationReady(env as Env, actorId, bookId, sourceVersionId),
    },
    componentPdf: (() => {
      const createRequestScope = (shared?: {
        readonly readPublicationScope?: (bookId: string) => Promise<Awaited<ReturnType<FirebaseRestBookAssemblyPublicationRepository['readScope']>>>;
      }) => {
        const authorityCache = new Map<string, Promise<Awaited<ReturnType<typeof authority>>>>();
        const publicationScopeCache = new Map<string, Promise<Awaited<ReturnType<FirebaseRestBookAssemblyPublicationRepository['readScope']>>>>();
        const assemblyScopeCache = new Map<string, Promise<Awaited<ReturnType<FirebaseRestBookAssemblyRepository['readScope']>>>>();
        const ownerRootCache = new Map<string, Promise<Awaited<ReturnType<FirebaseRestBookActivityAuthoringRepository['readOwnerRoot']>>>>();
        const readyStudentDocCache = new Map<string, Promise<Awaited<ReturnType<typeof resolveReadyActiveStudentDocument>>>>();
        const approvalTokenCache = new Map<string, () => Promise<string>>();
        const authorityTokenCache = new Map<string, () => Promise<string>>();
        const wholeCallCounts = new Map<string, number>();
        let activityRepo: FirebaseRestBookActivityAuthoringRepository | undefined;
        let assemblyRepoByOwner: Map<string, FirebaseRestBookAssemblyRepository> | undefined;
        const getActivityRepo = (env: Env) => activityRepo ??= new FirebaseRestBookActivityAuthoringRepository({ env: env as never });
        const getAssemblyRepo = (env: Env, ownerId: string) => {
          assemblyRepoByOwner ??= new Map();
          let repo = assemblyRepoByOwner.get(ownerId);
          if (!repo) {
            repo = new FirebaseRestBookAssemblyRepository({ env: env as never, ownerId });
            assemblyRepoByOwner.set(ownerId, repo);
          }
          return repo;
        };
        const getAuthorityToken = (env: Env, actorId: string, bookId: string) => {
          const key = `${actorId}/${bookId}`;
          let provider = authorityTokenCache.get(key);
          if (!provider) {
            provider = claimProvider(env, actorId, bookId, 'publication');
            authorityTokenCache.set(key, provider);
          }
          return provider;
        };

        const getAuthority = (env: Env, actorId: string, bookId: string) => {
          const key = `${actorId}/${bookId}`;
          let entry = authorityCache.get(key);
          if (!entry) {
            entry = createFirebaseBookSourceAuthorityReader({
              ...env,
              BOOK_SOURCE_UPLOAD_ACCOUNT_ID: typeof env.BOOK_SOURCE_UPLOAD_ACCOUNT_ID === 'string' ? env.BOOK_SOURCE_UPLOAD_ACCOUNT_ID : '',
              getFirebaseAuthToken: getAuthorityToken(env, actorId, bookId),
            }).read({ ownerId: actorId, bookId });
            authorityCache.set(key, entry);
          }
          return entry;
        };
        const readFreshAuthority = async (env: Env, actorId: string, bookId: string) => {
          const prior = await getAuthority(env, actorId, bookId);
          if (!prior) return null;
          // Fresh live RTDB read of the mutable Material Book row using the already-minted publication claim token.
          const freshBook = record(await new FirebaseRtdbRestClient({
            env: env as never,
            fetchImpl: globalThis.fetch,
            firebaseAuthToken: true,
            getFirebaseAuthToken: getAuthorityToken(env, actorId, bookId),
          }).readValue(MATERIAL_BOOK_PATH(bookId)));
          if (!freshBook) return null;
          const sameMutableTuple = freshBook.ownerId === prior.ownerId
            && freshBook.bookId === prior.bookId
            && freshBook.bookMode === prior.bookMode
            && freshBook.bookRevision === prior.bookRevision
            && freshBook.sourceSetRevision === prior.sourceSetRevision
            && fingerprintComponentPdfActivationValue(freshBook.sourceSet) === fingerprintComponentPdfActivationValue(prior.sourceSet)
            && fingerprintComponentPdfActivationValue(freshBook.setupActivations ?? null)
              === fingerprintComponentPdfActivationValue(prior.setupActivations ?? null);
          if (sameMutableTuple) return prior;
          return createFirebaseBookSourceAuthorityReader({
            ...env,
            BOOK_SOURCE_UPLOAD_ACCOUNT_ID: typeof env.BOOK_SOURCE_UPLOAD_ACCOUNT_ID === 'string' ? env.BOOK_SOURCE_UPLOAD_ACCOUNT_ID : '',
            getFirebaseAuthToken: getAuthorityToken(env, actorId, bookId),
          }).read({ ownerId: actorId, bookId });
        };
        const getPublicationScope = (env: Env, actorId: string, bookId: string) => {
          const key = `${actorId}/${bookId}`;
          let entry = publicationScopeCache.get(key);
          if (!entry) {
            entry = shared?.readPublicationScope
              ? shared.readPublicationScope(bookId)
              : new FirebaseRestBookAssemblyPublicationRepository({ env: env as never, ownerId: actorId }).readScope(bookId);
            publicationScopeCache.set(key, entry);
          }
          return entry;
        };
        const getAssemblyScope = (env: Env, actorId: string, bookId: string, unitKey: string) => {
          const key = `${actorId}/${bookId}/${unitKey}`;
          let entry = assemblyScopeCache.get(key);
          if (!entry) {
            entry = getAssemblyRepo(env, actorId).readScope(bookId, unitKey);
            assemblyScopeCache.set(key, entry);
          }
          return entry;
        };
        const getOwnerRoot = (env: Env, ownerId: string) => {
          let entry = ownerRootCache.get(ownerId);
          if (!entry) {
            entry = getActivityRepo(env).readOwnerRoot(ownerId);
            ownerRootCache.set(ownerId, entry);
          }
          return entry;
        };
        const getReadyStudentDocument = (
          env: Env,
          actorId: string,
          bookId: string,
          bookAuthority: NonNullable<Awaited<ReturnType<typeof authority>>>,
          pubScope: Awaited<ReturnType<FirebaseRestBookAssemblyPublicationRepository['readScope']>>,
          sourceVersionId: string,
        ) => {
          const key = `${actorId}/${bookId}/${sourceVersionId}`;
          let entry = readyStudentDocCache.get(key);
          if (!entry) {
            entry = resolveReadyActiveStudentDocument(env, actorId, bookId, bookAuthority, pubScope);
            readyStudentDocCache.set(key, entry);
          }
          return entry;
        };

        return {
          readUser: ({ env, actorId }: { readonly env: unknown; readonly actorId: string }) =>
            getActivityRepo(env as Env).readValue(`users/${actorId}`),
          readAuthority: ({ env, actorId, bookId }: { readonly env: unknown; readonly actorId: string; readonly bookId: string }) =>
            getAuthority(env as Env, actorId, bookId),
          readCandidate: async ({ env, actorId, bookId, unitKey, candidateId }: {
            readonly env: unknown; readonly actorId: string; readonly bookId: string; readonly unitKey: string; readonly candidateId: string;
          }) => (await getAssemblyScope(env as Env, actorId, bookId, unitKey)).candidates?.[candidateId] ?? null,
          readWholeActivationApprovalInput: async ({ env, actorId, bookId }: { readonly env: unknown; readonly actorId: string; readonly bookId: string }) => {
            const key = `${actorId}/${bookId}`;
            const callIndex = wholeCallCounts.get(key) ?? 0;
            wholeCallCounts.set(key, callIndex + 1);
            // Planning pass reuses per-request authority; final TOCTOU guard re-reads fresh live Material Book row.
            const bookAuthority = callIndex === 0
              ? await getAuthority(env as Env, actorId, bookId)
              : await readFreshAuthority(env as Env, actorId, bookId);
            const activation = activeComponentPdfActivation(bookAuthority ?? {});
            if (!bookAuthority || !activation) return null;
            const pubScope = await getPublicationScope(env as Env, actorId, bookId);
            const document = await getReadyStudentDocument(
              env as Env, actorId, bookId, bookAuthority, pubScope, activation.studentDocument.sourceVersionId,
            );
            if (!document) return null;
            const units = [];
            for (const reference of activation.unitCandidates) {
              const assemblyScope = await getAssemblyScope(env as Env, actorId, bookId, reference.unitKey);
              const qualified = await materialQualified(env as Env, actorId, bookId, reference.unitKey, {
                bookAuthority,
                publicationScope: pubScope,
                assemblyScope,
              });
              if (!qualified || qualified.candidate.candidateId !== reference.candidateId
                || qualified.candidate.revision !== reference.candidateRevision) return null;
              units.push({ ...reference, manifest: qualified.candidate.manifest });
            }
            return {
              ownerId: actorId, bookId, bookRevision: bookAuthority.bookRevision,
              sourceSetRevision: bookAuthority.sourceSetRevision, sourceSet: bookAuthority.sourceSet,
              activationReceipt: activation, units, studentDocument: document.descriptor,
              registryVersion: typeof (env as Env).BOOK_ASSEMBLY_PREVIEW_REGISTRY_VERSION === 'string'
                ? (env as Env).BOOK_ASSEMBLY_PREVIEW_REGISTRY_VERSION : '',
              activities: activation.activities,
            };
          },
          readActivities: async ({ env, ownerId, bookId, unitKey, activityKeys }: {
            readonly env: unknown; readonly ownerId: string; readonly bookId: string; readonly unitKey?: string; readonly activityKeys: readonly string[];
          }) => {
            if (activityKeys.length === 0 || typeof ownerId !== 'string' || typeof bookId !== 'string' || typeof unitKey !== 'string') {
              return {};
            }
            const [bookAuthority, publicationScope, assemblyScope, ownerRoot] = await Promise.all([
              getAuthority(env as Env, ownerId, bookId),
              getPublicationScope(env as Env, ownerId, bookId),
              getAssemblyScope(env as Env, ownerId, bookId, unitKey),
              getOwnerRoot(env as Env, ownerId),
            ]);
            return activities(env as Env, ownerId, bookId, unitKey, activityKeys, bookAuthority, undefined, {
              publicationScope,
              assemblyScope,
              ownerRoot,
            });
          },
          readLineage: async ({ env, actorId, bookId, unitKey }: {
            readonly env: unknown; readonly actorId: string; readonly bookId: string; readonly unitKey: string;
          }) => {
            const [bookAuthority, publicationScope, assemblyScope] = await Promise.all([
              getAuthority(env as Env, actorId, bookId),
              getPublicationScope(env as Env, actorId, bookId),
              getAssemblyScope(env as Env, actorId, bookId, unitKey),
            ]);
            return lineage(env as Env, actorId, bookId, unitKey, bookAuthority, undefined, {
              publicationScope,
              assemblyScope,
            });
          },
          readPreviewApproval: ({ env, actorId, bookId, unitKey, approvalId }: {
            readonly env: unknown; readonly actorId: string; readonly bookId: string; readonly unitKey: string; readonly approvalId: string;
          }) => {
            const key = `${actorId}/${bookId}/${unitKey}/${approvalId}`;
            let getToken = approvalTokenCache.get(key);
            if (!getToken) {
              getToken = approvalClaimProvider(env as Env, actorId, bookId, unitKey, approvalId, 'book_assembly_publication_approval');
              approvalTokenCache.set(key, getToken);
            }
            // Reuse the claim token within this request, but always read live RTDB so mid-flight revocations are caught.
            return new FirebaseRestBookAssemblyPreviewApprovalRepository({
              env: env as never,
              getFirebaseAuthToken: getToken,
            }).read(bookId, unitKey, approvalId);
          },
          // Component publication remains closed until Lane S/P pins a verified
          // student-document descriptor. Private components stay authoring-only.
          sourceIsPreviewReady: async () => false,
        };
      };
      return {
        ...createRequestScope(),
        createRequestScope,
      };
    })(),
  },
});
