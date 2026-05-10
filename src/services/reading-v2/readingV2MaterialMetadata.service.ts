import { READING_V2_ENGINE, READING_V2_PRODUCT_LABEL } from '../../config/readingV2FeatureFlags';
import {
  type ReadingV2Document,
  type ReadingV2MaterialId,
  type ReadingV2PublishedSnapshot,
} from '../../types/readingV2.types';

export type ReadingV2MaterialKind = 'full-test' | 'task-group-material' | 'extracted-task-group-material';
export type ReadingV2MaterialVisibility = 'private' | 'library-eligible' | 'assigned-only';
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
  readonly publishedSnapshotVersionId?: string;
  readonly publishedAt?: string;
  readonly updatedAt: string;
  readonly relationshipSurfaces: readonly ReadingV2RelationshipSurface[];
}

export const deriveReadingV2MaterialMetadata = (
  input: ReadingV2MaterialMetadataInput,
): ReadingV2MaterialMetadata => {
  const title = (input.title ?? input.document.title).trim();

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
    publishedSnapshotVersionId: input.sourceSnapshot?.snapshotVersionId,
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
