import { describe, expect, it } from 'vitest';

import generatedRules from '../../database.rules.json';
import rollbackRules from '../../firebase.prd0062-118-rules.rollback.json';
import fragment49A from '../src/upload-worker/book-rules/fragments/49A.json';
import {
  composeGeneratedBookRules,
  FINAL_BOOK_RULE_FRAGMENT_IDS,
} from '../src/upload-worker/book-rules/generated-fragment-composer';
import type { GeneratedBookRuleFragmentSource } from '../src/upload-worker/book-rules/generated-fragment-manifest';

const currentFragmentModules = import.meta.glob(
  '../src/upload-worker/book-rules/fragments/*.json',
  { eager: true, import: 'default' },
) as Record<string, unknown>;

const sources = (): GeneratedBookRuleFragmentSource[] => Object.entries(currentFragmentModules)
  .map(([sourcePath, fragment]) => ({ sourcePath, fragment }));

const readRule = (root: Record<string, unknown>, location: string): unknown => {
  const segments = location.split('/');
  const rule = segments.pop()!;
  let cursor: unknown = root;
  for (const segment of segments.filter(Boolean)) cursor = (cursor as Record<string, unknown>)[segment];
  return (cursor as Record<string, unknown>)[rule];
};

const operation = (path: string, rule: string): string => {
  const found = fragment49A.operations.find((entry) => entry.path === path && entry.rule === rule);
  if (!found) throw new Error(`Missing 49A operation ${path}/${rule}.`);
  return found.expression;
};

describe('#121 49A Book recovery ledger rules', () => {
  it('declares exact deny ancestors and least-privilege recovery locations', () => {
    expect(fragment49A.owner.serviceIdentity).toBe('book_recovery_service');
    expect(fragment49A.owner.generatedRuleLocations).toEqual([
      'book_recovery/.read',
      'book_recovery/.write',
      'book_recovery/operations/$operationId/.read',
      'book_recovery/operations/$operationId/.write',
      'book_recovery/indexes/.read',
      'book_recovery/indexes/.write',
      'book_recovery/indexes/by_snapshot_idempotency/$snapshotId/$idempotencyKey/.read',
      'book_recovery/indexes/by_snapshot_idempotency/$snapshotId/$idempotencyKey/.write',
    ]);
    expect(operation('book_recovery', '.write')).toBe('false');
    expect(operation('book_recovery/indexes', '.write')).toBe('false');
    expect(operation('book_recovery/indexes/by_snapshot_idempotency/$snapshotId/$idempotencyKey', '.read'))
      .toBe('false');
  });

  it('requires the deployment recovery claims for exact operation and index writes', () => {
    const operationWrite = operation('book_recovery/operations/$operationId', '.write');
    expect(operationWrite).toContain('auth.token.bkr.s == true');
    expect(operationWrite).toContain('auth.token.bkr.o == $operationId');
    expect(operationWrite).toContain("newData.child('state').val() == 'failed_terminal'");
    expect(operationWrite).toContain("newData.child('stateRevision').val() == data.child('stateRevision').val() + 1");
    expect(operationWrite).not.toContain('auth.uid');

    const indexWrite = operation(
      'book_recovery/indexes/by_snapshot_idempotency/$snapshotId/$idempotencyKey',
      '.write',
    );
    expect(indexWrite).toContain('auth.token.bkr.s == true');
    expect(indexWrite).toContain('auth.token.bkr.i == $snapshotId');
    expect(indexWrite).toContain('auth.token.bkr.k == $idempotencyKey');
    expect(indexWrite).toContain('!data.exists()');
    expect(indexWrite).not.toContain('auth.uid');
  });

  it('composes 49A and emits the exact checked-in database rules', () => {
    const candidate = composeGeneratedBookRules(sources(), {
      baseRules: rollbackRules.rules,
      requiredFragmentIds: FINAL_BOOK_RULE_FRAGMENT_IDS,
      requireExistingRules: true,
    });

    expect(candidate.fragmentIds).toContain('49A');
    expect(readRule(candidate.rules, 'book_recovery/.write')).toBe('false');
    expect(readRule(candidate.rules, 'book_recovery/indexes/.write')).toBe('false');
    expect(readRule(candidate.rules, 'book_recovery/operations/$operationId/.write'))
      .toBe(operation('book_recovery/operations/$operationId', '.write'));
    expect(readRule(candidate.rules, 'book_recovery/indexes/by_snapshot_idempotency/$snapshotId/$idempotencyKey/.write'))
      .toBe(operation(
        'book_recovery/indexes/by_snapshot_idempotency/$snapshotId/$idempotencyKey',
        '.write',
      ));
    expect(JSON.stringify(candidate.rules)).toBe(JSON.stringify(generatedRules.rules));
  });

  it('has no browser or ordinary-service write path', () => {
    const operationWrite = String(readRule(
      generatedRules.rules,
      'book_recovery/operations/$operationId/.write',
    ));
    const indexWrite = String(readRule(
      generatedRules.rules,
      'book_recovery/indexes/by_snapshot_idempotency/$snapshotId/$idempotencyKey/.write',
    ));

    expect(operationWrite).toContain('auth != null');
    expect(indexWrite).toContain('auth != null');
    expect(operationWrite).toContain('auth.token.bkr.s == true');
    expect(indexWrite).toContain('auth.token.bkr.s == true');
    expect(operationWrite).not.toContain('auth.uid');
    expect(indexWrite).not.toContain('auth.uid');
    expect(readRule(generatedRules.rules, 'book_recovery/.write')).toBe('false');
    expect(readRule(generatedRules.rules, 'book_recovery/indexes/.write')).toBe('false');
  });
});
