import type { BookRuntimeCommandPayload } from '../../../../src/services/book-activity/activityRuntimeAttempt.types.ts';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 32 * 1024;
const MAX_RESPONSE_DEPTH = 8;
const MAX_RESPONSE_KEYS = 64;
const MAX_RESPONSE_ARRAY_ITEMS = 128;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const kinds = new Set(['state', 'autosave', 'submit']);

export class BookRuntimeCommandSchemaError extends Error {
  constructor(readonly code: string, readonly status = 400) {
    super(code);
    this.name = 'BookRuntimeCommandSchemaError';
  }
}

const plain = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const exact = (value: Record<string, unknown>, keys: readonly string[]): void => {
  if (Object.keys(value).some((key) => !keys.includes(key))) {
    throw new BookRuntimeCommandSchemaError('runtime_command_unknown_field');
  }
  for (const key of keys) {
    if (!Object.prototype.propertyIsEnumerable.call(value, key)) {
      throw new BookRuntimeCommandSchemaError('runtime_command_missing_field');
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) {
      throw new BookRuntimeCommandSchemaError('runtime_command_invalid_field');
    }
  }
};

const id = (value: unknown, code: string): string => {
  if (typeof value !== 'string' || !ID.test(value)) throw new BookRuntimeCommandSchemaError(code);
  return value;
};

const uuid = (value: unknown): string => {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new BookRuntimeCommandSchemaError('runtime_command_invalid_operation');
  }
  return value;
};

const revision = (value: unknown, code: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new BookRuntimeCommandSchemaError(code);
  }
  return value as number;
};

const positive = (value: unknown, code: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new BookRuntimeCommandSchemaError(code);
  }
  return value as number;
};

const assertNoForbiddenPayload = (value: unknown): void => {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    throw new BookRuntimeCommandSchemaError('runtime_command_invalid_response');
  }
  const inspect = (candidate: unknown, depth: number): void => {
    if (candidate === undefined
      || typeof candidate === 'function'
      || typeof candidate === 'symbol'
      || typeof candidate === 'bigint'
      || (typeof candidate === 'number' && !Number.isFinite(candidate))) {
      throw new BookRuntimeCommandSchemaError('runtime_command_invalid_response');
    }
    if (depth > MAX_RESPONSE_DEPTH) {
      throw new BookRuntimeCommandSchemaError('runtime_command_invalid_response');
    }
    if (Array.isArray(candidate)) {
      if (candidate.length > MAX_RESPONSE_ARRAY_ITEMS) {
        throw new BookRuntimeCommandSchemaError('runtime_command_invalid_response');
      }
      for (const item of candidate) inspect(item, depth + 1);
      return;
    }
    const object = plain(candidate);
    if (!object) return;
    const keys = Object.keys(object);
    if (keys.length > MAX_RESPONSE_KEYS) {
      throw new BookRuntimeCommandSchemaError('runtime_command_invalid_response');
    }
    for (const key of keys) {
      if (!Object.prototype.propertyIsEnumerable.call(object, key)) {
        throw new BookRuntimeCommandSchemaError('runtime_command_invalid_response');
      }
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      if (!descriptor || !('value' in descriptor)) {
        throw new BookRuntimeCommandSchemaError('runtime_command_invalid_response');
      }
      inspect(descriptor.value, depth + 1);
    }
  };
  inspect(value, 0);
  const encoded = JSON.stringify(value);
  if (encoded === undefined || encoded.length > MAX_RESPONSE_BYTES) {
    throw new BookRuntimeCommandSchemaError('runtime_command_response_too_large', 413);
  }
  if (/(?:answerKey|pdfBytes|providerAuthority|credentials|privateObjectKey|storageKey|token|secret)/iu.test(encoded)) {
    throw new BookRuntimeCommandSchemaError('runtime_command_forbidden_payload');
  }
};

export const readBookRuntimeCommandPayload = async (request: Request): Promise<BookRuntimeCommandPayload> => {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new BookRuntimeCommandSchemaError('content_type_required');
  }
  const claimedLength = request.headers.get('content-length');
  if (claimedLength !== null
    && (!/^\d+$/u.test(claimedLength) || Number(claimedLength) > MAX_BODY_BYTES)) {
    throw new BookRuntimeCommandSchemaError('runtime_command_body_too_large', 413);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new BookRuntimeCommandSchemaError('runtime_command_body_too_large', 413);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BookRuntimeCommandSchemaError('runtime_command_invalid_json');
  }
  const record = plain(parsed);
  if (!record) throw new BookRuntimeCommandSchemaError('runtime_command_invalid_request');
  exact(record, [
    'activityId',
    'activityVersion',
    'bindingId',
    'bindingRevision',
    'clientRevision',
    'commandKind',
    'contextId',
    'interactionId',
    'operationId',
    'placementId',
    'response',
  ]);
  if (typeof record.commandKind !== 'string' || !kinds.has(record.commandKind)) {
    throw new BookRuntimeCommandSchemaError('runtime_command_unsupported_kind');
  }
  assertNoForbiddenPayload(record.response);
  return {
    operationId: uuid(record.operationId),
    commandKind: record.commandKind as BookRuntimeCommandPayload['commandKind'],
    bindingId: id(record.bindingId, 'runtime_command_invalid_binding'),
    bindingRevision: revision(record.bindingRevision, 'runtime_command_invalid_binding_revision'),
    contextId: id(record.contextId, 'runtime_command_invalid_context'),
    placementId: id(record.placementId, 'runtime_command_invalid_placement'),
    activityId: id(record.activityId, 'runtime_command_invalid_activity'),
    activityVersion: positive(record.activityVersion, 'runtime_command_invalid_activity_version'),
    interactionId: id(record.interactionId, 'runtime_command_invalid_interaction'),
    clientRevision: revision(record.clientRevision, 'runtime_command_invalid_client_revision'),
    response: structuredClone(record.response),
  };
};
