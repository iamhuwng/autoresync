import { describe, expect, it } from 'vitest';
import {
  deriveReadingV2VisibleNumbers,
  rebaseReadingV2InteractionOrder,
} from './readingV2Numbering.service';
import { READING_V2_CANONICAL_FIXTURES } from './fixtures/readingV2CanonicalFixtures';

describe('readingV2Numbering.service', () => {
  it('derives visible IELTS numbers without changing stable interaction IDs', () => {
    const fixture = READING_V2_CANONICAL_FIXTURES['matching-headings'];
    const taskGroup = Object.values(fixture.taskGroups)[0];

    expect(taskGroup).toBeDefined();

    const derived = deriveReadingV2VisibleNumbers([taskGroup], fixture.interactions, 14);

    expect(derived).toEqual([
      { interactionId: taskGroup.interactionIds[0], displayNumber: 14, label: 'Q14' },
      { interactionId: taskGroup.interactionIds[1], displayNumber: 15, label: 'Q15' },
    ]);
    expect(Object.keys(fixture.interactions)).toEqual(
      expect.arrayContaining(taskGroup.interactionIds),
    );
  });

  it('rebases interaction order without mutating stable IDs', () => {
    const fixture = READING_V2_CANONICAL_FIXTURES['short-answer'];
    const taskGroup = Object.values(fixture.taskGroups)[0];
    const originalOrder = taskGroup.interactionIds;
    const rebased = rebaseReadingV2InteractionOrder(originalOrder, 0, 1);

    expect(rebased).toEqual([originalOrder[1], originalOrder[0]]);
    expect(originalOrder).toEqual(taskGroup.interactionIds);
  });

  it('skips draft placeholders because they remain unnumbered and publish-blocking', () => {
    const fixture = READING_V2_CANONICAL_FIXTURES['sentence-completion'];
    const taskGroup = Object.values(fixture.taskGroups)[0];
    const firstInteraction = fixture.interactions[taskGroup.interactionIds[0]];
    const secondInteraction = fixture.interactions[taskGroup.interactionIds[1]];

    const derived = deriveReadingV2VisibleNumbers(
      [taskGroup],
      {
        [firstInteraction.interactionId]: { ...firstInteraction, placeholder: true },
        [secondInteraction.interactionId]: secondInteraction,
      },
      1,
    );

    expect(derived).toEqual([
      { interactionId: secondInteraction.interactionId, displayNumber: 1, label: 'Q1' },
    ]);
  });
});
