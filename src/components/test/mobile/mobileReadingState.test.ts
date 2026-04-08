import { describe, expect, it } from 'vitest';
import { hydrateMobileReadingState, serializeMobileReadingState } from './mobileReadingState';

describe('mobileReadingState helpers', () => {
  it('hydrates legacy saved payloads without restoring removed flagged state', () => {
    const hydrated = hydrateMobileReadingState({
      activePassageId: 'p2',
      questionSheetOpen: true,
      reviewSummaryOpen: false,
      flaggedQuestions: [2, 5],
      passageScrollByPassage: { p2: 120 },
      activeQuestionGroupByPassage: { p2: 5 },
      questionSheetScrollByPassage: { p2: 88 },
      textSize: 18,
    }, 16);

    expect(hydrated).toEqual({
      activePassageId: 'p2',
      questionSheetOpen: true,
      reviewSummaryOpen: false,
      passageScrollByPassage: { p2: 120 },
      activeQuestionGroupByPassage: { p2: 5 },
      questionSheetScrollByPassage: { p2: 88 },
      textSize: 18,
    });
  });

  it('serializes the current mobile state without the removed flaggedQuestions field', () => {
    expect(serializeMobileReadingState({
      activePassageId: 'p1',
      questionSheetOpen: true,
      reviewSummaryOpen: false,
      passageScrollByPassage: { p1: 64 },
      activeQuestionGroupByPassage: { p1: 3 },
      questionSheetScrollByPassage: { p1: 40 },
      textSize: 19,
    })).toEqual({
      activePassageId: 'p1',
      questionSheetOpen: true,
      reviewSummaryOpen: false,
      passageScrollByPassage: { p1: 64 },
      activeQuestionGroupByPassage: { p1: 3 },
      questionSheetScrollByPassage: { p1: 40 },
      textSize: 19,
    });
  });
});
