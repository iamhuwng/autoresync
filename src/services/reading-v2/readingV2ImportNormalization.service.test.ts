import { describe, expect, it } from 'vitest';
import { assertValidReadingV2CanonicalDocument } from './readingV2ContractGuards.service';
import {
  READING_V2_FULL_TEST_40_PASTE_IMPORT_FIXTURE,
  READING_V2_MALFORMED_KEY_PASTE_IMPORT_FIXTURES,
  READING_V2_PASTE_IMPORT_FIXTURES_BY_TASK_TYPE,
  READING_V2_STRUCTURED_LAYOUT_BLANK_BINDING_FIXTURES,
} from './fixtures/readingV2PasteImportFixtures';
import {
  createReadingV2ImportCandidateFromText,
  normalizeReadingV2ImportCandidate,
  parseReadingV2TeacherAnswerKey,
} from './readingV2ImportNormalization.service';
import {
  deserializeReadingV2CanonicalToEditorDocument,
  serializeReadingV2EditorDocumentToCanonical,
  validateReadingV2EditorDocument,
} from './readingV2EditorDocument.service';
import {
  READING_V2_STRUCTURED_MATERIALS_END,
  READING_V2_STRUCTURED_MATERIALS_START,
} from './readingV2ExternalAiPrompt.service';
import { generateReadingV2PreviewProjection } from './readingV2Projection.service';
import { validateReadingV2Draft } from './readingV2Validation.service';

describe('readingV2ImportNormalization.service', () => {
  it('normalizes an in-repo full IELTS Reading fixture without external Clippings dependency', () => {
    const source = READING_V2_FULL_TEST_40_PASTE_IMPORT_FIXTURE.rawText;
    const candidate = createReadingV2ImportCandidateFromText({
      text: source,
      answerKeyText: READING_V2_FULL_TEST_40_PASTE_IMPORT_FIXTURE.answerKeyText,
      fileName: `${READING_V2_FULL_TEST_40_PASTE_IMPORT_FIXTURE.name}.txt`,
    });
    const result = normalizeReadingV2ImportCandidate(candidate);
    const taskTypes = Object.values(result.document.taskGroups).map((taskGroup) => taskGroup.officialTaskType);
    const validation = validateReadingV2Draft(result.document);

    assertValidReadingV2CanonicalDocument(result.document);
    expect(candidate.evidence).toEqual(expect.arrayContaining([
      'Detected 3 structured passages',
      'Detected 9 structured question groups',
      'Detected 40 structured questions',
      'Structured task type: true-false-not-given',
    ]));
    expect(Object.values(result.document.stimuli)[0]?.content.kind).toBe('passage-content');
    expect(result.document.sectionIds).toHaveLength(3);
    expect(taskTypes).toEqual(expect.arrayContaining(['true-false-not-given', 'table-completion', 'matching-information']));
    expect(Object.keys(result.document.interactions)).toHaveLength(40);
    expect(Object.values(result.document.interactions).find(
      (interaction) => interaction.reviewLabel.displayNumber === 1,
    )?.promptText).toContain('Imported judgement statement 1');
    expect(Object.values(result.document.interactions).find(
      (interaction) => interaction.reviewLabel.displayNumber === 1,
    )?.scoringRule.acceptableAnswers.map((answer) => answer.toLowerCase())).toContain('true');
    const summaryInteraction = Object.values(result.document.interactions).find(
      (interaction) => interaction.reviewLabel.displayNumber === 10,
    );
    expect(summaryInteraction?.promptText).toContain('Imported completion sentence 10');
    expect(summaryInteraction?.responseShape).toMatchObject({ kind: 'free-text', wordLimit: 1 });
    expect(result.importEvidenceIds).toHaveLength(0);
    expect(validation.canPublish).toBe(true);
  });

  it('keeps import evidence identifiers out of delivery projections', () => {
    const source = READING_V2_FULL_TEST_40_PASTE_IMPORT_FIXTURE.rawText;
    const candidate = createReadingV2ImportCandidateFromText({
      text: source,
      answerKeyText: READING_V2_FULL_TEST_40_PASTE_IMPORT_FIXTURE.answerKeyText,
    });
    const result = normalizeReadingV2ImportCandidate(candidate);
    const projection = generateReadingV2PreviewProjection({
      draftId: 'import-preview',
      ownerId: 'teacher-1',
      document: result.document,
    });
    const projected = JSON.stringify(projection);

    result.importEvidenceIds.forEach((evidenceId) => {
      expect(projected).not.toContain(evidenceId);
    });
    expect(projection.content.taskGroups[0].interactions[0].promptText).toContain(
      'Imported judgement statement 1',
    );
    expect(projection.content.taskGroups[1].interactions[0].promptText).toContain('Imported information statement 6');
    expect(projected).not.toContain('importEvidenceRefs');
  });

  it('keeps raw teacher key payloads out of imported draft projections', () => {
    const candidate = createReadingV2ImportCandidateFromText({
      text: [
        '## Imported Reading passage',
        '',
        'This imported passage has enough text to become an editable Reading V2 passage paragraph with a question.',
        '',
        '#### Questions 1-1',
        'Complete the sentence with ___.',
        '**1** Imported prompt ___.',
      ].join('\n'),
      answerKeyText: '1 secret-teacher-key',
    });
    const result = normalizeReadingV2ImportCandidate(candidate);
    const projection = generateReadingV2PreviewProjection({
      draftId: 'import-preview-with-teacher-key',
      ownerId: 'teacher-1',
      document: result.document,
    });
    const projected = JSON.stringify(projection);

    expect(projected).not.toContain('secret-teacher-key');
    expect(projected).not.toContain('answerKeyText');
    expect(projected).not.toContain('teacherAnswerKey');
    expect(projected).not.toContain('rawAnswerText');
    expect(projected).not.toContain('parsedAnswerValues');
  });

  it('fails closed for unsupported uploaded source files', () => {
    const candidate = createReadingV2ImportCandidateFromText({
      text: 'Unsupported spreadsheet content',
      fileName: 'reading-import.xlsx',
      sourceKind: 'uploaded-file',
    });

    expect(candidate.supportedFileType).toBeUndefined();
    expect(candidate.publishBlockingPlaceholders).toContain('Unsupported uploaded source file');
    expect(() => normalizeReadingV2ImportCandidate(candidate)).toThrow(/Unsupported Reading V2 import source/);
  });

  it('keeps teacher answer key rows separate and binds them as scoring truth during normalization', () => {
    const candidate = createReadingV2ImportCandidateFromText({
      text: [
        '## Imported Reading passage',
        '',
        'This imported passage has enough text to become an editable Reading V2 passage paragraph with a question.',
        '',
        '#### Questions 1-1',
        'Complete the sentence.',
        '**1** AI suggested answer',
      ].join('\n'),
      answerKeyText: '1 teacher answer | accepted alternative',
    });
    const result = normalizeReadingV2ImportCandidate(candidate);
    const interaction = Object.values(result.document.interactions).find(
      (candidateInteraction) => candidateInteraction.reviewLabel.displayNumber === 1,
    );

    expect(candidate.answerKeyText).toBe('1 teacher answer | accepted alternative');
    expect(candidate.evidence).toContain('Detected 1 teacher answer key rows');
    expect(interaction?.scoringRule.acceptableAnswers).toEqual(['teacher answer', 'accepted alternative']);
  });

  it('keeps teacher answer key values authoritative over structured payload answers', () => {
    const structuredPayload = [
      READING_V2_STRUCTURED_MATERIALS_START,
      '```json',
      JSON.stringify({
        materials: [
          {
            passageNumber: 1,
            title: 'Structured import',
            passages: [
              {
                title: 'Structured passage',
                content: 'This structured passage has enough content to create an imported Reading V2 passage paragraph.',
              },
            ],
            sectionInstructions: [
              {
                id: 'instruction-1',
                text: 'Complete the sentence with one word.',
                questionRange: { start: 1, end: 1 },
              },
            ],
            questions: [
              {
                number: 1,
                questionText: 'The answer is ___.',
                type: 'sentence-completion',
                sectionInstructionId: 'instruction-1',
                answer: 'ai payload answer',
              },
            ],
          },
        ],
      }),
      '```',
      READING_V2_STRUCTURED_MATERIALS_END,
    ].join('\n');
    const candidate = createReadingV2ImportCandidateFromText({
      text: structuredPayload,
      answerKeyText: '1 teacher structured answer',
    });
    const result = normalizeReadingV2ImportCandidate(candidate);
    const interaction = Object.values(result.document.interactions).find(
      (candidateInteraction) => candidateInteraction.reviewLabel.displayNumber === 1,
    );

    expect(interaction?.scoringRule.acceptableAnswers).toEqual(['teacher structured answer']);
  });

  it('preserves repeated note headings as note-completion layout instead of flattening them into every prompt', () => {
    const structuredPayload = [
      READING_V2_STRUCTURED_MATERIALS_START,
      '```json',
      JSON.stringify({
        sourceFile: 'practice-cam-11-reading-test-03.txt',
        materials: [
          {
            passageNumber: 1,
            title: 'The story of silk',
            passages: [
              {
                title: 'The story of silk',
                content: 'This structured passage has enough silk history text to create an imported Reading V2 passage paragraph.',
              },
            ],
            sectionInstructions: [
              {
                id: 'p1-q1-3',
                taskType: 'note-completion',
                questionRange: { start: 1, end: 3 },
                sourceInstructionEvidence: 'Complete the notes below. Choose ONE WORD ONLY from the passage.',
                wordLimit: 1,
                wordLimitText: 'ONE WORD ONLY',
              },
            ],
            questions: [
              {
                questionNumber: 1,
                type: 'note-completion',
                sectionInstructionId: 'p1-q1-3',
                questionText: 'Early silk production in China. Around 3000 BC: cocoon fell into wife’s ___.',
              },
              {
                questionNumber: 2,
                type: 'note-completion',
                sectionInstructionId: 'p1-q1-3',
                questionText: 'Early silk production in China. Wife invented a ___ to pull out silk fibres.',
              },
              {
                questionNumber: 3,
                type: 'note-completion',
                sectionInstructionId: 'p1-q1-3',
                questionText: 'Silk reaches rest of world. Merchants brought back ___ and precious metals.',
              },
            ],
          },
        ],
      }),
      '```',
      READING_V2_STRUCTURED_MATERIALS_END,
    ].join('\n');
    const candidate = createReadingV2ImportCandidateFromText({
      text: structuredPayload,
      answerKeyText: ['1 tea', '2 reel', '3 wool'].join('\n'),
    });
    const result = normalizeReadingV2ImportCandidate(candidate);
    const validation = validateReadingV2Draft(result.document);
    const taskGroup = Object.values(result.document.taskGroups)[0];
    const interactions = Object.values(result.document.interactions)
      .sort((left, right) => (left.reviewLabel.displayNumber ?? 0) - (right.reviewLabel.displayNumber ?? 0));
    const noteLayout = JSON.parse(taskGroup?.layoutHint ?? '{}') as {
      readonly sections?: readonly { readonly heading: string; readonly questionNumbers: readonly number[] }[];
    };

    expect(taskGroup?.officialTaskType).toBe('note-completion');
    expect(noteLayout.sections).toEqual([
      { heading: 'Early silk production in China', questionNumbers: [1, 2] },
    ]);
    expect(interactions[0]?.promptText).toBe('Around 3000 BC: cocoon fell into wife’s ___.');
    expect(interactions[1]?.promptText).toBe('Wife invented a ___ to pull out silk fibres.');
    expect(interactions[2]?.promptText).toBe('Silk reaches rest of world. Merchants brought back ___ and precious metals.');
    expect(validation.canPublish).toBe(true);
  });

  it('detects plain-text notes as note-completion instead of sentence-completion', () => {
    const candidate = createReadingV2ImportCandidateFromText({
      text: [
        'READING PASSAGE 1',
        '',
        'This passage has enough content to become an editable Reading V2 passage paragraph with notes.',
        '',
        '#### Questions 1-2',
        'Complete the notes below.',
        'Choose ONE WORD ONLY from the passage for each answer.',
        '1 First source note ___.',
        '2 Second source note ___.',
      ].join('\n'),
      answerKeyText: ['1 answer', '2 key'].join('\n'),
    });
    const result = normalizeReadingV2ImportCandidate(candidate);

    expect(Object.values(result.document.taskGroups)[0]?.officialTaskType).toBe('note-completion');
  });

  it('flags structured answer keys with matching row counts but wrong question numbers', () => {
    const structuredPayload = [
      READING_V2_STRUCTURED_MATERIALS_START,
      '```json',
      JSON.stringify({
        materials: [
          {
            passageNumber: 1,
            title: 'Wrong key binding',
            passages: [
              {
                title: 'Wrong key binding',
                content: 'This passage has enough content to create an imported Reading V2 passage paragraph.',
              },
            ],
            sectionInstructions: [
              {
                id: 'p1-q1-3',
                taskType: 'sentence-completion',
                questionRange: { start: 1, end: 3 },
              },
            ],
            questions: [
              { questionNumber: 1, type: 'sentence-completion', sectionInstructionId: 'p1-q1-3', questionText: 'First ___.' },
              { questionNumber: 2, type: 'sentence-completion', sectionInstructionId: 'p1-q1-3', questionText: 'Second ___.' },
              { questionNumber: 3, type: 'sentence-completion', sectionInstructionId: 'p1-q1-3', questionText: 'Third ___.' },
            ],
          },
        ],
      }),
      '```',
      READING_V2_STRUCTURED_MATERIALS_END,
    ].join('\n');
    const candidate = createReadingV2ImportCandidateFromText({
      text: structuredPayload,
      answerKeyText: ['4 four', '5 five', '6 six'].join('\n'),
    });

    expect(candidate.publishBlockingPlaceholders).toEqual(expect.arrayContaining([
      'Teacher answer key is missing rows for imported question numbers: 1, 2, 3',
      'Teacher answer key has rows that do not match imported questions: 4, 5, 6',
      'Imported questions are incomplete until answer keys are confirmed',
    ]));
  });

  it('preserves source Markdown marks for student-visible imported content while keeping instructions app-owned', () => {
    const structuredPayload = [
      READING_V2_STRUCTURED_MATERIALS_START,
      '```json',
      JSON.stringify({
        materials: [
          {
            passageNumber: 1,
            title: 'Markdown source',
            passages: [
              {
                title: 'Markdown passage',
                contentBlocks: [
                  { kind: 'paragraph', text: 'A **bold** passage with *italic* terms.' },
                  { kind: 'list-item', listKind: 'bullet', text: 'A __kept__ bullet with `code`.' },
                ],
              },
            ],
            sectionInstructions: [
              {
                id: 'p1-q1-1',
                taskType: 'multiple-choice',
                sourceInstructionEvidence: 'Choose the correct letter, A, B, C or D.',
                questionRange: { start: 1, end: 1 },
                labeledOptions: [
                  { label: 'A', text: '**Formatted** option' },
                  { label: 'B', text: '*Italic* option' },
                ],
              },
            ],
            questions: [
              {
                questionNumber: 1,
                type: 'multiple-choice',
                sectionInstructionId: 'p1-q1-1',
                questionText: 'Which phrase is **important** in the passage?',
                answer: 'A',
              },
            ],
          },
        ],
      }),
      '```',
      READING_V2_STRUCTURED_MATERIALS_END,
    ].join('\n');
    const result = normalizeReadingV2ImportCandidate(createReadingV2ImportCandidateFromText({ text: structuredPayload }));
    const passage = Object.values(result.document.stimuli).find((stimulus) => stimulus.content.kind === 'passage-content');
    const interaction = Object.values(result.document.interactions).find(
      (candidateInteraction) => candidateInteraction.reviewLabel.displayNumber === 1,
    );
    const optionSet = Object.values(result.document.optionSets)[0];
    const instruction = Object.values(result.document.taskGroups)[0]?.instructionBlocks[0]?.text;

    if (!passage || passage.content.kind !== 'passage-content') {
      throw new Error('Expected passage content.');
    }

    expect(passage.content.paragraphs.map((paragraph) => paragraph.text)).toEqual([
      'A **bold** passage with *italic* terms.',
      'A __kept__ bullet with `code`.',
    ]);
    expect(interaction?.promptText).toBe('Which phrase is **important** in the passage?');
    expect(optionSet?.options.map((option) => option.text)).toEqual(['**Formatted** option', '*Italic* option']);
    expect(instruction).toContain('Choose the correct letter');
    expect(instruction).not.toContain('**');
  });

  it('does not synthesize visible paragraph labels for plain-text imports', () => {
    const candidate = createReadingV2ImportCandidateFromText({
      text: [
        '## Stepwells',
        '',
        'A millennium ago, stepwells were fundamental to life in the driest parts of India.',
        '',
        'During the sixth and seventh centuries, residents developed new ways to reach groundwater.',
        '',
        '#### Questions 1-1',
        'Do the following statements agree with the information given in the passage? TRUE if the statement agrees, FALSE if it contradicts, NOT GIVEN if there is no information.',
        '**1** Stepwells were important in dry parts of India.',
      ].join('\n'),
      answerKeyText: '1 True',
    });
    const result = normalizeReadingV2ImportCandidate(candidate);
    const passageStimulus = Object.values(result.document.stimuli).find(
      (stimulus) => stimulus.content.kind === 'passage-content',
    );

    if (!passageStimulus || passageStimulus.content.kind !== 'passage-content') {
      throw new Error('Expected a passage stimulus.');
    }

    expect(passageStimulus.content.paragraphs[0]).not.toHaveProperty('label');
    expect(passageStimulus.content.paragraphs[0]?.text).toMatch(/^A millennium ago/);
    expect(Object.values(result.document.anchors)[0]?.label).toBe('Passage 1, paragraph 1');
  });

  it('keeps source-owned structured paragraph labels and omits generated labels', () => {
    const structuredPayload = [
      READING_V2_STRUCTURED_MATERIALS_START,
      '```json',
      JSON.stringify({
        materials: [
          {
            passageNumber: 1,
            title: 'Labeled source',
            passages: [
              {
                title: 'Source labels',
                contentBlocks: [
                  { kind: 'paragraph', label: 'A', text: 'Source-owned paragraph A has enough text for a visible passage block.' },
                  { kind: 'paragraph', text: 'Unlabeled paragraph keeps source text clean without an inserted letter.' },
                ],
              },
            ],
            sectionInstructions: [
              {
                id: 'instruction-1',
                text: 'Choose the correct heading for each paragraph from the list below.',
                questionRange: { start: 1, end: 1 },
                sectionReferences: [{ label: 'i', text: 'Source heading' }],
              },
            ],
            questions: [
              {
                number: 1,
                questionText: 'Paragraph A',
                type: 'matching-headings',
                sectionInstructionId: 'instruction-1',
                answer: 'i',
              },
            ],
          },
        ],
      }),
      '```',
      READING_V2_STRUCTURED_MATERIALS_END,
    ].join('\n');
    const result = normalizeReadingV2ImportCandidate(createReadingV2ImportCandidateFromText({ text: structuredPayload }));
    const passageStimulus = Object.values(result.document.stimuli).find(
      (stimulus) => stimulus.content.kind === 'passage-content',
    );

    if (!passageStimulus || passageStimulus.content.kind !== 'passage-content') {
      throw new Error('Expected a passage stimulus.');
    }

    expect(passageStimulus.content.paragraphs.map((paragraph) => paragraph.label)).toEqual(['A', undefined]);
  });

  it('normalizes standard structured TFNG instructions to one source-backed instruction', () => {
    const structuredPayload = [
      READING_V2_STRUCTURED_MATERIALS_START,
      '```json',
      JSON.stringify({
        materials: [
          {
            passageNumber: 1,
            title: 'TFNG import',
            passages: [
              {
                title: 'TFNG passage',
                content: 'This structured passage has enough content to create an imported TFNG Reading V2 passage.',
              },
            ],
            sectionInstructions: [
              {
                id: 'instruction-1',
                text: 'Do the following statements agree with the information given in Reading Passage 1? In boxes 1-1 on your answer sheet, write TRUE if the statement agrees with the information FALSE if the statement contradicts the information NOT GIVEN if there is no information on this.',
                questionRange: { start: 1, end: 1 },
              },
            ],
            questions: [
              {
                number: 1,
                questionText: 'The passage is structured.',
                type: 'true-false-not-given',
                sectionInstructionId: 'instruction-1',
                answer: 'True',
              },
            ],
          },
        ],
      }),
      '```',
      READING_V2_STRUCTURED_MATERIALS_END,
    ].join('\n');
    const result = normalizeReadingV2ImportCandidate(createReadingV2ImportCandidateFromText({ text: structuredPayload }));
    const taskGroup = Object.values(result.document.taskGroups)[0];

    expect(taskGroup?.instructionBlocks[0]?.text).toContain(
      'Do the following statements agree with the information given in Reading Passage 1?',
    );
    expect(taskGroup?.instructionBlocks[0]?.text.match(/TRUE if/g)).toHaveLength(1);
    expect(taskGroup?.answerRule.responseShape).toMatchObject({ kind: 'binary-judgement', vocabulary: 'TFNG' });
  });

  it('imports external-AI instruction semantics without requiring final visible instruction text from AI', () => {
    const structuredPayload = [
      READING_V2_STRUCTURED_MATERIALS_START,
      '```json',
      JSON.stringify({
        materials: [
          {
            passageNumber: 1,
            title: 'Short answer import',
            passages: [
              {
                title: 'Short answer passage',
                content: 'This passage has enough source text for a short-answer import with one-word answers.',
              },
            ],
            sectionInstructions: [
              {
                id: 'instruction-1',
                questionRange: { start: 6, end: 8 },
                sourceInstructionEvidence: 'Answer the questions below. Choose ONE WORD ONLY from the passage for each answer.',
                wordLimit: 1,
                wordLimitText: 'ONE WORD ONLY',
              },
            ],
            questions: [
              {
                number: 6,
                questionText: 'Which part provided shade?',
                type: 'short-answer',
                sectionInstructionId: 'instruction-1',
                answer: 'verandas',
              },
            ],
          },
        ],
      }),
      '```',
      READING_V2_STRUCTURED_MATERIALS_END,
    ].join('\n');
    const result = normalizeReadingV2ImportCandidate(createReadingV2ImportCandidateFromText({ text: structuredPayload }));
    const taskGroup = Object.values(result.document.taskGroups)[0];

    expect(taskGroup?.instructionBlocks[0]?.text).toBe([
      'Answer the questions below.',
      '',
      'Choose ONE WORD ONLY from the passage for each answer.',
      '',
      'Write your answers in boxes 6-8 on your answer sheet.',
    ].join('\n'));
    expect(taskGroup?.validationState.issues).toEqual([]);
  });

  it('keeps non-standard source instruction wording as teacher-review evidence instead of student display text', () => {
    const structuredPayload = [
      READING_V2_STRUCTURED_MATERIALS_START,
      '```json',
      JSON.stringify({
        materials: [
          {
            passageNumber: 1,
            title: 'Custom instruction import',
            passages: [
              {
                title: 'Custom instruction passage',
                content: 'This passage has enough content for a custom instruction review gate.',
              },
            ],
            sectionInstructions: [
              {
                id: 'instruction-1',
                questionRange: { start: 1, end: 1 },
                customInstructionEvidence: 'Use your imagination and explain why the author sounds confident.',
              },
            ],
            questions: [
              {
                number: 1,
                questionText: 'The author is confident.',
                type: 'true-false-not-given',
                sectionInstructionId: 'instruction-1',
                answer: 'TRUE',
              },
            ],
          },
        ],
      }),
      '```',
      READING_V2_STRUCTURED_MATERIALS_END,
    ].join('\n');
    const result = normalizeReadingV2ImportCandidate(createReadingV2ImportCandidateFromText({ text: structuredPayload }));
    const taskGroup = Object.values(result.document.taskGroups)[0];

    expect(taskGroup?.instructionBlocks[0]?.text).not.toContain('Use your imagination');
    expect(taskGroup?.instructionBlocks[0]?.text).toContain('Do the following statements agree');
    expect(taskGroup?.validationState.issues[0]).toMatchObject({
      code: 'unresolved-import-uncertainty',
      severity: 'error',
    });
    expect(taskGroup?.validationState.issues[0]?.message).toContain('Use your imagination');
  });

  it('consumes the stronger external-AI schema with multi-material passages, options, references, and word limits', () => {
    const structuredPayload = [
      READING_V2_STRUCTURED_MATERIALS_START,
      '```json',
      JSON.stringify({
        sourceFile: 'external-ai-full-test.md',
        materials: [
          {
            passageNumber: 1,
            title: 'Passage with headings',
            passages: [
              {
                title: 'Passage 1 title',
                content: [
                  'Paragraph A introduces the heading task.',
                  '',
                  'Paragraph B continues the heading task.',
                ].join('\n'),
              },
            ],
            sectionInstructions: [
              {
                id: 'p1-q1-2',
                text: 'Choose the correct heading for each paragraph from the list of headings below.',
                questionRange: { start: 1, end: 2 },
              },
            ],
            questions: [
              {
                questionNumber: 1,
                type: 'matching-headings',
                sectionInstructionId: 'p1-q1-2',
                questionText: 'Paragraph A',
                answer: 'ii',
                sectionReferences: [
                  { label: 'i', text: 'A historical overview' },
                  { label: 'ii', text: 'A surprising introduction' },
                ],
              },
              {
                questionNumber: 2,
                type: 'matching-headings',
                sectionInstructionId: 'p1-q1-2',
                questionText: 'Paragraph B',
                answer: 'i',
                sectionReferences: [
                  { label: 'i', text: 'A historical overview' },
                  { label: 'ii', text: 'A surprising introduction' },
                ],
              },
            ],
          },
          {
            passageNumber: 2,
            title: 'Passage with choices',
            passages: [
              {
                title: 'Passage 2 title',
                content: 'This passage has choice questions with printed option labels.',
              },
            ],
            sectionInstructions: [
              {
                id: 'p2-q3-3',
                text: 'Choose TWO letters, A-E.',
                questionRange: { start: 3, end: 3 },
              },
            ],
            questions: [
              {
                questionNumber: 3,
                type: 'multiple-select',
                sectionInstructionId: 'p2-q3-3',
                questionText: 'Which TWO statements are correct?',
                answer: ['A', 'C'],
                labeledOptions: [
                  { label: 'A', text: 'First option' },
                  { label: 'B', text: 'Second option' },
                  { label: 'C', text: 'Third option' },
                ],
              },
            ],
          },
          {
            passageNumber: 3,
            title: 'Passage with completion',
            passages: [
              {
                title: 'Passage 3 title',
                content: 'This passage has a sentence-completion answer with a printed word limit.',
              },
            ],
            sectionInstructions: [
              {
                id: 'p3-q4-4',
                text: 'Complete the sentence with NO MORE THAN TWO WORDS from the passage.',
                questionRange: { start: 4, end: 4 },
              },
            ],
            questions: [
              {
                questionNumber: 4,
                type: 'sentence-completion',
                sectionInstructionId: 'p3-q4-4',
                questionText: 'The final answer is ___.',
                answer: 'source guess',
                wordLimit: 2,
              },
            ],
          },
        ],
      }),
      '```',
      READING_V2_STRUCTURED_MATERIALS_END,
    ].join('\n');
    const candidate = createReadingV2ImportCandidateFromText({
      text: structuredPayload,
      answerKeyText: ['1 ii', '2 i', '3 A | C', '4 teacher phrase'].join('\n'),
    });
    const result = normalizeReadingV2ImportCandidate(candidate);
    const taskGroups = Object.values(result.document.taskGroups);
    const interactions = Object.values(result.document.interactions);
    const choiceOptionTexts = Object.values(result.document.optionSets)
      .flatMap((optionSet) => optionSet.options.map((option) => option.text));
    const questionThree = interactions.find((interaction) => interaction.reviewLabel.displayNumber === 3);
    const questionFour = interactions.find((interaction) => interaction.reviewLabel.displayNumber === 4);

    expect(result.document.sectionIds).toHaveLength(3);
    expect(taskGroups.map((taskGroup) => taskGroup.officialTaskType)).toEqual(expect.arrayContaining([
      'matching-headings',
      'multiple-select',
      'sentence-completion',
    ]));
    expect(choiceOptionTexts).toEqual(expect.arrayContaining([
      'A surprising introduction',
      'Third option',
    ]));
    expect(questionThree?.responseShape).toMatchObject({ kind: 'multi-select', selectionLimit: 2 });
    expect(questionThree?.scoringRule.acceptableAnswers).toEqual(['A', 'C']);
    expect(questionFour?.responseShape).toMatchObject({ kind: 'free-text', wordLimit: 2 });
    expect(questionFour?.scoringRule.acceptableAnswers).toEqual(['teacher phrase']);
  });

  it('parses teacher answer keys deterministically without treating slash as an alternative separator', () => {
    const parsed = parseReadingV2TeacherAnswerKey([
      'Answer key',
      '##### Passage 1',
      'Q1: TRUE',
      '2. false',
      '3) NOT GIVEN',
      '4 = one answer | accepted alternative',
      '5 A/B',
      '6:',
      'notes without number',
      '4 duplicate',
    ].join('\n'));

    expect(parsed.rows.map((row) => [row.questionNumber, row.parsedAnswerValues])).toEqual([
      [1, ['TRUE']],
      [2, ['false']],
      [3, ['NOT GIVEN']],
      [4, ['one answer', 'accepted alternative']],
      [5, ['A/B']],
      [6, []],
      [4, ['duplicate']],
    ]);
    expect(parsed.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
      'unsupported-answer-key-heading',
      'missing-answer-text',
      'unparsed-answer-key-line',
      'duplicate-question-number',
    ]));
    expect(parsed.diagnostics.some((diagnostic) =>
      diagnostic.code === 'unparsed-answer-key-line' && diagnostic.message.includes('line 2')
    )).toBe(false);
  });

  it('uses section-level reference banks from structured external-AI payloads', () => {
    const structuredPayload = [
      READING_V2_STRUCTURED_MATERIALS_START,
      '```json',
      JSON.stringify({
        sourceFile: 'structured-option-bank.txt',
        materials: [
          {
            passageNumber: 1,
            title: 'Passage with instruction options',
            passages: [
              {
                title: 'Instruction options',
                content: 'Paragraph A introduces a task. Paragraph B continues the same task.',
              },
            ],
            sectionInstructions: [
              {
                id: 'p1-q1-2',
                text: 'Choose the correct heading for each paragraph from the list below.',
                questionRange: { start: 1, end: 2 },
                sectionReferences: [
                  { label: 'i', text: 'First heading' },
                  { label: 'ii', text: 'Second heading' },
                  { label: 'iii', text: 'Unused heading' },
                ],
              },
            ],
            questions: [
              {
                questionNumber: 1,
                type: 'matching-headings',
                sectionInstructionId: 'p1-q1-2',
                questionText: 'Paragraph A',
              },
              {
                questionNumber: 2,
                type: 'matching-headings',
                sectionInstructionId: 'p1-q1-2',
                questionText: 'Paragraph B',
              },
            ],
          },
        ],
      }),
      '```',
      READING_V2_STRUCTURED_MATERIALS_END,
    ].join('\n');
    const candidate = createReadingV2ImportCandidateFromText({
      text: structuredPayload,
      answerKeyText: '1 i\n2 ii',
    });
    const result = normalizeReadingV2ImportCandidate(candidate);
    const optionSet = Object.values(result.document.optionSets)[0];

    expect(optionSet?.options.map((option) => option.label)).toEqual(['i', 'ii', 'iii']);
    expect(optionSet?.options.map((option) => option.text)).toEqual([
      'First heading',
      'Second heading',
      'Unused heading',
    ]);
    expect(candidate.evidence).toEqual(expect.arrayContaining([
      'Detected 1 structured passage',
      'Detected 1 structured question group',
      'Detected 2 structured questions',
    ]));
  });

  it('imports structured table-completion payloads as table-content with question blank anchors', () => {
    const structuredPayload = [
      READING_V2_STRUCTURED_MATERIALS_START,
      '```json',
      JSON.stringify({
        sourceFile: 'structured-table.txt',
        materials: [
          {
            passageNumber: 1,
            title: 'Stepwells table',
            passages: [
              {
                title: 'Stepwells',
                content: 'This passage describes Rani Ki Vav and Surya Kund with enough text for an imported Reading V2 passage.',
              },
            ],
            sectionInstructions: [
              {
                id: 'p1-q1-3',
                text: 'Complete the table below. Choose ONE WORD AND/OR A NUMBER from the passage for each answer.',
                questionRange: { start: 1, end: 3 },
                table: {
                  rows: [
                    [
                      { text: 'Place', role: 'header' },
                      { text: 'Date', role: 'header' },
                      { text: 'Notes', role: 'header' },
                    ],
                    [
                      { text: 'Rani Ki Vav' },
                      { text: 'Late 11th century' },
                      { text: 'Excellent condition despite the _____ of 2001.', questionNumber: 1 },
                    ],
                    [
                      { text: 'Surya Kund' },
                      { text: '1026' },
                      {
                        text: 'Steps on the _____ produce a geometric pattern. Looks more like a _____ than a well.',
                        questionNumbers: [2, 3],
                      },
                    ],
                  ],
                },
              },
            ],
            questions: [
              {
                questionNumber: 1,
                type: 'table-completion',
                sectionInstructionId: 'p1-q1-3',
                questionText: 'Rani Ki Vav: despite the ___ of 2001.',
              },
              {
                questionNumber: 2,
                type: 'table-completion',
                sectionInstructionId: 'p1-q1-3',
                questionText: 'Surya Kund: steps on the ___ produce a geometric pattern.',
              },
              {
                questionNumber: 3,
                type: 'table-completion',
                sectionInstructionId: 'p1-q1-3',
                questionText: 'Surya Kund: looks more like a ___ than a well.',
              },
            ],
          },
        ],
      }),
      '```',
      READING_V2_STRUCTURED_MATERIALS_END,
    ].join('\n');
    const candidate = createReadingV2ImportCandidateFromText({
      text: structuredPayload,
      answerKeyText: ['1 earthquake', '2 four sides', '3 tank'].join('\n'),
    });
    const result = normalizeReadingV2ImportCandidate(candidate);
    const taskGroup = Object.values(result.document.taskGroups)[0];
    const tableStimulus = Object.values(result.document.stimuli).find(
      (stimulus) => stimulus.content.kind === 'table-content',
    );
    const interactions = Object.values(result.document.interactions);

    expect(tableStimulus?.kind).toBe('table-shell');
    if (!taskGroup || !tableStimulus || tableStimulus.content.kind !== 'table-content') {
      throw new Error('Expected imported table-completion task to create a table stimulus.');
    }

    const blankAnchorIds = tableStimulus.content.rows.flatMap((row) =>
      row.flatMap((cell) => cell.anchorIds ?? (cell.anchorId ? [cell.anchorId] : [])),
    );
    const suryaBlankCell = tableStimulus.content.rows[2]?.[2];
    const questionOne = interactions.find((interaction) => interaction.reviewLabel.displayNumber === 1);
    const questionTwo = interactions.find((interaction) => interaction.reviewLabel.displayNumber === 2);
    const questionThree = interactions.find((interaction) => interaction.reviewLabel.displayNumber === 3);
    const validation = validateReadingV2Draft(result.document);

    assertValidReadingV2CanonicalDocument(result.document);
    expect(taskGroup.stimulusRefs[0]?.stimulusId).toBe(tableStimulus.stimulusId);
    expect(result.document.sections[taskGroup.sectionId]?.stimulusIds).toContain(tableStimulus.stimulusId);
    expect(blankAnchorIds).toHaveLength(3);
    expect(suryaBlankCell?.anchorIds).toHaveLength(2);
    expect(questionOne?.primaryAnchorId).toBe(blankAnchorIds[0]);
    expect(questionTwo?.primaryAnchorId).toBe(suryaBlankCell?.anchorIds?.[0]);
    expect(questionThree?.primaryAnchorId).toBe(suryaBlankCell?.anchorIds?.[1]);
    expect(questionTwo?.contextAnchorIds).toEqual([questionTwo.primaryAnchorId]);
    expect(questionThree?.scoringRule.acceptableAnswers).toEqual(['tank']);
    expect(validation.canPublish).toBe(true);
    expect(validation.blockingIssues).toEqual([]);
  });

  it.each(Object.entries(READING_V2_PASTE_IMPORT_FIXTURES_BY_TASK_TYPE))(
    'normalizes valid all-16 paste fixture for %s',
    (taskType, fixture) => {
      const candidate = createReadingV2ImportCandidateFromText({
        text: fixture.rawText,
        answerKeyText: fixture.answerKeyText,
      });
      const result = normalizeReadingV2ImportCandidate(candidate);
      const validation = validateReadingV2Draft(result.document);
      const taskGroups = Object.values(result.document.taskGroups);
      const interactions = Object.values(result.document.interactions);

      assertValidReadingV2CanonicalDocument(result.document);
      expect(result.document.sectionIds).toHaveLength(1);
      expect(taskGroups.map((taskGroup) => taskGroup.officialTaskType)).toEqual(fixture.expectedTaskTypes);
      expect(interactions).toHaveLength(fixture.expectedQuestionCount);
      expect(interactions.every((interaction) => interaction.scoringRule.acceptableAnswers.length > 0)).toBe(true);
      expect(candidate.evidence).toContain(`Structured task type: ${taskType}`);
      expect(validation.blockingIssues).toEqual([]);
      expect(validation.canPublish).toBe(true);
    },
  );

  it('normalizes a three-passage 40-answer paste fixture without dropping later passages', () => {
    const candidate = createReadingV2ImportCandidateFromText({
      text: READING_V2_FULL_TEST_40_PASTE_IMPORT_FIXTURE.rawText,
      answerKeyText: READING_V2_FULL_TEST_40_PASTE_IMPORT_FIXTURE.answerKeyText,
    });
    const result = normalizeReadingV2ImportCandidate(candidate);
    const validation = validateReadingV2Draft(result.document);
    const editorDocument = deserializeReadingV2CanonicalToEditorDocument(result.document);
    const roundTrip = serializeReadingV2EditorDocumentToCanonical(editorDocument);

    expect(candidate.evidence).toEqual(expect.arrayContaining([
      'Detected 3 structured passages',
      'Detected 9 structured question groups',
      'Detected 40 structured questions',
      'Detected 40 teacher answer key rows',
    ]));
    expect(result.document.sectionIds).toHaveLength(3);
    expect(Object.values(result.document.taskGroups).map((taskGroup) => taskGroup.officialTaskType)).toEqual(
      READING_V2_FULL_TEST_40_PASTE_IMPORT_FIXTURE.expectedTaskTypes,
    );
    expect(Object.values(result.document.interactions)).toHaveLength(40);
    expect(Object.values(result.document.stimuli).map((stimulus) => stimulus.content.kind)).toEqual(expect.arrayContaining([
      'table-content',
      'flowchart-content',
      'diagram-content',
    ]));
    expect(Object.values(result.document.interactions).find(
      (interaction) => interaction.reviewLabel.displayNumber === 40,
    )?.scoringRule.acceptableAnswers).toEqual(['A', 'B']);
    expect(validateReadingV2EditorDocument(editorDocument)).toEqual([]);
    expect(roundTrip.sectionIds).toHaveLength(3);
    expect(Object.values(roundTrip.interactions)).toHaveLength(40);
    expect(validation.blockingIssues).toEqual([]);
    expect(validation.canPublish).toBe(true);
  });

  it('keeps malformed paste answer-key fixtures publish-blocked with actionable causes', () => {
    const cases = [
      [READING_V2_MALFORMED_KEY_PASTE_IMPORT_FIXTURES.missing, 'missing a publishable answer key'],
      [READING_V2_MALFORMED_KEY_PASTE_IMPORT_FIXTURES.extra, 'does not match an imported question'],
      [READING_V2_MALFORMED_KEY_PASTE_IMPORT_FIXTURES.duplicate, 'appears more than once'],
      [READING_V2_MALFORMED_KEY_PASTE_IMPORT_FIXTURES.malformed, 'must start with a question number'],
      [READING_V2_MALFORMED_KEY_PASTE_IMPORT_FIXTURES.conflicting, 'appears more than once'],
    ] as const;

    cases.forEach(([fixture, expectedMessage]) => {
      const candidate = createReadingV2ImportCandidateFromText({
        text: fixture.rawText,
        answerKeyText: fixture.answerKeyText,
      });
      const result = normalizeReadingV2ImportCandidate(candidate);
      const validation = validateReadingV2Draft(result.document);

      expect(validation.canPublish).toBe(false);
      expect(validation.blockingIssues.map((issue) => issue.message).join(' ')).toContain(expectedMessage);
    });
  });

  it('keeps invalid structured-layout blank-binding fixtures publish-blocked', () => {
    Object.values(READING_V2_STRUCTURED_LAYOUT_BLANK_BINDING_FIXTURES).forEach((fixture) => {
      const candidate = createReadingV2ImportCandidateFromText({
        text: fixture.rawText,
        answerKeyText: fixture.answerKeyText,
      });
      const result = normalizeReadingV2ImportCandidate(candidate);
      const validation = validateReadingV2Draft(result.document);
      const taskGroups = Object.values(result.document.taskGroups);

      expect(taskGroups.map((taskGroup) => taskGroup.officialTaskType)).toEqual(fixture.expectedTaskTypes);
      expect(Object.values(result.document.interactions)).toHaveLength(fixture.expectedQuestionCount);
      expect(validation.canPublish).toBe(false);
      expect(validation.blockingIssues.map((issue) => issue.message).join(' ')).toContain(fixture.expectedBlockingMessage);
    });
  });

  it('blocks structured table-completion payloads that flatten tables into question text only', () => {
    const structuredPayload = [
      READING_V2_STRUCTURED_MATERIALS_START,
      '```json',
      JSON.stringify({
        sourceFile: 'flattened-table.txt',
        materials: [
          {
            passageNumber: 1,
            title: 'Flattened table',
            passages: [
              {
                title: 'Flattened table passage',
                content: 'This passage has a table-completion task but the table was flattened into prompt text.',
              },
            ],
            sectionInstructions: [
              {
                id: 'p1-q1-1',
                text: 'Complete the table below.',
                questionRange: { start: 1, end: 1 },
              },
            ],
            questions: [
              {
                questionNumber: 1,
                type: 'table-completion',
                sectionInstructionId: 'p1-q1-1',
                questionText: 'Table row: Feature | Detail: _____.',
              },
            ],
          },
        ],
      }),
      '```',
      READING_V2_STRUCTURED_MATERIALS_END,
    ].join('\n');
    const candidate = createReadingV2ImportCandidateFromText({
      text: structuredPayload,
      answerKeyText: '1 answer',
    });
    const result = normalizeReadingV2ImportCandidate(candidate);
    const validation = validateReadingV2Draft(result.document);
    const editorDocument = deserializeReadingV2CanonicalToEditorDocument(result.document);
    const editorIssues = validateReadingV2EditorDocument(editorDocument);

    expect(validation.blockingIssues.map((issue) => issue.message)).toContain(
      'Table Completion needs a table before publishing.',
    );
    expect(editorIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'invalid-structured-shell-reference',
        message: expect.stringContaining('needs a table editor block reference'),
      }),
    ]));
  });

  it('imports diagram-labeling source diagrams with printed number targets as diagram hotspots', () => {
    const structuredPayload = [
      READING_V2_STRUCTURED_MATERIALS_START,
      '```json',
      JSON.stringify({
        sourceFile: 'structured-diagram.txt',
        materials: [
          {
            passageNumber: 1,
            title: 'Diagram labels',
            passages: [
              {
                title: 'Plant diagram',
                content: 'This passage explains the source diagram labels and has enough text for imported teacher review.',
              },
            ],
            sectionInstructions: [
              {
                id: 'p1-q1-2',
                text: 'Label the diagram below. Choose ONE WORD ONLY from the passage for each answer.',
                questionRange: { start: 1, end: 2 },
                diagram: {
                  imageUrl: 'https://example.test/source-diagram.png',
                  imageAlt: 'Printed diagram with labels 1 and 2 already on the source image.',
                  targets: [
                    { label: '1', questionNumber: 1 },
                    { label: '2', questionNumber: 2 },
                  ],
                },
              },
            ],
            questions: [
              {
                questionNumber: 1,
                type: 'diagram-labeling',
                sectionInstructionId: 'p1-q1-2',
                questionText: 'Label 1',
              },
              {
                questionNumber: 2,
                type: 'diagram-labeling',
                sectionInstructionId: 'p1-q1-2',
                questionText: 'Label 2',
              },
            ],
          },
        ],
      }),
      '```',
      READING_V2_STRUCTURED_MATERIALS_END,
    ].join('\n');
    const candidate = createReadingV2ImportCandidateFromText({
      text: structuredPayload,
      answerKeyText: ['1 stem', '2 leaf'].join('\n'),
    });
    const result = normalizeReadingV2ImportCandidate(candidate);
    const taskGroup = Object.values(result.document.taskGroups)[0];
    const diagramStimulus = Object.values(result.document.stimuli).find(
      (stimulus) => stimulus.content.kind === 'diagram-content',
    );
    const interactions = Object.values(result.document.interactions);

    expect(diagramStimulus?.kind).toBe('diagram-shell');
    if (!taskGroup || !diagramStimulus || diagramStimulus.content.kind !== 'diagram-content') {
      throw new Error('Expected imported diagram-labeling task to create a diagram stimulus.');
    }

    const questionOne = interactions.find((interaction) => interaction.reviewLabel.displayNumber === 1);
    const questionTwo = interactions.find((interaction) => interaction.reviewLabel.displayNumber === 2);
    const validation = validateReadingV2Draft(result.document);

    assertValidReadingV2CanonicalDocument(result.document);
    expect(diagramStimulus.content.imageUrl).toBe('https://example.test/source-diagram.png');
    expect(diagramStimulus.content.imageAlt).toContain('labels 1 and 2');
    expect(diagramStimulus.content.hotspots.map((hotspot) => hotspot.label)).toEqual(['1', '2']);
    expect(diagramStimulus.content.hotspots.map((hotspot) => hotspot.xPercent)).toEqual([18, 40]);
    expect(diagramStimulus.content.hotspots.map((hotspot) => hotspot.yPercent)).toEqual([24, 24]);
    expect(taskGroup.stimulusRefs[0]?.stimulusId).toBe(diagramStimulus.stimulusId);
    expect(result.document.sections[taskGroup.sectionId]?.stimulusIds).toContain(diagramStimulus.stimulusId);
    expect(questionOne?.primaryAnchorId).toBe(diagramStimulus.content.hotspots[0]?.anchorId);
    expect(questionTwo?.primaryAnchorId).toBe(diagramStimulus.content.hotspots[1]?.anchorId);
    expect(questionOne?.contextAnchorIds).toEqual([questionOne.primaryAnchorId]);
    expect(questionTwo?.scoringRule.acceptableAnswers).toEqual(['leaf']);
    expect(validation.canPublish).toBe(true);
    expect(validation.blockingIssues).toEqual([]);
  });

  it('hydrates structured imports into the same visible editor blocks manual authoring uses', () => {
    const structuredPayload = [
      READING_V2_STRUCTURED_MATERIALS_START,
      '```json',
      JSON.stringify({
        sourceFile: 'structured-editor-blocks.txt',
        materials: [
          {
            passageNumber: 1,
            title: 'Editor block import',
            passages: [
              {
                title: 'Editor block passage',
                contentBlocks: [
                  { kind: 'heading', level: 2, text: 'Imported source heading' },
                  { kind: 'paragraph', text: 'Imported paragraph text has enough content for the Reading V2 editor.' },
                  { kind: 'list-item', listKind: 'bullet', text: 'First preserved source bullet' },
                  { kind: 'list-item', listKind: 'bullet', text: 'Second preserved source bullet' },
                ],
                notes: [{ kind: 'note', text: 'Imported source note for teacher review.' }],
                media: [
                  {
                    mediaUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><text x="2" y="14">Fig</text></svg>',
                    alt: 'Imported source figure',
                    caption: 'Figure 1. Source plan',
                    source: 'Teacher source packet',
                  },
                ],
              },
            ],
            sectionInstructions: [
              {
                id: 'p1-q1-2',
                text: 'Complete the table below.',
                questionRange: { start: 1, end: 2 },
                table: {
                  rows: [
                    [
                      { text: 'Feature', role: 'header' },
                      { text: 'Detail', role: 'header' },
                    ],
                    [
                      { text: 'Table row one' },
                      { text: 'First table blank _____.', questionNumber: 1 },
                    ],
                    [
                      { text: 'Table row two' },
                      { text: 'Second table blank _____.', questionNumber: 2 },
                    ],
                  ],
                },
              },
              {
                id: 'p1-q3-4',
                text: 'Complete the flowchart below.',
                questionRange: { start: 3, end: 4 },
                flowchart: {
                  steps: [
                    { stepId: 'collect', text: 'Collect source material _____.', questionNumber: 3, nextStepIds: ['review'] },
                    { stepId: 'review', text: 'Review imported result _____.', questionNumber: 4 },
                  ],
                },
              },
              {
                id: 'p1-q5-6',
                text: 'Label the diagram below.',
                questionRange: { start: 5, end: 6 },
                diagram: {
                  imageUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 40"><text x="10" y="20">5</text><text x="50" y="30">6</text></svg>',
                  imageAlt: 'Imported diagram with printed labels 5 and 6',
                  targets: [
                    { label: '5', questionNumber: 5 },
                    { label: '6', questionNumber: 6 },
                  ],
                },
              },
            ],
            questions: [
              { questionNumber: 1, type: 'table-completion', sectionInstructionId: 'p1-q1-2', questionText: 'Table question 1.' },
              { questionNumber: 2, type: 'table-completion', sectionInstructionId: 'p1-q1-2', questionText: 'Table question 2.' },
              { questionNumber: 3, type: 'flowchart-completion', sectionInstructionId: 'p1-q3-4', questionText: 'Flow question 3.' },
              { questionNumber: 4, type: 'flowchart-completion', sectionInstructionId: 'p1-q3-4', questionText: 'Flow question 4.' },
              { questionNumber: 5, type: 'diagram-labeling', sectionInstructionId: 'p1-q5-6', questionText: 'Diagram label 5.' },
              { questionNumber: 6, type: 'diagram-labeling', sectionInstructionId: 'p1-q5-6', questionText: 'Diagram label 6.' },
            ],
          },
        ],
      }),
      '```',
      READING_V2_STRUCTURED_MATERIALS_END,
    ].join('\n');
    const candidate = createReadingV2ImportCandidateFromText({
      text: structuredPayload,
      answerKeyText: ['1 alpha', '2 beta', '3 gamma', '4 delta', '5 stem', '6 leaf'].join('\n'),
    });
    const result = normalizeReadingV2ImportCandidate(candidate);
    const editorDocument = deserializeReadingV2CanonicalToEditorDocument(result.document);
    const editorBlocks = editorDocument.sections.flatMap((section) => section.blocks);
    const imageBlock = editorBlocks.find((block) => block.kind === 'image');
    const tableBlock = editorBlocks.find((block) => block.kind === 'table');
    const flowchartBlock = editorBlocks.find((block) => block.kind === 'flowchart');
    const diagramBlock = editorBlocks.find((block) => block.kind === 'diagram');
    const roundTrip = serializeReadingV2EditorDocumentToCanonical(editorDocument);
    const validation = validateReadingV2Draft(roundTrip);

    expect(editorBlocks.map((block) => block.kind)).toEqual([
      'heading',
      'paragraph',
      'list',
      'paragraph',
      'image',
      'table',
      'flowchart',
      'diagram',
    ]);
    expect(imageBlock).toMatchObject({
      kind: 'image',
      mediaUrl: expect.stringContaining('data:image/svg+xml'),
      caption: 'Figure 1. Source plan',
      source: 'Teacher source packet',
      alt: 'Imported source figure',
    });
    expect(tableBlock && tableBlock.kind === 'table' ? tableBlock.rows.flatMap((row) => row.cells).filter((cell) => cell.isBlank).length : 0).toBe(2);
    expect(flowchartBlock && flowchartBlock.kind === 'flowchart' ? flowchartBlock.steps.map((step) => step.stepId) : []).toEqual(['collect', 'review']);
    expect(diagramBlock && diagramBlock.kind === 'diagram' ? diagramBlock.targets.map((target) => target.label) : []).toEqual(['5', '6']);
    expect(validateReadingV2EditorDocument(editorDocument)).toEqual([]);
    expect(validation.canPublish).toBe(true);
    expect(validation.blockingIssues).toEqual([]);
    expect(Object.values(roundTrip.interactions).find(
      (interaction) => interaction.reviewLabel.displayNumber === 6,
    )?.scoringRule.acceptableAnswers).toEqual(['leaf']);
  });

  it('blocks duplicate teacher key rows instead of letting the last row silently win', () => {
    const candidate = createReadingV2ImportCandidateFromText({
      text: [
        '## Imported Reading passage',
        '',
        'This imported passage has enough text to become an editable Reading V2 passage paragraph with a question.',
        '',
        '#### Questions 1-1',
        'Complete the sentence with ___.',
        '**1** Imported statement with a visible blank ___.',
      ].join('\n'),
      answerKeyText: '1 first answer\n1 second answer',
    });
    const result = normalizeReadingV2ImportCandidate(candidate);
    const interaction = Object.values(result.document.interactions).find(
      (candidateInteraction) => candidateInteraction.reviewLabel.displayNumber === 1,
    );
    const validation = validateReadingV2Draft(result.document);

    expect(interaction?.scoringRule.acceptableAnswers).toEqual([]);
    expect(validation.blockingIssues.map((issue) => issue.message)).toEqual(expect.arrayContaining([
      'Question 1 appears more than once in the teacher answer key.',
    ]));
  });

  it('normalizes detectable plain-text three-passage sources without truncating after Passage 1', () => {
    const candidate = createReadingV2ImportCandidateFromText({
      text: [
        '### READING PASSAGE 1',
        '## First passage',
        '',
        'This first imported passage has enough text to be normalized as passage one.',
        '',
        '#### Questions 1-1',
        'Complete the sentence with ___.',
        '**1** Passage one prompt ___.',
        '',
        '### READING PASSAGE 2',
        '## Second passage',
        '',
        'This second imported passage must not be silently discarded by the plain-text fallback.',
        '',
        '#### Questions 2-2',
        'Complete the sentence with ___.',
        '**2** Passage two prompt ___.',
        '',
        '### READING PASSAGE 3',
        '## Third passage',
        '',
        'This third imported passage must also be preserved as an editable passage.',
        '',
        '#### Questions 3-3',
        'Complete the sentence with ___.',
        '**3** Passage three prompt ___.',
      ].join('\n'),
      answerKeyText: '1 first answer\n2 second answer\n3 third answer',
    });
    const result = normalizeReadingV2ImportCandidate(candidate);
    const validation = validateReadingV2Draft(result.document);

    expect(candidate.publishBlockingPlaceholders).not.toContain('Plain-text multi-passage source must not silently import only Passage 1');
    expect(candidate.evidence).toEqual(expect.arrayContaining([
      'Detected 3 Reading Passage headings',
      'Detected 3 grouped question blocks',
    ]));
    expect(result.document.sectionIds).toHaveLength(3);
    expect(Object.values(result.document.interactions).map((interaction) => interaction.reviewLabel.displayNumber)).toEqual([1, 2, 3]);
    expect(Object.values(result.document.interactions).find(
      (interaction) => interaction.reviewLabel.displayNumber === 2,
    )?.scoringRule.acceptableAnswers).toEqual(['second answer']);
    expect(validation.blockingIssues.map((issue) => issue.message)).not.toContain(
      'Teacher answer key row for question 2 does not match an imported question.',
    );
  });

  it('keeps a missing-passage-heading source as a single editable passage', () => {
    const candidate = createReadingV2ImportCandidateFromText({
      text: [
        '## Only passage',
        '',
        'This passage has no printed Reading Passage heading but has enough text to import as one passage.',
        '',
        '#### Questions 1-1',
        'Complete the sentence with ___.',
        '**1** Single passage prompt ___.',
      ].join('\n'),
      answerKeyText: '1 answer',
    });
    const result = normalizeReadingV2ImportCandidate(candidate);

    expect(candidate.evidence).not.toContain('Detected 1 Reading Passage headings');
    expect(result.document.sectionIds).toHaveLength(1);
    expect(Object.values(result.document.interactions)).toHaveLength(1);
  });

  it('supports mixed markdown and plain Reading Passage headings', () => {
    const candidate = createReadingV2ImportCandidateFromText({
      text: [
        '### READING PASSAGE 1',
        '## First passage',
        '',
        'The first mixed-heading passage has enough text to preserve paragraph boundaries.',
        '',
        '#### Questions 1-1',
        '**1** First prompt ___.',
        '',
        'READING PASSAGE 2',
        '## Second passage',
        '',
        'The second mixed-heading passage has enough text to preserve paragraph boundaries.',
        '',
        '#### Questions 2-2',
        '**2** Second prompt ___.',
      ].join('\n'),
      answerKeyText: '1 first\n2 second',
    });
    const result = normalizeReadingV2ImportCandidate(candidate);

    expect(candidate.evidence).toContain('Detected 2 Reading Passage headings');
    expect(result.document.sectionIds).toHaveLength(2);
    expect(result.document.stimuli[result.document.sections[result.document.sectionIds[1]!]!.stimulusIds[0]!]!.title).toBe('Second passage');
  });

  it('normalizes teacher judgement answer casing before validation', () => {
    const candidate = createReadingV2ImportCandidateFromText({
      text: [
        '## Imported Reading passage',
        '',
        'This imported passage has enough text to become an editable Reading V2 passage paragraph with a judgement question.',
        '',
        '#### Questions 1-1',
        'Do the following statements agree with the information? TRUE, FALSE, NOT GIVEN',
        '**1** Imported statement',
      ].join('\n'),
      answerKeyText: '1 NOT GIVEN',
    });
    const result = normalizeReadingV2ImportCandidate(candidate);
    const interaction = Object.values(result.document.interactions).find(
      (candidateInteraction) => candidateInteraction.reviewLabel.displayNumber === 1,
    );

    expect(interaction?.responseShape).toMatchObject({ kind: 'binary-judgement', vocabulary: 'TFNG' });
    expect(interaction?.scoringRule.acceptableAnswers).toEqual(['Not Given']);
  });

  it('normalizes short teacher judgement aliases before validation', () => {
    const candidate = createReadingV2ImportCandidateFromText({
      text: [
        '## Imported Reading passage',
        '',
        'This imported passage has enough text to become an editable Reading V2 passage paragraph with a judgement question.',
        '',
        '#### Questions 1-1',
        'Do the following statements agree with the information? TRUE, FALSE, NOT GIVEN',
        '**1** Imported statement',
      ].join('\n'),
      answerKeyText: '1 f',
    });
    const result = normalizeReadingV2ImportCandidate(candidate);
    const interaction = Object.values(result.document.interactions).find(
      (candidateInteraction) => candidateInteraction.reviewLabel.displayNumber === 1,
    );

    expect(interaction?.responseShape).toMatchObject({ kind: 'binary-judgement', vocabulary: 'TFNG' });
    expect(interaction?.scoringRule.acceptableAnswers).toEqual(['False']);
    expect(validateReadingV2Draft(result.document).blockingIssues.map((issue) => issue.message).join(' ')).not.toContain(
      'wrong judgement vocabulary',
    );
  });
});
