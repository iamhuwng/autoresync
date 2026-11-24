const errors = {
  invalid_request: 400,
  teacher_required: 403,
  draft_audio_not_found: 404,
  connection_not_found: 404,
  revoked_connection: 410,
  archived_connection: 409,
  generation_conflict: 409,
  rotation_scope_changed: 409,
  use_rotation: 409,
  connection_limit: 409,
  connection_in_use: 409,
  invalid_key: 422,
  insufficient_capabilities: 422,
  wrong_bucket: 422,
  wrong_prefix: 422,
  private_bucket_required: 422,
  object_missing: 404,
  object_changed: 409,
  unsupported_audio: 422,
  oversized_audio: 422,
  provider_rate_limited: 429,
  provider_unavailable: 503,
  store_unavailable: 503,
  restore_in_progress: 503,
  playback_denied: 403,
  audio_unavailable: 422,
  audio_required: 422,
  draft_changed: 409,
} as const;

export type AudioErrorCode = keyof typeof errors;
export const isAudioErrorCode = (value: unknown): value is AudioErrorCode =>
  typeof value === 'string' && Object.hasOwn(errors, value);

export class ExternalAudioError extends Error {
  readonly status: number;

  constructor(readonly code: AudioErrorCode) {
    super(code);
    this.status = errors[code];
  }
}

export function fail(code: AudioErrorCode): never {
  throw new ExternalAudioError(code);
}

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function rootHttpsUrl(value: unknown): URL | undefined {
  if (typeof value !== 'string') return;
  const url = URL.parse(value);
  if (url?.protocol === 'https:' && (value === url.origin || value === `${url.origin}/`) && !url.port) return url;
}

export async function readJson(
  message: Request | Response,
  limit: number,
  error: AudioErrorCode,
): Promise<unknown> {
  if (!message.body) fail(error);
  const reader = message.body.getReader();
  const buffer = new Uint8Array(limit);
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (length + value.byteLength > limit) fail(error);
      buffer.set(value, length);
      length += value.byteLength;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length)));
  } catch {
    return fail(error);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export const OWNER_ID = /^[A-Za-z0-9_:-]{1,128}$/u;
export const CONNECTION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
export const PROVIDER_ID = /^[A-Za-z0-9_-]{1,512}$/u;
