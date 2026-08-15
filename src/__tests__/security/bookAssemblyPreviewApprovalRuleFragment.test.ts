import { describe, expect, it } from 'vitest';

import fragment from '../../../cloudflare/src/upload-worker/book-rules/fragments/15B.json';

const root = 'book_assembly_preview_approvals';
const approvals = `${root}/books/$bookId/units/$unitKey/approvals/$approvalId`;
const revocations = `${root}/books/$bookId/units/$unitKey/revocations/$approvalId`;

const operation = (path: string, rule: '.read' | '.write') => {
  const found = fragment.operations.find((candidate) => (
    candidate.path === path && candidate.rule === rule
  ));
  expect(found, `${path} ${rule}`).toBeDefined();
  return found!;
};

describe('Book Assembly preview approval 15B rule fragment', () => {
  it('declares the existing Assembly identity and exact approval locations', () => {
    expect(fragment).toMatchObject({
      schemaVersion: 1,
      ticketId: '15B',
      owner: {
        ticketId: '15B',
        issue: 63,
        serviceIdentity: 'book_assembly_service',
      },
    });
    expect(fragment.owner.generatedRuleLocations).toEqual([
      `${root}/.read`,
      `${root}/.write`,
      `${root}/books/$bookId/.read`,
      `${root}/books/$bookId/.write`,
      `${root}/books/$bookId/units/$unitKey/.read`,
      `${root}/books/$bookId/units/$unitKey/.write`,
      `${approvals}/.read`,
      `${approvals}/.write`,
      `${revocations}/.read`,
      `${revocations}/.write`,
    ]);
    expect(fragment.owner.generatedRuleLocations).toEqual(
      fragment.operations.map((candidate) => `${candidate.path}/${candidate.rule}`),
    );
    expect(new Set(fragment.owner.generatedRuleLocations).size).toBe(
      fragment.owner.generatedRuleLocations.length,
    );
  });

  it('denies root and ancestor access so only the exact leaves can grant', () => {
    for (const path of [root, `${root}/books/$bookId`, `${root}/books/$bookId/units/$unitKey`]) {
      expect(operation(path, '.read').expression).toBe('false');
      expect(operation(path, '.write').expression).toBe('false');
    }
    for (const path of [approvals, revocations]) {
      expect(operation(path, '.write').expression).toContain('!data.exists()');
    }
  });

  it('separates exact producer and publication claims by scope', () => {
    for (const path of [approvals, revocations]) {
      const read = operation(path, '.read').expression;
      const write = operation(path, '.write').expression;

      expect(read).toContain('auth.token.book_assembly_publication_approval_service == true');
      expect(read).toContain('auth.token.book_assembly_publication_approval_bookId == $bookId');
      expect(read).toContain('auth.token.book_assembly_publication_approval_unitKey == $unitKey');
      expect(read).toContain('auth.token.book_assembly_publication_approval_approvalId == $approvalId');
      expect(read).toContain("auth.token.book_assembly_publication_approval_ownerId == data.child('actorId').val()");
      expect(read).toContain("data.child('approvalId').val() == $approvalId");
      expect(read).toContain("data.child('bookId').val() == $bookId");
      expect(read).toContain('auth.uid == auth.token.book_assembly_preview_approval_ownerId');
      expect(read).toContain('auth.uid == auth.token.book_assembly_publication_approval_ownerId');

      expect(read).toContain('auth.token.book_assembly_preview_approval_service == true');
      expect(read).toContain('auth.token.book_assembly_preview_approval_bookId == $bookId');
      expect(read).toContain('auth.token.book_assembly_preview_approval_unitKey == $unitKey');
      expect(read).toContain('auth.token.book_assembly_preview_approval_approvalId == $approvalId');
      expect(read).toContain("auth.token.book_assembly_preview_approval_ownerId == data.child('actorId').val()");
      expect(read).toContain('!data.exists()');

      expect(write).toContain('auth.token.book_assembly_preview_approval_service == true');
      expect(write).toContain('auth.token.book_assembly_preview_approval_bookId == $bookId');
      expect(write).toContain('auth.token.book_assembly_preview_approval_unitKey == $unitKey');
      expect(write).toContain('auth.token.book_assembly_preview_approval_approvalId == $approvalId');
      expect(write).toContain("auth.token.book_assembly_preview_approval_ownerId == newData.child('actorId').val()");
      expect(write).not.toContain('auth.uid');
      expect(write).not.toContain('book_runtime');
      expect(write).not.toContain('candidate_runtime');
    }
  });

  it('binds approvals and revocations to exact IDs, revisions, fingerprints, and times', () => {
    const approvalWrite = operation(approvals, '.write').expression;
    for (const required of [
      "newData.child('approvalId').val() == $approvalId",
      "newData.child('bookId').val() == $bookId",
      "newData.child('unitKey').val() == $unitKey",
      "newData.child('actorId').isString()",
      "newData.child('candidateId').isString()",
      "newData.child('bookRevision').isNumber()",
      "newData.child('candidateRevision').isNumber()",
      "newData.child('sourceSetRevision').isNumber()",
      "newData.child('registryVersion').isString()",
      "newData.child('inputFingerprint').isString()",
      "newData.child('approvalRevision').isNumber()",
      "newData.child('approvedAt').isString()",
      "newData.child('expiresAt').isString()",
      "newData.child('expiresAt').val() > newData.child('approvedAt').val()",
      "newData.child('canonicalActivityFingerprintsByKey').exists()",
    ]) expect(approvalWrite).toContain(required);

    const revocationWrite = operation(revocations, '.write').expression;
    for (const required of [
      "newData.child('approvalId').val() == $approvalId",
      "newData.child('bookId').val() == $bookId",
      "newData.child('unitKey').val() == $unitKey",
      "newData.child('actorId').isString()",
      "newData.child('revokedAt').isString()",
    ]) expect(revocationWrite).toContain(required);
  });

  it('bounds normal payloads and rejects answer, provider, and private transport fields', () => {
    for (const path of [approvals, revocations]) {
      const write = operation(path, '.write').expression;
      expect(write).toContain(path === approvals ? 'newData.numChildren() == 14' : 'newData.numChildren() == 5');
      for (const field of [
        'answer', 'answerKey', 'answers', 'credentials', 'providerAuthority', 'providerUrl',
        'providerUrls', 'objectKey', 'privateObjectKey', 'privateObjectUrl', 'signedUrl',
        'sourceBytes', 'pdfBytes', 'rawContent', 'rawPayload', 'authoring', 'teacherNotes',
        'hiddenAnswers',
      ]) {
        expect(write).toContain(`!newData.child('${field}').exists()`);
      }
    }
    expect(operation(approvals, '.write').expression).toContain(
      "newData.child('canonicalActivityFingerprintsByKey').numChildren() <= 500",
    );
  });
});
