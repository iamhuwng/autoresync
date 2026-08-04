import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTicket20AOverrideProxy } from '../lib/prd0062-ticket20a/overrideProxy.mjs';

const VERSION_ID = 'ad031fdc-2a17-4df5-a798-4c5bf44376a6';
const openServers = new Set();

afterEach(async () => {
  await Promise.all([...openServers].map((server) => new Promise((resolve) => server.close(resolve))));
  openServers.clear();
});

const start = async (fetchImpl = vi.fn()) => {
  const server = createTicket20AOverrideProxy({ versionId: VERSION_ID, fetchImpl });
  openServers.add(server);
  server.listen(0, 'localhost');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing_proxy_address');
  return { fetchImpl, origin: `http://localhost:${address.port}` };
};

describe('PRD0062 ticket 20A zero-percent override proxy', () => {
  it('forwards only exact successor routes with version override and opaque authorization', async () => {
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({ status: 'created' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    const current = await start(fetchImpl);
    const response = await fetch(`${current.origin}/api/material-books/successors/create`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer opaque-token',
        'Content-Type': 'application/json',
        'Idempotency-Key': '00000000-0000-4000-8000-000000000001',
        Origin: 'http://localhost:5173',
      },
      body: JSON.stringify({ operationId: '00000000-0000-4000-8000-000000000001' }),
    });

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer opaque-token',
      'Cloudflare-Workers-Version-Overrides': `r2-upload-signer="${VERSION_ID}"`,
      'Idempotency-Key': '00000000-0000-4000-8000-000000000001',
    });
  });

  it('rejects wrong origins, wrong routes, wrong methods, and oversized bodies locally', async () => {
    const current = await start(vi.fn());
    const wrongOrigin = await fetch(`${current.origin}/api/material-books/successors/create`, {
      method: 'POST',
      headers: { Origin: 'https://attacker.example' },
      body: '{}',
    });
    const wrongRoute = await fetch(`${current.origin}/api/other`, {
      method: 'POST',
      headers: { Origin: 'http://localhost:5173' },
      body: '{}',
    });
    const wrongMethod = await fetch(`${current.origin}/api/material-books/successors/create`, {
      method: 'GET',
      headers: { Origin: 'http://localhost:5173' },
    });
    const tooLarge = await fetch(`${current.origin}/api/material-books/successors/create`, {
      method: 'POST',
      headers: { Origin: 'http://localhost:5173' },
      body: 'x'.repeat((256 * 1024) + 1),
    });

    await expect(wrongOrigin.json()).resolves.toEqual({ code: 'origin_forbidden' });
    await expect(wrongRoute.json()).resolves.toEqual({ code: 'not_found' });
    await expect(wrongMethod.json()).resolves.toEqual({ code: 'method_not_allowed' });
    await expect(tooLarge.json()).resolves.toEqual({ code: 'body_too_large' });
    expect(current.fetchImpl).not.toHaveBeenCalled();
  });
});
