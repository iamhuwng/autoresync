import { describe, expect, it } from 'vitest';
import fragment04 from '../src/upload-worker/book-rules/fragments/04.json';
import fragment42A from '../src/upload-worker/book-rules/fragments/42A.json';
import {
  discoverGeneratedBookRuleFragmentManifest,
  type GeneratedBookRuleFragmentSource,
} from '../src/upload-worker/book-rules/generated-fragment-manifest';
import {
  composeGeneratedBookRules,
} from '../src/upload-worker/book-rules/generated-fragment-composer';
import {
  GeneratedBookRuleValidationError,
} from '../src/upload-worker/book-rules/generated-fragment-manifest';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const source = (
  sourcePath: string,
  fragment: unknown,
): GeneratedBookRuleFragmentSource => ({ sourcePath, fragment });

const simpleFragment = (
  ticketId: string,
  operation: {
    readonly path: string;
    readonly rule: string;
    readonly merge?: string;
    readonly requiresExistingRule?: boolean;
    readonly expression?: string;
  },
) => ({
  schemaVersion: 1,
  ticketId,
  owner: {
    ticketId,
    generatedRuleLocations: [
      operation.path === ''
        ? `/${operation.rule}`
        : `${operation.path}/${operation.rule}`,
    ],
  },
  operations: [{
    path: operation.path,
    rule: operation.rule,
    merge: operation.merge ?? 'replace-exact-deny',
    requiresExistingRule: operation.requiresExistingRule ?? false,
    expression: operation.expression ?? 'false',
  }],
});

const expectCode = (run: () => unknown, code: string): void => {
  try {
    run();
    throw new Error(`Expected ${code} to be thrown.`);
  } catch (error) {
    expect(error).toBeInstanceOf(GeneratedBookRuleValidationError);
    expect((error as GeneratedBookRuleValidationError).code).toBe(code);
  }
};

describe('generated Book RTDB rule manifest and composer', () => {
  it('discovers fragments in stable order independent of source enumeration', () => {
    const reverse = discoverGeneratedBookRuleFragmentManifest([
      source('fragments/42A.json', fragment42A),
      source('fragments/04.json', fragment04),
    ]);
    const forward = discoverGeneratedBookRuleFragmentManifest([
      source('fragments/04.json', fragment04),
      source('fragments/42A.json', fragment42A),
    ]);

    expect(reverse.map((entry) => entry.fragmentId)).toEqual(['04', '42A']);
    expect(JSON.stringify(reverse)).toBe(JSON.stringify(forward));
  });

  it('composes a deterministic in-memory candidate and normalizes the root path only', () => {
    const reverse = composeGeneratedBookRules([
      source('fragments/42A.json', fragment42A),
      source('fragments/04.json', fragment04),
    ]);
    const forward = composeGeneratedBookRules([
      source('fragments/04.json', fragment04),
      source('fragments/42A.json', fragment42A),
    ]);

    expect(JSON.stringify(reverse)).toBe(JSON.stringify(forward));
    expect(reverse.kind).toBe('generated-book-rules-candidate');
    expect(reverse.fragmentIds).toEqual(['04', '42A']);
    expect(reverse.operations.map((operation) => operation.location)).toContain('/.validate');
    expect((reverse.rules as Record<string, unknown>)['.validate']).toBeTypeOf('string');
    expect((reverse.rules as Record<string, Record<string, unknown>>)
      .book_source_upload_accounts['.read']).toBe('false');
  });

  it('rejects duplicate fragment ids', () => {
    const fragment = simpleFragment('duplicate', { path: 'books', rule: '.read' });
    expectCode(() => composeGeneratedBookRules([
      source('fragments/a.json', fragment),
      source('fragments/b.json', clone(fragment)),
    ]), 'duplicate-fragment-id');
  });

  it('rejects duplicate path and rule operations', () => {
    expectCode(() => composeGeneratedBookRules([
      source('fragments/a.json', simpleFragment('a', { path: 'books', rule: '.read' })),
      source('fragments/b.json', simpleFragment('b', { path: 'books', rule: '.read' })),
    ]), 'duplicate-operation');
  });

  it('rejects incompatible merge semantics at one path and rule', () => {
    expectCode(() => composeGeneratedBookRules([
      source('fragments/a.json', simpleFragment('a', {
        path: 'books',
        rule: '.write',
        merge: 'replace-exact-deny',
      })),
      source('fragments/b.json', simpleFragment('b', {
        path: 'books',
        rule: '.write',
        merge: 'conjoin-existing-authorization',
        requiresExistingRule: true,
      })),
    ]), 'incompatible-merge-semantics');
  });

  it('rejects a malformed or unknown schema version', () => {
    const unsupported = simpleFragment('unsupported', { path: 'books', rule: '.read' });
    (unsupported as { schemaVersion: number }).schemaVersion = 2;
    expectCode(() => composeGeneratedBookRules([
      source('fragments/unsupported.json', unsupported),
    ]), 'unknown-schema-version');
  });

  it('rejects empty expressions', () => {
    expectCode(() => composeGeneratedBookRules([
      source('fragments/empty.json', simpleFragment('empty', {
        path: 'books',
        rule: '.read',
        expression: '  ',
      })),
    ]), 'empty-expression');
  });

  it('rejects an operation whose declared owner locations have a gap', () => {
    const incomplete = clone(simpleFragment('gap', { path: 'books', rule: '.read' })) as {
      owner: { generatedRuleLocations: string[] };
    };
    incomplete.owner.generatedRuleLocations = [];
    expectCode(() => composeGeneratedBookRules([
      source('fragments/gap.json', incomplete),
    ]), 'declared-path-gap');
  });

  it('rejects explicitly declared required locations that are absent', () => {
    expectCode(() => composeGeneratedBookRules([
      source('fragments/one.json', simpleFragment('one', { path: 'books', rule: '.read' })),
    ], {
      requiredLocations: ['books/.write'],
    }), 'declared-path-gap');
  });
});
