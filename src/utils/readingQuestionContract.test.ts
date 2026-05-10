import { describe, expect, it } from 'vitest';
import { canonicalizeReadingQuestion, formatReadingOption } from './readingQuestionContract';

describe('canonicalizeReadingQuestion', () => {
  it('strips a duplicated leading question number from question text', () => {
    const result = canonicalizeReadingQuestion({
      number: 27,
      type: 'sentence-completion',
      question: '**27** The burial site was found near the coast.',
    });

    expect(result.questionText).toBe('The burial site was found near the coast.');
    expect(result.question).toBe('The burial site was found near the coast.');
  });

  it('preserves authoritative non-sequential roman labels', () => {
    const result = canonicalizeReadingQuestion({
      number: 14,
      type: 'matching-headings',
      question: 'Choose the correct heading.',
      options: [
        '**ii** The spread of cities',
        '**iv** The dead',
        '**ix** The cities',
      ],
    });

    expect(result.issues).toEqual([]);
    expect(result.optionLabelFormat).toBe('roman');
    expect(result.labeledOptions).toEqual([
      { label: 'ii', text: 'The spread of cities' },
      { label: 'iv', text: 'The dead' },
      { label: 'ix', text: 'The cities' },
    ]);
    expect(result.labeledOptions?.map((option) => formatReadingOption(option))).toEqual([
      'ii. The spread of cities',
      'iv. The dead',
      'ix. The cities',
    ]);
  });

  it('sanitizes structured polluted options to a single label', () => {
    const result = canonicalizeReadingQuestion({
      number: 16,
      type: 'matching-headings',
      question: 'Choose the correct heading.',
      options: [
        { label: 'v', text: 'v. The cases of Holland, France and China' },
      ],
    });

    expect(result.issues).toEqual([]);
    expect(result.labeledOptions).toEqual([
      { label: 'v', text: 'The cases of Holland, France and China' },
    ]);
    expect(result.labeledOptions?.map((option) => formatReadingOption(option))).toEqual([
      'v. The cases of Holland, France and China',
    ]);
  });

  it('preserves structured labels when option text starts with an article', () => {
    const result = canonicalizeReadingQuestion({
      number: 27,
      type: 'multiple-choice',
      options: [
        { label: 'B', text: 'A basic assumption about wisdom may be wrong.' },
      ],
    });

    expect(result.issues).toEqual([]);
    expect(result.optionLabelFormat).toBe('letter');
    expect(result.options).toEqual(['A basic assumption about wisdom may be wrong.']);
    expect(result.labeledOptions).toEqual([
      { label: 'B', text: 'A basic assumption about wisdom may be wrong.' },
    ]);
  });

  it('flags explicitly conflicting embedded labels in structured options', () => {
    const result = canonicalizeReadingQuestion({
      number: 27,
      type: 'multiple-choice',
      options: [
        { label: 'B', text: 'A. basic assumption about wisdom may be wrong.' },
      ],
    });

    expect(result.issues.map((issue) => issue.code)).toContain('conflicting-option-label-text');
    expect(result.labeledOptions).toEqual([
      { label: 'B', text: 'A. basic assumption about wisdom may be wrong.' },
    ]);
  });

  it('creates canonical labeled options from prefixed letter options', () => {
    const result = canonicalizeReadingQuestion({
      number: 5,
      type: 'summary-completion-list',
      question: 'Complete the summary.',
      options: ['A proof', 'B plantation'],
    });

    expect(result.issues).toEqual([]);
    expect(result.optionLabelFormat).toBe('letter');
    expect(result.options).toEqual(['proof', 'plantation']);
    expect(result.labeledOptions).toEqual([
      { label: 'A', text: 'proof' },
      { label: 'B', text: 'plantation' },
    ]);
  });

  it('flags mixed labeled and unlabeled option groups', () => {
    const result = canonicalizeReadingQuestion({
      number: 9,
      type: 'matching-features',
      question: 'Match each statement.',
      options: ['A Freeman', 'Shore and Kanevsky', 'C Other'],
    });

    expect(result.issues.map((issue) => issue.code)).toContain('mixed-option-labels');
  });

  it('canonicalizes matching-information bare labels into section references', () => {
    const result = canonicalizeReadingQuestion({
      number: 14,
      type: 'matching-information',
      question: 'Which section contains the following information?',
      sectionReferences: ['A', 'B', 'C'],
    });

    expect(result.issues).toEqual([]);
    expect(result.options).toEqual(['A', 'B', 'C']);
    expect(result.sectionReferences?.map((section) => section.label)).toEqual(['A', 'B', 'C']);
  });

  it('omits empty optional matching-information section fields', () => {
    const result = canonicalizeReadingQuestion({
      number: 14,
      type: 'matching-information',
      question: 'Which section contains the following information?',
      sectionReferences: [
        { label: 'A', title: '  ', paragraph: '' },
        { label: 'B' },
      ],
    });

    expect(result.issues).toEqual([]);
    expect(result.sectionReferences).toEqual([
      { label: 'A' },
      { label: 'B' },
    ]);
  });

  it('rejects empty matching-information section references', () => {
    const result = canonicalizeReadingQuestion({
      number: 14,
      type: 'matching-information',
      question: 'Which section contains the following information?',
      options: [],
      sectionReferences: [],
    });

    expect(result.issues.map((issue) => issue.code)).toContain('missing-section-references');
  });

  it('bypasses legacy option canonicalization for canonical table member questions', () => {
    const result = canonicalizeReadingQuestion({
      number: 10,
      type: 'table-completion',
      question: 'Native region: ___',
      options: ['TABLE_HEADERS: ignored'],
      groupTaskType: 'table-completion',
      groupId: 'group-1',
      blankId: 'blank-1',
      anchorId: 'anchor-1',
      sectionInstructionId: 'group-1',
      tableGroupSchemaVersion: 1,
    });

    expect(result.issues).toEqual([]);
    expect(result.options).toEqual(['TABLE_HEADERS: ignored']);
    expect(result.questionText).toBe('Native region: ___');
  });

  it('rejects unsupported canonical table schema versions', () => {
    const result = canonicalizeReadingQuestion({
      number: 10,
      type: 'table-completion',
      question: 'Native region: ___',
      groupTaskType: 'table-completion',
      groupId: 'group-1',
      blankId: 'blank-1',
      anchorId: 'anchor-1',
      sectionInstructionId: 'group-1',
      tableGroupSchemaVersion: 2,
    });

    expect(result.issues.map((issue) => issue.code)).toContain('unsupported-table-completion-schema');
  });
});
