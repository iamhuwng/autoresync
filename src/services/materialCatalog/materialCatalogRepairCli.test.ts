import { describe, expect, it } from 'vitest';
import {
  buildMaterialCatalogRepairWritePayloadFromReviewedReport,
  buildMaterialCatalogRepairInputFromFirebaseSnapshot,
  createMaterialCatalogRepairOperationDigest,
  getMaterialCatalogRepairExitCode,
  parseMaterialCatalogRepairCliArgs,
  toFirebaseDatabasePath,
} from '../../../scripts/material-catalog-repair';

describe('material-catalog-repair script helpers', () => {
  it('normalizes RTDB paths for Firebase CLI reads', () => {
    expect(toFirebaseDatabasePath('material_catalog/books')).toBe('/material_catalog/books');
    expect(toFirebaseDatabasePath('/material_catalog/books')).toBe('/material_catalog/books');
    expect(toFirebaseDatabasePath('/')).toBe('/');
    expect(toFirebaseDatabasePath('')).toBe('/');
  });

  it('defaults to dry-run and requires --approved for write mode', () => {
    expect(parseMaterialCatalogRepairCliArgs(['--project', 'temp-a1437'])).toMatchObject({
      dryRun: true,
      write: false,
      projectId: 'temp-a1437',
    });

    expect(() => parseMaterialCatalogRepairCliArgs(['--write'])).toThrow(/approved/i);
    expect(() => parseMaterialCatalogRepairCliArgs(['--write', '--approved', 'lead-1']))
      .toThrow(/from-report/i);

    expect(parseMaterialCatalogRepairCliArgs([
      '--write',
      '--approved',
      'lead-1',
      '--from-report',
      'output/repair-dry-run.json',
    ])).toMatchObject({
      dryRun: false,
      write: true,
      approvedBy: 'lead-1',
      fromReportPath: 'output/repair-dry-run.json',
    });
  });

  it('maps Firebase snapshots into repair-planner input without canonical payload hydration', () => {
    const input = buildMaterialCatalogRepairInputFromFirebaseSnapshot({
      materialMetadata: {
        'passage-1': {
          materialId: 'passage-1',
          ownerId: 'teacher-1',
          title: 'Passage 1',
          visibility: 'library-eligible',
          materialKind: 'reading-passage',
          testTypeIds: ['ielts'],
          sourceFullTestId: 'full-test-1',
          updatedAt: '2026-06-02T00:00:00.000Z',
          document: { shouldNotHydrate: true },
          answerKey: { shouldNotHydrate: true },
        },
      },
      materialIndexes: {
        by_owner: {
          'teacher-1': {
            'passage-1': { materialId: 'passage-1', title: 'Stale Passage' },
          },
        },
      },
      books: {
        'book-1': {
          bookId: 'book-1',
          ownerId: 'teacher-1',
          title: 'Book 1',
          authors: [],
          primaryTestTypeId: 'ielts',
          testTypeIds: ['ielts'],
          tags: [],
          visibility: 'private',
          status: 'ready',
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-02T00:00:00.000Z',
          createdBy: 'teacher-1',
          updatedBy: 'teacher-1',
        },
      },
      bookIndexes: {},
      bookNodes: {
        'book-1': {
          'node-1': {
            nodeId: 'node-1',
            bookId: 'book-1',
            parentNodeId: null,
            type: 'chapter',
            title: 'Chapter',
            order: 1,
            materialRefs: [],
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-02T00:00:00.000Z',
          },
        },
      },
      readingV2FullTestCompositions: {
        'composition-1': {
          deliveryEngine: 'reading-v2',
          plane: 'packaging',
          schemaVersion: 1,
          compositionId: 'composition-1',
          testMaterialId: 'material-1',
          title: 'Composed Test',
          testTypeIds: ['ielts'],
          skill: 'reading',
          passageRefs: [],
          questionCount: 0,
          visibility: 'private',
          ownerId: 'teacher-1',
          publishedVersionId: 'snapshot-1',
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-02T00:00:00.000Z',
        },
      },
      readingV2FullTestCompositionVersions: {},
    });

    expect(input.materialSummaries).toEqual([
      {
        materialId: 'passage-1',
        ownerId: 'teacher-1',
        title: 'Passage 1',
        visibility: 'public',
        materialKind: 'reading-passage',
        testTypeIds: ['ielts'],
        sourceFullTestId: 'full-test-1',
        updatedAt: '2026-06-02T00:00:00.000Z',
      },
    ]);
    expect(input.materialIndexRowsByPath).toEqual({
      'material_catalog/material_indexes/by_owner/teacher-1/passage-1': {
        materialId: 'passage-1',
        title: 'Stale Passage',
      },
    });
    expect(input.books).toHaveLength(1);
    expect(input.bookNodesByBookId?.['book-1']).toHaveProperty('node-1');
    expect(input.readingV2FullTestCompositions).toHaveProperty('composition-1');
  });

  it('binds write mode to a reviewed dry-run report and aborts when reads failed', () => {
    const operations = [{
      kind: 'material-index-remove' as const,
      path: 'material_catalog/material_indexes/by_visibility/public/passage-1',
      value: null,
      reason: 'stale-material-index-path' as const,
    }];
    const reviewedReport = {
      dryRun: true,
      projectId: 'temp-a1437',
      totals: {
        operations: 1,
        operationDigest: createMaterialCatalogRepairOperationDigest(operations),
      },
      operations,
      mutation: { status: 'not-run' },
    };
    const options = parseMaterialCatalogRepairCliArgs([
      '--write',
      '--approved',
      'lead-1',
      '--from-report',
      'output/repair-dry-run.json',
      '--project',
      'temp-a1437',
    ]);

    expect(() => buildMaterialCatalogRepairWritePayloadFromReviewedReport({
      options,
      operations,
      readFailures: [{ path: 'material_catalog/books', error: 'Permission denied' }],
      reviewedReport,
    })).toThrow(/reads failed/i);

    expect(() => buildMaterialCatalogRepairWritePayloadFromReviewedReport({
      options,
      operations: [],
      readFailures: [],
      reviewedReport,
    })).toThrow(/reviewed dry-run/i);

    expect(() => buildMaterialCatalogRepairWritePayloadFromReviewedReport({
      options,
      operations,
      readFailures: [],
      reviewedReport: {
        ...reviewedReport,
        dryRun: false,
        mutation: { status: 'committed' },
      },
    })).toThrow(/reviewed dry-run/i);

    expect(buildMaterialCatalogRepairWritePayloadFromReviewedReport({
      options,
      operations,
      readFailures: [],
      reviewedReport,
    })).toEqual({
      'material_catalog/material_indexes/by_visibility/public/passage-1': null,
    });
  });

  it('treats read failures as a failed repair run', () => {
    expect(getMaterialCatalogRepairExitCode({
      readFailureCount: 0,
      mutationStatus: 'not-run',
    })).toBe(0);
    expect(getMaterialCatalogRepairExitCode({
      readFailureCount: 1,
      mutationStatus: 'not-run',
    })).toBe(1);
    expect(getMaterialCatalogRepairExitCode({
      readFailureCount: 0,
      mutationStatus: 'failed',
    })).toBe(1);
  });
});
