import { describe, expect, it } from 'vitest';

import fragment from '../../../cloudflare/src/upload-worker/book-rules/fragments/19.json';
import publicationFragment from '../../../cloudflare/src/upload-worker/book-rules/fragments/16A.json';

const canonicalPaths = [
  'book_activity/versions/$activityId/$versionId',
  'book_activity/student_safe_projections/$activityId/$versionId',
] as const;

const operation = (path: string, rule: '.read' | '.write' | '.validate') => {
  const found = fragment.operations.find((candidate) =>
    candidate.path === path && candidate.rule === rule);
  expect(found, `${path} ${rule}`).toBeDefined();
  return found!;
};

describe('PRD0062 #68 durable Activity revision rule fragment', () => {
  it('owns one bounded revision-control CAS and leaves canonical payload paths with #64', () => {
    expect(fragment).toMatchObject({
      schemaVersion: 1,
      ticketId: '19',
      owner: {
        issue: 68,
        serviceIdentity: 'book_activity_revision_service',
        leastPrivilegePaths: [
          'users/$ownerId',
          'book_activity/revision_control/$activityId',
        ],
      },
    });
    expect(fragment.owner.generatedRuleLocations).toEqual(
      fragment.operations.map((candidate) => `${candidate.path}/${candidate.rule}`),
    );
    for (const path of canonicalPaths) {
      expect(fragment.operations.some((candidate) => candidate.path === path)).toBe(false);
      expect(publicationFragment.operations.filter((candidate) =>
        candidate.path === path)).toHaveLength(3);
    }
  });

  it('keeps the Activity root default-deny and binds control reads to exact service/owner/activity', () => {
    expect(operation('book_activity', '.read').expression).toBe('false');
    expect(operation('book_activity', '.write').expression).toBe('false');
    const read = operation('book_activity/revision_control/$activityId', '.read').expression;
    expect(read).toContain('auth.token.book_activity_revision_service == true');
    expect(read).toContain('auth.token.book_activity_revision_activityId == $activityId');
    expect(read).toContain('!data.exists()');
    expect(read).toContain("data.child('current/ownerId').val()");
    expect(read).not.toContain('auth.uid');
  });

  it('requires the exact canonical pointer/control shape and denies sensitive payload fields', () => {
    const write = operation(
      'book_activity/revision_control/$activityId/current',
      '.write',
    ).expression;
    for (const required of [
      "newData.child('schemaVersion').val() == 1",
      "newData.child('lifecycle').val() == 'published'",
      "newData.child('activityId').val() == $activityId",
      "newData.child('activityVersionId').isString()",
      "newData.child('activityVersion').isNumber()",
      "newData.child('payloadFingerprint').isString()",
      "newData.child('updatedByOperationId').isString()",
    ]) expect(write).toContain(required);
    for (const forbidden of ['answerKey', 'credentials', 'providerAuthority', 'privateObjectKey']) {
      expect(write).toContain(`!newData.child('${forbidden}').exists()`);
    }
  });

  it('allows forward CAS by default and requires separate rollback authority for pointer reversal', () => {
    const write = operation(
      'book_activity/revision_control/$activityId/current',
      '.write',
    ).expression;
    expect(write).toContain(
      "newData.child('activityVersion').val() > data.child('activityVersion').val()",
    );
    expect(write).toContain('auth.token.book_activity_revision_rollback == true');
    expect(write).not.toMatch(/\|\|\s*true/);
    expect(write).not.toMatch(/private.?B2|50A|03B/i);
  });

  it('keeps history and operation evidence append-only, shaped, and identity-bound', () => {
    const historyWrite = operation(
      'book_activity/revision_control/$activityId/history/$activityVersionId',
      '.write',
    ).expression;
    expect(historyWrite).toContain('newData.exists()');
    expect(historyWrite).toContain('!data.exists() || newData.val() == data.val()');
    const historyValidation = operation(
      'book_activity/revision_control/$activityId/history/$activityVersionId',
      '.validate',
    ).expression;
    expect(historyValidation).toContain('data.exists() && newData.val() == data.val()');
    expect(historyValidation).toContain("newData.child('activityId').val() == $activityId");
    expect(historyValidation).toContain(
      "newData.child('activityVersionId').val() == $activityVersionId",
    );

    const operationWrite = operation(
      'book_activity/revision_control/$activityId/operations/$operationId',
      '.write',
    ).expression;
    expect(operationWrite).toContain('newData.exists()');
    expect(operationWrite).toContain('!data.exists() || newData.val() == data.val()');
    const operationValidation = operation(
      'book_activity/revision_control/$activityId/operations/$operationId',
      '.validate',
    ).expression;
    expect(operationValidation).toContain('data.exists() && newData.val() == data.val()');
    expect(operationValidation).toContain("newData.child('operationId').val() == $operationId");
    expect(operationValidation).toContain("newData.child('activityId').val() == $activityId");
  });

  it('binds the pointer to one canonical immutable version and its operation', () => {
    const write = operation(
      'book_activity/revision_control/$activityId/current',
      '.write',
    ).expression;
    expect(write).toContain(
      "root.child('book_activity/versions').child($activityId).child(newData.child('activityVersionId').val())",
    );
    expect(write).toContain(
      ".child('payloadFingerprint').val() == newData.child('payloadFingerprint').val()",
    );
    expect(write).toContain(
      "newData.parent().child('operations').child(newData.child('updatedByOperationId').val()).child('resultActivityVersionId').val() == newData.child('activityVersionId').val()",
    );
    expect(write).toContain(
      "newData.parent().child('history').child(newData.child('activityVersionId').val()).child('payloadFingerprint').val() == newData.child('payloadFingerprint').val()",
    );
    expect(write).toContain(
      ".child('createdByOperationId').val() == newData.child('updatedByOperationId').val()",
    );
    const history = operation(
      'book_activity/revision_control/$activityId/history/$activityVersionId',
      '.validate',
    ).expression;
    expect(history).toContain(
      "root.child('book_activity/versions').child($activityId).child($activityVersionId)",
    );
    const operationValidation = operation(
      'book_activity/revision_control/$activityId/operations/$operationId',
      '.validate',
    ).expression;
    expect(operationValidation).toContain(
      ".child('createdByOperationId').val() == $operationId",
    );
  });

  it('has no duplicate generated locations with the #64 destination fragment', () => {
    const locations = [
      ...fragment.owner.generatedRuleLocations,
      ...publicationFragment.owner.generatedRuleLocations,
    ];
    expect(new Set(locations).size).toBe(locations.length);
  });
});
