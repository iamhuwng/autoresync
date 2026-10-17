import { describe, expect, it } from 'vitest';
import type { ReadingV2DerivedProjection } from '../../../reading-v2/public';
import { adaptReadingV2ProjectionToBookActivities } from './readingV2ActivityAdapter';

const projection = (
  overrides: Partial<ReadingV2DerivedProjection> = {},
): ReadingV2DerivedProjection => ({
  deliveryEngine: 'reading-v2',
  plane: 'projection',
  schemaVersion: 1,
  ownerId: 'owner-1',
  projectionKind: 'student-safe',
  sourceSnapshotVersionId: 'version-1',
  generatedAt: '2026-07-26T00:00:00.000Z',
  projectionId: 'projection-1',
  sourceDocumentId: 'document-1',
  runtimeContract: 'student-runtime',
  content: {
    title: 'Reading fixture',
    sections: [],
    stimuli: [{
      stimulusId: 'stimulus-1',
      kind: 'passage',
      content: {
        kind: 'passage-content',
        paragraphs: [{ paragraphId: 'paragraph-1', text: 'Public passage text.' }],
      },
      anchorIds: [],
    }],
    anchors: [],
    taskGroups: [{
      taskGroupId: 'group-1',
      officialTaskType: 'multiple-choice',
      engineeringFamily: 'choice',
      instructionBlocks: [{ id: 'instruction-1', text: 'Choose one answer.' }],
      stimulusRefs: [{ stimulusId: 'stimulus-1' }],
      interactions: [{
        interactionId: 'interaction-1',
        taskGroupId: 'group-1',
        displayNumber: 1,
        promptText: 'Which answer?',
        responseShape: { kind: 'single-choice', optionSetId: 'options-1' },
      }],
    }],
    optionSets: [{
      optionSetId: 'options-1',
      taskGroupId: 'group-1',
      options: [
        { optionId: 'option-a', label: 'A', text: 'First' },
        { optionId: 'option-b', label: 'B', text: 'Second' },
      ],
    }],
  },
  ...overrides,
} as unknown as ReadingV2DerivedProjection);

describe('Reading V2 Book Activity adapter', () => {
  it('converts a student-safe public projection without answer or native authority fields', () => {
    const result = adaptReadingV2ProjectionToBookActivities({
      projection: projection(),
      contextForTaskGroup: () => ({
        sourceContext: { available: true, sourcePartLabel: 'Page 1' },
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.projections).toHaveLength(1);
    expect(result.projections[0]).toMatchObject({
      taskProfile: {
        taxonomyId: 'ielts-reading',
        typeId: 'multiple-choice',
        taxonomyVersion: 1,
      },
      interaction: { family: 'choice', variant: 'single-choice' },
      interactions: [{
        interactionId: 'interaction-1',
        options: [
          { itemId: 'option-a', label: 'First' },
          { itemId: 'option-b', label: 'Second' },
        ],
      }],
      scoring: { mode: 'auto-where-possible', feedbackVisibility: 'none' },
    });
    expect(JSON.stringify(result)).not.toMatch(/answerKey|credential|ownerId/iu);
  });

  it('requires Book-owned source context and an authorized image identity', () => {
    const diagram = projection({
      content: {
        ...projection().content,
        stimuli: [{
          stimulusId: 'stimulus-1',
          kind: 'diagram',
          content: {
            kind: 'diagram-content',
            imageAlt: 'A labelled machine.',
            imageUrl: 'https://private.example/signed?secret=do-not-copy',
            hotspots: [],
          },
          anchorIds: [],
        }],
        taskGroups: [{
          taskGroupId: 'group-1',
          officialTaskType: 'diagram-labeling',
          engineeringFamily: 'structured-layout',
          instructionBlocks: [{ id: 'instruction-1', text: 'Label the diagram.' }],
          stimulusRefs: [{ stimulusId: 'stimulus-1' }],
          interactions: [{
            interactionId: 'interaction-1',
            taskGroupId: 'group-1',
            displayNumber: 1,
            promptText: 'Choose label 1.',
            responseShape: { kind: 'single-choice', optionSetId: 'options-1' },
          }],
        }],
      },
    });
    expect(adaptReadingV2ProjectionToBookActivities({ projection: diagram }))
      .toMatchObject({ ok: false, code: 'missing-source-context' });

    const result = adaptReadingV2ProjectionToBookActivities({
      projection: diagram,
      contextForTaskGroup: () => ({
        sourceContext: { available: true, sourcePartLabel: 'Page 4' },
        authorizedAssetRefs: [{
          kind: 'image',
          assetId: 'book-image-1',
          sourceRef: 'reading-stimulus:stimulus-1',
        }],
      }),
    });
    expect(result).toMatchObject({
      ok: true,
      projections: [{
        presentationMode: 'source-assisted',
        stimulus: null,
        assetRefs: [{ kind: 'image', assetId: 'book-image-1' }],
      }],
    });
    expect(JSON.stringify(result)).not.toContain('private.example');
    expect(JSON.stringify(result)).not.toContain('do-not-copy');
  });

  it('fails closed for unsupported runtime contracts and missing option sets', () => {
    expect(adaptReadingV2ProjectionToBookActivities({
      projection: projection({ runtimeContract: 'analytics' }),
    })).toMatchObject({ ok: false, code: 'unsupported-shape' });
    expect(adaptReadingV2ProjectionToBookActivities({
      projection: projection({
        content: { ...projection().content, optionSets: [] },
      }),
      contextForTaskGroup: () => ({
        sourceContext: { available: true, sourcePartLabel: 'Page 1' },
      }),
    })).toMatchObject({ ok: false, code: 'malformed-export' });
    expect(adaptReadingV2ProjectionToBookActivities({
      projection: projection({
        content: {
          ...projection().content,
          stimuli: [],
        },
      }),
      contextForTaskGroup: () => ({
        sourceContext: { available: true },
      }),
    })).toMatchObject({ ok: false, code: 'malformed-export' });
    expect(adaptReadingV2ProjectionToBookActivities({
      projection: projection({
        content: {
          ...projection().content,
          taskGroups: [{
            ...projection().content.taskGroups[0]!,
            officialTaskType: 'multiple-select',
          }],
        },
      }),
      contextForTaskGroup: () => ({
        sourceContext: { available: true },
      }),
    })).toMatchObject({ ok: false, code: 'unsupported-shape' });
  });
});
