import { describe, expect, it, vi } from 'vitest';
import { createBookUpdateActionBrowserClient } from './bookUpdateAction.browser';
import type { BookUpdateActionCommand, BookUpdateActionRecord } from './bookUpdateAction.types';

const command: BookUpdateActionCommand = {
  actorId: 'teacher-1', bookId: 'book-1', snapshotId: 'snapshot-1', snapshotFingerprint: 'a'.repeat(64),
  idempotencyKey: 'operation-1', reason: 'Reviewed update', selections: [{
    contextKey: 'homework:one', placementId: 'placement-1', choice: 'retain-current',
  }],
};

describe('#109 browser command client', () => {
  it('posts only to the fixed command seam and does not trust body actor/book identity', async () => {
    const action = {
      schemaVersion: 1, actionId: 'action-1', actorId: 'teacher-1', bookId: 'book-1', state: 'accepted',
    } as BookUpdateActionRecord;
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => (
      Response.json({ status: 'accepted', action }, { status: 201 })
    ));
    const client = createBookUpdateActionBrowserClient({ getIdToken: async () => 'token', fetchImpl });
    await expect(client.accept(command)).resolves.toMatchObject({ status: 'accepted' });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('/book-updates/books/book-1/commands');
    expect(init).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String(init?.body))).not.toHaveProperty('actorId');
    expect(JSON.parse(String(init?.body))).not.toHaveProperty('bookId');
  });

  it('maps Worker authorization denial without exposing a ledger mutation API', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => (
      Response.json({ code: 'unauthorized' }, { status: 403 })
    ));
    const client = createBookUpdateActionBrowserClient({ getIdToken: async () => 'token', fetchImpl });
    await expect(client.accept(command)).resolves.toEqual({ status: 'blocked', code: 'unauthorized' });
    expect(Object.keys(client)).toEqual(['accept']);
  });
});
