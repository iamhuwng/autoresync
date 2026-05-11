import { describe, expect, it } from 'vitest';
import { assertValidReadingV2CanonicalDocument } from '../readingV2ContractGuards.service';
import { deriveReadingV2VisibleNumbers } from '../readingV2Numbering.service';
import { READING_V2_CANONICAL_FIXTURES } from './readingV2CanonicalFixtures';
import { READING_V2_FIXTURE_MANIFEST } from './readingV2FixtureManifest';

describe('readingV2GoldSamples', () => {
  it('provides one canonical gold sample for every official task type', () => {
    expect(Object.keys(READING_V2_CANONICAL_FIXTURES).sort()).toEqual(
      Object.keys(READING_V2_FIXTURE_MANIFEST).sort(),
    );
  });

  it('validates every canonical gold sample through the contract guards', () => {
    Object.values(READING_V2_CANONICAL_FIXTURES).forEach((fixture) => {
      expect(() => assertValidReadingV2CanonicalDocument(fixture)).not.toThrow();
    });
  });

  it('derives visible numbering for every canonical gold sample without mutating stable IDs', () => {
    Object.values(READING_V2_CANONICAL_FIXTURES).forEach((fixture) => {
      const taskGroup = Object.values(fixture.taskGroups)[0];
      const derived = deriveReadingV2VisibleNumbers([taskGroup], fixture.interactions);

      expect(derived.map((entry) => entry.displayNumber)).toEqual([1, 2]);
      expect(derived.map((entry) => entry.interactionId)).toEqual(taskGroup.interactionIds);
    });
  });
});
