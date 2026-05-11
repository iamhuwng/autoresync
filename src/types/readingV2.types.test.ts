import { describe, expect, it } from 'vitest';
import {
  READING_V2_SCHEMA_VERSION,
  readingV2Ids,
  type ReadingV2Document,
  type ReadingV2ProjectionPayload,
  type ReadingV2ValidationIssue,
} from './readingV2.types';
import { READING_V2_ENGINE } from '../config/readingV2FeatureFlags';

describe('readingV2.types', () => {
  it('brands every required phase-2 ID class from non-empty strings', () => {
    expect(readingV2Ids.documentId('doc-1')).toBe('doc-1');
    expect(readingV2Ids.sectionId('section-1')).toBe('section-1');
    expect(readingV2Ids.stimulusId('stimulus-1')).toBe('stimulus-1');
    expect(readingV2Ids.taskGroupId('task-group-1')).toBe('task-group-1');
    expect(readingV2Ids.interactionId('interaction-1')).toBe('interaction-1');
    expect(readingV2Ids.anchorId('anchor-1')).toBe('anchor-1');
    expect(readingV2Ids.optionSetId('option-set-1')).toBe('option-set-1');
    expect(readingV2Ids.importEvidenceId('import-evidence-1')).toBe('import-evidence-1');
    expect(() => readingV2Ids.documentId('   ')).toThrow(/non-empty/);
  });

  it('models canonical and projection planes with incompatible discriminators', () => {
    const canonical = {
      deliveryEngine: READING_V2_ENGINE,
      plane: 'canonical',
      schemaVersion: READING_V2_SCHEMA_VERSION,
    } satisfies Pick<ReadingV2Document, 'deliveryEngine' | 'plane' | 'schemaVersion'>;

    const projection = {
      deliveryEngine: READING_V2_ENGINE,
      plane: 'projection',
      schemaVersion: READING_V2_SCHEMA_VERSION,
      ownerId: 'teacher-1',
      projectionKind: 'student-safe',
      sourceSnapshotVersionId: readingV2Ids.snapshotVersionId('snapshot-1'),
      generatedAt: '2026-04-25T00:00:00.000Z',
    } satisfies ReadingV2ProjectionPayload;

    expect(canonical.plane).toBe('canonical');
    expect(projection.plane).toBe('projection');
  });

  it('freezes validation severities to info, warning, and error', () => {
    const issues: ReadingV2ValidationIssue[] = [
      { code: 'note', severity: 'info', message: 'Informational.' },
      { code: 'advisory', severity: 'warning', message: 'Teacher-visible warning.' },
      {
        code: 'orphan-anchor-reference',
        severity: 'error',
        message: 'Publish-blocking error.',
      },
    ];

    expect(issues.map((issue) => issue.severity)).toEqual(['info', 'warning', 'error']);
  });
});
