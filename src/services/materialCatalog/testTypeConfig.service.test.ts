import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  materialCatalogIds,
  type MaterialTestTypeConfig,
  type MaterialTestTypeId,
} from '../../types/materialCatalog.types';
import {
  DEFAULT_MATERIAL_TEST_TYPES,
  createMaterialTestTypeConfigRepository,
  createTestType,
  deactivateTestType,
  getTestTypeById,
  listActiveTestTypes,
  listTeacherSelectableTestTypes,
  normalizeTestTypeLabel,
  setDefaultPinnedTestTypes,
  updateTestType,
  validateMaterialTestTypeConfig,
  type MaterialCatalogAdminContext,
  type MaterialTestTypeConfigRepository,
} from './testTypeConfig.service';

const NOW = '2026-06-01T00:00:00.000Z';

const superAdminContext: MaterialCatalogAdminContext = {
  uid: 'super-admin-1',
  role: 'super_admin',
  now: () => NOW,
};

const teacherContext: MaterialCatalogAdminContext = {
  uid: 'teacher-1',
  role: 'teacher',
  now: () => NOW,
};

const cloneType = (config: MaterialTestTypeConfig): MaterialTestTypeConfig => ({
  ...config,
  aliases: [...config.aliases],
  allowedMaterialKinds: [...config.allowedMaterialKinds],
});

const findDefault = (canonicalKey: string): MaterialTestTypeConfig => {
  const config = DEFAULT_MATERIAL_TEST_TYPES.find((item) => item.canonicalKey === canonicalKey);

  if (!config) {
    throw new Error(`Missing default Test Type fixture: ${canonicalKey}`);
  }

  return cloneType(config);
};

const createRepository = (
  initial: readonly MaterialTestTypeConfig[] = DEFAULT_MATERIAL_TEST_TYPES,
): MaterialTestTypeConfigRepository & {
  readonly writes: MaterialTestTypeConfig[];
  readonly deleted: MaterialTestTypeId[];
} => {
  const records = new Map<string, MaterialTestTypeConfig>(
    initial.map((config) => [config.testTypeId, cloneType(config)]),
  );
  const writes: MaterialTestTypeConfig[] = [];
  const deleted: MaterialTestTypeId[] = [];

  return {
    writes,
    deleted,
    async listTestTypes() {
      return Array.from(records.values()).map(cloneType);
    },
    async writeTestType(config) {
      records.set(config.testTypeId, cloneType(config));
      writes.push(cloneType(config));
    },
    async deleteTestType(testTypeId) {
      deleted.push(testTypeId);
      records.delete(testTypeId);
    },
  };
};

describe('testTypeConfig.service', () => {
  it('returns canonical defaults for IELTS, TOEIC, TOEFL, THCS, THPT, and CEFR', async () => {
    expect(DEFAULT_MATERIAL_TEST_TYPES.map((config) => config.canonicalKey)).toEqual([
      'IELTS',
      'TOEIC',
      'TOEFL',
      'THCS',
      'THPT',
      'CEFR',
    ]);

    expect((await listActiveTestTypes()).map((config) => config.canonicalKey)).toEqual([
      'IELTS',
      'TOEIC',
      'TOEFL',
      'THCS',
      'THPT',
      'CEFR',
    ]);
  });

  it('ships local logo assets for default Test Type cards', () => {
    for (const config of DEFAULT_MATERIAL_TEST_TYPES) {
      expect(config.logoUrl?.startsWith('/assets/material-test-types/')).toBe(true);
      expect(
        existsSync(join(process.cwd(), 'public', config.logoUrl?.replace(/^\//, '') ?? '')),
      ).toBe(true);
    }
  });

  it('normalizes canonical labels and aliases case-insensitively', () => {
    expect(normalizeTestTypeLabel(' ielts ')).toBe('IELTS');
    expect(normalizeTestTypeLabel('tofel')).toBe('TOEFL');
    expect(normalizeTestTypeLabel(' CELF ')).toBe('CEFR');
    expect(normalizeTestTypeLabel('unknown type')).toBe('UNKNOWN TYPE');
  });

  it('lists only active and teacher-selectable Test Types in stable display order', async () => {
    const inactiveToeic = {
      ...findDefault('TOEIC'),
      active: false,
      displayOrder: 1,
    };
    const hiddenThcs = {
      ...findDefault('THCS'),
      teacherSelectable: false,
      displayOrder: 0,
    };
    const repository = createRepository([
      findDefault('IELTS'),
      inactiveToeic,
      findDefault('TOEFL'),
      hiddenThcs,
    ]);

    expect((await listActiveTestTypes(repository)).map((config) => config.canonicalKey)).toEqual([
      'THCS',
      'IELTS',
      'TOEFL',
    ]);
    expect(
      (await listTeacherSelectableTestTypes(repository)).map((config) => config.canonicalKey),
    ).toEqual(['IELTS', 'TOEFL']);
  });

  it('reads Test Type records from the material_catalog/test_types RTDB path', async () => {
    const read = vi.fn(async () => ({
      ielts: findDefault('IELTS'),
      toeic: findDefault('TOEIC'),
    }));
    const write = vi.fn();
    const repository = createMaterialTestTypeConfigRepository({ read, write });

    expect((await listActiveTestTypes(repository)).map((config) => config.canonicalKey)).toEqual([
      'IELTS',
      'TOEIC',
    ]);
    expect(read).toHaveBeenCalledWith('material_catalog/test_types');
  });

  it('returns inactive referenced Test Types for fallback rendering', async () => {
    const repository = createRepository([
      {
        ...findDefault('TOEIC'),
        active: false,
      },
    ]);

    await expect(getTestTypeById(materialCatalogIds.testTypeId('toeic'), repository)).resolves.toMatchObject({
      canonicalKey: 'TOEIC',
      active: false,
    });
  });

  it('requires super_admin for write APIs', async () => {
    const repository = createRepository();

    await expect(
      createTestType(
        {
          ...findDefault('IELTS'),
          testTypeId: materialCatalogIds.testTypeId('cambridge'),
          canonicalKey: 'CAMBRIDGE',
          label: 'Cambridge',
          shortLabel: 'CAM',
          aliases: [],
        },
        teacherContext,
        repository,
      ),
    ).rejects.toThrow(/super_admin/);
  });

  it('creates and updates Test Types through writes without deleting records', async () => {
    const repository = createRepository();
    const cambridge = {
      ...findDefault('IELTS'),
      testTypeId: materialCatalogIds.testTypeId('cambridge'),
      canonicalKey: 'CAMBRIDGE',
      label: 'Cambridge',
      shortLabel: 'CAM',
      aliases: ['CAE'],
      displayOrder: 7,
      updatedBy: 'super-admin-1',
    };

    await createTestType(cambridge, superAdminContext, repository);
    await updateTestType(
      materialCatalogIds.testTypeId('cambridge'),
      { label: 'Cambridge English', aliases: ['CAE', 'CPE'] },
      superAdminContext,
      repository,
    );
    await deactivateTestType(materialCatalogIds.testTypeId('cambridge'), superAdminContext, repository);

    expect(repository.deleted).toEqual([]);
    expect(repository.writes.at(-1)).toMatchObject({
      testTypeId: 'cambridge',
      active: false,
      updatedAt: NOW,
      updatedBy: 'super-admin-1',
    });
  });

  it('writes Test Type records through material catalog RTDB path helpers', async () => {
    const read = vi.fn(async () => ({}));
    const write = vi.fn();
    const repository = createMaterialTestTypeConfigRepository({ read, write });
    const config = findDefault('IELTS');

    await repository.writeTestType(config);

    expect(write).toHaveBeenCalledWith('material_catalog/test_types/ielts', config);
  });

  it('validates required labels, logo policy, numeric order, and active alias collisions', () => {
    const invalid = {
      ...findDefault('IELTS'),
      canonicalKey: '',
      shortLabel: '',
      readingSourceOrderLabel: '',
      logoAlt: '',
      logoUrl: 'javascript:alert(1)',
      displayOrder: Number.NaN,
      aliases: ['TOEIC'],
    };

    expect(validateMaterialTestTypeConfig(invalid, [findDefault('TOEIC')])).toEqual(
      expect.arrayContaining([
        'canonicalKey is required',
        'shortLabel is required',
        'readingSourceOrderLabel is required',
        'logoAlt is required',
        'logoUrl must be empty, an absolute URL, or an app asset path',
        'displayOrder must be a finite number',
        'aliases must not collide with another active Test Type',
      ]),
    );
  });

  it('assigns default pinned ranks 1 through 4 only to real active Test Types', async () => {
    const repository = createRepository();

    await setDefaultPinnedTestTypes(
      [
        materialCatalogIds.testTypeId('thcs'),
        materialCatalogIds.testTypeId('ielts'),
        materialCatalogIds.testTypeId('toefl'),
        materialCatalogIds.testTypeId('toeic'),
      ],
      superAdminContext,
      repository,
    );

    const ranks = Object.fromEntries(
      repository.writes.map((config) => [config.canonicalKey, config.defaultPinnedRank ?? null]),
    );

    expect(ranks).toMatchObject({
      THCS: 1,
      IELTS: 2,
      TOEFL: 3,
      TOEIC: 4,
      THPT: null,
      CEFR: null,
    });

    await expect(
      setDefaultPinnedTestTypes(
        [
          materialCatalogIds.testTypeId('ielts'),
          materialCatalogIds.testTypeId('toefl'),
          materialCatalogIds.testTypeId('toeic'),
          materialCatalogIds.testTypeId('missing'),
        ],
        superAdminContext,
        repository,
      ),
    ).rejects.toThrow(/real active Test Type/);
  });
});
