import { describe, expect, it } from 'vitest';
import { computeBookSubmissionFingerprint, normalizeBookSubmissionMetadata } from './bookSubmissionInput.service';

describe('frozen submission input', () => {
  it('normalizes metadata and hashes the same field order independently while binding PDF identity', async () => {
    const metadata = normalizeBookSubmissionMetadata({ title: ' Book ', authors: [' Author '], testTypeIds: ['reading'] });
    expect(metadata).toEqual({ title: 'Book', authors: ['Author'], testTypeIds: ['reading'], tags: [], visibility: 'private' });
    const first = await computeBookSubmissionFingerprint(metadata, { pdfs: [{ sourceKey: 'full', sha256Hex: 'a'.repeat(64) }] });
    expect(await computeBookSubmissionFingerprint({ tags: [], title: 'Book', visibility: 'private', testTypeIds: ['reading'], authors: ['Author'] }, { pdfs: [{ sha256Hex: 'a'.repeat(64), sourceKey: 'full' }] })).toBe(first);
    expect(await computeBookSubmissionFingerprint(metadata, { pdfs: [{ sourceKey: 'full', sha256Hex: 'b'.repeat(64) }] })).not.toBe(first);
    expect(() => normalizeBookSubmissionMetadata({ title: 'Book', ownerId: 'someone' })).toThrow('metadata_invalid');
    expect(() => normalizeBookSubmissionMetadata({ title: 'Book', testTypeIds: [] })).toThrow('metadata_invalid');
  });
});
