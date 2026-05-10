import { describe, expect, it } from 'vitest';

import { canonicalizeTableCompletionGroup } from './tableCompletionCanonicalizer';

describe('tableCompletionCanonicalizer', () => {
  it('prefers deterministic markdown structure over AI candidates and legacy header hints', () => {
    const result = canonicalizeTableCompletionGroup({
      groupId: 'group-1',
      passageId: 'passage-1',
      sourceWorkflow: 'in-app-parse',
      rawExcerpt:
        '| Plant | Region |\n| --- | --- |\n| Gingko Biloba | [[18]] |\n| Echinacea | [[19]] |',
      structuredCandidate: {
        columns: ['Wrong', 'Candidate'],
        rows: [['unused', 'unused']],
      },
      questions: [
        {
          questionNumber: 18,
          questionText: 'Original question text 18',
          answer: 'China',
          sectionInstruction:
            'TABLE_HEADERS: Legacy Plant | Legacy Region. Complete the table below. Choose NO MORE THAN TWO WORDS.',
        },
        {
          questionNumber: 19,
          questionText: 'Original question text 19',
          answer: 'North America',
          sectionInstruction:
            'TABLE_HEADERS: Legacy Plant | Legacy Region. Complete the table below. Choose NO MORE THAN TWO WORDS.',
        },
      ],
    });

    expect(result.metadata.parseMode).toBe('deterministic');
    expect(result.metadata.sourceShape).toBe('markdown-table');
    expect(result.metadata.usedLegacySectionHeaders).toBe(false);
    expect(result.group?.columns.map((column) => column.columnId)).toEqual([
      'group-1-column-plant-1',
      'group-1-column-region-2',
    ]);
    expect(result.group?.rows).toHaveLength(3);
    expect(
      result.group?.cells
        .filter((cell) => cell.rowId === 'group-1-row-header-1')
        .map((cell) => ({
          role: cell.role,
          text: cell.segments[0] && cell.segments[0].kind === 'text' ? cell.segments[0].text : '',
        })),
    ).toEqual([
      { role: 'column-header', text: 'Plant' },
      { role: 'column-header', text: 'Region' },
    ]);
    expect(result.group?.blanks[0]?.breadcrumb).toEqual({
      rowHeaders: ['Gingko Biloba'],
      columnHeaders: ['Region'],
    });
    expect(result.group?.blanks.map((blank) => blank.sourceQuestionText)).toEqual([
      'Original question text 18',
      'Original question text 19',
    ]);
  });

  it('uses AI structured candidates before legacy transport when raw structure is unresolved', () => {
    const result = canonicalizeTableCompletionGroup({
      groupId: 'group-2',
      passageId: 'passage-1',
      sourceWorkflow: 'in-app-parse',
      rawExcerpt: 'This text is not directly parseable as a table.',
      structuredCandidate: {
        columns: ['Plant', 'Region'],
        rows: [['Gingko Biloba', '[[18]]'], ['Echinacea', '[[19]]']],
        instructionText: 'Complete the table below.',
        answerRuleText: 'Choose NO MORE THAN TWO WORDS.',
      },
      questions: [
        {
          questionNumber: 18,
          questionText: 'unused',
          answer: 'China',
          sectionInstruction:
            'TABLE_HEADERS: Legacy Plant | Legacy Region. Complete the table below. Choose NO MORE THAN TWO WORDS.',
        },
        {
          questionNumber: 19,
          questionText: 'unused',
          answer: 'North America',
          sectionInstruction:
            'TABLE_HEADERS: Legacy Plant | Legacy Region. Complete the table below. Choose NO MORE THAN TWO WORDS.',
        },
      ],
    });

    expect(result.group).not.toBeNull();
    expect(result.metadata.parseMode).toBe('ai-assisted');
    expect(result.metadata.sourceShape).toBe('ai-structured');
    expect(result.metadata.usedLegacySectionHeaders).toBe(false);
  });

  it('builds a canonical group from legacy section transport', () => {
    const result = canonicalizeTableCompletionGroup({
      groupId: 'group-3',
      passageId: 'passage-1',
      sourceWorkflow: 'in-app-parse',
      questions: [
        {
          questionNumber: 18,
          questionText: 'Gingko Biloba | ___ | Improves cognitive function',
          answer: 'China',
          sectionInstruction:
            'TABLE_HEADERS: Plant Species | Native Region | Medicinal Use. Complete the table below. Choose NO MORE THAN TWO WORDS.',
        },
        {
          questionNumber: 19,
          questionText: 'Echinacea | ___ | Supports immunity',
          answer: 'North America',
          sectionInstruction:
            'TABLE_HEADERS: Plant Species | Native Region | Medicinal Use. Complete the table below. Choose NO MORE THAN TWO WORDS.',
        },
      ],
    });

    expect(result.group).not.toBeNull();
    expect(result.metadata.parseMode).toBe('deterministic');
    expect(result.metadata.sourceShape).toBe('legacy-table-headers-transport');
    expect(result.metadata.usedLegacySectionHeaders).toBe(true);
    expect(result.group?.questionRange).toEqual({ start: 18, end: 19 });
    expect(result.group?.sharedContent.instructionText).toContain('Complete the table below');
    expect(result.group?.sharedContent.answerRuleText).toContain('NO MORE THAN TWO WORDS');
    expect(result.group?.blanks).toHaveLength(2);
  });

  it('builds a canonical group from legacy option header transport when section headers are absent', () => {
    const result = canonicalizeTableCompletionGroup({
      groupId: 'group-4',
      passageId: 'passage-1',
      sourceWorkflow: 'in-app-parse',
      questions: [
        {
          questionNumber: 18,
          questionText: 'Gingko Biloba | ___ | Improves cognitive function',
          answer: 'China',
          sectionInstruction: 'Complete the table below. Choose NO MORE THAN TWO WORDS.',
          options: ['Plant Species', 'Native Region', 'Medicinal Use'],
        },
        {
          questionNumber: 19,
          questionText: 'Echinacea | ___ | Supports immunity',
          answer: 'North America',
          sectionInstruction: 'Complete the table below. Choose NO MORE THAN TWO WORDS.',
          options: ['Plant Species', 'Native Region', 'Medicinal Use'],
        },
      ],
    });

    expect(result.group).not.toBeNull();
    expect(result.metadata.parseMode).toBe('deterministic');
    expect(result.metadata.sourceShape).toBe('legacy-table-headers-transport');
    expect(result.metadata.usedLegacyOptionsHeaders).toBe(true);
    expect(result.metadata.usedLegacySectionHeaders).toBe(false);
  });

  it('supports html tables with explicit spans without inferring spans', () => {
    const result = canonicalizeTableCompletionGroup({
      groupId: 'group-5',
      passageId: 'passage-1',
      sourceWorkflow: 'in-app-parse',
      rawExcerpt:
        '<table><tr><th>Plant</th><th>Region</th></tr><tr><td>Gingko Biloba</td><td rowspan="2">[[18]]</td></tr><tr><td>Echinacea</td></tr></table>',
      questions: [{ questionNumber: 18, questionText: 'unused', answer: 'China' }],
    });

    expect(result.group).not.toBeNull();
    expect(result.metadata.sourceShape).toBe('html-table');
    expect(result.metadata.inferredSpans).toBe(false);
    expect(result.group?.rows[0]?.rowId).toBe('group-5-row-header-1');
    expect(result.group?.cells.find((cell) => cell.rowSpan === 2)?.rowSpan).toBe(2);
  });

  it('supports TSV source shapes', () => {
    const result = canonicalizeTableCompletionGroup({
      groupId: 'group-6',
      passageId: 'passage-1',
      sourceWorkflow: 'in-app-parse',
      rawExcerpt: 'Plant\tRegion\nGingko Biloba\t[[18]]\nEchinacea\t[[19]]',
      questions: [
        { questionNumber: 18, questionText: 'unused', answer: 'China' },
        { questionNumber: 19, questionText: 'unused', answer: 'North America' },
      ],
    });

    expect(result.group).not.toBeNull();
    expect(result.metadata.sourceShape).toBe('tsv');
  });

  it('supports aligned-text source shapes', () => {
    const result = canonicalizeTableCompletionGroup({
      groupId: 'group-7',
      passageId: 'passage-1',
      sourceWorkflow: 'in-app-parse',
      rawExcerpt:
        'Plant Species  Native Region\nGingko Biloba  [[18]]\nEchinacea  [[19]]',
      questions: [
        { questionNumber: 18, questionText: 'unused', answer: 'China' },
        { questionNumber: 19, questionText: 'unused', answer: 'North America' },
      ],
    });

    expect(result.group).not.toBeNull();
    expect(result.metadata.sourceShape).toBe('aligned-text');
  });

  it('maps multiple blanks from a single cell in canonical reading order', () => {
    const result = canonicalizeTableCompletionGroup({
      groupId: 'group-8',
      passageId: 'passage-1',
      sourceWorkflow: 'in-app-parse',
      rawExcerpt:
        '| Plant | Details |\n| --- | --- |\n| Gingko Biloba | ___ and ___ |',
      questions: [
        { questionNumber: 18, questionText: 'unused', answer: 'China' },
        { questionNumber: 19, questionText: 'unused', answer: 'Japan' },
      ],
    });

    expect(result.group?.blanks.map((blank) => blank.questionNumber)).toEqual([18, 19]);
    expect(result.group?.canonicalReadingOrder).toEqual([
      'group-8-blank-18',
      'group-8-blank-19',
    ]);
  });

  it('persists canonicalReadingOrder and visualOrderConflict when visible order diverges', () => {
    const result = canonicalizeTableCompletionGroup({
      groupId: 'group-9',
      passageId: 'passage-1',
      sourceWorkflow: 'in-app-parse',
      rawExcerpt:
        '| Plant | Region |\n| --- | --- |\n| Gingko Biloba | [[19]] |\n| Echinacea | [[18]] |',
      questions: [
        { questionNumber: 18, questionText: 'unused', answer: 'China' },
        { questionNumber: 19, questionText: 'unused', answer: 'North America' },
      ],
    });

    expect(result.group?.canonicalReadingOrder).toEqual([
      'group-9-blank-19',
      'group-9-blank-18',
    ]);
    expect(result.group?.visualOrderConflict).toBe(true);
  });

  it('does not infer spans from weak uneven aligned text and leaves the parse unresolved', () => {
    const result = canonicalizeTableCompletionGroup({
      groupId: 'group-10',
      passageId: 'passage-1',
      sourceWorkflow: 'in-app-parse',
      rawExcerpt:
        'Plant Species  Native Region  Medicinal Use\nGingko Biloba  [[18]]\nEchinacea  [[19]]  Supports immunity',
      questions: [
        { questionNumber: 18, questionText: 'unused', answer: 'China' },
        { questionNumber: 19, questionText: 'unused', answer: 'North America' },
      ],
    });

    expect(result.group).toBeNull();
    expect(result.metadata.parseMode).toBe('unresolved');
    expect(result.metadata.inferredSpans).toBe(false);
  });

  it('returns unresolved when no valid blank mapping can be produced', () => {
    const result = canonicalizeTableCompletionGroup({
      groupId: 'group-11',
      passageId: 'passage-1',
      sourceWorkflow: 'in-app-parse',
      rawExcerpt: '| Plant | Region |\n| Gingko Biloba | China |',
      questions: [{ questionNumber: 18, questionText: 'No blank here', answer: 'China' }],
    });

    expect(result.group).toBeNull();
    expect(result.metadata.parseMode).toBe('unresolved');
  });

  it('preserves caption-like heading lines above markdown tables and dotted blanks', () => {
    const result = canonicalizeTableCompletionGroup({
      groupId: 'group-12',
      passageId: 'passage-1',
      sourceWorkflow: 'script-material',
      rawExcerpt: [
        'Medicinal plant timeline',
        '| Plant | Region |',
        '| --- | --- |',
        '| Ginkgo Biloba | 18 ............ |',
        '| Echinacea | 19 ............ |',
      ].join('\n'),
      questions: [
        { questionNumber: 18, questionText: 'unused', answer: 'China' },
        { questionNumber: 19, questionText: 'unused', answer: 'North America' },
      ],
    });

    expect(result.metadata.sourceOutcome).toBe('deterministic-table');
    expect(result.metadata.sourceShape).toBe('markdown-table');
    expect(result.group?.sharedContent.caption).toBe('Medicinal plant timeline');
    expect(result.group?.blanks.map((blank) => blank.questionNumber)).toEqual([18, 19]);
    expect(result.group?.blanks[0]?.breadcrumb).toEqual({
      rowHeaders: ['Ginkgo Biloba'],
      columnHeaders: ['Region'],
    });
  });

  it('preserves html title rows, td header bands, captions, and numbered dot blanks', () => {
    const result = canonicalizeTableCompletionGroup({
      groupId: 'group-13',
      passageId: 'passage-1',
      sourceWorkflow: 'script-material',
      rawExcerpt: [
        '<table>',
        '<caption>Medicinal plants</caption>',
        '<tr><td colspan="2">Plant schedule</td></tr>',
        '<tr><td>Plant</td><td>Region</td></tr>',
        '<tr><td>Ginkgo Biloba</td><td>18 ............</td></tr>',
        '</table>',
      ].join(''),
      questions: [{ questionNumber: 18, questionText: 'unused', answer: 'China' }],
    });

    expect(result.metadata.sourceOutcome).toBe('deterministic-table');
    expect(result.metadata.sourceShape).toBe('html-table');
    expect(result.group?.sharedContent.caption).toBe('Medicinal plants');
    expect(
      result.group?.cells.find((cell) => cell.role === 'title')?.segments[0],
    ).toEqual({ kind: 'text', text: 'Plant schedule' });
    expect(
      result.group?.cells
        .filter((cell) => cell.role === 'column-header')
        .map((cell) => (cell.segments[0] && cell.segments[0].kind === 'text' ? cell.segments[0].text : '')),
    ).toEqual(['Plant', 'Region']);
    expect(result.group?.blanks[0]?.questionNumber).toBe(18);
  });

  it('derives row breadcrumbs from peer cells when blanks occupy the first column', () => {
    const result = canonicalizeTableCompletionGroup({
      groupId: 'group-13a',
      passageId: 'passage-1',
      sourceWorkflow: 'script-material',
      rawExcerpt: [
        '<table><tbody>',
        '<tr><td colspan="2"><h4>Traditional uses of the huarango tree</h4></td></tr>',
        '<tr><td><p>Part of tree</p></td><td><p>Traditional use</p></td></tr>',
        '<tr><td><p><strong>6</strong> ............</p></td><td><p>Fuel</p></td></tr>',
        '<tr><td><p><strong>7</strong> ............ and ............</p></td><td><p>Medicine</p></td></tr>',
        '<tr><td><p><strong>8</strong> ............</p></td><td><p>construction</p></td></tr>',
        '</tbody></table>',
      ].join(''),
      questions: [
        { questionNumber: 6, questionText: 'Part of tree: Fuel', answer: 'branches' },
        { questionNumber: 7, questionText: 'Part of tree: Medicine', answer: 'leaves and bark' },
        { questionNumber: 8, questionText: 'Part of tree: construction', answer: 'trunk' },
      ],
    });

    expect(result.group?.blanks.map((blank) => blank.breadcrumb)).toEqual([
      {
        rowHeaders: ['Fuel'],
        columnHeaders: ['Part of tree'],
      },
      {
        rowHeaders: ['Medicine'],
        columnHeaders: ['Part of tree'],
      },
      {
        rowHeaders: ['construction'],
        columnHeaders: ['Part of tree'],
      },
    ]);
  });

  it('ranks richer deterministic raw surfaces over weaker ones across available inputs', () => {
    const richerRawExcerpt = [
      '<table>',
      '<caption>Medicinal plants</caption>',
      '<tr><td colspan="2">Plant schedule</td></tr>',
      '<tr><td>Plant</td><td>Region</td></tr>',
      '<tr><td>Ginkgo Biloba</td><td>[[18]]</td></tr>',
      '</table>',
    ].join('');
    const result = canonicalizeTableCompletionGroup({
      groupId: 'group-14',
      passageId: 'passage-1',
      sourceWorkflow: 'script-material',
      rawExcerpt: 'Plant  Region\nGinkgo Biloba  [[18]]',
      structuredCandidate: {
        rawExcerpt: richerRawExcerpt,
      },
      questions: [{ questionNumber: 18, questionText: 'unused', answer: 'China' }],
    });

    expect(result.metadata.sourceOutcome).toBe('deterministic-table');
    expect(result.metadata.sourceShape).toBe('html-table');
    expect(result.rawExcerpt).toBe(richerRawExcerpt);
    expect(result.group?.sharedContent.caption).toBe('Medicinal plants');
  });

  it('classifies AI structure recovery as degraded when deterministic evidence exists but fails', () => {
    const result = canonicalizeTableCompletionGroup({
      groupId: 'group-15',
      passageId: 'passage-1',
      sourceWorkflow: 'in-app-parse',
      rawExcerpt:
        '| Plant | Region |\n| --- | --- |\n| Ginkgo Biloba | China |',
      structuredCandidate: {
        columns: ['Plant', 'Region'],
        rows: [['Ginkgo Biloba', '[[18]]']],
        instructionText: 'Complete the table below.',
        answerRuleText: 'Choose NO MORE THAN TWO WORDS.',
      },
      questions: [{ questionNumber: 18, questionText: 'unused', answer: 'China' }],
    });

    expect(result.group).not.toBeNull();
    expect(result.metadata.sourceOutcome).toBe('degraded-table-source');
    expect(result.metadata.fallbackKind).toBe('ai-structured');
    expect(result.metadata.lossFlags).toEqual(
      expect.arrayContaining(['deterministic-source-ignored']),
    );
  });
});
