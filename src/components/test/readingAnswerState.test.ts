import { describe, expect, it } from 'vitest';

import { isReadingAnswerEmpty } from './readingAnswerState';

describe('isReadingAnswerEmpty', () => {
  it('treats nullish values as empty', () => {
    expect(isReadingAnswerEmpty(undefined)).toBe(true);
    expect(isReadingAnswerEmpty(null)).toBe(true);
  });

  it('treats blank strings as empty', () => {
    expect(isReadingAnswerEmpty('')).toBe(true);
    expect(isReadingAnswerEmpty('   ')).toBe(true);
    expect(isReadingAnswerEmpty('answer')).toBe(false);
  });

  it('treats arrays as empty only when every entry is blank', () => {
    expect(isReadingAnswerEmpty([])).toBe(true);
    expect(isReadingAnswerEmpty(['', '   '])).toBe(true);
    expect(isReadingAnswerEmpty(['', 'value'])).toBe(false);
  });

  it('treats objects as empty only when every value is blank', () => {
    expect(isReadingAnswerEmpty({})).toBe(true);
    expect(isReadingAnswerEmpty({ a: '', b: '   ' })).toBe(true);
    expect(isReadingAnswerEmpty({ a: '', b: 'value' })).toBe(false);
  });
});
