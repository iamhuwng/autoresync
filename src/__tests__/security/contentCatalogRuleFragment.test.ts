import { describe, expect, it } from 'vitest';
import fragment from '../../../cloudflare/src/upload-worker/book-rules/fragments/43.json';

describe('Ticket 43 ContentCatalog rule fragment', () => {
  it('owns only the public projection boundary and denies collection scans', () => {
    expect(fragment.owner.issue).toBe(105);
    expect(fragment.operations).toHaveLength(4);
    expect(fragment.operations.find((entry) =>
      entry.path === 'material_catalog/public_book_projections'
      && entry.rule === '.read')).toMatchObject({
      merge: 'replace-exact-deny',
      expression: 'false',
    });
  });

  it('limits projection reads to authenticated teacher roles and writes to super admins', () => {
    const read = fragment.operations.find((entry) => entry.rule === '.read'
      && entry.path.endsWith('/$bookId'));
    const write = fragment.operations.find((entry) => entry.rule === '.write');
    expect(read?.expression).toContain("auth != null");
    expect(read?.expression).toContain("val() === 'teacher'");
    expect(read?.expression).toContain("val() === 'super_admin'");
    expect(write?.expression).toContain("val() === 'super_admin'");
  });

  it('forbids source, answer, teacher, candidate, Homework, and update leakage', () => {
    const validation = fragment.operations.find((entry) => entry.rule === '.validate');
    for (const field of [
      'provider', 'providerAuthority', 'objectKey', 'privateObjectKey', 'credentials',
      'answerKey', 'teacherNotes', 'candidates', 'homework', 'updates', 'sourceVersionId',
    ]) {
      expect(validation?.expression).toContain(`!newData.child('${field}').exists()`);
    }
    expect(validation).toMatchObject({
      merge: 'conjoin-existing-validation-preserving-delete',
      requiresExistingRule: true,
    });
  });
});
