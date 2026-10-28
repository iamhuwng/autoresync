import { describe, expect, it } from 'vitest';
import { listeningBlanks, renumberListeningContextQuestions, syncListeningQuestionUpdate } from './listeningQuestionContext';

const questions = [1, 2].map((number, index) => ({
  number, type: 'completion', question: index === 0 ? 'Name: [1]' : 'Address: 2 ______',
  answer: index === 0 ? 'Alice' : 'London', sectionNumber: 1,
  context: { sectionHeading: 'Booking details', contextLines: ['Name: [1]', 'Address: 2 ______', 'Telephone: 012345'], currentLineIndex: index },
}));

describe('native Listening context updates', () => {
  it('keeps source blank numbers in all supported native spellings', () => {
    expect(listeningBlanks('___1___ / 2 ..... / (3) / [4] / ____').map(blank => blank.number))
      .toEqual([1, 2, 3, 4, undefined]);
  });

  it('updates one prompt in the shared context without changing another answer or fixed content', () => {
    const updated = syncListeningQuestionUpdate(questions, questions[0]!, { ...questions[0]!, question: 'Full name: [1]' });
    expect(updated.map(question => question.question)).toEqual(['Full name: [1]', 'Address: 2 ______']);
    expect(updated[1]!.context.contextLines).toEqual(['Full name: [1]', 'Address: 2 ______', 'Telephone: 012345']);
    expect(updated.map(question => question.answer)).toEqual(['Alice', 'London']);
    expect(questions[0]!.context.contextLines[0]).toBe('Name: [1]');
  });

  it('preserves number-to-line mapping when a teacher adds a fixed context line', () => {
    const updated = syncListeningQuestionUpdate(questions, questions[0]!, { ...questions[0]!,
      context: { ...questions[0]!.context, sectionHeading: 'Revised booking',
        contextLines: ['Customer information', 'Full name: [1]', 'Address: 2 ______', 'Telephone: 012345'] } });
    expect(updated.map(question => question.context.currentLineIndex)).toEqual([1, 2]);
    expect(updated.map(question => question.question)).toEqual(['Full name: [1]', 'Address: 2 ______']);
    expect(updated[1]!.context.sectionHeading).toBe('Revised booking');
  });

  it('renumbers retained form blanks after deletion without giving the deleted blank another answer', () => {
    const updated = renumberListeningContextQuestions([questions[1]!]);
    expect(updated[0]!.number).toBe(1);
    expect(updated[0]!.question).toBe('Address: [1]');
    expect(updated[0]!.context.contextLines).toEqual(['Name: ____', 'Address: [1]', 'Telephone: 012345']);
    expect(updated[0]!.answer).toBe('London');
  });
});
