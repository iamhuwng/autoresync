import { describe, expect, it } from 'vitest';
import { composeReadingV2CompositionNumbering } from './readingV2CompositionNumbering.service';

describe('readingV2CompositionNumbering.service', () => {
  it('composes multi-passage numbering without collisions', () => {
    const numbering = composeReadingV2CompositionNumbering({
      passages: [
        {
          order: 1,
          passageMaterialId: 'passage-a',
          snapshotVersionId: 'snapshot-a',
          interactions: [
            { interactionId: 'passage-1:q1' },
            { interactionId: 'passage-1:q2' },
          ],
        },
        {
          order: 2,
          passageMaterialId: 'passage-b',
          snapshotVersionId: 'snapshot-b',
          interactions: [
            { interactionId: 'passage-2:q1' },
            { interactionId: 'passage-2:q2' },
            { interactionId: 'passage-2:q3' },
          ],
        },
      ],
    });

    expect(numbering.interactionDisplayNumbers).toEqual({
      'passage-1:q1': 1,
      'passage-1:q2': 2,
      'passage-2:q1': 3,
      'passage-2:q2': 4,
      'passage-2:q3': 5,
    });
    expect(numbering.passageRanges).toEqual([
      expect.objectContaining({ order: 1, firstDisplayNumber: 1, lastDisplayNumber: 2, questionCount: 2 }),
      expect.objectContaining({ order: 2, firstDisplayNumber: 3, lastDisplayNumber: 5, questionCount: 3 }),
    ]);
    expect(numbering.totalQuestionCount).toBe(5);
  });

  it('preserves numbers before a changed slot and recomputes changed and later slots for repair', () => {
    const numbering = composeReadingV2CompositionNumbering({
      preserveBeforeOrder: 2,
      previousInteractionDisplayNumbers: {
        'passage-1:q1': 1,
        'passage-1:q2': 2,
      },
      passages: [
        {
          order: 1,
          passageMaterialId: 'passage-a',
          snapshotVersionId: 'snapshot-a',
          interactions: [
            { interactionId: 'passage-1:q1' },
            { interactionId: 'passage-1:q2' },
          ],
        },
        {
          order: 2,
          passageMaterialId: 'passage-b-repaired',
          snapshotVersionId: 'snapshot-b2',
          interactions: [
            { interactionId: 'passage-2:q1' },
            { interactionId: 'passage-2:q2' },
            { interactionId: 'passage-2:q3' },
          ],
        },
        {
          order: 3,
          passageMaterialId: 'passage-c',
          snapshotVersionId: 'snapshot-c',
          interactions: [{ interactionId: 'passage-3:q1' }],
        },
      ],
    });

    expect(numbering.interactionDisplayNumbers).toMatchObject({
      'passage-1:q1': 1,
      'passage-1:q2': 2,
      'passage-2:q1': 3,
      'passage-2:q2': 4,
      'passage-2:q3': 5,
      'passage-3:q1': 6,
    });
    expect(numbering.passageRanges.map((range) => [range.order, range.firstDisplayNumber, range.lastDisplayNumber]))
      .toEqual([
        [1, 1, 2],
        [2, 3, 5],
        [3, 6, 6],
      ]);
  });
});
