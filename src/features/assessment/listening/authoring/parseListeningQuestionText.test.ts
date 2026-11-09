import { describe, expect, it } from 'vitest';
import { parseListeningQuestionText } from './parseListeningQuestionText';

describe('parseListeningQuestionText', () => {
  it('parses numbered questions without using the retired generic parser', () => {
    const result = parseListeningQuestionText('1. First answer\n2. Second answer');

    expect(result).toMatchObject({ success: true, confidence: 50 });
    expect(result.questions.map((question) => question.question)).toEqual([
      'First answer',
      'Second answer',
    ]);
  });
});
