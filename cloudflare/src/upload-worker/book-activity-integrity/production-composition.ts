import type {
  BookIntegrityAttemptAuthority,
  BookIntegrityCaptureTarget,
} from '../../../../src/services/book-activity/bookIntegrityCapture.types.ts';
import {
  createDefaultBookIntegrityPolicy,
  deriveBookIntegrityCaptureSlotId,
} from '../../../../src/services/book-activity/bookIntegrityCapture.service.ts';
import type { BookRuntimeDeliveryActivityProjection } from '../../../../src/services/book-delivery/bookDelivery.types.ts';
import type { BookHomeworkAuthorityScope } from '../../../../src/services/book-homework/bookHomeworkAuthority.types.ts';
import {
  bookHomeworkRecipientAuthorityId,
  readBookHomeworkRecipientAuthority,
} from '../book-homework/identity.ts';
import {
  FirebaseRestBookHomeworkDocumentStore,
  type BookHomeworkRepositoryEnv,
} from '../book-homework/repository.ts';
import { FirebaseRestBookHomeworkSagaRepository } from '../book-homework/sagaRepository.ts';
import {
  FirebaseRestBookDeliveryRepository,
  type BookDeliveryRepositoryEnv,
} from '../book-delivery/repository.ts';
import {
  FirebaseRestBookRuntimeRepository,
  type BookRuntimeRepositoryEnv,
  type BookRuntimeTerminalTuple,
} from '../book-runtime/repository.ts';
import type { BookIntegrityWorkerEnv, BookIntegrityWorkerOptions } from './worker.ts';
import { FirebaseRestBookIntegrityReportRepository } from './report-repository.ts';
import { createBookResultReadProductionHandlers } from '../book-results/production-composition.ts';

const CAPTURE_LIMIT = 50;
const MAX_ATTEMPT_NUMBER = 1_000;

export const isCompleteTerminalForTarget = (
  row: BookRuntimeTerminalTuple,
  target: BookIntegrityCaptureTarget,
  recipientId: string,
): boolean => {
  const { attempt, result, completion, index } = row;
  return attempt.recipientId === recipientId
    && attempt.contextId === target.contextId
    && attempt.placementId === target.placementId
    && attempt.activityId === target.activityId
    && attempt.activityVersion === target.activityVersion
    && attempt.attemptNumber > 0
    && result.bindingId === attempt.bindingId
    && result.bindingRevision === attempt.bindingRevision
    && result.attemptId === attempt.attemptId
    && result.resultId === `${attempt.attemptId}:result`
    && result.recipientId === attempt.recipientId
    && result.contextId === attempt.contextId
    && result.placementId === attempt.placementId
    && result.activityId === attempt.activityId
    && result.activityVersion === attempt.activityVersion
    && result.activityVersionId === attempt.activityVersionId
    && result.attemptNumber === attempt.attemptNumber
    && (result.status === 'pending_review' || result.status === 'submitted')
    && completion.bindingId === attempt.bindingId
    && completion.bindingRevision === attempt.bindingRevision
    && completion.attemptId === attempt.attemptId
    && completion.completionId === `${attempt.attemptId}:completion`
    && completion.resultId === result.resultId
    && completion.recipientId === attempt.recipientId
    && completion.contextId === attempt.contextId
    && completion.placementId === attempt.placementId
    && completion.activityId === attempt.activityId
    && completion.activityVersion === attempt.activityVersion
    && completion.activityVersionId === attempt.activityVersionId
    && completion.attemptNumber === attempt.attemptNumber
    && completion.status === 'completed'
    && index.bindingId === attempt.bindingId
    && index.bindingRevision === attempt.bindingRevision
    && index.attemptId === attempt.attemptId
    && index.resultId === result.resultId
    && index.recipientId === attempt.recipientId
    && index.contextId === attempt.contextId
    && index.placementId === attempt.placementId
    && index.activityId === attempt.activityId
    && index.activityVersion === attempt.activityVersion
    && index.activityVersionId === attempt.activityVersionId
    && index.attemptNumber === attempt.attemptNumber;
};

const resolveCaptureAuthority = async (input: {
  readonly actorUid: string;
  readonly target: BookIntegrityCaptureTarget;
  readonly env: BookIntegrityWorkerEnv;
}): Promise<BookIntegrityAttemptAuthority | null> => {
  if (input.target.contextKind !== 'homework' || !input.actorUid) return null;
  const env = input.env as BookIntegrityWorkerEnv
    & BookDeliveryRepositoryEnv
    & BookHomeworkRepositoryEnv
    & BookRuntimeRepositoryEnv;
  const deliveryRepository = new FirebaseRestBookDeliveryRepository({ env });
  const runtimeRepository = new FirebaseRestBookRuntimeRepository({ env });
  const authorityStore = new FirebaseRestBookHomeworkDocumentStore({ env });
  const current = await deliveryRepository.resolveCurrent(input.actorUid, input.target.contextId);
  const binding = current?.record.binding;
  if (!binding
    || binding.context.kind !== 'homework'
    || binding.context.recipientId !== input.actorUid
    || binding.book.bookId !== input.target.bookId
    || binding.context.ownerId !== binding.issuer.ownerId
    || binding.context.contextId !== input.target.contextId
    || binding.context.recipientId !== input.actorUid
    || binding.bindingId !== input.target.bindingId
    || binding.revision !== input.target.bindingRevision) return null;
  const placement = binding.placements.find((candidate) => candidate.placementId === input.target.placementId);
  if (!placement
    || placement.activityId !== input.target.activityId
    || placement.activityVersion !== input.target.activityVersion) return null;
  const authority = await readBookHomeworkRecipientAuthority(
    authorityStore,
    {
      authorityId: bookHomeworkRecipientAuthorityId(binding.context.contextId, input.actorUid),
      assignmentId: binding.context.contextId,
      ownerId: binding.issuer.ownerId,
    } satisfies BookHomeworkAuthorityScope,
    input.actorUid,
  );
  const ownerId = binding.issuer.ownerId;
  const saga = await new FirebaseRestBookHomeworkSagaRepository({ env }).read(
    binding.context.contextId,
    ownerId,
  );
  const recipient = saga?.recipients.find((entry) => entry.recipientId === input.actorUid);
  const frozen = authority?.value.frozenPolicy;
  const activityPolicy = authority?.value.activityPolicies?.[placement.placementId];
  if (!authority
    || !saga
    || saga.assignmentId !== input.target.contextId
    || saga.contextId !== input.target.contextId
    || saga.ownerId !== ownerId
    || saga.state !== 'committed'
    || saga.visibility !== 'committed'
    || !recipient
    || recipient.state !== 'committed'
    || recipient.bindingId !== binding.bindingId
    || (recipient.bindingRevision !== undefined && recipient.bindingRevision !== binding.revision)
    || recipient.authorityId !== bookHomeworkRecipientAuthorityId(input.target.contextId, input.actorUid)
    || authority.value.visibility.status !== 'committed'
    || authority.value.bookManifest.book.bookId !== binding.book.bookId
    || authority.value.bookManifest.book.bookRevision !== binding.book.bookRevision
    || authority.value.bookManifest.manifestVersionId !== binding.book.manifestVersionId
    || authority.value.bookManifest.bindingRevision !== binding.revision
    || authority.value.bookManifest.book.manifestVersionId !== binding.book.manifestVersionId
    || authority.value.bookManifest.book.publicationId !== binding.book.publicationId
    || authority.value.bookManifest.book.publicationRevision !== binding.book.publicationRevision
    || authority.value.bookManifest.book.publicationStatus !== binding.book.publicationStatus
    || authority.value.bookManifest.context.contextId !== binding.context.contextId
    || authority.value.bookManifest.context.recipientId !== binding.context.recipientId
    || authority.value.bookManifest.context.kind !== 'homework'
    || !frozen
    || !activityPolicy
    || frozen.intent !== (frozen.integrityDefault ? 'accountable' : 'practice')
    || activityPolicy.activityId !== placement.activityId
    || activityPolicy.activityVersion !== placement.activityVersion
    || activityPolicy.activityVersionId !== placement.activityVersionId
    || !runtimeRepository.listTerminalTuples) return null;
  const rows = await runtimeRepository.listTerminalTuples({
    recipientId: input.actorUid,
    contextId: input.target.contextId,
    placementId: input.target.placementId,
    activityId: input.target.activityId,
    activityVersion: input.target.activityVersion,
    limit: CAPTURE_LIMIT,
  });
  if (rows.length >= CAPTURE_LIMIT
    || rows.some((row) => !isCompleteTerminalForTarget(row, input.target, input.actorUid))) return null;
  const matching = rows.filter((row) => row.attempt.activityVersionId === placement.activityVersionId);
  const ordered = [...matching].sort((left, right) => left.attempt.attemptNumber - right.attempt.attemptNumber);
  if (ordered.some((row, index) => row.attempt.attemptNumber !== index + 1)) return null;
  const attemptNumber = ordered.length + 1;
  if (attemptNumber > MAX_ATTEMPT_NUMBER) return null;
  const captureSlotId = await deriveBookIntegrityCaptureSlotId({
    target: input.target,
    recipientId: input.actorUid,
    attemptNumber,
  });
  const defaultPolicy = createDefaultBookIntegrityPolicy(frozen.intent, {
    policyId: activityPolicy.policyId,
    policyRevision: activityPolicy.policyRevision,
  });
  const enabled = frozen.integrityEffective;
  const frozenPolicy = {
    ...defaultPolicy,
    enabled,
    signals: Object.fromEntries(Object.keys(defaultPolicy.signals).map((signal) => [signal, enabled])) as typeof defaultPolicy.signals,
  };
  return {
    ...input.target,
    recipientId: input.actorUid,
    attemptNumber,
    captureAttemptNumber: attemptNumber,
    captureSlotId,
    active: true,
    frozenPolicy,
  };
};

export const resolveBookIntegrityCaptureLaunch = async (input: {
  readonly env: BookIntegrityWorkerEnv;
  readonly target: BookIntegrityCaptureTarget;
  readonly recipientId: string;
}): Promise<BookRuntimeDeliveryActivityProjection['integrityCapture'] | undefined> => {
  if (input.env.BOOK_INTEGRITY_ROUTES_ENABLED !== 'enabled') return undefined;
  let authority: BookIntegrityAttemptAuthority | null = null;
  try {
    authority = await resolveCaptureAuthority({
      actorUid: input.recipientId,
      target: input.target,
      env: input.env,
    });
  } catch {
    return undefined;
  }
  return authority ? {
    captureSlotId: authority.captureSlotId!,
    captureAttemptNumber: authority.captureAttemptNumber!,
    enabled: input.env.BOOK_INTEGRITY_ROUTES_ENABLED === 'enabled' && authority.frozenPolicy.enabled,
    frozenPolicy: authority.frozenPolicy,
  } : undefined;
};

export const createProductionBookIntegrityWorkerOptions = (): BookIntegrityWorkerOptions => ({
  resolveAttemptAuthority: resolveCaptureAuthority,
  resolveTeacherOwnerId: async ({ actorUid, bookId, terminalId, env }) => {
    if (!actorUid || !bookId || !terminalId) return null;
    const report = await new FirebaseRestBookIntegrityReportRepository({ env })
      .readReportForTeacher({ ownerId: actorUid, terminalId });
    const terminal = report?.terminal;
    if (!terminal || terminal.ownerId !== actorUid || terminal.recipientId === actorUid
      || terminal.bookId !== bookId || terminal.terminalId !== terminalId
      || terminal.contextKind !== 'homework'
      || terminal.terminalId !== terminal.completionId
      || terminal.completionId !== `${terminal.attemptId}:completion`
      || terminal.resultId !== `${terminal.attemptId}:result`) return null;
    // Reuse Results' current assignment fence and role checks; the immutable
    // report index alone does not authorize a retired or inaccessible context.
    const result = await createBookResultReadProductionHandlers().resultDetail({
      request: new Request(`https://worker.test/book-results/${encodeURIComponent(bookId)}/${encodeURIComponent(terminal.resultId)}`),
      env,
      uid: actorUid,
      bookId,
      studentId: terminal.recipientId,
      homeworkId: terminal.contextId,
      resultId: terminal.resultId,
    }) as { readonly body?: { readonly detail?: Record<string, unknown> }; readonly init?: ResponseInit };
    if (Number(result.init?.status ?? 200) >= 500) throw new Error('integrity_report_authority_unavailable');
    const detail = result.body?.detail;
    if (Number(result.init?.status ?? 200) !== 200 || !detail) return null;
    return ['ownerId', 'attemptId', 'resultId', 'recipientId', 'bindingId',
      'bindingRevision', 'contextId', 'placementId', 'activityId',
      'activityVersion', 'activityVersionId', 'attemptNumber'].every((key) => (
      detail[key] === terminal[key as keyof typeof terminal]
    )) ? actorUid : null;
  },
});
