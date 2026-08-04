import { BookDeliveryEntitlementLifecycle } from '../../../../src/services/book-delivery/bookDelivery.entitlementLifecycle.ts';
import { createBookDeliveryBinding } from '../../../../src/services/book-delivery/bookDelivery.entitlementFactory.ts';
import { createBookDeliveryProjectionResolver } from '../../../../src/services/book-delivery/bookDelivery.service.ts';
import type { BookDeliveryPublishedPublicationReference } from '../../../../src/services/book-delivery/bookDelivery.publication.ts';
import type { CourseBookPlacement } from '../../../../src/services/book-delivery/courseBookPlacement.service.ts';
import type { BookAssemblyPublicationScope } from '../../../../src/services/book-assembly/publicationRepository.ts';
import type { BookAssemblyPublicationResult } from '../../../../src/services/book-assembly/publicationTransaction.service.ts';
import { FirebaseRestBookAssemblyPublicationRepository } from '../book-assembly/publication-repository.ts';
import { FirebaseRestBookDeliveryRepository } from '../book-delivery/repository.ts';
import { createTrustedBookDeliveryPublication } from '../book-delivery/worker.ts';
import { FirebaseRtdbRestClient, type RepositoryEnv } from '../listening-authoring/rtdb.ts';
import { createCourseBookPlacementCommand, type CourseBookCommandPorts, type CourseBookCommandSelection } from './command.ts';
import { FirebaseCourseEnrollmentAuthorityPort } from './enrollment-authority.ts';
import { FirebaseCourseBookPlacementRepository } from './repository.ts';

type PublicationScope = BookAssemblyPublicationScope<BookAssemblyPublicationResult>;
type WorkerEnv = RepositoryEnv & Record<string, unknown>;

const authorityEnv = (env: WorkerEnv): RepositoryEnv & Record<string, unknown> => {
  const key = env.BOOK_DELIVERY_GOOGLE_SA_KEY;
  if (typeof key !== 'string' || !key.trim()) throw new Error('missing_book_delivery_google_sa_key');
  return { ...env, GOOGLE_SA_KEY: key };
};

const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

const sameDeliveryAuthority = (
  current: ReturnType<typeof createBookDeliveryBinding>,
  next: ReturnType<typeof createBookDeliveryBinding>,
): boolean => same({
  revision: current.revision, recipient: current.recipient, issuer: current.issuer,
  book: current.book, scope: current.scope, outline: current.outline, context: current.context,
  sourceSet: current.sourceSet, placements: current.placements, schedulePolicy: current.schedulePolicy,
}, {
  revision: next.revision, recipient: next.recipient, issuer: next.issuer,
  book: next.book, scope: next.scope, outline: next.outline, context: next.context,
  sourceSet: next.sourceSet, placements: next.placements, schedulePolicy: next.schedulePolicy,
});

const bindingIdFor = async (operationId: string): Promise<string> => {
  const digest = new Uint8Array(await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(`course-book-delivery:${operationId}`),
  ));
  return `bd_${[...digest.slice(0, 20)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
};

const trustedPublication = (
  scope: PublicationScope,
  placement: Pick<CourseBookPlacement, 'courseMaterialId' | 'pins' | 'selection'>,
): BookDeliveryPublishedPublicationReference => createTrustedBookDeliveryPublication({
  bookId: placement.pins.bookId,
  publicationId: placement.pins.publicationId,
  publicationRevision: placement.pins.publicationRevision,
  recipientId: 'course-publication-validation',
  contextKind: 'course',
  contextId: placement.courseMaterialId,
  scope: placement.selection,
}, scope, {
  policyId: `course:${placement.courseMaterialId}`, policyRevision: 1, basis: 'immutable-reference',
});

const placementFromScope = (input: {
  scope: PublicationScope; selection: CourseBookCommandSelection; actorUid: string;
  courseId: string; moduleId: string; courseMaterialId: string;
}): CourseBookPlacement => {
  const current = input.scope.current;
  if (!current) throw new Error('course_book_publication_missing');
  const version = input.scope.versions?.[current.manifestVersionId];
  if (!version || version.ownerId !== input.actorUid || version.bookId !== input.selection.bookId) {
    throw new Error('course_book_publication_denied');
  }
  const seed: CourseBookPlacement = {
    courseMaterialId: input.courseMaterialId, courseId: input.courseId, moduleId: input.moduleId,
    ownerId: input.actorUid, displayTitle: input.selection.bookId,
    selection: input.selection.scope, placementRevision: 1,
    completionAggregationPolicy: 'all-activities', status: 'active',
    pins: {
      bookId: input.selection.bookId, publicationId: current.publicationId,
      publicationRevision: current.publicationRevision, manifestVersionId: current.manifestVersionId,
      bindingRevision: 1, selectedActivities: [],
    },
  };
  const publication = trustedPublication(input.scope, seed);
  const selectedActivities = publication.placements.map((selected) => {
    const rawPlacement = input.scope.placements?.[selected.placementId];
    const activity = input.scope.activityVersions?.[selected.activityVersionId];
    const unit = Object.values(input.scope.unitProjections ?? {}).find((candidate) => (
      candidate.unitKey === rawPlacement?.unitKey
      && candidate.manifestVersionId === current.manifestVersionId
      && candidate.publicationId === current.publicationId
      && candidate.publicationRevision === current.publicationRevision
    ));
    if (!rawPlacement || !activity || !unit
      || activity.activityId !== selected.activityId || activity.unitKey !== rawPlacement.unitKey) {
      throw new Error('course_book_publication_pin_missing');
    }
    const sourceVersionByKey = new Map(publication.sourceSet.sources.map((source) => [source.sourceKey, source.sourceVersionId]));
    const sourceVersionIds = [...new Set(rawPlacement.sourcePages.map((page) => sourceVersionByKey.get(page.sourceKey)))]
      .filter((value): value is string => typeof value === 'string');
    if (sourceVersionIds.length === 0) throw new Error('course_book_source_pin_missing');
    return {
      placementId: selected.placementId, nodeKey: selected.nodeKey,
      unitStableKey: rawPlacement.unitKey, unitVersionId: unit.unitProjectionId,
      activityId: selected.activityId, activityVersionId: selected.activityVersionId,
      sourceVersionIds,
    };
  });
  const selectedNodeKeys = new Set(publication.placements.map((item) => item.nodeKey));
  const title = publication.outline.filter((node) => selectedNodeKeys.has(node.nodeKey))
    .map((node) => node.titleSnapshot?.trim()).filter(Boolean).join(' / ');
  return {
    ...seed, displayTitle: title || `Book ${input.selection.bookId}`,
    pins: { ...seed.pins, selectedActivities },
  };
};

const publicationPorts = (repository: FirebaseRestBookAssemblyPublicationRepository) => ({
  async derivePlacement(input: {
    actorUid: string; courseId: string; moduleId: string; courseMaterialId: string;
    selection: CourseBookCommandSelection; courseOwnerId: string;
  }): Promise<CourseBookPlacement> {
    if (input.actorUid !== input.courseOwnerId) throw new Error('course_book_publication_denied');
    return placementFromScope({ ...input, scope: await repository.readScope(input.selection.bookId) });
  },
  async validatePlacement(placement: CourseBookPlacement): Promise<boolean> {
    try {
      const rebuilt = placementFromScope({
        scope: await repository.readScope(placement.pins.bookId), actorUid: placement.ownerId,
        courseId: placement.courseId, moduleId: placement.moduleId,
        courseMaterialId: placement.courseMaterialId,
        selection: { bookId: placement.pins.bookId, scope: placement.selection },
      });
      return same(rebuilt, placement);
    } catch { return false; }
  },
  async load(placement: CourseBookPlacement): Promise<BookDeliveryPublishedPublicationReference> {
    return trustedPublication(await repository.readScope(placement.pins.bookId), placement);
  },
});

export const createProductionCourseBookCommand = (env: WorkerEnv) => {
  const scopedEnv = authorityEnv(env);
  const read = new FirebaseRtdbRestClient({ env: scopedEnv, fetchImpl: globalThis.fetch });
  const placements = new FirebaseCourseBookPlacementRepository({ env: scopedEnv });
  const assemblies = new FirebaseRestBookAssemblyPublicationRepository({ env });
  const publications = publicationPorts(assemblies);
  const enrollments = new FirebaseCourseEnrollmentAuthorityPort({ env: scopedEnv });
  const deliveryRepository = new FirebaseRestBookDeliveryRepository({ env });
  const ports: CourseBookCommandPorts<Record<string, unknown>> = {
    readValue: (path, query) => read.readValue(path, query),
    placements,
    publications,
    enrollments: {
      transition: async (input) => (await enrollments.transitionDirectCourseEnrollment({
        ...input, status: 'active',
      })).status,
    },
    releases: {
      transition: (input) => placements.transitionRelease({ ...input }),
    },
    delivery: {
      ensureAndResolve: async (input) => {
        const publication = await publications.load(input.placement);
        const binding = createBookDeliveryBinding({
          bindingId: await bindingIdFor(input.createOperationId), revision: input.placement.pins.bindingRevision,
          status: 'draft', recipient: { recipientId: input.studentId, recipientKind: 'student' },
          issuer: { ownerId: input.placement.ownerId, authorityBoundary: 'book-owner' },
          context: {
            kind: 'course', contextId: input.placement.courseMaterialId, recipientId: input.studentId,
            ownerId: input.placement.ownerId, entitlementBasis: 'enrollment',
          }, publication, createdAt: new Date().toISOString(),
        });
        const lifecycle = new BookDeliveryEntitlementLifecycle({
          repository: deliveryRepository, adapterContexts: ['course'],
          authorizeIssuer: (candidate) => candidate.issuer.ownerId === input.placement.ownerId
            && candidate.context.kind === 'course'
            && candidate.context.contextId === input.placement.courseMaterialId,
        });
        const current = await deliveryRepository.resolveCurrent(input.studentId, input.placement.courseMaterialId);
        if (!current) {
          const created = await lifecycle.createDraft(binding, input.createOperationId, binding.createdAt);
          const record = created.record ?? await deliveryRepository.readBinding(binding.bindingId);
          if (!record) throw new Error('course_book_delivery_create_failed');
          await lifecycle.activate(binding.bindingId, record.recordRevision, input.activateOperationId, new Date().toISOString());
        } else if (!sameDeliveryAuthority(current.record.binding, binding)) {
          await lifecycle.supersede(binding, current.record.binding.bindingId, input.supersedeOperationId, new Date().toISOString());
        }
        return createBookDeliveryProjectionResolver({
          repository: deliveryRepository, allowedAdapterContexts: ['course'],
        }).resolve({
          recipientId: input.studentId, contextId: input.placement.courseMaterialId,
          actor: { uid: input.studentId },
        }) as unknown as Promise<Record<string, unknown>>;
      },
    },
  };
  return createCourseBookPlacementCommand(ports);
};

export const resolveCurrentCourseBook = async (env: WorkerEnv, uid: string, courseMaterialId: string) => {
  const scopedEnv = authorityEnv(env);
  const read = new FirebaseRtdbRestClient({ env: scopedEnv, fetchImpl: globalThis.fetch });
  const placements = new FirebaseCourseBookPlacementRepository({ env: scopedEnv });
  const placement = await placements.read(courseMaterialId);
  if (!placement || placement.status !== 'active') throw new Error('course_book_resolution_denied');
  const [course, enrollment, release, flags] = await Promise.all([
    read.readValue(`courses/${placement.courseId}`),
    read.readValue(`course_book_authority/enrollments/${placement.courseId}/${uid}`),
    read.readValue(`course_book_authority/releases/${placement.courseId}/${placement.moduleId}/${uid}`),
    read.readValue('system_flags'),
  ]) as [Record<string, unknown> | null, Record<string, unknown> | null, Record<string, unknown> | null, Record<string, unknown> | null];
  if (course?.ownerId !== placement.ownerId || course?.archivedAt || enrollment?.status !== 'active'
    || release?.released !== true || flags?.restore_in_progress === true || flags?.course_book_rollback === true) {
    throw new Error('course_book_resolution_denied');
  }
  const repository = new FirebaseRestBookDeliveryRepository({ env });
  return createBookDeliveryProjectionResolver({
    repository, allowedAdapterContexts: ['course'],
  }).resolve({
    recipientId: uid, contextId: courseMaterialId, actor: { uid },
  });
};
