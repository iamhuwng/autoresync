import { describe, expect, it } from 'vitest';
import { readingV2Ids, type ReadingV2Document } from '../../types/readingV2.types';
import { materialCatalogIds } from '../../types/materialCatalog.types';
import { DEFAULT_MATERIAL_TEST_TYPES } from '../materialCatalog/testTypeConfig.service';
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

  it('derives Reading Passage metadata with IELTS source-order display and safe list fields', () => {
    const metadata = deriveReadingV2MaterialMetadata({
      materialId: readingV2Ids.materialId('passage-material-2'),
      ownerId: 'teacher-1',
      document: fixtureDocument(),
      materialKind: 'reading-passage',
      primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
      testTypeIds: [materialCatalogIds.testTypeId('ielts')],
      testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
      sourceFullTestId: readingV2Ids.materialId('full-test-1'),
      sourceSnapshotVersionId: 'snapshot-1',
      sourceOrderKind: 'numeric',
      sourceOrderValue: 2,
      sourceQuestionRange: '14-26',
      sourceTitleSnapshot: 'Academic Reading Test 1',
      visibility: 'private',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });

    expect(metadata.materialKind).toBe('reading-passage');
    expect(metadata.title).toBe('Academic Reading Test 1 - Passage 2');
    expect(metadata.sourceOrderLabelSnapshot).toBe('Passage');
    expect(metadata.sourceOrderDisplaySnapshot).toBe('Passage 2');
    expect(metadata.sourceQuestionRange).toBe('14-26');
    expect(metadata.sourceFullTestId).toBe('full-test-1');
    expect(metadata.testTypeIds).toEqual(['ielts']);
    expect(JSON.stringify(metadata)).not.toMatch(/answerKeys|authorDiagnostics|importEvidence|hiddenProvenance/);
  });

  it('uses Test-Type configured non-IELTS source labels', () => {
    const metadata = deriveReadingV2MaterialMetadata({
      materialId: readingV2Ids.materialId('passage-toeic-part'),
      ownerId: 'teacher-1',
      document: fixtureDocument(),
      materialKind: 'reading-passage',
      primaryTestTypeId: materialCatalogIds.testTypeId('toeic'),
      testTypeIds: [materialCatalogIds.testTypeId('toeic')],
      testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
      sourceOrderKind: 'numeric',
      sourceOrderValue: 5,
      sourceTitleSnapshot: 'TOEIC Practice',
    });

    expect(metadata.sourceOrderLabelSnapshot).toBe('Part');
    expect(metadata.sourceOrderDisplaySnapshot).toBe('Part 5');
    expect(metadata.title).toBe('TOEIC Practice - Part 5');
  });

  it('supports inactive or missing Test Type display without inventing numeric source order', () => {
    const inactiveThcs = DEFAULT_MATERIAL_TEST_TYPES.map((config) =>
      config.canonicalKey === 'THCS' ? { ...config, active: false } : config,
    );
    const inactiveMetadata = deriveReadingV2MaterialMetadata({
      materialId: readingV2Ids.materialId('passage-thcs-unknown'),
      ownerId: 'teacher-1',
      document: fixtureDocument(),
      materialKind: 'reading-passage',
      primaryTestTypeId: materialCatalogIds.testTypeId('thcs'),
      testTypeIds: [materialCatalogIds.testTypeId('thcs')],
      testTypeConfigs: inactiveThcs,
      sourceOrderKind: 'unknown',
      sourceOrderValue: null,
      sourceTitleSnapshot: 'THCS Reading',
    });
    const missingMetadata = deriveReadingV2MaterialMetadata({
      materialId: readingV2Ids.materialId('passage-missing-type'),
      ownerId: 'teacher-1',
      document: fixtureDocument(),
      materialKind: 'reading-passage',
      primaryTestTypeId: materialCatalogIds.testTypeId('missing'),
      testTypeIds: [materialCatalogIds.testTypeId('missing')],
      testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
      sourceOrderKind: 'unknown',
      sourceOrderValue: null,
      sourceTitleSnapshot: 'Unknown Source',
    });

    expect(inactiveMetadata.sourceOrderDisplaySnapshot).toBe('Section unknown');
    expect(inactiveMetadata.primaryTestTypeState).toBe('inactive');
    expect(missingMetadata.sourceOrderDisplaySnapshot).toBe('Source unknown');
    expect(missingMetadata.primaryTestTypeState).toBe('missing');
  });
});
