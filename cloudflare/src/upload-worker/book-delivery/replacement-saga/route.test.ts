import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ReplacementSagaDependencies } from './contract.ts';
import { handleReplacementSagaRoute } from './route.ts';

const fragment = JSON.parse(readFileSync(new URL('../../book-rules/fragments/46A.json', import.meta.url), 'utf8')) as {
  readonly operations: readonly { readonly path: string; readonly rule: string; readonly expression: string }[];
};

const dependencies = (enabled: boolean): ReplacementSagaDependencies => ({ enabled } as ReplacementSagaDependencies);
const request = (path: string, init: RequestInit = {}) => new Request(`https://example.test${path}`, { method: 'POST', ...init });

describe('#116 route fencing', () => {
  it('authenticates before reporting the disabled route', async () => {
    const response = await handleReplacementSagaRoute({ request: request('/v1/book-replacement-sagas/books/book-1/commands'), dependencies: dependencies(false) });
    expect(response.status).toBe(401);
  });

  it('requires the canonical path and rejects query or fragment suffixes', async () => {
    const route = (path: string) => handleReplacementSagaRoute({ request: request(path), uid: 'teacher-1', dependencies: dependencies(true) });
    await expect(route('/book-replacement-sagas/books/book-1/commands')).resolves.toHaveProperty('status', 404);
    await expect(route('/v1/book-replacement-sagas/books/book-1/commands?x=1')).resolves.toHaveProperty('status', 404);
    await expect(route('/v1/book-replacement-sagas/books/book-1/commands#fragment')).resolves.toHaveProperty('status', 404);
  });

  it('rejects encoded separators, malformed escapes, and oversized bodies', async () => {
    const route = (path: string, init?: RequestInit) => handleReplacementSagaRoute({ request: request(path, init), uid: 'teacher-1', dependencies: dependencies(true) });
    await expect(route('/v1/book-replacement-sagas/books/book%2F1/commands')).resolves.toHaveProperty('status', 404);
    await expect(route('/v1/book-replacement-sagas/books/%E0%A4%A/commands')).resolves.toHaveProperty('status', 404);
    await expect(route('/v1/book-replacement-sagas/books/book-1/commands', { body: '{' })).resolves.toHaveProperty('status', 400);
    await expect(route('/v1/book-replacement-sagas/books/book-1/commands', { headers: { 'content-length': '524289' }, body: '{}' })).resolves.toHaveProperty('status', 413);
  });

  it('keeps the inactive fragment deny-only, append-only, provenance-pinned, and token-byte-free', () => {
    const rootRead = fragment.operations.find((operation) => operation.path === 'book_replacement_sagas' && operation.rule === '.read')?.expression;
    const rootWrite = fragment.operations.find((operation) => operation.path === 'book_replacement_sagas' && operation.rule === '.write')?.expression;
    const recordWrite = fragment.operations.find((operation) => operation.path === 'book_replacement_sagas/records/$ownerId/$sagaId' && operation.rule === '.write')?.expression;
    expect(rootRead).toBe('false');
    expect(rootWrite).toBe('false');
    expect(fragment.operations.some((operation) => operation.path.includes('by_book'))).toBe(false);
    expect(recordWrite).toContain('newData.exists()');
    expect(recordWrite).toContain('!data.exists()');
    expect(recordWrite).toContain("newData.child('stateRevision').val() == 0");
    expect(recordWrite).toContain("newData.child('stateRevision').val() == data.child('stateRevision').val() + 1");
    for (const field of ['bookId', 'planId', 'requestFingerprint', 'tokenHash', 'deltaFingerprint', 'snapshotFingerprint', 'adapterFingerprint', 'acceptedAt']) {
      expect(recordWrite).toContain(`newData.child('${field}').val() == data.child('${field}').val()`);
    }
    expect(recordWrite).toContain("!newData.hasChild('confirmationToken')");
    expect(recordWrite).toContain("!newData.hasChild('token')");
  });
});
