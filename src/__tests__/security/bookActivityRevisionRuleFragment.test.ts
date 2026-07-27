import { describe, expect, it } from 'vitest';

import fragment from '../../../cloudflare/src/upload-worker/book-rules/fragments/19.json';

const operation = (path: string, rule: '.read' | '.write') => {
  const found = fragment.operations.find((candidate) => candidate.path === path && candidate.rule === rule);
  expect(found, `${path} ${rule}`).toBeDefined();
  return found!;
};

const scopedOperations = () => fragment.operations.filter((candidate) => candidate.path !== 'book_activity');

describe('PRD0062 #68 versioned Activity RTDB rule fragment', () => {
  it('owns only the versioned local Activity revision boundary', () => {
    expect(fragment).toMatchObject({
      schemaVersion: 1,
      ticketId: '19',
      owner: {
        ticketId: '19',
        issue: 68,
        serviceIdentity: 'book_activity_revision_service',
      },
    });
    expect(fragment.owner.generatedRuleLocations).toEqual(fragment.operations.map((candidate) => `${candidate.path}/${candidate.rule}`));
    expect(fragment.owner.leastPrivilegePaths).toEqual([
      'users/$ownerId',
      'book_activity/candidates/$candidateId',
      'book_activity/drafts/$activityId/$draftId',
      'book_activity/versions/$activityId/$versionId',
      'book_activity/history/$activityId/$historyId',
      'book_activity/student_safe_projections/$activityId/$versionId',
      'book_activity/current/$activityId',
      'book_activity/activity_publish_operations/$operationId',
    ]);
  });

  it('denies browser root reads/writes and leaves no permissive fallback', () => {
    expect(operation('book_activity', '.read').expression).toBe('false');
    expect(operation('book_activity', '.write').expression).toBe('false');

    for (const candidate of scopedOperations()) {
      expect(candidate.expression).toContain('auth != null');
      expect(candidate.expression).toContain('auth.token.book_activity_revision_service == true');
      expect(candidate.expression).not.toContain('auth.uid');
      expect(candidate.expression).not.toMatch(/\|\|\s*true/);
      expect(candidate.expression).not.toMatch(/book_activity_capabilities/);
      expect(candidate.expression).not.toMatch(/private.?B2|trusted.?action|50A|03B/i);
    }
  });

  it('binds candidates and mutable drafts to trusted owner-scoped Activity identity', () => {
    const candidateRead = operation('book_activity/candidates/$candidateId', '.read');
    const candidateWrite = operation('book_activity/candidates/$candidateId', '.write');
    const draftRead = operation('book_activity/drafts/$activityId/$draftId', '.read');
    const draftWrite = operation('book_activity/drafts/$activityId/$draftId', '.write');

    expect(candidateRead.expression).toContain("data.child('ownerId').val()");
    expect(candidateWrite.expression).toContain("newData.child('ownerId').val()");
    expect(candidateWrite.expression).toContain("newData.child('candidateId').val() == $candidateId");
    expect(candidateWrite.expression).toContain("newData.child('activityId').isString()");
    expect(draftRead.expression).toContain("data.child('activityId').val() == $activityId");
    expect(draftWrite.expression).toContain("newData.child('draftId').val() == $draftId");
    expect(draftWrite.expression).toContain("newData.child('revision').isNumber()");
  });

  it('makes Activity Versions and history immutable create-only records', () => {
    for (const path of [
      'book_activity/versions/$activityId/$versionId',
      'book_activity/history/$activityId/$historyId',
    ]) {
      const read = operation(path, '.read');
      const write = operation(path, '.write');
      expect(read.expression).toContain("data.child('ownerId').val()");
      expect(write.expression).toContain('!data.exists()');
      expect(write.expression).toContain("newData.child('ownerId').val()");
      expect(write.expression).not.toContain('auth.uid');
    }

    expect(operation('book_activity/versions/$activityId/$versionId', '.write').expression)
      .toContain("newData.child('lifecycle').val() == 'published'");
    expect(operation('book_activity/history/$activityId/$historyId', '.write').expression)
      .toContain("newData.child('versionId').isString()");
  });

  it('allows only answer-safe immutable projection publication', () => {
    const projection = operation('book_activity/student_safe_projections/$activityId/$versionId', '.write');
    expect(projection.expression).toContain("newData.child('projectionKind').val() == 'student-safe'");
    expect(projection.expression).toContain('!data.exists()');
    for (const field of [
      'answerKey',
      'answer',
      'authoring',
      'validation',
      'teacherNotes',
      'sourceProvenance',
      'privateObjectKey',
      'providerAuthority',
      'credentials',
    ]) {
      expect(projection.expression).toContain(`!newData.child('${field}').exists()`);
    }
  });

  it('restricts current pointer replacement to published versions and operation identity', () => {
    const read = operation('book_activity/current/$activityId', '.read');
    const write = operation('book_activity/current/$activityId', '.write');
    expect(read.expression).toContain("data.child('activityId').val() == $activityId");
    expect(write.expression).toContain('newData.exists()');
    expect(write.expression).toContain("newData.child('activityId').val() == $activityId");
    expect(write.expression).toContain("newData.child('versionId').isString()");
    expect(write.expression).toContain("newData.child('updatedByOperationId').isString()");
    expect(write.expression).toContain("newData.child('lifecycle').val() == 'published'");
    expect(write.expression).toContain("!newData.child('candidateId').exists()");
    expect(write.expression).toContain("!newData.child('draftId').exists()");
  });

  it('keeps every trusted child read/write owner- and path-bound', () => {
    for (const candidate of scopedOperations()) {
      expect(candidate.expression).toMatch(/auth\.token\.book_activity_revision_ownerId == (data|newData)\.child\('ownerId'\)\.val\(\)/);
    }
    for (const path of [
      'book_activity/drafts/$activityId/$draftId',
      'book_activity/versions/$activityId/$versionId',
      'book_activity/history/$activityId/$historyId',
      'book_activity/student_safe_projections/$activityId/$versionId',
      'book_activity/current/$activityId',
    ]) {
      expect(operation(path, '.read').expression).toContain('$activityId');
      expect(operation(path, '.write').expression).toContain('$activityId');
    }
  });
});
