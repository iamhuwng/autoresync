import {
  BOOK_IMPACT_DISCOVERY_MAX_CONTEXTS,
  containsBookImpactSensitiveKey,
  freezeBookImpactValue,
  type BookImpactDiscoveryResult,
} from '../../../../../src/services/book-delivery/bookImpactDiscovery.types.ts';

export const BOOK_IMPACT_DISCOVERY_RESPONSE_LIMIT_BYTES = 256 * 1024 as const;

export type BookImpactDiscoveryHttpProjection =
  | { readonly ok: true; readonly status: 200; readonly body: BookImpactDiscoveryResult }
  | { readonly ok: false; readonly status: 400 | 401 | 403 | 409 | 413; readonly code: string };

const statusFor = (result: BookImpactDiscoveryResult): 400 | 401 | 403 | 409 => {
  if (result.status !== 'blocked') return 400;
  if (result.code === 'invalid-actor' || result.code === 'unauthorized') return 403;
  if (result.code === 'stale' || result.code === 'ambiguous') return 409;
  return 400;
};
/**
 * Serializes only a bounded immutable 39B result.  The response helper does
 * not turn a blocked/uncertain result into an empty success projection.
 */
export const projectBookImpactDiscoveryResponse = (
  result: BookImpactDiscoveryResult,
): BookImpactDiscoveryHttpProjection => {
  if (result.status === 'blocked') {
    return { ok: false, status: statusFor(result), code: result.code };
  }
  if (result.impacts.length > BOOK_IMPACT_DISCOVERY_MAX_CONTEXTS
    || containsBookImpactSensitiveKey(result)) {
    return { ok: false, status: 413, code: 'book_impact_discovery_unbounded_or_sensitive' };
  }
  const frozen = freezeBookImpactValue(result);
  const bytes = new TextEncoder().encode(JSON.stringify(frozen)).byteLength;
  if (bytes > BOOK_IMPACT_DISCOVERY_RESPONSE_LIMIT_BYTES) {
    return { ok: false, status: 413, code: 'book_impact_discovery_response_too_large' };
  }
  return { ok: true, status: 200, body: frozen };
};
