import { describe, it, expect } from 'vitest';
import {
  normalizeAnswer,
  answersMatch,
  normalizeAnswerArray,
  isAnswerInList,
  removeAccents,
  normalizeAnswerStrict,
} from './answerNormalization';

describe('answerNormalization', () => {
  describe('normalizeAnswer', () => {
    it('should convert to lowercase', () => {
      expect(normalizeAnswer('HELLO')).toBe('hello');
      expect(normalizeAnswer('WoRLd')).toBe('world');
      expect(normalizeAnswer('ABC123')).toBe('abc123');
    });

    it('should trim leading and trailing whitespace', () => {
      expect(normalizeAnswer('  hello  ')).toBe('hello');
      expect(normalizeAnswer('\thello\t')).toBe('hello');
      expect(normalizeAnswer('\n hello \n')).toBe('hello');
      expect(normalizeAnswer('   spaces   ')).toBe('spaces');
    });

    it('should collapse multiple spaces to single space', () => {
      expect(normalizeAnswer('hello    world')).toBe('hello world');
      expect(normalizeAnswer('one  two   three')).toBe('one two three');
      expect(normalizeAnswer('multiple     spaces      here')).toBe('multiple spaces here');
    });

    it('should remove trailing punctuation', () => {
      expect(normalizeAnswer('hello.')).toBe('hello');
      expect(normalizeAnswer('world!')).toBe('world');
      expect(normalizeAnswer('question?')).toBe('question');
      expect(normalizeAnswer('Paris,')).toBe('paris');
      expect(normalizeAnswer('answer;')).toBe('answer');
      expect(normalizeAnswer('test:')).toBe('test');
    });

    it('should handle multiple normalization steps together', () => {
      expect(normalizeAnswer('  HELLO   WORLD  ')).toBe('hello world');
      expect(normalizeAnswer('  Paris.  ')).toBe('paris');
      expect(normalizeAnswer('  THE   ANSWER!  ')).toBe('the answer');
    });

    it('should handle empty strings', () => {
      expect(normalizeAnswer('')).toBe('');
      expect(normalizeAnswer('   ')).toBe('');
      expect(normalizeAnswer('\t\n')).toBe('');
    });

    it('should handle non-string inputs', () => {
      expect(normalizeAnswer(null)).toBe('');
      expect(normalizeAnswer(undefined)).toBe('');
      expect(normalizeAnswer(123)).toBe('');
      expect(normalizeAnswer({})).toBe('');
      expect(normalizeAnswer([])).toBe('');
    });

    it('should preserve internal punctuation', () => {
      expect(normalizeAnswer("it's")).toBe("it's");
      expect(normalizeAnswer('mother-in-law')).toBe('mother-in-law');
      expect(normalizeAnswer('e-mail')).toBe('e-mail');
    });

    it('should handle numbers', () => {
      expect(normalizeAnswer('42')).toBe('42');
      expect(normalizeAnswer('3.14')).toBe('3.14');
      expect(normalizeAnswer('100,000')).toBe('100,000');
    });

    it('should handle special characters', () => {
      expect(normalizeAnswer('hello@world')).toBe('hello@world');
      expect(normalizeAnswer('test#123')).toBe('test#123');
      expect(normalizeAnswer('50%')).toBe('50%');
    });
  });

  describe('answersMatch', () => {
    it('should return true for identical answers', () => {
      expect(answersMatch('hello', 'hello')).toBe(true);
      expect(answersMatch('world', 'world')).toBe(true);
    });

    it('should return true for case-insensitive matches', () => {
      expect(answersMatch('Hello', 'hello')).toBe(true);
      expect(answersMatch('WORLD', 'world')).toBe(true);
      expect(answersMatch('PaRiS', 'paris')).toBe(true);
    });

    it('should return true when whitespace differs', () => {
      expect(answersMatch('  hello  ', 'hello')).toBe(true);
      expect(answersMatch('hello   world', 'hello world')).toBe(true);
      expect(answersMatch('\thello\n', 'hello')).toBe(true);
    });

    it('should return true when trailing punctuation differs', () => {
      expect(answersMatch('hello.', 'hello')).toBe(true);
      expect(answersMatch('world!', 'world')).toBe(true);
      expect(answersMatch('question?', 'question')).toBe(true);
    });

    it('should return true for complex matches', () => {
      expect(answersMatch('  HELLO   WORLD!  ', 'hello world')).toBe(true);
      expect(answersMatch('Paris.', '  paris  ')).toBe(true);
    });

    it('should return false for different answers', () => {
      expect(answersMatch('hello', 'world')).toBe(false);
      expect(answersMatch('yes', 'no')).toBe(false);
      expect(answersMatch('Paris', 'London')).toBe(false);
    });

    it('should handle empty strings', () => {
      expect(answersMatch('', '')).toBe(true);
      expect(answersMatch('hello', '')).toBe(false);
      expect(answersMatch('', 'world')).toBe(false);
    });
  });

  describe('normalizeAnswerArray', () => {
    it('should normalize all answers in array', () => {
      const input = ['  HELLO  ', 'WORLD!', '  Paris.  '];
      const expected = ['hello', 'world', 'paris'];
      expect(normalizeAnswerArray(input)).toEqual(expected);
    });

    it('should handle empty array', () => {
      expect(normalizeAnswerArray([])).toEqual([]);
    });

    it('should handle array with empty strings', () => {
      const input = ['hello', '', '  ', 'world'];
      const expected = ['hello', '', '', 'world'];
      expect(normalizeAnswerArray(input)).toEqual(expected);
    });

    it('should handle non-array inputs', () => {
      expect(normalizeAnswerArray(null)).toEqual([]);
      expect(normalizeAnswerArray(undefined)).toEqual([]);
      expect(normalizeAnswerArray('not an array')).toEqual([]);
      expect(normalizeAnswerArray(123)).toEqual([]);
    });

    it('should preserve order', () => {
      const input = ['third', 'first', 'second'];
      const result = normalizeAnswerArray(input);
      expect(result[0]).toBe('third');
      expect(result[1]).toBe('first');
      expect(result[2]).toBe('second');
    });
  });

  describe('isAnswerInList', () => {
    it('should return true when answer is in list', () => {
      const correctAnswers = ['Paris', 'London', 'Berlin'];
      expect(isAnswerInList('Paris', correctAnswers)).toBe(true);
      expect(isAnswerInList('London', correctAnswers)).toBe(true);
      expect(isAnswerInList('Berlin', correctAnswers)).toBe(true);
    });

    it('should work with case-insensitive matching', () => {
      const correctAnswers = ['Paris', 'London', 'Berlin'];
      expect(isAnswerInList('PARIS', correctAnswers)).toBe(true);
      expect(isAnswerInList('london', correctAnswers)).toBe(true);
      expect(isAnswerInList('BeRLin', correctAnswers)).toBe(true);
    });

    it('should work with whitespace differences', () => {
      const correctAnswers = ['Paris', 'London', 'Berlin'];
      expect(isAnswerInList('  Paris  ', correctAnswers)).toBe(true);
      expect(isAnswerInList('London   ', correctAnswers)).toBe(true);
      expect(isAnswerInList('  Berlin', correctAnswers)).toBe(true);
    });

    it('should work with punctuation differences', () => {
      const correctAnswers = ['Paris', 'London', 'Berlin'];
      expect(isAnswerInList('Paris.', correctAnswers)).toBe(true);
      expect(isAnswerInList('London!', correctAnswers)).toBe(true);
      expect(isAnswerInList('Berlin?', correctAnswers)).toBe(true);
    });

    it('should return false when answer is not in list', () => {
      const correctAnswers = ['Paris', 'London', 'Berlin'];
      expect(isAnswerInList('Madrid', correctAnswers)).toBe(false);
      expect(isAnswerInList('Rome', correctAnswers)).toBe(false);
      expect(isAnswerInList('', correctAnswers)).toBe(false);
    });

    it('should handle empty list', () => {
      expect(isAnswerInList('Paris', [])).toBe(false);
    });

    it('should handle non-array inputs', () => {
      expect(isAnswerInList('Paris', null)).toBe(false);
      expect(isAnswerInList('Paris', undefined)).toBe(false);
      expect(isAnswerInList('Paris', 'not an array')).toBe(false);
    });

    it('should work with complex scenarios', () => {
      const correctAnswers = ['  PARIS  ', 'London!', 'Berlin.'];
      expect(isAnswerInList('paris', correctAnswers)).toBe(true);
      expect(isAnswerInList('  london  ', correctAnswers)).toBe(true);
      expect(isAnswerInList('BERLIN', correctAnswers)).toBe(true);
    });
  });

  describe('removeAccents', () => {
    it('should remove common accents', () => {
      expect(removeAccents('café')).toBe('cafe');
      expect(removeAccents('résumé')).toBe('resume');
      expect(removeAccents('naïve')).toBe('naive');
      expect(removeAccents('Zürich')).toBe('Zurich');
    });

    it('should handle strings without accents', () => {
      expect(removeAccents('hello')).toBe('hello');
      expect(removeAccents('world')).toBe('world');
      expect(removeAccents('123')).toBe('123');
    });

    it('should handle empty strings', () => {
      expect(removeAccents('')).toBe('');
    });

    it('should handle non-string inputs', () => {
      expect(removeAccents(null)).toBe('');
      expect(removeAccents(undefined)).toBe('');
      expect(removeAccents(123)).toBe('');
    });

    it('should handle multiple accented characters', () => {
      expect(removeAccents('Crème brûlée')).toBe('Creme brulee');
      expect(removeAccents('Ñoño')).toBe('Nono');
    });
  });

  describe('normalizeAnswerStrict', () => {
    it('should normalize and remove accents', () => {
      expect(normalizeAnswerStrict('  CAFÉ  ')).toBe('cafe');
      expect(normalizeAnswerStrict('Résumé.')).toBe('resume');
      expect(normalizeAnswerStrict('  Zürich!  ')).toBe('zurich');
    });

    it('should apply all normalization rules', () => {
      expect(normalizeAnswerStrict('  CRÈME   BRÛLÉE!  ')).toBe('creme brulee');
    });

    it('should handle strings without accents', () => {
      expect(normalizeAnswerStrict('  HELLO  WORLD!  ')).toBe('hello world');
    });
  });

  describe('real-world scenarios', () => {
    it('should handle IELTS-style answers', () => {
      // Geography answers
      expect(answersMatch('  The Pacific Ocean  ', 'the pacific ocean')).toBe(true);
      expect(answersMatch('MOUNT EVEREST.', 'mount everest')).toBe(true);

      // Historical dates/events
      expect(answersMatch('World War II', 'world war ii')).toBe(true);
      expect(answersMatch('1945.', '1945')).toBe(true);

      // Scientific terms
      expect(answersMatch('  Photosynthesis  ', 'photosynthesis')).toBe(true);
      expect(answersMatch('H2O!', 'h2o')).toBe(true);
    });

    it('should handle student typing variations', () => {
      // Extra spaces
      expect(answersMatch('the   capital   is   Paris', 'the capital is paris')).toBe(true);

      // Case variations
      expect(answersMatch('ALBERT EINSTEIN', 'albert einstein')).toBe(true);

      // Trailing punctuation
      expect(answersMatch('democracy.', 'democracy')).toBe(true);
    });

    it('should correctly reject incorrect answers', () => {
      expect(answersMatch('Paris', 'London')).toBe(false);
      expect(answersMatch('cat', 'dog')).toBe(false);
      expect(answersMatch('yes', 'no')).toBe(false);
    });

    it('should handle multi-word answers', () => {
      expect(answersMatch('  New   York  City  ', 'new york city')).toBe(true);
      expect(answersMatch('United States of America', 'united states of america')).toBe(true);
    });
  });
});
