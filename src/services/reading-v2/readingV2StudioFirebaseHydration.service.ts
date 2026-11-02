import { get, ref, type Database } from 'firebase/database';
import { database as defaultDatabase } from '../firebase';
import {
  readingV2Ids,
  type ReadingV2Document,
  type ReadingV2MaterialId,
  type ReadingV2PublishedSnapshot,
} from '../../types/readingV2.types';
import { assertValidReadingV2CanonicalDocument } from './readingV2ContractGuards.service';
import { normalizeReadingV2FirebaseDocument } from './readingV2FirebaseDocument.service';
import {
  type ReadingV2MaterialMetadata,
} from './readingV2MaterialMetadata.service';
import { readingV2StoragePaths } from './readingV2StoragePaths.service';

export type ReadingV2PublishedRevisionSourceStatus =
  | 'loaded'
  | 'missing-metadata'
  | 'missing-snapshot-version'
  | 'missing-snapshot'
  | 'invalid-snapshot';

export interface ReadingV2PublishedRevisionSource {
  readonly status: ReadingV2PublishedRevisionSourceStatus;
  readonly materialId: ReadingV2MaterialId;
  readonly metadata?: ReadingV2MaterialMetadata;
  readonly snapshot?: ReadingV2PublishedSnapshot;
  readonly message?: string;
}

export interface LoadReadingV2PublishedRevisionSourceOptions {
  readonly database?: Database;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const getString = (record: Record<string, unknown>, key: string): string | undefined =>
  typeof record[key] === 'string' ? record[key] : undefined;


const toMetadata = (value: unknown): ReadingV2MaterialMetadata | null => {
  if (!isRecord(value)) {
    return null;
  }

  const materialId = getString(value, 'materialId');
  const ownerId = getString(value, 'ownerId');
  const title = getString(value, 'title');

  if (!materialId || !ownerId || !title) {
    return null;
  }

  return value as unknown as ReadingV2MaterialMetadata;
};

const toPublishedSnapshot = (value: unknown): ReadingV2PublishedSnapshot | null => {
  if (!isRecord(value)) {
    return null;
  }

  const snapshotVersionId = getString(value, 'snapshotVersionId');
  const materialId = getString(value, 'materialId');
  const ownerId = getString(value, 'ownerId');
  const publishedAt = getString(value, 'publishedAt');
  const publishedBy = getString(value, 'publishedBy');

  if (!snapshotVersionId || !materialId || !ownerId || !publishedAt || !publishedBy || !isRecord(value.document)) {
    return null;
  }

  const rawSnapshot = value as unknown as ReadingV2PublishedSnapshot;
  const snapshot: ReadingV2PublishedSnapshot = {
    ...rawSnapshot,
    document: normalizeReadingV2FirebaseDocument(rawSnapshot.document),
  };
  assertValidReadingV2CanonicalDocument(snapshot.document);
  return snapshot;
};

export const loadReadingV2PublishedRevisionSource = async (
  materialIdInput: string,
  options: LoadReadingV2PublishedRevisionSourceOptions = {},
): Promise<ReadingV2PublishedRevisionSource> => {
  const materialId = readingV2Ids.materialId(materialIdInput);
  const targetDatabase = options.database ?? defaultDatabase;
  const metadataSnapshot = await get(ref(targetDatabase, readingV2StoragePaths.materialMetadata(materialId)));

  if (!metadataSnapshot.exists()) {
    return {
      status: 'missing-metadata',
      materialId,
      message: `No Reading V2 material metadata was found for ${materialId}.`,
    };
  }

  const metadata = toMetadata(metadataSnapshot.val());
  const snapshotVersionId = metadata?.publishedSnapshotVersionId;

  if (!metadata || !snapshotVersionId) {
    return {
      status: 'missing-snapshot-version',
      materialId,
      metadata: metadata ?? undefined,
      message: `Reading V2 material ${materialId} does not reference a published snapshot version.`,
    };
  }

  const publishedSnapshot = await get(
    ref(targetDatabase, readingV2StoragePaths.publishedSnapshots(materialId, snapshotVersionId)),
  );

  if (!publishedSnapshot.exists()) {
    return {
      status: 'missing-snapshot',
      materialId,
      metadata,
      message: `Published snapshot ${snapshotVersionId} was not found for ${materialId}.`,
    };
  }

  try {
    const snapshot = toPublishedSnapshot(publishedSnapshot.val());

    if (!snapshot) {
      throw new Error('Snapshot record is missing required identity fields.');
    }

    return {
      status: 'loaded',
      materialId,
      metadata,
      snapshot,
      message: `Loaded published snapshot ${snapshot.snapshotVersionId} for ${materialId}.`,
    };
  } catch (error) {
    return {
      status: 'invalid-snapshot',
      materialId,
      metadata,
      message: error instanceof Error ? error.message : `Published snapshot ${snapshotVersionId} is invalid.`,
    };
  }
};
