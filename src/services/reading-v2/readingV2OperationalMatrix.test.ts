import { describe, expect, it } from 'vitest';
import {
  READING_V2_FORBIDDEN_STUDENT_FIELDS,
  READING_V2_OPERATIONAL_MATRIX,
  getReadingV2OperationalMatrixEntry,
} from './readingV2OperationalMatrix';
import {
  assertReadingV2StoragePath,
  listReadingV2StoragePathClasses,
} from './readingV2StoragePaths.service';

describe('readingV2OperationalMatrix', () => {
  it('owns every Reading V2 storage path class exactly once', () => {
    const pathClasses = READING_V2_OPERATIONAL_MATRIX.map((entry) => entry.pathClass);

    expect([...pathClasses].sort()).toEqual(listReadingV2StoragePathClasses().sort());
    expect(new Set(pathClasses).size).toBe(pathClasses.length);
  });

  it('requires every entry to define ownership, role, query, retention, projection-safety, and atomicity decisions', () => {
    READING_V2_OPERATIONAL_MATRIX.forEach((entry) => {
      expect(entry.owningService.length).toBeGreaterThan(0);
      expect(entry.consumingSurface.length).toBeGreaterThan(0);
      expect(entry.allowedRoles.length).toBeGreaterThan(0);
      expect(entry.queryPattern.length).toBeGreaterThan(0);
      expect(entry.indexRequirement.length).toBeGreaterThan(0);
      expect(entry.retentionDeletionBehavior.length).toBeGreaterThan(0);
      expect(entry.projectionSafetyRule.length).toBeGreaterThan(0);
      expect(entry.atomicityDecision).toMatch(/single-write|transaction-required|batch-required/);
      expect(() => assertReadingV2StoragePath(entry.samplePath)).not.toThrow();
    });
  });

  it('keeps student-readable projections free of forbidden author-only fields', () => {
    const studentSafe = getReadingV2OperationalMatrixEntry('studentSafeTests');
    const sessionSafe = getReadingV2OperationalMatrixEntry('sessionSafePayloads');

    expect(studentSafe.allowedRoles).toContain('student');
    expect(sessionSafe.allowedRoles).toContain('student');
    expect(studentSafe.forbiddenFields).toEqual(
      expect.arrayContaining([...READING_V2_FORBIDDEN_STUDENT_FIELDS]),
    );
    expect(sessionSafe.forbiddenFields).toEqual(
      expect.arrayContaining([...READING_V2_FORBIDDEN_STUDENT_FIELDS]),
    );
  });

  it('covers required relationship read paths and index/query decisions', () => {
    expect(getReadingV2OperationalMatrixEntry('passageAssets').queryPattern).toContain('topic');
    expect(getReadingV2OperationalMatrixEntry('taskGroupMaterials').consumingSurface).toContain('Teacher Lobby');
    expect(getReadingV2OperationalMatrixEntry('fullTests').consumingSurface).toContain('library');
    expect(getReadingV2OperationalMatrixEntry('studentSafeTests').consumingSurface).toContain('launch');
    expect(getReadingV2OperationalMatrixEntry('sessionSafePayloads').queryPattern).toContain('sessionCode');
    expect(getReadingV2OperationalMatrixEntry('results').consumingSurface).toContain('result');
    expect(getReadingV2OperationalMatrixEntry('reviewIndexes').queryPattern).toContain('taskGroupId');
    expect(getReadingV2OperationalMatrixEntry('analyticsOutputs').indexRequirement).toContain('family');
  });
});
