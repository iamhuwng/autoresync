import { describe, expect, it } from 'vitest';
import { calculateIELTSReadingBandScore, calculateIELTSListeningBandScore } from './scoring.config';

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

describe('IELTS Listening practice bands', () => {
  it.each([[15, 40, 4.5], [16, 40, 5], [20, 40, 5.5], [23, 40, 6], [26, 40, 6.5],
    [30, 40, 7], [32, 40, 7.5], [35, 40, 8], [39, 40, 9], [2, 2, 9], [0, 0, 0]])
    ('estimates %s/%s as band %s', (correct, total, band) => {
      expect(calculateIELTSListeningBandScore(correct!, total)).toBe(band);
    });
});
