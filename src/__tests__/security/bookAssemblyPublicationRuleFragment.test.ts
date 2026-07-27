import { describe, expect, it } from 'vitest';

import fragment from '../../../cloudflare/src/upload-worker/book-rules/fragments/16A.json';

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
      'book_assembly_publications/books/$bookId/activity_versions/$activityVersionId/.read',
      'book_assembly_publications/books/$bookId/activity_versions/$activityVersionId/.write',
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
      'book_assembly_publications/books/$bookId/audits/$auditId/.read',
      'book_assembly_publications/books/$bookId/audits/$auditId/.write',
    ]);
  });

  it('denies browser ancestor access and permits only the scoped publication service identity', () => {
    const rootRead = fragment.operations.find((operation) =>
      operation.path === 'book_assembly_publications' && operation.rule === '.read');
    const rootWrite = fragment.operations.find((operation) =>
      operation.path === 'book_assembly_publications' && operation.rule === '.write');
    const scopedWrite = fragment.operations.find((operation) =>
      operation.path === 'book_assembly_publications/books/$bookId' && operation.rule === '.write');

    expect(rootRead?.expression).toBe('false');
    expect(rootWrite?.expression).toBe('false');
    expect(scopedWrite?.expression).toContain('auth.token.book_assembly_publication_service == true');
    expect(scopedWrite?.expression).toContain('auth.token.book_assembly_publication_bookId == $bookId');
  });

  it('makes immutable Manifest Versions create-only and current pointer service-only', () => {
    const versionWrite = fragment.operations.find((operation) =>
      operation.path === 'book_assembly_publications/books/$bookId/versions/$manifestVersionId'
      && operation.rule === '.write');
    const pointerWrite = fragment.operations.find((operation) =>
      operation.path === 'book_assembly_publications/books/$bookId/current'
      && operation.rule === '.write');

    expect(versionWrite?.expression).toContain('!data.exists()');
    expect(versionWrite?.expression).toContain("newData.child('lifecycle').val() == 'published'");
    expect(versionWrite?.expression).toContain("newData.child('createdByCommandId').isString()");
    expect(pointerWrite?.expression).toContain("newData.child('updatedByCommandId').isString()");
    expect(pointerWrite?.expression).not.toContain('auth.uid');
  });

  it('covers Activity Versions, Placements, Unit projections, and Delivery plans as service-only create paths', () => {
    const activityWrite = fragment.operations.find((operation) =>
      operation.path === 'book_assembly_publications/books/$bookId/activity_versions/$activityVersionId'
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
      expect(operation?.expression).not.toContain('auth.uid');
    }
    expect(activityWrite?.expression).toContain("newData.child('activityVersionId').isString()");
    expect(projectionWrite?.expression).toContain("!newData.child('answerKey').exists()");
    expect(placementWrite?.expression).toContain("newData.child('placementId').isString()");
    expect(unitWrite?.expression).toContain("newData.child('unitProjectionId').isString()");
    expect(deliveryWrite?.expression).toContain("!newData.child('providerAuthority').exists()");
  });

  it('keeps audit payload bounded away from obvious private publication data', () => {
    const auditWrite = fragment.operations.find((operation) =>
      operation.path === 'book_assembly_publications/books/$bookId/audits/$auditId'
      && operation.rule === '.write');

    expect(auditWrite?.expression).toContain("!newData.child('answerKey').exists()");
    expect(auditWrite?.expression).toContain("!newData.child('pdfBytes').exists()");
    expect(auditWrite?.expression).toContain("!newData.child('credentials').exists()");
    expect(auditWrite?.expression).toContain('!data.exists()');
  });
});
