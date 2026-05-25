import { describe, expect, it } from 'vitest';
import {
  READING_V2_INSTRUCTION_DISPLAY_SOURCE,
  READING_V2_INSTRUCTION_TEXT_SOURCE,
  getReadingV2InstructionText,
  readingV2InstructionLooksStandard,
} from './readingV2InstructionTemplates.service';

describe('readingV2InstructionTemplates.service', () => {
  it('anchors standard instructions to the repo IELTS reading source docs', () => {
    expect(READING_V2_INSTRUCTION_TEXT_SOURCE).toBe('documentation/samples/IELTS-question-task-type-samples.md');
    expect(READING_V2_INSTRUCTION_DISPLAY_SOURCE).toBe('documentation/samples/IELTS-reading-question-type-display-design.md');
  });

  it('renders TFNG definitions once from the canonical task type', () => {
    const text = getReadingV2InstructionText('true-false-not-given', {
      passageNumber: 1,
      questionRange: { start: 1, end: 5 },
    });

    expect(text).toContain('Do the following statements agree with the information given in Reading Passage 1?');
    expect(text).toContain('In boxes 1-5 on your answer sheet, write');
    expect(text).toContain('TRUE if the statement agrees with the information');
    expect(text.match(/TRUE if/g)).toHaveLength(1);
  });

  it('uses exact source word-limit phrases when import semantics provide them', () => {
    const text = getReadingV2InstructionText('short-answer', {
      questionRange: { start: 6, end: 8 },
      wordLimit: 1,
      wordLimitText: 'ONE WORD ONLY',
    });

    expect(text).toBe([
      'Answer the questions below.',
      '',
      'Choose ONE WORD ONLY from the passage for each answer.',
      '',
      'Write your answers in boxes 6-8 on your answer sheet.',
    ].join('\n'));
  });

  it('recognizes legacy and source-copied task instructions as standard, not custom display text', () => {
    expect(readingV2InstructionLooksStandard(
      'table-completion',
      'Complete the table below. Choose NO MORE THAN TWO WORDS from the passage for each answer.',
      { questionRange: { start: 9, end: 13 }, wordLimit: 2 },
    )).toBe(true);
    expect(readingV2InstructionLooksStandard(
      'true-false-not-given',
      'Do the following statements agree with the information given in Reading Passage 1? TRUE if the statement agrees, FALSE if it contradicts, NOT GIVEN if there is no information.',
      { questionRange: { start: 1, end: 5 } },
    )).toBe(true);
    expect(readingV2InstructionLooksStandard(
      'true-false-not-given',
      'Do the following statements agree with the views of the writer? TRUE if the statement agrees with the views of the writer, FALSE if it contradicts them, NOT GIVEN if it is impossible to say.',
      { questionRange: { start: 23, end: 26 } },
    )).toBe(true);
    expect(readingV2InstructionLooksStandard(
      'matching-information',
      'Reading Passage 3 has 5 chapters. Which chapter contains the following information?',
      { questionRange: { start: 27, end: 31 }, referenceLabelRange: 'A-E' },
    )).toBe(true);
    expect(readingV2InstructionLooksStandard(
      'flowchart-completion',
      'The flow chart below shows the steps in chocolate making. Complete the flow chart using NO MORE THAN THREE WORDS from the passage for each blank.',
      { questionRange: { start: 37, end: 40 }, wordLimitText: 'NO MORE THAN THREE WORDS' },
    )).toBe(true);
  });
});
