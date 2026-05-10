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

export const READING_V2_ROLLOUT_MODE: ReadingV2RolloutMode =
  normalizeReadingV2RolloutMode(import.meta.env.VITE_READING_V2_ROLLOUT_MODE);

export const READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY: ReadingV2PassageAssetLobbyVisibility =
  normalizeReadingV2PassageAssetLobbyVisibility(
    import.meta.env.VITE_READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY,
  );

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
