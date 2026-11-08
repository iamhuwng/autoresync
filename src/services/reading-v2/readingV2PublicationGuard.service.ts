import type { ReadingV2MaterialMetadata } from './readingV2MaterialMetadata.service';
import { readingV2StoragePaths } from './readingV2StoragePaths.service';

export interface ReadingV2PublicationBase {
  readonly materialId: string;
  readonly ownerId: string;
  readonly materialRevision: number;
  readonly snapshotVersionId: string;
  readonly recordPath: string;
  readonly metadata: ReadingV2MaterialMetadata;
  readonly record: Readonly<Record<string, unknown>>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const readReadingV2PublicationBase = async (input: {
  readonly read: (path: string) => Promise<unknown>;
  readonly materialId: string;
  readonly ownerId: string;
  readonly expectedHead?: string;
}): Promise<ReadingV2PublicationBase> => {
  const metadata = await input.read(readingV2StoragePaths.materialMetadata(input.materialId));
  if (!isRecord(metadata) || metadata.materialId !== input.materialId || metadata.ownerId !== input.ownerId
    || !Number.isSafeInteger(metadata.materialRevision) || Number(metadata.materialRevision) < 1
    || typeof metadata.publishedSnapshotVersionId !== 'string' || !metadata.publishedSnapshotVersionId) {
    throw new Error('This material has no valid publication base. Recreate the development material.');
  }
  if (input.expectedHead && metadata.publishedSnapshotVersionId !== input.expectedHead) {
    throw new Error('This material was published elsewhere. Keep your draft and reload or save a copy.');
  }
  const recordPath = metadata.materialKind === 'reading-passage'
    ? readingV2StoragePaths.readingPassageMaterials(input.materialId)
    : typeof metadata.compositionId === 'string'
      ? readingV2StoragePaths.fullTestCompositions(metadata.compositionId)
      : '';
  if (!recordPath) throw new Error('This material has no matching published passage or composition.');
  const record = await input.read(recordPath);
  const head = isRecord(record)
    ? record.currentSnapshotVersionId ?? record.publishedVersionId ?? record.publishedSnapshotVersionId
    : undefined;
  if (!isRecord(record) || record.ownerId !== input.ownerId || record.materialRevision !== metadata.materialRevision
    || head !== metadata.publishedSnapshotVersionId || record.state !== metadata.state) {
    throw new Error('The published material and its metadata disagree. Keep your draft and inspect the material.');
  }
  return {
    materialId: input.materialId, ownerId: input.ownerId,
    materialRevision: Number(metadata.materialRevision), snapshotVersionId: metadata.publishedSnapshotVersionId,
    recordPath, metadata: metadata as unknown as ReadingV2MaterialMetadata, record,
  };
};

export const buildReadingV2LifecycleRevisionWrites = (base: ReadingV2PublicationBase): Record<string, number> => ({
  [`${readingV2StoragePaths.materialMetadata(base.materialId)}/materialRevision`]: base.materialRevision + 1,
  [`${base.recordPath}/materialRevision`]: base.materialRevision + 1,
});

export const prepareReadingV2PublicationUpdates = async (
  planned: Readonly<Record<string, unknown>>,
  read: (path: string) => Promise<unknown>,
): Promise<Record<string, unknown>> => {
  const updates = { ...planned };
  const metadataWrites = Object.entries(planned).filter(([path]) => /^reading_v2\/material_metadata\/[^/]+$/.test(path));
  for (const [metadataPath, value] of metadataWrites) {
    if (!isRecord(value) || typeof value.materialId !== 'string' || typeof value.ownerId !== 'string'
      || typeof value.publishedSnapshotVersionId !== 'string' || !Number.isSafeInteger(value.materialRevision)
      || Number(value.materialRevision) < 1 || value.state !== 'published') {
      throw new Error('Publication requires a captured material identity, revision and published state.');
    }
    const current = await read(metadataPath);
    const existing = current !== null && current !== undefined;
    if (existing && (!isRecord(current) || current.ownerId !== value.ownerId || current.state !== 'published'
      || !Number.isSafeInteger(current.materialRevision) || value.materialRevision !== Number(current.materialRevision) + 1
      || current.publishedSnapshotVersionId === value.publishedSnapshotVersionId)) {
      throw new Error('This publication has a stale or ineligible material base. Keep the draft and reload or save a copy.');
    }
    if (!existing && value.materialRevision !== 1) throw new Error('The expected published material is missing. Keep the draft.');
    const previous = isRecord(current) ? current : {};
    const recordPath = value.materialKind === 'reading-passage'
      ? readingV2StoragePaths.readingPassageMaterials(value.materialId)
      : typeof value.compositionId === 'string' ? readingV2StoragePaths.fullTestCompositions(value.compositionId) : undefined;
    if (recordPath) {
      const record = planned[recordPath];
      const previousRecord = await read(recordPath);
      if (!isRecord(record) || record.ownerId !== value.ownerId || record.materialRevision !== value.materialRevision
        || (record.currentSnapshotVersionId ?? record.publishedVersionId) !== value.publishedSnapshotVersionId
        || record.state !== 'published') throw new Error('Publication must advance matching material and metadata heads atomically.');
      if (existing && (!isRecord(previousRecord) || previousRecord.ownerId !== previous.ownerId
        || previousRecord.materialRevision !== previous.materialRevision || previousRecord.state !== previous.state
        || (previousRecord.currentSnapshotVersionId ?? previousRecord.publishedVersionId) !== previous.publishedSnapshotVersionId)) {
        throw new Error('The current publication heads disagree. Keep the draft and inspect the material.');
      }
      if (!existing && isRecord(previousRecord) && (previousRecord.state !== 'draft' || previousRecord.ownerId !== value.ownerId)) {
        throw new Error('A different published material already uses this identity.');
      }
      const preserved = isRecord(previousRecord) ? previousRecord : {};
      const next = { ...preserved, ...record,
        ...(existing ? { previousSnapshotVersionId: previous.publishedSnapshotVersionId } : {}),
        ...(preserved.createdAt ? { createdAt: preserved.createdAt } : {}),
      };
      updates[recordPath] = next;
      const versionPath = value.materialKind === 'reading-passage'
        ? readingV2StoragePaths.readingPassageMaterialVersions(value.materialId, value.publishedSnapshotVersionId)
        : readingV2StoragePaths.fullTestCompositionVersions(String(value.compositionId), value.publishedSnapshotVersionId);
      if (!isRecord(planned[versionPath])) throw new Error('Publication requires its immutable material version.');
      updates[versionPath] = { ...next, ...planned[versionPath] as Record<string, unknown>,
        ...(existing ? { previousSnapshotVersionId: previous.publishedSnapshotVersionId } : {}) };
    }
    updates[metadataPath] = { ...previous, ...value,
      ...(existing ? { previousSnapshotVersionId: previous.publishedSnapshotVersionId } : {}),
    };
  }
  return updates;
};
