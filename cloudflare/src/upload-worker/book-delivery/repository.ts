import { FirebaseRtdbRestClient, type RepositoryEnv } from '../listening-authoring/rtdb.ts';
import { validateBookDeliveryBinding } from '../../../../src/services/book-delivery/bookDelivery.schema.ts';
import type { BookDeliveryBinding } from '../../../../src/services/book-delivery/bookDelivery.types.ts';
import type {
  BookDeliveryCurrentPointer,
  BookDeliveryMutationResult,
  BookDeliveryOperationReceipt,
  BookDeliveryRecord,
  BookDeliveryRepository,
  BookDeliveryResolvedEntitlement,
} from '../../../../src/services/book-delivery/bookDelivery.entitlement.ts';

export const BOOK_DELIVERY_ROOT = 'book_delivery';
const MAX_RETRIES = 5;
const MAX_RECORDS_PER_SCOPE = 128;
const MAX_OPERATIONS_PER_SCOPE = 256;
const MAX_SCOPE_BYTES = 8 * 1024 * 1024;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/u;
const OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface BookDeliveryRepositoryEnv extends RepositoryEnv {
  BOOK_DELIVERY_SERVICE_IDENTITY?: string;
  BOOK_DELIVERY_GOOGLE_SA_KEY?: string;
}

interface BindingIndex {
  readonly recipientId: string;
  readonly contextId: string;
}

interface PersistedOperation {
  readonly fingerprint: string;
  readonly result: BookDeliveryMutationResult;
}

interface DeliveryScope {
  records?: Record<string, BookDeliveryRecord>;
  current?: BookDeliveryCurrentPointer;
  operations?: Record<string, PersistedOperation>;
}

const clone = <T>(value: T): T => structuredClone(value);
const rootPath = (...parts: string[]): string => [BOOK_DELIVERY_ROOT, ...parts].join('/');
const scopePath = (recipientId: string, contextId: string): string =>
  rootPath('scopes', recipientId, contextId);
const bindingPath = (bindingId: string): string => rootPath('indexes', 'bindings', bindingId);
const recordPath = (index: BindingIndex, bindingId: string): string =>
  `${scopePath(index.recipientId, index.contextId)}/records/${bindingId}`;
const currentPath = (recipientId: string, contextId: string): string =>
  `${scopePath(recipientId, contextId)}/current`;
const assertId = (value: string, label: string): void => {
  if (!ID.test(value)) throw new Error(`invalid_book_delivery_${label}`);
};
const assertOperationId = (value: string): void => {
  if (!OPERATION_ID.test(value)) throw new Error('invalid_book_delivery_operation_id');
};
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};
const operationFingerprint = (action: string, input: Record<string, unknown>): string => {
  const stableInput = clone(input);
  delete stableInput.now;
  if (stableInput.binding && typeof stableInput.binding === 'object' && !Array.isArray(stableInput.binding)) {
    const binding = clone(stableInput.binding as Record<string, unknown>);
    delete binding.createdAt;
    stableInput.binding = binding;
  }
  return stable({ action, ...stableInput });
};
const encodedBytes = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;

const validRecord = (value: unknown, expectedId?: string): value is BookDeliveryRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as BookDeliveryRecord;
  return Number.isSafeInteger(record.recordRevision)
    && record.recordRevision >= 0
    && (record.status === 'draft' || record.status === 'active' || record.status === 'revoked')
    && typeof record.createdAt === 'string'
    && typeof record.updatedAt === 'string'
    && (!expectedId || record.binding?.bindingId === expectedId)
    && validateBookDeliveryBinding(record.binding).valid;
};
const validPointer = (value: unknown): value is BookDeliveryCurrentPointer => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const pointer = value as BookDeliveryCurrentPointer;
  return ID.test(pointer.bindingId)
    && ID.test(pointer.recipientId)
    && ID.test(pointer.contextId)
    && Number.isSafeInteger(pointer.bindingRevision)
    && pointer.bindingRevision >= 0
    && pointer.status === 'active'
    && typeof pointer.updatedAt === 'string';
};
const parseIndex = (value: unknown): BindingIndex | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const index = value as Record<string, unknown>;
  if (Object.keys(index).sort().join(',') !== 'contextId,recipientId'
    || typeof index.recipientId !== 'string'
    || typeof index.contextId !== 'string'
    || !ID.test(index.recipientId)
    || !ID.test(index.contextId)) return null;
  return { recipientId: index.recipientId, contextId: index.contextId };
};
const parseOperation = (value: unknown): PersistedOperation | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const operation = value as Record<string, unknown>;
  if (Object.keys(operation).sort().join(',') !== 'fingerprint,result'
    || typeof operation.fingerprint !== 'string'
    || !operation.result
    || typeof operation.result !== 'object'
    || Array.isArray(operation.result)) return null;
  const result = operation.result as BookDeliveryMutationResult;
  if (!result.receipt || typeof result.status !== 'string') return null;
  return { fingerprint: operation.fingerprint, result: clone(result) };
};
const parseScope = (value: unknown): DeliveryScope => {
  if (value === null || value === undefined) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_book_delivery_scope');
  const source = value as Record<string, unknown>;
  if (Object.keys(source).some((key) => !['current', 'operations', 'records'].includes(key))
    || encodedBytes(source) > MAX_SCOPE_BYTES) throw new Error('invalid_book_delivery_scope');
  const records: Record<string, BookDeliveryRecord> = {};
  if (source.records !== undefined) {
    if (!source.records || typeof source.records !== 'object' || Array.isArray(source.records)) {
      throw new Error('invalid_book_delivery_records');
    }
    const entries = Object.entries(source.records as Record<string, unknown>);
    if (entries.length > MAX_RECORDS_PER_SCOPE) throw new Error('book_delivery_record_capacity_exceeded');
    for (const [bindingId, record] of entries) {
      if (!ID.test(bindingId) || !validRecord(record, bindingId)) throw new Error('invalid_book_delivery_record');
      records[bindingId] = clone(record);
    }
  }
  const operations: Record<string, PersistedOperation> = {};
  if (source.operations !== undefined) {
    if (!source.operations || typeof source.operations !== 'object' || Array.isArray(source.operations)) {
      throw new Error('invalid_book_delivery_operations');
    }
    const entries = Object.entries(source.operations as Record<string, unknown>);
    if (entries.length > MAX_OPERATIONS_PER_SCOPE) throw new Error('book_delivery_operation_capacity_exceeded');
    for (const [operationId, operation] of entries) {
      const parsed = parseOperation(operation);
      if (!OPERATION_ID.test(operationId) || !parsed) throw new Error('invalid_book_delivery_operation');
      operations[operationId] = parsed;
    }
  }
  if (source.current !== undefined && !validPointer(source.current)) {
    throw new Error('invalid_book_delivery_current_pointer');
  }
  return {
    records: Object.keys(records).length ? records : undefined,
    current: source.current === undefined ? undefined : clone(source.current as BookDeliveryCurrentPointer),
    operations: Object.keys(operations).length ? operations : undefined,
  };
};

const receipt = (
  operationId: string,
  fingerprint: string,
  status: BookDeliveryMutationResult['status'],
  now: string,
  record?: BookDeliveryRecord,
): BookDeliveryOperationReceipt => ({
  operationId,
  fingerprint,
  status,
  bindingId: record?.binding.bindingId,
  bindingRevision: record?.binding.revision,
  createdAt: now,
});
const result = (
  operationId: string,
  fingerprint: string,
  status: BookDeliveryMutationResult['status'],
  now: string,
  record?: BookDeliveryRecord,
  pointer?: BookDeliveryCurrentPointer,
): BookDeliveryMutationResult => ({
  status,
  record: record && clone(record),
  pointer: pointer && clone(pointer),
  receipt: receipt(operationId, fingerprint, status, now, record),
});
const replay = (
  persisted: PersistedOperation | undefined,
  fingerprint: string,
): BookDeliveryMutationResult | null => {
  if (!persisted) return null;
  if (persisted.fingerprint !== fingerprint) {
    return {
      status: 'idempotency-conflict',
      receipt: { ...clone(persisted.result.receipt), status: 'idempotency-conflict' },
    };
  }
  return {
    ...clone(persisted.result),
    status: 'replayed',
    receipt: { ...clone(persisted.result.receipt), status: 'replayed' },
  };
};
const activeRecord = (
  record: BookDeliveryRecord,
  now: string,
): BookDeliveryRecord => ({
  ...clone(record),
  binding: { ...clone(record.binding), status: 'active' },
  recordRevision: record.recordRevision + 1,
  status: 'active',
  updatedAt: now,
});
const revokedRecord = (
  record: BookDeliveryRecord,
  now: string,
): BookDeliveryRecord => ({
  ...clone(record),
  binding: { ...clone(record.binding), status: 'revoked' },
  recordRevision: record.recordRevision + 1,
  status: 'revoked',
  updatedAt: now,
});
const pointerFor = (
  record: BookDeliveryRecord,
  now: string,
): BookDeliveryCurrentPointer => ({
  bindingId: record.binding.bindingId,
  bindingRevision: record.binding.revision,
  recipientId: record.binding.recipient.recipientId,
  contextId: record.binding.context.contextId,
  contextKind: record.binding.context.kind,
  status: 'active',
  updatedAt: now,
});

export class FirebaseRestBookDeliveryRepository implements BookDeliveryRepository {
  private readonly rtdb: FirebaseRtdbRestClient;

  constructor(private readonly options: {
    env: BookDeliveryRepositoryEnv;
    fetchImpl?: typeof fetch;
    getAccessToken?: () => Promise<string>;
    maxRetries?: number;
  }) {
    const identity = options.env.BOOK_DELIVERY_SERVICE_IDENTITY?.trim();
    if (!identity) throw new Error('missing_book_delivery_service_identity');
    const keyJson = options.env.BOOK_DELIVERY_GOOGLE_SA_KEY?.trim();
    if (!keyJson && !options.getAccessToken) throw new Error('missing_book_delivery_google_sa_key');
    if (keyJson) {
      let clientEmail: unknown;
      try { clientEmail = (JSON.parse(keyJson) as Record<string, unknown>).client_email; } catch {
        throw new Error('invalid_book_delivery_google_sa_key');
      }
      if (clientEmail !== identity) throw new Error('book_delivery_service_identity_mismatch');
    }
    this.rtdb = new FirebaseRtdbRestClient({
      env: { ...options.env, GOOGLE_SA_KEY: keyJson },
      fetchImpl: options.fetchImpl ?? globalThis.fetch,
      getAccessToken: options.getAccessToken,
    });
  }

  async readBinding(bindingId: string): Promise<BookDeliveryRecord | null> {
    assertId(bindingId, 'binding_id');
    const index = parseIndex(await this.rtdb.readValue(bindingPath(bindingId)));
    if (!index) return null;
    const value = await this.rtdb.readValue(recordPath(index, bindingId));
    return validRecord(value, bindingId) ? clone(value) : null;
  }

  async readCurrent(recipientId: string, contextId: string): Promise<BookDeliveryCurrentPointer | null> {
    assertId(recipientId, 'recipient_id');
    assertId(contextId, 'context_id');
    const value = await this.rtdb.readValue(currentPath(recipientId, contextId));
    return validPointer(value) ? clone(value) : null;
  }

  async resolveCurrent(recipientId: string, contextId: string): Promise<BookDeliveryResolvedEntitlement | null> {
    const pointer = await this.readCurrent(recipientId, contextId);
    if (!pointer) return null;
    const value = await this.rtdb.readValue(
      `${scopePath(recipientId, contextId)}/records/${pointer.bindingId}`,
    );
    if (!validRecord(value, pointer.bindingId)
      || value.status !== 'active'
      || value.binding.revision !== pointer.bindingRevision) return null;
    return { record: clone(value), pointer };
  }

  async createDraft(input: {
    binding: BookDeliveryBinding;
    operationId: string;
    now: string;
  }): Promise<BookDeliveryMutationResult> {
    assertOperationId(input.operationId);
    const validation = validateBookDeliveryBinding(input.binding);
    if (!validation.valid || input.binding.status !== 'draft') throw new Error('invalid_book_delivery_binding');
    const fp = operationFingerprint('create', input);
    const index = {
      recipientId: input.binding.recipient.recipientId,
      contextId: input.binding.context.contextId,
    };
    if (!await this.ensureIndex(input.binding.bindingId, index)) {
      return result(input.operationId, fp, 'conflict', input.now);
    }
    return this.transaction(index, input.operationId, fp, input.now, (scope) => {
      if (scope.records?.[input.binding.bindingId]) {
        return result(input.operationId, fp, 'conflict', input.now);
      }
      if (Object.keys(scope.records ?? {}).length >= MAX_RECORDS_PER_SCOPE) {
        return result(input.operationId, fp, 'conflict', input.now);
      }
      const record: BookDeliveryRecord = {
        binding: clone(input.binding),
        recordRevision: 0,
        status: 'draft',
        createdAt: input.now,
        updatedAt: input.now,
      };
      scope.records = { ...(scope.records ?? {}), [record.binding.bindingId]: record };
      return result(input.operationId, fp, 'created', input.now, record);
    });
  }

  async activate(input: {
    bindingId: string;
    expectedRecordRevision: number;
    expectedCurrentBindingId?: string;
    operationId: string;
    now: string;
  }): Promise<BookDeliveryMutationResult> {
    assertOperationId(input.operationId);
    const fp = operationFingerprint('activate', input);
    const index = parseIndex(await this.rtdb.readValue(bindingPath(input.bindingId)));
    if (!index) return result(input.operationId, fp, 'not-found', input.now);
    return this.transaction(index, input.operationId, fp, input.now, (scope) => {
      const record = scope.records?.[input.bindingId];
      if (!record) return result(input.operationId, fp, 'not-found', input.now);
      if (record.recordRevision !== input.expectedRecordRevision
        || record.status !== 'draft'
        || (input.expectedCurrentBindingId !== undefined
          && scope.current?.bindingId !== input.expectedCurrentBindingId)
        || (scope.current && scope.current.bindingId !== input.bindingId)) {
        return result(input.operationId, fp, 'conflict', input.now, record, scope.current);
      }
      const active = activeRecord(record, input.now);
      scope.records = { ...(scope.records ?? {}), [input.bindingId]: active };
      scope.current = pointerFor(active, input.now);
      return result(input.operationId, fp, 'activated', input.now, active, scope.current);
    });
  }

  async supersede(input: {
    binding: BookDeliveryBinding;
    expectedCurrentBindingId: string;
    operationId: string;
    now: string;
  }): Promise<BookDeliveryMutationResult> {
    assertOperationId(input.operationId);
    const validation = validateBookDeliveryBinding(input.binding);
    if (!validation.valid || input.binding.status !== 'draft') throw new Error('invalid_book_delivery_binding');
    const fp = operationFingerprint('supersede', input);
    const index = {
      recipientId: input.binding.recipient.recipientId,
      contextId: input.binding.context.contextId,
    };
    if (!await this.ensureIndex(input.binding.bindingId, index)) {
      return result(input.operationId, fp, 'conflict', input.now);
    }
    return this.transaction(index, input.operationId, fp, input.now, (scope) => {
      const old = scope.records?.[input.expectedCurrentBindingId];
      if (!scope.current
        || scope.current.bindingId !== input.expectedCurrentBindingId
        || !old
        || old.status !== 'active'
        || scope.records?.[input.binding.bindingId]) {
        return result(input.operationId, fp, 'conflict', input.now, old, scope.current);
      }
      const next: BookDeliveryRecord = {
        binding: { ...clone(input.binding), status: 'active' },
        recordRevision: 0,
        status: 'active',
        createdAt: input.now,
        updatedAt: input.now,
      };
      scope.records = {
        ...(scope.records ?? {}),
        [old.binding.bindingId]: revokedRecord(old, input.now),
        [next.binding.bindingId]: next,
      };
      scope.current = pointerFor(next, input.now);
      return result(input.operationId, fp, 'superseded', input.now, next, scope.current);
    });
  }

  async revoke(input: {
    bindingId: string;
    expectedRecordRevision: number;
    expectedCurrentBindingId: string;
    operationId: string;
    now: string;
  }): Promise<BookDeliveryMutationResult> {
    assertOperationId(input.operationId);
    const fp = operationFingerprint('revoke', input);
    const index = parseIndex(await this.rtdb.readValue(bindingPath(input.bindingId)));
    if (!index) return result(input.operationId, fp, 'not-found', input.now);
    return this.transaction(index, input.operationId, fp, input.now, (scope) => {
      const record = scope.records?.[input.bindingId];
      if (!record
        || !scope.current
        || scope.current.bindingId !== input.expectedCurrentBindingId
        || input.bindingId !== input.expectedCurrentBindingId
        || record.recordRevision !== input.expectedRecordRevision
        || record.status !== 'active') {
        return result(input.operationId, fp, 'conflict', input.now, record, scope.current);
      }
      const revoked = revokedRecord(record, input.now);
      scope.records = { ...(scope.records ?? {}), [input.bindingId]: revoked };
      delete scope.current;
      return result(input.operationId, fp, 'revoked', input.now, revoked);
    });
  }

  private async ensureIndex(bindingId: string, expected: BindingIndex): Promise<boolean> {
    assertId(bindingId, 'binding_id');
    for (let attempt = 0; attempt < (this.options.maxRetries ?? MAX_RETRIES); attempt += 1) {
      const current = await this.rtdb.readWithEtag<unknown>(bindingPath(bindingId));
      const parsed = parseIndex(current.data);
      if (parsed) {
        return parsed.recipientId === expected.recipientId && parsed.contextId === expected.contextId;
      }
      if (current.data !== null) return false;
      if (await this.rtdb.writeIfMatch(bindingPath(bindingId), expected, current.etag)) return true;
    }
    throw new Error('book_delivery_index_cas_retries_exhausted');
  }

  private async transaction(
    index: BindingIndex,
    operationId: string,
    fingerprint: string,
    now: string,
    mutate: (scope: { records?: Record<string, BookDeliveryRecord>; current?: BookDeliveryCurrentPointer; operations?: Record<string, PersistedOperation> }) => BookDeliveryMutationResult,
  ): Promise<BookDeliveryMutationResult> {
    for (let attempt = 0; attempt < (this.options.maxRetries ?? MAX_RETRIES); attempt += 1) {
      const current = await this.rtdb.readWithEtag<unknown>(
        scopePath(index.recipientId, index.contextId),
      );
      const scope = parseScope(current.data);
      const replayed = replay(scope.operations?.[operationId], fingerprint);
      if (replayed) return replayed;
      const output = mutate(scope);
      const stored: PersistedOperation = { fingerprint, result: clone(output) };
      const retained = Object.entries(scope.operations ?? {})
        .slice(-(MAX_OPERATIONS_PER_SCOPE - 1));
      scope.operations = { ...Object.fromEntries(retained), [operationId]: stored };
      const next = parseScope(scope);
      if (await this.rtdb.writeIfMatch(
        scopePath(index.recipientId, index.contextId),
        next,
        current.etag,
      )) return output;
    }
    throw new Error('book_delivery_scope_cas_retries_exhausted');
  }
}
