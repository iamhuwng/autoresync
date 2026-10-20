import { describe, expect, it } from 'vitest';
import { createReadingV2CanonicalFixture } from './fixtures/readingV2CanonicalFixtures';
import { normalizeReadingV2MultipleSelectSlots } from './readingV2MultipleSelectNormalization.service';

describe('normalizeReadingV2MultipleSelectSlots', () => {
  it('repairs old duplicate slots without mutating their snapshot and preserves evidence and anchors', () => {
    const fixture = createReadingV2CanonicalFixture('multiple-select');
    const group = Object.values(fixture.taskGroups)[0];
    const [firstId, secondId] = group.interactionIds;
    const first = fixture.interactions[firstId];
    const second = fixture.interactions[secondId];
    const document = {
      ...fixture,
      interactions: {
        [firstId]: { ...first, promptText: 'Which TWO options are correct?', reviewLabel: { displayNumber: 25 },
          scoringRule: { ...first.scoringRule, acceptableAnswers: ['A', 'B'] } },
        [secondId]: { ...second, promptText: 'Which TWO options are correct?', reviewLabel: { displayNumber: 26 },
          scoringRule: { ...second.scoringRule, acceptableAnswers: ['A', 'B'] } },
      },
    };
    const before = structuredClone(document);
    const repaired = normalizeReadingV2MultipleSelectSlots(document);
    expect(document).toEqual(before);
    expect(Object.keys(repaired.interactions)).toEqual([firstId]);
    expect(repaired.taskGroups[group.taskGroupId]).toEqual({ ...group, interactionIds: [firstId] });
    expect(repaired.interactions[firstId]).toMatchObject({
      reviewLabel: { displayNumber: 25, answerSlotCount: 2 },
      scoringRule: { maxScore: 2, acceptableAnswers: ['A', 'B'], orderMatters: false },
      primaryAnchorId: first.primaryAnchorId,
      contextAnchorIds: [second.primaryAnchorId],
    });
    expect(repaired.anchors).toBe(document.anchors);
    expect(normalizeReadingV2MultipleSelectSlots(repaired)).toBe(repaired);
    expect(normalizeReadingV2MultipleSelectSlots({
      ...document,
      interactions: { ...document.interactions, [secondId]: { ...document.interactions[secondId], promptText: 'A different prompt' } },
    }).interactions).toHaveProperty(secondId);
    expect(normalizeReadingV2MultipleSelectSlots({
      ...document,
      interactions: { ...document.interactions, [secondId]: { ...document.interactions[secondId], scoringRule: { maxScore: 1, acceptableAnswers: [] } } },
    }).interactions).toHaveProperty(secondId);
  });
});
