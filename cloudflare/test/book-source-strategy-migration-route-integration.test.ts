import { describe, expect, it, vi } from 'vitest';
import { createBookRouteHandlers } from '../src/upload-worker/book-route-handlers.ts';

const descriptor = { method: 'POST', pathTemplate: '/book-assembly/books/:bookId/units/:unitKey/migrations' } as never;
const input = (params: Record<string, string> = {}) => ({
  request: new Request('https://worker.test/book-assembly/books/book-1/units/unit-1/migrations'),
  env: {},
  uid: 'teacher-1',
  params,
  descriptor,
});

describe('Ticket 20B source-strategy migration route composition', () => {
  it('binds prepare, confirm, and discard through the canonical handler namespace', async () => {
    const migration = {
      migrate: vi.fn(async (value: unknown) => ({ action: 'migrate', value })),
      confirm: vi.fn(async (value: unknown) => ({ action: 'confirm', value })),
      discard: vi.fn(async (value: unknown) => ({ action: 'discard', value })),
    };
    const handlers = createBookRouteHandlers({ assemblyMigrationHandlers: migration });

    await handlers['bookAssemblyMigration.migrate']!(input());
    await handlers['bookAssemblyMigration.confirm']!(input({ bookId: 'book-1', unitKey: 'unit-1', migrationCandidateId: 'migration-1' }));
    await handlers['bookAssemblyMigration.discard']!(input({ bookId: 'book-1', unitKey: 'unit-1', migrationCandidateId: 'migration-1' }));

    expect(migration.migrate).toHaveBeenCalledWith(expect.objectContaining({ uid: 'teacher-1', request: expect.any(Request) }));
    expect(migration.confirm).toHaveBeenCalledWith(expect.objectContaining({
      uid: 'teacher-1', bookId: 'book-1', unitKey: 'unit-1', migrationCandidateId: 'migration-1',
    }));
    expect(migration.discard).toHaveBeenCalledWith(expect.objectContaining({
      uid: 'teacher-1', bookId: 'book-1', unitKey: 'unit-1', migrationCandidateId: 'migration-1',
    }));
  });
});
