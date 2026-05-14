import { describe, expect, it } from 'vitest';
import {
  createReadingV2ImportCandidateFromText,
  normalizeReadingV2ImportCandidate,
} from './readingV2ImportNormalization.service';
import {
  READING_V2_STRUCTURED_MATERIALS_END,
  READING_V2_STRUCTURED_MATERIALS_START,
} from './readingV2ExternalAiPrompt.service';
import {
  buildReadingV2TeacherImportDiagnostics,
  buildReadingV2StudioParsingDiagnostics,
  formatReadingV2StudioParsingDiagnostics,
} from './readingV2StudioParsingDiagnostics.service';
import { validateReadingV2Draft } from './readingV2Validation.service';

describe('readingV2StudioParsingDiagnostics.service', () => {
  it('exports source, answer key, passage, group, question, task-type, and validation diagnostics', () => {
    const candidate = createReadingV2ImportCandidateFromText({
      text: [
        '## Imported Reading passage',
        '',
        'This imported passage has enough text to become an editable Reading V2 passage paragraph.',
        '',
        '#### Questions 1-2',
        'Do the following statements agree with the information? TRUE, FALSE, NOT GIVEN',
        '**1** Imported statement one',
        '**2** Imported statement two',
      ].join('\n'),
      answerKeyText: ['1 TRUE', '2 NG'].join('\n'),
      fileName: 'diagnostic-source.md',
    });
    const normalized = normalizeReadingV2ImportCandidate(candidate);
    const diagnostics = buildReadingV2StudioParsingDiagnostics({
      document: normalized.document,
      metadata: {
        title: 'Diagnostic Fixture',
        materialKind: 'full-test',
        durationMinutes: 60,
        difficulty: 'intermediate',
        targetBand: 'Band 6-7',
        visibility: 'private',
        ownerId: 'teacher-1',
      },
      importCandidate: candidate,
      validationResult: validateReadingV2Draft(normalized.document),
      mode: 'create-from-import',
      activeStep: 'Passages',
      draftId: 'draft-1',
      revisionToken: 'rev-1',
      generatedAt: '2026-05-06T00:00:00.000Z',
    });
    const formatted = formatReadingV2StudioParsingDiagnostics(diagnostics);

    expect(formatted).toContain('READING V2 STUDIO PARSING DIAGNOSTICS');
    expect(formatted).toContain('diagnostic-source.md');
    expect(formatted).toContain('"answerKey"');
    expect(formatted).toContain('"rawText": "1 TRUE\\n2 NG"');
    expect(formatted).toContain('"officialTaskType": "true-false-not-given"');
    expect(formatted).toContain('"parsedQuestionCount": 2');
    expect(formatted).toContain('"acceptableAnswers"');
    expect(formatted).toContain('"Not Given"');
  });

  it('treats structured JSON source and passage answer-key headings as diagnostic context, not parse failure', () => {
    const structuredPayload = [
      READING_V2_STRUCTURED_MATERIALS_START,
      '```json',
      JSON.stringify({
        sourceFile: 'structured-diagnostics.txt',
        materials: [
          {
            passageNumber: 1,
            title: 'Structured passage',
            passages: [
              {
                title: 'Structured passage',
                content: 'A structured source passage with enough content for diagnostics.',
              },
            ],
            sectionInstructions: [
              {
                id: 'p1-q1-2',
                text: 'Do the statements agree with the passage?',
                questionRange: { start: 1, end: 2 },
              },
            ],
            questions: [
              {
                questionNumber: 1,
                type: 'true-false-not-given',
                sectionInstructionId: 'p1-q1-2',
                questionText: 'The passage is structured.',
              },
              {
                questionNumber: 2,
                type: 'true-false-not-given',
                sectionInstructionId: 'p1-q1-2',
                questionText: 'The passage has no questions.',
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
      answerKeyText: ['##### Passage 1', '1 TRUE', '2 FALSE'].join('\n'),
      fileName: 'structured-diagnostics.txt',
    });
    const normalized = normalizeReadingV2ImportCandidate(candidate);
    const diagnostics = buildReadingV2StudioParsingDiagnostics({
      document: normalized.document,
      metadata: { title: 'Structured Diagnostic Fixture' },
      importCandidate: candidate,
      validationResult: validateReadingV2Draft(normalized.document),
      mode: 'create-from-import',
      activeStep: 'Passages',
      draftId: 'draft-structured',
      revisionToken: 'rev-structured',
      generatedAt: '2026-05-06T00:00:00.000Z',
    });

    expect(diagnostics.sourceInput.sourceFormat).toBe('structured-json');
    expect(diagnostics.sourceInput.answerKey.unparsedLines).toEqual([]);
    expect(diagnostics.parseState.inputQualityFlags).toContain('structured_json_payload_detected');
    expect(diagnostics.parseState.inputQualityFlags).not.toContain('question_range_headings_missing');
    expect(diagnostics.parseState.inputQualityFlags).not.toContain('numbered_question_lines_below_parsed_questions');
  });

  it('builds teacher-facing grouped diagnostics with authority and jump targets', () => {
    const structuredPayload = [
      READING_V2_STRUCTURED_MATERIALS_START,
      '```json',
      JSON.stringify({
        materials: [
          {
            passageNumber: 1,
            title: 'Teacher diagnostics passage',
            passages: [
              {
                title: 'Teacher diagnostics passage',
                content: 'This structured source passage has enough content for teacher diagnostics.',
              },
            ],
            sectionInstructions: [
              {
                id: 'p1-q1-2',
                text: 'Complete the sentences below.',
                questionRange: { start: 1, end: 2 },
              },
            ],
            questions: [
              {
                questionNumber: 1,
                type: 'sentence-completion',
                sectionInstructionId: 'p1-q1-2',
                questionText: 'Imported sentence one ___.',
              },
              {
                questionNumber: 2,
                type: 'sentence-completion',
                sectionInstructionId: 'p1-q1-2',
                questionText: 'Imported sentence two ___.',
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
      answerKeyText: ['1 answer', 'bad key line'].join('\n'),
      fileName: 'teacher-diagnostics.md',
    });
    const normalized = normalizeReadingV2ImportCandidate(candidate);
    const diagnostics = buildReadingV2TeacherImportDiagnostics({
      document: normalized.document,
      metadata: { title: 'Teacher Diagnostics' },
      importCandidate: candidate,
      validationResult: validateReadingV2Draft(normalized.document),
      mode: 'create-from-import',
      activeStep: 'Passages',
      draftId: 'draft-teacher',
      revisionToken: 'rev-teacher',
    });

    expect(diagnostics.authority).toMatchObject({
      status: 'malformed',
      boundQuestionCount: 1,
      totalQuestionCount: 2,
      blocking: true,
    });
    expect(diagnostics.groups.find((group) => group.id === 'answer-key')?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('line 2'),
          target: expect.objectContaining({ kind: 'answer-key-line', sourceLine: 2 }),
        }),
      ]),
    );
    expect(diagnostics.groups.find((group) => group.id === 'question-binding')?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Question 2 has no bound teacher-key answer.',
          target: expect.objectContaining({ kind: 'interaction', questionNumber: 2, step: 'Questions' }),
        }),
      ]),
    );
    expect(diagnostics.groups.find((group) => group.id === 'projection-safety')?.severity).toBe('success');
  });

  it('turns redacted Auto diagnostics into teacher repair groups', () => {
    const candidate = createReadingV2ImportCandidateFromText({
      text: [
        '## Imported Reading passage',
        '',
        'This imported passage has enough text to become an editable Reading V2 passage paragraph.',
        '',
        '#### Questions 1-1',
        'Complete the sentence below.',
        '**1** Imported sentence ___.',
      ].join('\n'),
      answerKeyText: '1 answer',
      fileName: 'auto-diagnostics.md',
      sourceKind: 'auto-gemini',
    });
    const candidateWithAutoDiagnostics = {
      ...candidate,
      autoImportDiagnostics: [
        {
          code: 'source-repair-succeeded',
          severity: 'info' as const,
          message: 'Source ledger repair retry resolved the missing source coverage.',
          passageNumber: 1,
        },
        {
          code: 'source-instruction-word-limit-mismatch',
          severity: 'warning' as const,
          message: 'Source instruction requires a two-word limit; review the generated task type.',
          questionNumber: 1,
        },
        {
          code: 'source-reference-bank-missing',
          severity: 'error' as const,
          message: 'Source option bank was not preserved.',
          questionNumber: 1,
        },
      ],
    };
    const normalized = normalizeReadingV2ImportCandidate(candidateWithAutoDiagnostics);
    const diagnostics = buildReadingV2TeacherImportDiagnostics({
      document: normalized.document,
      metadata: { title: 'Auto Diagnostics' },
      importCandidate: candidateWithAutoDiagnostics,
      validationResult: validateReadingV2Draft(normalized.document),
      mode: 'create-from-import',
      activeStep: 'Passages',
      draftId: 'draft-auto-diagnostics',
      revisionToken: 'rev-auto-diagnostics',
    });

    expect(diagnostics.groups.find((group) => group.id === 'source-structure')?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        message: 'Source ledger repair retry resolved the missing source coverage.',
        target: expect.objectContaining({ kind: 'section', step: 'Passages' }),
      }),
    ]));
    expect(diagnostics.groups.find((group) => group.id === 'task-type')?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        detail: 'source-instruction-word-limit-mismatch',
        target: expect.objectContaining({ kind: 'interaction', questionNumber: 1 }),
      }),
    ]));
    expect(diagnostics.groups.find((group) => group.id === 'option-bank')?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        message: 'Source option bank was not preserved.',
        severity: 'error',
      }),
    ]));
  });

  it('groups missing editor-display structures as structured-layout repair diagnostics', () => {
    const structuredPayload = [
      READING_V2_STRUCTURED_MATERIALS_START,
      '```json',
      JSON.stringify({
        materials: [
          {
            passageNumber: 1,
            title: 'Flattened structured table',
            passages: [
              {
                title: 'Flattened structured table',
                content: 'This structured source flattened a table into question text and needs repair.',
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
                questionText: 'Feature | Detail _____.',
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
      fileName: 'flattened-table.md',
    });
    const normalized = normalizeReadingV2ImportCandidate(candidate);
    const diagnostics = buildReadingV2TeacherImportDiagnostics({
      document: normalized.document,
      metadata: { title: 'Flattened Table' },
      importCandidate: candidate,
      validationResult: validateReadingV2Draft(normalized.document),
      mode: 'create-from-import',
      activeStep: 'Passages',
      draftId: 'draft-flattened',
      revisionToken: 'rev-flattened',
    });
    const structuredLayout = diagnostics.groups.find((group) => group.id === 'structured-layout');

    expect(structuredLayout?.severity).toBe('error');
    expect(structuredLayout?.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        message: 'Table Completion needs a table before publishing.',
        target: expect.objectContaining({ kind: 'task-group', step: 'Questions' }),
      }),
    ]));
  });
});
