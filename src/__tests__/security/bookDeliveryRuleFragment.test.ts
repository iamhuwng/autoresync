import { describe, expect, it } from 'vitest';
import fragment08B from '../../../cloudflare/src/upload-worker/book-rules/fragments/08B.json';
import fragment21 from '../../../cloudflare/src/upload-worker/book-rules/fragments/21.json';

describe('Ticket 08B Book Delivery rules fragment', () => {
  it('keeps generated-rule ownership with 08B and denies ancestor-shaped access', () => {
    const fragment = fragment08B;
    expect(fragment.owner).toMatchObject({ ticketId: '08B', issue: 31 });
    const roots = fragment.operations.filter((operation) => (
      operation.path === 'book_delivery'
      || operation.path === 'book_delivery/current'
      || operation.path === 'book_delivery/indexes'
    ));
    expect(roots.length).toBeGreaterThanOrEqual(6);
    expect(roots.every((operation) => operation.expression === 'false')).toBe(true);
  });

  it('allows only scoped trusted service writes and recipient-specific reads', () => {
    const fragment = fragment08B;
    const records = fragment.operations.find((operation) => operation.path === 'book_delivery/records/$bindingId' && operation.rule === '.write');
    const recordReads = fragment.operations.find((operation) => operation.path === 'book_delivery/records/$bindingId' && operation.rule === '.read');
    const currentWrites = fragment.operations.find((operation) => operation.path === 'book_delivery/current/$recipientId/$contextId' && operation.rule === '.write');
    expect(records?.expression).toContain('book_delivery_service');
    expect(records?.expression).toContain('book_delivery_ownerId');
    expect(recordReads?.expression).toContain('recipientId');
    expect(currentWrites?.expression).toContain('book_delivery_service');
  });

  it('does not grant browser writes to operations or indexes', () => {
    const fragment = fragment08B;
    const operationsWrite = fragment.operations.find((operation) => operation.path === 'book_delivery/operations/$operationId' && operation.rule === '.write');
    const indexesWrite = fragment.operations.find((operation) => operation.path === 'book_delivery/indexes' && operation.rule === '.write');
    expect(operationsWrite?.expression).toContain('book_delivery_service');
    expect(indexesWrite?.expression).toBe('false');
  });
});

describe('Ticket 21 Book Delivery projection rules fragment', () => {
  it('owns actual scoped repository paths used by the server projection resolver', () => {
    expect(fragment21.owner).toMatchObject({ ticketId: '21', issue: 72 });
    expect(fragment21.owner.generatedRuleLocations).toEqual([
      'book_delivery/scopes/.read',
      'book_delivery/scopes/.write',
      'book_delivery/scopes/$recipientId/$contextId/.read',
      'book_delivery/scopes/$recipientId/$contextId/.write',
      'book_delivery/scopes/$recipientId/$contextId/current/.read',
      'book_delivery/scopes/$recipientId/$contextId/current/.write',
      'book_delivery/scopes/$recipientId/$contextId/current/.validate',
      'book_delivery/scopes/$recipientId/$contextId/records/$bindingId/.read',
      'book_delivery/scopes/$recipientId/$contextId/records/$bindingId/.write',
      'book_delivery/scopes/$recipientId/$contextId/records/$bindingId/.validate',
      'book_delivery/scopes/$recipientId/$contextId/operations/$operationId/.read',
      'book_delivery/scopes/$recipientId/$contextId/operations/$operationId/.write',
      'book_delivery/scopes/$recipientId/$contextId/operations/$operationId/.validate',
      'book_delivery/indexes/bindings/$bindingId/.read',
      'book_delivery/indexes/bindings/$bindingId/.write',
      'book_delivery/indexes/bindings/$bindingId/.validate',
    ]);
  });

  it('denies browser direct scope access and private payload writes', () => {
    const rootRead = fragment21.operations.find((operation) =>
      operation.path === 'book_delivery/scopes' && operation.rule === '.read');
    const scopeWrite = fragment21.operations.find((operation) =>
      operation.path === 'book_delivery/scopes/$recipientId/$contextId' && operation.rule === '.write');
    const recordRead = fragment21.operations.find((operation) =>
      operation.path === 'book_delivery/scopes/$recipientId/$contextId/records/$bindingId'
      && operation.rule === '.read');

    expect(rootRead?.expression).toBe('false');
    expect(scopeWrite?.expression).toContain('auth.token.book_delivery_service == true');
    expect(scopeWrite?.expression).not.toContain('auth.uid');
    expect(scopeWrite?.expression).toContain("!newData.child('answerKey').exists()");
    expect(scopeWrite?.expression).toContain("!newData.child('providerAuthority').exists()");
    expect(scopeWrite?.expression).toContain("!newData.child('credentials').exists()");
    expect(scopeWrite?.expression).toContain("!newData.child('privateObjectKey').exists()");
    expect(scopeWrite?.expression).toContain("!data.child('recovery').exists()");
    expect(scopeWrite?.expression).toContain("!newData.child('recovery').exists()");
    expect(recordRead?.expression).toContain('auth.token.book_delivery_service == true');
    expect(recordRead?.expression).not.toContain('auth.uid');
  });

  it('constrains current pointer, binding records, operation receipts, and binding index writes', () => {
    const currentWrite = fragment21.operations.find((operation) =>
      operation.path === 'book_delivery/scopes/$recipientId/$contextId/current'
      && operation.rule === '.write');
    const recordWrite = fragment21.operations.find((operation) =>
      operation.path === 'book_delivery/scopes/$recipientId/$contextId/records/$bindingId'
      && operation.rule === '.write');
    const operationWrite = fragment21.operations.find((operation) =>
      operation.path === 'book_delivery/scopes/$recipientId/$contextId/operations/$operationId'
      && operation.rule === '.write');
    const indexWrite = fragment21.operations.find((operation) =>
      operation.path === 'book_delivery/indexes/bindings/$bindingId'
      && operation.rule === '.write');

    expect(currentWrite?.expression).toContain("newData.child('recipientId').val() == $recipientId");
    expect(currentWrite?.expression).toContain("newData.child('contextId').val() == $contextId");
    expect(recordWrite?.expression).toContain("newData.child('binding/bindingId').val() == $bindingId");
    expect(recordWrite?.expression).toContain("newData.child('binding/schemaVersion').val() == 3");
    expect(recordWrite?.expression).toContain("newData.child('binding/recipient/recipientId').val() == $recipientId");
    expect(recordWrite?.expression).toContain("newData.child('binding/outline').hasChildren()");
    expect(recordWrite?.expression).toContain("newData.child('binding/placements').hasChildren()");
    expect(operationWrite?.expression).toContain("newData.child('result/receipt/operationId').val() == $operationId");
    expect(indexWrite?.expression).toContain("newData.child('recipientId').isString()");
    expect(indexWrite?.expression).toContain("newData.child('contextId').isString()");
  });

  it('validates ancestor-shaped trusted writes at each persisted child boundary', () => {
    const currentValidation = fragment21.operations.find((operation) =>
      operation.path === 'book_delivery/scopes/$recipientId/$contextId/current'
      && operation.rule === '.validate');
    const recordValidation = fragment21.operations.find((operation) =>
      operation.path === 'book_delivery/scopes/$recipientId/$contextId/records/$bindingId'
      && operation.rule === '.validate');
    const operationValidation = fragment21.operations.find((operation) =>
      operation.path === 'book_delivery/scopes/$recipientId/$contextId/operations/$operationId'
      && operation.rule === '.validate');
    const indexValidation = fragment21.operations.find((operation) =>
      operation.path === 'book_delivery/indexes/bindings/$bindingId'
      && operation.rule === '.validate');

    expect(currentValidation?.expression).toContain("newData.hasChildren(['bindingId', 'bindingRevision', 'recipientId', 'contextId', 'contextKind', 'status', 'updatedAt'])");
    expect(recordValidation?.expression).toContain("newData.hasChildren(['binding', 'recordRevision', 'status', 'createdAt', 'updatedAt'])");
    expect(operationValidation?.expression).toContain("newData.child('result/receipt/operationId').val() == $operationId");
    expect(indexValidation?.expression).toContain("newData.hasChildren(['recipientId', 'contextId'])");
    for (const validation of [currentValidation, recordValidation, operationValidation, indexValidation]) {
      expect(validation?.expression).toMatch(/!newData\.child\('(binding\/)?privateObjectKey'\)\.exists\(\)/u);
      expect(validation?.expression).toContain('!newData.exists() ||');
    }
  });
});
