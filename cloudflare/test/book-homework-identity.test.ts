import { describe, expect, it, vi } from 'vitest';
import type { BookHomeworkAuthorityScope } from '../../src/services/book-homework/bookHomeworkAuthority.types';
import {
  bookHomeworkRecipientAuthorityId,
  readBookHomeworkRecipientAuthority,
} from '../src/upload-worker/book-homework/identity';

const scope: BookHomeworkAuthorityScope = {
  authorityId: bookHomeworkRecipientAuthorityId('homework-1', 'student-1'),
  assignmentId: 'homework-1',
  ownerId: 'teacher-1',
};

describe('Book Homework authority identity', () => {
  it('reads only the scoped recipient authority and never falls back to the root assignment', async () => {
    const read = vi.fn(async () => null);

    await expect(readBookHomeworkRecipientAuthority({ read }, scope, 'student-1')).resolves.toBeNull();

    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith(scope);
  });

  it('rejects an authority scope whose document identity is not canonical', async () => {
    const read = vi.fn(async () => null);

    await expect(readBookHomeworkRecipientAuthority(
      { read },
      { ...scope, authorityId: 'homework-1' },
      'student-1',
    )).resolves.toBeNull();

    expect(read).not.toHaveBeenCalled();
  });
});
