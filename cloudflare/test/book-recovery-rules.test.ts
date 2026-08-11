import { describe, expect, it } from 'vitest';

import generatedRules from '../../database.rules.json';
import rollbackRules from '../../firebase.prd0062-118-rules.rollback.json';
import fragment49A from '../src/upload-worker/book-rules/fragments/49A.json';
import fragment49B from '../src/upload-worker/book-rules/fragments/49B.json';
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

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]));
  }
  return value;
};

const operation = (path: string, rule: string): string => {
  const found = fragment49A.operations.find((entry) => entry.path === path && entry.rule === rule);
  if (!found) throw new Error(`Missing 49A operation ${path}/${rule}.`);
  return found.expression;
};

const recoveryOperation = (path: string, rule: string): string => {
  const found = fragment49B.operations.find((entry) => entry.path === path && entry.rule === rule);
  if (!found) throw new Error(`Missing 49B operation ${path}/${rule}.`);
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
    const indexRead = operation(
      'book_recovery/indexes/by_snapshot_idempotency/$snapshotId/$idempotencyKey',
      '.read',
    );
    expect(indexRead).toContain("auth.token.bkr.si == 'book_recovery_service'");
    expect(indexRead).toContain('auth.token.bkr.i == $snapshotId');
    expect(indexRead).toContain('auth.token.bkr.k == $idempotencyKey');
    expect(indexRead).toContain('auth.token.bkr.dl >= now');
    expect(indexRead).not.toContain('auth.uid');
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
    expect(readRule(candidate.rules, 'book_recovery/indexes/by_snapshot_idempotency/$snapshotId/$idempotencyKey/.read'))
      .toBe(operation(
        'book_recovery/indexes/by_snapshot_idempotency/$snapshotId/$idempotencyKey',
        '.read',
      ));
    expect(readRule(candidate.rules, 'book_recovery/operations/$operationId/.write'))
      .toBe(operation('book_recovery/operations/$operationId', '.write'));
    expect(readRule(candidate.rules, 'book_recovery/indexes/by_snapshot_idempotency/$snapshotId/$idempotencyKey/.write'))
      .toBe(operation(
        'book_recovery/indexes/by_snapshot_idempotency/$snapshotId/$idempotencyKey',
        '.write',
      ));
    expect(JSON.stringify(canonicalize(candidate.rules))).toBe(JSON.stringify(canonicalize(generatedRules.rules)));
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
    const indexRead = String(readRule(
      generatedRules.rules,
      'book_recovery/indexes/by_snapshot_idempotency/$snapshotId/$idempotencyKey/.read',
    ));
    expect(indexRead).toContain("auth.token.bkr.si == 'book_recovery_service'");
    expect(indexRead).toContain('auth.token.bkr.i == $snapshotId');
    expect(indexRead).toContain('auth.token.bkr.k == $idempotencyKey');
    expect(indexRead).toContain('auth.token.bkr.dl >= now');
    expect(indexRead).not.toContain('auth.uid');
    expect(readRule(generatedRules.rules, 'book_recovery/.write')).toBe('false');
    expect(readRule(generatedRules.rules, 'book_recovery/indexes/.write')).toBe('false');
  });
});

describe('#122 49B durable Delivery hold rules', () => {
  it('owns only exact recovery children under canonical scopes', () => {
    expect(fragment49B.owner.serviceIdentity).toBe('book_recovery_service');
    expect(fragment49B.owner.generatedRuleLocations).toEqual([
      'book_delivery/scopes/$recipientId/$contextId/recovery/hold/.read',
      'book_delivery/scopes/$recipientId/$contextId/recovery/hold/.write',
      'book_delivery/scopes/$recipientId/$contextId/recovery/hold/.validate',
      'book_delivery/scopes/$recipientId/$contextId/recovery/projections/$projectionKey/.read',
      'book_delivery/scopes/$recipientId/$contextId/recovery/projections/$projectionKey/.write',
      'book_delivery/scopes/$recipientId/$contextId/recovery/projections/$projectionKey/.validate',
    ]);
    expect(recoveryOperation(
      'book_delivery/scopes/$recipientId/$contextId/recovery/hold',
      '.write',
    )).not.toContain('book_delivery_service');
  });

  it('requires exact recovery scope claims, create/replay identity, and metadata-only denial', () => {
    const holdWrite = recoveryOperation(
      'book_delivery/scopes/$recipientId/$contextId/recovery/hold',
      '.write',
    );
    const projectionWrite = recoveryOperation(
      'book_delivery/scopes/$recipientId/$contextId/recovery/projections/$projectionKey',
      '.write',
    );
    for (const expression of [holdWrite, projectionWrite]) {
      expect(expression).toContain("auth.token.bkr.si == 'book_recovery_service'");
      expect(expression).toContain('auth.token.bkr.o == newData.child(\'recoveryOperationId\').val()');
      expect(expression).toContain('auth.token.bkr.r == $recipientId');
      expect(expression).toContain('auth.token.bkr.c == $contextId');
      expect(expression).toContain('newData.exists()');
      expect(expression).toContain('newData.val() == data.val()');
      for (const field of ['pdfBytes', 'pdfBody', 'providerObject', 'providerAuthority', 'objectKey', 'privateObjectKey', 'url', 'viewerLink', 'entitlement', 'credentials']) {
        expect(expression).toContain(`!newData.child('${field}').exists()`);
      }
    }
    expect(recoveryOperation(
      'book_delivery/scopes/$recipientId/$contextId/recovery/projections/$projectionKey',
      '.write',
    )).toContain("newData.child('projectionKey').val() == $projectionKey");
  });

  it('composes 49B into the exact checked-in generated rules', () => {
    const candidate = composeGeneratedBookRules(sources(), {
      baseRules: rollbackRules.rules,
      requiredFragmentIds: FINAL_BOOK_RULE_FRAGMENT_IDS,
      requireExistingRules: true,
    });
    expect(candidate.fragmentIds).toContain('49B');
    expect(readRule(candidate.rules, 'book_delivery/scopes/$recipientId/$contextId/recovery/hold/.write'))
      .toBe(recoveryOperation(
        'book_delivery/scopes/$recipientId/$contextId/recovery/hold',
        '.write',
      ));
    expect(readRule(candidate.rules, 'book_delivery/scopes/$recipientId/$contextId/recovery/projections/$projectionKey/.validate'))
      .toBe(recoveryOperation(
        'book_delivery/scopes/$recipientId/$contextId/recovery/projections/$projectionKey',
        '.validate',
      ));
    expect(JSON.stringify(canonicalize(candidate.rules))).toBe(JSON.stringify(canonicalize(generatedRules.rules)));
  });
});
