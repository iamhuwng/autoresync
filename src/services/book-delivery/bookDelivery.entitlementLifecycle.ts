import { createBookContextAdapterRegistry } from './bookContextAdapterRegistry.service';
import type { BookDeliveryBinding, BookDeliveryContextKind } from './bookDelivery.types';
import type {
  BookDeliveryCurrentPointer,
  BookDeliveryMutationResult,
  BookDeliveryOperationReceipt,
  BookDeliveryRecord,
  BookDeliveryRepository,
  BookDeliveryResolvedEntitlement,
} from './bookDelivery.entitlement';
import type { BookDeliveryRecoveryContext } from './bookDelivery.recovery';

const operationPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/u;
const contexts = new Set<BookDeliveryContextKind>(['solo', 'preview', 'homework', 'course', 'class']);
const supportedAdapterContexts = new Set<BookDeliveryContextKind>(['solo', 'preview', 'homework']);

const clone = <T>(value: T): T => structuredClone(value);
const fingerprint = (value: unknown): string => JSON.stringify(value, Object.keys(value as object).sort());
const assertId = (value: string, label: string): void => {
  if (!idPattern.test(value)) throw new BookDeliveryLifecycleError('invalid-' + label);
};
const assertOperation = (value: string): void => {
  if (!operationPattern.test(value)) throw new BookDeliveryLifecycleError('invalid-operation-id');
};
const assertRevision = (value: number): void => {
  if (!Number.isSafeInteger(value) || value < 0) throw new BookDeliveryLifecycleError('invalid-revision');
};
const assertNow = (value: string): void => {
  if (Number.isNaN(Date.parse(value))) throw new BookDeliveryLifecycleError('invalid-time');
};

export class BookDeliveryLifecycleError extends Error {
  constructor(readonly code: string, readonly status = 400) {
    super(code);
    this.name = 'BookDeliveryLifecycleError';
  }
}

const receipt = (
  operationId: string,
  input: unknown,
  status: BookDeliveryOperationReceipt['status'],
  now: string,
  record?: BookDeliveryRecord,
): BookDeliveryOperationReceipt => ({
  operationId,
  fingerprint: fingerprint(input),
  status,
  bindingId: record?.binding.bindingId,
  bindingRevision: record?.binding.revision,
  createdAt: now,
});

const pointerFor = (record: BookDeliveryRecord, now: string): BookDeliveryCurrentPointer => ({
  bindingId: record.binding.bindingId,
  bindingRevision: record.binding.revision,
  recipientId: record.binding.recipient.recipientId,
  contextId: record.binding.context.contextId,
  contextKind: record.binding.context.kind,
  status: 'active',
  updatedAt: now,
});

const assertBindingForLifecycle = (binding: BookDeliveryBinding): void => {
  assertId(binding.bindingId, 'binding-id');
  assertId(binding.recipient.recipientId, 'recipient-id');
  assertId(binding.context.contextId, 'context-id');
  assertId(binding.issuer.ownerId, 'owner-id');
  assertRevision(binding.revision);
  if (!contexts.has(binding.context.kind) || binding.context.kind === 'future_live') {
    throw new BookDeliveryLifecycleError('unsupported-context');
  }
  if (binding.status !== 'draft') throw new BookDeliveryLifecycleError('binding-must-start-draft');
  if (binding.context.recipientId !== binding.recipient.recipientId) {
    throw new BookDeliveryLifecycleError('recipient-context-mismatch');
  }
};

export interface BookDeliveryLifecycleOptions {
  readonly repository: BookDeliveryRepository;
  readonly authorizeIssuer: (binding: BookDeliveryBinding) => Promise<boolean> | boolean;
  readonly authorizeRecipient?: (recipientId: string, contextId: string) => Promise<boolean> | boolean;
  readonly adapterContexts?: readonly BookDeliveryContextKind[];
  /** Recovery rebuilds only staged unavailable projections; it never mutates entitlements. */
  readonly recoveryContext?: BookDeliveryRecoveryContext;
}

export class BookDeliveryEntitlementLifecycle {
  private readonly adapterContexts: ReadonlySet<BookDeliveryContextKind>;

  constructor(private readonly options: BookDeliveryLifecycleOptions) {
    this.adapterContexts = new Set(options.adapterContexts ?? supportedAdapterContexts);
  }

  async createDraft(binding: BookDeliveryBinding, operationId: string, now: string): Promise<BookDeliveryMutationResult> {
    this.assertRecoveryEffectsSuppressed();
    assertBindingForLifecycle(binding);
    assertOperation(operationId);
    assertNow(now);
    if (!await this.options.authorizeIssuer(binding)) {
      throw new BookDeliveryLifecycleError('issuer-forbidden', 403);
    }
    return this.options.repository.createDraft({ binding: clone(binding), operationId, now });
  }

  async activate(bindingId: string, expectedRecordRevision: number, operationId: string, now: string): Promise<BookDeliveryMutationResult> {
    this.assertRecoveryEffectsSuppressed();
    assertId(bindingId, 'binding-id');
    assertRevision(expectedRecordRevision);
    assertOperation(operationId);
    assertNow(now);
    const current = await this.options.repository.readBinding(bindingId);
    if (!current) return this.notFound(operationId, now);
    this.assertContextReady(current.binding.context.kind);
    if (!await this.options.authorizeIssuer(current.binding)) {
      throw new BookDeliveryLifecycleError('issuer-forbidden', 403);
    }
    return this.options.repository.activate({
      bindingId,
      expectedRecordRevision,
      operationId,
      now,
    });
  }

  async supersede(binding: BookDeliveryBinding, expectedCurrentBindingId: string, operationId: string, now: string): Promise<BookDeliveryMutationResult> {
    this.assertRecoveryEffectsSuppressed();
    assertBindingForLifecycle(binding);
    assertId(expectedCurrentBindingId, 'current-binding-id');
    assertOperation(operationId);
    assertNow(now);
    this.assertContextReady(binding.context.kind);
    if (!await this.options.authorizeIssuer(binding)) {
      throw new BookDeliveryLifecycleError('issuer-forbidden', 403);
    }
    return this.options.repository.supersede({
      binding: clone(binding),
      expectedCurrentBindingId,
      operationId,
      now,
    });
  }

  async revoke(
    bindingId: string,
    expectedRecordRevision: number,
    expectedCurrentBindingId: string,
    operationId: string,
    now: string,
  ): Promise<BookDeliveryMutationResult> {
    this.assertRecoveryEffectsSuppressed();
    assertId(bindingId, 'binding-id');
    assertRevision(expectedRecordRevision);
    assertId(expectedCurrentBindingId, 'current-binding-id');
    assertOperation(operationId);
    assertNow(now);
    const current = await this.options.repository.readBinding(bindingId);
    if (!current) return this.notFound(operationId, now);
    if (!await this.options.authorizeIssuer(current.binding)) {
      throw new BookDeliveryLifecycleError('issuer-forbidden', 403);
    }
    return this.options.repository.revoke({
      bindingId,
      expectedRecordRevision,
      expectedCurrentBindingId,
      operationId,
      now,
    });
  }

  async resolve(recipientId: string, contextId: string): Promise<BookDeliveryResolvedEntitlement | null> {
    this.assertRecoveryEffectsSuppressed();
    assertId(recipientId, 'recipient-id');
    assertId(contextId, 'context-id');
    if (this.options.authorizeRecipient && !await this.options.authorizeRecipient(recipientId, contextId)) {
      throw new BookDeliveryLifecycleError('recipient-forbidden', 403);
    }
    return this.options.repository.resolveCurrent(recipientId, contextId);
  }

  private assertContextReady(kind: BookDeliveryContextKind): void {
    if (kind === 'future_live' || !contexts.has(kind) || !this.adapterContexts.has(kind)) {
      throw new BookDeliveryLifecycleError('unsupported-context');
    }
    // Force the registry contract to remain the single declaration boundary.
    createBookContextAdapterRegistry([]);
  }

  private assertRecoveryEffectsSuppressed(): void {
    if (this.options.recoveryContext) {
      throw new BookDeliveryLifecycleError('recovery-side-effect-suppressed', 409);
    }
  }

  private notFound(operationId: string, now: string): BookDeliveryMutationResult {
    return { status: 'not-found', receipt: receipt(operationId, null, 'not-found', now) };
  }
}
