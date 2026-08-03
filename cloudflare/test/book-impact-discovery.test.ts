import { describe, expect, it, vi } from 'vitest';
import fragment39B from '../src/upload-worker/book-rules/fragments/39B.json';
import {
  authorizeBookHomeworkImpactRead,
  authorizeBookSoloImpactRead,
} from '../src/upload-worker/book-delivery/impact-discovery/authorization.ts';
import {
  createBookImpactDiscoveryReadRepository,
} from '../src/upload-worker/book-delivery/impact-discovery/repository.ts';
import {
  createBookImpactDiscoveryRoute,
} from '../src/upload-worker/book-delivery/impact-discovery/route.ts';
import {
  bookImpactDiscoveryRouteDescriptor,
} from '../src/upload-worker/book-delivery/route.ts';

const at = '2026-08-01T00:00:00.000Z';

describe('39B Worker impact discovery boundary', () => {
  it('publishes one fixed 09D seam descriptor without activating dispatch', () => {
    expect(bookImpactDiscoveryRouteDescriptor).toMatchObject({
      method: 'GET',
      path: '/v1/book-impact/discovery/:contextKind',
      handler: 'readImpactDiscovery',
      gate: 'BOOK_IMPACT_DISCOVERY_ROUTES_ENABLED-default-disabled',
      requestBodyBytes: 0,
    });
    expect(bookImpactDiscoveryRouteDescriptor.owner).toContain('#101');
    expect(bookImpactDiscoveryRouteDescriptor.destination).toContain('#59');
  });

  it('keeps the rules fragment read-only, owner-scoped, and not an assembled root', () => {
    expect(fragment39B.ticketId).toBe('39B');
    expect(fragment39B.owner.issue).toBe(101);
    expect([...fragment39B.owner.generatedRuleLocations].sort()).toEqual(
      fragment39B.operations.map((operation) => `${operation.path}/${operation.rule}`).sort(),
    );
    expect(fragment39B.operations.every((operation) => (
      operation.rule === '.read' || operation.expression === 'false'
    ))).toBe(true);
    expect(fragment39B.operations.every((operation) => !operation.path.includes('database.rules'))).toBe(true);
    expect(JSON.stringify(fragment39B)).not.toMatch(/answer|pdfBytes|credential|privateObjectKey|mutation/iu);
    expect(fragment39B.operations
      .filter((operation) => operation.rule === '.read' && operation.path.includes('$ownerId'))
      .every((operation) => operation.expression.includes('book_impact_ownerId'))).toBe(true);
  });

  it('rejects invalid identity before any indexed read', () => {
    expect(authorizeBookSoloImpactRead({ actorId: '../other' })).toMatchObject({
      authorized: false,
      code: 'invalid-actor',
    });
    expect(authorizeBookHomeworkImpactRead({ actorId: 'teacher-1', maxContexts: 101 })).toMatchObject({
      authorized: false,
      code: 'uncertain',
    });
  });

  it('performs authorization before a bounded owner read and exposes no mutation method', async () => {
    const calls: string[] = [];
    const store = {
      authorize: vi.fn(async ({ contextKind }: { contextKind: 'solo' | 'homework' }) => {
        calls.push(`authorize:${contextKind}`);
        return contextKind === 'solo'
          ? authorizeBookSoloImpactRead({ actorId: 'student-1' })
          : authorizeBookHomeworkImpactRead({ actorId: 'teacher-1' });
      }),
      readOwnedContexts: vi.fn(async ({ contextKind, limit }: { contextKind: 'solo' | 'homework'; limit: number }) => {
        calls.push(`read:${contextKind}:${limit}`);
        return { contexts: [], complete: true as const };
      }),
    };
    const repository = createBookImpactDiscoveryReadRepository(store);
    const result = await repository.discover('solo', { actorId: 'student-1', evaluatedAt: at, limit: 2 });
    expect(result).toMatchObject({ status: 'ok', impacts: [] });
    expect(calls).toEqual(['authorize:solo', 'read:solo:2']);
    expect(repository).not.toHaveProperty('write');
  });

  it('keeps the GET route read-only and default-compatible', async () => {
    const store = {
      authorize: async () => authorizeBookSoloImpactRead({ actorId: 'student-1' }),
      readOwnedContexts: async () => ({ contexts: [], complete: true as const }),
    };
    const route = createBookImpactDiscoveryRoute(store);
    const response = await route.read({
      uid: 'student-1',
      request: new Request(`https://worker.test/v1/book-impact/discovery/solo?at=${encodeURIComponent(at)}`),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok', contextKind: 'solo' });
    const post = await route.read({
      uid: 'student-1',
      request: new Request(`https://worker.test/v1/book-impact/discovery/solo?at=${encodeURIComponent(at)}`, { method: 'POST' }),
    });
    expect(post.status).toBe(403);
  });
});
