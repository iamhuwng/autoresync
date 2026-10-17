import { authorizePublicBookBinding } from '../book-public/production.ts';
import { FirebaseRestBookAssemblyPublicationRepository } from '../book-assembly/publication-repository.ts';
import { resolveCombinedDocument } from '../book-homework/canonical-resolver.ts';
import type { ComponentStudentDocument } from '../../../../src/services/book-assembly/componentStudentDocument.types.ts';
import type { BookRouteHandlersOptions } from '../book-route-handlers.ts';
import type { BookRouterEnv } from '../book-router.ts';
import {
  FirebaseRestBookDeliveryRepository,
  type BookDeliveryRepositoryEnv,
} from '../book-delivery/repository.ts';
import {
  FirebaseRestBookHomeworkDocumentStore,
  createFirebaseRestBookHomeworkRepository,
  type BookHomeworkAuthorityRepository,
  type BookHomeworkRepositoryEnv,
} from '../book-homework/repository.ts';
import { BookHomeworkAuthorityError } from '../book-homework/authority.ts';
import {
  FirebaseRestBookHomeworkSagaRepository,
  type BookHomeworkSagaRepositoryEnv,
} from '../book-homework/sagaRepository.ts';
import { createBookHomeworkOwnerReader } from '../book-homework/worker.ts';
import {
  bookHomeworkRecipientAuthorityId,
  readBookHomeworkRecipientAuthority,
} from '../book-homework/identity.ts';
import {
  FirebaseBookResultReadRepository,
  type BookResultReadRepository,
} from './repository.ts';
import {
  createBookResultReadWorkerHandlers,
  type BookResultReadWorkerEnv,
} from './worker.ts';
import type {
  BookResultDetail,
  BookResultAttemptSummary,
  BookResultGroupSummary,
  BookResultQueryInput,
} from './types.ts';
import type {
  BookHomeworkActivityBinding,
  BookHomeworkManifest,
} from '../../../../src/types/homework.types.ts';
import type { BookHomeworkAuthorityRecord } from '../../../../src/services/book-homework/bookHomeworkAuthority.types.ts';
import type { BookDeliveryBinding, BookDeliveryPlacement } from '../../../../src/services/book-delivery/bookDelivery.types.ts';
import { assertValidBookHomeworkAuthorityRecord } from '../book-homework/authority.ts';
import { resolveCurrentCourseBook } from '../course-book-placement/production.ts';
import { resolveCurrentClassBookDelivery } from '../class-book-placement/production.ts';
import type { BookResultContextKind } from './types.ts';
import { BookResultVisibilityError } from './authorization.ts';
import { FirebaseRestBookRuntimeRepository, type BookRuntimeRepository, type BookRuntimeRepositoryEnv } from '../book-runtime/repository.ts';
import { FirebaseRestBookActivityEvaluationRepository } from '../book-activity-grading/repository.ts';
import type {
  BookActivityEvaluationRepository,
  BookActivityEvaluationTarget,
} from '../../../../src/services/book-activity/activityEvaluation.types.ts';

type ProductionEnv = BookRouterEnv
  & BookDeliveryRepositoryEnv
  & BookHomeworkRepositoryEnv
  & BookHomeworkSagaRepositoryEnv
  & BookRuntimeRepositoryEnv;

type DeliveryReader = Pick<FirebaseRestBookDeliveryRepository, 'resolveCurrent' | 'readBinding'>;
type HomeworkSagaReader = Pick<FirebaseRestBookHomeworkSagaRepository, 'read'>;
type HomeworkAuthorityReader = Pick<FirebaseRestBookHomeworkDocumentStore, 'read'>;
type ResultReader = Pick<
  BookResultReadRepository,
  'listGroupSummaries' | 'listAttemptSummaries' | 'readResultDetail'
>;
type EvaluationReader = Pick<BookActivityEvaluationRepository, 'listHistory'>;

export interface BookResultReadProductionDependencies {
  readonly createPublicationRepository?: (env: ProductionEnv, ownerId: string) => Pick<FirebaseRestBookAssemblyPublicationRepository, 'readScope'>;
  readonly createDeliveryRepository?: (env: ProductionEnv) => DeliveryReader;
  readonly createHomeworkSagaRepository?: (env: ProductionEnv) => HomeworkSagaReader;
  readonly createHomeworkAuthorityReader?: (env: ProductionEnv) => HomeworkAuthorityReader;
  readonly createResultRepository?: (env: ProductionEnv) => ResultReader;
  readonly createHomeworkAuthorityRepository?: (
    env: ProductionEnv,
  ) => Pick<BookHomeworkAuthorityRepository, 'releaseManualFeedback'>;
  readonly createRuntimeRepository?: (env: ProductionEnv) => Pick<BookRuntimeRepository, 'listTerminalTuples'>;
  readonly createEvaluationRepository?: (env: ProductionEnv) => EvaluationReader;
  readonly readUser?: (env: ProductionEnv, uid: string) => Promise<unknown>;
  readonly now?: () => string;
  readonly resolveCourseDelivery?: typeof resolveCurrentCourseBook;
  readonly resolveClassDelivery?: typeof resolveCurrentClassBookDelivery;
}

interface ResolvedHomeworkContext {
  readonly binding: BookDeliveryBinding;
  readonly authority: BookHomeworkAuthorityRecord;
  readonly studentIds: readonly string[];
  readonly readBinding: DeliveryReader['readBinding'];
}

interface ResolvedCourseClassContext {
  readonly binding: BookDeliveryBinding;
  readonly readBinding: DeliveryReader['readBinding'];
  readonly authority?: undefined;
}
type ResolvedResultContext = ResolvedHomeworkContext | ResolvedCourseClassContext;
const validateHomeworkAuthority: (value: unknown) => asserts value is BookHomeworkAuthorityRecord = assertValidBookHomeworkAuthorityRecord;

const resolveCourseClassContext = async (
  env: ProductionEnv, bookId: string, studentId: string, contextId: string,
  kind: 'public' | 'course' | 'class', dependencies: BookResultReadProductionDependencies,
): Promise<ResolvedCourseClassContext | null> => {
  const delivery = (dependencies.createDeliveryRepository
    ?? ((value: ProductionEnv) => new FirebaseRestBookDeliveryRepository({ env: value })))(env);
  const current = await delivery.resolveCurrent(studentId, contextId);
  if (!current || current.record.status !== 'active') return null;
  const binding = current.record.binding;
  if (binding.status !== 'active' || binding.schemaVersion !== 3
    || binding.recipient.recipientKind !== 'student' || binding.recipient.recipientId !== studentId
    || binding.context.kind !== kind || binding.context.contextId !== contextId
    || binding.context.recipientId !== studentId || binding.issuer.ownerId !== binding.context.ownerId
    || binding.book.bookId !== bookId || current.pointer.bindingId !== binding.bindingId
    || current.pointer.bindingRevision !== binding.revision || current.pointer.contextId !== contextId
    || current.pointer.recipientId !== studentId) return null;
  if (kind === 'public') return await authorizePublicBookBinding(env, binding) ? { binding, readBinding: delivery.readBinding.bind(delivery) } : null;
  let projection;
  try {
    projection = kind === 'course'
    ? await (dependencies.resolveCourseDelivery ?? resolveCurrentCourseBook)(env, studentId, contextId)
    : binding.context.kind === 'class'
      ? await (dependencies.resolveClassDelivery ?? resolveCurrentClassBookDelivery)(env, {
        classId: binding.context.classLocator.classId, copyId: binding.context.classLocator.copyId,
        classPlacementId: binding.context.classLocator.classPlacementId,
        classCourseMaterialId: binding.context.classLocator.courseMaterialId,
        studentId, bindingId: binding.bindingId,
      }) : null;
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (['course_book_resolution_denied', 'class_book_enrollment_denied', 'class_book_locked',
      'class_book_delivery_context_denied', 'class_book_placement_stale', 'class_book_copy_invalid'].includes(code)) return null;
    throw new BookResultVisibilityError('book_result_context_authority_unavailable', 503);
  }
  if (!projection || projection.bindingId !== binding.bindingId || projection.bindingRevision !== binding.revision
    || projection.recipientId !== studentId || projection.context.kind !== kind || projection.context.contextId !== contextId
    || projection.book.bookId !== bookId || projection.book.publicationId !== binding.book.publicationId
    || projection.book.publicationRevision !== binding.book.publicationRevision
    || projection.book.manifestVersionId !== binding.book.manifestVersionId) return null;
  return { binding, readBinding: delivery.readBinding.bind(delivery) };
};

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const same = (left: unknown, right: unknown): boolean => stable(left) === stable(right);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/u;

const jsonBody = async (request: Request): Promise<Record<string, unknown> | null> => {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 16 * 1024) return null;
  try {
    const value = JSON.parse(text) as unknown;
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
};

const errorBody = (code: string, status: number) => ({ body: { code }, init: { status } });

const sourceScopes = (
  placement: BookDeliveryPlacement,
  document?: ComponentStudentDocument,
): readonly { sourceKey: string; pages: readonly number[] }[] => placement.sourcePageScopes
  .map((scope) => {
    if (!document) return { sourceKey: scope.sourceKey, pages: [...scope.pages] };
    const component = document.components.find((entry) => entry.sourceKey === scope.sourceKey);
    return component && scope.pages.every((page) => page >= 1 && page <= component.localPageCount) ? {
      sourceKey: document.logicalSourceKey,
      pages: scope.pages.map((page) => component.combinedStartPage + page - 1),
    } : { sourceKey: scope.sourceKey, pages: [] };
  })
  .sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));

const placementSourceProvenance = (
  placement: BookDeliveryPlacement,
  binding: BookDeliveryBinding,
) => placement.sourcePageScopes.map((scope) => {
  const source = binding.sourceSet.sources.find((candidate) => candidate.sourceKey === scope.sourceKey);
  return source ? {
    sourceKey: scope.sourceKey,
    sourceVersionId: source.sourceVersionId,
    pages: [...scope.pages],
  } : null;
});

const manifestSourceScopes = (
  binding: Extract<BookHomeworkActivityBinding, { state: 'required' }>,
): readonly { sourceKey: string; pages: readonly number[] }[] => binding.sourceContext
  .map((source) => ({ sourceKey: source.sourceKey, pages: [...source.physicalPageNumbers] }))
  .sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));

const manifestBindingMatchesPlacement = (
  manifestBinding: Extract<BookHomeworkActivityBinding, { state: 'required' }> | undefined,
  placement: BookDeliveryPlacement,
  document?: ComponentStudentDocument,
): boolean => Boolean(manifestBinding
  && manifestBinding.placementId === placement.placementId
  && manifestBinding.activityId === placement.activityId
  && manifestBinding.activityVersionId === placement.activityVersionId
  && manifestBinding.activityVersion === placement.activityVersion
  && manifestBinding.nodeKey === placement.nodeKey
  && manifestBinding.contextMode === placement.contextMode
  && same(manifestBinding.pageGroupKeys, placement.pageGroupKeys)
  && same(manifestSourceScopes(manifestBinding), sourceScopes(placement, document)));

const homeworkManifestMatchesBinding = (
  manifest: BookHomeworkManifest,
  binding: BookDeliveryBinding,
  document?: ComponentStudentDocument,
): boolean => {
  if (manifest.book.bookId !== binding.book.bookId
    || manifest.book.bookRevision !== binding.book.bookRevision
    || manifest.book.manifestVersionId !== binding.book.manifestVersionId
    || manifest.book.publicationId !== binding.book.publicationId
    || manifest.book.publicationRevision !== binding.book.publicationRevision
    || manifest.book.publicationStatus !== 'published'
    || manifest.context.contextId !== binding.context.contextId
    || manifest.context.recipientId !== binding.recipient.recipientId
    || manifest.context.kind !== 'homework') return false;

  const required = manifest.bindings.filter((entry): entry is Extract<BookHomeworkActivityBinding, { state: 'required' }> => (
    entry.state === 'required'
  ));
  return required.length === binding.placements.length
    && binding.placements.every((placement) => manifestBindingMatchesPlacement(
      required.find((entry) => entry.placementId === placement.placementId),
      placement,
      document,
    ));
};

const authorityMatchesBinding = (
  authority: BookHomeworkAuthorityRecord,
  binding: BookDeliveryBinding,
  document?: ComponentStudentDocument,
): boolean => Boolean(authority.activityPolicies
  && homeworkManifestMatchesBinding(authority.bookManifest, binding, document)
  && binding.placements.every((placement) => {
    const policy = authority.activityPolicies?.[placement.placementId];
    return Boolean(policy
      && policy.placementId === placement.placementId
      && policy.activityId === placement.activityId
      && policy.activityVersionId === placement.activityVersionId
      && policy.activityVersion === placement.activityVersion);
  }));

const resolveHomeworkContext = async (
  env: ProductionEnv,
  bookId: string,
  studentId: string,
  homeworkId: string,
  dependencies: BookResultReadProductionDependencies,
): Promise<ResolvedHomeworkContext | null> => {
  const delivery = (dependencies.createDeliveryRepository
    ?? ((value: ProductionEnv) => new FirebaseRestBookDeliveryRepository({ env: value })))(env);
  const resolved = await delivery.resolveCurrent(studentId, homeworkId);
  if (!resolved
    || resolved.record.status !== 'active'
    || resolved.pointer.bindingId !== resolved.record.binding.bindingId
    || resolved.pointer.bindingRevision !== resolved.record.binding.revision
    || resolved.pointer.recipientId !== studentId
    || resolved.pointer.contextId !== homeworkId) return null;

  const binding = resolved.record.binding;
  if (binding.status !== 'active'
    || binding.recipient.recipientId !== studentId
    || binding.recipient.recipientKind !== 'student'
    || binding.context.kind !== 'homework'
    || binding.context.contextId !== homeworkId
    || binding.context.recipientId !== studentId
    || binding.book.bookId !== bookId
    || binding.issuer.ownerId !== binding.context.ownerId) return null;

  const ownerId = binding.issuer.ownerId;
  const saga = await (dependencies.createHomeworkSagaRepository
    ?? ((value: ProductionEnv) => new FirebaseRestBookHomeworkSagaRepository({ env: value })))(env)
    .read(homeworkId, ownerId);
  if (!saga
    || saga.assignmentId !== homeworkId
    || saga.contextId !== homeworkId
    || saga.ownerId !== ownerId
    || saga.state !== 'committed'
    || saga.visibility !== 'committed'
    || saga.manifestVersionId !== binding.book.manifestVersionId
    || saga.publicationId !== binding.book.publicationId
    || saga.publicationRevision !== binding.book.publicationRevision) return null;

  const recipient = saga.recipients.find((entry) => entry.recipientId === studentId);
  if (!recipient || recipient.state !== 'committed'
    || recipient.bindingId !== binding.bindingId
    || (recipient.bindingRevision !== undefined && recipient.bindingRevision !== binding.revision)
    || recipient.authorityId !== bookHomeworkRecipientAuthorityId(homeworkId, studentId)) return null;

  const authorityReader = (dependencies.createHomeworkAuthorityReader
    ?? ((value: ProductionEnv) => new FirebaseRestBookHomeworkDocumentStore({ env: value })))(env);
  const stored = await readBookHomeworkRecipientAuthority(
    authorityReader,
    {
      authorityId: recipient.authorityId,
      assignmentId: homeworkId,
      ownerId,
    },
    studentId,
  );
  if (!stored) return null;
  try {
    validateHomeworkAuthority(stored.value);
  } catch {
    return null;
  }
  const authority = stored.value;
  let document: ComponentStudentDocument | undefined;
  if (binding.sourceSet.strategy === 'component_pdfs') {
    const pin = authority.bookManifest.studentDocument;
    if (!pin) return null;
    const scope = await (dependencies.createPublicationRepository
      ?? ((value: ProductionEnv, owner: string) => new FirebaseRestBookAssemblyPublicationRepository({ env: value, ownerId: owner })))(env, ownerId)
      .readScope(bookId);
    const pinnedDocument = scope.studentDocuments?.[pin.sourceVersionId];
    if (!pinnedDocument) return null;
    try { document = resolveCombinedDocument({
      ...scope, studentDocuments: { [pin.sourceVersionId]: pinnedDocument },
    }, binding.book.manifestVersionId); } catch { return null; }
    if (pin.sourceVersionId !== document.sourceVersionId
      || pin.descriptorRevision !== document.descriptorRevision || pin.sha256Hex !== document.sha256Hex
      || !binding.sourceSet.sources.every((source) => document!.components.some((component) =>
        component.sourceKey === source.sourceKey && component.sourceVersionId === source.sourceVersionId))) return null;
  }
  if (!authorityMatchesBinding(authority, binding, document)
    || authority.bookManifest.bindingRevision !== binding.revision) return null;

  return {
    binding,
    authority,
    studentIds: saga.recipients
      .filter((entry) => entry.state === 'committed')
      .map((entry) => entry.recipientId),
    readBinding: (bindingId) => delivery.readBinding(bindingId),
  };
};

const indexedAttemptMatchesBinding = (
  attempt: BookResultAttemptSummary,
  binding: BookDeliveryBinding,
  bookId: string,
  studentId: string,
  homeworkId: string,
  ownerId: string,
): boolean => {
  const placement = binding.placements.find((entry) => entry.placementId === attempt.placementId);
  return Boolean(placement
    && binding.schemaVersion === 3
    && binding.bindingId === attempt.bindingId
    && binding.revision === attempt.bindingRevision
    && binding.recipient.recipientId === studentId
    && binding.recipient.recipientKind === 'student'
    && binding.issuer.ownerId === ownerId
    && binding.book.bookId === bookId
    && ['homework', 'public', 'course', 'class'].includes(binding.context.kind)
    && binding.context.contextId === homeworkId
    && binding.context.recipientId === studentId
    && binding.context.ownerId === ownerId
    && attempt.ownerId === ownerId
    && attempt.bookId === bookId
    && attempt.studentId === studentId
    && attempt.recipientId === studentId
    && attempt.surface === binding.context.kind
    && (binding.context.kind === 'homework' ? attempt.homeworkId === homeworkId : !attempt.homeworkId)
    && attempt.contextId === homeworkId
    && attempt.deliveryContextId === homeworkId
    && attempt.deliveryId === binding.bindingId
    && attempt.activityId === placement.activityId
    && attempt.activityVersionId === placement.activityVersionId
    && attempt.activityVersion === placement.activityVersion
    && same(attempt.pageGroupKeys, placement.pageGroupKeys)
    && same(attempt.sourceProvenance, placementSourceProvenance(placement, binding))
    && attempt.completion.completionId === attempt.completionId
    && attempt.completion.attemptId === attempt.attemptId
    && attempt.completion.resultId === attempt.resultId
    && attempt.completion.contextId === attempt.contextId
    && attempt.completion.placementId === attempt.placementId
    && attempt.completion.activityVersionId === attempt.activityVersionId
    && attempt.completion.activityVersion === attempt.activityVersion);
};

const indexedGroupContextMatchesBinding = (
  row: BookResultGroupSummary['contexts'][number],
  binding: BookDeliveryBinding,
  bookId: string,
  studentId: string,
  homeworkId: string,
  ownerId: string,
): boolean => binding.schemaVersion === 3
  && binding.bindingId === row.deliveryId
  && binding.recipient.recipientId === studentId
  && binding.recipient.recipientKind === 'student'
  && binding.issuer.ownerId === ownerId
  && binding.book.bookId === bookId
  && ['homework', 'public', 'course', 'class'].includes(binding.context.kind)
  && binding.context.contextId === homeworkId
  && binding.context.recipientId === studentId
  && binding.context.ownerId === ownerId;

const assertIndexedAttempt = async (
  attempt: BookResultAttemptSummary,
  context: ResolvedResultContext,
  bookId: string,
  studentId: string,
  homeworkId: string,
): Promise<void> => {
  if (indexedAttemptMatchesBinding(
    attempt, context.binding, bookId, studentId, homeworkId, context.binding.issuer.ownerId,
  )) return;
  const historical = await context.readBinding(attempt.bindingId);
  if (!historical
    || historical.status !== 'revoked'
    || historical.binding.bindingId === context.binding.bindingId
    || !indexedAttemptMatchesBinding(
      attempt, historical.binding, bookId, studentId, homeworkId, context.binding.issuer.ownerId,
    )) {
    throw new Error('book_result_index_identity_invalid');
  }
};

const assertIndexedGroup = async (
  group: BookResultGroupSummary,
  context: ResolvedResultContext,
  bookId: string,
  studentId: string,
  homeworkId: string,
): Promise<void> => {
  if (group.schemaVersion !== 1
    || group.bookId !== bookId
    || group.studentId !== studentId
    || group.recipientId !== studentId
    || (context.binding.context.kind === 'homework' ? group.homeworkId !== homeworkId : Boolean(group.homeworkId))
    || group.contexts.some((row) => (
      row.contextId !== homeworkId
      || row.surface !== context.binding.context.kind
      || !Number.isSafeInteger(row.attemptCount)
      || row.attemptCount <= 0
    ))) {
    throw new Error('book_result_group_identity_invalid');
  }
  await Promise.all(group.contexts.map(async (row) => {
    if (row.deliveryId === context.binding.bindingId) {
      if (!indexedGroupContextMatchesBinding(
        row, context.binding, bookId, studentId, homeworkId, context.binding.issuer.ownerId,
      )) throw new Error('book_result_group_identity_invalid');
      return;
    }
    const historical = await context.readBinding(row.deliveryId);
    if (!historical
      || historical.status !== 'revoked'
      || !indexedGroupContextMatchesBinding(
        row, historical.binding, bookId, studentId, homeworkId, context.binding.issuer.ownerId,
      )) throw new Error('book_result_group_identity_invalid');
  }));
};

class CurrentOwnedContextResultReadRepository implements ResultReader {
  constructor(
    private readonly source: ResultReader,
    private readonly bookId: string,
    private readonly studentId: string,
    private readonly homeworkId: string,
    private readonly resolveContext: () => Promise<ResolvedResultContext | null>,
    private readonly evaluations: EvaluationReader,
  ) {}

  private async withLatestEvaluation<T extends BookResultAttemptSummary>(attempt: T): Promise<T> {
    if (attempt.surface === 'public') return attempt;
    const target: BookActivityEvaluationTarget = {
      attemptId: attempt.attemptId,
      resultId: attempt.resultId,
      recipientId: attempt.recipientId,
      bindingId: attempt.bindingId,
      bindingRevision: attempt.bindingRevision,
      contextKind: attempt.surface === 'homework' || attempt.surface === 'course' || attempt.surface === 'class' ? attempt.surface : 'solo',
      contextId: attempt.contextId,
      placementId: attempt.placementId,
      activityId: attempt.activityId,
      activityVersion: attempt.activityVersion,
      interactionId: attempt.interactionId,
      activityVersionId: attempt.activityVersionId,
      attemptNumber: attempt.attemptNumber,
      pageGroupKeys: [...attempt.pageGroupKeys],
      sourceProvenance: structuredClone(attempt.sourceProvenance),
    };
    const latest = (await this.evaluations.listHistory({ target, limit: 1 }))[0];
    if (!latest) return attempt;
    const scored = latest.facts.status === 'scored';
    const correctionNote = latest.facts.correctionFacts
      .map((fact) => fact.note?.trim()).filter((note): note is string => Boolean(note)).join(' ');
    return {
      ...attempt,
      evaluationStatus: scored ? 'graded' : 'pending_review',
      evaluation: {
        status: scored ? 'graded' : 'pending_review',
        evaluatedAt: latest.evaluatedAt,
        revision: latest.revision,
        ...(scored ? {
          score: {
            earnedScore: latest.facts.earnedScore!,
            maximumScore: latest.facts.maximumScore!,
            displayScore: latest.facts.displayScore!,
          },
          earnedScore: latest.facts.earnedScore,
          maximumScore: latest.facts.maximumScore,
          displayScore: latest.facts.displayScore,
          ...(correctionNote ? { correctionNote } : {}),
        } : {}),
      },
      feedback: {
        ...attempt.feedback,
        available: scored && attempt.feedback.release === 'released'
          && (latest.facts.feedback !== undefined || correctionNote.length > 0),
        ...(scored && latest.facts.feedback !== undefined ? { text: latest.facts.feedback } : {}),
        ...(scored && correctionNote ? { correctionNote } : {}),
      },
    };
  }

  private async context(): Promise<ResolvedResultContext> {
    const value = await this.resolveContext();
    if (!value) throw new Error('book_result_context_unavailable');
    return value;
  }

  private assertInput(input: BookResultQueryInput): void {
    if (input.bookId !== this.bookId || input.studentId !== this.studentId || (input.homeworkId ?? input.contextId) !== this.homeworkId) {
      throw new Error('book_result_context_unavailable');
    }
  }

  async listGroupSummaries(input: BookResultQueryInput): Promise<readonly BookResultGroupSummary[]> {
    this.assertInput(input);
    const context = await this.context();
    const groups = await this.source.listGroupSummaries(input);
    await Promise.all(groups.map((group) => assertIndexedGroup(
      group, context, this.bookId, this.studentId, this.homeworkId,
    )));
    return groups;
  }

  async listAttemptSummaries(input: BookResultQueryInput): Promise<readonly BookResultAttemptSummary[]> {
    this.assertInput(input);
    const context = await this.context();
    const attempts = await this.source.listAttemptSummaries(input);
    await Promise.all(attempts.map((attempt) => assertIndexedAttempt(
      attempt, context, this.bookId, this.studentId, this.homeworkId,
    )));
    return Promise.all(attempts.map((attempt) => this.withLatestEvaluation(attempt)));
  }

  async readResultDetail(input: BookResultQueryInput & { readonly resultId: string }): Promise<BookResultDetail | null> {
    this.assertInput(input);
    const context = await this.context();
    const detail = await this.source.readResultDetail(input);
    if (detail) await assertIndexedAttempt(detail, context, this.bookId, this.studentId, this.homeworkId);
    return detail ? this.withLatestEvaluation(detail) : null;
  }
}

type ResultHandlerInput = {
  readonly request: Request;
  readonly env: BookResultReadWorkerEnv;
  readonly uid: string;
  readonly bookId: string;
  readonly studentId: string;
  readonly homeworkId?: string;
  readonly contextKind?: BookResultContextKind;
  readonly contextId?: string;
  readonly groupKey?: string;
  readonly resultId?: string;
  readonly limit?: number | string;
};

export const createBookResultReadProductionHandlers = (
  dependencies: BookResultReadProductionDependencies = {},
) => {
  const invoke = (name: 'resultSummary' | 'groupedAttempt' | 'resultDetail') => async (input: ResultHandlerInput) => {
    const contextKind = input.contextKind === 'public' || input.contextKind === 'course' || input.contextKind === 'class' ? input.contextKind : undefined;
    const contextId = contextKind ? input.contextId : input.homeworkId;
    if (!contextId || (contextKind && input.homeworkId)) {
      return { body: { code: 'book_result_context_unavailable' }, init: { status: 503 } };
    }
    const env = input.env as ProductionEnv;
    let contextPromise: Promise<ResolvedResultContext | null> | undefined;
    let contextSnapshot: ResolvedResultContext | null = null;
    const resolveContext = () => contextPromise ??= (contextKind
      ? resolveCourseClassContext(env, input.bookId, input.studentId, contextId, contextKind, dependencies)
      : resolveHomeworkContext(env, input.bookId, input.studentId, contextId, dependencies)
    ).then((value) => { contextSnapshot = value; return value; });
    const source = (dependencies.createResultRepository
      ?? ((value: ProductionEnv) => new FirebaseBookResultReadRepository({ env: value })))(env);
    const evaluations = (dependencies.createEvaluationRepository
      ?? ((value: ProductionEnv) => new FirebaseRestBookActivityEvaluationRepository({ env: value })))(env);
    const readUser = dependencies.readUser
      ?? (async (value: ProductionEnv, uid: string) => {
        try {
          return await createBookHomeworkOwnerReader(value as never, uid)(`users/${uid}`);
        } catch {
          return null;
        }
      });
    const worker = createBookResultReadWorkerHandlers({
      repository: new CurrentOwnedContextResultReadRepository(
        source,
        input.bookId,
        input.studentId,
        contextId,
        resolveContext,
        evaluations,
      ),
      resolveViewerRole: async ({ uid, env: roleEnv }) => {
        const profile = await readUser(roleEnv as ProductionEnv, uid);
        if (!profile || typeof profile !== 'object' || Array.isArray(profile)
          || ['blocked', 'inactive', 'suspended'].includes(String((profile as Record<string, unknown>).status ?? ''))) return null;
        const role = (profile as Record<string, unknown>).role;
        return role === 'student' ? 'student' : role === 'teacher' || role === 'super_admin' ? 'teacher' : null;
      },
      resolveManualFeedbackRelease: ({ summary }) => {
        const release = contextSnapshot?.authority?.manualFeedbackReleases?.[summary.resultId] ?? null;
        return release
          && release.resultId === summary.resultId
          && release.attemptId === summary.attemptId
          && release.recipientId === summary.recipientId
          && release.contextId === summary.contextId
          && release.bindingId === summary.bindingId
          && release.bindingRevision === summary.bindingRevision
          && release.placementId === summary.placementId
          && release.activityId === summary.activityId
          && release.activityVersionId === summary.activityVersionId
          && release.activityVersion === summary.activityVersion
          && release.releasedBy === contextSnapshot?.binding.issuer.ownerId
          ? release : null;
      },
      now: dependencies.now,
      resolveContextAuthority: async (scope) => {
        if (!contextKind || scope.contextKind !== contextKind || scope.contextId !== contextId) return null;
        const context = await resolveContext();
        return context ? { contextKind, contextId, bookId: input.bookId,
          studentId: input.studentId, ownerId: context.binding.issuer.ownerId } : null;
      },
      resolveHomeworkAuthorities: async ({ homeworkIds, studentId }) => {
        const context = await resolveContext();
        return Object.fromEntries(homeworkIds.map((homeworkId) => [
          homeworkId,
          context && homeworkId === input.homeworkId
            ? {
              homeworkId,
              bookId: input.bookId,
              ownerId: context.binding.issuer.ownerId,
              studentIds: [studentId],
              status: 'current' as const,
            }
            : null,
        ]));
      },
    });
    const handler = worker[name] as unknown as (value: ResultHandlerInput) => Promise<unknown>;
    return handler(input);
  };

  const releaseFeedback = async (input: ResultHandlerInput) => {
    try {
      if (!input.homeworkId || !input.resultId || input.request.method !== 'POST') {
        return errorBody('book_result_feedback_release_target_invalid', 400);
      }
      if (!input.request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
        return errorBody('content_type_required', 400);
      }
      const requestBody = await jsonBody(input.request);
      if (!requestBody || Object.keys(requestBody).length !== 0) {
        return errorBody('book_result_feedback_release_body_invalid', 400);
      }
      if (!ID.test(input.bookId) || !ID.test(input.studentId)
        || !ID.test(input.homeworkId) || !ID.test(input.resultId)) {
        return errorBody('book_result_feedback_release_target_invalid', 400);
      }
      const env = input.env as ProductionEnv;
      const context = await resolveHomeworkContext(
        env, input.bookId, input.studentId, input.homeworkId, dependencies,
      );
      if (!context) return errorBody('book_result_context_unavailable', 503);
      const readUser = dependencies.readUser
        ?? (async (value: ProductionEnv, uid: string) => {
          try {
            return await createBookHomeworkOwnerReader(value as never, uid)(`users/${uid}`);
          } catch {
            return null;
          }
        });
      const profile = await readUser(env, input.uid);
      if (!profile || typeof profile !== 'object' || Array.isArray(profile)
        || ['blocked', 'inactive', 'suspended'].includes(String((profile as Record<string, unknown>).status ?? ''))
        || (profile as Record<string, unknown>).role !== 'teacher'
        || input.uid !== context.binding.issuer.ownerId) {
        return errorBody('book_result_feedback_release_owner_required', 403);
      }
      const source = (dependencies.createResultRepository
        ?? ((value: ProductionEnv) => new FirebaseBookResultReadRepository({ env: value })))(env);
      const detail = await source.readResultDetail({
        bookId: input.bookId,
        studentId: input.studentId,
        homeworkId: input.homeworkId,
        resultId: input.resultId,
      });
      if (!detail) return errorBody('book_result_not_found', 404);
      await assertIndexedAttempt(detail, context, input.bookId, input.studentId, input.homeworkId);
      const terminal = detail as BookResultDetail & Record<string, unknown>;
      if (terminal.resultId !== input.resultId
        || terminal.resultId !== `${terminal.attemptId}:result`
        || terminal.studentId !== input.studentId
        || terminal.recipientId !== input.studentId
        || terminal.contextId !== input.homeworkId
        || terminal.homeworkId !== input.homeworkId
        || terminal.surface !== 'homework'
        || terminal.ownerId !== context.binding.issuer.ownerId
        || terminal.feedbackPolicy !== 'manual') {
        return errorBody('book_result_feedback_release_target_invalid', 409);
      }
      const runtime = (dependencies.createRuntimeRepository
        ?? ((value: ProductionEnv) => new FirebaseRestBookRuntimeRepository({ env: value })))(env);
      if (!runtime.listTerminalTuples) {
        return errorBody('book_result_feedback_release_target_invalid', 409);
      }
      const tuples = await runtime.listTerminalTuples({
        recipientId: input.studentId,
        contextId: input.homeworkId,
        placementId: terminal.placementId,
        activityId: terminal.activityId,
        activityVersion: terminal.activityVersion,
        bindingId: terminal.bindingId,
        bindingRevision: terminal.bindingRevision,
        limit: 50,
      });
      const exact = tuples.find((tuple) => tuple.attempt.attemptId === terminal.attemptId);
      if (!exact || exact.attempt.attemptId !== terminal.attemptId
        || exact.result.resultId !== input.resultId
        || exact.result.attemptId !== terminal.attemptId
        || exact.attempt.recipientId !== input.studentId
        || exact.attempt.contextId !== input.homeworkId
        || exact.attempt.bindingId !== terminal.bindingId
        || exact.attempt.bindingRevision !== terminal.bindingRevision
        || exact.attempt.placementId !== terminal.placementId
        || exact.attempt.activityId !== terminal.activityId
        || exact.attempt.activityVersionId !== terminal.activityVersionId
        || exact.attempt.activityVersion !== terminal.activityVersion
        || exact.attempt.feedbackPolicy !== 'manual'
        || exact.result.feedbackPolicy !== 'manual'
        || exact.completion.feedbackPolicy !== 'manual'
        || exact.index.feedbackPolicy !== 'manual'
        || exact.completion.status !== 'completed'
        || exact.completion.completionId !== terminal.completionId
        || exact.completion.attemptId !== terminal.attemptId
        || exact.completion.resultId !== input.resultId
        || exact.completion.contextId !== input.homeworkId
        || exact.completion.placementId !== terminal.placementId
        || exact.completion.activityVersionId !== terminal.activityVersionId
        || exact.completion.activityVersion !== terminal.activityVersion) {
        return errorBody('book_result_feedback_release_target_invalid', 409);
      }
      const operation = await crypto.subtle.digest(
        'SHA-256', new TextEncoder().encode(`${input.homeworkId}:${terminal.attemptId}:${terminal.resultId}`),
      );
      const token = [...new Uint8Array(operation)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      const updatedAt = (dependencies.now ?? (() => new Date().toISOString()))();
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(updatedAt)
        || !Number.isFinite(Date.parse(updatedAt))) return errorBody('book_result_feedback_release_clock_invalid', 503);
      const repository = dependencies.createHomeworkAuthorityRepository
        ? dependencies.createHomeworkAuthorityRepository(env)
        : createFirebaseRestBookHomeworkRepository({
          env,
          resolveAffectedStudentStates: async () => [],
          resolveCommittedRoot: async () => Boolean(await resolveHomeworkContext(env, input.bookId, input.studentId, input.homeworkId!, dependencies)),
        });
      const result = await repository.releaseManualFeedback({
        scope: {
          authorityId: bookHomeworkRecipientAuthorityId(input.homeworkId, input.studentId),
          assignmentId: input.homeworkId,
          ownerId: context.binding.issuer.ownerId,
        },
        assignmentId: input.homeworkId,
        ownerId: context.binding.issuer.ownerId,
        recipientId: input.studentId,
        attemptId: terminal.attemptId,
        resultId: input.resultId,
        bindingId: terminal.bindingId,
        bindingRevision: terminal.bindingRevision,
        placementId: terminal.placementId,
        activityId: terminal.activityId,
        activityVersionId: terminal.activityVersionId,
        activityVersion: terminal.activityVersion,
        terminalFeedbackPolicy: 'manual',
        commandId: `feedback-release-${token}`,
        idempotencyKey: `feedback-release-${token}`,
        expectedRevision: context.authority.revision,
        updatedAt,
      });
      return {
        body: {
          status: result.status,
          resultId: result.resultId,
          releasedAt: result.releasedAt,
        },
        init: { status: 200 },
      };
    } catch (error) {
      if (error instanceof BookHomeworkAuthorityError) {
        const status = error.code === 'owner-mismatch' ? 403
          : error.code === 'not-found' ? 404
            : error.code === 'revision-conflict' || error.code === 'idempotency-conflict' ? 409
              : error.code === 'invalid-command' || error.code === 'immutable-manifest' ? 400 : 409;
        return errorBody(`book_homework_${error.code.replace(/-/gu, '_')}`, status);
      }
      return errorBody('book_result_feedback_release_failed', 503);
    }
  };

  return {
    resultSummary: invoke('resultSummary'),
    groupedAttempt: invoke('groupedAttempt'),
    resultDetail: invoke('resultDetail'),
    releaseFeedback,
  };
};


