import { describe, expect, it } from 'vitest';
import { createTeacherAssemblyPreviewWorker } from '../src/upload-worker/book-delivery/teacher-assembly-preview-worker.js';

const ROUTE = 'https://ticket58.test/v1/book-delivery/teacher-assembly/prd0062-ticket56-book/unit-fixture/candidate-ticket56/1/full/source-full-ready/4/7';
const UID = 'ticket58-owner';

const verifier = {
  verifyAuthorizationHeader: async (authorization: string | null) =>
    authorization === 'Bearer valid-token'
      ? { valid: true, uid: UID, email: 'teacher@test.com', emailVerified: true }
      : { valid: false, reason: 'invalid-token' },
};

const env = (state: 'active' | 'revoked' | 'disabled') => ({
  FIREBASE_PROJECT_ID: 'temp-a1437',
  TICKET58_ALLOWED_OWNER_EMAIL: 'teacher@test.com',
  TICKET58_ASSEMBLY_STATE: state,
  CF_VERSION_METADATA: { id: `version-${state}` },
});

const request = (init: RequestInit = {}) => new Request(ROUTE, {
  ...init,
  headers: {
    authorization: 'Bearer valid-token',
    origin: 'http://localhost:5173',
    ...init.headers,
  },
});

describe('PRD0062 #58 isolated deployed-preview worker', () => {
  it('serves HEAD, GET, and bounded ranges only after exact owner authority', async () => {
    const worker = createTeacherAssemblyPreviewWorker({ verifier });

    const head = await worker.fetch(request({ method: 'HEAD' }), env('active'));
    expect(head.status).toBe(200);
    expect(head.headers.get('x-ticket58-provider-calls')).toBe('1');
    expect(head.headers.get('content-length')).toBe('3110');

    const range = await worker.fetch(request({
      headers: {
        authorization: 'Bearer valid-token',
        origin: 'http://localhost:5173',
        range: 'bytes=0-3',
      },
    }), env('active'));
    expect(range.status).toBe(206);
    expect(range.headers.get('content-range')).toBe('bytes 0-3/3110');
    expect(range.headers.get('x-ticket58-provider-calls')).toBe('2');
    expect(await range.text()).toBe('%PDF');
  });

  it('denies owner loss, revocation, and rollback-disable before provider work', async () => {
    const worker = createTeacherAssemblyPreviewWorker({ verifier });

    const wrongOwner = await worker.fetch(
      request(),
      { ...env('active'), TICKET58_ALLOWED_OWNER_EMAIL: 'other-owner@test.com' },
    );
    expect(wrongOwner.status).toBe(403);
    expect(wrongOwner.headers.get('x-ticket58-provider-calls')).toBe('0');

    const revoked = await worker.fetch(request(), env('revoked'));
    expect(revoked.status).toBe(403);
    expect(revoked.headers.get('x-ticket58-provider-calls')).toBe('0');

    const disabled = await worker.fetch(request(), env('disabled'));
    expect(disabled.status).toBe(503);
    expect(disabled.headers.get('x-ticket58-provider-calls')).toBe('0');
  });

  it('exposes only safe deployment state and version readback', async () => {
    const worker = createTeacherAssemblyPreviewWorker({ verifier });
    const response = await worker.fetch(
      new Request('https://ticket58.test/__ticket58/status'),
      env('active'),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'available',
      assemblyState: 'active',
      ownerAuthorityConfigured: true,
      pdfByteLength: 3110,
      versionId: 'version-active',
    });
  });
});
