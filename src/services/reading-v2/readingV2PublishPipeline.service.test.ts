import { describe, expect, it, vi } from 'vitest';
import { readingV2Ids, type ReadingV2Document } from '../../types/readingV2.types';
import { READING_V2_CANONICAL_FIXTURES } from './fixtures/readingV2CanonicalFixtures';
import { createReadingV2Repository } from './readingV2Repository.service';
import { assertReadingV2ProjectionIsStudentSanitized } from './readingV2Projection.service';
import {
  dispatchReadingV2PublishCommitPlanToSinks,
  generateReadingV2PreviewOnly,
  publishReadingV2Material,
} from './readingV2PublishPipeline.service';

const fixtureDocument = (): ReadingV2Document =>
  structuredClone(READING_V2_CANONICAL_FIXTURES['sentence-completion']) as ReadingV2Document;

describe('readingV2PublishPipeline.service', () => {
  it('previews without creating live session, assignment, attempt, homework, course, or result records', () => {
    const preview = generateReadingV2PreviewOnly({
      draftId: 'draft-preview-only',
      ownerId: 'teacher-1',
      document: fixtureDocument(),
    });

    expect(preview.projection.projectionKind).toBe('preview');
    expect(preview.projection.localOnlyAnswerState).toBe(true);
    expect(preview.permanentWrites).toEqual([]);
    expect(preview.projection.runtimeContract).toBe('teacher-preview');
    expect(() => assertReadingV2ProjectionIsStudentSanitized(preview.projection)).not.toThrow();
    expect(JSON.stringify(preview)).not.toContain('assignment');
    expect(JSON.stringify(preview)).not.toContain('session');
    expect(JSON.stringify(preview)).not.toContain('attempt');
    expect(JSON.stringify(preview)).not.toContain('result');
  });

  it('publishes by validating, creating immutable snapshot, projections, metadata, relationship indexes, and where-used writes', () => {
    const repository = createReadingV2Repository();
    const materialId = readingV2Ids.materialId('material-publish');
    const snapshotVersionId = readingV2Ids.snapshotVersionId('snapshot-publish');
    const passageAssetId = readingV2Ids.passageAssetId('asset-publish');
    const result = publishReadingV2Material({
      repository,
      materialId,
      ownerId: 'teacher-1',
      document: fixtureDocument(),
      publishedBy: 'teacher-1',
      snapshotVersionId,
      publishedAt: '2026-04-25T00:00:00.000Z',
      passageAssetUses: [{ passageAssetId, consumerKind: 'task-group-material' }],
      returnContext: 'teacher-lobby',
    });

    expect(result.validation.canPublish).toBe(true);
    expect(result.projections.map((projection) => projection.projectionKind).sort()).toEqual([
      'analytics',
      'review',
      'session-safe',
      'student-safe',
    ]);
    expect(repository.loadPublishedSnapshot(materialId, snapshotVersionId)?.snapshotVersionId).toBe(snapshotVersionId);
    expect(result.relationshipIndexWrites.every((write) => write.source !== 'published-metadata' || write.materialId === materialId)).toBe(true);
    expect(result.relationshipIndexWrites.map((write) => write.surface)).toEqual(
      expect.arrayContaining([
        'library-listing',
        'homework-assignment',
        'course-material',
        'live-launch-summary',
        'solo-launch',
        'result-identity',
        'analytics',
      ]),
    );
    expect(repository.getWhereUsedEntries(passageAssetId)).toHaveLength(1);
    expect(result.commitPlan.commitKey).toBe(`${materialId}/${snapshotVersionId}`);
    expect(result.commitPlan.operations.map((operation) => operation.kind)).toEqual(
      expect.arrayContaining([
        'published-snapshot',
        'projection',
        'material-metadata',
        'relationship-index',
        'where-used',
        'return-context-notification',
      ]),
    );
    expect(new Set(result.commitPlan.operations.map((operation) => operation.operationKey)).size).toBe(
      result.commitPlan.operations.length,
    );
  });

  it('does not publish or expose student payloads when blocking validation fails', () => {
    const repository = createReadingV2Repository();
    const document = fixtureDocument();
    const [interactionId] = Object.keys(document.interactions);
    const invalidDocument = {
      ...document,
      interactions: {
        ...document.interactions,
        [interactionId]: {
          ...document.interactions[interactionId],
          placeholder: true,
        },
      },
    };
    const projectionSink = vi.fn();

    expect(() =>
      publishReadingV2Material({
        repository,
        materialId: readingV2Ids.materialId('material-blocked'),
        ownerId: 'teacher-1',
        document: invalidDocument,
        publishedBy: 'teacher-1',
        snapshotVersionId: readingV2Ids.snapshotVersionId('snapshot-blocked'),
      }),
    ).toThrow(/blocked/);
    expect(projectionSink).not.toHaveBeenCalled();
    expect(repository.store.publishedSnapshots.size).toBe(0);
  });

  it('dispatches external sink writes only from an explicit commit plan', () => {
    const repository = createReadingV2Repository();
    const materialId = readingV2Ids.materialId('material-dispatch');
    const snapshotVersionId = readingV2Ids.snapshotVersionId('snapshot-dispatch');
    const projectionSink = vi.fn();
    const metadataSink = vi.fn();
    const indexSink = vi.fn();
    const notifySink = vi.fn();
    const result = publishReadingV2Material({
      repository,
      materialId,
      ownerId: 'teacher-1',
      document: fixtureDocument(),
      publishedBy: 'teacher-1',
      snapshotVersionId,
      returnContext: 'teacher-lobby',
    });

    expect(projectionSink).not.toHaveBeenCalled();
    const dispatchedKeys = dispatchReadingV2PublishCommitPlanToSinks(result.commitPlan, {
      writeProjection: projectionSink,
      writeMaterialMetadata: metadataSink,
      writeRelationshipIndex: indexSink,
      notifyReturnContext: notifySink,
    });

    expect(projectionSink).toHaveBeenCalledTimes(4);
    expect(metadataSink).toHaveBeenCalledOnce();
    expect(indexSink).toHaveBeenCalledTimes(10);
    expect(notifySink).toHaveBeenCalledWith({
      materialId,
      snapshotVersionId,
      context: 'teacher-lobby',
    });
    expect(dispatchedKeys.every((operationKey) => operationKey.startsWith(`${materialId}/${snapshotVersionId}/`))).toBe(true);
  });

  it('rolls back repository commit when a committed operation fails', () => {
    const repository = createReadingV2Repository();
    const materialId = readingV2Ids.materialId('material-repository-rollback');
    const passageAssetId = readingV2Ids.passageAssetId('asset-rollback');
    const previousSnapshotId = readingV2Ids.snapshotVersionId('snapshot-previous');
    const nextSnapshotId = readingV2Ids.snapshotVersionId('snapshot-next');
    const document = fixtureDocument();

    repository.publishSnapshot({
      materialId,
      snapshotVersionId: previousSnapshotId,
      ownerId: 'teacher-1',
      document,
      publishedBy: 'teacher-1',
    });
    const failingRepository = {
      ...repository,
      addWhereUsedEntry: vi.fn(() => {
        throw new Error('where-used failed');
      }),
    };

    expect(() =>
      publishReadingV2Material({
        repository: failingRepository,
        materialId,
        ownerId: 'teacher-1',
        document: {
          ...document,
          title: 'Next publish attempt',
        },
        publishedBy: 'teacher-1',
        snapshotVersionId: nextSnapshotId,
        passageAssetUses: [{ passageAssetId, consumerKind: 'task-group-material' }],
      }),
    ).toThrow(/where-used failed/);

    expect(repository.loadPublishedSnapshot(materialId, previousSnapshotId)?.document.title).toBe(document.title);
    expect(repository.loadPublishedSnapshot(materialId, nextSnapshotId)).toBeNull();
    expect(repository.getWhereUsedEntries(passageAssetId)).toHaveLength(0);
  });
});
