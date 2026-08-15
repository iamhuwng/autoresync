import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import generatedRules from '../../database.rules.json';
import databaseRules from '../../firebase.prd0062-118-rules.rollback.json';
import trustedReportSource from '../../src/services/book-activity/bookIntegrityReport.service.ts?raw';
import trustedPreviewSource from '../src/upload-worker/book-activity-integrity/ticket91-preview-rtdb.ts?raw';
import fragment04 from '../src/upload-worker/book-rules/fragments/04.json';
import fragment20ARaw from '../src/upload-worker/book-rules/fragments/20A.json?raw';
import fragment37ARaw from '../src/upload-worker/book-rules/fragments/37A.json?raw';
import fragment37BRaw from '../src/upload-worker/book-rules/fragments/37B.json?raw';
import fragment42A from '../src/upload-worker/book-rules/fragments/42A.json';
import fragment44Raw from '../src/upload-worker/book-rules/fragments/44.json?raw';
import fragment49D from '../src/upload-worker/book-rules/fragments/49D.json';
import fragment49DRaw from '../src/upload-worker/book-rules/fragments/49D.json?raw';
import {
  discoverGeneratedBookRuleFragmentManifest,
  validateGeneratedBookRuleFragment,
  type GeneratedBookRuleFragmentSource,
} from '../src/upload-worker/book-rules/generated-fragment-manifest';
import {
  composeGeneratedBookRules,
  FINAL_BOOK_RULE_FRAGMENT_IDS,
  GENERATED_BOOK_RULE_COMPOSER_VERSION,
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

const sourceSha256 = (sourceText: string): string => createHash('sha256')
  .update(sourceText)
  .digest('hex');

const flattenRuleLeaves = (
  value: unknown,
  path: readonly string[] = [],
  leaves: Map<string, unknown> = new Map(),
): Map<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    if (path.length > 0) {
      const leaf = path[path.length - 1];
      const location = leaf.startsWith('.')
        ? [...path.slice(0, -1), leaf].join('/')
        : path.join('/');
      leaves.set(location.startsWith('/') ? location : `/${location}`.replace(/^\/(.+)\/(\.[^/]+)$/u, '$1/$2'));
    }
    return leaves;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    flattenRuleLeaves(child, [...path, key], leaves);
  }
  return leaves;
};

const hasBalancedParentheses = (expression: string): boolean => {
  let depth = 0;
  for (const character of expression) {
    if (character === '(') depth += 1;
    if (character === ')') {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
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

  it('discovers the complete 43-fragment producer manifest in stable order', () => {
    const sources = currentFragmentSources();
    const forward = discoverGeneratedBookRuleFragmentManifest(sources);
    const reverse = discoverGeneratedBookRuleFragmentManifest([...sources].reverse());

    expect(forward).toHaveLength(43);
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
    expect(forward.fragmentIds).toContain('49A');
    expect(forward.fragmentIds).toContain('49B');
    expect(forward.fragmentIds).toContain('49C');
    expect(forward.fragmentIds).toContain('49D');
    expect(forward.composerVersion).toBe(GENERATED_BOOK_RULE_COMPOSER_VERSION);
    expect(forward.operations).toHaveLength(416);
    expect(forward.operations.every((operation) => hasBalancedParentheses(operation.expression))).toBe(true);
    expect(forward.operations.every((operation) => !operation.expression.includes('numChildren'))).toBe(true);
    expect(JSON.stringify(currentFragment('49D'))).toBe(JSON.stringify(fragment49D));
    expect(sourceSha256(fragment37ARaw))
      .toBe('e42c84793e4c763ef732994afd8166d28f8be2f9d77d47e7bc662ccd48282852');
    expect(sourceSha256(fragment37BRaw))
      .toBe('a2152e623f058de22c107ba1b629c48397e84f46cd5664e6faf56f3e255b456e');
    expect(sourceSha256(fragment49DRaw))
      .toBe('48bcfe6ed11a5acbc8901498664a4d6e21cf90933f4ae7be866b40237ad922a0');
    expect(sourceSha256(fragment44Raw))
      .toBe('014a0e5fd104be06b9627ac5e2281b3d36825b5eab2eb6927f474d03310dc2fc');
    expect(sourceSha256(fragment20ARaw))
      .toBe('d288db0c09572b43f212c94a3082fe9519b6eeccff73ad7f24172c3a612db160');
    expect(trustedPreviewSource).toContain('Object.keys(events).length <= 64');
    expect(trustedPreviewSource).toContain('Object.keys(sessions).length <= 4');
    expect(trustedReportSource).toContain('source.highRiskSignals.length <= BOOK_INTEGRITY_SIGNAL_TYPES.length');
    expect(trustedReportSource).toContain('source.highRiskSignals.every');
    expect(trustedReportSource).toContain('eventRefs.length !== Number(source.totalEventCount)');
    expect(trustedReportSource).toContain('eventRefs.length > BOOK_INTEGRITY_REPORT_MAX_EVENT_REFS');
    expect(trustedReportSource).toContain("exactKeys(item, ['eventId', 'signal', 'recordedAt'])");
    const remediatedSecurityClauses: Readonly<Record<string, readonly string[]>> = {
      '37A:7': [
        "newData.hasChildren(['schemaVersion', 'recipientId', 'contextId', 'placementId', 'activityId', 'accountableAttemptId', 'events', 'sessions'])",
        "newData.child('accountableAttemptId').val() == $attemptId",
        "!newData.child('secret').exists()",
        "!newData.child('privateObjectKey').exists()",
      ],
      '37A:8': [
        "newData.hasChildren(['schemaVersion', 'eventId', 'requestFingerprint', 'signal', 'recordedAt', 'source', 'clientSessionId', 'sequence', 'recipientId', 'accountableAttemptId', 'attemptNumber', 'target', 'policyId', 'policyRevision'])",
        "newData.child('eventId').val() == $eventId",
        "newData.child('target').hasChildren(['bookId', 'bindingId', 'bindingRevision', 'contextKind', 'contextId', 'placementId', 'activityId', 'activityVersion'])",
        "newData.child('source').val() == 'browser'",
        "newData.child('requestFingerprint').isString()",
      ],
      '37A:9': [
        "newData.hasChildren(['clientSessionId', 'lastSeenAt'])",
        "newData.child('clientSessionId').val() == $sessionId",
        "newData.child('lastSeenAt').isString()",
      ],
      '37A:12': [
        "newData.child('eventId').val() == $eventId",
        "newData.child('target').hasChildren(['bookId', 'bindingId', 'bindingRevision', 'contextKind', 'contextId', 'placementId', 'activityId', 'activityVersion'])",
        "newData.child('signal').isString()",
        "!newData.child('secret').exists()",
        "!newData.child('credentials').exists()",
      ],
      '37B:4': [
        "newData.hasChildren(['schemaVersion', 'reportId', 'status', 'visibility', 'sealedAt', 'terminal', 'policy', 'risk', 'totalEventCount', 'counts', 'eventRefs'])",
        "newData.child('status').val() == 'sealed'",
        "newData.child('terminal').hasChildren(['attemptId', 'terminalId', 'resultId', 'completionId', 'attemptNumber', 'submittedAt', 'recipientId', 'ownerId', 'bookId', 'bindingId', 'bindingRevision', 'contextKind', 'contextId', 'placementId', 'activityId', 'activityVersion', 'activityVersionId', 'submissionScope', 'resultStatus', 'completionStatus'])",
        "newData.child('policy').hasChildren(['schemaVersion', 'policyId', 'policyRevision', 'flaggedEventCount', 'highRiskEventCount', 'highRiskSignals'])",
        "newData.child('totalEventCount').val() <= 64",
        "newData.child('counts').hasChildren(['visibility_loss', 'focus_loss', 'route_reload_close', 'paste', 'protected_copy', 'focus_mode_exit', 'concurrent_attempt', 'inactivity'])",
        "!newData.child('feedback').exists()",
      ],
      '37B:9': [
        "newData.hasChildren(['schemaVersion', 'ownerId', 'terminalId', 'attemptId', 'reportId'])",
        "newData.child('ownerId').val() == $ownerId",
        "newData.child('terminalId').val() == $terminalId",
        "newData.child('reportId').val() == 'book-integrity-report-v1-' + newData.child('attemptId').val()",
      ],
    };
    for (const [key, clauses] of Object.entries(remediatedSecurityClauses)) {
      const [fragmentId, operationIndex] = key.split(':');
      const operation = forward.operations.find((candidate) => (
        candidate.fragmentId === fragmentId && candidate.operationIndex === Number(operationIndex)
      ));
      expect(operation).toBeDefined();
      if (!operation) throw new Error(`Missing remediated operation ${key}.`);
      expect(operation.expression).not.toContain('numChildren');
      for (const clause of clauses) expect(operation.expression).toContain(clause);
    }
    expect(forward.byLocation[
      'book_activity_integrity/scopes/$recipientId/$contextId/$placementId/$activityId/$attemptId/events/.validate'
    ].expression).toBe('true');
    const recoveryNotificationWrite = forward.byLocation[
      'book_update_action_recovery/49d/notifications/$recipientId/$projectionKey/.write'
    ];
    expect(recoveryNotificationWrite).toMatchObject({ fragmentId: '49D', operationIndex: 9 });
    const recoveryNotificationExpression = recoveryNotificationWrite.expression;
    expect(hasBalancedParentheses(recoveryNotificationExpression)).toBe(true);
    for (const clause of [
      "auth != null",
      "auth.token.bkr.s == true",
      "auth.token.bkr.si == 'book_recovery_service'",
      "auth.token.bkr.o == newData.child('recoveryOperationId').val()",
      'auth.token.bkr.r == $recipientId',
      'newData.exists()',
      "newData.child('kind').val() == 'book-update-recovery-projection'",
      "newData.child('recordKind').val() == 'notification'",
      "newData.child('recipientId').val() == $recipientId",
      "newData.child('state').val() == 'held'",
      "newData.child('deliveryState').val() == 'unavailable'",
      "newData.child('readDenied').val() == true",
      "newData.child('activation').val() == 'held-for-reconciliation'",
      '((!data.exists()) || newData.val() == data.val())',
      "!newData.child('message').exists()",
      "!newData.child('title').exists()",
      "!newData.child('link').exists()",
    ]) expect(recoveryNotificationExpression).toContain(clause);
    const courseEnrollments = forward.rules.course_enrollments as Record<string, unknown>;
    expect(Object.keys(courseEnrollments).filter((key) => key.startsWith('$')))
      .toEqual(['$enrollmentId']);
    expect(courseEnrollments.$legacyEnrollmentId).toBeUndefined();
    const enrollmentWrite = String((courseEnrollments.$enrollmentId as Record<string, unknown>)['.write']);
    expect(enrollmentWrite).toContain('$enrollmentId');
    expect(enrollmentWrite).toContain('auth.token.legacyEnrollmentId');
    expect(forward.byLocation['course_enrollments/$enrollmentId/.write']).toMatchObject({
      fragmentId: '42A',
      operationIndex: 1,
    });
    expect(forward.byLocation['course_enrollments/$legacyEnrollmentId/.write']).toBeUndefined();
    const notifications = forward.rules.notifications as Record<string, unknown>;
    expect(Object.keys(notifications).filter((key) => key.startsWith('$')))
      .toEqual(['$userId']);
    expect(notifications.$recipientId).toBeUndefined();
    const notificationRead = String(readRule(forward.rules, 'notifications/$userId/.read'));
    expect(notificationRead).toContain('auth.uid === $userId');
    expect(notificationRead).not.toContain('$recipientId');
    const notificationTransition = String(readRule(
      forward.rules,
      'notifications/$userId/$notificationId/read/.write',
    ));
    expect(notificationTransition).toContain('auth.uid === $userId');
    expect(notificationTransition).toContain('data.exists()');
    expect(notificationTransition).toContain('newData.exists()');
    expect(notificationTransition).not.toContain('$recipientId');
    expect(forward.byLocation['notifications/$userId/.read']).toMatchObject({
      fragmentId: '38B5',
      operationIndex: 2,
    });
    expect(forward.byLocation['notifications/$userId/.write']).toMatchObject({
      fragmentId: '38B5',
      operationIndex: 3,
    });
    expect(forward.byLocation['notifications/$userId/$notificationId/.write']).toMatchObject({
      fragmentId: '38B5',
      operationIndex: 4,
    });
    expect(forward.byLocation['notifications/$userId/$notificationId/read/.write']).toMatchObject({
      fragmentId: '38B5',
      operationIndex: 5,
    });
    expect(forward.byLocation['notifications/$recipientId/.read']).toBeUndefined();
    expect(readRule(forward.rules, '/.read')).toBe(readRule(databaseRules.rules, '/.read'));
    expect(readRule(forward.rules, 'courses/.read')).toBe(readRule(databaseRules.rules, 'courses/.read'));
    expect(readRule(forward.rules, 'material_catalog/books/.write')).toBe('false');
    expect(String(readRule(forward.rules, 'material_catalog/books/$bookId/.write'))).toContain('pbcf');
    const materialBookRead = String(readRule(forward.rules, 'material_catalog/books/$bookId/.read'));
    expect(materialBookRead).toContain('auth.token.book_assembly_service == true');
    expect(materialBookRead).toContain('auth.token.book_assembly_bookId == $bookId');
    expect(materialBookRead).toContain("auth.token.book_assembly_ownerId == data.child('ownerId').val()");
    expect(readRule(forward.rules, 'material_catalog/material_summary_indexes/v1/.write')).toBeUndefined();
    expect(readRule(forward.rules, 'material_catalog/material_summary_indexes/v1/by_id/$materialId/.write')).toContain('pbcf');
    expect(String(readRule(forward.rules, 'material_catalog/books/$bookId/$other/.validate')))
      .toContain("$other == 'sourceSet'");
    expect(forward.byLocation['book_source_upload_accounts/$accountId/assemblyBooks/$bookId/$sourceKey/.write'])
      .toMatchObject({ fragmentId: '118B', operationIndex: 7 });
    expect(forward.byLocation['book_assembly_activity_bindings/owners/$ownerId/books/$bookId/units/$unitKey/activities/$activityKey/.write'])
      .toMatchObject({ fragmentId: '118C', operationIndex: 9 });
    expect(forward.byLocation['book_assembly_preview_approvals/books/$bookId/units/$unitKey/approvals/$approvalId/.write'])
      .toMatchObject({ fragmentId: '15B', operationIndex: 7 });
    expect(JSON.stringify(forward.rules)).toBe(JSON.stringify(generatedRules.rules));

    const baseLeaves = flattenRuleLeaves(databaseRules.rules);
    const generatedLeaves = flattenRuleLeaves(forward.rules);
    const ownedLocations = new Set(forward.operations.map((operation) => operation.location));
    const changedOutsideOwnedLocations = [...new Set([
      ...baseLeaves.keys(),
      ...generatedLeaves.keys(),
    ])].filter((location) => (
      JSON.stringify(baseLeaves.get(location)) !== JSON.stringify(generatedLeaves.get(location))
      && !ownedLocations.has(location)
    ));
    expect(changedOutsideOwnedLocations).toEqual([]);
  });

  it('keeps ordinary material-catalog writes on base ownership and denies inverse-gate escapes', () => {
    const candidate = composeGeneratedBookRules(currentFragmentSources(), {
      baseRules: databaseRules.rules,
      requiredFragmentIds: FINAL_BOOK_RULE_FRAGMENT_IDS,
    });
    const bookOther = String(readRule(
      candidate.rules,
      'material_catalog/books/$bookId/$other/.validate',
    ));
    expect(bookOther).not.toContain('auth == null || auth.token.pbcf.s != true');
    expect(bookOther).toContain("$other == 'bookId'");
    expect(bookOther).not.toContain("$other == 'reviewPayload'");

    const summaryOther = readRule(
      candidate.rules,
      'material_catalog/material_summary_indexes/v1/by_owner/$ownerId/$materialId/$other/.validate',
    );
    expect(summaryOther).toBe(false);
    for (const location of [
      'material_catalog/material_summary_indexes/v1/by_id/$materialId/$other/.validate',
      'material_catalog/material_summary_indexes/v1/by_owner/$ownerId/$materialId/$other/.validate',
      'material_catalog/material_summary_indexes/v1/by_visibility/$visibility/$materialId/$other/.validate',
      'material_catalog/material_summary_indexes/v1/by_material_kind/$materialKind/$materialId/$other/.validate',
      'material_catalog/material_summary_indexes/v1/by_test_type/$testTypeId/$materialId/$other/.validate',
    ]) expect(readRule(candidate.rules, location)).toBe(false);

    for (const rowPath of [
      'material_catalog/material_summary_indexes/v1/by_id/$materialId',
      'material_catalog/material_summary_indexes/v1/by_owner/$ownerId/$materialId',
      'material_catalog/material_summary_indexes/v1/by_visibility/$visibility/$materialId',
      'material_catalog/material_summary_indexes/v1/by_material_kind/$materialKind/$materialId',
      'material_catalog/material_summary_indexes/v1/by_test_type/$testTypeId/$materialId',
    ]) {
      expect(readRule(candidate.rules, `${rowPath}/hasStudentSafeProjection/.validate`))
        .toBe('newData.isBoolean()');
      expect(readRule(candidate.rules, `${rowPath}/deliveryProjectionReady/.validate`))
        .toBe('newData.isBoolean()');
      expect(readRule(candidate.rules, `${rowPath}/studentSafeProjectionReady/.validate`))
        .toBe('newData.isBoolean()');
      expect(readRule(candidate.rules, `${rowPath}/passageRefCount/.validate`))
        .toBe('newData.isNumber() && newData.val() >= 0');
    }

    expect(String(readRule(
      candidate.rules,
      'material_catalog/material_summary_indexes/v1/by_owner/$ownerId/$materialId/.write',
    ))).toContain("root.child('reading_v2').child('material_metadata').child($materialId).child('ownerId').val() === auth.uid");
    expect(String(readRule(
      candidate.rules,
      'reading_v2/full_test_compositions/$compositionId/.validate',
    ))).toContain("newData.child('state').val() === 'removed' || newData.hasChildren(['passageRefs'])");

    const bookWrite = String(readRule(candidate.rules, 'material_catalog/books/$bookId/.write'));
    expect(bookWrite).not.toContain('auth == null || auth.token.pbcf.s != true');
    expect(bookWrite).toContain("root.child('users').child(auth.uid).child('role').val() === 'teacher'");
    expect(bookWrite).toContain('auth.token.pbcf.s == true');
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
