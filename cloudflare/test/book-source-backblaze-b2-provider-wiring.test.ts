import { describe, expect, it, vi } from 'vitest';

import config from '../wrangler.book-source-b2.jsonc?raw';
import worker from '../src/book-source-worker/backblaze-b2-provider-worker';
import {
  BOOK_SOURCE_B2_PROVIDER_STATES,
  resolveBackblazeB2ProviderWiring,
} from '../src/book-source-worker/backblaze-b2-provider-wiring';

const completeEnv = () => ({
  BOOK_SOURCE_B2_PROVIDER_STATE: 'enabled',
  BOOK_SOURCE_B2_ENDPOINT: 'https://s3.us-west-004.backblazeb2.com',
  BOOK_SOURCE_B2_REGION: 'us-west-004',
  BOOK_SOURCE_B2_STORAGE_LOCATION_ID: 'b2_book_primary',
  BOOK_SOURCE_B2_PRIVATE_BUCKET_ID: 'private-bucket-id',
  BOOK_SOURCE_B2_PRIVATE_BUCKET_NAME: 'private-book-pdfs',
  BOOK_SOURCE_B2_OBJECT_KEY_PREFIX: 'book-source/',
  BOOK_SOURCE_B2_UPLOAD_APPLICATION_KEY_ID: 'upload-key-id',
  BOOK_SOURCE_B2_UPLOAD_APPLICATION_KEY: 'upload-key-secret',
  BOOK_SOURCE_B2_METADATA_APPLICATION_KEY_ID: 'metadata-key-id',
  BOOK_SOURCE_B2_METADATA_APPLICATION_KEY: 'metadata-key-secret',
  BOOK_SOURCE_B2_READ_APPLICATION_KEY_ID: 'read-key-id',
  BOOK_SOURCE_B2_READ_APPLICATION_KEY: 'read-key-secret',
});

describe('Backblaze B2 production wiring', () => {
  it('defaults missing state to disabled without requiring or contacting B2', () => {
    const fetcher = vi.fn();
    expect(resolveBackblazeB2ProviderWiring({}, { fetch: fetcher })).toEqual({
      state: BOOK_SOURCE_B2_PROVIDER_STATES.disabled,
      provider: null,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('constructs only from complete enabled configuration and performs no remote call', () => {
    const fetcher = vi.fn();
    const wiring = resolveBackblazeB2ProviderWiring(completeEnv(), { fetch: fetcher });
    expect(wiring.state).toBe('enabled');
    expect(wiring.provider).not.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('fails closed for malformed state, partial binding sets, shared identities, and master-shaped IDs', () => {
    expect(() => resolveBackblazeB2ProviderWiring({ BOOK_SOURCE_B2_PROVIDER_STATE: 'true' }))
      .toThrow('source_provider_metadata_mismatch');
    expect(() => resolveBackblazeB2ProviderWiring({ BOOK_SOURCE_B2_PROVIDER_STATE: 'enabled' }))
      .toThrow('source_provider_metadata_mismatch');
    expect(() => resolveBackblazeB2ProviderWiring({
      ...completeEnv(),
      BOOK_SOURCE_B2_READ_APPLICATION_KEY_ID: 'upload-key-id',
    })).toThrow('source_provider_unauthorized');
    expect(() => resolveBackblazeB2ProviderWiring({
      ...completeEnv(),
      BOOK_SOURCE_B2_READ_APPLICATION_KEY_ID: 'master-key-id',
    })).toThrow('source_provider_unauthorized');
  });

  it('keeps the compile seam closed and exposes no provider operation route', async () => {
    const disabled = await worker.fetch(new Request('https://worker.test/anything'), {});
    expect(disabled.status).toBe(503);
    expect(disabled.headers.get('cache-control')).toBe('no-store');
    await expect(disabled.json()).resolves.toEqual({ code: 'book_source_b2_provider_unavailable' });

    const enabled = await worker.fetch(new Request('https://worker.test/anything'), completeEnv());
    expect(enabled.status).toBe(404);
    await expect(enabled.json()).resolves.toEqual({ code: 'not_found' });
  });

  it('keeps isolated Wrangler wiring B2-only and disabled', () => {
    expect(config).toContain('"BOOK_SOURCE_B2_PROVIDER_STATE": "disabled"');
    expect(config).toContain('BOOK_SOURCE_B2_UPLOAD_APPLICATION_KEY_ID');
    expect(config).toContain('BOOK_SOURCE_B2_METADATA_APPLICATION_KEY_ID');
    expect(config).toContain('BOOK_SOURCE_B2_READ_APPLICATION_KEY_ID');
    expect(config).not.toMatch(/r2_buckets|BOOK_SOURCE_R2|renderer|parser|split|page.rendition/iu);
    expect(config).not.toContain('routes');
  });
});
