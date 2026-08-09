import { describe, expect, it, vi } from 'vitest';
import type {
  BookImpactDiscoveryAdapterDeclaration,
  BookImpactDiscoveryContextKind,
  BookImpactDiscoveryResult,
  BookImpactSummary,
} from './bookImpactDiscovery.types';
import type { BookImpactSnapshot, BookImpactSnapshotReadResult } from './bookImpactSnapshot.types';
import {
  createBookImpactSnapshotService,
  type BookImpactSnapshotDiscoveryProvider,
  type BookImpactSnapshotRepository,
} from '../../../cloudflare/src/upload-worker/book-updates/impact-snapshot';
import fragment from '../../../cloudflare/src/upload-worker/book-rules/fragments/39C.json';

const kinds = ['solo', 'homework', 'course', 'class', 'public-reference'] as const;
const evaluatedAt = '2026-08-10T00:00:00.000Z';
const fingerprint = (character: string) => character.repeat(64);

const impact = (kind: BookImpactDiscoveryContextKind, index: number): BookImpactSummary => ({
  contextId: `${kind}-${index}`,
  contextKind: kind,
  ownerId: 'teacher-1',
  recipientId: kind === 'solo' ? 'teacher-1' : `student-${index}`,
  bindingId: `binding-${kind}-${index}`,
  bindingRevision: 1,
  status: 'active',
  lifecycle: index % 2 ? 'in-progress' : 'not-started',
  bookId: 'book-1',
  bookRevision: 2,
  publicationId: 'publication-1',
  publicationRevision: 2,
  effectiveWindow: null,
  placements: [{
    placementId: `placement-${kind}-${index}`,
    activityId: 'activity-1',
    activityVersionId: 'activity-v1',
    activityVersion: 1,
    nodeKey: 'unit-1',
    order: index,
    effectiveWindow: null,
    sourceRefs: [{
      sourceKey: 'source-1',
      sourceVersionId: 'source-v1',
      availability: 'available',
      pages: [1],
    }],
  }],
  attempts: [],
  sources: [{
    sourceKey: 'source-1', sourceVersionId: 'source-v1', availability: 'available', pages: [1],
    placementIds: [`placement-${kind}-${index}`],
  }],
  classification: {
    primaryEffect: index % 2 ? 'redo-required' : 'display-only',
    effects: [index % 2 ? 'redo-required' : 'display-only'],
    reasons: ['activity-revision'],
    requiresRedo: index % 2 === 1,
    requiresRegrade: false,
  },
  replacement: [],
  ...(kind === 'course' ? { identity: { kind } as never } : {}),
  ...(kind === 'class' ? { identity: { kind } as never } : {}),
  ...(kind === 'public-reference' ? { identity: { kind } as never } : {}),
} as BookImpactSummary);

const declaration = (kind: BookImpactDiscoveryContextKind): BookImpactDiscoveryAdapterDeclaration => ({
  adapterId: `book-${kind}-impact-v1`,
  adapterVersion: 1,
  contextKind: kind,
  contractVersion: 1,
  input: { version: 1, immutable: true, requiredFields: ['frozen-placement-binding', 'book-impact-classification'] },
  classification: { version: 1, supportedEffects: ['display-only', 'redo-required'] },
  sourceReplacement: { version: 1, mode: 'invalidation-only', automaticUpdate: false },
  output: { version: 1, fields: ['impact-summary'] },
  conformance: { status: 'verified', contractVersion: 1, verifiedAdapterVersion: 1 },
});

const provider = (kind: BookImpactDiscoveryContextKind, index: number): BookImpactSnapshotDiscoveryProvider => ({
  declaration: declaration(kind),
  discover: vi.fn(async (): Promise<BookImpactDiscoveryResult> => ({
    status: 'ok', contractVersion: 1, inputVersion: 1, outputVersion: 1,
    adapterId: `book-${kind}-impact-v1`, adapterVersion: 1, contextKind: kind,
    evaluatedAt, replacementScopes: [], impacts: [impact(kind, index)],
  } as BookImpactDiscoveryResult)),
});

class MemoryRepository implements BookImpactSnapshotRepository {
  current: BookImpactSnapshot | null = null;
  saves = 0;

  async save(snapshot: BookImpactSnapshot) {
    this.saves += 1;
    if (this.current?.inputFingerprint === snapshot.inputFingerprint) {
      return { status: 'reused' as const, snapshot: this.current };
    }
    this.current = snapshot;
    return { status: 'created' as const, snapshot };
  }

  async readCurrent(): Promise<BookImpactSnapshotReadResult> {
    return this.current ? { status: 'ready', snapshot: this.current } : { status: 'missing' };
  }
}

const command = {
  actorId: 'teacher-1',
  bookId: 'book-1',
  evaluatedAt,
  immutableInputs: {
    oldActivityVersionId: 'activity-v1',
    newActivityVersionId: 'activity-v2',
    oldActivityFingerprint: fingerprint('a'),
    newActivityFingerprint: fingerprint('b'),
    placementFingerprint: fingerprint('c'),
    manifestFingerprint: fingerprint('d'),
    sourceFingerprint: fingerprint('e'),
    scheduleFingerprint: fingerprint('f'),
  },
};

describe('#108 authoritative impact snapshots', () => {
  it('consumes every registered context kind once and persists a deterministic unselected snapshot', async () => {
    const providers = kinds.map(provider);
    const repository = new MemoryRepository();
    const service = createBookImpactSnapshotService({
      providers,
      repository,
      now: () => new Date(evaluatedAt),
      newId: () => 'snapshot-1',
    });

    const first = await service.create(command);
    const second = await service.create(command);
    expect(first.status).toBe('created');
    expect(second.status).toBe('reused');
    expect(providers.every((entry) => vi.mocked(entry.discover).mock.calls.length === 2)).toBe(true);
    if (first.status === 'blocked' || second.status === 'blocked') throw new Error('unexpected blocked result');
    expect(first.snapshot.inputFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(second.snapshot.snapshotId).toBe('snapshot-1');
    expect(first.snapshot.adapters.map((entry) => entry.contextKind).sort()).toEqual([...kinds].sort());
    expect(first.snapshot.contexts).toHaveLength(5);
    expect(first.snapshot.contexts.flatMap((entry) => entry.activityChoices))
      .toEqual(expect.arrayContaining([expect.objectContaining({ selectedChoice: null })]));
    expect(first.snapshot.contexts.some((entry) => entry.estimatedCheckpointCount === 1)).toBe(true);
    expect(first.snapshot.recovery).toEqual(expect.objectContaining({
      restoreBehavior: 'retain-read-only',
      sideEffectsOnReplay: 'none',
    }));
  });

  it('fails before discovery or persistence for missing, duplicate, or stale adapter ownership', async () => {
    const repository = new MemoryRepository();
    const missing = kinds.slice(0, 4).map(provider);
    await expect(createBookImpactSnapshotService({ providers: missing, repository }).create(command))
      .resolves.toEqual({ status: 'blocked', code: 'missing-adapter' });
    expect(missing.every((entry) => vi.mocked(entry.discover).mock.calls.length === 0)).toBe(true);

    const duplicate = kinds.map(provider);
    duplicate[4] = provider('class', 5);
    await expect(createBookImpactSnapshotService({ providers: duplicate, repository }).create(command))
      .resolves.toEqual({ status: 'blocked', code: 'duplicate-adapter' });

    const stale = kinds.map(provider);
    stale[0] = {
      ...stale[0]!,
      declaration: { ...stale[0]!.declaration, conformance: { status: 'verified', contractVersion: 1, verifiedAdapterVersion: 2 } },
    };
    await expect(createBookImpactSnapshotService({ providers: stale, repository }).create(command))
      .resolves.toEqual({ status: 'blocked', code: 'stale-conformance' });
    expect(repository.saves).toBe(0);
  });

  it('denies uncertain, blocked, cross-owner, duplicate-context, and unbounded TTL inputs without writes', async () => {
    const repository = new MemoryRepository();
    const uncertain = kinds.map(provider);
    uncertain[0] = { ...uncertain[0]!, discover: vi.fn(async () => { throw new Error('read failed'); }) };
    await expect(createBookImpactSnapshotService({ providers: uncertain, repository }).create(command))
      .resolves.toEqual({ status: 'blocked', code: 'uncertain-discovery' });

    const blocked = kinds.map(provider);
    blocked[0] = {
      ...blocked[0]!,
      discover: vi.fn(async (): Promise<BookImpactDiscoveryResult> => ({
        status: 'blocked', contractVersion: 1, inputVersion: 1, outputVersion: 1,
        adapterId: blocked[0]!.declaration.adapterId, adapterVersion: 1, contextKind: 'solo',
        evaluatedAt, code: 'uncertain',
      } as BookImpactDiscoveryResult)),
    };
    await expect(createBookImpactSnapshotService({ providers: blocked, repository }).create(command))
      .resolves.toEqual({ status: 'blocked', code: 'discovery-blocked' });

    const crossOwner = kinds.map(provider);
    crossOwner[1] = {
      ...crossOwner[1]!,
      discover: vi.fn(async () => ({
        status: 'ok', contractVersion: 1, inputVersion: 1, outputVersion: 1,
        adapterId: crossOwner[1]!.declaration.adapterId, adapterVersion: 1, contextKind: 'homework',
        evaluatedAt, replacementScopes: [], impacts: [{ ...impact('homework', 1), ownerId: 'teacher-2' }],
      } as BookImpactDiscoveryResult)),
    };
    await expect(createBookImpactSnapshotService({ providers: crossOwner, repository }).create(command))
      .resolves.toEqual({ status: 'blocked', code: 'cross-owner' });

    await expect(createBookImpactSnapshotService({ providers: kinds.map(provider), repository }).create({
      ...command, ttlMs: 31 * 60 * 1000,
    })).resolves.toEqual({ status: 'blocked', code: 'invalid-request' });
    expect(repository.saves).toBe(0);
  });
});

describe('#108 inactive rule fragment', () => {
  it('denies ancestor/browser access and grants only scoped expiring service paths', () => {
    expect(fragment.status).toBe('inactive');
    const operations = fragment.operations as readonly { path: string; rule: string; expression: string }[];
    expect(operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'book_impact_snapshots', rule: '.read', expression: 'false' }),
      expect.objectContaining({ path: 'book_impact_snapshots', rule: '.write', expression: 'false' }),
    ]));
    const grants = operations.filter((entry) => entry.expression !== 'false');
    expect(grants.every((entry) => entry.expression.includes('auth.token.bis.s == true'))).toBe(true);
    expect(grants.every((entry) => entry.expression.includes('auth.token.bis.o == $ownerId'))).toBe(true);
    expect(grants.every((entry) => entry.expression.includes('auth.token.bis.dl >= now'))).toBe(true);
  });
});
