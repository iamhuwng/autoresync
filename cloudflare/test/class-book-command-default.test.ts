import { decodeJwt, exportPKCS8, generateKeyPair } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { createBookRouteHandlers } from '../src/upload-worker/book-route-handlers.ts';

describe('default canonical Class command composition', () => {
  it('registers the teacher lock command and writes its receipt and canonical lock using Class103 credentials', async () => {
    const identity = 'class-command@example.iam.gserviceaccount.com';
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });
    const key = JSON.stringify({ client_email: identity, private_key: await exportPKCS8(privateKey) });
    let claims: Record<string, unknown> | undefined;
    let patch: Record<string, unknown> | undefined;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.includes('identitytoolkit.googleapis.com')) {
        const payload = decodeJwt(JSON.parse(String(init?.body)).token);
        expect(payload.uid).toBe('teacher-1');
        claims = payload.claims as Record<string, unknown>;
        return Response.json({ idToken: 'class-command-id-token', expiresIn: '3600' });
      }
      expect(init?.method).toBe('PATCH');
      expect(new URL(url).searchParams.get('auth')).toBe('class-command-id-token');
      expect(new Headers(init?.headers).has('Authorization')).toBe(false);
      patch = JSON.parse(String(init?.body));
      return Response.json({});
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const handlers = createBookRouteHandlers();
      const result = await handlers['classBookPlacement.lock']!({
        uid: 'teacher-1', params: {}, descriptor: {} as never,
        request: new Request('https://worker.test/v1/class-book-placement/lock', {
          method: 'POST', body: JSON.stringify({ operationId: 'lock-operation', classId: 'class-1',
            classPlacementId: 'placement-1', state: 'locked', expectedRevision: 0 }),
        }),
        env: {
          BOOK_CLASS_BOOK_PLACEMENT_ROUTES_ENABLED: 'enabled', BOOK_DELIVERY_GOOGLE_SA_KEY: key,
          BOOK_DELIVERY_SERVICE_IDENTITY: identity, FIREBASE_PROJECT_ID: 'project-1',
          FIREBASE_WEB_API_KEY: 'key-1', FIREBASE_DB_URL: 'https://firebase.test',
          readDatabaseValue: async (path: string) => path === 'classes/class-1'
            ? { createdBy: 'teacher-1', status: 'active' } : null,
        },
      });
      expect(result, JSON.stringify(result)).toMatchObject({ init: { status: 200 } });
      expect(claims).toMatchObject({ classBookAuthority103: true, classBookOperation: 'lock',
        actorUid: 'teacher-1', classId: 'class-1', classPlacementId: 'placement-1', expectedRevision: 0, nextRevision: 1 });
      expect(Object.keys(patch!)).toEqual(['class_book_authority/operations/lock-operation', 'classes/class-1/book_locks/placement-1']);
      expect(patch!['class_book_authority/operations/lock-operation']).toMatchObject({ kind: 'lock',
        outcome: patch!['classes/class-1/book_locks/placement-1'] });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally { vi.unstubAllGlobals(); }
  });
});
