export const READING_V2_ROLLOUT_MODES = {
  off: 'off',
  internalOnly: 'internal-only',
  teacherPreview: 'teacher-preview',
  public: 'public',
} as const;

export type ReadingV2RolloutMode =
  (typeof READING_V2_ROLLOUT_MODES)[keyof typeof READING_V2_ROLLOUT_MODES];

export const READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY_MODES = {
  hidden: 'hidden',
  optIn: 'opt-in',
} as const;

export type ReadingV2PassageAssetLobbyVisibility =
  (typeof READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY_MODES)[keyof typeof READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY_MODES];

export const PRD0052_FEATURE_FLAG_MODES = {
  disabled: 'disabled',
  enabled: 'enabled',
} as const;

export type Prd0052FeatureFlagMode =
  (typeof PRD0052_FEATURE_FLAG_MODES)[keyof typeof PRD0052_FEATURE_FLAG_MODES];

export const READING_V2_ENGINE = 'reading-v2';

export const normalizeReadingV2RolloutMode = (value: unknown): ReadingV2RolloutMode => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';

  if (normalized === READING_V2_ROLLOUT_MODES.internalOnly) {
    return READING_V2_ROLLOUT_MODES.internalOnly;
  }

  if (normalized === READING_V2_ROLLOUT_MODES.teacherPreview) {
    return READING_V2_ROLLOUT_MODES.teacherPreview;
  }

  if (normalized === READING_V2_ROLLOUT_MODES.public) {
    return READING_V2_ROLLOUT_MODES.public;
  }

  return READING_V2_ROLLOUT_MODES.off;
};

export const normalizeReadingV2PassageAssetLobbyVisibility = (
  value: unknown,
): ReadingV2PassageAssetLobbyVisibility => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';

  if (normalized === READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY_MODES.optIn) {
    return READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY_MODES.optIn;
  }

  return READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY_MODES.hidden;
};

export const normalizePrd0052FeatureFlagMode = (value: unknown): Prd0052FeatureFlagMode => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';

  if (
    normalized === PRD0052_FEATURE_FLAG_MODES.enabled ||
    normalized === 'true' ||
    normalized === '1'
  ) {
    return PRD0052_FEATURE_FLAG_MODES.enabled;
  }

  return PRD0052_FEATURE_FLAG_MODES.disabled;
};

export const READING_V2_ROLLOUT_MODE: ReadingV2RolloutMode =
  normalizeReadingV2RolloutMode(import.meta.env?.VITE_READING_V2_ROLLOUT_MODE);

export const READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY: ReadingV2PassageAssetLobbyVisibility =
  normalizeReadingV2PassageAssetLobbyVisibility(
    import.meta.env?.VITE_READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY,
  );

export const TEACHER_MATERIALS_TEST_TYPE_BLOCKS_MODE: Prd0052FeatureFlagMode =
  normalizePrd0052FeatureFlagMode(import.meta.env?.VITE_TEACHER_MATERIALS_TEST_TYPE_BLOCKS);

export const ADMIN_CONFIGURABLE_TEST_TYPES_MODE: Prd0052FeatureFlagMode =
  normalizePrd0052FeatureFlagMode(import.meta.env?.VITE_ADMIN_CONFIGURABLE_TEST_TYPES);

export const READING_PASSAGE_LIBRARY_MODE: Prd0052FeatureFlagMode =
  normalizePrd0052FeatureFlagMode(import.meta.env?.VITE_READING_PASSAGE_LIBRARY);

export const READING_PASSAGE_HOMEWORK_MODE: Prd0052FeatureFlagMode =
  normalizePrd0052FeatureFlagMode(import.meta.env?.VITE_READING_PASSAGE_HOMEWORK);

export const MATERIAL_BOOKS_MODE: Prd0052FeatureFlagMode =
  normalizePrd0052FeatureFlagMode(import.meta.env?.VITE_MATERIAL_BOOKS);

export const MATERIAL_BOOK_EDITOR_MODE: Prd0052FeatureFlagMode =
  normalizePrd0052FeatureFlagMode(import.meta.env?.VITE_MATERIAL_BOOK_EDITOR);

export const READING_V2_PRODUCT_LABEL = 'Reading V2';

export const READING_V2_RESULT_ADAPTER_COMPONENT_PATH =
  'src/components/results/ReadingV2ReviewContentAdapter.tsx';

export const READING_V2_FORBIDDEN_REVIEW_SURFACE_PREFIX =
  'src/components/reading-v2/review';

export const READING_V2_ENGINE_FIELDS = [
  'engine',
  'contentEngine',
  'deliveryEngine',
  'runtimeEngine',
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';

export const isReadingV2Payload = (value: unknown): boolean => {
  if (!isRecord(value)) {
    return false;
  }

  return READING_V2_ENGINE_FIELDS.some((field) => {
    const candidate = value[field];
    return (
      typeof candidate === 'string' &&
      candidate.trim().toLowerCase() === READING_V2_ENGINE
    );
  });
};

export const isReadingV2PublicRollout = (
  mode: ReadingV2RolloutMode = READING_V2_ROLLOUT_MODE,
): boolean => mode === READING_V2_ROLLOUT_MODES.public;

export const isReadingV2TeacherRouteExposureAllowed = (
  mode: ReadingV2RolloutMode = READING_V2_ROLLOUT_MODE,
): boolean =>
  mode === READING_V2_ROLLOUT_MODES.internalOnly ||
  mode === READING_V2_ROLLOUT_MODES.teacherPreview ||
  mode === READING_V2_ROLLOUT_MODES.public;

export const isPrd0052FeatureEnabled = (mode: Prd0052FeatureFlagMode): boolean =>
  mode === PRD0052_FEATURE_FLAG_MODES.enabled;

export const isTeacherMaterialsTestTypeBlocksEnabled = (
  mode: Prd0052FeatureFlagMode = TEACHER_MATERIALS_TEST_TYPE_BLOCKS_MODE,
): boolean => isPrd0052FeatureEnabled(mode);

export const isAdminConfigurableTestTypesEnabled = (
  mode: Prd0052FeatureFlagMode = ADMIN_CONFIGURABLE_TEST_TYPES_MODE,
): boolean => isPrd0052FeatureEnabled(mode);

export const isReadingPassageLibraryEnabled = (
  mode: Prd0052FeatureFlagMode = READING_PASSAGE_LIBRARY_MODE,
): boolean => isPrd0052FeatureEnabled(mode);

export const isReadingPassageHomeworkEnabled = (
  mode: Prd0052FeatureFlagMode = READING_PASSAGE_HOMEWORK_MODE,
): boolean => isPrd0052FeatureEnabled(mode);

export const isMaterialBooksEnabled = (
  mode: Prd0052FeatureFlagMode = MATERIAL_BOOKS_MODE,
): boolean => isPrd0052FeatureEnabled(mode);

export const isMaterialBookEditorEnabled = (
  mode: Prd0052FeatureFlagMode = MATERIAL_BOOK_EDITOR_MODE,
): boolean => isPrd0052FeatureEnabled(mode);

export interface TeacherMaterialsCapabilityInput {
  readonly testTypeBlocksMode?: Prd0052FeatureFlagMode;
  readonly adminConfigurableTestTypesMode?: Prd0052FeatureFlagMode;
  readonly readingPassageLibraryMode?: Prd0052FeatureFlagMode;
  readonly readingPassageHomeworkMode?: Prd0052FeatureFlagMode;
  readonly materialBooksMode?: Prd0052FeatureFlagMode;
  readonly materialBookEditorMode?: Prd0052FeatureFlagMode;
}

export interface TeacherMaterialsCapabilities {
  readonly canUseTestTypeBlocks: boolean;
  readonly canManageAdminTestTypes: boolean;
  readonly canUseReadingPassageLibrary: boolean;
  readonly canAssignReadingPassageHomework: boolean;
  readonly canUseMaterialBooks: boolean;
  readonly canUseMaterialBookEditor: boolean;
}

export const getTeacherMaterialsCapabilities = (
  input: TeacherMaterialsCapabilityInput = {},
): TeacherMaterialsCapabilities => ({
  canUseTestTypeBlocks: isTeacherMaterialsTestTypeBlocksEnabled(input.testTypeBlocksMode),
  canManageAdminTestTypes: isAdminConfigurableTestTypesEnabled(input.adminConfigurableTestTypesMode),
  canUseReadingPassageLibrary: isReadingPassageLibraryEnabled(input.readingPassageLibraryMode),
  canAssignReadingPassageHomework: isReadingPassageHomeworkEnabled(input.readingPassageHomeworkMode),
  canUseMaterialBooks: isMaterialBooksEnabled(input.materialBooksMode),
  canUseMaterialBookEditor: isMaterialBookEditorEnabled(input.materialBookEditorMode),
});
