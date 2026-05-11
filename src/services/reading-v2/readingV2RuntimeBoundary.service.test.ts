import { describe, expect, it } from 'vitest';
import { READING_V2_CANONICAL_FIXTURES } from './fixtures/readingV2CanonicalFixtures';
import { READING_V2_PROJECTION_FIXTURES } from './fixtures/readingV2ProjectionFixtures';
import { assertReadingV2RuntimeProjection } from './readingV2RuntimeBoundary.service';

describe('readingV2RuntimeBoundary.service', () => {
  it('accepts only runtime-safe Reading V2 projections', () => {
    expect(() => assertReadingV2RuntimeProjection(READING_V2_PROJECTION_FIXTURES.preview)).not.toThrow();
    expect(() => assertReadingV2RuntimeProjection(READING_V2_PROJECTION_FIXTURES.studentSafe)).not.toThrow();
    expect(() => assertReadingV2RuntimeProjection(READING_V2_PROJECTION_FIXTURES.sessionSafe)).not.toThrow();
  });

  it('rejects derived projections meant for review or analytics consumers', () => {
    expect(() => assertReadingV2RuntimeProjection(READING_V2_PROJECTION_FIXTURES.review)).toThrow(
      /runtime requires preview, student-safe, or session-safe projections/i,
    );
    expect(() => assertReadingV2RuntimeProjection(READING_V2_PROJECTION_FIXTURES.analytics)).toThrow(
      /runtime requires preview, student-safe, or session-safe projections/i,
    );
  });

  it('rejects canonical drafts before runtime rendering', () => {
    expect(() =>
      assertReadingV2RuntimeProjection(READING_V2_CANONICAL_FIXTURES['sentence-completion'] as any),
    ).toThrow(/derived projection payloads/i);
  });
});
