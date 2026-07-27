import { describe, expect, it } from 'vitest';
import wranglerSource from '../wrangler.jsonc?raw';
import {
  canonicalBookRouteManifest,
  normalizeBookRouteTemplate,
  validateBookRouteManifest,
} from '../src/upload-worker/book-routes/manifest.ts';

const wranglerConfig = () => JSON.parse(wranglerSource) as { vars: Record<string, string> };

describe('canonical Book route contract catalog', () => {
  it('covers every contributor exactly once', () => {
    const contributorRoutes = canonicalBookRouteManifest.filter((route) => route.source === 'contributor');
    expect(contributorRoutes).toHaveLength(18);
    expect(contributorRoutes.filter((route) => route.contributorTicket === '#31')).toHaveLength(5);
    expect(contributorRoutes.filter((route) => route.contributorTicket === '#35')).toHaveLength(5);
    expect(contributorRoutes.filter((route) => route.contributorTicket === '#55')).toHaveLength(5);
    expect(contributorRoutes.filter((route) => route.contributorTicket === '#74')).toHaveLength(1);
    expect(contributorRoutes.filter((route) => route.contributorTicket === '#51/#52')).toHaveLength(1);
    expect(contributorRoutes.filter((route) => route.contributorTicket === '#58')).toHaveLength(1);
    expect(new Set(contributorRoutes.map((route) => route.id)).size).toBe(18);
  });

  it('registers all future boundaries as disabled seams', () => {
    const future = canonicalBookRouteManifest.filter((route) => route.source === 'future-seam');
    expect(future).toHaveLength(7);
    expect(new Set(future.map((route) => route.domain))).toEqual(new Set([
      'homework', 'evaluation-history', 'integrity', 'notifications',
      'impact-snapshot', 'updates', 'replacement-cleanup',
    ]));
    expect(future.every((route) => route.gateDefault === 'disabled')).toBe(true);
    expect(future.every((route) => route.gateEnv.endsWith('_ROUTES_ENABLED'))).toBe(true);
  });

  it('keeps canonical routes away from backup, public B2, bearer, and paid targets', () => {
    const serialized = JSON.stringify(canonicalBookRouteManifest).toLowerCase();
    expect(serialized).not.toContain('backup');
    expect(serialized).not.toContain('public b2');
    expect(serialized).not.toContain('bearer');
    expect(serialized).not.toContain('paid pdf');
  });

  it('uses dedicated contributor identities and credentials', () => {
    const forTicket = (ticket: string) => canonicalBookRouteManifest.filter(
      (route) => route.contributorTicket === ticket,
    );
    expect(new Set(forTicket('#31').map((route) => route.identityEnv))).toEqual(new Set(['BOOK_DELIVERY_SERVICE_IDENTITY']));
    expect(new Set(forTicket('#31').map((route) => route.credentialEnv))).toEqual(new Set(['BOOK_DELIVERY_GOOGLE_SA_KEY']));
    expect(new Set(forTicket('#35').map((route) => route.identityEnv))).toEqual(new Set(['BOOK_ACTIVITY_AUTHORING_SERVICE_IDENTITY']));
    expect(new Set(forTicket('#35').map((route) => route.credentialEnv))).toEqual(new Set(['BOOK_ACTIVITY_AUTHORING_GOOGLE_SA_KEY']));
    expect(new Set(forTicket('#55').map((route) => route.identityEnv))).toEqual(new Set(['BOOK_ASSEMBLY_SERVICE_IDENTITY']));
    expect(new Set(forTicket('#55').map((route) => route.credentialEnv))).toEqual(new Set(['BOOK_ASSEMBLY_GOOGLE_SA_KEY']));
    expect(new Set(forTicket('#74').map((route) => route.identityEnv))).toEqual(new Set(['BOOK_RUNTIME_SERVICE_IDENTITY']));
    expect(new Set(forTicket('#74').map((route) => route.credentialEnv))).toEqual(new Set(['BOOK_RUNTIME_GOOGLE_SA_KEY']));
  });

  it('registers runtime command route as a disabled student contributor seam', () => {
    expect(canonicalBookRouteManifest.find((route) => route.id === 'book.runtime.command')).toEqual(expect.objectContaining({
      methods: ['POST'],
      pathTemplate: '/book-runtime/commands',
      owner: '#74',
      domain: 'runtime',
      handler: 'bookRuntime.command',
      firebaseAuth: 'firebase-id-token-student',
      gateEnv: 'BOOK_RUNTIME_ROUTES_ENABLED',
      identityEnv: 'BOOK_RUNTIME_SERVICE_IDENTITY',
      credentialEnv: 'BOOK_RUNTIME_GOOGLE_SA_KEY',
      contributorTicket: '#74',
    }));
  });

  it('registers document routes with exact GET/HEAD methods and bounded document response limits', () => {
    const studentDocument = canonicalBookRouteManifest.find(
      (route) => route.id === 'book.document-delivery.serve-authorized-document',
    );
    const teacherDocument = canonicalBookRouteManifest.find(
      (route) => route.id === 'book.document-delivery.serve-teacher-assembly-document',
    );

    expect(studentDocument).toEqual(expect.objectContaining({
      methods: ['GET', 'HEAD'],
      pathTemplate: '/v1/book-delivery/document/:opaqueRouteKey',
      owner: '#51/#52',
      gateEnv: 'BOOK_DOCUMENT_DELIVERY_ROUTES_ENABLED',
      identityEnv: 'BOOK_DELIVERY_SERVICE_IDENTITY',
      credentialEnv: 'BOOK_DELIVERY_GOOGLE_SA_KEY',
      responseLimitBytes: 500 * 1024 * 1024,
    }));
    expect(teacherDocument).toEqual(expect.objectContaining({
      methods: ['GET', 'HEAD'],
      owner: '#58',
      gateEnv: 'BOOK_TEACHER_ASSEMBLY_DOCUMENT_ROUTES_ENABLED',
      identityEnv: 'BOOK_ASSEMBLY_SERVICE_IDENTITY',
      credentialEnv: 'BOOK_ASSEMBLY_GOOGLE_SA_KEY',
      responseLimitBytes: 500 * 1024 * 1024,
    }));
  });

  it('keeps every manifest gate disabled in wrangler source configuration', () => {
    const vars = wranglerConfig().vars;
    for (const gate of new Set(canonicalBookRouteManifest.map((route) => route.gateEnv))) {
      expect(vars[gate]).toBe('disabled');
    }
  });

  it('normalizes parameter names for ambiguity checks', () => {
    expect(normalizeBookRouteTemplate('/book/:bookId/units/:unitKey')).toBe('/book/:param/units/:param');
  });

  it.each([
    ['duplicate id', (manifest: any[]) => [...manifest, { ...manifest[0] }]],
    ['duplicate method and path', (manifest: any[]) => [...manifest, { ...manifest[0], id: 'new-id' }]],
    ['ambiguous normalized template', (manifest: any[]) => [
      ...manifest,
      {
        ...manifest.find((route) => route.pathTemplate.includes(':recipientId')),
        id: 'new-id',
        pathTemplate: manifest.find((route) => route.pathTemplate.includes(':recipientId')).pathTemplate.replace(':recipientId', ':differentId'),
      },
    ]],
    ['ambiguous literal and parameter template', (manifest: any[]) => [
      ...manifest,
      {
        ...manifest.find((route) => route.pathTemplate.includes(':recipientId')),
        id: 'new-id',
        pathTemplate: '/book-delivery/current/fixed-recipient/:contextId',
      },
    ]],
    ['invalid methods', (manifest: any[]) => [{ ...manifest[0], methods: ['CONNECT'] }, ...manifest.slice(1)]],
    ['invalid auth', (manifest: any[]) => [{ ...manifest[0], firebaseAuth: 'none' }, ...manifest.slice(1)]],
    ['invalid rate', (manifest: any[]) => [{ ...manifest[0], rateClass: 'unlimited' }, ...manifest.slice(1)]],
    ['invalid gate', (manifest: any[]) => [{ ...manifest[0], gateEnv: 'BOOK_ROUTES_ENABLED' }, ...manifest.slice(1)]],
    ['invalid limits', (manifest: any[]) => [{ ...manifest[0], requestBodyBytes: -1 }, ...manifest.slice(1)]],
    ['invalid domain', (manifest: any[]) => [{ ...manifest[0], domain: 'missing-domain' }, ...manifest.slice(1)]],
    ['missing fixed domain', (manifest: any[]) => manifest.filter((route) => route.domain !== 'homework')],
  ])('rejects %s', (_name, mutate) => {
    expect(() => validateBookRouteManifest(mutate([...canonicalBookRouteManifest] as any))).toThrow();
  });
});
