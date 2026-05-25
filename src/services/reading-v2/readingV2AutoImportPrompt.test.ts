import { describe, expect, it } from 'vitest';
import {
  buildReadingV2AutoImportPrompt,
  READING_V2_AUTO_IMPORT_SYSTEM_INSTRUCTION,
} from './readingV2AutoImportPrompt';

describe('readingV2AutoImportPrompt', () => {
  it('locks Auto import to JSON, source-traceable answers, and Reading V2 task types', () => {
    const prompt = buildReadingV2AutoImportPrompt({
      rawTestText: 'READING PASSAGE 1\nA raw passage.\nQuestions 1-1\n1 Statement.\nAnswers\n1 TRUE',
      sourceName: 'Auto source',
      passageNumber: 1,
      answerKeyText: '1 TRUE',
      sourceLedgerSummary: [
        'SOURCE_LEDGER_EXPECTATIONS:',
        '- local ledger is topology authority; Gemini is extraction witness only',
        '- expected question numbers: 1',
        '- visible answer-key row count: 1',
      ].join('\n'),
    });

    expect(READING_V2_AUTO_IMPORT_SYSTEM_INSTRUCTION).toContain('Return valid JSON only');
    expect(READING_V2_AUTO_IMPORT_SYSTEM_INSTRUCTION).toContain('Never generate, infer, or guess answers');
    expect(READING_V2_AUTO_IMPORT_SYSTEM_INSTRUCTION).toContain('Preserve source Markdown marks in student-visible passage');
    expect(prompt).toContain('true-false-not-given');
    expect(prompt).toContain('matching-headings');
    expect(prompt).toContain('Copy answer-key rows into answerKeyText only');
    expect(prompt).toContain('Raw source ledger is topology authority');
    expect(prompt).toContain('local ledger is topology authority; Gemini is extraction witness only');
    expect(prompt).toContain('expected question numbers: 1');
    expect(prompt).toContain('Do not create canonical ids');
    expect(prompt).toContain('sourceLedgerEvidence');
    expect(prompt).not.toContain('"sectionInstructionId"');
    expect(prompt).not.toContain('"id": "p1-q1-5"');
    expect(prompt).toContain('For note-completion, preserve note bullets/headings under sectionInstructions[].note');
    expect(prompt).toContain('do not duplicate repeated note headings into every questionText');
    expect(prompt).toContain('Preserve source Markdown marks such as **bold**, *italic*, __bold__, _italic_, and `code`');
    expect(prompt).toContain('Remove IELTS source instruction prose from student-visible content fields');
    expect(prompt).toContain('Do not put word-limit tags or phrases in questionText');
    expect(prompt).toContain('Do not convert Markdown to HTML');
    expect(prompt).toContain('Visible source answer-key text detected before AI:');
    expect(prompt).toContain('<RAW_READING_SOURCE>');
    expect(prompt).toContain('</RAW_READING_SOURCE>');
  });

  it('allows Gemini to copy visible raw-source answer keys when pre-detection misses them', () => {
    const prompt = buildReadingV2AutoImportPrompt({
      rawTestText: 'READING PASSAGE 1\nA raw passage.\nAnswer key\nQ1: TRUE',
    });

    expect(prompt).toContain('If RAW_READING_SOURCE contains a visible answer-key section');
    expect(prompt).toContain('Do not infer answers from passages');
  });
});
