import fragment from '../../../cloudflare/src/upload-worker/book-rules/fragments/35.json';

describe('Ticket 35 Book Homework completion rule fragment', () => {
  it('owns only the exact service-scoped completion aggregate', () => {
    expect(fragment.owner).toMatchObject({
      ticketId: '35',
      issue: 88,
      serviceIdentity: 'book_runtime_service',
    });
    expect(fragment.owner.leastPrivilegePaths).toEqual([
      'book_runtime/homework_completion/$recipientId/$contextId',
    ]);
    expect(fragment.operations.map((operation) => `${operation.path}:${operation.rule}`)).toEqual([
      'book_runtime/homework_completion/$recipientId/$contextId:.read',
      'book_runtime/homework_completion/$recipientId/$contextId:.write',
    ]);
  });

  it('denies browser-shaped access and binds writes to recipient and context path identities', () => {
    const read = fragment.operations.find((operation) => operation.rule === '.read')?.expression ?? '';
    const write = fragment.operations.find((operation) => operation.rule === '.write')?.expression ?? '';
    for (const expression of [read, write]) {
      expect(expression).toContain('auth.token.book_runtime_service == true');
      expect(expression).toContain('auth.token.book_runtime_recipientId == $recipientId');
      expect(expression).toContain('auth.token.book_runtime_contextId == $contextId');
    }
    expect(write).toContain("newData.child('recipientId').val() == $recipientId");
    expect(write).toContain("newData.child('contextId').val() == $contextId");
    expect(write).toContain("newData.child('projection').child('recipientId').val() == $recipientId");
    expect(write).toContain("newData.child('projection').child('contextId').val() == $contextId");
    expect(write).toContain("!newData.child('response').exists()");
    expect(write).toContain("!newData.child('credentials').exists()");
  });

  it('does not claim generated database.rules.json deployment ownership', () => {
    expect(fragment.owner.generatedRuleLocations).not.toContain('database.rules.json');
  });
});
