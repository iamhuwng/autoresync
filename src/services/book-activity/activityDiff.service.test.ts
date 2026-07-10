import { describe, expect, it } from 'vitest';
import type {
  BookActivityEditableJson,
  BookActivityVersionRecord,
} from '../../types/bookActivity.types';
import { classifyActivityChange } from './activityDiff.service';
import { normalizeActivityRevision } from './activitySchema.service';

const editable = (overrides: Partial<BookActivityEditableJson> = {}): BookActivityEditableJson => ({
  schemaVersion: 1,
  title: 'Activity',
  presentationMode: 'structured',
  contextRequirement: 'none',
  interactions: [
    { family: 'choice', prompt: 'Pick one.', choices: ['A', 'B'] },
  ],
  answerRule: { type: 'single-choice', correctChoiceIndexes: [0] },
  scoring: { points: 1 },
  ...overrides,
});

const version = (
  content: BookActivityEditableJson,
  versionId: string,
): BookActivityVersionRecord => ({
  activityId: 'activity-1',
  versionId,
  ownerId: 'teacher-1',
  materialKind: 'interactive-activity',
  content: normalizeActivityRevision(content, { idFactory: () => `${versionId}-hidden` }),
  publishedAt: '2026-07-09T00:00:00.000Z',
  publishedBy: 'teacher-1',
});

describe('activityDiff.service', () => {
  it('classifies Activity changes into no-redo regrade and redo-required outcomes', () => {
    const oldVersion = version(editable(), 'v1');

    expect(classifyActivityChange(oldVersion, version(editable({ title: 'Renamed' }), 'v2')).classification)
      .toBe('no-redo');
    expect(classifyActivityChange(oldVersion, version(editable({ scoring: { points: 2 } }), 'v3')).classification)
      .toBe('recalculate-no-redo');
    expect(classifyActivityChange(oldVersion, version(editable({
      answerRule: { type: 'single-choice', correctChoiceIndexes: [1] },
    }), 'v4')).classification).toBe('regrade-no-redo');
    expect(classifyActivityChange(
      version(editable({
        answerRule: { type: 'rubric', rubric: 'Old' },
        interactions: [{ family: 'long-response', prompt: 'Explain.', responseShape: 'paragraph' }],
      }), 'v5'),
      version(editable({
        answerRule: { type: 'rubric', rubric: 'New' },
        interactions: [{ family: 'long-response', prompt: 'Explain.', responseShape: 'paragraph' }],
      }), 'v6'),
    ).classification).toBe('teacher-regrade-no-redo');
    expect(classifyActivityChange(oldVersion, version(editable({
      interactions: [
        { family: 'choice', prompt: 'Pick another.', choices: ['A', 'B'] },
      ],
    }), 'v7')).classification).toBe('redo-required');
    expect(classifyActivityChange(oldVersion, version(editable({ contextRequirement: 'required' }), 'v8')).classification)
      .toBe('redo-required');
  });
});
