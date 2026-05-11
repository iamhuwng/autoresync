import { describe, expect, it } from 'vitest';
import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import {
  assertReadingV2ImportAllowed,
  resolveReadingV2NonMigrationDecision,
} from './readingV2NonMigrationGuards.service';

describe('readingV2NonMigrationGuards.service', () => {
  it('accepts only explicit Reading V2 engine markers for V2 import paths', () => {
    expect(
      resolveReadingV2NonMigrationDecision({
        deliveryEngine: READING_V2_ENGINE,
        title: 'New Reading V2 material',
      }),
    ).toEqual({
      status: 'reading-v2',
      reason: 'explicit-engine',
    });
  });

  it('ignores historical Reading tests instead of silently migrating them', () => {
    const historicalReadingTest = {
      skill: 'reading',
      testType: 'ielts-reading',
      questions: [{ id: 'q1', text: 'Legacy flat question' }],
    };

    expect(resolveReadingV2NonMigrationDecision(historicalReadingTest)).toEqual({
      status: 'legacy-ignored',
      reason: 'historical-reading-not-migrated',
    });
    expect(() => assertReadingV2ImportAllowed(historicalReadingTest)).toThrow(/not automatically migrated/);
  });

  it('does not infer Reading V2 from V2-looking shape without engine markers', () => {
    expect(
      resolveReadingV2NonMigrationDecision({
        taskGroups: {},
        stimuli: {},
        sectionIds: [],
      }),
    ).toEqual({
      status: 'legacy-ignored',
      reason: 'historical-reading-not-migrated',
    });
  });
});
