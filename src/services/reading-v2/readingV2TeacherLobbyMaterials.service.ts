import { equalTo, get, orderByChild, query, ref, type Database } from 'firebase/database';
import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import { database as defaultDatabase } from '../firebase';
import {
  createReadingV2LaunchMaterialSummary,
  type ReadingV2LaunchMaterialSummary,
} from './readingV2LaunchIntegration.service';
import type { ReadingV2MaterialMetadata } from './readingV2MaterialMetadata.service';
import type { ReadingV2DerivedProjection } from './readingV2Projection.service';
import { readingV2StoragePaths } from './readingV2StoragePaths.service';

interface ReadingV2TeacherLobbyRelationshipIndex {
  readonly materialId?: string;
  readonly snapshotVersionId?: string;
  readonly source?: string;
  readonly ownerId?: string;
}

export interface ReadingV2TeacherLobbyTestCardRecord {
  readonly id: string;
  readonly materialId: string;
  readonly ownerId: string;
  readonly deliveryEngine: typeof READING_V2_ENGINE;
  readonly title: string;
  readonly testType: 'IELTS';
  readonly type: 'IELTS';
  readonly skill: 'Reading';
  readonly skillType: 'reading-v2';
  readonly duration: number;
  readonly questionCount: number;
  readonly isPublic: boolean;
  readonly materialKind: string;
  readonly productLabel: string;
  readonly publishedSnapshotVersionId?: string;
  readonly metadata: {
    readonly title: string;
    readonly duration: number;
    readonly difficulty?: string;
    readonly targetBand?: string;
    readonly description?: string;
    readonly tags: readonly string[];
    readonly visibility?: string;
    readonly productLabel: string;
    readonly materialKind: string;
    readonly deliveryEngine: typeof READING_V2_ENGINE;
    readonly publishedSnapshotVersionId?: string;
  };
}

export interface ReadingV2TeacherLobbyMaterialOptions {
  readonly database?: Database;
}

const isTeacherLobbyIndexEntry = (
  value: unknown,
): value is ReadingV2TeacherLobbyRelationshipIndex =>
  value !== null &&
  typeof value === 'object' &&
  typeof (value as ReadingV2TeacherLobbyRelationshipIndex).materialId === 'string' &&
  typeof (value as ReadingV2TeacherLobbyRelationshipIndex).snapshotVersionId === 'string';

const hasReadingV2MetadataShape = (value: unknown): value is ReadingV2MaterialMetadata =>
  value !== null &&
  typeof value === 'object' &&
  (value as ReadingV2MaterialMetadata).deliveryEngine === READING_V2_ENGINE &&
  typeof (value as ReadingV2MaterialMetadata).materialId === 'string' &&
  typeof (value as ReadingV2MaterialMetadata).ownerId === 'string' &&
  typeof (value as ReadingV2MaterialMetadata).title === 'string';

const createTeacherLobbyCardRecord = (
  metadata: ReadingV2MaterialMetadata,
  summary: ReadingV2LaunchMaterialSummary,
): ReadingV2TeacherLobbyTestCardRecord => ({
  id: metadata.materialId,
  materialId: metadata.materialId,
  ownerId: metadata.ownerId,
  deliveryEngine: READING_V2_ENGINE,
  title: summary.title,
  testType: 'IELTS',
  type: 'IELTS',
  skill: 'Reading',
  skillType: 'reading-v2',
  duration: summary.durationMinutes,
  questionCount: summary.questionCount,
  isPublic: metadata.visibility === 'library-eligible',
  materialKind: metadata.materialKind,
  productLabel: metadata.productLabel,
  publishedSnapshotVersionId: summary.sourceSnapshotVersionId,
  metadata: {
    title: summary.title,
    duration: summary.durationMinutes,
    difficulty: metadata.difficulty,
    targetBand: metadata.targetBand,
    description: metadata.description,
    tags: metadata.tags,
    visibility: metadata.visibility,
    productLabel: metadata.productLabel,
    materialKind: metadata.materialKind,
    deliveryEngine: READING_V2_ENGINE,
    publishedSnapshotVersionId: summary.sourceSnapshotVersionId,
  },
});

const readProjection = async (
  database: Database,
  materialId: string,
  snapshotVersionId: string,
): Promise<ReadingV2DerivedProjection | null> => {
  const projectionSnapshot = await get(
    ref(database, readingV2StoragePaths.studentSafeTests(materialId, snapshotVersionId)),
  );

  return projectionSnapshot.exists()
    ? projectionSnapshot.val() as ReadingV2DerivedProjection
    : null;
};

const readTeacherLobbyMaterial = async (
  database: Database,
  entry: ReadingV2TeacherLobbyRelationshipIndex,
): Promise<ReadingV2TeacherLobbyTestCardRecord | null> => {
  if (
    entry.source !== 'published-metadata' ||
    !entry.materialId ||
    !entry.snapshotVersionId
  ) {
    return null;
  }

  const metadataSnapshot = await get(
    ref(database, readingV2StoragePaths.materialMetadata(entry.materialId)),
  );
  const metadata = metadataSnapshot.exists() ? metadataSnapshot.val() : null;

  if (!hasReadingV2MetadataShape(metadata)) {
    return null;
  }

  const projection = await readProjection(database, entry.materialId, entry.snapshotVersionId);
  const summary = createReadingV2LaunchMaterialSummary({
    metadata,
    projection,
  });

  return createTeacherLobbyCardRecord(metadata, summary);
};

export const getReadingV2TeacherLobbyIndexQuery = (
  ownerId: string,
  options: ReadingV2TeacherLobbyMaterialOptions = {},
) => query(
  ref(options.database ?? defaultDatabase, readingV2StoragePaths.relationshipIndexes('teacher-lobby', '')),
  orderByChild('ownerId'),
  equalTo(ownerId),
);

export const getReadingV2TeacherLobbyTests = async (
  ownerId: string | undefined,
  options: ReadingV2TeacherLobbyMaterialOptions = {},
): Promise<ReadingV2TeacherLobbyTestCardRecord[]> => {
  if (!ownerId) {
    return [];
  }

  const targetDatabase = options.database ?? defaultDatabase;
  let indexSnapshot: Awaited<ReturnType<typeof get>>;

  try {
    indexSnapshot = await get(
      getReadingV2TeacherLobbyIndexQuery(ownerId, { database: targetDatabase }),
    );
  } catch {
    return [];
  }

  if (!indexSnapshot.exists()) {
    return [];
  }

  const entries = Object.values(indexSnapshot.val() ?? {})
    .filter(isTeacherLobbyIndexEntry)
    .filter((entry) => entry.ownerId === ownerId);
  const materials = await Promise.all(
    entries.map((entry) => readTeacherLobbyMaterial(targetDatabase, entry)),
  );

  return materials.filter((material): material is ReadingV2TeacherLobbyTestCardRecord =>
    material !== null,
  );
};

export const mergeReadingV2TeacherLobbyTests = <T extends { readonly id?: string }>(
  legacyTests: readonly T[],
  readingV2Tests: readonly ReadingV2TeacherLobbyTestCardRecord[],
): Array<T | ReadingV2TeacherLobbyTestCardRecord> => {
  const seenIds = new Set(legacyTests.map((test) => test.id).filter(Boolean));
  return [
    ...legacyTests,
    ...readingV2Tests.filter((test) => !seenIds.has(test.id)),
  ];
};
