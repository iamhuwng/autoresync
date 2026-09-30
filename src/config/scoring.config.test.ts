import { describe, expect, it } from 'vitest';
import { calculateIELTSReadingBandScore } from './scoring.config';

describe('Academic IELTS Reading practice bands', () => {
  it.each([
    [15, 40, 5],
    [23, 40, 6],
    [30, 40, 7],
    [35, 40, 8],
    [39, 40, 9],
    [13, 13, 9],
  ])('estimates %s/%s as band %s', (correct, total, band) => {
    expect(calculateIELTSReadingBandScore(correct, total)).toBe(band);
  });
});
