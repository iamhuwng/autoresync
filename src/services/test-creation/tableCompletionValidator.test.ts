import { describe, expect, it } from 'vitest';

import { canonicalizeTableCompletionGroup } from './tableCompletionCanonicalizer';
import { validateTableCompletionCanonicalization } from './tableCompletionValidator';

const buildLegacyResult = () =>
  canonicalizeTableCompletionGroup({
    groupId: 'group-1',
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

describe('tableCompletionValidator', () => {
  it('emits acknowledgement-required cosmetic recovery issues for legacy transport', () => {
    const result = buildLegacyResult();
    const issues = validateTableCompletionCanonicalization(result);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'cosmetic-format-recovery',
          severity: 'informational',
        }),
      ]),
    );
  });

  it('emits missing-table-source as blocking when no group is produced', () => {
    const unresolved = canonicalizeTableCompletionGroup({
      groupId: 'group-2',
      passageId: 'passage-1',
      sourceWorkflow: 'in-app-parse',
      rawExcerpt: 'not a table',
      questions: [{ questionNumber: 18, questionText: 'No blank here', answer: 'China' }],
    });

    const issues = validateTableCompletionCanonicalization(unresolved);

    expect(issues).toEqual([
      expect.objectContaining({
        code: 'missing-table-source',
        severity: 'blocking',
      }),
    ]);
  });

  it('detects source-order-conflict when canonical reading order diverges from question order', () => {
    const result = canonicalizeTableCompletionGroup({
      groupId: 'group-3',
      passageId: 'passage-1',
      sourceWorkflow: 'in-app-parse',
      rawExcerpt:
        '| Plant | Region |\n| --- | --- |\n| Gingko Biloba | [[19]] |\n| Echinacea | [[18]] |',
      questions: [
        { questionNumber: 18, questionText: 'unused', answer: 'China' },
        { questionNumber: 19, questionText: 'unused', answer: 'North America' },
      ],
    });

    const issues = validateTableCompletionCanonicalization(result);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'source-order-conflict',
          severity: 'acknowledgement-required',
        }),
      ]),
    );
  });

  it('emits blocking blank-count-mismatch when expected questions exceed mapped blanks', () => {
    const result = canonicalizeTableCompletionGroup({
      groupId: 'group-4',
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
          questionText: 'Echinacea | North America | Supports immunity',
          answer: 'North America',
          sectionInstruction:
            'TABLE_HEADERS: Plant Species | Native Region | Medicinal Use. Complete the table below. Choose NO MORE THAN TWO WORDS.',
        },
      ],
    });

    const issues = validateTableCompletionCanonicalization(result);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'blank-count-mismatch',
          severity: 'blocking',
        }),
      ]),
    );
  });

  it('emits invalid-overlap-span when explicit html spans overlap later cells', () => {
    const result = canonicalizeTableCompletionGroup({
      groupId: 'group-5',
      passageId: 'passage-1',
      sourceWorkflow: 'in-app-parse',
      rawExcerpt:
        '<table><tr><th>Plant</th><th>Region</th></tr><tr><td>Gingko Biloba</td><td rowspan="2">[[18]]</td></tr><tr><td>Echinacea</td><td>[[19]]</td></tr></table>',
      questions: [
        { questionNumber: 18, questionText: 'unused', answer: 'China' },
        { questionNumber: 19, questionText: 'unused', answer: 'North America' },
      ],
    });

    const issues = validateTableCompletionCanonicalization(result);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid-overlap-span',
          severity: 'blocking',
        }),
      ]),
    );
  });

  it('blocks degraded AI fallback when deterministic evidence was ignored', () => {
    const degraded = canonicalizeTableCompletionGroup({
      groupId: 'group-6',
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

    const issues = validateTableCompletionCanonicalization(degraded);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'degraded-table-source',
          severity: 'blocking',
        }),
        expect.objectContaining({
          code: 'deterministic-source-ignored',
          severity: 'blocking',
        }),
      ]),
    );
  });
});
