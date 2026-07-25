import { validateBookDeliveryBinding } from './bookDelivery.schema';
import type {
  BookDeliveryBinding,
} from './bookDelivery.types';
import type {
  BookDeliveryCurrentPointer,
  BookDeliveryMutationResult,
  BookDeliveryOperationReceipt,
  BookDeliveryRecord,
  BookDeliveryRepository,
  BookDeliveryResolvedEntitlement,
} from './bookDelivery.entitlement';

const clone = <T>(value: T): T => structuredClone(value);
const fingerprint = (value: unknown): string => JSON.stringify(value);

const assertValidBinding = (binding: BookDeliveryBinding): void => {
  const result = validateBookDeliveryBinding(binding);
  if (!result.valid) throw new Error(`invalid_book_delivery_binding:${result.errors[0]?.code ?? 'invalid-record'}`);
};

const pointer = (record: BookDeliveryRecord, now: string): BookDeliveryCurrentPointer => ({
  bindingId: record.binding.bindingId,
  bindingRevision: record.binding.revision,
  recipientId: record.binding.recipient.recipientId,
  contextId: record.binding.context.contextId,
  contextKind: record.binding.context.kind,
  status: 'active',
  updatedAt: now,
});

export class InMemoryBookDeliveryRepository implements BookDeliveryRepository {
  private readonly records = new Map<string, BookDeliveryRecord>();
  private readonly current = new Map<string, BookDeliveryCurrentPointer>();
  private readonly operations = new Map<string, BookDeliveryOperationReceipt>();

  async readBinding(bindingId: string): Promise<BookDeliveryRecord | null> {
    return clone(this.records.get(bindingId) ?? null);
  }

  async readCurrent(recipientId: string, contextId: string): Promise<BookDeliveryCurrentPointer | null> {
    return clone(this.current.get(this.currentKey(recipientId, contextId)) ?? null);
  }

  async resolveCurrent(recipientId: string, contextId: string): Promise<BookDeliveryResolvedEntitlement | null> {
    const current = await this.readCurrent(recipientId, contextId);
    if (!current) return null;
    const record = await this.readBinding(current.bindingId);
    if (!record || record.status !== 'active' || record.binding.revision !== current.bindingRevision) return null;
    return { record, pointer: current };
  }

  async createDraft(input: {
    binding: BookDeliveryBinding;
    operationId: string;
    now: string;
  }): Promise<BookDeliveryMutationResult> {
    assertValidBinding(input.binding);
    const replay = this.replay(input.operationId, input);
    if (replay) return replay;
    if (this.records.has(input.binding.bindingId)) return this.finish(input.operationId, input.now, 'conflict', input.binding.bindingId, undefined, undefined, input);
    const record: BookDeliveryRecord = {
      binding: clone(input.binding),
      recordRevision: 0,
      status: 'draft',
      createdAt: input.now,
      updatedAt: input.now,
    };
    this.records.set(record.binding.bindingId, record);
    return this.finish(input.operationId, input.now, 'created', record.binding.bindingId, record, undefined, input);
  }

  async activate(input: {
    bindingId: string;
    expectedRecordRevision: number;
    expectedCurrentBindingId?: string;
    operationId: string;
    now: string;
  }): Promise<BookDeliveryMutationResult> {
    const replay = this.replay(input.operationId, input);
    if (replay) return replay;
    const current = this.records.get(input.bindingId);
    if (!current) return this.finish(input.operationId, input.now, 'not-found', undefined, undefined, undefined, input);
    if (current.recordRevision !== input.expectedRecordRevision || current.status !== 'draft') {
      return this.finish(input.operationId, input.now, 'conflict', input.bindingId, current, undefined, input);
    }
    const key = this.currentKey(current.binding.recipient.recipientId, current.binding.context.contextId);
    const existing = this.current.get(key);
    if (input.expectedCurrentBindingId !== undefined
      && existing?.bindingId !== input.expectedCurrentBindingId) {
      return this.finish(input.operationId, input.now, 'conflict', input.bindingId, current, undefined, input);
    }
    if (existing && existing.bindingId !== input.bindingId) {
      return this.finish(input.operationId, input.now, 'conflict', input.bindingId, current, undefined, input);
    }
    const record = this.updated(current, 'active', input.now);
    const active = { ...record, binding: { ...record.binding, status: 'active' as const } };
    this.records.set(input.bindingId, active);
    this.current.set(key, pointer(active, input.now));
    return this.finish(input.operationId, input.now, 'activated', input.bindingId, active, this.current.get(key), input);
  }

  async supersede(input: {
    binding: BookDeliveryBinding;
    expectedCurrentBindingId: string;
    operationId: string;
    now: string;
  }): Promise<BookDeliveryMutationResult> {
    assertValidBinding(input.binding);
    const replay = this.replay(input.operationId, input);
    if (replay) return replay;
    const key = this.currentKey(input.binding.recipient.recipientId, input.binding.context.contextId);
    const existing = this.current.get(key);
    if (!existing || existing.bindingId !== input.expectedCurrentBindingId) {
      return this.finish(input.operationId, input.now, 'conflict', input.binding.bindingId, undefined, undefined, input);
    }
    if (this.records.has(input.binding.bindingId)) {
      return this.finish(input.operationId, input.now, 'conflict', input.binding.bindingId, undefined, undefined, input);
    }
    const old = this.records.get(existing.bindingId);
    if (!old || old.status !== 'active') return this.finish(input.operationId, input.now, 'conflict', undefined, undefined, undefined, input);
    const next: BookDeliveryRecord = {
      binding: clone({ ...input.binding, status: 'active' as const }),
      recordRevision: 0,
      status: 'active',
      createdAt: input.now,
      updatedAt: input.now,
    };
    const retired: BookDeliveryRecord = this.updated(old, 'revoked', input.now);
    this.records.set(old.binding.bindingId, retired);
    this.records.set(next.binding.bindingId, next);
    this.current.set(key, pointer(next, input.now));
    return this.finish(input.operationId, input.now, 'superseded', next.binding.bindingId, next, this.current.get(key), input);
  }

  async revoke(input: {
    bindingId: string;
    expectedRecordRevision: number;
    expectedCurrentBindingId: string;
    operationId: string;
    now: string;
  }): Promise<BookDeliveryMutationResult> {
    const replay = this.replay(input.operationId, input);
    if (replay) return replay;
    const record = this.records.get(input.bindingId);
    const key = record ? this.currentKey(record.binding.recipient.recipientId, record.binding.context.contextId) : '';
    const current = record ? this.current.get(key) : undefined;
    if (!record || !current || current.bindingId !== input.expectedCurrentBindingId
      || record.recordRevision !== input.expectedRecordRevision || record.status !== 'active') {
      return this.finish(input.operationId, input.now, 'conflict', input.bindingId, record, undefined, input);
    }
    const revoked = this.updated(record, 'revoked', input.now);
    this.records.set(input.bindingId, revoked);
    this.current.delete(key);
    return this.finish(input.operationId, input.now, 'revoked', input.bindingId, revoked, undefined, input);
  }

  private updated(record: BookDeliveryRecord, status: BookDeliveryRecord['status'], now: string): BookDeliveryRecord {
    return {
      ...clone(record),
      binding: { ...clone(record.binding), status },
      recordRevision: record.recordRevision + 1,
      status,
      updatedAt: now,
    };
  }

  private currentKey(recipientId: string, contextId: string): string {
    return `${recipientId}/${contextId}`;
  }

  private replay(operationId: string, input: unknown): BookDeliveryMutationResult | undefined {
    const old = this.operations.get(operationId);
    if (!old) return undefined;
    if (old.fingerprint !== fingerprint(input)) {
      return {
        status: 'idempotency-conflict',
        receipt: clone({ ...old, status: 'idempotency-conflict' }),
      };
    }
    return { status: 'replayed', receipt: clone({ ...old, status: 'replayed' }) };
  }

  private finish(
    operationId: string,
    now: string,
    status: BookDeliveryMutationResult['status'],
    bindingId?: string,
    record?: BookDeliveryRecord,
    current?: BookDeliveryCurrentPointer,
    input?: unknown,
  ): BookDeliveryMutationResult {
    const operation: BookDeliveryOperationReceipt = {
      operationId,
      fingerprint: fingerprint(input ?? { status, bindingId }),
      status,
      bindingId,
      bindingRevision: record?.binding.revision,
      createdAt: now,
    };
    this.operations.set(operationId, operation);
    return {
      status,
      record: record ? clone(record) : undefined,
      pointer: current ? clone(current) : undefined,
      receipt: clone(operation),
    };
  }
}
