import { describe, expect, it } from 'vitest';
import {
  buildSavedResultFeedbackMetadata,
  classifySavedResultFeedbackKind,
} from './feedbackClassification.service';

describe('feedbackClassification.service', () => {
  it('classifies THCS results from section results', () => {
    expect(
      classifySavedResultFeedbackKind({
        testType: 'practice_thcs',
        testSkill: 'grammar',
        thcsData: {
          sectionResults: [{ sectionId: 's1' }],
        },
      } as any),
    ).toBe('thcs');
  });

  it('classifies IELTS reading and listening results from type and skill', () => {
    expect(
      classifySavedResultFeedbackKind({
        testType: 'ielts-reading',
        testSkill: 'reading',
        ieltsData: {
          passageResults: [{ passageName: 'Passage 1', questionRange: [1, 13], correct: 10, total: 13, percentage: 76.9 }],
        },
      } as any),
    ).toBe('ielts-reading');

    expect(
      classifySavedResultFeedbackKind({
        testType: 'ielts-listening',
        testSkill: 'listening',
        ieltsData: {
          passageResults: [
            { passageName: 'Part 1', questionRange: [1, 10], correct: 8, total: 10, percentage: 80 },
          ],
        },
      } as any),
    ).toBe('ielts-listening');
  });

  it('classifies IELTS fixtures from title signals when skill matches and breakdown metadata is absent', () => {
    expect(
      classifySavedResultFeedbackKind({
        testTitle: 'IELTS Reading Practice Test 3',
        testType: 'reading',
        testSkill: 'reading',
      } as any),
    ).toBe('ielts-reading');
  });

  it('keeps generic reading and listening results unclassified without IELTS evidence', () => {
    expect(
      classifySavedResultFeedbackKind({
        testType: 'reading',
        testSkill: 'reading',
      } as any),
    ).toBeNull();

    expect(
      classifySavedResultFeedbackKind({
        testType: 'listening',
        testSkill: 'listening',
      } as any),
    ).toBeNull();
  });

  it('builds normalized IELTS metadata with segment labels and breakdowns', () => {
    const metadata = buildSavedResultFeedbackMetadata({
      testType: 'ielts-listening',
      testSkill: 'listening',
      questionResults: [
        { questionNumber: 1, questionType: 'multiple-choice', isCorrect: true, studentAnswer: 'A' },
        { questionNumber: 2, questionType: 'form-completion', isCorrect: false, studentAnswer: '' },
      ],
      ieltsData: {
        passageResults: [
          { passageName: 'Part 1', questionRange: [1, 2], correct: 1, total: 2, percentage: 50 },
        ],
      },
    } as any);

    expect(metadata.kind).toBe('ielts-listening');
    expect(metadata.formatKind).toBe('ielts-listening');
    expect(metadata.segmentLabel).toBe('Part');
    expect(metadata.unansweredCount).toBe(1);
    expect(metadata.questionTypeBreakdown).toEqual([
      expect.objectContaining({
        questionType: 'form_completion',
        correct: 0,
        total: 1,
      }),
      expect.objectContaining({
        questionType: 'multiple_choice',
        correct: 1,
        total: 1,
      }),
    ]);
    expect(metadata.segmentBreakdown).toEqual([
      expect.objectContaining({
        segmentName: 'Part 1',
        sourceName: 'Part 1',
      }),
    ]);
  });
});
