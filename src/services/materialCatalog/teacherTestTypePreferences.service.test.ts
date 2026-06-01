import { describe, expect, it } from 'vitest';

import {
  materialCatalogIds,
  type MaterialTestTypeConfig,
  type TeacherTestTypePreference,
} from '../../types/materialCatalog.types';
import {
  DEFAULT_MATERIAL_TEST_TYPES,
  type MaterialCatalogAdminContext,
} from './testTypeConfig.service';
import {
  createTeacherTestTypePreferenceRepository,
  getPinnedTestTypesForTeacher,
  savePinnedTestTypesForTeacher,
  type TeacherTestTypePreferenceRepository,
} from './teacherTestTypePreferences.service';

const NOW = '2026-06-01T00:00:00.000Z';

const context: MaterialCatalogAdminContext = {
  uid: 'teacher-1',
  role: 'teacher',
  now: () => NOW,
};

const cloneType = (config: MaterialTestTypeConfig): MaterialTestTypeConfig => ({
  ...config,
  aliases: [...config.aliases],
  allowedMaterialKinds: [...config.allowedMaterialKinds],
});

const byKey = (key: string): MaterialTestTypeConfig => {
  const config = DEFAULT_MATERIAL_TEST_TYPES.find((item) => item.canonicalKey === key);

  if (!config) {
    throw new Error(`Missing default Test Type fixture: ${key}`);
  }

  return cloneType(config);
};

const createPreferenceRepository = (
  preference: TeacherTestTypePreference | null = null,
): TeacherTestTypePreferenceRepository & { writes: TeacherTestTypePreference[] } => {
  let stored = preference;
  const writes: TeacherTestTypePreference[] = [];

  return {
    writes,
    async readPreference() {
      return stored;
    },
    async writePreference(next) {
      stored = next;
      writes.push(next);
    },
  };
};

describe('teacherTestTypePreferences.service', () => {
  it('returns valid teacher preference in teacher-defined order', async () => {
    const preference = {
      teacherId: 'teacher-1',
      pinnedTestTypeIds: [
        materialCatalogIds.testTypeId('thcs'),
        materialCatalogIds.testTypeId('ielts'),
        materialCatalogIds.testTypeId('toefl'),
        materialCatalogIds.testTypeId('toeic'),
      ],
      updatedAt: NOW,
      updatedBy: 'teacher-1',
    } satisfies TeacherTestTypePreference;

    const result = await getPinnedTestTypesForTeacher('teacher-1', {
      preference,
      activeTestTypes: DEFAULT_MATERIAL_TEST_TYPES,
    });

    expect(result.source).toBe('teacher-preference');
    expect(result.warning).toBeNull();
    expect(result.testTypes.map((config) => config.canonicalKey)).toEqual([
      'THCS',
      'IELTS',
      'TOEFL',
      'TOEIC',
    ]);
  });

  it('reads and writes teacher preferences through material_catalog RTDB paths', async () => {
    const preference = {
      teacherId: 'teacher-1',
      pinnedTestTypeIds: [
        materialCatalogIds.testTypeId('ielts'),
        materialCatalogIds.testTypeId('toeic'),
        materialCatalogIds.testTypeId('toefl'),
        materialCatalogIds.testTypeId('thcs'),
      ],
      updatedAt: NOW,
      updatedBy: 'teacher-1',
    } satisfies TeacherTestTypePreference;
    const read = vi.fn(async () => preference);
    const write = vi.fn();
    const repository = createTeacherTestTypePreferenceRepository({ read, write });

    await expect(repository.readPreference('teacher-1')).resolves.toEqual(preference);
    await repository.writePreference(preference);

    expect(read).toHaveBeenCalledWith(
      'material_catalog/teacher_test_type_preferences/teacher-1',
    );
    expect(write).toHaveBeenCalledWith(
      'material_catalog/teacher_test_type_preferences/teacher-1',
      preference,
    );
  });

  it('falls back to admin default top 4 before display order', async () => {
    const activeTestTypes = DEFAULT_MATERIAL_TEST_TYPES.map((config) => ({
      ...cloneType(config),
      defaultPinnedRank:
        config.canonicalKey === 'CEFR'
          ? 1
          : config.canonicalKey === 'THPT'
            ? 2
            : config.canonicalKey === 'THCS'
              ? 3
              : config.canonicalKey === 'IELTS'
                ? 4
                : null,
    }));

    const result = await getPinnedTestTypesForTeacher('teacher-1', {
      activeTestTypes,
      preference: null,
    });

    expect(result.source).toBe('admin-default');
    expect(result.testTypes.map((config) => config.canonicalKey)).toEqual([
      'CEFR',
      'THPT',
      'THCS',
      'IELTS',
    ]);
  });

  it('replaces inactive teacher-pinned Test Types and returns a warning state', async () => {
    const activeTestTypes = [
      byKey('IELTS'),
      byKey('TOEIC'),
      byKey('TOEFL'),
      byKey('THCS'),
      byKey('THPT'),
    ];
    const preference = {
      teacherId: 'teacher-1',
      pinnedTestTypeIds: [
        materialCatalogIds.testTypeId('ielts'),
        materialCatalogIds.testTypeId('cefr'),
        materialCatalogIds.testTypeId('toefl'),
        materialCatalogIds.testTypeId('toeic'),
      ],
      updatedAt: NOW,
      updatedBy: 'teacher-1',
    } satisfies TeacherTestTypePreference;

    const result = await getPinnedTestTypesForTeacher('teacher-1', {
      activeTestTypes,
      preference,
    });

    expect(result.source).toBe('teacher-preference-repaired');
    expect(result.warning).toBe('inactive-preference-replaced');
    expect(result.testTypes.map((config) => config.canonicalKey)).toEqual([
      'IELTS',
      'TOEFL',
      'TOEIC',
      'THCS',
    ]);
  });

  it('returns only real available types when fewer than 4 active Test Types exist', async () => {
    const result = await getPinnedTestTypesForTeacher('teacher-1', {
      activeTestTypes: [byKey('IELTS'), byKey('TOEIC')],
      preference: null,
    });

    expect(result.testTypes.map((config) => config.canonicalKey)).toEqual(['IELTS', 'TOEIC']);
    expect(result.testTypes).toHaveLength(2);
  });

  it('saves exactly 4 real active ids when 4 or more active Test Types exist', async () => {
    const repository = createPreferenceRepository();

    await savePinnedTestTypesForTeacher(
      'teacher-1',
      [
        materialCatalogIds.testTypeId('ielts'),
        materialCatalogIds.testTypeId('toeic'),
        materialCatalogIds.testTypeId('toefl'),
        materialCatalogIds.testTypeId('thcs'),
      ],
      context,
      {
        activeTestTypes: DEFAULT_MATERIAL_TEST_TYPES,
        preferenceRepository: repository,
      },
    );

    expect(repository.writes).toEqual([
      {
        teacherId: 'teacher-1',
        pinnedTestTypeIds: ['ielts', 'toeic', 'toefl', 'thcs'],
        updatedAt: NOW,
        updatedBy: 'teacher-1',
      },
    ]);

    await expect(
      savePinnedTestTypesForTeacher('teacher-1', [materialCatalogIds.testTypeId('ielts')], context, {
        activeTestTypes: DEFAULT_MATERIAL_TEST_TYPES,
        preferenceRepository: repository,
      }),
    ).rejects.toThrow(/exactly 4/);
  });

  it('allows only available real ids when fewer than 4 active Test Types exist', async () => {
    const repository = createPreferenceRepository();

    await savePinnedTestTypesForTeacher(
      'teacher-1',
      [materialCatalogIds.testTypeId('ielts'), materialCatalogIds.testTypeId('toeic')],
      context,
      {
        activeTestTypes: [byKey('IELTS'), byKey('TOEIC')],
        preferenceRepository: repository,
      },
    );

    expect(repository.writes[0].pinnedTestTypeIds).toEqual(['ielts', 'toeic']);

    await expect(
      savePinnedTestTypesForTeacher(
        'teacher-1',
        [materialCatalogIds.testTypeId('ielts'), materialCatalogIds.testTypeId('thcs')],
        context,
        {
          activeTestTypes: [byKey('IELTS'), byKey('TOEIC')],
          preferenceRepository: repository,
        },
      ),
    ).rejects.toThrow(/real active Test Type/);
  });
});
