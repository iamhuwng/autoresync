import {
  type MaterialTestTypeConfig,
  type MaterialTestTypeId,
  type TeacherTestTypePreference,
} from '../../types/materialCatalog.types';
import { materialCatalogPaths } from './materialCatalogPaths';
import {
  listActiveTestTypes,
  sortMaterialTestTypesByDisplayOrder,
  type MaterialCatalogAdminContext,
  type MaterialTestTypeConfigRepository,
} from './testTypeConfig.service';

export interface TeacherTestTypePreferenceRepository {
  readonly readPreference: (teacherId: string) => Promise<TeacherTestTypePreference | null>;
  readonly writePreference: (preference: TeacherTestTypePreference) => Promise<void>;
}

export interface TeacherTestTypePreferenceRtdbAdapter {
  readonly read: (path: string) => Promise<unknown>;
  readonly write: (path: string, value: unknown) => Promise<void>;
}

export type TeacherPinnedTestTypesSource =
  | 'teacher-preference'
  | 'teacher-preference-repaired'
  | 'admin-default'
  | 'display-order';

export type TeacherPinnedTestTypesWarning =
  | 'inactive-preference-replaced'
  | 'invalid-preference-replaced';

export interface TeacherPinnedTestTypesResult {
  readonly testTypes: readonly MaterialTestTypeConfig[];
  readonly source: TeacherPinnedTestTypesSource;
  readonly warning: TeacherPinnedTestTypesWarning | null;
}

export interface TeacherPinnedTestTypesOptions {
  readonly activeTestTypes?: readonly MaterialTestTypeConfig[];
  readonly preference?: TeacherTestTypePreference | null;
  readonly testTypeRepository?: MaterialTestTypeConfigRepository;
  readonly preferenceRepository?: TeacherTestTypePreferenceRepository;
}

export interface SaveTeacherPinnedTestTypesOptions {
  readonly activeTestTypes?: readonly MaterialTestTypeConfig[];
  readonly testTypeRepository?: MaterialTestTypeConfigRepository;
  readonly preferenceRepository: TeacherTestTypePreferenceRepository;
}

const cloneTestType = (config: MaterialTestTypeConfig): MaterialTestTypeConfig => ({
  ...config,
  aliases: [...config.aliases],
  allowedMaterialKinds: [...config.allowedMaterialKinds],
});

const isTeacherTestTypePreference = (value: unknown): value is TeacherTestTypePreference =>
  Boolean(
    value &&
      typeof value === 'object' &&
      'teacherId' in value &&
      'pinnedTestTypeIds' in value &&
      'updatedAt' in value &&
      'updatedBy' in value,
  );

export const createTeacherTestTypePreferenceRepository = (
  adapter: TeacherTestTypePreferenceRtdbAdapter,
): TeacherTestTypePreferenceRepository => ({
  readPreference: async (teacherId) => {
    const value = await adapter.read(materialCatalogPaths.teacherTestTypePreferences(teacherId));

    return isTeacherTestTypePreference(value) ? value : null;
  },
  writePreference: async (preference) => {
    await adapter.write(
      materialCatalogPaths.teacherTestTypePreferences(preference.teacherId),
      preference,
    );
  },
});

const loadActiveTestTypes = async (
  options: Pick<TeacherPinnedTestTypesOptions, 'activeTestTypes' | 'testTypeRepository'>,
): Promise<MaterialTestTypeConfig[]> => {
  const records = options.activeTestTypes
    ? options.activeTestTypes.filter((config) => config.active).map(cloneTestType)
    : await listActiveTestTypes(options.testTypeRepository);

  return sortMaterialTestTypesByDisplayOrder(records);
};

const expectedPinnedCount = (activeTestTypes: readonly MaterialTestTypeConfig[]): number =>
  Math.min(4, activeTestTypes.length);

const uniqueIds = (ids: readonly MaterialTestTypeId[]): MaterialTestTypeId[] => {
  const seen = new Set<string>();
  const result: MaterialTestTypeId[] = [];

  ids.forEach((id) => {
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  });

  return result;
};

const toMapById = (
  activeTestTypes: readonly MaterialTestTypeConfig[],
): Map<MaterialTestTypeId, MaterialTestTypeConfig> =>
  new Map(activeTestTypes.map((config) => [config.testTypeId, config]));

const resolveAdminDefaultIds = (
  activeTestTypes: readonly MaterialTestTypeConfig[],
): MaterialTestTypeId[] =>
  activeTestTypes
    .filter((config) => Number.isFinite(config.defaultPinnedRank ?? Number.NaN))
    .sort(
      (left, right) =>
        (left.defaultPinnedRank ?? Number.MAX_SAFE_INTEGER) -
          (right.defaultPinnedRank ?? Number.MAX_SAFE_INTEGER) ||
        left.displayOrder - right.displayOrder,
    )
    .map((config) => config.testTypeId);

const fillPinnedIds = (
  startingIds: readonly MaterialTestTypeId[],
  activeTestTypes: readonly MaterialTestTypeConfig[],
): MaterialTestTypeId[] => {
  const activeById = toMapById(activeTestTypes);
  const count = expectedPinnedCount(activeTestTypes);
  const result: MaterialTestTypeId[] = [];

  const addIfActive = (id: MaterialTestTypeId): void => {
    if (result.length >= count || result.includes(id) || !activeById.has(id)) {
      return;
    }

    result.push(id);
  };

  startingIds.forEach(addIfActive);
  resolveAdminDefaultIds(activeTestTypes).forEach(addIfActive);
  activeTestTypes.map((config) => config.testTypeId).forEach(addIfActive);

  return result;
};

const mapIdsToTestTypes = (
  ids: readonly MaterialTestTypeId[],
  activeTestTypes: readonly MaterialTestTypeConfig[],
): MaterialTestTypeConfig[] => {
  const activeById = toMapById(activeTestTypes);

  return ids.flatMap((id) => {
    const config = activeById.get(id);

    return config ? [cloneTestType(config)] : [];
  });
};

const loadPreference = async (
  teacherId: string,
  options: TeacherPinnedTestTypesOptions,
): Promise<TeacherTestTypePreference | null> => {
  if ('preference' in options) {
    return options.preference ?? null;
  }

  return options.preferenceRepository?.readPreference(teacherId) ?? null;
};

export const getPinnedTestTypesForTeacher = async (
  teacherId: string,
  options: TeacherPinnedTestTypesOptions = {},
): Promise<TeacherPinnedTestTypesResult> => {
  const activeTestTypes = await loadActiveTestTypes(options);
  const count = expectedPinnedCount(activeTestTypes);

  if (count === 0) {
    return {
      testTypes: [],
      source: 'display-order',
      warning: null,
    };
  }

  const preference = await loadPreference(teacherId, options);
  const activeById = toMapById(activeTestTypes);

  if (preference?.teacherId === teacherId) {
    const pinnedIds = uniqueIds(preference.pinnedTestTypeIds);
    const allPinnedAreActive =
      pinnedIds.length === preference.pinnedTestTypeIds.length &&
      pinnedIds.every((id) => activeById.has(id));

    if (allPinnedAreActive && pinnedIds.length === count) {
      return {
        testTypes: mapIdsToTestTypes(pinnedIds, activeTestTypes),
        source: 'teacher-preference',
        warning: null,
      };
    }

    const repairedIds = fillPinnedIds(pinnedIds, activeTestTypes);
    const hasInactiveOrMissing = preference.pinnedTestTypeIds.some((id) => !activeById.has(id));

    return {
      testTypes: mapIdsToTestTypes(repairedIds, activeTestTypes),
      source: 'teacher-preference-repaired',
      warning: hasInactiveOrMissing ? 'inactive-preference-replaced' : 'invalid-preference-replaced',
    };
  }

  const defaultIds = fillPinnedIds(resolveAdminDefaultIds(activeTestTypes), activeTestTypes);
  const hasEnoughDefaultPins =
    resolveAdminDefaultIds(activeTestTypes).filter((id) => activeById.has(id)).length >= count;

  return {
    testTypes: mapIdsToTestTypes(defaultIds, activeTestTypes),
    source: hasEnoughDefaultPins ? 'admin-default' : 'display-order',
    warning: null,
  };
};

const assertCanWriteTeacherPreference = (
  teacherId: string,
  context: MaterialCatalogAdminContext,
): void => {
  if (context.role === 'super_admin' || context.uid === teacherId) {
    return;
  }

  throw new Error('Teachers can only save their own Test Type preferences.');
};

export const savePinnedTestTypesForTeacher = async (
  teacherId: string,
  testTypeIds: readonly MaterialTestTypeId[],
  context: MaterialCatalogAdminContext,
  options: SaveTeacherPinnedTestTypesOptions,
): Promise<TeacherTestTypePreference> => {
  assertCanWriteTeacherPreference(teacherId, context);

  const activeTestTypes = await loadActiveTestTypes(options);
  const count = expectedPinnedCount(activeTestTypes);
  const activeIds = new Set(activeTestTypes.map((config) => config.testTypeId));
  const uniquePinnedIds = uniqueIds(testTypeIds);

  if (activeTestTypes.length >= 4 && uniquePinnedIds.length !== 4) {
    throw new Error('Pinned Test Type preferences must include exactly 4 unique ids.');
  }

  if (activeTestTypes.length < 4 && uniquePinnedIds.length !== count) {
    throw new Error(`Pinned Test Type preferences must include exactly ${count} available ids.`);
  }

  if (
    uniquePinnedIds.length !== testTypeIds.length ||
    uniquePinnedIds.some((testTypeId) => !activeIds.has(testTypeId))
  ) {
    throw new Error('Pinned Test Type preferences must reference real active Test Type records.');
  }

  const preference: TeacherTestTypePreference = {
    teacherId,
    pinnedTestTypeIds: uniquePinnedIds,
    updatedAt: context.now?.() ?? new Date().toISOString(),
    updatedBy: context.uid,
  };

  await options.preferenceRepository.writePreference(preference);

  return preference;
};
