import { describe, expect, it } from 'vitest';
import type { SourceSetCandidate } from '../../types/bookAssembly.types';
import {
  planReplacementSourceSetDelta,
  type ReplacementSourceSetDeltaInput,
} from './replacementSourceSetDelta.service';
import type { ReplacementTrustedSourceSet } from './replacementSourceSetDelta.types';

const descriptor = (sourceKey: string, sourceVersionId: string, sourceOrder: number, pages: number, ownerNodeKey?: string) => ({
  sourceKey,
  sourceVersionId,
  sourceOrder,
  ...(ownerNodeKey ? { ownerNodeKey } : {}),
  label: `Source ${sourceKey}`,
  rotation: 0 as const,
  physicalPageCount: pages,
  bounds: { width: 1000, height: 1400 },
  pageGroups: [{
    pageGroupKey: `${sourceKey}-pages`,
    label: `${sourceKey} pages`,
    sourceKey,
    ...(ownerNodeKey ? { ownerNodeKey } : {}),
    pages: Array.from({ length: pages }, (_, index) => index + 1),
    mode: 'reference_only' as const,
  }],
});

const trusted = (
  strategy: SourceSetCandidate['sourceStrategy'],
  sources: readonly ReturnType<typeof descriptor>[],
): ReplacementTrustedSourceSet => ({
  sourceSet: {
    sourceStrategy: strategy,
    sources: sources.map(({ label: _label, rotation: _rotation, physicalPageCount: _count, bounds: _bounds, pageGroups: _groups, ...source }) => source) as SourceSetCandidate['sources'],
  } as SourceSetCandidate,
  sources,
});

const mapping = (
  mappingId: string,
  from: { sourceKey: string; physicalPageNumber: number } | null,
  to: { sourceKey: string; physicalPageNumber: number } | null,
  kind: 'retained' | 'added' | 'removed' | 'reassigned',
) => ({ mappingId, from, to, kind, sourceAssistedScopes: [] });

const full = (version: string, pages = 2) => trusted('full_pdf', [descriptor('full', version, 1, pages)]);
const component = (entries: readonly [string, string, number, string][]) => trusted(
  'component_pdfs',
  entries.map(([key, version, pages, owner], index) => descriptor(key, version, index + 1, pages, owner)),
);

const run = (input: ReplacementSourceSetDeltaInput) => planReplacementSourceSetDelta(input);

describe('replacement Source-Set delta', () => {
  it('supports normal one-to-one equal and different-page-count replacements explicitly', async () => {
    const equal = await run({
      old: full('old-v1', 2),
      next: full('new-v1', 2),
      mappings: [
        mapping('p1', { sourceKey: 'full', physicalPageNumber: 1 }, { sourceKey: 'full', physicalPageNumber: 1 }, 'reassigned'),
        mapping('p2', { sourceKey: 'full', physicalPageNumber: 2 }, { sourceKey: 'full', physicalPageNumber: 2 }, 'reassigned'),
      ],
    });
    expect(equal.valid).toBe(true);
    expect(equal.delta?.fingerprint).toMatch(/^[a-f0-9]{64}$/u);

    const different = await run({
      old: full('old-v1', 2),
      next: full('new-v1', 3),
      mappings: [
        mapping('kept', { sourceKey: 'full', physicalPageNumber: 1 }, { sourceKey: 'full', physicalPageNumber: 1 }, 'reassigned'),
        mapping('removed', { sourceKey: 'full', physicalPageNumber: 2 }, null, 'removed'),
        mapping('added-2', null, { sourceKey: 'full', physicalPageNumber: 2 }, 'added'),
        mapping('added-3', null, { sourceKey: 'full', physicalPageNumber: 3 }, 'added'),
      ],
    });
    expect(different.valid).toBe(true);
  });

  it('supports broad-to-several-narrow split with every page mapped once by destination', async () => {
    const result = await run({
      old: full('broad-v1', 3),
      next: component([
        ['narrow-a', 'a-v1', 1, 'unit-a'],
        ['narrow-b', 'b-v1', 2, 'unit-b'],
      ]),
      mappings: [
        mapping('split-1', { sourceKey: 'full', physicalPageNumber: 1 }, { sourceKey: 'narrow-a', physicalPageNumber: 1 }, 'reassigned'),
        mapping('split-2', { sourceKey: 'full', physicalPageNumber: 2 }, { sourceKey: 'narrow-b', physicalPageNumber: 1 }, 'reassigned'),
        mapping('split-3', { sourceKey: 'full', physicalPageNumber: 3 }, { sourceKey: 'narrow-b', physicalPageNumber: 2 }, 'reassigned'),
      ],
    });
    expect(result.valid).toBe(true);
  });

  it('supports add, remove, and reassign without inferring offsets', async () => {
    const result = await run({
      old: component([['a', 'a-v1', 2, 'unit-a']]),
      next: component([
        ['a', 'a-v2', 2, 'unit-a'],
        ['b', 'b-v1', 1, 'unit-b'],
      ]),
      mappings: [
        mapping('reassign-a1', { sourceKey: 'a', physicalPageNumber: 1 }, { sourceKey: 'a', physicalPageNumber: 1 }, 'reassigned'),
        mapping('reassign-a2', { sourceKey: 'a', physicalPageNumber: 2 }, { sourceKey: 'b', physicalPageNumber: 1 }, 'reassigned'),
        mapping('add-a2', null, { sourceKey: 'a', physicalPageNumber: 2 }, 'added'),
      ],
    });
    expect(result.valid).toBe(true);
  });

  it.each([
    ['duplicate mapping identity', (input: ReplacementSourceSetDeltaInput) => ({ ...input, mappings: [...input.mappings, input.mappings[0]!] }), 'duplicate-mapping'],
    ['missing page coverage', (input: ReplacementSourceSetDeltaInput) => ({ ...input, mappings: input.mappings.slice(0, 1) }), 'incomplete-mapping'],
    ['non-contiguous source order', (input: ReplacementSourceSetDeltaInput) => {
      const next = structuredClone(input.next);
      (next.sourceSet.sources[0] as { sourceOrder: number }).sourceOrder = 2;
      return { ...input, next };
    }, 'invalid-order'],
  ])('%s is rejected', async (_name, mutate, code) => {
    const base: ReplacementSourceSetDeltaInput = {
      old: component([['a', 'a-v1', 2, 'unit-a']]),
      next: component([['a', 'a-v2', 2, 'unit-a']]),
      mappings: [
        mapping('a1', { sourceKey: 'a', physicalPageNumber: 1 }, { sourceKey: 'a', physicalPageNumber: 1 }, 'reassigned'),
        mapping('a2', { sourceKey: 'a', physicalPageNumber: 2 }, { sourceKey: 'a', physicalPageNumber: 2 }, 'reassigned'),
      ],
    };
    const result = await run(mutate(base));
    expect(result.valid).toBe(false);
    expect(result.errors.map((entry) => entry.code)).toContain(code);
  });

  it('validates labels, rotation, bounds, Page Groups, owners, and source-assisted scopes', async () => {
    const invalid = full('old-v1', 1);
    const bad = structuredClone(invalid);
    (bad.sources[0] as any).rotation = 45;
    (bad.sources[0] as any).bounds.width = 0;
    (bad.sources[0] as any).pageGroups[0].sourceKey = 'missing';
    const result = await run({
      old: bad,
      next: full('new-v1', 1),
      mappings: [mapping('p1', { sourceKey: 'full', physicalPageNumber: 1 }, { sourceKey: 'full', physicalPageNumber: 1 }, 'reassigned')],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.map((entry) => entry.code)).toEqual(expect.arrayContaining(['invalid-rotation', 'invalid-bounds', 'source-identity-mismatch']));
  });

  it('rejects reuse of either an old page or a replacement page across mappings', async () => {
    const oldPageReused = await run({
      old: full('old-v1', 1),
      next: full('new-v1', 2),
      mappings: [
        mapping('one', { sourceKey: 'full', physicalPageNumber: 1 }, { sourceKey: 'full', physicalPageNumber: 1 }, 'reassigned'),
        mapping('two', { sourceKey: 'full', physicalPageNumber: 1 }, { sourceKey: 'full', physicalPageNumber: 2 }, 'reassigned'),
      ],
    });
    expect(oldPageReused.errors.map((entry) => entry.code)).toContain('duplicate-mapping');

    const nextPageReused = await run({
      old: full('old-v1', 2),
      next: full('new-v1', 1),
      mappings: [
        mapping('one', { sourceKey: 'full', physicalPageNumber: 1 }, { sourceKey: 'full', physicalPageNumber: 1 }, 'reassigned'),
        mapping('two', { sourceKey: 'full', physicalPageNumber: 2 }, { sourceKey: 'full', physicalPageNumber: 1 }, 'reassigned'),
      ],
    });
    expect(nextPageReused.errors.map((entry) => entry.code)).toContain('duplicate-mapping');
  });
});
