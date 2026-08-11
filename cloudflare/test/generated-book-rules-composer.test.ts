import { describe, expect, it } from 'vitest';
import generatedRules from '../../database.rules.json';
import databaseRules from '../../firebase.prd0062-118-rules.rollback.json';
import fragment04 from '../src/upload-worker/book-rules/fragments/04.json';
import fragment42A from '../src/upload-worker/book-rules/fragments/42A.json';
import {
  discoverGeneratedBookRuleFragmentManifest,
  validateGeneratedBookRuleFragment,
  type GeneratedBookRuleFragmentSource,
} from '../src/upload-worker/book-rules/generated-fragment-manifest';
import {
  composeGeneratedBookRules,
  FINAL_BOOK_RULE_FRAGMENT_IDS,
} from '../src/upload-worker/book-rules/generated-fragment-composer';
import { GeneratedBookRuleValidationError } from '../src/upload-worker/book-rules/generated-fragment-manifest';

const currentFragmentModules = import.meta.glob(
  '../src/upload-worker/book-rules/fragments/*.json',
  { eager: true, import: 'default' },
) as Record<string, unknown>;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const source = (sourcePath: string, fragment: unknown): GeneratedBookRuleFragmentSource => ({
  sourcePath,
  fragment,
});

const operationLocation = (operation: { path: string; rule: string }): string => (
  operation.path === '' ? `/${operation.rule}` : `${operation.path}/${operation.rule}`
);

const currentFragmentSources = (): GeneratedBookRuleFragmentSource[] => (
  Object.entries(currentFragmentModules).map(([sourcePath, fragment]) => source(sourcePath, fragment))
);

const currentFragment = (fileName: string): unknown => {
  const entry = Object.entries(currentFragmentModules).find(([sourcePath]) => (
    sourcePath.endsWith(`/${fileName}.json`)
  ));
  if (!entry) throw new Error(`Missing current fragment ${fileName}.json.`);
  return entry[1];
};

const withExactOwnerLocations = (fragment: unknown): unknown => {
  const copy = clone(fragment) as {
    owner: { generatedRuleLocations: string[] };
    operations: Array<{ path: string; rule: string }>;
  };
  copy.owner.generatedRuleLocations = [...new Set(copy.operations.map(operationLocation))];
  return copy;
};

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
    generatedRuleLocations: [operationLocation(operation)],
  },
  operations: [{
    path: operation.path,
    rule: operation.rule,
    merge: operation.merge ?? 'replace-exact-deny',
    requiresExistingRule: operation.requiresExistingRule ?? false,
    expression: operation.expression ?? 'false',
  }],
});

const fragmentWithOperations = (
  ticketId: string,
  operations: readonly {
    path: string;
    rule: string;
    merge: string;
    requiresExistingRule: boolean;
    expression: string;
  }[],
) => ({
  schemaVersion: 1,
  ticketId,
  owner: {
    ticketId,
    generatedRuleLocations: [...new Set(operations.map(operationLocation))],
  },
  operations,
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

const readRule = (root: Record<string, unknown>, location: string): unknown => {
  const segments = location.split('/');
  const rule = segments.pop()!;
  let cursor: unknown = root;
  for (const segment of segments.filter(Boolean)) cursor = (cursor as Record<string, unknown>)[segment];
  return (cursor as Record<string, unknown>)[rule];
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

  it('discovers the complete 33-fragment producer manifest in stable order', () => {
    const sources = currentFragmentSources();
    const forward = discoverGeneratedBookRuleFragmentManifest(sources);
    const reverse = discoverGeneratedBookRuleFragmentManifest([...sources].reverse());

    expect(forward).toHaveLength(34);
    expect(forward.map((entry) => entry.fragmentId)).toEqual([...FINAL_BOOK_RULE_FRAGMENT_IDS]);
    expect(JSON.stringify(reverse)).toBe(JSON.stringify(forward));
    expect(forward.map((entry) => entry.sourcePath)).toEqual(expect.arrayContaining([
      expect.stringContaining('/45.json'),
      expect.stringContaining('/46A.json'),
      expect.stringContaining('/46B.json'),
      expect.stringContaining('/47.json'),
    ]));
  });

  it('composes every producer into one deterministic candidate while preserving legacy rules', () => {
    const reverse = composeGeneratedBookRules([...currentFragmentSources()].reverse(), {
      baseRules: databaseRules.rules,
      requiredFragmentIds: FINAL_BOOK_RULE_FRAGMENT_IDS,
    });
    const forward = composeGeneratedBookRules(currentFragmentSources(), {
      baseRules: databaseRules.rules,
      requiredFragmentIds: FINAL_BOOK_RULE_FRAGMENT_IDS,
      requireExistingRules: true,
    });

    expect(JSON.stringify(reverse)).toBe(JSON.stringify(forward));
    expect(forward.fragmentIds).toEqual([...FINAL_BOOK_RULE_FRAGMENT_IDS]);
    expect(forward.operations).toHaveLength(336);
    expect(readRule(forward.rules, '/.read')).toBe(readRule(databaseRules.rules, '/.read'));
    expect(readRule(forward.rules, 'courses/.read')).toBe(readRule(databaseRules.rules, 'courses/.read'));
    expect(readRule(forward.rules, 'material_catalog/books/.write')).toBe('false');
    expect(String(readRule(forward.rules, 'material_catalog/books/$bookId/.write'))).toContain('pbcf');
    expect(JSON.stringify(forward.rules)).toBe(JSON.stringify(generatedRules.rules));
  });

  it('resolves only the two exact duplicates and three authorization alternatives', () => {
    const candidate = composeGeneratedBookRules(currentFragmentSources(), {
      baseRules: databaseRules.rules,
      requiredFragmentIds: FINAL_BOOK_RULE_FRAGMENT_IDS,
    });
    expect(candidate.byLocation['material_catalog/books/.write'].contributors).toEqual([
      { fragmentId: '20A', operationIndex: 0 },
      { fragmentId: '44', operationIndex: 16 },
    ]);
    expect(candidate.byLocation['book_activity/versions/$activityId/$versionId/.write'].contributors)
      .toHaveLength(2);
    expect(candidate.byLocation['book_activity/versions/$activityId/$versionId/.write'].expression)
      .toContain(' || ');
  });

  it('hardens the #45 token record against raw token fields in the generated rule', () => {
    const candidate = composeGeneratedBookRules(currentFragmentSources(), {
      baseRules: databaseRules.rules,
      requiredFragmentIds: FINAL_BOOK_RULE_FRAGMENT_IDS,
    });
    const expression = String(readRule(
      candidate.rules,
      'book_replacement_plans/tokens/$ownerId/$planId/$reviewId/.write',
    ));
    expect(expression).toContain("!newData.child('token').exists()");
    expect(expression).toContain("!newData.child('confirmationToken').exists()");
    expect(expression).toContain("!newData.child('secret').exists()");
  });

  it('rejects each producer owner-location gap without final reconciliation', () => {
    for (const fileName of ['16A', '28A', '29', '40B', '44']) {
      expectCode(
        () => validateGeneratedBookRuleFragment(currentFragment(fileName)),
        'declared-path-gap',
      );
    }
  });

  it('rejects a true incompatible producer duplicate after isolating its owner gap', () => {
    expectCode(() => validateGeneratedBookRuleFragment(
      withExactOwnerLocations(currentFragment('16A')),
    ), 'incompatible-merge-semantics');
  });

  it('allows the real 20A ancestor deny with a descendant access grant', () => {
    const candidate = composeGeneratedBookRules([
      source('fragments/20A.json', currentFragment('20A')),
    ], { baseRules: databaseRules.rules });
    expect(candidate.fragmentIds).toEqual(['20A']);
    expect(candidate.byLocation['material_catalog/books/$bookId/.write']).toBeDefined();
  });

  it('rejects an unapproved duplicate even when its expressions are identical', () => {
    expectCode(() => composeGeneratedBookRules([
      source('fragments/a.json', simpleFragment('a', { path: 'books', rule: '.read' })),
      source('fragments/b.json', simpleFragment('b', { path: 'books', rule: '.read' })),
    ]), 'duplicate-operation');
  });

  it('rejects an unapproved incompatible authorization collision', () => {
    expectCode(() => composeGeneratedBookRules([
      source('fragments/a.json', simpleFragment('a', {
        path: 'books', rule: '.write', merge: 'replace-exact-deny', expression: 'auth != null',
      })),
      source('fragments/b.json', simpleFragment('b', {
        path: 'books', rule: '.write', merge: 'conjoin-existing-authorization',
        requiresExistingRule: true, expression: 'auth.token.other === true',
      })),
    ]), 'incompatible-merge-semantics');
  });

  it('rejects a descendant deny beneath explicit or permissive ancestor grants', () => {
    for (const { ticketId, expression } of [
      { ticketId: 'explicit-grant', expression: 'auth != null && auth.token.admin === true' },
      { ticketId: 'permissive-fallback', expression: 'auth == null || auth.token.admin === true' },
    ]) {
      const fragment = fragmentWithOperations(ticketId, [
        { path: 'books', rule: '.write', merge: 'replace-grant', requiresExistingRule: false, expression },
        { path: 'books/private', rule: '.write', merge: 'replace-exact-deny', requiresExistingRule: false, expression: 'false' },
      ]);
      expectCode(() => composeGeneratedBookRules([source(`fragments/${ticketId}.json`, fragment)]), 'ancestor-descendant-conflict');
    }
  });

  it('rejects malformed schema, expressions, fragment ids, and owner declarations', () => {
    const malformed = clone(currentFragment('04')) as { operations: unknown };
    malformed.operations = {};
    expectCode(() => composeGeneratedBookRules([source('fragments/malformed.json', malformed)]), 'malformed-fragment');

    const unsupported = simpleFragment('unsupported', { path: 'books', rule: '.read' });
    (unsupported as { schemaVersion: number }).schemaVersion = 2;
    expectCode(() => composeGeneratedBookRules([source('fragments/unsupported.json', unsupported)]), 'unknown-schema-version');

    expectCode(() => composeGeneratedBookRules([source('fragments/empty.json', simpleFragment('empty', {
      path: 'books', rule: '.read', expression: '  ',
    }))]), 'empty-expression');
    expectCode(() => composeGeneratedBookRules([
      source('fragments/a.json', simpleFragment('duplicate', { path: 'books', rule: '.read' })),
      source('fragments/b.json', clone(simpleFragment('duplicate', { path: 'books', rule: '.write' }))),
    ]), 'duplicate-fragment-id');
  });
});
