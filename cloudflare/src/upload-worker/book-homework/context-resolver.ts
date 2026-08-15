import type { ExactPublishedActivityVersionReader } from '../../../../src/services/book-assembly/canonicalPublicationRepository.ts';
import type { CanonicalPublishedActivityVersionRecord } from '../../../../src/services/book-assembly/canonicalActivityVersion.service.ts';
import type {
  BookAssemblyActivityVersionRecord,
  BookAssemblyImmutableManifestVersion,
  BookAssemblyPlacementRecord,
} from '../../../../src/types/bookAssembly.types.ts';
import type { BookAssemblyPublicationRepository } from '../../../../src/services/book-assembly/publicationRepository.ts';
import type { BookDeliveryRepository, BookDeliveryResolvedEntitlement } from '../../../../src/services/book-delivery/bookDelivery.entitlement.ts';
import type { BookHomeworkAuthorityRecord } from '../../../../src/services/book-homework/bookHomeworkAuthority.types.ts';
import type { BookHomeworkSagaRecord } from '../../../../src/services/book-homework/bookHomeworkSaga.types.ts';
import type { BookHomeworkAuthorityRepository } from './repository.ts';
import type { BookHomeworkSagaRepository } from './sagaRepository.ts';

export type BookHomeworkRequestedAction =
  | { readonly kind: 'student-launch'; readonly placementId: string }
  | { readonly kind: 'teacher-read'; readonly recipientId: string; readonly placementId: string };

export interface BookHomeworkContextResolverInput {
  readonly assignmentId: string;
  readonly actorUid: string;
  readonly action: BookHomeworkRequestedAction;
}

export interface BookHomeworkResolvedContext {
  readonly assignmentId: string;
  readonly actorUid: string;
  readonly ownerId: string;
  readonly recipientId: string;
  readonly authorityId: string;
  readonly authorityRevision: number;
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly deliveryRecordRevision: number;
  readonly bookId: string;
  readonly manifestVersionId: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersionId: string;
  readonly activityVersion: number;
  readonly trustedBookProjection: CanonicalPublishedActivityVersionRecord['projection'];
}

export interface BookHomeworkContextResolverPort {
  resolve(input: BookHomeworkContextResolverInput): Promise<BookHomeworkResolvedContext | null>;
}

export interface BookHomeworkContextResolverDependencies {
  readonly roots: Pick<BookHomeworkSagaRepository, 'read'>;
  readonly authorities: Pick<BookHomeworkAuthorityRepository, 'read'>;
  readonly deliveries: Pick<BookDeliveryRepository, 'resolveCurrent'>;
  readonly publications: Pick<BookAssemblyPublicationRepository, 'readScope'>;
  readonly exactActivityVersions: ExactPublishedActivityVersionReader;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const validId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);
const sole = <T>(values: readonly T[]): T | null => values.length === 1 ? values[0]! : null;

const committedRoot = (root: BookHomeworkSagaRecord | null, assignmentId: string, ownerId: string) => (
  root
  && root.assignmentId === assignmentId
  && root.contextId === assignmentId
  && root.ownerId === ownerId
  && root.state === 'committed'
  && root.visibility === 'committed'
  && root.committedRecipientCount === root.recipientCount
  && root.recipients.every((entry) => entry.state === 'committed')
    ? root : null
);

const activeDelivery = (
  value: BookDeliveryResolvedEntitlement | null,
  assignmentId: string,
  ownerId: string,
  recipientId: string,
  bindingId: string,
  bindingRevision: number,
): BookDeliveryResolvedEntitlement | null => {
  const binding = value?.record.binding;
  const pointer = value?.pointer;
  return value
    && value.record.status === 'active'
    && binding?.status === 'active'
    && pointer?.status === 'active'
    && binding.bindingId === bindingId
    && binding.revision === bindingRevision
    && binding.issuer.ownerId === ownerId
    && binding.context.ownerId === ownerId
    && binding.context.contextId === assignmentId
    && binding.context.recipientId === recipientId
    && binding.context.kind === 'homework'
    && binding.recipient.recipientId === recipientId
    && pointer.bindingId === bindingId
    && pointer.bindingRevision === bindingRevision
    && pointer.contextId === assignmentId
    && pointer.recipientId === recipientId
    && pointer.contextKind === 'homework'
      ? value : null;
};

const exactManifest = (
  scope: Awaited<ReturnType<BookAssemblyPublicationRepository['readScope']>>,
  authority: BookHomeworkAuthorityRecord,
): BookAssemblyImmutableManifestVersion | null => {
  const book = authority.bookManifest.book;
  const current = scope.current;
  if (!current
    || current.manifestVersionId !== authority.bookManifest.manifestVersionId
    || current.publicationId !== book.publicationId
    || current.publicationRevision !== book.publicationRevision
    || current.bookRevision !== book.bookRevision) return null;
  return sole(Object.values(scope.versions ?? {}).filter((manifest) => (
    manifest.lifecycle === 'published'
    && manifest.ownerId === authority.ownerId
    && manifest.bookId === book.bookId
    && manifest.bookRevision === book.bookRevision
    && manifest.manifestVersionId === authority.bookManifest.manifestVersionId
    && manifest.publicationId === book.publicationId
    && manifest.publicationRevision === book.publicationRevision
  )));
};

export class BookHomeworkAuthoritativeContextResolver implements BookHomeworkContextResolverPort {
  constructor(private readonly dependencies: BookHomeworkContextResolverDependencies) {}

  async resolve(input: BookHomeworkContextResolverInput): Promise<BookHomeworkResolvedContext | null> {
    if (!validId(input.assignmentId) || !validId(input.actorUid)
      || !validId(input.action.placementId)
      || (input.action.kind === 'teacher-read' && !validId(input.action.recipientId))) return null;

    const recipientId = input.action.kind === 'student-launch'
      ? input.actorUid : input.action.recipientId;
    let ownerId = input.action.kind === 'teacher-read' ? input.actorUid : '';
    let delivery: BookDeliveryResolvedEntitlement | null = null;
    if (input.action.kind === 'student-launch') {
      delivery = await this.dependencies.deliveries.resolveCurrent(recipientId, input.assignmentId);
      ownerId = delivery?.record.binding.issuer.ownerId ?? '';
      if (!validId(ownerId)) return null;
    }

    const root = committedRoot(
      await this.dependencies.roots.read(input.assignmentId, ownerId),
      input.assignmentId,
      ownerId,
    );
    const entry = root?.recipients.find((candidate) => candidate.recipientId === recipientId);
    if (!root || !entry || entry.state !== 'committed'
      || entry.authorityRevision === undefined || entry.bindingRevision === undefined) return null;
    if (!delivery) delivery = await this.dependencies.deliveries.resolveCurrent(recipientId, input.assignmentId);
    delivery = activeDelivery(
      delivery,
      input.assignmentId,
      ownerId,
      recipientId,
      entry.bindingId,
      entry.bindingRevision,
    );
    if (!delivery) return null;

    const authority = await this.dependencies.authorities.read({
      authorityId: entry.authorityId,
      assignmentId: root.assignmentId,
      ownerId: root.ownerId,
    });
    if (!authority
      || authority.assignmentId !== entry.authorityId
      || authority.ownerId !== root.ownerId
      || authority.saga.sagaId !== root.assignmentId
      || authority.saga.state !== 'committed'
      || authority.visibility.status !== 'committed'
      || authority.revision !== entry.authorityRevision
      || authority.visibility.revision !== authority.revision
      || authority.bookManifest.ownerId !== root.ownerId
      || authority.bookManifest.context.contextId !== root.assignmentId
      || authority.bookManifest.context.recipientId !== recipientId
      || authority.bookManifest.manifestVersionId !== root.manifestVersionId
      || authority.bookManifest.bindingRevision !== entry.bindingRevision
      || authority.bookManifest.book.publicationId !== root.publicationId
      || authority.bookManifest.book.publicationRevision !== root.publicationRevision) return null;

    const binding = delivery.record.binding;
    const book = authority.bookManifest.book;
    if (binding.book.bookId !== book.bookId
      || binding.book.bookRevision !== book.bookRevision
      || binding.book.manifestVersionId !== authority.bookManifest.manifestVersionId
      || binding.book.publicationId !== book.publicationId
      || binding.book.publicationRevision !== book.publicationRevision
      || binding.book.publicationStatus !== 'published') return null;
    const manifestBinding = authority.bookManifest.bindings.find(
      (candidate) => candidate.placementId === input.action.placementId,
    );
    const deliveryPlacement = binding.placements.find(
      (candidate) => candidate.placementId === input.action.placementId,
    );
    if (!manifestBinding || !deliveryPlacement
      || manifestBinding.activityId !== deliveryPlacement.activityId
      || manifestBinding.activityVersionId !== deliveryPlacement.activityVersionId
      || manifestBinding.activityVersion !== deliveryPlacement.activityVersion) return null;

    const scope = await this.dependencies.publications.readScope(book.bookId);
    const manifest = exactManifest(scope, authority);
    if (!manifest) return null;
    const storedPlacement: BookAssemblyPlacementRecord | undefined = scope.placements?.[deliveryPlacement.placementId];
    const activity = sole(Object.values(scope.activityVersions ?? {}).filter((candidate) => (
      candidate.ownerId === ownerId
      && candidate.bookId === book.bookId
      && candidate.manifestVersionId === manifest.manifestVersionId
      && candidate.publicationId === book.publicationId
      && candidate.publicationRevision === book.publicationRevision
      && candidate.activityId === deliveryPlacement.activityId
      && candidate.activityVersionId === deliveryPlacement.activityVersionId
      && candidate.activityVersion === deliveryPlacement.activityVersion
    ))) as BookAssemblyActivityVersionRecord | null;
    if (!storedPlacement || !activity || !activity.canonicalPayloadFingerprint
      || storedPlacement.ownerId !== ownerId
      || storedPlacement.bookId !== book.bookId
      || storedPlacement.manifestVersionId !== manifest.manifestVersionId
      || storedPlacement.publicationId !== book.publicationId
      || storedPlacement.publicationRevision !== book.publicationRevision
      || storedPlacement.activityId !== activity.activityId
      || storedPlacement.activityVersionId !== activity.activityVersionId) return null;

    const canonical = await this.dependencies.exactActivityVersions.readExact({
      bookId: book.bookId,
      manifestVersionId: manifest.manifestVersionId,
      publicationId: book.publicationId,
      ownerId,
      activityId: activity.activityId,
      activityVersionId: activity.activityVersionId,
      activityVersion: activity.activityVersion,
      payloadFingerprint: activity.canonicalPayloadFingerprint,
    });
    if (!canonical
      || canonical.lifecycle !== 'published'
      || canonical.ownerId !== ownerId
      || canonical.activityId !== activity.activityId
      || canonical.activityVersionId !== activity.activityVersionId
      || canonical.activityVersion !== activity.activityVersion
      || canonical.payloadFingerprint !== activity.canonicalPayloadFingerprint
      || !canonical.placementIds.includes(storedPlacement.placementId)) return null;

    return {
      assignmentId: root.assignmentId,
      actorUid: input.actorUid,
      ownerId: root.ownerId,
      recipientId,
      authorityId: entry.authorityId,
      authorityRevision: authority.revision,
      bindingId: binding.bindingId,
      bindingRevision: binding.revision,
      deliveryRecordRevision: delivery.record.recordRevision,
      bookId: book.bookId,
      manifestVersionId: manifest.manifestVersionId,
      publicationId: book.publicationId,
      publicationRevision: book.publicationRevision,
      placementId: storedPlacement.placementId,
      activityId: canonical.activityId,
      activityVersionId: canonical.activityVersionId,
      activityVersion: canonical.activityVersion,
      trustedBookProjection: canonical.projection,
    };
  }
}
