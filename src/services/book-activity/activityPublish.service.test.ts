import { describe, expect, it } from 'vitest';
import { saveActivityDraft, stageActivityCandidate } from './activityCandidate.service';
import {
  BookActivityPublishError,
  assertPublishedActivityVersionMutation,
  publishActivityRevision,
} from './activityPublish.service';

describe('activityPublish.service', () => {
  it('publishes immutable Activity versions and rejects version mutation', () => {
    const candidate = stageActivityCandidate({
      candidateId: 'candidate-1',
      ownerId: 'teacher-1',
      targetActivityId: 'activity-1',
      replacementContent: {
        schemaVersion: 1,
        title: 'Published Activity',
        presentationMode: 'structured',
        contextRequirement: 'none',
        interactions: [
          { family: 'choice', prompt: 'Pick one.', choices: ['A', 'B'] },
        ],
        answerRule: { type: 'single-choice', correctChoiceIndexes: [0] },
      },
      now: '2026-07-09T00:00:00.000Z',
    });
    const draft = saveActivityDraft({
      candidate,
      draftId: 'draft-1',
      now: '2026-07-09T00:01:00.000Z',
      idFactory: () => 'hidden-1',
    });
    const published = publishActivityRevision({
      draft,
      expectedDraftRevision: 1,
      versionId: 'version-1',
      publishedBy: 'teacher-1',
      now: '2026-07-09T00:02:00.000Z',
    });

    expect(published.version).toMatchObject({
      activityId: 'activity-1',
      versionId: 'version-1',
      ownerId: 'teacher-1',
      materialKind: 'interactive-activity',
    });
    expect(published.materialPatch.currentVersionId).toBe('version-1');
    expect(() => publishActivityRevision({
      draft,
      expectedDraftRevision: 1,
      versionId: 'version-1',
      publishedBy: 'teacher-1',
      now: '2026-07-09T00:03:00.000Z',
      existingVersion: published.version,
    })).toThrow(BookActivityPublishError);
    expect(() => assertPublishedActivityVersionMutation(published.version, {
      ...published.version,
      content: {
        ...published.version.content,
        title: 'Changed',
      },
    })).toThrow(/immutable/);
  });
});
