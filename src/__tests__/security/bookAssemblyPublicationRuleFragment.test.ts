import { describe, expect, it } from 'vitest';

import fragment from '../../../cloudflare/src/upload-worker/book-rules/fragments/16A.json';
import revisionFragment from '../../../cloudflare/src/upload-worker/book-rules/fragments/19.json';

const canonicalPaths = [
  'book_activity/versions/$activityId/$versionId',
  'book_activity/student_safe_projections/$activityId/$versionId',
] as const;

const operation = (path: string, rule: '.read' | '.write') => {
  const found = fragment.operations.find((candidate) => candidate.path === path && candidate.rule === rule);
  expect(found, `${path} ${rule}`).toBeDefined();
  return found!;
};

describe('Book Assembly publication 16A rule fragment', () => {
  it('declares the strategy-neutral publication primitive owner and locations', () => {
    expect(fragment).toMatchObject({
      schemaVersion: 1,
      ticketId: '16A',
      owner: {
        ticketId: '16A',
        issue: 64,
        serviceIdentity: 'book_assembly_publication_service',
      },
    });
    expect(fragment.owner.generatedRuleLocations).toEqual([
      'book_assembly_publications/.read',
      'book_assembly_publications/.write',
      'book_assembly_publications/books/$bookId/.read',
      'book_assembly_publications/books/$bookId/.write',
      'book_assembly_publications/books/$bookId/versions/$manifestVersionId/.read',
      'book_assembly_publications/books/$bookId/versions/$manifestVersionId/.write',
      'book_assembly_publications/books/$bookId/activity_versions/$activityVersionRefId/.read',
      'book_assembly_publications/books/$bookId/activity_versions/$activityVersionRefId/.write',
      'book_assembly_publications/books/$bookId/activity_safe_projections/$projectionId/.read',
      'book_assembly_publications/books/$bookId/activity_safe_projections/$projectionId/.write',
      'book_assembly_publications/books/$bookId/placements/$placementId/.read',
      'book_assembly_publications/books/$bookId/placements/$placementId/.write',
      'book_assembly_publications/books/$bookId/unit_projections/$unitProjectionId/.read',
      'book_assembly_publications/books/$bookId/unit_projections/$unitProjectionId/.write',
      'book_assembly_publications/books/$bookId/delivery_plans/$deliveryPlanId/.read',
      'book_assembly_publications/books/$bookId/delivery_plans/$deliveryPlanId/.write',
      'book_assembly_publications/books/$bookId/current/.read',
      'book_assembly_publications/books/$bookId/current/.write',
      'book_assembly_publications/books/$bookId/operations/$operationId/.read',
      'book_assembly_publications/books/$bookId/operations/$operationId/.write',
      'book_assembly_publications/books/$bookId/audits/$auditId/.read',
      'book_assembly_publications/books/$bookId/audits/$auditId/.write',
      'book_activity/versions/$activityId/$versionId/.read',
      'book_activity/versions/$activityId/$versionId/.write',
      'book_activity/student_safe_projections/$activityId/$versionId/.read',
      'book_activity/student_safe_projections/$activityId/$versionId/.write',
    ]);
    expect(new Set(fragment.owner.generatedRuleLocations).size)
      .toBe(fragment.owner.generatedRuleLocations.length);
    expect(fragment.owner.generatedRuleLocations).toEqual(
      fragment.operations.map((candidate) => `${candidate.path}/${candidate.rule}`),
    );
  });

  it('denies ancestor writes so exact create-only child rules cannot be bypassed', () => {
    const rootRead = fragment.operations.find((operation) =>
      operation.path === 'book_assembly_publications' && operation.rule === '.read');
    const rootWrite = fragment.operations.find((operation) =>
      operation.path === 'book_assembly_publications' && operation.rule === '.write');
    const scopedWrite = fragment.operations.find((operation) =>
      operation.path === 'book_assembly_publications/books/$bookId' && operation.rule === '.write');

    expect(rootRead?.expression).toBe('false');
    expect(rootWrite?.expression).toBe('false');
    expect(scopedWrite?.expression).toBe('false');
    for (const path of [
      'book_assembly_publications/books/$bookId/versions/$manifestVersionId',
      'book_assembly_publications/books/$bookId/activity_versions/$activityVersionRefId',
      'book_assembly_publications/books/$bookId/activity_safe_projections/$projectionId',
      'book_assembly_publications/books/$bookId/placements/$placementId',
      'book_assembly_publications/books/$bookId/unit_projections/$unitProjectionId',
      'book_assembly_publications/books/$bookId/delivery_plans/$deliveryPlanId',
      'book_assembly_publications/books/$bookId/operations/$operationId',
      'book_assembly_publications/books/$bookId/audits/$auditId',
    ]) {
      expect(operation(path, '.write').expression).toContain('!data.exists()');
    }
  });

  it('makes immutable Manifest Versions create-only and hardens current-pointer identity', () => {
    const versionWrite = fragment.operations.find((operation) =>
      operation.path === 'book_assembly_publications/books/$bookId/versions/$manifestVersionId'
      && operation.rule === '.write');
    const pointerWrite = fragment.operations.find((operation) =>
      operation.path === 'book_assembly_publications/books/$bookId/current'
      && operation.rule === '.write');

    expect(versionWrite?.expression).toContain('!data.exists()');
    expect(versionWrite?.expression).toContain("newData.child('bookId').val() == $bookId");
    expect(versionWrite?.expression).toContain("newData.child('manifestVersionId').val() == $manifestVersionId");
    expect(versionWrite?.expression).toContain("newData.child('lifecycle').val() == 'published'");
    expect(versionWrite?.expression).toContain("newData.child('createdByCommandId').isString()");
    expect(pointerWrite?.expression).toContain("newData.child('updatedByCommandId').isString()");
    expect(pointerWrite?.expression).toContain("newData.child('operationFingerprint').isString()");
    expect(pointerWrite?.expression).toContain(
      "root.child('book_assembly_publications/books').child($bookId).child('versions').child(newData.child('manifestVersionId').val()).exists()",
    );
    expect(pointerWrite?.expression).toContain(
      "root.child('book_assembly_publications/books').child($bookId).child('versions').child(newData.child('manifestVersionId').val()).child('publicationId').val() == newData.child('publicationId').val()",
    );
    expect(pointerWrite?.expression).toContain(
      "root.child('book_assembly_publications/books').child($bookId).child('versions').child(newData.child('manifestVersionId').val()).child('createdByCommandId').val() == newData.child('updatedByCommandId').val()",
    );
    expect(pointerWrite?.expression).toContain("child('result/status').val() == 'published'");
    expect(pointerWrite?.expression).toContain("child('result/audit/status').val() == 'committed'");
    expect(pointerWrite?.expression).toContain("child('result/pointer/manifestVersionId').val() == newData.child('manifestVersionId').val()");
    expect(pointerWrite?.expression).not.toContain('auth.uid');
  });

  it('covers Activity Versions, Placements, Unit projections, and Delivery plans as service-only create paths', () => {
    const activityWrite = fragment.operations.find((operation) =>
      operation.path === 'book_assembly_publications/books/$bookId/activity_versions/$activityVersionRefId'
      && operation.rule === '.write');
    const projectionWrite = fragment.operations.find((operation) =>
      operation.path === 'book_assembly_publications/books/$bookId/activity_safe_projections/$projectionId'
      && operation.rule === '.write');
    const placementWrite = fragment.operations.find((operation) =>
      operation.path === 'book_assembly_publications/books/$bookId/placements/$placementId'
      && operation.rule === '.write');
    const unitWrite = fragment.operations.find((operation) =>
      operation.path === 'book_assembly_publications/books/$bookId/unit_projections/$unitProjectionId'
      && operation.rule === '.write');
    const deliveryWrite = fragment.operations.find((operation) =>
      operation.path === 'book_assembly_publications/books/$bookId/delivery_plans/$deliveryPlanId'
      && operation.rule === '.write');

    for (const operation of [activityWrite, projectionWrite, placementWrite, unitWrite, deliveryWrite]) {
      expect(operation?.expression).toContain('auth.token.book_assembly_publication_service == true');
      expect(operation?.expression).toContain('!data.exists()');
      expect(operation?.expression).toContain("newData.child('bookId').val() == $bookId");
      expect(operation?.expression).not.toContain('auth.uid');
    }
    expect(activityWrite?.expression).toContain("newData.child('activityVersionId').isString()");
    expect(activityWrite?.expression).toContain(
      "'m' + newData.child('manifestVersionId').val().length + ':' + newData.child('manifestVersionId').val() + 'a' + newData.child('activityVersionId').val().length + ':' + newData.child('activityVersionId').val() == $activityVersionRefId",
    );
    expect(projectionWrite?.expression).toContain("newData.child('projectionId').val() == $projectionId");
    expect(activityWrite?.expression).toContain("newData.child('safeProjectionId').isString()");
    expect(activityWrite?.expression).toContain("newData.child('canonicalPayloadFingerprint').isString()");
    expect(activityWrite?.expression).toContain("newData.child('canonicalOriginManifestVersionId').isString()");
    expect(activityWrite?.expression).toContain("newData.child('canonicalOriginPublicationId').isString()");
    expect(activityWrite?.expression).toContain("newData.child('canonicalOriginOperationId').isString()");
    expect(projectionWrite?.expression).toContain("!newData.child('answerKey').exists()");
    expect(placementWrite?.expression).toContain("newData.child('placementId').val() == $placementId");
    expect(unitWrite?.expression).toContain("newData.child('unitProjectionId').val() == $unitProjectionId");
    expect(deliveryWrite?.expression).toContain("newData.child('deliveryPlanId').val() == $deliveryPlanId");
    expect(deliveryWrite?.expression).toContain("!newData.child('providerAuthority').exists()");
  });

  it('owns the shared canonical Activity Version and projection locations exactly once', () => {
    const publicationLocations = fragment.owner.generatedRuleLocations;
    const revisionLocations = revisionFragment.owner.generatedRuleLocations;

    expect(publicationLocations.filter((location) => (
      location.startsWith('book_activity/versions/')
      || location.startsWith('book_activity/student_safe_projections/')
    ))).toEqual([
      'book_activity/versions/$activityId/$versionId/.read',
      'book_activity/versions/$activityId/$versionId/.write',
      'book_activity/student_safe_projections/$activityId/$versionId/.read',
      'book_activity/student_safe_projections/$activityId/$versionId/.write',
    ]);
    expect(publicationLocations.filter((location) => revisionLocations.includes(location))).toEqual([]);
    for (const path of canonicalPaths) {
      expect(fragment.operations.filter((candidate) => candidate.path === path)).toHaveLength(2);
      expect(revisionFragment.operations.some((candidate) => candidate.path === path)).toBe(false);
    }
  });

  it('uses exact identities, create-only canonical writes, and the canonical version schema', () => {
    const versionRead = operation(canonicalPaths[0], '.read');
    const versionWrite = operation(canonicalPaths[0], '.write');
    const projectionRead = operation(canonicalPaths[1], '.read');
    const projectionWrite = operation(canonicalPaths[1], '.write');

    for (const read of [versionRead, projectionRead]) {
      expect(read.expression).toContain('auth.token.book_assembly_publication_service == true');
      expect(read.expression).toContain('auth.token.book_activity_revision_service == true');
      expect(read.expression).toContain('auth.token.book_activity_runtime_reader_service == true');
      expect(read.expression).toContain('auth.token.book_activity_runtime_reader_ownerId');
      expect(read.expression).toContain('auth.token.book_activity_runtime_reader_activityId == $activityId');
      expect(read.expression).toContain('auth.token.book_activity_runtime_reader_activityVersionId == $versionId');
      expect(read.expression).toContain('auth.token.book_activity_runtime_reader_bookId');
      expect(read.expression).toContain('auth.token.book_activity_runtime_reader_manifestVersionId');
      expect(read.expression).toContain("child('lifecycle').val() == 'published'");
      expect(read.expression).toContain("child('current/manifestVersionId').val()");
      expect(read.expression).toContain("child('result/status').val() == 'published'");
      expect(read.expression).toContain("child('result/pointer/manifestVersionId').val()");
      expect(read.expression).toContain("data.child('activityId').val() == $activityId");
      expect(read.expression).toContain("data.child('activityVersionId').val() == $versionId");
    }

    for (const write of [versionWrite, projectionWrite]) {
      expect(write.expression).toContain('auth.token.book_assembly_publication_service == true');
      expect(write.expression).toContain('auth.token.book_activity_revision_service == true');
      expect(write.expression).toContain('!data.exists()');
      expect(write.expression).not.toContain('book_activity_runtime_reader_service');
      expect(write.expression).not.toContain('auth.uid');
      expect(write.expression).not.toContain('book_activity_capabilities');
    }

    for (const field of [
      "newData.child('activityVersionId').val() == $versionId",
      "newData.child('activityVersion').isNumber()",
      "newData.child('lifecycle').val() == 'published'",
      "newData.child('publishedAt').isString()",
      "newData.child('activity').exists()",
      "newData.child('projection').exists()",
      "newData.child('payloadFingerprint').isString()",
      "newData.child('createdByOperationId').isString()",
    ]) {
      expect(versionWrite.expression).toContain(field);
    }
    for (const field of ['bookId', 'manifestVersionId', 'publicationId', 'createdByCommandId', "newData.child('versionId')"]) {
      expect(versionWrite.expression).not.toContain(field);
    }
  });

  it('keeps canonical student projections answer-safe and private-authority safe', () => {
    const projectionWrite = operation(canonicalPaths[1], '.write');
    expect(projectionWrite.expression).toContain("newData.child('projectionKind').val() == 'student-safe'");
    expect(projectionWrite.expression).toContain("newData.child('activityId').val() == $activityId");
    expect(projectionWrite.expression).toContain("newData.child('activityVersionId').val() == $versionId");
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
      expect(projectionWrite.expression).toContain(`!newData.child('${field}').exists()`);
    }
  });

  it('keeps audit payload bounded away from obvious private publication data', () => {
    const operationWrite = fragment.operations.find((candidate) =>
      candidate.path === 'book_assembly_publications/books/$bookId/operations/$operationId'
      && candidate.rule === '.write');
    const auditWrite = fragment.operations.find((operation) =>
      operation.path === 'book_assembly_publications/books/$bookId/audits/$auditId'
      && operation.rule === '.write');

    expect(operationWrite?.expression).toContain('!data.exists()');
    expect(operationWrite?.expression).not.toContain("newData.child('bookId')");
    expect(operationWrite?.expression).not.toContain("newData.child('operationId')");
    expect(operationWrite?.expression).toContain("newData.child('fingerprint').isString()");
    expect(operationWrite?.expression).toContain("newData.child('result').exists()");
    expect(operationWrite?.expression).toContain("!newData.child('answerKey').exists()");
    expect(auditWrite?.expression).toContain("!newData.child('answerKey').exists()");
    expect(auditWrite?.expression).toContain("!newData.child('pdfBytes').exists()");
    expect(auditWrite?.expression).toContain("!newData.child('credentials').exists()");
    expect(auditWrite?.expression).toContain("newData.child('bookId').val() == $bookId");
    expect(auditWrite?.expression).toContain("newData.child('auditId').val() == $auditId");
    expect(auditWrite?.expression).toContain('!data.exists()');
  });
});
