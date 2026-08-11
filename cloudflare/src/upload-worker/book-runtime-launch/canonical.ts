import type { BookDeliveryBinding } from '../../../../src/services/book-delivery/bookDelivery.types.ts';
import type {
  BookAssemblyActivityVersionRecord,
  BookAssemblyImmutableManifestVersion,
  BookAssemblyPlacementRecord,
} from '../../../../src/types/bookAssembly.types.ts';
import type {
  ExactPublishedActivityVersionReader,
} from '../../../../src/services/book-assembly/canonicalPublicationRepository.ts';
import type {
  BookAssemblyPublicationRepository,
  BookAssemblyPublicationScope,
} from '../../../../src/services/book-assembly/publicationRepository.ts';
import type { BookAssemblyPublicationResult } from '../../../../src/services/book-assembly/publicationTransaction.service.ts';
import {
  FirebaseRestExactPublishedActivityVersionReader,
  type CanonicalActivityVersionReaderEnv,
} from '../book-assembly/canonical-activity-version-repository.ts';
import {
  FirebaseRestBookAssemblyPublicationRepository,
  type BookAssemblyPublicationRepositoryEnv,
} from '../book-assembly/publication-repository.ts';
import {
  FirebaseRestBookDeliveryRepository,
  type BookDeliveryRepositoryEnv,
} from '../book-delivery/repository.ts';
import {
  createBookRuntimeLaunchWorkerHandlers,
  type BookRuntimeLaunchContext,
  type BookRuntimeLaunchProjection,
  type BookRuntimeLaunchProjectionReader,
  type BookRuntimeLaunchRequest,
  type BookRuntimeLaunchWorkerEnv,
  type BookRuntimeLaunchWorkerHandlerOptions,
} from './worker.ts';

type PublicationScope = BookAssemblyPublicationScope<BookAssemblyPublicationResult>;

export type BookRuntimeLaunchCanonicalEnv = BookRuntimeLaunchWorkerEnv
  & BookDeliveryRepositoryEnv
  & CanonicalActivityVersionReaderEnv
  & BookAssemblyPublicationRepositoryEnv;

export interface BookRuntimeLaunchProductionDependencies {
  readonly delivery: Pick<FirebaseRestBookDeliveryRepository, 'resolveCurrent'>;
  readonly publications: Pick<BookAssemblyPublicationRepository<BookAssemblyPublicationResult>, 'readScope'>;
  readonly exactReader: ExactPublishedActivityVersionReader;
}

export interface BookRuntimeLaunchCanonicalHandlersOptions
extends BookRuntimeLaunchWorkerHandlerOptions {
  readonly createDependencies?: (
    env: BookRuntimeLaunchCanonicalEnv,
  ) => BookRuntimeLaunchProductionDependencies;
}

interface AuthoritativeLaunchContext {
  readonly uid: string;
  readonly binding: BookDeliveryBinding;
  readonly dependencies: BookRuntimeLaunchProductionDependencies;
  /** One direct, bounded Book-publication read shared by the request batch. */
  readonly publicationScope: () => Promise<PublicationScope>;
}

const activeBindingFor = async (
  dependencies: BookRuntimeLaunchProductionDependencies,
  uid: string,
  request: Pick<BookRuntimeLaunchRequest, 'bindingId' | 'bindingRevision' | 'contextId'>,
): Promise<BookDeliveryBinding | null> => {
  const entitlement = await dependencies.delivery.resolveCurrent(uid, request.contextId);
  if (!entitlement) return null;
  const { binding } = entitlement.record;
  const { pointer } = entitlement;
  if (entitlement.record.status !== 'active'
    || binding.status !== 'active'
    || pointer.status !== 'active'
    || pointer.bindingId !== request.bindingId
    || pointer.bindingRevision !== request.bindingRevision
    || pointer.recipientId !== uid
    || pointer.contextId !== request.contextId
    || binding.bindingId !== request.bindingId
    || binding.revision !== request.bindingRevision
    || binding.recipient.recipientId !== uid
    || binding.context.recipientId !== uid
    || binding.context.contextId !== request.contextId
    || binding.book.publicationStatus !== 'published') return null;
  return binding;
};

const pinsFor = (binding: BookDeliveryBinding): BookRuntimeLaunchContext['activityPins'] | null => {
  const seen = new Set<string>();
  const pins = binding.placements.map((placement) => {
    if (!placement.activityId || !placement.activityVersionId || seen.has(placement.activityId)) return null;
    seen.add(placement.activityId);
    return { activityId: placement.activityId, activityVersionId: placement.activityVersionId };
  });
  return pins.some((pin) => pin === null) || pins.length === 0
    ? null : pins as BookRuntimeLaunchContext['activityPins'];
};

const sole = <T>(values: readonly T[]): T | null => values.length === 1 ? values[0]! : null;

const matchingManifest = (
  scope: PublicationScope,
  binding: BookDeliveryBinding,
): BookAssemblyImmutableManifestVersion | null => sole(Object.values(scope.versions ?? {}).filter((version) => (
  version.lifecycle === 'published'
  && version.bookId === binding.book.bookId
  && version.bookRevision === binding.book.bookRevision
  && version.publicationId === binding.book.publicationId
  && version.publicationRevision === binding.book.publicationRevision
  && version.ownerId === binding.issuer.ownerId
)));

const matchingActivityVersion = (
  scope: PublicationScope,
  binding: BookDeliveryBinding,
  manifest: BookAssemblyImmutableManifestVersion,
  activityId: string,
  activityVersionId: string,
): BookAssemblyActivityVersionRecord | null => sole(Object.values(scope.activityVersions ?? {}).filter((activity) => (
  activity.bookId === binding.book.bookId
  && activity.ownerId === binding.issuer.ownerId
  && activity.manifestVersionId === manifest.manifestVersionId
  && activity.publicationId === binding.book.publicationId
  && activity.publicationRevision === binding.book.publicationRevision
  && activity.activityId === activityId
  && activity.activityVersionId === activityVersionId
  && typeof activity.canonicalPayloadFingerprint === 'string'
)));

const matchingPlacement = (
  scope: PublicationScope,
  binding: BookDeliveryBinding,
  manifest: BookAssemblyImmutableManifestVersion,
  activity: BookAssemblyActivityVersionRecord,
): BookAssemblyPlacementRecord | null => {
  const bound = binding.placements.find((placement) => (
    placement.activityId === activity.activityId
    && placement.activityVersionId === activity.activityVersionId
    && placement.activityVersion === activity.activityVersion
  ));
  if (!bound) return null;
  const stored = scope.placements?.[bound.placementId];
  return stored
    && stored.bookId === binding.book.bookId
    && stored.ownerId === binding.issuer.ownerId
    && stored.manifestVersionId === manifest.manifestVersionId
    && stored.publicationId === binding.book.publicationId
    && stored.publicationRevision === binding.book.publicationRevision
    && stored.activityId === activity.activityId
    && stored.activityVersionId === activity.activityVersionId
    ? stored : null;
};

const authority = (value: unknown): AuthoritativeLaunchContext | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Partial<AuthoritativeLaunchContext>;
  return candidate.binding && candidate.dependencies && typeof candidate.publicationScope === 'function'
    ? candidate as AuthoritativeLaunchContext : null;
};

export const createBookRuntimeLaunchProductionDependencies = (
  env: BookRuntimeLaunchCanonicalEnv,
): BookRuntimeLaunchProductionDependencies => ({
  delivery: new FirebaseRestBookDeliveryRepository({ env }),
  publications: new FirebaseRestBookAssemblyPublicationRepository({ env }),
  exactReader: new FirebaseRestExactPublishedActivityVersionReader({ env }),
});

const productionContextResolver = (
  createDependencies: (env: BookRuntimeLaunchCanonicalEnv) => BookRuntimeLaunchProductionDependencies,
) => async (input: {
  readonly uid: string;
  readonly request: BookRuntimeLaunchRequest;
  readonly env: BookRuntimeLaunchWorkerEnv;
}): Promise<BookRuntimeLaunchContext | null> => {
  const dependencies = createDependencies(input.env as BookRuntimeLaunchCanonicalEnv);
  const binding = await activeBindingFor(dependencies, input.uid, input.request);
  if (!binding) return null;
  const activityPins = pinsFor(binding);
  if (!activityPins) return null;
  let scope: Promise<PublicationScope> | undefined;
  const trusted: AuthoritativeLaunchContext = {
    uid: input.uid,
    binding,
    dependencies,
    publicationScope: () => (scope ??= dependencies.publications.readScope(binding.book.bookId)),
  };
  return {
    bindingId: binding.bindingId,
    bindingRevision: binding.revision,
    contextId: binding.context.contextId,
    bookId: binding.book.bookId,
    recipientId: binding.recipient.recipientId,
    activityPins,
    authority: trusted,
  };
};

const productionProjectionReader: BookRuntimeLaunchProjectionReader = {
  async readExact(input): Promise<BookRuntimeLaunchProjection | null> {
    const trusted = authority(input.authority);
    if (!trusted
      || trusted.uid !== input.uid
      || trusted.binding.bindingId !== input.bindingId
      || trusted.binding.revision !== input.bindingRevision
      || trusted.binding.context.contextId !== input.contextId
      || trusted.binding.recipient.recipientId !== input.recipientId) return null;
    const scope = await trusted.publicationScope();
    const manifest = matchingManifest(scope, trusted.binding);
    if (!manifest) return null;
    const activity = matchingActivityVersion(
      scope, trusted.binding, manifest, input.activityId, input.activityVersionId,
    );
    if (!activity || activity.activityVersion !== trusted.binding.placements.find((placement) => (
      placement.activityId === input.activityId && placement.activityVersionId === input.activityVersionId
    ))?.activityVersion) return null;
    const placement = matchingPlacement(scope, trusted.binding, manifest, activity);
    if (!placement || !activity.canonicalPayloadFingerprint) return null;
    const canonical = await trusted.dependencies.exactReader.readExact({
      bookId: trusted.binding.book.bookId,
      manifestVersionId: manifest.manifestVersionId,
      publicationId: trusted.binding.book.publicationId,
      ownerId: trusted.binding.issuer.ownerId,
      activityId: activity.activityId,
      activityVersionId: activity.activityVersionId,
      activityVersion: activity.activityVersion,
      payloadFingerprint: activity.canonicalPayloadFingerprint,
    });
    if (!canonical
      || canonical.activityId !== activity.activityId
      || canonical.activityVersionId !== activity.activityVersionId
      || canonical.activityVersion !== activity.activityVersion
      || canonical.ownerId !== trusted.binding.issuer.ownerId
      || canonical.payloadFingerprint !== activity.canonicalPayloadFingerprint
      || !canonical.placementIds.includes(placement.placementId)) return null;
    return {
      activityId: canonical.activityId,
      activityVersionId: canonical.activityVersionId,
      projection: canonical.projection,
    };
  },
};

/**
 * Production composition is deliberately fail-closed: Delivery is revalidated
 * before deriving every immutable reader request, and the exact reader is the
 * only path that returns a student-safe Activity projection.
 */
export const createBookRuntimeLaunchCanonicalHandlers = (
  options: BookRuntimeLaunchCanonicalHandlersOptions = {},
) => {
  const createDependencies = options.createDependencies ?? createBookRuntimeLaunchProductionDependencies;
  return createBookRuntimeLaunchWorkerHandlers({
    ...options,
    resolveContext: options.resolveContext
      ?? options.resolveCallerContext
      ?? productionContextResolver(createDependencies),
    projectionReader: options.projectionReader
      ?? (options.readExactProjection ? { readExact: options.readExactProjection } : productionProjectionReader),
  });
};

export const createBookRuntimeLaunchProductionHandlers = createBookRuntimeLaunchCanonicalHandlers;
