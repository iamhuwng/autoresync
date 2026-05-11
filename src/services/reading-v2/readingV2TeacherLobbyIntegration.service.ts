// Reading V2 Teacher Lobby adapter boundary: lobby cards decide entry mode here,
// then delegate authoring to the Studio adapter instead of legacy TestEditor.
import {
  READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY,
  READING_V2_ROLLOUT_MODE,
  type ReadingV2PassageAssetLobbyVisibility,
  type ReadingV2RolloutMode,
  isReadingV2TeacherRouteExposureAllowed,
  isReadingV2Payload,
} from '../../config/readingV2FeatureFlags';

type ReadingV2StudioMode =
  | 'create-blank'
  | 'create-from-import'
  | 'resume-draft'
  | 'revise-published';

export interface ReadingV2TeacherLobbyStudioEntry {
  readonly mode: ReadingV2StudioMode;
  readonly materialId?: string;
  readonly draftId?: string;
  readonly source:
    | 'teacher_lobby_test_card'
    | 'teacher_lobby_draft_card'
    | 'teacher_lobby_create_button'
    | 'teacher_lobby_import_button';
}

export interface ReadingV2TeacherLobbyOptions {
  readonly passageAssetLobbyVisibility?: ReadingV2PassageAssetLobbyVisibility;
  readonly rolloutMode?: ReadingV2RolloutMode;
}

const getStringField = (
  value: Record<string, unknown>,
  field: string,
): string | undefined => {
  const candidate = value[field];
  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate
    : undefined;
};

const isStandalonePassageAsset = (value: Record<string, unknown>): boolean =>
  getStringField(value, 'materialKind') === 'passage-asset' ||
  getStringField(value, 'itemKind') === 'passage-asset' ||
  getStringField(value, 'contentKind') === 'passage-asset';

export const shouldShowReadingV2TeacherLobbyItem = (
  item: unknown,
  options: ReadingV2TeacherLobbyOptions = {},
): boolean => {
  if (!isReadingV2Payload(item) || item === null || typeof item !== 'object') {
    return true;
  }

  const passageAssetLobbyVisibility =
    options.passageAssetLobbyVisibility ?? READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY;

  return !isStandalonePassageAsset(item as Record<string, unknown>) ||
    passageAssetLobbyVisibility === 'opt-in';
};

export const shouldShowReadingV2TeacherLobbyCreateEntries = (
  options: ReadingV2TeacherLobbyOptions = {},
): boolean =>
  isReadingV2TeacherRouteExposureAllowed(options.rolloutMode ?? READING_V2_ROLLOUT_MODE);

export const resolveReadingV2TeacherLobbyCreateEntry = (
  kind: 'blank' | 'import',
  options: ReadingV2TeacherLobbyOptions = {},
): ReadingV2TeacherLobbyStudioEntry | null => {
  if (!shouldShowReadingV2TeacherLobbyCreateEntries(options)) {
    return null;
  }

  return {
    mode: kind === 'import' ? 'create-from-import' : 'create-blank',
    source: kind === 'import' ? 'teacher_lobby_import_button' : 'teacher_lobby_create_button',
  };
};

export const resolveReadingV2TeacherLobbyStudioEntry = (
  item: unknown,
  source: ReadingV2TeacherLobbyStudioEntry['source'],
  options: ReadingV2TeacherLobbyOptions = {},
): ReadingV2TeacherLobbyStudioEntry | null => {
  if (!isReadingV2Payload(item) || item === null || typeof item !== 'object') {
    return null;
  }

  const record = item as Record<string, unknown>;
  const passageAssetLobbyVisibility =
    options.passageAssetLobbyVisibility ?? READING_V2_PASSAGE_ASSET_LOBBY_VISIBILITY;

  if (!shouldShowReadingV2TeacherLobbyItem(record, { passageAssetLobbyVisibility })) {
    return null;
  }

  if (source === 'teacher_lobby_draft_card') {
    return {
      mode: 'resume-draft',
      draftId: getStringField(record, 'draftId') ?? getStringField(record, 'id'),
      source,
    };
  }

  return {
    mode: 'revise-published',
    materialId: getStringField(record, 'materialId') ?? getStringField(record, 'id'),
    source,
  };
};
