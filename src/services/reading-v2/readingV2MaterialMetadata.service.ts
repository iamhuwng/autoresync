import { READING_V2_ENGINE, READING_V2_PRODUCT_LABEL } from '../../config/readingV2FeatureFlags';
import {
  type ReadingV2Document,
  type ReadingV2MaterialId,
  type ReadingV2PublishedSnapshot,
  type ReadingV2SourceOrderKind,
} from '../../types/readingV2.types';
import {
  type MaterialTestTypeConfig,
  type MaterialTestTypeId,
} from '../../types/materialCatalog.types';

export type ReadingV2MaterialKind =
  | 'full-test'
  | 'task-group-material'
  | 'extracted-task-group-material'
  | 'reading-passage'
  | 'reading-v2-full-test-composition';
export type ReadingV2MaterialVisibility = 'private' | 'library-eligible' | 'assigned-only';
export type ReadingV2PrimaryTestTypeState = 'active' | 'inactive' | 'missing';
export type ReadingV2SourceOrderValue = number | string | null;
export type ReadingV2RelationshipSurface =
  | 'teacher-lobby'
  | 'material-profile'
  | 'library-listing'
  | 'assignment-picker'
  | 'homework-assignment'
  | 'course-material'
  | 'live-launch-summary'
  | 'solo-launch'
  | 'result-identity'
  | 'analytics';

export interface ReadingV2MaterialMetadataInput {
  readonly materialId: ReadingV2MaterialId;
  readonly ownerId: string;
  readonly document: ReadingV2Document;
  readonly materialKind?: ReadingV2MaterialKind;
  readonly title?: string;
  readonly durationMinutes?: number;
  readonly difficulty?: string;
  readonly targetBand?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly visibility?: ReadingV2MaterialVisibility;
  readonly sourceSnapshot?: ReadingV2PublishedSnapshot;
  readonly primaryTestTypeId?: MaterialTestTypeId;
  readonly testTypeIds?: readonly MaterialTestTypeId[];
  readonly testTypeConfigs?: readonly MaterialTestTypeConfig[];
  readonly sourceFullTestId?: ReadingV2MaterialId;
  readonly sourceSnapshotVersionId?: string;
  readonly sourceOrderKind?: ReadingV2SourceOrderKind;
  readonly sourceOrderValue?: ReadingV2SourceOrderValue;
  readonly sourceOrderLabelSnapshot?: string;
  readonly sourceOrderDisplaySnapshot?: string;
  readonly sourceQuestionRange?: string;
  readonly sourceTitleSnapshot?: string;
  readonly updatedAt?: string;
}

export interface ReadingV2MaterialMetadata {
  readonly materialId: ReadingV2MaterialId;
  readonly ownerId: string;
  readonly deliveryEngine: typeof READING_V2_ENGINE;
  readonly productLabel: typeof READING_V2_PRODUCT_LABEL;
  readonly title: string;
  readonly materialKind: ReadingV2MaterialKind;
  readonly durationMinutes: number;
  readonly difficulty: string;
  readonly targetBand?: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly visibility: ReadingV2MaterialVisibility;
  readonly primaryTestTypeId?: MaterialTestTypeId;
  readonly primaryTestTypeState?: ReadingV2PrimaryTestTypeState;
  readonly testTypeIds: readonly MaterialTestTypeId[];
  readonly sourceFullTestId?: ReadingV2MaterialId;
  readonly sourceSnapshotVersionId?: string;
  readonly sourceOrderKind?: ReadingV2SourceOrderKind;
  readonly sourceOrderValue?: ReadingV2SourceOrderValue;
  readonly sourceOrderLabelSnapshot?: string;
  readonly sourceOrderDisplaySnapshot?: string;
  readonly sourceQuestionRange?: string;
  readonly sourceTitleSnapshot?: string;
  readonly publishedSnapshotVersionId?: string;
  readonly publishedAt?: string;
  readonly updatedAt: string;
  readonly relationshipSurfaces: readonly ReadingV2RelationshipSurface[];
}

const findTestTypeConfig = (
  testTypeId: MaterialTestTypeId | undefined,
  configs: readonly MaterialTestTypeConfig[] | undefined,
): MaterialTestTypeConfig | null => {
  if (!testTypeId || !configs) {
    return null;
  }

  return configs.find((config) => config.testTypeId === testTypeId) ?? null;
};

const resolvePrimaryTestTypeState = (
  testTypeId: MaterialTestTypeId | undefined,
  config: MaterialTestTypeConfig | null,
): ReadingV2PrimaryTestTypeState | undefined => {
  if (!testTypeId) {
    return undefined;
  }

  if (!config) {
    return 'missing';
  }

  return config.active ? 'active' : 'inactive';
};

const resolveSourceOrderLabel = (
  input: ReadingV2MaterialMetadataInput,
  config: MaterialTestTypeConfig | null,
): string | undefined => {
  const explicit = input.sourceOrderLabelSnapshot?.trim();

  if (explicit) {
    return explicit;
  }

  if (config?.readingSourceOrderLabel.trim()) {
    return config.readingSourceOrderLabel.trim();
  }

  return input.materialKind === 'reading-passage' ? 'Source' : undefined;
};

const resolveSourceOrderDisplay = (
  kind: ReadingV2SourceOrderKind | undefined,
  value: ReadingV2SourceOrderValue | undefined,
  label: string | undefined,
  explicitDisplay: string | undefined,
): string | undefined => {
  const normalizedDisplay = explicitDisplay?.trim();

  if (normalizedDisplay) {
    return normalizedDisplay;
  }

  if (!label || !kind) {
    return undefined;
  }

  if (kind === 'numeric' && typeof value === 'number') {
    return `${label} ${value}`;
  }

  if (kind === 'label' && typeof value === 'string' && value.trim().length > 0) {
    return `${label} ${value.trim()}`;
  }

  return `${label} unknown`;
};

const deriveMetadataTitle = (
  input: ReadingV2MaterialMetadataInput,
  sourceOrderDisplay: string | undefined,
): string => {
  const explicitTitle = input.title?.trim();

  if (explicitTitle) {
    return explicitTitle;
  }

  const sourceTitle = input.sourceTitleSnapshot?.trim();

  if (input.materialKind === 'reading-passage' && sourceTitle) {
    return sourceOrderDisplay ? `${sourceTitle} - ${sourceOrderDisplay}` : sourceTitle;
  }

  return input.document.title.trim();
};

export const deriveReadingV2MaterialMetadata = (
  input: ReadingV2MaterialMetadataInput,
): ReadingV2MaterialMetadata => {
  const primaryTestTypeConfig = findTestTypeConfig(input.primaryTestTypeId, input.testTypeConfigs);
  const sourceOrderLabel = resolveSourceOrderLabel(input, primaryTestTypeConfig);
  const sourceOrderDisplay = resolveSourceOrderDisplay(
    input.sourceOrderKind,
    input.sourceOrderValue,
    sourceOrderLabel,
    input.sourceOrderDisplaySnapshot,
  );
  const title = deriveMetadataTitle(input, sourceOrderDisplay);

  if (title.length === 0) {
    throw new Error('Reading V2 material metadata requires a title before publish.');
  }

  return {
    materialId: input.materialId,
    ownerId: input.ownerId,
    deliveryEngine: READING_V2_ENGINE,
    productLabel: READING_V2_PRODUCT_LABEL,
    title,
    materialKind: input.materialKind ?? 'full-test',
    durationMinutes: input.durationMinutes ?? 60,
    difficulty: input.difficulty ?? 'intermediate',
    targetBand: input.targetBand,
    description: input.description ?? '',
    tags: input.tags ?? [],
    visibility: input.visibility ?? 'private',
    primaryTestTypeId: input.primaryTestTypeId,
    primaryTestTypeState: resolvePrimaryTestTypeState(input.primaryTestTypeId, primaryTestTypeConfig),
    testTypeIds: input.testTypeIds ?? [],
    sourceFullTestId: input.sourceFullTestId,
    sourceSnapshotVersionId: input.sourceSnapshotVersionId,
    sourceOrderKind: input.sourceOrderKind,
    sourceOrderValue: input.sourceOrderValue,
    sourceOrderLabelSnapshot: sourceOrderLabel,
    sourceOrderDisplaySnapshot: sourceOrderDisplay,
    sourceQuestionRange: input.sourceQuestionRange,
    sourceTitleSnapshot: input.sourceTitleSnapshot,
    publishedSnapshotVersionId: input.sourceSnapshot?.snapshotVersionId ?? input.sourceSnapshotVersionId,
    publishedAt: input.sourceSnapshot?.publishedAt,
    updatedAt: input.updatedAt ?? input.sourceSnapshot?.publishedAt ?? new Date().toISOString(),
    relationshipSurfaces: [
      'teacher-lobby',
      'material-profile',
      'library-listing',
      'assignment-picker',
      'homework-assignment',
      'course-material',
      'live-launch-summary',
      'solo-launch',
      'result-identity',
      'analytics',
    ],
  };
};
