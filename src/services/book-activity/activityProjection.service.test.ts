import { describe, expect, it } from 'vitest';
import type { BookActivityVersionRecord } from '../../types/bookActivity.types';
import { normalizeActivityRevision } from './activitySchema.service';
import { createStudentSafeActivityProjection } from './activityProjection.service';

describe('activityProjection.service', () => {
  it('generates student-safe Activity projections without answer keys or author-only fields', () => {
    const content = normalizeActivityRevision({
      schemaVersion: 1,
      title: 'Safe projection',
      presentationMode: 'structured',
      contextRequirement: 'none',
      instructions: 'Answer.',
      interactions: [
        { family: 'choice', prompt: 'Pick one.', choices: ['A', 'B'] },
      ],
      answerRule: { type: 'single-choice', correctChoiceIndexes: [0] },
      teacherNotes: 'Private note',
      scoring: { points: 2 },
    }, {
      idFactory: () => 'hidden-1',
    });
    const version: BookActivityVersionRecord = {
      activityId: 'activity-1',
      versionId: 'version-1',
      ownerId: 'teacher-1',
      materialKind: 'interactive-activity',
      content,
      publishedAt: '2026-07-09T00:00:00.000Z',
      publishedBy: 'teacher-1',
    };

    const projection = createStudentSafeActivityProjection(version, '2026-07-09T00:01:00.000Z');
    const serialized = JSON.stringify(projection);

    expect(projection.interactions[0]).toMatchObject({
      clientInteractionKey: 'i1',
      prompt: 'Pick one.',
      choices: ['A', 'B'],
    });
    expect(serialized).not.toContain('correctChoiceIndexes');
    expect(serialized).not.toContain('answerRule');
    expect(serialized).not.toContain('teacherNotes');
    expect(serialized).not.toContain('hidden-1');
    expect(serialized).not.toContain('publishedBy');
  });
});
