import { describe, expect, it } from 'vitest';
import {
  READING_V2_LEGACY_STORAGE_PATH_PREFIXES,
  READING_V2_STORAGE_NAMESPACE,
  assertReadingV2StoragePath,
  listReadingV2StoragePathClasses,
  readingV2StoragePaths,
} from './readingV2StoragePaths.service';

const samplePathByClass = {
  drafts: readingV2StoragePaths.drafts('draft-1'),
  passageAssets: readingV2StoragePaths.passageAssets('asset-1'),
  passageAssetVersions: readingV2StoragePaths.passageAssetVersions('asset-1', 'v1'),
  taskGroupMaterials: readingV2StoragePaths.taskGroupMaterials('material-1'),
  fullTests: readingV2StoragePaths.fullTests('full-test-1'),
  readingPassageMaterials: readingV2StoragePaths.readingPassageMaterials('passage-material-1'),
  readingPassageMaterialVersions:
    readingV2StoragePaths.readingPassageMaterialVersions('passage-material-1', 'snapshot-1'),
  fullTestCompositions: readingV2StoragePaths.fullTestCompositions('composition-1'),
  fullTestCompositionVersions:
    readingV2StoragePaths.fullTestCompositionVersions('composition-1', 'snapshot-1'),
  materialMetadata: readingV2StoragePaths.materialMetadata('material-1'),
  listingIndexes: readingV2StoragePaths.listingIndexes('teacher-materials', 'material-1'),
  relationshipIndexes: readingV2StoragePaths.relationshipIndexes('teacher-lobby', 'material-1'),
  publishedSnapshots: readingV2StoragePaths.publishedSnapshots('material-1', 'snapshot-1'),
  previewPayloads: readingV2StoragePaths.previewPayloads('draft-1'),
  studentSafeTests: readingV2StoragePaths.studentSafeTests('material-1', 'snapshot-1'),
  sessionSafePayloads: readingV2StoragePaths.sessionSafePayloads('ABC123', 'snapshot-1'),
  reviewProjections: readingV2StoragePaths.reviewProjections('material-1', 'snapshot-1'),
  attempts: readingV2StoragePaths.attempts('attempt-1'),
  results: readingV2StoragePaths.results('result-1'),
  regradeArtifacts: readingV2StoragePaths.regradeArtifacts('result-1', 'regrade-1'),
  reviewIndexes: readingV2StoragePaths.reviewIndexes('result-1'),
  analyticsOutputs: readingV2StoragePaths.analyticsOutputs('material-1', 'snapshot-1'),
  provenance: readingV2StoragePaths.provenance('provenance-1'),
  whereUsedGraph: readingV2StoragePaths.whereUsedGraph('asset-1'),
  publishCommits: readingV2StoragePaths.publishCommits('material-1', 'snapshot-1'),
} as const;

describe('readingV2StoragePaths.service', () => {
  it('declares every Reading V2 storage path class with an explicit namespace', () => {
    expect(listReadingV2StoragePathClasses().sort()).toEqual(
      Object.keys(samplePathByClass).sort(),
    );

    Object.values(samplePathByClass).forEach((path) => {
      expect(path.startsWith(`${READING_V2_STORAGE_NAMESPACE}/`)).toBe(true);
      expect(() => assertReadingV2StoragePath(path)).not.toThrow();
    });
  });

  it('does not overlap legacy Reading draft, published-test, projection, session, or result paths', () => {
    Object.values(samplePathByClass).forEach((path) => {
      READING_V2_LEGACY_STORAGE_PATH_PREFIXES.forEach((legacyPrefix) => {
        expect(path.startsWith(legacyPrefix)).toBe(false);
      });
    });
  });

  it('returns exact PRD-0052 Reading Passage and composition paths', () => {
    expect(readingV2StoragePaths.readingPassageMaterials('passage-material-1')).toBe(
      'reading_v2/reading_passage_materials/passage-material-1',
    );
    expect(
      readingV2StoragePaths.readingPassageMaterialVersions('passage-material-1', 'snapshot-1'),
    ).toBe('reading_v2/reading_passage_material_versions/passage-material-1/snapshot-1');
    expect(readingV2StoragePaths.fullTestCompositions('composition-1')).toBe(
      'reading_v2/full_test_compositions/composition-1',
    );
    expect(readingV2StoragePaths.fullTestCompositionVersions('composition-1', 'snapshot-1')).toBe(
      'reading_v2/full_test_composition_versions/composition-1/snapshot-1',
    );
    expect(readingV2StoragePaths.listingIndexes('teacher-materials', 'material-1')).toBe(
      'reading_v2/listing_indexes/teacher-materials/material-1',
    );
  });

  it('rejects unknown or legacy path classes', () => {
    expect(() => assertReadingV2StoragePath('tests/test-1')).toThrow(/reading_v2/);
    expect(() => assertReadingV2StoragePath('student_safe_tests/test-1')).toThrow(/reading_v2/);
  });
});
