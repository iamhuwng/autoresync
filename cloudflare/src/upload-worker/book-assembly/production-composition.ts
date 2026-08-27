/** Default #59 server composition. All records are read through durable RTDB adapters. */
import type { NormalizedActivity } from '../../../../src/types/bookActivity.types.ts';
import type { BookRouteHandlersOptions } from '../book-route-handlers.ts';
import { FirebaseRestBookActivityAuthoringRepository } from '../book-activity-authoring/repository.ts';
import { createBookActivityAuthoringWorkerHandlers } from '../book-activity-authoring/worker.ts';
import { createFirebaseClaimTokenProvider, type BookFirebaseClaimTuple } from '../book-activity-authoring/firebase-token.ts';
import { FirebaseRestBookAssemblyRepository } from './repository.ts';
import { createBookAssemblyWorkerHandlers } from './worker.ts';
import { createFirebaseBookSourceAuthorityReader } from './book-source-authority-reader.ts';
import { FirebaseRestBookAssemblyPreviewApprovalRepository } from './preview-approval-repository.ts';
import { FirebaseRestUnitActivityBindingRepository } from './unit-activity-binding-repository.ts';

type Env = Record<string, unknown>;
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : null;

type AssemblyClaimService = 'book_assembly' | 'book_assembly_preview' | 'book_assembly_publication';
const claimProvider = (
  env: Env, ownerId: string, bookId: string, unitKey: string, service: AssemblyClaimService = 'book_assembly',
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

const authority = (env: Env, ownerId: string, bookId: string, unitKey: string) => createFirebaseBookSourceAuthorityReader({
  ...(env as never),
  BOOK_SOURCE_UPLOAD_ACCOUNT_ID: typeof env.BOOK_SOURCE_UPLOAD_ACCOUNT_ID === 'string' ? env.BOOK_SOURCE_UPLOAD_ACCOUNT_ID : '',
  getFirebaseAuthToken: claimProvider(env, ownerId, bookId, unitKey),
}).read({ ownerId, bookId });

const bindings = (env: Env) => new FirebaseRestUnitActivityBindingRepository({ env: env as never });

const activities = async (env: Env, ownerId: string, bookId: string, unitKey: string, activityKeys: readonly string[]) => {
  const root = await new FirebaseRestBookActivityAuthoringRepository({ env: env as never }).readOwnerRoot(ownerId);
  const bindingRepository = bindings(env);
  const output: Record<string, { activityKey: string; ownerId: string; revision: number; lifecycle: 'draft'; activity: NormalizedActivity }> = {};
  await Promise.all(activityKeys.map(async (activityKey) => {
    const binding = await bindingRepository.read({ ownerId, bookId, unitKey, activityKey });
    const activity = binding ? record(root.activities?.[binding.activityId]) : null;
    const candidate = binding ? record(root.candidates?.[binding.candidateId]) : null;
    if (!binding || !activity || !candidate || activity.activityId !== binding.activityId || activity.ownerId !== ownerId
      || activity.lifecycle !== 'draft' || !Number.isSafeInteger(activity.revision) || activity.revision < 1
      || candidate.candidateId !== binding.candidateId || candidate.targetActivityId !== binding.activityId
      || candidate.ownerId !== ownerId || candidate.revision !== binding.candidateRevision
      || !['validated', 'saved'].includes(String(candidate.lifecycle)) || candidate.validation === null
      || record(candidate.validation)?.valid !== true || !record(activity.draft)) return;
    output[activityKey] = { activityKey, ownerId, revision: activity.revision as number, lifecycle: 'draft', activity: activity.draft as NormalizedActivity };
  }));
  return output;
};

const lineage = async (env: Env, ownerId: string, bookId: string, unitKey: string) => {
  const scope = await new FirebaseRestBookAssemblyRepository({ env: env as never, ownerId }).readScope(bookId, unitKey);
  const candidate = scope.current ? scope.candidates?.[scope.current.candidateId] : undefined;
  const slots = candidate?.manifest?.units.find((unit) => unit.unitKey === unitKey)?.activitySlots ?? [];
  const result: Record<string, { activityId: string; lastActivityVersionId?: string; lastActivityVersion?: number }> = {};
  await Promise.all(slots.map(async (slot) => {
    const binding = await bindings(env).read({ ownerId, bookId, unitKey, activityKey: slot.activityKey });
    if (!binding) return;
    result[slot.activityKey] = { activityId: binding.activityId, ...(binding.activityVersionId ? {
      lastActivityVersionId: binding.activityVersionId, lastActivityVersion: binding.activityVersion,
    } : {}) };
  }));
  return result;
};

const assemblyActivityContracts = async (env: Env, ownerId: string, bookId: string, unitKey: string) => {
  const scope = await new FirebaseRestBookAssemblyRepository({ env: env as never, ownerId }).readScope(bookId, unitKey);
  const current = scope.current;
  const assemblyCandidate = current ? scope.candidates?.[current.candidateId] : undefined;
  if (!current || !assemblyCandidate || assemblyCandidate.ownerId !== ownerId
    || assemblyCandidate.bookId !== bookId || assemblyCandidate.unitKey !== unitKey
    || assemblyCandidate.revision !== current.candidateRevision
    || assemblyCandidate.lifecycle !== 'validated') return null;
  const unit = assemblyCandidate.manifest?.units.find((entry) => entry.unitKey === unitKey);
  return unit?.activitySlots.map((slot) => ({
    activityKey: slot.activityKey,
    contextRequirement: slot.contextRequirement,
  })) ?? null;
};

const assemblyActivityPageRefs = async (
  env: Env,
  ownerId: string,
  bookId: string,
  unitKey: string,
  activityKey: string,
) => {
  const scope = await new FirebaseRestBookAssemblyRepository({ env: env as never, ownerId }).readScope(bookId, unitKey);
  const current = scope.current;
  const assemblyCandidate = current ? scope.candidates?.[current.candidateId] : undefined;
  if (!current || !assemblyCandidate || assemblyCandidate.ownerId !== ownerId
    || assemblyCandidate.bookId !== bookId || assemblyCandidate.unitKey !== unitKey
    || assemblyCandidate.revision !== current.candidateRevision
    || assemblyCandidate.lifecycle !== 'validated') return null;
  const unit = assemblyCandidate.manifest?.units.find((entry) => entry.unitKey === unitKey);
  const slot = unit?.activitySlots.find((entry) => entry.activityKey === activityKey);
  if (!unit || !slot) return null;
  const groups = new Map(unit.pageGroups.map((group) => [group.pageGroupKey, group]));
  const refs = slot.pageGroupKeys.flatMap((pageGroupKey) => {
    const group = groups.get(pageGroupKey);
    return group ? group.pages.map((page) => `source:${group.sourceKey}:page:${page}`) : [];
  });
  return refs.length > 0 ? refs : null;
};

/** Concrete preview/publication ports used when `createUploadWorker()` receives no test injection. */
export const createProductionBookAssemblyRouteOptions = (): Pick<BookRouteHandlersOptions,
  'activityAuthoringHandlers' | 'assemblyHandlers' | 'assemblyPreview' | 'assemblyPublication'> => ({
  assemblyHandlers: createBookAssemblyWorkerHandlers({
    readBookAuthority: (_repository, bookId, context) => context
      ? authority(context.env as Env, context.ownerId, bookId, 'candidate')
      : Promise.resolve(null),
  }),
  activityAuthoringHandlers: createBookActivityAuthoringWorkerHandlers({
    resolveOwnedPdfBookId: async ({ env, ownerId, claimedBookId }) => {
      const resolved = await authority(env as Env, ownerId, claimedBookId, 'authoring');
      if (!resolved
        || resolved.bookId !== claimedBookId
        || resolved.ownerId !== ownerId
        || resolved.bookMode !== 'pdf'
        || resolved.sourceSet.sources.length === 0
        || resolved.sourceSet.sources.some((source) =>
          resolved.sourceVersionAuthority.getSourceVersion(source.sourceVersionId)?.verifiedUsable !== true)) {
        return undefined;
      }
      return claimedBookId;
    },
    bindingRepositoryFactory: (env) => bindings(env as Env),
    readAssemblyActivityKeys: async ({ env, ownerId, bookId: scopedBookId, unitKey }) =>
      (await assemblyActivityContracts(env as Env, ownerId, scopedBookId, unitKey))?.map((slot) => slot.activityKey) ?? null,
    readAssemblyActivityContracts: async ({ env, ownerId, bookId: scopedBookId, unitKey }) =>
      assemblyActivityContracts(env as Env, ownerId, scopedBookId, unitKey),
    readAssemblyActivityPageRefs: async ({ env, ownerId, bookId: scopedBookId, unitKey, activityKey }) =>
      assemblyActivityPageRefs(env as Env, ownerId, scopedBookId, unitKey, activityKey),
  }),
  assemblyPreview: {
    portFactory: (rawEnv, uid, scope) => ({
      readUser: async () => new FirebaseRestBookActivityAuthoringRepository({ env: rawEnv as never }).readValue(`users/${uid}`),
      readBookAuthority: (bookId) => authority(rawEnv as Env, uid, bookId, 'preview'),
      readCandidate: async ({ bookId, unitKey, candidateId }) => (await new FirebaseRestBookAssemblyRepository({ env: rawEnv as never, ownerId: uid }).readScope(bookId, unitKey)).candidates?.[candidateId] ?? null,
      readActivities: ({ ownerId, activityKeys }) => activities(rawEnv as Env, ownerId, scope.bookId, scope.unitKey, activityKeys).then((value) => Object.entries(value).map(([activityKey, item]) => ({ activityKey, ownerId: item.ownerId, lifecycle: 'validated' as const, content: item.activity }))),
      sourceIsPreviewReady: async ({ bookId, sourceVersionId }) => !!(await authority(rawEnv as Env, uid, bookId, 'preview'))?.sourceVersionAuthority.getSourceVersion(sourceVersionId)?.verifiedUsable,
    }),
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
      readActivities: ({ env, ownerId, bookId, unitKey, activityKeys }) => activities(env as Env, ownerId, bookId, unitKey, activityKeys),
      readLineage: ({ env, actorId, bookId, unitKey }) => lineage(env as Env, actorId, bookId, unitKey),
      readPreviewApproval: ({ env, actorId, bookId, unitKey, approvalId }) => new FirebaseRestBookAssemblyPreviewApprovalRepository({ env: env as never,
        getFirebaseAuthToken: approvalClaimProvider(env as Env, actorId, bookId, unitKey, approvalId, 'book_assembly_publication_approval') }).read(bookId, unitKey, approvalId),
      sourceIsPreviewReady: async ({ env, actorId, bookId, sourceVersionId }) => !!(await authority(env as Env, actorId, bookId, 'publication'))?.sourceVersionAuthority.getSourceVersion(sourceVersionId)?.verifiedUsable,
    },
    componentPdf: {
      readAuthority: ({ env, actorId, bookId }) => authority(env as Env, actorId, bookId, 'publication'),
      readActivities: ({ env, ownerId, bookId, unitKey, activityKeys }) => activities(env as Env, ownerId, bookId, unitKey, activityKeys),
      readLineage: ({ env, actorId, bookId, unitKey }) => lineage(env as Env, actorId, bookId, unitKey),
      readPreviewApproval: ({ env, actorId, bookId, unitKey, approvalId }) => new FirebaseRestBookAssemblyPreviewApprovalRepository({ env: env as never,
        getFirebaseAuthToken: approvalClaimProvider(env as Env, actorId, bookId, unitKey, approvalId, 'book_assembly_publication_approval') }).read(bookId, unitKey, approvalId),
      sourceIsPreviewReady: async ({ env, actorId, bookId, sourceVersionId }) => !!(await authority(env as Env, actorId, bookId, 'publication'))?.sourceVersionAuthority.getSourceVersion(sourceVersionId)?.verifiedUsable,
    },
  },
});
