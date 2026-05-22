import { describe, expect, it } from 'vitest';
import { READING_V2_CANONICAL_TASK_TYPES } from '../../types/readingV2Taxonomy';
import {
  READING_V2_EXTERNAL_AI_PROMPT,
  READING_V2_STRUCTURED_MATERIALS_END,
  READING_V2_STRUCTURED_MATERIALS_START,
} from './readingV2ExternalAiPrompt.service';

describe('readingV2ExternalAiPrompt.service', () => {
  it('documents the full structured payload contract for external AI conversion', () => {
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain(READING_V2_STRUCTURED_MATERIALS_START);
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain(READING_V2_STRUCTURED_MATERIALS_END);
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('You do not know our app');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('Field meaning for an AI with no app context');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('one material per passage');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('Passage 2');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('sectionInstructionId');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('answerKeyText');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('labeledOptions');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('sectionReferences');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('wordLimit');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('wordLimitText');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('taskType');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('vocabulary');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('answerSource');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('sourceInstructionEvidence');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('customInstructionEvidence');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('sectionInstructions[].table.rows');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('sectionInstructions[].note');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('sectionInstructions[].flowchart.steps');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('sectionInstructions[].diagram');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('Preserve printed target numbers as labels');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('questionNumbers');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('Do not flatten table rows into questionText only');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('answerKeyAudit');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('Do not collapse skipped numbers');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('Never silently drop Passage 2, Passage 3');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('Preflight checklist before returning');
  });

  it('lists every canonical Reading V2 task type slug', () => {
    READING_V2_CANONICAL_TASK_TYPES.forEach((taskType) => {
      expect(READING_V2_EXTERNAL_AI_PROMPT).toContain(taskType);
    });
  });

  it('keeps teacher answer-key authority and separator rules explicit', () => {
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('the only marking truth');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('complete numbered teacher answer-key rows');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('Never infer answers from passages');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('Use | only for accepted alternatives');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('Keep / as literal answer text');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('Do not put answer-key text inside passage content');
  });

  it('keeps external AI away from final app-owned instruction text', () => {
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('Remove source instruction prose from student-visible content');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('Do not make the final instruction text for our app');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('The app will not display it as the final instruction');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('No source instruction prose appears in passages[].content, questions[].questionText, options, or final student-visible instruction fields');
    expect(READING_V2_EXTERNAL_AI_PROMPT).not.toContain('Exact task instruction, including word limits and option/reference-list directions');
  });

  it('requires source Markdown formatting to survive outside standard instructions', () => {
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('source Markdown formatting marks such as **bold**, *italic*, __bold__, _italic_, and `code`');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('Keep Markdown formatting marks in student-visible content');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('Do not convert Markdown to HTML');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('Do not preserve Markdown marks in standard task instruction prose');
  });

  it('teaches task type recognition without relying on internal app context', () => {
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('Task-type recognition table');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('statements agree with information in the passage');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('statements agree with claims/views of the writer');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('Choose headings for paragraphs/sections from List of Headings');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('Complete each sentence with ending A-G');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('Choose TWO/THREE letters');
  });

  it('defines Studio acceptance fields and avoids mixed structured-layout examples', () => {
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('Use labeledOptions for multiple-choice, multiple-select, and summary-completion-list');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('Use sectionReferences for matching-headings, matching-information, matching-features, and matching-sentence-endings');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('Include table only for table-completion, flowchart only for flowchart-completion, and diagram only for diagram-labeling');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('Table instruction example');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('Note instruction example');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('Flowchart instruction example');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('Diagram instruction example');
  });

  it('requires note-completion scaffold preservation instead of repeated heading flattening', () => {
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('put the real note scaffold under sectionInstructions[].note.sections');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('Repeated headings belong in note.sections[].heading');
    expect(READING_V2_EXTERNAL_AI_PROMPT).toContain('Do not flatten repeated note headings into every questionText');
  });
});
