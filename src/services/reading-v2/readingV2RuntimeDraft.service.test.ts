import { describe, expect, it } from 'vitest';
import {
  buildReadingV2RuntimeDraftKey,
  isReadingV2RuntimeAnswerMap,
  isReadingV2RuntimeDraft,
  READING_V2_RUNTIME_DRAFT_SCHEMA_VERSION,
} from './readingV2RuntimeDraft.service';

describe('readingV2RuntimeDraft', () => {
  it('builds a projection-scoped local key', () => {
    expect(buildReadingV2RuntimeDraftKey({
      studentId: 'student-1',
      materialId: 'material-1',
      projectionId: 'projection-1',
    })).toBe('reading-v2:practice:student-1:material-1:projection-1');
  });

  it('accepts the versioned envelope and rejects the old answer-map shape', () => {
    const draft = {
      schemaVersion: READING_V2_RUNTIME_DRAFT_SCHEMA_VERSION,
      projectionId: 'projection-1',
      sourceSnapshotVersionId: 'snapshot-1',
      answers: { question: 'answer' },
      highlights: [],
      updatedAt: 123,
    };

    expect(isReadingV2RuntimeDraft(draft)).toBe(true);
    expect(isReadingV2RuntimeDraft({ question: 'answer' })).toBe(false);
    expect(isReadingV2RuntimeAnswerMap({ question: 'answer', choices: ['A', 'B'] })).toBe(true);
    expect(isReadingV2RuntimeAnswerMap({ updatedAt: 123 })).toBe(false);
    expect(isReadingV2RuntimeDraft({ ...draft, schemaVersion: 0 })).toBe(false);
  });
});
