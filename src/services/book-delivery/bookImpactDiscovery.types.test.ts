import { describe, expect, it } from 'vitest';
import {
  BOOK_IMPACT_DISCOVERY_EFFECTS,
  createBookImpactDiscoveryConformanceRegistry,
} from './bookImpactDiscovery.types';

const declaration = (adapterId: string, contextKind: 'solo' | 'homework') => ({
  adapterId,
  adapterVersion: 1,
  contextKind,
  contractVersion: 1,
  input: {
    version: 1,
    immutable: true,
    requiredFields: ['frozen-placement-binding', 'book-impact-classification'],
  },
  classification: {
    version: 1,
    supportedEffects: [...BOOK_IMPACT_DISCOVERY_EFFECTS],
  },
  sourceReplacement: {
    version: 1,
    mode: 'owner-adopts-replacement',
    automaticUpdate: false,
  },
  output: { version: 1, fields: ['impact-summary'] },
  conformance: { status: 'verified', contractVersion: 1, verifiedAdapterVersion: 1 },
});

describe('39B impact discovery contract registration', () => {
  it('registers Solo and Homework declarations without activation', () => {
    const registry = createBookImpactDiscoveryConformanceRegistry([
      declaration('book-solo-impact-v1', 'solo'),
      declaration('book-homework-impact-v1', 'homework'),
    ]);
    expect(registry.declarations.map((item) => item.contextKind)).toEqual(['solo', 'homework']);
    expect(registry.get('book-solo-impact-v1')?.adapterVersion).toBe(1);
    expect(Object.isFrozen(registry.declarations)).toBe(true);
    expect(JSON.stringify(registry)).not.toMatch(
      /authorization|mutation|rollback|activation|credential|privateObjectKey/iu,
    );
  });

  it('registers every closed 39A classification effect for conformance fixtures', () => {
    const registry = createBookImpactDiscoveryConformanceRegistry([
      declaration('book-solo-impact-v1', 'solo'),
    ]);
    const supported = registry.declarations[0]?.classification.supportedEffects ?? [];
    expect(supported).toEqual(BOOK_IMPACT_DISCOVERY_EFFECTS);
    expect(new Set(supported).size).toBe(12);
    expect(supported).toEqual(expect.arrayContaining([
      'unchanged',
      'display-only',
      'regrade',
      'redo-required',
      'added',
      'removed',
      'reordered',
      'moved',
      'mapping-source-context',
      'successor',
      'invalidation',
      'unsupported',
    ]));
  });

  it.each([
    ['uncertain conformance', { conformance: { status: 'uncertain', contractVersion: 1, verifiedAdapterVersion: 1 } }],
    ['stale conformance', { conformance: { status: 'verified', contractVersion: 1, verifiedAdapterVersion: 2 } }],
    ['wrong context', { contextKind: 'course' }],
    ['extra authority field', { authorizationDecision: 'allow' }],
  ])('rejects %s', (_label, patch) => {
    expect(() => createBookImpactDiscoveryConformanceRegistry([
      { ...declaration('book-impact-v1', 'solo'), ...patch },
    ])).toThrow();
  });
});
