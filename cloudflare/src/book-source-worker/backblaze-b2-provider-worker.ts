import { resolveBackblazeB2ProviderWiring } from './backblaze-b2-provider-wiring';

const noStoreJson = (status: number, code: string): Response => new Response(
  JSON.stringify({ code }),
  {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  },
);

/**
 * Compile-only production seam. It deliberately exposes no browser transfer,
 * read, metadata, upload, or delete route; tickets 06A/06B own those handlers.
 */
export default {
  async fetch(_request: Request, env: Record<string, unknown>): Promise<Response> {
    try {
      const wiring = resolveBackblazeB2ProviderWiring(env);
      if (wiring.state === 'disabled') {
        return noStoreJson(503, 'book_source_b2_provider_unavailable');
      }
      return noStoreJson(404, 'not_found');
    } catch {
      return noStoreJson(503, 'book_source_b2_provider_unavailable');
    }
  },
};
