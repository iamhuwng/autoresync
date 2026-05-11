import { describe, expect, it } from 'vitest';
import { readingV2Ids, type ReadingV2Document } from '../../types/readingV2.types';
import { READING_V2_CANONICAL_FIXTURES } from './fixtures/readingV2CanonicalFixtures';
import { deriveReadingV2MaterialMetadata } from './readingV2MaterialMetadata.service';

const fixtureDocument = (): ReadingV2Document =>
  structuredClone(READING_V2_CANONICAL_FIXTURES['sentence-completion']) as ReadingV2Document;

describe('readingV2MaterialMetadata.service', () => {
  it('derives relationship-facing metadata from document and package metadata', () => {
    const metadata = deriveReadingV2MaterialMetadata({
      materialId: readingV2Ids.materialId('material-metadata'),
      ownerId: 'teacher-1',
      document: fixtureDocument(),
      title: 'Published Reading V2 material',
      durationMinutes: 45,
      visibility: 'library-eligible',
      tags: ['ielts', 'reading'],
      updatedAt: '2026-04-25T00:00:00.000Z',
    });

    expect(metadata.deliveryEngine).toBe('reading-v2');
    expect(metadata.title).toBe('Published Reading V2 material');
    expect(metadata.relationshipSurfaces).toEqual(
      expect.arrayContaining([
        'teacher-lobby',
        'material-profile',
        'library-listing',
        'homework-assignment',
        'course-material',
        'result-identity',
        'analytics',
      ]),
    );
  });

  it('requires a metadata title before publish output is produced', () => {
    const document = { ...fixtureDocument(), title: '   ' };

    expect(() =>
      deriveReadingV2MaterialMetadata({
        materialId: readingV2Ids.materialId('material-no-title'),
        ownerId: 'teacher-1',
        document,
      }),
    ).toThrow(/requires a title/);
  });
});
