import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_CONFIGURABLE_TEST_TYPES_MODE,
  MATERIAL_BOOK_EDITOR_MODE,
  MATERIAL_BOOKS_MODE,
  PRD0052_FEATURE_FLAG_MODES,
  READING_PASSAGE_HOMEWORK_MODE,
  READING_PASSAGE_LIBRARY_MODE,
  READING_V2_ENGINE,
  READING_V2_ENGINE_FIELDS,
  READING_V2_FORBIDDEN_REVIEW_SURFACE_PREFIX,
  READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY,
  READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY_MODES,
  READING_V2_PRODUCT_LABEL,
  READING_V2_RESULT_ADAPTER_COMPONENT_PATH,
  READING_V2_ROLLOUT_MODE,
  READING_V2_ROLLOUT_MODES,
  TEACHER_MATERIALS_TEST_TYPE_BLOCKS_MODE,
  isAdminConfigurableTestTypesEnabled,
  isMaterialBookEditorEnabled,
  isMaterialBooksEnabled,
  isReadingV2Payload,
  isReadingV2PublicRollout,
  isReadingV2TeacherRouteExposureAllowed,
  isReadingPassageHomeworkEnabled,
  isReadingPassageLibraryEnabled,
  isTeacherMaterialsTestTypeBlocksEnabled,
  getTeacherMaterialsCapabilities,
  normalizePrd0052FeatureFlagMode,
  normalizeReadingV2PassageAssetLobbyVisibility,
  normalizeReadingV2RolloutMode,
} from './readingV2FeatureFlags';

const REPO_ROOT = process.cwd();

const prd0052EnvNames = [
  'VITE_TEACHER_MATERIALS_TEST_TYPE_BLOCKS',
  'VITE_ADMIN_CONFIGURABLE_TEST_TYPES',
  'VITE_READING_PASSAGE_LIBRARY',
  'VITE_READING_PASSAGE_HOMEWORK',
  'VITE_MATERIAL_BOOKS',
  'VITE_MATERIAL_BOOK_EDITOR',
] as const;

const importFreshFlags = async () => {
  vi.resetModules();
  return import('./readingV2FeatureFlags');
};

describe('readingV2FeatureFlags', () => {
  afterEach(() => {
    prd0052EnvNames.forEach((name) => vi.unstubAllEnvs());
    vi.resetModules();
  });

  it('defaults rollout not-public while product decisions remain unresolved', () => {
    expect(READING_V2_ROLLOUT_MODE).not.toBe('public');
    expect(isReadingV2PublicRollout()).toBe(false);
    // Route exposure depends on env; verify the normalizer denies 'off' explicitly
    expect(isReadingV2TeacherRouteExposureAllowed('off')).toBe(false);
  });

  it('initializes with closed defaults in a native non-Vite module environment', () => {
    const output = execFileSync(
      process.execPath,
      [
        '--experimental-strip-types',
        '-e',
        "import('./src/config/readingV2FeatureFlags.ts').then((flags) => console.log(JSON.stringify([flags.READING_V2_ROLLOUT_MODE, flags.READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY, flags.TEACHER_MATERIALS_TEST_TYPE_BLOCKS_MODE, flags.ADMIN_CONFIGURABLE_TEST_TYPES_MODE, flags.READING_PASSAGE_LIBRARY_MODE, flags.READING_PASSAGE_HOMEWORK_MODE, flags.MATERIAL_BOOKS_MODE, flags.MATERIAL_BOOK_EDITOR_MODE])))",
      ],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    );

    expect(JSON.parse(output)).toEqual([
      'off',
      'hidden',
      'disabled',
      'disabled',
      'disabled',
      'disabled',
      'disabled',
      'disabled',
    ]);
  });

  it('normalizes rollout config with strict closed fallback', () => {
    expect(READING_V2_ROLLOUT_MODES).toEqual({
      off: 'off',
      internalOnly: 'internal-only',
      teacherPreview: 'teacher-preview',
      public: 'public',
    });
    expect(normalizeReadingV2RolloutMode('public')).toBe('public');
    expect(normalizeReadingV2RolloutMode(' teacher-preview ')).toBe('teacher-preview');
    expect(normalizeReadingV2RolloutMode('internal-only')).toBe('internal-only');
    expect(normalizeReadingV2RolloutMode('unexpected')).toBe('off');
    expect(normalizeReadingV2RolloutMode(undefined)).toBe('off');
    expect(isReadingV2TeacherRouteExposureAllowed('internal-only')).toBe(true);
    expect(isReadingV2TeacherRouteExposureAllowed('teacher-preview')).toBe(true);
    expect(isReadingV2TeacherRouteExposureAllowed('public')).toBe(true);
    expect(isReadingV2TeacherRouteExposureAllowed('off')).toBe(false);
  });

  it('defaults all PRD-0052 material catalog flags to disabled when env flags are absent', async () => {
    prd0052EnvNames.forEach((name) => vi.stubEnv(name, ''));

    const flags = await importFreshFlags();

    expect(flags.PRD0052_FEATURE_FLAG_MODES).toEqual({
      disabled: 'disabled',
      enabled: 'enabled',
    });
    expect(flags.TEACHER_MATERIALS_TEST_TYPE_BLOCKS_MODE).toBe('disabled');
    expect(flags.ADMIN_CONFIGURABLE_TEST_TYPES_MODE).toBe('disabled');
    expect(flags.READING_PASSAGE_LIBRARY_MODE).toBe('disabled');
    expect(flags.READING_PASSAGE_HOMEWORK_MODE).toBe('disabled');
    expect(flags.MATERIAL_BOOKS_MODE).toBe('disabled');
    expect(flags.MATERIAL_BOOK_EDITOR_MODE).toBe('disabled');
    expect(flags.isTeacherMaterialsTestTypeBlocksEnabled()).toBe(false);
    expect(flags.isAdminConfigurableTestTypesEnabled()).toBe(false);
    expect(flags.isReadingPassageLibraryEnabled()).toBe(false);
    expect(flags.isReadingPassageHomeworkEnabled()).toBe(false);
    expect(flags.isMaterialBooksEnabled()).toBe(false);
    expect(flags.isMaterialBookEditorEnabled()).toBe(false);
    expect(flags.getTeacherMaterialsCapabilities()).toEqual({
      canUseTestTypeBlocks: false,
      canManageAdminTestTypes: false,
      canUseReadingPassageLibrary: false,
      canAssignReadingPassageHomework: false,
      canUseMaterialBooks: false,
      canUseMaterialBookEditor: false,
    });
  });

  it('resolves Teacher Materials capabilities from explicit PRD-0052 flag modes', () => {
    expect(getTeacherMaterialsCapabilities({
      testTypeBlocksMode: 'enabled',
      adminConfigurableTestTypesMode: 'disabled',
      readingPassageLibraryMode: 'enabled',
      readingPassageHomeworkMode: 'enabled',
      materialBooksMode: 'enabled',
      materialBookEditorMode: 'disabled',
    })).toEqual({
      canUseTestTypeBlocks: true,
      canManageAdminTestTypes: false,
      canUseReadingPassageLibrary: true,
      canAssignReadingPassageHomework: true,
      canUseMaterialBooks: true,
      canUseMaterialBookEditor: false,
    });
  });

  it('normalizes PRD-0052 material catalog feature flags strictly', () => {
    expect(normalizePrd0052FeatureFlagMode('enabled')).toBe('enabled');
    expect(normalizePrd0052FeatureFlagMode(' true ')).toBe('enabled');
    expect(normalizePrd0052FeatureFlagMode('1')).toBe('enabled');
    expect(normalizePrd0052FeatureFlagMode('disabled')).toBe('disabled');
    expect(normalizePrd0052FeatureFlagMode('false')).toBe('disabled');
    expect(normalizePrd0052FeatureFlagMode('unexpected')).toBe('disabled');
    expect(normalizePrd0052FeatureFlagMode(undefined)).toBe('disabled');
  });

  it('reads enabled PRD-0052 feature flags from explicit VITE env values', async () => {
    prd0052EnvNames.forEach((name) => vi.stubEnv(name, 'enabled'));

    const flags = await importFreshFlags();

    expect(flags.TEACHER_MATERIALS_TEST_TYPE_BLOCKS_MODE).toBe('enabled');
    expect(flags.ADMIN_CONFIGURABLE_TEST_TYPES_MODE).toBe('enabled');
    expect(flags.READING_PASSAGE_LIBRARY_MODE).toBe('enabled');
    expect(flags.READING_PASSAGE_HOMEWORK_MODE).toBe('enabled');
    expect(flags.MATERIAL_BOOKS_MODE).toBe('enabled');
    expect(flags.MATERIAL_BOOK_EDITOR_MODE).toBe('enabled');
    expect(flags.isTeacherMaterialsTestTypeBlocksEnabled()).toBe(true);
    expect(flags.isAdminConfigurableTestTypesEnabled()).toBe(true);
    expect(flags.isReadingPassageLibraryEnabled()).toBe(true);
    expect(flags.isReadingPassageHomeworkEnabled()).toBe(true);
    expect(flags.isMaterialBooksEnabled()).toBe(true);
    expect(flags.isMaterialBookEditorEnabled()).toBe(true);
  });

  it('falls back to disabled for invalid PRD-0052 env values', async () => {
    prd0052EnvNames.forEach((name) => vi.stubEnv(name, 'rollout'));

    const flags = await importFreshFlags();

    expect(flags.TEACHER_MATERIALS_TEST_TYPE_BLOCKS_MODE).toBe('disabled');
    expect(flags.ADMIN_CONFIGURABLE_TEST_TYPES_MODE).toBe('disabled');
    expect(flags.READING_PASSAGE_LIBRARY_MODE).toBe('disabled');
    expect(flags.READING_PASSAGE_HOMEWORK_MODE).toBe('disabled');
    expect(flags.MATERIAL_BOOKS_MODE).toBe('disabled');
    expect(flags.MATERIAL_BOOK_EDITOR_MODE).toBe('disabled');
  });

  it('keeps standalone passage assets hidden from broad Teacher Lobby exposure by default', () => {
    expect(READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY).toBe('hidden');
  });

  it('normalizes passage asset lobby visibility with hidden fallback', () => {
    expect(READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY_MODES).toEqual({
      hidden: 'hidden',
      optIn: 'opt-in',
    });
    expect(normalizeReadingV2PassageAssetLobbyVisibility('opt-in')).toBe('opt-in');
    expect(normalizeReadingV2PassageAssetLobbyVisibility('hidden')).toBe('hidden');
    expect(normalizeReadingV2PassageAssetLobbyVisibility('visible')).toBe('hidden');
    expect(normalizeReadingV2PassageAssetLobbyVisibility(undefined)).toBe('hidden');
  });

  it('uses a safe placeholder product label until the final name is approved', () => {
    expect(READING_V2_PRODUCT_LABEL).toBe('Reading V2');
  });

  it('detects explicit Reading V2 payload markers without guessing from legacy fields', () => {
    expect(isReadingV2Payload({ engine: 'reading-v2' })).toBe(true);
    expect(isReadingV2Payload({ contentEngine: 'READING-V2' })).toBe(true);
    expect(isReadingV2Payload({ skill: 'Reading' })).toBe(false);
    expect(isReadingV2Payload({ engine: 'legacy-reading' })).toBe(false);
  });

  it('establishes the required service and component boundaries with existing-shell review ownership', () => {
    expect(existsSync(join(REPO_ROOT, 'src/services/reading-v2/README.md'))).toBe(true);
    expect(
      existsSync(join(REPO_ROOT, 'src/services/reading-v2/fixtures/readingV2FixtureManifest.ts')),
    ).toBe(true);
    expect(existsSync(join(REPO_ROOT, 'src/pages/ReadingV2StudioPage.tsx'))).toBe(true);
    expect(
      existsSync(join(REPO_ROOT, 'src/components/reading-v2/studio/ReadingV2StudioShell.tsx')),
    ).toBe(true);
    expect(
      existsSync(join(REPO_ROOT, 'src/components/reading-v2/studio/ReadingV2StudioModalAdapter.tsx')),
    ).toBe(true);
    expect(existsSync(join(REPO_ROOT, READING_V2_RESULT_ADAPTER_COMPONENT_PATH))).toBe(true);
    expect(
      existsSync(join(REPO_ROOT, 'src/components/results/ReadingV2ReviewContentAdapter.test.tsx')),
    ).toBe(true);
    expect(existsSync(join(REPO_ROOT, READING_V2_FORBIDDEN_REVIEW_SURFACE_PREFIX))).toBe(false);
  });

  it('keeps the Reading V2 engine marker stable', () => {
    expect(READING_V2_ENGINE).toBe('reading-v2');
    expect(READING_V2_ENGINE_FIELDS).toEqual([
      'engine',
      'contentEngine',
      'deliveryEngine',
      'runtimeEngine',
    ]);
  });
});
