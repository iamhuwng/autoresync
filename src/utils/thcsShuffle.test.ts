import { describe, expect, it } from 'vitest';
import { getIELTSQuestionsForStudent, shuffleIELTSTest } from './thcsShuffle';

const IELTS_QUESTIONS = [
  { number: 1, type: 'sentence-completion', passageId: 'p1', question: 'Q1', answer: 'alpha' },
  { number: 2, type: 'sentence-completion', passageId: 'p1', question: 'Q2', answer: 'beta' },
  { number: 3, type: 'multiple-choice', passageId: 'p1', question: 'Q3', answer: 'B', options: ['A1', 'B1', 'C1', 'D1'] },
  { number: 4, type: 'note-completion', passageId: 'p1', summaryGroupId: 'note-a', question: 'Q4', answer: 'delta' },
  { number: 5, type: 'note-completion', passageId: 'p1', summaryGroupId: 'note-a', question: 'Q5', answer: 'epsilon' },
  { number: 6, type: 'true-false-not-given', passageId: 'p1', question: 'Q6', answer: 'TRUE' },
  { number: 7, type: 'summary-completion-text', passageId: 'p1', summaryGroupId: 'summary-a', question: 'Q7', answer: 'eta' },
  { number: 8, type: 'summary-completion-text', passageId: 'p1', summaryGroupId: 'summary-a', question: 'Q8', answer: 'theta' },
  { number: 9, type: 'multiple-choice', passageId: 'p2', question: 'Q9', answer: 'A', options: ['A2', 'B2', 'C2', 'D2'] },
  { number: 10, type: 'diagram-labeling', passageId: 'p2', summaryGroupId: 'diagram-a', question: 'Q10', answer: 'iota' },
  { number: 11, type: 'diagram-labeling', passageId: 'p2', summaryGroupId: 'diagram-a', question: 'Q11', answer: 'kappa' },
];

function expectContiguousOrder(order: number[], group: number[]): void {
  const positions = group.map((questionNumber) => order.indexOf(questionNumber));
  expect(positions.every((position) => position >= 0)).toBe(true);
  expect(positions).toEqual(
    group.map((_, index) => positions[0]! + index),
  );
}

describe('shuffleIELTSTest', () => {
  it('shuffles IELTS task blocks deterministically per student and test', () => {
    const firstRun = shuffleIELTSTest(IELTS_QUESTIONS, 'student-a', 'test-1', {
      shuffleQuestions: true,
      shuffleOptions: false,
    }).map((question) => question.number);

    const secondRun = shuffleIELTSTest(IELTS_QUESTIONS, 'student-a', 'test-1', {
      shuffleQuestions: true,
      shuffleOptions: false,
    }).map((question) => question.number);

    expect(firstRun).toEqual(secondRun);
  });

  it('keeps question groups intact within each passage while shuffling task order', () => {
    const shuffledOrder = shuffleIELTSTest(IELTS_QUESTIONS, 'student-b', 'test-1', {
      shuffleQuestions: true,
      shuffleOptions: false,
    }).map((question) => question.number);

    expectContiguousOrder(shuffledOrder, [1, 2]);
    expectContiguousOrder(shuffledOrder, [4, 5]);
    expectContiguousOrder(shuffledOrder, [7, 8]);
    expectContiguousOrder(shuffledOrder, [10, 11]);

    const passageOnePositions = [1, 2, 3, 4, 5, 6, 7, 8].map((questionNumber) =>
      shuffledOrder.indexOf(questionNumber),
    );
    const passageTwoPositions = [9, 10, 11].map((questionNumber) =>
      shuffledOrder.indexOf(questionNumber),
    );

    expect(Math.max(...passageOnePositions)).toBeLessThan(Math.min(...passageTwoPositions));
  });

  it('produces a different task order for different students', () => {
    const studentAOrder = shuffleIELTSTest(IELTS_QUESTIONS, 'student-a', 'test-1', {
      shuffleQuestions: true,
      shuffleOptions: false,
    }).map((question) => question.number);

    const studentBOrder = shuffleIELTSTest(IELTS_QUESTIONS, 'student-b', 'test-1', {
      shuffleQuestions: true,
      shuffleOptions: false,
    }).map((question) => question.number);

    expect(studentAOrder).not.toEqual(studentBOrder);
  });

  it('remaps MCQ answer keys when shuffling options', () => {
    const mcqQuestion = [{
      number: 3,
      type: 'multiple-choice',
      passageId: 'p1',
      question: 'Q3',
      answer: 'B',
      options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
    }];

    const studentId = ['student-a', 'student-b', 'student-c', 'student-d'].find((candidate) => {
      const shuffled = shuffleIELTSTest(mcqQuestion, candidate, 'test-1', {
        shuffleQuestions: false,
        shuffleOptions: true,
      })[0];

      return shuffled.options.join('|') !== mcqQuestion[0]!.options.join('|');
    });

    expect(studentId).toBeDefined();

    const shuffledQuestion = shuffleIELTSTest(mcqQuestion, studentId!, 'test-1', {
      shuffleQuestions: false,
      shuffleOptions: true,
    })[0];

    const correctOptionIndex = shuffledQuestion.options.indexOf('Beta');
    expect(correctOptionIndex).toBeGreaterThanOrEqual(0);
    expect(shuffledQuestion.answer).toBe(['A', 'B', 'C', 'D'][correctOptionIndex]);
  });

  it('keeps stripped student payloads aligned with answer-bearing grading payloads', () => {
    const fullQuestion = [{
      id: 'question-3',
      number: 3,
      type: 'multiple-choice',
      passageId: 'p1',
      question: 'Q3',
      answer: 'B',
      options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
    }];
    const strippedQuestion = fullQuestion.map(({ answer, ...question }) => question);

    const studentId = ['student-a', 'student-b', 'student-c', 'student-d'].find((candidate) => {
      const shuffled = getIELTSQuestionsForStudent(fullQuestion, candidate, 'test-1', {
        shuffleQuestions: false,
        shuffleOptions: true,
      })[0];

      return shuffled.options.join('|') !== fullQuestion[0]!.options.join('|');
    });

    expect(studentId).toBeDefined();

    const renderedQuestion = getIELTSQuestionsForStudent(strippedQuestion, studentId!, 'test-1', {
      shuffleQuestions: false,
      shuffleOptions: true,
    })[0];
    const gradingQuestion = getIELTSQuestionsForStudent(fullQuestion, studentId!, 'test-1', {
      shuffleQuestions: false,
      shuffleOptions: true,
    })[0];

    expect(renderedQuestion.id).toBe('question-3');
    expect(renderedQuestion.number).toBe(3);
    expect(renderedQuestion.options).toEqual(gradingQuestion.options);
    expect(renderedQuestion).not.toHaveProperty('answer');

    const correctOptionIndex = gradingQuestion.options.indexOf('Beta');
    expect(correctOptionIndex).toBeGreaterThanOrEqual(0);
    expect(gradingQuestion.answer).toBe(['A', 'B', 'C', 'D'][correctOptionIndex]);
  });

  it('does not shuffle canonical labeled Reading option groups', () => {
    const matchingHeadingsQuestion = [{
      number: 14,
      type: 'matching-headings',
      passageId: 'p1',
      question: 'Choose the correct heading.',
      answer: 'iv',
      labeledOptions: [
        { label: 'ii', text: 'The spread of cities' },
        { label: 'iv', text: 'The dead' },
        { label: 'ix', text: 'The cities' },
      ],
      options: ['The spread of cities', 'The dead', 'The cities'],
    }];

    const shuffled = shuffleIELTSTest(matchingHeadingsQuestion, 'student-z', 'test-reading', {
      shuffleQuestions: false,
      shuffleOptions: true,
    })[0];

    expect(shuffled.labeledOptions).toEqual(matchingHeadingsQuestion[0].labeledOptions);
    expect(shuffled.options).toEqual(matchingHeadingsQuestion[0].options);
    expect(shuffled.answer).toBe('iv');
  });
});
