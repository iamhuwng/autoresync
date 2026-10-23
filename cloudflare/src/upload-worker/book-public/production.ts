import type { BookDeliveryBinding } from '../../../../src/services/book-delivery/bookDelivery.types.ts';
import type { BookDeliveryRepository } from '../../../../src/services/book-delivery/bookDelivery.entitlement.ts';
import { createBookDeliveryBinding } from '../../../../src/services/book-delivery/bookDelivery.entitlementFactory.ts';
import { createBookDeliveryProjectionResolver } from '../../../../src/services/book-delivery/bookDelivery.service.ts';
import { FirebaseRestBookDeliveryRepository, type BookDeliveryRepositoryEnv } from '../book-delivery/repository.ts';
import { FirebaseRestBookAssemblyPublicationRepository, type BookAssemblyPublicationRepositoryEnv } from '../book-assembly/publication-repository.ts';
import { createTrustedBookDeliveryPublication, resolveTrustedBookDeliveryStudentDocument, resolveTrustedBookDeliveryFullPageDefaults } from '../book-delivery/worker.ts';
import { createPublicBookAuthorityReader } from './authority-reader.ts';
import { defaultRuntimeFactory } from '../book-source/document.ts';
import type { LiveBookDocumentAuthority } from '../book-delivery/documentAuthorization.ts';

type PublicDependencies = {
  readonly publicationRepository?: Pick<FirebaseRestBookAssemblyPublicationRepository, 'readScope'>;
  readonly resolveStudentDocument?: typeof resolveTrustedBookDeliveryStudentDocument;
  readonly resolveFullPageDefaults?: typeof resolveTrustedBookDeliveryFullPageDefaults;
  readonly readDocumentAuthority?: (env: PublicEnv, binding: BookDeliveryBinding) => Promise<LiveBookDocumentAuthority>;
};
type PublicEnv = BookDeliveryRepositoryEnv & BookAssemblyPublicationRepositoryEnv;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const record = (value: unknown): Record<string, any> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null;

/** Public eligibility is owned by moderation plus current Book authority, never request metadata. */
export const readPublicBookAuthority = async (env: PublicEnv, bookId: string, studentId: string) => {
  if (!ID.test(bookId) || !ID.test(studentId)) return null;
  const read = createPublicBookAuthorityReader(env, bookId, studentId);
  const [projectionValue, bookValue] = await Promise.all([
    read(`material_catalog/public_book_projections/${bookId}`),
    read(`material_catalog/books/${bookId}`),
  ]);
  const projection = record(projectionValue);
  const stored = record(bookValue);
  const book = record(stored?.metadata) ?? stored;
  if (!projection || !book || projection.bookId !== bookId || book.bookId !== bookId
    || projection.visibility !== 'public-library-published' || projection.status !== 'ready'
    || book.visibility !== 'public-library-published' || book.status !== 'ready'
    || typeof book.ownerId !== 'string' || !ID.test(book.ownerId)
    || typeof projection.title !== 'string') return null;
  return { bookId, ownerId: book.ownerId as string, title: projection.title as string };
};

/** Re-read live public authority on launch, bytes, draft reads and every mutation. */
export const authorizePublicBookProjection = async (env: PublicEnv, binding: BookDeliveryBinding, dependencies: PublicDependencies = {}): Promise<boolean> => {
  if (binding.context.kind !== 'public' || binding.issuer.authorityBoundary !== 'public-library'
    || binding.recipient.recipientKind !== 'student' || binding.context.recipientId !== binding.recipient.recipientId) return false;
  const expectedContextId = `public_${(await digest(`${binding.book.bookId}:${binding.book.publicationId}:${binding.book.publicationRevision}`)).slice(0, 32)}`;
  if (binding.context.contextId !== expectedContextId) return false;
  const profile = record(await createPublicBookAuthorityReader(env, binding.book.bookId, binding.recipient.recipientId)(`users/${binding.recipient.recipientId}`));
  if (!profile || profile.role !== 'student' || profile.status !== 'active' || profile.disabled === true || profile.forceReauth === true) return false;
  const authority = await readPublicBookAuthority(env, binding.book.bookId, binding.recipient.recipientId);
  if (!authority || authority.ownerId !== binding.issuer.ownerId) return false;
  const scope = await (dependencies.publicationRepository ?? new FirebaseRestBookAssemblyPublicationRepository({ env, ownerId: authority.ownerId })).readScope(binding.book.bookId);
  try {
    createTrustedBookDeliveryPublication({ bookId: binding.book.bookId,
      publicationId: binding.book.publicationId, publicationRevision: binding.book.publicationRevision,
      recipientId: binding.recipient.recipientId, contextId: binding.context.contextId,
      contextKind: 'public', scope: binding.scope }, scope, binding.schedulePolicy);
    return binding.sourceSet.strategy !== 'component_pdfs' || Boolean(await (dependencies.resolveStudentDocument ?? resolveTrustedBookDeliveryStudentDocument)(env, binding));
  } catch { return false; }
};

export const authorizePublicBookBinding = async (env: PublicEnv, binding: BookDeliveryBinding, dependencies: PublicDependencies = {}): Promise<boolean> => {
  if (!await authorizePublicBookProjection(env, binding, dependencies)) return false;
  const source = await (dependencies.readDocumentAuthority ?? ((value, delivery) => defaultRuntimeFactory(value).readCurrentAuthority(delivery)))(env, binding);
  return source.publicationStatus === 'published' && source.scheduleOpen === true
    && source.revokedSourceVersionIds.length === 0 && source.sourceVersionIds.length === 1
    && source.sourceLocations.length === 1 && source.sourceLocations[0]?.sourceVersionId === source.sourceVersionIds[0];
};

const digest = async (value: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const activationOperation = async (operationId: string) => {
  const hex = await digest(`public-activate:${operationId}`);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

export const createPublicBookProductionHandlers = (options: PublicDependencies & {
  readonly delivery?: BookDeliveryRepository;
  readonly now?: () => string;
} = {}) => ({
  async launch(input: { request: Request; env: PublicEnv; uid: string; bookId: string }) {
    try {
      if (!ID.test(input.uid) || !ID.test(input.bookId)) return { body: { code: 'public_book_request_invalid' }, init: { status: 400 } };
      const profile = record(await createPublicBookAuthorityReader(input.env, input.bookId, input.uid)(`users/${input.uid}`));
      if (!profile || profile.role !== 'student' || profile.status !== 'active' || profile.disabled === true || profile.forceReauth === true
        || ['blocked', 'inactive', 'suspended'].includes(String(profile.status))) return { body: { code: 'public_book_student_required' }, init: { status: 403 } };
      const text = await input.request.text();
      if (new TextEncoder().encode(text).byteLength > 1024) return { body: { code: 'public_book_request_invalid' }, init: { status: 413 } };
      const body = record(JSON.parse(text));
      if (!body || Object.keys(body).length !== 1 || typeof body.operationId !== 'string' || !UUID.test(body.operationId)) return { body: { code: 'public_book_request_invalid' }, init: { status: 400 } };
      const authority = await readPublicBookAuthority(input.env, input.bookId, input.uid);
      if (!authority) return { body: { code: 'public_book_unavailable' }, init: { status: 403 } };
      const repository = options.delivery ?? new FirebaseRestBookDeliveryRepository({ env: input.env });
      const scope = await (options.publicationRepository ?? new FirebaseRestBookAssemblyPublicationRepository({ env: input.env, ownerId: authority.ownerId })).readScope(input.bookId);
      if (!scope.current) return { body: { code: 'public_book_document_unavailable' }, init: { status: 409 } };
      const version = scope.versions?.[scope.current.manifestVersionId];
      const placements = [...new Set(Object.values(scope.deliveryPlans ?? {}).filter((plan) => plan.manifestVersionId === version?.manifestVersionId).flatMap((plan) => plan.placementIds))];
      if (!placements.length) return { body: { code: 'public_book_document_unavailable' }, init: { status: 409 } };
      const contextId = `public_${(await digest(`${input.bookId}:${scope.current.publicationId}:${scope.current.publicationRevision}`)).slice(0, 32)}`;
      const policy = { policyId: contextId, policyRevision: 1, basis: 'immutable-reference' as const };
      const publication = createTrustedBookDeliveryPublication({ bookId: input.bookId,
        publicationId: scope.current.publicationId, publicationRevision: scope.current.publicationRevision,
        recipientId: input.uid, contextKind: 'public', contextId,
        scope: { kind: 'placements', nodeKeys: [], placementIds: placements } }, scope, policy);
      const now = (options.now ?? (() => new Date().toISOString()))();
      const binding = createBookDeliveryBinding({ bindingId: `bd_${(await digest(`${input.uid}:${body.operationId}`)).slice(0, 40)}`,
        revision: 1, status: 'draft', recipient: { recipientId: input.uid, recipientKind: 'student' },
        issuer: { ownerId: authority.ownerId, authorityBoundary: 'public-library' },
        context: { kind: 'public', entitlementBasis: 'public-library', contextId, recipientId: input.uid, ownerId: authority.ownerId },
        publication, createdAt: now });
      if (!(await authorizePublicBookBinding(input.env, binding, options))) return { body: { code: 'public_book_document_unavailable' }, init: { status: 409 } };
      const current = await repository.resolveCurrent(input.uid, contextId);
      if (current && (current.record.status !== 'active' || !(await authorizePublicBookBinding(input.env, current.record.binding, options)))) return { body: { code: 'public_book_delivery_stale' }, init: { status: 409 } };
      if (!current) {
        const created = await repository.createDraft({ binding, operationId: body.operationId, now });
        if (!created.record || !['created', 'replayed'].includes(created.status)) return { body: { code: 'public_book_delivery_conflict' }, init: { status: 409 } };
        if (!(await authorizePublicBookBinding(input.env, created.record.binding, options))) return { body: { code: 'public_book_unavailable' }, init: { status: 403 } };
        const activated = await repository.activate({ bindingId: binding.bindingId, expectedRecordRevision: created.record.recordRevision,
          operationId: await activationOperation(body.operationId), now });
        if (!['activated', 'replayed'].includes(activated.status)) return { body: { code: 'public_book_delivery_conflict' }, init: { status: 409 } };
      }
      const projection = await createBookDeliveryProjectionResolver({ repository,
        resolveStudentDocument: (value) => (options.resolveStudentDocument ?? resolveTrustedBookDeliveryStudentDocument)(input.env, value),
        resolveFullPageDefaults: (value) => (options.resolveFullPageDefaults ?? resolveTrustedBookDeliveryFullPageDefaults)(input.env, value, options.publicationRepository),
      }).resolve({ actor: { uid: input.uid }, recipientId: input.uid, contextId });
      return { body: { title: authority.title, projection }, init: { status: 200 } };
    } catch (error) {
      console.error('public_book_launch_failed', error instanceof Error ? error.message.slice(0, 160) : 'unknown');
      return { body: { code: error instanceof SyntaxError ? 'public_book_request_invalid' : 'public_book_authority_unavailable' }, init: { status: error instanceof SyntaxError ? 400 : 503 } };
    }
  },
});
