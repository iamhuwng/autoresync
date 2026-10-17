import { describe, expect, it } from 'vitest';
import {
  createBookContextAdapterRegistry,
} from './bookContextAdapterRegistry.service';

const declaration = (adapterId: string, contextKind: 'course' | 'class' | 'public-reference') => ({
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
    supportedEffects: ['display-only', 'regrade', 'redo-required', 'added', 'removed', 'reordered', 'moved', 'mapping-source-context', 'successor', 'invalidation'],
  },
  sourceReplacement: {
    version: 1,
    mode: contextKind === 'public-reference' ? 'invalidation-only' : 'owner-adopts-replacement',
    automaticUpdate: false,
  },
  output: { version: 1, fields: ['impact-summary'] },
  conformance: { status: 'verified', contractVersion: 1, verifiedAdapterVersion: 1 },
});

describe('Ticket 39A Book context adapter conformance registry', () => {
  it('accepts versioned Course, Class, and public-reference fixtures without activation', () => {
    const registry = createBookContextAdapterRegistry([
      declaration('course-v1', 'course'),
      declaration('class-v1', 'class'),
      declaration('public-v1', 'public-reference'),
    ]);
    expect(registry.declarations.map((item) => item.contextKind)).toEqual([
      'course', 'class', 'public-reference',
    ]);
    expect(registry.get('course-v1')?.adapterVersion).toBe(1);
    expect(Object.isFrozen(registry.declarations)).toBe(true);
  });

  it.each([
    ['missing', undefined, 'adapter declaration'],
    ['incompatible', { contractVersion: 2 }, 'contractVersion'],
    ['uncertain', { conformance: { status: 'uncertain', contractVersion: 1, verifiedAdapterVersion: 1 } }, 'conformance status'],
    ['stale', { conformance: { status: 'verified', contractVersion: 1, verifiedAdapterVersion: 2 } }, 'stale'],
  ])('rejects %s declarations fail-closed', (_name, patch, message) => {
    const candidate = patch === undefined
      ? undefined
      : { ...declaration('course-v1', 'course'), ...patch };
    expect(() => createBookContextAdapterRegistry([candidate])).toThrow(message);
  });

  it('rejects duplicates and forbidden authority-shaped declaration fields', () => {
    const valid = declaration('course-v1', 'course');
    expect(() => createBookContextAdapterRegistry([valid, valid])).toThrow('duplicate adapterId');
    expect(() => createBookContextAdapterRegistry([
      { ...valid, authorizationDecision: 'allow' },
    ])).toThrow('adapter declaration must contain exactly');
    expect(JSON.stringify(createBookContextAdapterRegistry([valid]))).not.toMatch(
      /contextRecord|privateSolo|authorization|mutation|rollback|activation|sensitive/iu,
    );
  });
});
