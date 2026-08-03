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
  BOOK_IMPACT_DISCOVERY_ADAPTER_VERSION,
  BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION,
  BOOK_IMPACT_DISCOVERY_INPUT_VERSION,
  BOOK_IMPACT_DISCOVERY_OUTPUT_VERSION,
  type BookImpactDiscoveryContextKind,
  type BookImpactDiscoveryReadAdapterFactory,
  type BookImpactDiscoveryReadAdapters,
} from '../src/upload-worker/book-delivery/impact-discovery/contract.ts';
import {
  bookImpactDiscoveryRouteDescriptor,
} from '../src/upload-worker/book-delivery/route.ts';

const at = '2026-08-01T00:00:00.000Z';

/**
 * The isolated Worker test injects a local adapter factory.  In production,
 * #59 composition supplies the factories that conform to the root 39B
 * adapters; this test intentionally does not import the app source tree.
 */
const emptyReadAdapter = (
  adapterId: string,
  contextKind: BookImpactDiscoveryContextKind,
): BookImpactDiscoveryReadAdapterFactory => ({ reader }) => ({
  discover: async (query) => {
    const base = {
      contractVersion: BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION,
      inputVersion: BOOK_IMPACT_DISCOVERY_INPUT_VERSION,
      outputVersion: BOOK_IMPACT_DISCOVERY_OUTPUT_VERSION,
      adapterId,
      adapterVersion: BOOK_IMPACT_DISCOVERY_ADAPTER_VERSION,
      contextKind,
      evaluatedAt: query.evaluatedAt,
    } as const;
    const authorization = await reader.authorize({ actorId: query.actorId });
    if (!authorization.authorized) {
      return { ...base, status: 'blocked' as const, code: authorization.code };
    }
    const limit = query.limit ?? authorization.maxContexts;
    const page = await reader.readOwnedContexts({
      actorId: query.actorId,
      limit: Math.min(limit, authorization.maxContexts),
    });
    if (!page.complete || !Array.isArray(page.contexts) || page.contexts.length > limit) {
      return { ...base, status: 'blocked' as const, code: 'unbounded' as const };
    }
    return {
      ...base,
      status: 'ok' as const,
      impacts: [],
      replacementScopes: [],
    };
  },
});

const localAdapters: BookImpactDiscoveryReadAdapters = {
  solo: emptyReadAdapter('test-solo-impact', 'solo'),
  homework: emptyReadAdapter('test-homework-impact', 'homework'),
};

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
    const rootAndAncestor = fragment39B.operations.filter((operation) => (
      operation.path === 'book_impact_discovery'
      || operation.path === 'book_impact_discovery/scopes'
      || operation.path === 'book_impact_discovery/indexes'
    ));
    expect(rootAndAncestor.length).toBe(6);
    expect(rootAndAncestor.every((operation) => operation.expression === 'false')).toBe(true);
    expect(fragment39B.operations.filter((operation) => operation.rule === '.write')
      .every((operation) => operation.expression === 'false')).toBe(true);
    const scopedReads = fragment39B.operations.filter((operation) => (
      operation.rule === '.read' && operation.path.includes('$ownerId')
    ));
    expect(scopedReads).toHaveLength(2);
    expect(scopedReads.every((operation) => (
      operation.expression.includes('auth != null')
      && operation.expression.includes('book_impact_read_service')
      && operation.expression.includes('book_impact_ownerId')
      && operation.expression.includes('book_impact_contextKind')
    ))).toBe(true);
    expect(scopedReads.find((operation) => operation.path.includes('indexes/'))
      ?.expression).toContain('query.orderByKey == true');
    expect(scopedReads.find((operation) => operation.path.includes('indexes/'))
      ?.expression).toContain('query.limitToFirst <= 100');
    expect(JSON.stringify(fragment39B)).not.toMatch(
      /answer|pdfBytes|credential|privateObjectKey|teacherOnly|teacherNotes|providerAuthority|objectKey|storageLocation|secret|rawResponse|database\.rules\.json|assembled|emulator/iu,
    );
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
    const repository = createBookImpactDiscoveryReadRepository(store, localAdapters);
    const result = await repository.discover('solo', { actorId: 'student-1', evaluatedAt: at, limit: 2 });
    expect(result).toMatchObject({ status: 'ok', impacts: [] });
    expect(calls).toEqual(['authorize:solo', 'read:solo:2']);
    expect(repository).not.toHaveProperty('write');
  });

  it('accepts only the canonical path and trusted server-composition inputs', async () => {
    const store = {
      authorize: async () => authorizeBookSoloImpactRead({ actorId: 'student-1' }),
      readOwnedContexts: async () => ({ contexts: [], complete: true as const }),
    };
    const route = createBookImpactDiscoveryRoute(store, localAdapters);
    expect(Object.keys(route)).toEqual(['read']);
    expect(route).not.toHaveProperty('write');
    const response = await route.read({
      uid: 'student-1',
      request: new Request('https://worker.test/v1/book-impact/discovery/solo'),
      evaluatedAt: at,
      limit: 2,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok', contextKind: 'solo' });
    const clockResponse = await route.read({
      uid: 'student-1',
      request: new Request('https://worker.test/v1/book-impact/discovery/solo'),
      clock: () => at,
    });
    expect(clockResponse.status).toBe(200);
    for (const crafted of [
      'https://worker.test/v1/book-impact/discovery/homework?contextKind=solo&at='
        + encodeURIComponent('2027-01-01T00:00:00.000Z') + '&limit=1',
      'https://worker.test/v1/book-impact/discovery/solo#homework',
      'https://worker.test/v1/book-impact/discovery/solo/',
      'https://worker.test/v1/book-impact/discovery/solo/extra',
      'https://worker.test/v1/book-impact/discovery/solo//extra',
      'https://worker.test/v1/book-impact/discovery/solo%2Fextra',
    ]) {
      const rejected = await route.read({
        uid: 'student-1',
        request: new Request(crafted),
        evaluatedAt: '2027-01-01T00:00:00.000Z',
        limit: 1,
      });
      expect(rejected.status).toBe(404);
      expect(await rejected.json()).toMatchObject({
        code: 'book_impact_discovery_canonical_route_required',
      });
    }
    const post = await route.read({
      uid: 'student-1',
      request: new Request('https://worker.test/v1/book-impact/discovery/solo', { method: 'POST' }),
      evaluatedAt: at,
    });
    expect(post.status).toBe(403);
  });
});
