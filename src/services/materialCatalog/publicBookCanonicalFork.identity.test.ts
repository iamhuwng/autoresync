import { describe, expect, it } from 'vitest';
import {
  createPublicBookCanonicalForkFingerprint,
  createPublicBookCanonicalForkIds,
} from './publicBookCanonicalFork.identity';

describe('publicBookCanonicalFork.identity', () => {
  it('derives stable domain-separated destination IDs', async () => {
    const first = await createPublicBookCanonicalForkIds({
      actorId: 'teacher-1',
      operationId: '00000000-0000-4000-8000-000000000001',
    });
    const second = await createPublicBookCanonicalForkIds({
      actorId: 'teacher-1',
      operationId: '00000000-0000-4000-8000-000000000001',
    });

    expect(first).toEqual(second);
    expect(first.activityId).toMatch(/^fork-[A-Za-z0-9_-]{43}$/u);
    expect(first.activityVersionId).toMatch(/^fork-version-[A-Za-z0-9_-]{43}$/u);
    expect(first.activityId).not.toBe(first.activityVersionId);
    await expect(createPublicBookCanonicalForkIds({
      actorId: 'teacher-2',
      operationId: '00000000-0000-4000-8000-000000000001',
    })).resolves.not.toEqual(first);
  });

  it('does not collapse length-delimited or domain-separated fingerprints', async () => {
    const left = await createPublicBookCanonicalForkFingerprint(
      'public-book-fork/intent/v1',
      { actorId: 'ab', operationId: 'c' },
    );
    const right = await createPublicBookCanonicalForkFingerprint(
      'public-book-fork/intent/v1',
      { actorId: 'a', operationId: 'bc' },
    );
    const otherDomain = await createPublicBookCanonicalForkFingerprint(
      'public-book-fork/plan/v1',
      { actorId: 'ab', operationId: 'c' },
    );

    expect(left).not.toBe(right);
    expect(left).not.toBe(otherDomain);
  });
});
