import {
  createActivityRevisionPublishService,
  type ActivityRevisionPublishResult,
} from '../../../../src/services/book-activity/activityRevisionPublish.service.ts';
import { FirebaseRestBookActivityAuthoringRepository } from '../book-activity-authoring/repository.ts';
import type {
  BookActivityRevisionWorkerEnv,
  TrustedActivityRevisionCommand,
  TrustedActivityRevisionResult,
  TrustedActivityRevisionService,
} from './activity-revision-worker.ts';
import { createBookActivityRevisionWorkerHandlers } from './activity-revision-worker.ts';
import {
  FirebaseRestActivityRevisionRepository,
  type ActivityRevisionRepositoryEnv,
} from './activity-revision-repository.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PATH_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
};
const stringArray = (value: unknown): string[] => (
  Array.isArray(value) && value.every((entry) => typeof entry === 'string')
    ? [...value]
    : []
);
const failure = (
  status: 'conflict' | 'idempotency-conflict' | 'invalid' | 'not-found' | 'forbidden',
  failureCode: string,
): TrustedActivityRevisionResult => ({ status, failureCode });

const trustedResult = (
  value: ActivityRevisionPublishResult,
): TrustedActivityRevisionResult => {
  if (value.status === 'rolled-back') return failure('conflict', value.failureCode);
  return value;
};

/**
 * Concrete #68 production composition. It consumes #35's durable candidate,
 * re-runs #68 validation/preview, and publishes through the #64 canonical
 * immutable-version writer plus #68's bounded revision-control CAS.
 */
export const createFirebaseActivityRevisionService = (options: {
  readonly env: ActivityRevisionRepositoryEnv;
  readonly fetchImpl?: typeof fetch;
  readonly getAccessToken?: () => Promise<string>;
  readonly now?: () => string;
}): TrustedActivityRevisionService => ({
  revalidateAndCommit: async (
    command: TrustedActivityRevisionCommand,
  ): Promise<TrustedActivityRevisionResult> => {
    if (!UUID.test(command.operationId)
      || !PATH_ID.test(command.activityId)
      || !PATH_ID.test(command.candidateId)
      || !PATH_ID.test(command.actorId)
      || !PATH_ID.test(command.expectedCurrentActivityVersionId)) {
      return failure('invalid', 'invalid_revision_identity');
    }

    const authoring = new FirebaseRestBookActivityAuthoringRepository({
      env: options.env,
      fetchImpl: options.fetchImpl,
      getAccessToken: options.getAccessToken,
    });
    const authoringRoot = await authoring.readOwnerRoot(command.actorId);
    const rawCandidate = authoringRoot.candidates?.[command.candidateId];
    if (!isRecord(rawCandidate)) return failure('not-found', 'candidate_not_found');
    if (rawCandidate.ownerId !== command.actorId
      || rawCandidate.candidateId !== command.candidateId
      || rawCandidate.targetActivityId !== command.activityId) {
      return failure('forbidden', 'candidate_owner_mismatch');
    }
    if (rawCandidate.revision !== command.expectedCandidateRevision
      || rawCandidate.targetRevision !== command.expectedCurrentActivityVersion) {
      return failure('conflict', 'stale_candidate_revision');
    }
    if (rawCandidate.lifecycle !== 'validated' && rawCandidate.lifecycle !== 'saved') {
      return failure('invalid', 'candidate_not_publishable');
    }
    if (!isRecord(rawCandidate.validation) || rawCandidate.validation.valid !== true) {
      return failure('invalid', 'candidate_validation_failed');
    }
    if (stable(rawCandidate.content) !== stable(command.replacementContent)
      || stable(stringArray(rawCandidate.evidenceRefs)) !== stable(command.evidenceRefs)
      || stable(stringArray(rawCandidate.sourceEvidenceRefs)) !== stable(command.sourceEvidenceRefs)
      || stable(stringArray(rawCandidate.answerEvidenceRefs)) !== stable(command.answerEvidenceRefs)) {
      return failure('conflict', 'candidate_reload_required');
    }

    const repository = new FirebaseRestActivityRevisionRepository({
      env: options.env,
      activityId: command.activityId,
      expectedCurrentActivityVersionId: command.expectedCurrentActivityVersionId,
      expectedCurrentActivityVersion: command.expectedCurrentActivityVersion,
      ownerId: command.actorId,
      fetchImpl: options.fetchImpl,
      getAccessToken: options.getAccessToken,
    });
    const service = createActivityRevisionPublishService(repository, {
      // Deterministic for crash/retry: an unexposed prepared record is reused,
      // never multiplied into several usable successor versions.
      versionIdProvider: { createId: () => `revision-${command.operationId}` },
    });
    const preview = await service.preview({
      activityId: command.activityId,
      ownerId: command.actorId,
      candidateId: command.candidateId,
      candidateRevision: command.expectedCandidateRevision,
      expectedCurrentVersionId: command.expectedCurrentActivityVersionId,
      expectedCurrentVersion: command.expectedCurrentActivityVersion,
      expectedContextFingerprint: typeof command.expectedSourceContext?.fingerprint === 'string'
        ? command.expectedSourceContext.fingerprint
        : null,
      sourceContext: command.expectedSourceContext,
      evidenceRefs: command.evidenceRefs,
      sourceEvidenceRefs: command.sourceEvidenceRefs,
      answerEvidenceRefs: command.answerEvidenceRefs,
      replacement: command.replacementContent,
    });
    if (preview.status !== 'ready') {
      return failure(
        preview.status === 'forbidden' ? 'forbidden'
          : preview.status === 'not-found' ? 'not-found'
            : preview.status === 'invalid' ? 'invalid'
              : 'conflict',
        preview.failureCode,
      );
    }
    if (preview.candidate.candidateRevision !== command.expectedCandidateRevision
      || preview.candidate.fingerprint !== command.previewApproval.approvalId) {
      return failure('conflict', 'preview_approval_stale');
    }
    return trustedResult(await service.publish({
      operationId: command.operationId,
      ownerId: command.actorId,
      candidate: preview.candidate,
      previewApproval: command.previewApproval,
      now: options.now?.(),
    }));
  },
});

export const createFirebaseBookActivityRevisionWorkerHandlers = (options: {
  readonly fetchImpl?: typeof fetch;
  readonly getAccessToken?: () => Promise<string>;
  readonly now?: () => string;
  readonly authenticate: (
    uid: string,
    env: BookActivityRevisionWorkerEnv,
  ) => Promise<void>;
}) => createBookActivityRevisionWorkerHandlers({
  authenticate: options.authenticate,
  revisionServiceForEnv: (env) => createFirebaseActivityRevisionService({
    env: env as ActivityRevisionRepositoryEnv,
    fetchImpl: options.fetchImpl,
    getAccessToken: options.getAccessToken,
    now: options.now,
  }),
});
