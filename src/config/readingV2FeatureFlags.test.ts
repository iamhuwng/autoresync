import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  READING_V2_ENGINE,
  READING_V2_ENGINE_FIELDS,
  READING_V2_FORBIDDEN_REVIEW_SURFACE_PREFIX,
  READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY,
  READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY_MODES,
  READING_V2_PRODUCT_LABEL,
  READING_V2_RESULT_ADAPTER_COMPONENT_PATH,
  READING_V2_ROLLOUT_MODE,
  READING_V2_ROLLOUT_MODES,
  isReadingV2Payload,
  isReadingV2PublicRollout,
  isReadingV2TeacherRouteExposureAllowed,
  normalizeReadingV2PassageAssetLobbyVisibility,
  normalizeReadingV2RolloutMode,
} from './readingV2FeatureFlags';

const REPO_ROOT = process.cwd();

describe('readingV2FeatureFlags', () => {
  it('defaults rollout not-public while product decisions remain unresolved', () => {
    expect(READING_V2_ROLLOUT_MODE).not.toBe('public');
    expect(isReadingV2PublicRollout()).toBe(false);
    // Route exposure depends on env; verify the normalizer denies 'off' explicitly
    expect(isReadingV2TeacherRouteExposureAllowed('off')).toBe(false);
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
