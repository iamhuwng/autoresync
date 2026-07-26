import { describe, expect, it, vi } from 'vitest';
import { createUnitAssemblyRepository } from './unitAssembly.repository';
import type { AssemblyCandidateCommandPort } from './unitPublish.service';

const commandPort = (): AssemblyCandidateCommandPort => ({
  create: vi.fn(async () => ({ status: 'created', receipt: {
    operationId: 'op', fingerprint: 'fp', status: 'created', createdAt: 'now',
  } })),
  replace: vi.fn(async () => ({ status: 'replaced', receipt: {
    operationId: 'op', fingerprint: 'fp', status: 'replaced', createdAt: 'now',
  } })),
  validate: vi.fn(async () => ({ status: 'validated', receipt: {
    operationId: 'op', fingerprint: 'fp', status: 'validated', createdAt: 'now',
  } })),
  discard: vi.fn(async () => ({ status: 'discarded', receipt: {
    operationId: 'op', fingerprint: 'fp', status: 'discarded', createdAt: 'now',
  } })),
  load: vi.fn(async () => ({
    status: 'loaded' as const,
    candidate: {} as never,
    conflict: null,
  })),
});

describe('13A Unit Assembly repository boundary', () => {
  it('delegates only candidate commands and keeps Book/Unit scope on load', async () => {
    const commands = commandPort();
    const repository = createUnitAssemblyRepository(commands);
    await repository.load('book-1', 'unit-1', 'candidate-1');
    await repository.create({
      operationId: '00000000-0000-4000-8000-000000000001',
      bookId: 'book-1',
      expectedBookRevision: 1,
      expectedSourceSetRevision: 1,
      unitKey: 'unit-1',
      manifest: {} as never,
    });
    expect(commands.load).toHaveBeenCalledWith('book-1', 'unit-1', 'candidate-1');
    expect(commands.create).toHaveBeenCalledOnce();
    expect(Object.keys(repository)).toEqual(['create', 'replace', 'validate', 'discard', 'load']);
    expect(repository).not.toHaveProperty('publish');
    expect(repository).not.toHaveProperty('createDeliveryBinding');
  });
});
