import { describe, expect, it } from 'vitest';
import fragment from '../../../cloudflare/src/upload-worker/book-rules/fragments/29.json';

type Operation = {
  path: string;
  rule: '.read' | '.write' | '.indexOn';
  expression: string;
  merge: string;
  requiresExistingRule: boolean;
};

describe('Ticket #77 Book result read rules fragment', () => {
  it('identifies the dedicated result-read service and least-privilege paths', () => {
    expect(fragment.ticketId).toBe('29');
    expect(fragment.owner).toMatchObject({
      issue: 77,
      serviceIdentity: 'book_result_read_service',
    });
    expect(fragment.owner.leastPrivilegePaths.every((path: string) => path.startsWith('book_result_read_models/'))).toBe(true);
  });

  it('denies browser/direct root and ancestor reads and writes exactly', () => {
    const operations = fragment.operations as Operation[];
    for (const path of [
      'book_result_read_models',
      'book_result_read_models/students',
      'book_result_read_models/homework',
      'book_result_read_models/details',
    ]) {
      const denyReads = operations.filter((operation) => operation.path === path && operation.rule === '.read');
      expect(denyReads).toHaveLength(1);
      expect(denyReads[0]).toMatchObject({ expression: 'false', merge: 'replace-exact-deny', requiresExistingRule: false });
    }
    expect(operations.find((operation) => operation.path === 'book_result_read_models' && operation.rule === '.write')?.expression).toBe('false');
    for (const path of [
      'book_result_read_models/students/$studentId/books/$bookId/group_summaries',
      'book_result_read_models/homework/$homeworkId/students/$studentId/books/$bookId/group_summaries',
    ]) {
      expect(operations.find((operation) =>
        operation.path === path && operation.rule === '.write')?.expression).toBe('false');
    }
  });

  it('permits only exact scoped service claims and forbids sensitive persisted fields', () => {
    const operations = fragment.operations as Operation[];
    const scopedReads = operations.filter((operation) => operation.rule === '.read' && operation.expression.includes('book_result_read_service'));
    expect(scopedReads.length).toBeGreaterThanOrEqual(4);
    for (const operation of scopedReads) {
      expect(operation.expression).toContain('auth != null');
      expect(operation.expression).toContain('auth.token.book_result_read_service == true');
    }
    const writes = operations.filter((operation) => operation.rule === '.write' && operation.expression !== 'false');
    expect(writes.length).toBeGreaterThan(0);
    for (const operation of writes) {
      expect(operation.expression).toContain('book_result_read_service');
      expect(operation.expression).toMatch(/answerKey|pdfBytes|providerAuthority|storage|privateSourceAuthority/u);
      expect(operation.path).toMatch(
        /\/group_summaries\/\$groupKey$|\/group_attempts\/\$groupKey\/\$resultId$|\/details\/\$resultId$/u,
      );
    }
  });

  it('allows bounded service reads at the two indexed collection seams only', () => {
    const operations = fragment.operations as Operation[];
    for (const path of [
      'book_result_read_models/students/$studentId/books/$bookId/group_summaries',
      'book_result_read_models/homework/$homeworkId/students/$studentId/books/$bookId/group_summaries',
      'book_result_read_models/students/$studentId/books/$bookId/group_attempts/$groupKey',
      'book_result_read_models/homework/$homeworkId/students/$studentId/books/$bookId/group_attempts/$groupKey',
    ]) {
      const read = operations.find((operation) =>
        operation.path === path && operation.rule === '.read');
      expect(read?.expression).toContain('auth.token.book_result_read_service == true');
      expect(read?.expression).toMatch(
        /query\.orderBy(?:Child|Key).+query\.limitTo(?:First|Last)/u,
      );
      expect(read?.expression).not.toBe('true');
    }
    for (const path of [
      'book_result_read_models/students/$studentId/books/$bookId/group_summaries',
      'book_result_read_models/homework/$homeworkId/students/$studentId/books/$bookId/group_summaries',
    ]) {
      expect(operations.find((operation) =>
        operation.path === path && operation.rule === '.indexOn')).toMatchObject({
        expression: 'latestSubmittedAt',
        merge: 'replace-exact-index',
        requiresExistingRule: false,
      });
    }
  });

  it('remains a fragment-level contract and does not claim assembled generated-rules proof', () => {
    expect(JSON.stringify(fragment)).not.toMatch(/database\.rules\.json|emulator|assembled|readback/iu);
  });
});
