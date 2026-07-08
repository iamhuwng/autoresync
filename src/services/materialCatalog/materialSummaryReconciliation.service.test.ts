import { describe, expect, it } from 'vitest';
import {
  READING_V2_ENGINE,
  READING_V2_PRODUCT_LABEL,
} from '../../config/readingV2FeatureFlags';
import { READING_V2_PROJECTION_FIXTURES } from '../reading-v2/fixtures/readingV2ProjectionFixtures';
import {
  buildExpectedMaterialSummaries,
  buildMaterialSummaryParityReport,
  buildMaterialSummaryReconciliationUpdatePayload,
  planMaterialSummaryReconciliation,
} from './materialSummaryReconciliation.service';

const legacyTest = {
  ownerId: 'teacher-1',
  title: 'Test',
  type: 'IELTS',
  skill: 'Reading',
  updatedAt: 1_700_000_000_000,
};

const nestedSnapshotFromPayload = (
  payload: Readonly<Record<string, unknown>>,
) => {
  const root: Record<string, any> = {};
  Object.entries(payload).forEach(([path, value]) => {
    const relative = path.replace(
      'material_catalog/material_summary_indexes/v1/',
      '',
    );
    const parts = relative.split('/');
    let cursor = root;
    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        if (value !== null) {
          cursor[part] = value;
        }
      } else {
        cursor[part] ??= {};
        cursor = cursor[part];
      }
    });
  });
  return root;
};

describe('materialSummaryReconciliation', () => {
  it('plans missing rows, repairs drift, removes orphans, then becomes idempotent', () => {
    const initial = planMaterialSummaryReconciliation({
      legacyTests: { 'test-1': legacyTest },
      currentIndex: {
        by_id: {
          orphan: {
            schemaVersion: 1,
            materialId: 'orphan',
            producerId: 'generic-test',
            materialKind: 'full-test',
            surfaceFamily: 'assessment',
            ownerId: 'teacher-1',
            title: 'Orphan',
            visibility: 'private',
            lifecycleState: 'active',
            testTypeIds: ['custom'],
            tags: ['full-test'],
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        },
      },
    });

    expect(initial.countsByReason.missing).toBeGreaterThan(0);
    expect(initial.countsByReason.orphan).toBe(1);
    const repairedSnapshot = nestedSnapshotFromPayload(
      buildMaterialSummaryReconciliationUpdatePayload(initial.operations),
    );
    const second = planMaterialSummaryReconciliation({
      legacyTests: { 'test-1': legacyTest },
      currentIndex: repairedSnapshot,
    });

    expect(second.operationCount).toBe(0);
    expect(second.operationDigest).toMatch(/^fnv1a-/);
  });

  it('replaces malformed expected rows and fails closed on malformed canonical data', () => {
    const report = planMaterialSummaryReconciliation({
      legacyTests: { 'test-1': legacyTest },
      currentIndex: {
        by_id: { 'test-1': { title: 'broken' } },
      },
    });
    expect(report.countsByReason.malformed).toBe(1);

    expect(() => buildExpectedMaterialSummaries({
      legacyTests: {
        broken: { title: 'Missing owner', updatedAt: 1 },
      },
    })).toThrow(/cannot summarize tests\/broken/i);
  });

  it('preserves valid inactive by-id summaries during active-index reconciliation', () => {
    const [activeSummary] = buildExpectedMaterialSummaries({
      legacyTests: { 'test-1': legacyTest },
    });
    const inactiveSummary = {
      ...activeSummary,
      materialId: 'archived-test',
      title: 'Archived Test',
      lifecycleState: 'archived' as const,
      updatedAt: '2026-01-02T00:00:00.000Z',
    };

    const report = planMaterialSummaryReconciliation({
      currentIndex: {
        by_id: {
          'archived-test': inactiveSummary,
        },
      },
    });

    expect(report.operationCount).toBe(0);
    expect(buildMaterialSummaryReconciliationUpdatePayload(report.operations))
      .not.toHaveProperty(
        'material_catalog/material_summary_indexes/v1/by_id/archived-test',
      );
  });

  it('removes inactive by-id summaries whose payload id does not match the path key', () => {
    const [activeSummary] = buildExpectedMaterialSummaries({
      legacyTests: { 'test-1': legacyTest },
    });
    const mismatchedInactiveSummary = {
      ...activeSummary,
      materialId: 'archived-test',
      title: 'Archived Test',
      lifecycleState: 'archived' as const,
      updatedAt: '2026-01-02T00:00:00.000Z',
    };

    const report = planMaterialSummaryReconciliation({
      currentIndex: {
        by_id: {
          'wrong-key': mismatchedInactiveSummary,
        },
      },
    });

    expect(report.operations).toEqual([{
      path: 'material_catalog/material_summary_indexes/v1/by_id/wrong-key',
      value: null,
      reason: 'orphan',
    }]);
  });

  it('reports exact by-id parity', () => {
    const expected = buildExpectedMaterialSummaries({
      legacyTests: { 'test-1': legacyTest },
    });
    expect(buildMaterialSummaryParityReport(expected, {
      'test-1': expected[0],
    })).toMatchObject({ parity: true, missingIds: [], orphanIds: [] });
    expect(buildMaterialSummaryParityReport(expected, {
      orphan: expected[0],
    })).toMatchObject({
      parity: false,
      missingIds: ['test-1'],
      orphanIds: ['orphan'],
    });
  });

  it('rebuilds Reading V2 full-test summaries with student-safe readiness facts from projections', () => {
    const projection = READING_V2_PROJECTION_FIXTURES.studentSafe;
    const materialId = 'reading-v2-full';
    const [summary] = buildExpectedMaterialSummaries({
      readingV2Metadata: {
        [materialId]: {
          materialId,
          ownerId: 'teacher-1',
          state: 'published',
          deliveryEngine: READING_V2_ENGINE,
          productLabel: READING_V2_PRODUCT_LABEL,
          title: 'Reading V2 Full Test',
          materialKind: 'full-test',
          durationMinutes: 60,
          difficulty: 'intermediate',
          description: '',
          tags: [],
          visibility: 'private',
          testTypeIds: ['ielts'],
          updatedAt: '2026-07-07T00:00:00.000Z',
          relationshipSurfaces: [],
          publishedSnapshotVersionId: projection.sourceSnapshotVersionId,
        },
      },
      readingV2StudentSafeProjections: {
        [`${materialId}:${projection.sourceSnapshotVersionId}`]: {
          ...projection,
          materialId,
          ownerId: 'teacher-1',
        },
      },
    });

    expect(summary).toMatchObject({
      materialId,
      producerId: 'reading-v2-full-test',
      questionCount: 2,
      sourceSnapshotVersionId: projection.sourceSnapshotVersionId,
      hasStudentSafeProjection: true,
      deliveryProjectionReady: true,
      studentSafeProjectionReady: true,
      passageRefCount: 1,
    });
  });

  it('ignores valid inactive by-id summaries when reporting active parity', () => {
    const expected = buildExpectedMaterialSummaries({
      legacyTests: { 'test-1': legacyTest },
    });
    const inactiveSummary = {
      ...expected[0],
      materialId: 'archived-test',
      title: 'Archived Test',
      lifecycleState: 'archived' as const,
      updatedAt: '2026-01-02T00:00:00.000Z',
    };

    expect(buildMaterialSummaryParityReport(expected, {
      'test-1': expected[0],
      'archived-test': inactiveSummary,
    })).toMatchObject({
      parity: true,
      missingIds: [],
      orphanIds: [],
      currentCount: 1,
    });
  });
});
