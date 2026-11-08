import { describe, expect, it } from 'vitest';
import { createReadingV2CanonicalFixture } from './fixtures/readingV2CanonicalFixtures';
import { normalizeReadingV2FirebaseDocument } from './readingV2FirebaseDocument.service';
import { assertValidReadingV2CanonicalDocument } from './readingV2ContractGuards.service';
import { scoreReadingV2Answer } from './readingV2AnswerScoring';

describe('Reading V2 Firebase document boundary', () => {
  it('restores erased empty containers before validating and scoring table answers', () => {
    const document = structuredClone(createReadingV2CanonicalFixture('table-completion'));
    Object.values(document.interactions).forEach((interaction) => Reflect.deleteProperty(interaction, 'reviewLabel'));
    Reflect.deleteProperty(document, 'optionSets');
    Reflect.deleteProperty(document, 'validationState');
    const original = structuredClone(document);

    const normalized = normalizeReadingV2FirebaseDocument(document);

    expect(() => assertValidReadingV2CanonicalDocument(normalized)).not.toThrow();
    const interaction = Object.values(normalized.interactions)[0];
    expect(interaction.reviewLabel).toEqual({});
    expect(scoreReadingV2Answer(interaction.scoringRule.acceptableAnswers![0], interaction).score).toBe(1);
    expect(normalized.optionSets).toEqual({});
    expect(document).toEqual(original);
  });

  it('preserves explicit multiple-answer labels and partial marks', () => {
    const fixture = createReadingV2CanonicalFixture('multiple-select');
    const [id, interaction] = Object.entries(fixture.interactions)[0];
    const document = { ...fixture, interactions: { ...fixture.interactions, [id]: {
        ...interaction,
        reviewLabel: { displayNumber: 7, answerSlotCount: 2 },
        scoringRule: { maxScore: 2, acceptableAnswers: ['A', 'C'], orderMatters: false },
    } } };

    const normalized = normalizeReadingV2FirebaseDocument(document);
    const restored = normalized.interactions[id];
    expect(restored.reviewLabel).toEqual({ displayNumber: 7, answerSlotCount: 2 });
    expect(scoreReadingV2Answer(['C'], restored).score).toBe(1);
    expect(scoreReadingV2Answer(['C', 'A'], restored).score).toBe(2);
  });

  it('does not repair missing referenced interactions', () => {
    const document = structuredClone(createReadingV2CanonicalFixture('table-completion'));
    Reflect.deleteProperty(document.interactions, Object.keys(document.interactions)[0]);

    const normalized = normalizeReadingV2FirebaseDocument(document);
    expect(() => assertValidReadingV2CanonicalDocument(normalized)).toThrow('references missing interaction');
  });

  it('rejects malformed populated collections instead of erasing them', () => {
    const document = structuredClone(createReadingV2CanonicalFixture('table-completion'));
    Reflect.set(Object.values(document.taskGroups)[0], 'instructionBlocks', { unexpected: 'instruction' });

    expect(() => normalizeReadingV2FirebaseDocument(document)).toThrow('requires array-valued collections');
  });
});
