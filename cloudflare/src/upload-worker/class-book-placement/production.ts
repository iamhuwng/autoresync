import { BookDeliveryEntitlementLifecycle } from '../../../../src/services/book-delivery/bookDelivery.entitlementLifecycle.ts';
import type { BookDeliveryRepository } from '../../../../src/services/book-delivery/bookDelivery.entitlement.ts';
import { createBookDeliveryBinding } from '../../../../src/services/book-delivery/bookDelivery.entitlementFactory.ts';
import { createBookDeliveryProjectionResolver } from '../../../../src/services/book-delivery/bookDelivery.service.ts';
import type {
  BookDeliveryBinding,
  BookRuntimeDeliveryProjection,
} from '../../../../src/services/book-delivery/bookDelivery.types.ts';
import {
  classBookBindingContextId,
  classBookContextId,
  type ClassBookCopyIdentity,
  type ClassBookLockAuthority,
  type ClassBookPlacement,
} from '../../../../src/services/book-delivery/classBookPlacement.types.ts';
import {
  FirebaseRestBookAssemblyPublicationRepository,
} from '../book-assembly/publication-repository.ts';
import { createTrustedBookDeliveryPublication } from '../book-delivery/worker.ts';
import { FirebaseRestBookDeliveryRepository } from '../book-delivery/repository.ts';
import { FirebaseRtdbRestClient, type RepositoryEnv } from '../listening-authoring/rtdb.ts';
import { FirebaseClassBookPlacementRepository } from './repository.ts';

type WorkerEnv = RepositoryEnv & Record<string, unknown>;

export class ClassBookDeliveryProductionError extends Error {
  constructor(readonly code: string, readonly status = 403) {
    super(code);
    this.name = 'ClassBookDeliveryProductionError';
  }
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const OPERATION = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const record = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

const authorityEnv = (env: WorkerEnv): RepositoryEnv & Record<string, unknown> => {
  const key = env.BOOK_DELIVERY_GOOGLE_SA_KEY;
  if (typeof key !== 'string' || !key.trim()) {
    throw new ClassBookDeliveryProductionError('class_book_delivery_authority_unavailable', 503);
  }
  return { ...env, GOOGLE_SA_KEY: key };
};

const childOperation = async (operationId: string, stage: string): Promise<string> => {
  const bytes = new Uint8Array(await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(`${operationId}:class-book:${stage}`),
  ));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes.slice(0, 16)].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const bindingIdFor = async (operationId: string): Promise<string> => {
  const bytes = new Uint8Array(await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(`class-book-delivery:${operationId}`),
  ));
  return `bd_${[...bytes.slice(0, 20)].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
};

const assertIdentity = (input: {
  readonly classId: string;
  readonly copyId: string;
  readonly classPlacementId: string;
  readonly classCourseMaterialId: string;
  readonly studentId: string;
}): void => {
  for (const value of Object.values(input)) {
    if (!ID.test(value)) throw new ClassBookDeliveryProductionError('class_book_delivery_identity_invalid', 400);
  }
};

const sameAuthority = (current: BookDeliveryBinding, next: BookDeliveryBinding): boolean => same({
  revision: current.revision,
  recipient: current.recipient,
  issuer: current.issuer,
  book: current.book,
  scope: current.scope,
  outline: current.outline,
  context: current.context,
  sourceSet: current.sourceSet,
  placements: current.placements,
  schedulePolicy: current.schedulePolicy,
}, {
  revision: next.revision,
  recipient: next.recipient,
  issuer: next.issuer,
  book: next.book,
  scope: next.scope,
  outline: next.outline,
  context: next.context,
  sourceSet: next.sourceSet,
  placements: next.placements,
  schedulePolicy: next.schedulePolicy,
});

export interface ClassBookDeliveryPorts {
  readonly readValue: (path: string) => Promise<unknown>;
  readonly placements: Pick<FirebaseClassBookPlacementRepository, 'readCopy' | 'readCurrent' | 'readLock'>;
  readonly deliveryRepository: BookDeliveryRepository;
  readonly loadPublication: (placement: ClassBookPlacement) => Promise<ReturnType<typeof createTrustedBookDeliveryPublication>>;
  readonly now: () => string;
}

const assertCopy = (copy: ClassBookCopyIdentity | null, placement: ClassBookPlacement): ClassBookCopyIdentity => {
  if (!copy
    || copy.status !== 'active'
    || copy.classId !== placement.classId
    || copy.copyId !== placement.copyId
    || copy.classCourseId !== placement.classCourseId
    || copy.sourceCourseId !== placement.sourceCourseId
    || copy.sourceCourseMaterialId !== placement.sourceCourseMaterialId
    || copy.ownerId !== placement.ownerId) {
    throw new ClassBookDeliveryProductionError('class_book_copy_unavailable');
  }
  return copy;
};

const assertClassAuthority = (value: unknown, placement: ClassBookPlacement): void => {
  const classRecord = record(value);
  if (!classRecord
    || classRecord.createdBy !== placement.ownerId
    || classRecord.status !== 'active') {
    throw new ClassBookDeliveryProductionError('class_book_class_unavailable');
  }
};

const assertMembership = (value: unknown, studentId: string): void => {
  const membership = record(value);
  if (!membership
    || membership.uid !== studentId
    || (membership.status !== undefined && membership.status !== 'active')) {
    throw new ClassBookDeliveryProductionError('class_book_enrollment_denied');
  }
};

const assertLock = (lock: ClassBookLockAuthority | null, placement: ClassBookPlacement): void => {
  if (lock && (lock.classId !== placement.classId
    || lock.classPlacementId !== placement.classPlacementId
    || (lock.state !== 'locked' && lock.state !== 'unlocked'))) {
    throw new ClassBookDeliveryProductionError('class_book_lock_invalid');
  }
  if (lock?.state === 'locked') throw new ClassBookDeliveryProductionError('class_book_locked');
};

const assertFrozenPlacement = (placement: ClassBookPlacement | null, input: {
  readonly classId: string;
  readonly copyId: string;
  readonly classPlacementId: string;
  readonly classCourseMaterialId: string;
}): ClassBookPlacement => {
  if (!placement
    || placement.status !== 'active'
    || placement.classId !== input.classId
    || placement.copyId !== input.copyId
    || placement.classPlacementId !== input.classPlacementId
    || placement.courseMaterialId !== input.classCourseMaterialId
    || !ID.test(placement.pins.bookId)
    || !ID.test(placement.pins.publicationId)
    || !ID.test(placement.pins.manifestVersionId)
    || !Number.isSafeInteger(placement.pins.publicationRevision)
    || placement.pins.publicationRevision < 1) {
    throw new ClassBookDeliveryProductionError('class_book_placement_unavailable');
  }
  return placement;
};

const assertPublicationMatchesPlacement = (
  placement: ClassBookPlacement,
  publication: ReturnType<typeof createTrustedBookDeliveryPublication>,
): void => {
  if (publication.bookId !== placement.pins.bookId
    || publication.publicationId !== placement.pins.publicationId
    || publication.publicationRevision !== placement.pins.publicationRevision
    || !same(publication.scope, placement.selection)
    || publication.placements.length !== placement.activities.length) {
    throw new ClassBookDeliveryProductionError('class_book_publication_pin_mismatch', 409);
  }
  const canonical = new Map(publication.placements.map((item) => [item.placementId, item]));
  for (const activity of placement.activities) {
    const matched = canonical.get(activity.placementId);
    if (!matched
      || matched.activityId !== activity.activityId
      || matched.activityVersionId !== activity.activityVersionId
      || !publication.sourceSet.sources.some((source) => source.sourceVersionId === activity.sourceVersionId)) {
      throw new ClassBookDeliveryProductionError('class_book_publication_pin_mismatch', 409);
    }
  }
};

const createPorts = (env: WorkerEnv): ClassBookDeliveryPorts => {
  const scopedEnv = authorityEnv(env);
  const read = new FirebaseRtdbRestClient({ env: scopedEnv, fetchImpl: globalThis.fetch });
  const placements = new FirebaseClassBookPlacementRepository({ env: scopedEnv });
  const assemblies = new FirebaseRestBookAssemblyPublicationRepository({ env });
  return {
    readValue: (path) => read.readValue(path),
    placements,
    deliveryRepository: new FirebaseRestBookDeliveryRepository({ env }),
    now: () => new Date().toISOString(),
    async loadPublication(placement) {
      const scope = await assemblies.readScope(placement.pins.bookId);
      if (scope.current?.manifestVersionId !== placement.pins.manifestVersionId) {
        throw new ClassBookDeliveryProductionError('class_book_publication_stale', 409);
      }
      try {
        return createTrustedBookDeliveryPublication({
          bookId: placement.pins.bookId,
          publicationId: placement.pins.publicationId,
          publicationRevision: placement.pins.publicationRevision,
          recipientId: 'class-publication-validation',
          contextKind: 'class',
          contextId: placement.classPlacementId,
          scope: placement.selection,
        }, scope, {
          policyId: `class:${classBookBindingContextId(
            placement.classId, placement.copyId, placement.courseMaterialId, placement.classPlacementId,
          )}`,
          policyRevision: placement.placementRevision,
          basis: 'immutable-reference',
        });
      } catch (error) {
        if (error instanceof ClassBookDeliveryProductionError) throw error;
        throw new ClassBookDeliveryProductionError('class_book_publication_stale', 409);
      }
    },
  };
};

const revalidate = async (ports: ClassBookDeliveryPorts, input: {
  readonly classId: string;
  readonly copyId: string;
  readonly classPlacementId: string;
  readonly classCourseMaterialId: string;
  readonly studentId: string;
}): Promise<{ readonly placement: ClassBookPlacement; readonly publication: ReturnType<typeof createTrustedBookDeliveryPublication> }> => {
  assertIdentity(input);
  const contextId = classBookContextId(input.classId, input.copyId, input.classCourseMaterialId);
  const placement = assertFrozenPlacement(await ports.placements.readCurrent(contextId), input);
  const [copy, classRecord, membership, lock, publication] = await Promise.all([
    ports.placements.readCopy(input.classId, input.copyId),
    ports.readValue(`classes/${input.classId}`),
    ports.readValue(`classes/${input.classId}/students/${input.studentId}`),
    ports.placements.readLock(input.classId, input.classPlacementId),
    ports.loadPublication(placement),
  ]);
  assertCopy(copy, placement);
  assertClassAuthority(classRecord, placement);
  assertMembership(membership, input.studentId);
  assertLock(lock, placement);
  assertPublicationMatchesPlacement(placement, publication);
  return { placement, publication };
};

const deliveryContextId = (input: {
  readonly classId: string;
  readonly copyId: string;
  readonly classPlacementId: string;
  readonly classCourseMaterialId: string;
}): string => classBookBindingContextId(
  input.classId,
  input.copyId,
  input.classCourseMaterialId,
  input.classPlacementId,
);

export const createClassBookDeliveryProductionAdapter = (ports: ClassBookDeliveryPorts) => {
  const resolve = async (input: {
    readonly classId: string;
    readonly copyId: string;
    readonly classPlacementId: string;
    readonly classCourseMaterialId: string;
    readonly studentId: string;
    readonly bindingId: string;
  }): Promise<BookRuntimeDeliveryProjection> => {
    if (!ID.test(input.bindingId)) throw new ClassBookDeliveryProductionError('class_book_delivery_identity_invalid', 400);
    const authority = await revalidate(ports, input);
    const projection = await createBookDeliveryProjectionResolver({
      repository: ports.deliveryRepository,
      allowedAdapterContexts: ['class'],
    }).resolve({
      recipientId: input.studentId,
      contextId: deliveryContextId(input),
      actor: { uid: input.studentId },
    });
    if (projection.bindingId !== input.bindingId
      || projection.book.publicationId !== authority.placement.pins.publicationId
      || projection.book.publicationRevision !== authority.placement.pins.publicationRevision) {
      throw new ClassBookDeliveryProductionError('class_book_delivery_context_denied');
    }
    return projection;
  };

  return {
    async prepare(input: {
      readonly operationId: string;
      readonly classId: string;
      readonly copyId: string;
      readonly classPlacementId: string;
      readonly classCourseMaterialId: string;
      readonly studentId: string;
    }): Promise<BookRuntimeDeliveryProjection> {
      if (!OPERATION.test(input.operationId)) {
        throw new ClassBookDeliveryProductionError('class_book_operation_invalid', 400);
      }
      const authority = await revalidate(ports, input);
      const contextId = deliveryContextId(input);
      const createdAt = ports.now();
      const binding = createBookDeliveryBinding({
        bindingId: await bindingIdFor(input.operationId),
        revision: authority.placement.placementRevision,
        status: 'draft',
        recipient: { recipientId: input.studentId, recipientKind: 'student' },
        issuer: { ownerId: authority.placement.ownerId, authorityBoundary: 'book-owner' },
        context: {
          kind: 'class', contextId, recipientId: input.studentId,
          ownerId: authority.placement.ownerId, entitlementBasis: 'membership',
        },
        publication: authority.publication,
        createdAt,
      });
      const lifecycle = new BookDeliveryEntitlementLifecycle({
        repository: ports.deliveryRepository,
        adapterContexts: ['class'],
        authorizeIssuer: (candidate) => candidate.context.kind === 'class'
          && candidate.context.contextId === contextId
          && candidate.context.ownerId === authority.placement.ownerId
          && candidate.issuer.ownerId === authority.placement.ownerId,
      });
      const current = await ports.deliveryRepository.resolveCurrent(input.studentId, contextId);
      if (!current) {
        const created = await lifecycle.createDraft(binding, await childOperation(input.operationId, 'create'), createdAt);
        const record = created.record ?? await ports.deliveryRepository.readBinding(binding.bindingId);
        if (!record) throw new ClassBookDeliveryProductionError('class_book_delivery_create_failed', 503);
        await lifecycle.activate(binding.bindingId, record.recordRevision,
          await childOperation(input.operationId, 'activate'), ports.now());
      } else if (!sameAuthority(current.record.binding, binding)) {
        await lifecycle.supersede(binding, current.record.binding.bindingId,
          await childOperation(input.operationId, 'supersede'), ports.now());
      }
      await revalidate(ports, input);
      return createBookDeliveryProjectionResolver({
        repository: ports.deliveryRepository,
        allowedAdapterContexts: ['class'],
      }).resolve({ recipientId: input.studentId, contextId, actor: { uid: input.studentId } });
    },
    resolve,
  };
};

export const prepareClassBookDelivery = async (env: WorkerEnv, input: {
  readonly operationId: string;
  readonly classId: string;
  readonly copyId: string;
  readonly classPlacementId: string;
  readonly classCourseMaterialId: string;
  readonly studentId: string;
}): Promise<BookRuntimeDeliveryProjection> => createClassBookDeliveryProductionAdapter(createPorts(env)).prepare(input);

export const resolveCurrentClassBookDelivery = async (env: WorkerEnv, input: {
  readonly classId: string;
  readonly copyId: string;
  readonly classPlacementId: string;
  readonly classCourseMaterialId: string;
  readonly studentId: string;
  readonly bindingId: string;
}): Promise<BookRuntimeDeliveryProjection> => createClassBookDeliveryProductionAdapter(createPorts(env)).resolve(input);
