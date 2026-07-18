import { describe, expect, it, vi } from 'vitest';
import { materialCatalogIds } from '../../types/materialCatalog.types';
import {
  MATERIAL_SUMMARY_SCHEMA_VERSION,
  MaterialSummaryContractError,
  assertMaterialSummary,
  buildMaterialSummaryIndexCleanup,
  buildMaterialSummaryIndexPlan,
  listActiveMaterialSummaries,
  type MaterialSummary,
} from './materialSummaryPort.service';

const summary = (
  overrides: Partial<MaterialSummary> = {},
): MaterialSummary => {
  const base = {
    schemaVersion: MATERIAL_SUMMARY_SCHEMA_VERSION,
    materialId: 'material-1',
    producerId: 'reading-v2-full-test',
    materialKind: 'full-test',
    surfaceFamily: 'assessment',
    ownerId: 'teacher-1',
    title: 'Reading Test',
    visibility: 'private',
    lifecycleState: 'active',
    skillId: 'reading',
    primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
    testTypeIds: [
      materialCatalogIds.testTypeId('ielts'),
      materialCatalogIds.testTypeId('ielts'),
    ],
    tags: ['reading', 'reading'],
    questionCount: 40,
    durationMinutes: 60,
    sourceSnapshotVersionId: 'snapshot-1',
    updatedAt: '2026-07-06T00:00:00.000Z',
  } satisfies Omit<MaterialSummary, 'testTypeMembership'>;
  const merged = {
    ...base,
    ...overrides,
  };

  return {
    ...merged,
    testTypeMembership: overrides.testTypeMembership ?? Object.fromEntries(
      merged.testTypeIds.map((testTypeId) => [testTypeId, true]),
    ),
  } as MaterialSummary;
};

describe('materialSummaryPort.service', () => {
  it('builds all active summary index writes through one interface', () => {
    const plan = buildMaterialSummaryIndexPlan(summary());

    expect(plan.map((write) => write.path)).toEqual([
      'material_catalog/material_summary_indexes/v1/by_id/material-1',
      'material_catalog/material_summary_indexes/v1/by_owner/teacher-1/material-1',
      'material_catalog/material_summary_indexes/v1/by_visibility/private/material-1',
      'material_catalog/material_summary_indexes/v1/by_material_kind/full-test/material-1',
      'material_catalog/material_summary_indexes/v1/by_test_type/ielts/material-1',
    ]);
    expect(plan[0]?.value).toMatchObject({
      testTypeIds: ['ielts'],
      testTypeMembership: { ielts: true },
      tags: ['reading'],
    });
  });

  it('builds deterministic cleanup for every active index path', () => {
    const cleanup = buildMaterialSummaryIndexCleanup(summary({
      lifecycleState: 'archived',
    }));

    expect(cleanup).toHaveLength(4);
    expect(cleanup.every((write) => write.value === null)).toBe(true);
  });

  it('keeps source full-test membership on the summary row without a source bucket', () => {
    const plan = buildMaterialSummaryIndexPlan(summary({
      sourceFullTestId: 'source-full-test-1',
    }));

    expect(plan[0]?.value).toMatchObject({
      sourceFullTestId: 'source-full-test-1',
    });
    expect(plan.map((write) => write.path)).not.toContain(
      'material_catalog/material_summary_indexes/v1/by_source_full_test/source-full-test-1/material-1',
    );
  });

  it('removes stale previous membership paths during updates', () => {
    const plan = buildMaterialSummaryIndexPlan(
      summary({
        ownerId: 'teacher-2',
        visibility: 'public',
        testTypeIds: [materialCatalogIds.testTypeId('toeic')],
      }),
      summary(),
    );

    expect(plan).toEqual(expect.arrayContaining([
      {
        path: 'material_catalog/material_summary_indexes/v1/by_owner/teacher-1/material-1',
        value: null,
      },
      {
        path: 'material_catalog/material_summary_indexes/v1/by_visibility/private/material-1',
        value: null,
      },
      {
        path: 'material_catalog/material_summary_indexes/v1/by_test_type/ielts/material-1',
        value: null,
      },
      expect.objectContaining({
        path: 'material_catalog/material_summary_indexes/v1/by_owner/teacher-2/material-1',
        value: expect.objectContaining({ ownerId: 'teacher-2' }),
      }),
    ]));
  });

  it('keeps inactive tombstones while removing active projections', () => {
    const plan = buildMaterialSummaryIndexPlan(summary({
      lifecycleState: 'removed',
    }), summary());

    expect(plan).toEqual(expect.arrayContaining([
      {
        path: 'material_catalog/material_summary_indexes/v1/by_owner/teacher-1/material-1',
        value: null,
      },
      {
        path: 'material_catalog/material_summary_indexes/v1/by_id/material-1',
        value: expect.objectContaining({ lifecycleState: 'removed' }),
      },
    ]));
    expect(plan.some((write) =>
      write.path.includes('/by_visibility/') && write.value !== null,
    )).toBe(false);
  });

  it('rejects unsafe canonical payload fields', () => {
    expect(() => assertMaterialSummary({
      ...summary(),
      answerKey: { q1: 'A' },
    })).toThrow(MaterialSummaryContractError);
    expect(() => assertMaterialSummary({
      ...summary(),
      content: { prompt: 'private-source' },
    })).toThrow(MaterialSummaryContractError);
    expect(() => assertMaterialSummary({
      ...summary(),
      materialKind: 'unknown-kind',
    })).toThrow(MaterialSummaryContractError);
    expect(() => assertMaterialSummary({
      ...summary(),
      surfaceFamily: 'unknown-family',
    })).toThrow(MaterialSummaryContractError);
    expect(() => assertMaterialSummary({
      ...summary(),
      materialKind: 'book',
      surfaceFamily: 'assessment',
    })).toThrow(MaterialSummaryContractError);
    expect(() => assertMaterialSummary({
      ...summary(),
      materialKind: 'draft',
      surfaceFamily: 'draft',
      visibility: 'public',
    })).toThrow(MaterialSummaryContractError);
    expect(() => assertMaterialSummary({
      ...summary(),
      materialId: 'unsafe/path',
    })).toThrow(MaterialSummaryContractError);
    expect(() => assertMaterialSummary({
      ...summary(),
      testTypeMembership: { toeic: true },
    })).toThrow(MaterialSummaryContractError);
  });

  it('accepts old summary inputs without membership and normalizes derived membership', () => {
    const { testTypeMembership: _membership, ...oldSummary } = summary();
    expect(() => assertMaterialSummary(oldSummary)).not.toThrow();

    const plan = buildMaterialSummaryIndexPlan(oldSummary);
    expect(plan[0]?.value).toMatchObject({
      testTypeIds: ['ielts'],
      testTypeMembership: { ielts: true },
    });
  });

  it('omits optional undefined fields from index writes', () => {
    const { skillId: _skillId, ...withoutOptionalFields } = summary();
    const plan = buildMaterialSummaryIndexPlan(withoutOptionalFields);

    expect(plan[0]?.value).not.toHaveProperty('description');
    expect(plan[0]?.value).not.toHaveProperty('skillId');
    expect(plan[0]?.value).not.toHaveProperty('sourceFullTestId');
  });

  it('lists owned active summaries without canonical hydration', async () => {
    const reader = {
      read: vi.fn(async () => ({
        publicOwned: summary({
          materialId: 'public-owned',
          visibility: 'public',
          updatedAt: '2026-07-06T03:00:00.000Z',
        }),
        second: summary({
          materialId: 'second',
          updatedAt: '2026-07-06T02:00:00.000Z',
        }),
        first: summary({
          materialId: 'first',
          updatedAt: '2026-07-06T01:00:00.000Z',
        }),
      })),
    };

    const rows = await listActiveMaterialSummaries({
      scope: 'owned',
      ownerId: 'teacher-1',
    }, reader);

    expect(reader.read).toHaveBeenCalledWith(
      'material_catalog/material_summary_indexes/v1/by_owner/teacher-1',
    );
    expect(rows.map((row) => row.materialId)).toEqual(['public-owned', 'second', 'first']);
  });

  it('strips valid Reading V2 delivery metadata at the read compatibility boundary', async () => {
    const rows = await listActiveMaterialSummaries(
      { scope: 'owned', ownerId: 'teacher-1' },
      {
        read: async () => ({
          reading: {
            ...summary(),
            hasStudentSafeProjection: true,
            studentSafeProjectionReady: true,
            deliveryProjectionReady: false,
            passageRefCount: 3,
          },
        }),
      },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty('hasStudentSafeProjection');
    expect(rows[0]).not.toHaveProperty('studentSafeProjectionReady');
    expect(rows[0]).not.toHaveProperty('deliveryProjectionReady');
    expect(rows[0]).not.toHaveProperty('passageRefCount');
  });

  it.each([
    ['hasStudentSafeProjection', 'true'],
    ['studentSafeProjectionReady', 1],
    ['deliveryProjectionReady', null],
    ['passageRefCount', -1],
    ['passageRefCount', Number.NaN],
  ])('rejects malformed Reading V2 delivery metadata in %s', async (field, fieldValue) => {
    await expect(listActiveMaterialSummaries(
      { scope: 'owned', ownerId: 'teacher-1' },
      {
        read: async () => ({
          reading: {
            ...summary(),
            [field]: fieldValue,
          },
        }),
      },
    )).rejects.toThrow(/delivery metadata violates/i);
  });

  it('fails loudly on malformed or cross-scope rows instead of returning empty', async () => {
    await expect(listActiveMaterialSummaries(
      { scope: 'public' },
      {
        read: async () => ({
          private: summary({ visibility: 'private' }),
        }),
      },
    )).rejects.toThrow(/invalid public row/i);

    await expect(listActiveMaterialSummaries(
      { scope: 'owned', ownerId: 'teacher-1' },
      {
        read: async () => ({
          unsafe: {
            ...summary(),
            document: { questions: [] },
          },
        }),
      },
    )).rejects.toThrow(MaterialSummaryContractError);
  });

  it('returns empty only when the scoped index truly does not exist', async () => {
    await expect(listActiveMaterialSummaries(
      { scope: 'public' },
      { read: async () => null },
    )).resolves.toEqual([]);
  });
});
