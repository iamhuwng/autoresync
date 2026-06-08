import { describe, expect, it } from 'vitest';
import { readingV2Ids, type ReadingV2Document } from '../../types/readingV2.types';
import { READING_V2_CANONICAL_FIXTURES } from './fixtures/readingV2CanonicalFixtures';
import {
  ReadingV2PublishGateError,
  assertReadingV2PublishGate,
  validateReadingV2Draft,
} from './readingV2Validation.service';

const fixtureDocument = (): ReadingV2Document =>
  structuredClone(READING_V2_CANONICAL_FIXTURES['sentence-completion']) as ReadingV2Document;

describe('readingV2Validation.service', () => {
  it('allows publish for a valid canonical Reading V2 draft', () => {
    const result = validateReadingV2Draft(fixtureDocument());

    expect(result.canPublish).toBe(true);
    expect(result.blockingIssues).toHaveLength(0);
  });

  it('blocks passage image blocks that are missing student-visible media data', () => {
    const document = fixtureDocument();
    const sectionId = document.sectionIds[0]!;
    const section = document.sections[sectionId]!;
    const mediaStimulusId = readingV2Ids.stimulusId('missing-passage-image');
    const invalidDocument: ReadingV2Document = {
      ...document,
      sections: {
        ...document.sections,
        [section.sectionId]: {
          ...section,
          stimulusIds: [...section.stimulusIds, mediaStimulusId],
        },
      },
      stimuli: {
        ...document.stimuli,
        [mediaStimulusId]: {
          stimulusId: mediaStimulusId,
          kind: 'media',
          title: 'Missing media image',
          content: {
            kind: 'media-content',
            mediaUrl: '',
            alt: '',
          },
          anchorIds: [],
        },
      },
    };
    const result = validateReadingV2Draft(invalidDocument);

    expect(result.canPublish).toBe(false);
    expect(result.blockingIssues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'missing-media-source',
      'student-visible-structured-mismatch',
    ]));
  });

  it('blocks unresolved placeholders, import uncertainty, and missing answer keys before publish', () => {
    const document = fixtureDocument();
    const [taskGroupId] = Object.keys(document.taskGroups);
    const [interactionId] = Object.keys(document.interactions);

    const invalidDocument: ReadingV2Document = {
      ...document,
      taskGroups: {
        ...document.taskGroups,
        [taskGroupId]: {
          ...document.taskGroups[taskGroupId],
          importEvidenceRefs: ['import-evidence-1' as never],
          validationState: {
            issues: [
              {
                code: 'unresolved-draft-placeholder',
                severity: 'error',
                message: 'Placeholder remains unresolved.',
                objectId: taskGroupId,
              },
            ],
          },
        },
      },
      interactions: {
        ...document.interactions,
        [interactionId]: {
          ...document.interactions[interactionId],
          placeholder: true,
          scoringRule: { maxScore: 1, acceptableAnswers: [] },
        },
      },
    };

    const result = validateReadingV2Draft(invalidDocument);

    expect(result.canPublish).toBe(false);
    expect(result.blockingIssues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'unresolved-draft-placeholder',
        'unresolved-import-uncertainty',
        'missing-scoring-response-shape',
      ]),
    );
    expect(() => assertReadingV2PublishGate(invalidDocument)).toThrow(ReadingV2PublishGateError);
  });

  it('turns broken canonical ownership into a blocking validation result', () => {
    const document = fixtureDocument();
    const [sectionId] = document.sectionIds;
    const invalidDocument: ReadingV2Document = {
      ...document,
      sections: {
        ...document.sections,
        [sectionId]: {
          ...document.sections[sectionId],
          stimulusIds: ['missing-stimulus' as never],
        },
      },
    };

    const result = validateReadingV2Draft(invalidDocument);

    expect(result.canPublish).toBe(false);
    expect(result.blockingIssues.some((issue) => issue.code === 'invalid-packaged-material-assembly')).toBe(true);
  });

  it('reports duplicate stimulus anchor registries as typed blocking validation issues', () => {
    const document = structuredClone(READING_V2_CANONICAL_FIXTURES['table-completion']) as ReadingV2Document;
    const stimulus = Object.values(document.stimuli)[0]!;
    const duplicateAnchorId = stimulus.anchorIds[0]!;
    const invalidDocument: ReadingV2Document = {
      ...document,
      stimuli: {
        ...document.stimuli,
        [stimulus.stimulusId]: {
          ...stimulus,
          anchorIds: [...stimulus.anchorIds, duplicateAnchorId],
        },
      },
    };

    const result = validateReadingV2Draft(invalidDocument);

    expect(result.canPublish).toBe(false);
    expect(result.blockingIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'duplicate-stimulus-anchor',
        objectId: stimulus.stimulusId,
        message: expect.stringContaining('duplicate anchor'),
      }),
    ]));
    expect(() => assertReadingV2PublishGate(invalidDocument)).toThrow(ReadingV2PublishGateError);
  });

  it('blocks broken anchor references before publish', () => {
    const document = fixtureDocument();
    const [interactionId] = Object.keys(document.interactions);
    const invalidDocument: ReadingV2Document = {
      ...document,
      interactions: {
        ...document.interactions,
        [interactionId]: {
          ...document.interactions[interactionId],
          primaryAnchorId: 'missing-anchor' as never,
        },
      },
    };

    const result = validateReadingV2Draft(invalidDocument);

    expect(result.canPublish).toBe(false);
    expect(result.blockingIssues.some((issue) => issue.code === 'invalid-packaged-material-assembly')).toBe(true);
    expect(result.blockingIssues.map((issue) => issue.message).join(' ')).toContain('missing-anchor');
  });

  it('blocks every scoring-bearing interaction without a valid scoring rule', () => {
    const document = fixtureDocument();
    const interactionIds = Object.keys(document.interactions);
    const invalidDocument: ReadingV2Document = {
      ...document,
      interactions: Object.fromEntries(
        interactionIds.map((interactionId) => [
          interactionId,
          {
            ...document.interactions[interactionId],
            scoringRule: { maxScore: 1, acceptableAnswers: [] },
          },
        ]),
      ) as ReadingV2Document['interactions'],
    };

    const result = validateReadingV2Draft(invalidDocument);

    expect(result.canPublish).toBe(false);
    expect(result.blockingIssues.filter((issue) => issue.code === 'missing-scoring-response-shape')).toHaveLength(
      interactionIds.length,
    );
  });

  it('blocks invalid table completion merged or blank cell data before publish', () => {
    const document = structuredClone(READING_V2_CANONICAL_FIXTURES['table-completion']) as ReadingV2Document;
    const taskGroup = Object.values(document.taskGroups)[0]!;
    const stimulusRef = taskGroup.stimulusRefs[0]!;
    const stimulus = document.stimuli[stimulusRef.stimulusId]!;

    if (stimulus.content.kind !== 'table-content') {
      throw new Error('Expected table fixture');
    }

    const invalidDocument: ReadingV2Document = {
      ...document,
      stimuli: {
        ...document.stimuli,
        [stimulus.stimulusId]: {
          ...stimulus,
          content: {
            kind: 'table-content',
            rows: [
              [
                { ...stimulus.content.rows[0]![0]!, cellId: undefined },
                stimulus.content.rows[0]![1]!,
              ],
              [
                {
                  ...stimulus.content.rows[1]![0]!,
                  isBlank: true,
                  anchorId: undefined,
                  anchorIds: undefined,
                },
                stimulus.content.rows[1]![1]!,
              ],
            ],
          },
        },
      },
    };

    const result = validateReadingV2Draft(invalidDocument);

    expect(result.canPublish).toBe(false);
    expect(result.blockingIssues.map((issue) => issue.message).join(' ')).toContain('stable cell ID');
    expect(result.blockingIssues.map((issue) => issue.message).join(' ')).toContain('not linked to a question');
  });

  it('blocks table cells that extend outside the durable row structure', () => {
    const document = structuredClone(READING_V2_CANONICAL_FIXTURES['table-completion']) as ReadingV2Document;
    const taskGroup = Object.values(document.taskGroups)[0]!;
    const stimulus = document.stimuli[taskGroup.stimulusRefs[0]!.stimulusId]!;

    if (stimulus.content.kind !== 'table-content') {
      throw new Error('Expected table fixture');
    }

    const invalidDocument: ReadingV2Document = {
      ...document,
      stimuli: {
        ...document.stimuli,
        [stimulus.stimulusId]: {
          ...stimulus,
          content: {
            kind: 'table-content',
            rows: [
              [
                {
                  ...stimulus.content.rows[0]![0]!,
                  rowSpan: 3,
                },
                stimulus.content.rows[0]![1]!,
              ],
              [],
            ],
          },
        },
      },
    };

    const result = validateReadingV2Draft(invalidDocument);

    expect(result.canPublish).toBe(false);
    expect(result.blockingIssues.map((issue) => issue.message).join(' ')).toContain('extends beyond the table rows');
    expect(result.blockingIssues.map((issue) => issue.message).join(' ')).toContain('needs at least one cell');
  });

  it('blocks flowchart completion when a question is not linked to a blank step', () => {
    const document = structuredClone(READING_V2_CANONICAL_FIXTURES['flowchart-completion']) as ReadingV2Document;
    const taskGroup = Object.values(document.taskGroups)[0]!;
    const [interactionId] = taskGroup.interactionIds;
    const interaction = document.interactions[interactionId]!;
    const invalidDocument: ReadingV2Document = {
      ...document,
      interactions: {
        ...document.interactions,
        [interactionId]: {
          ...interaction,
          primaryAnchorId: 'missing-flow-step' as never,
        },
      },
    };

    const result = validateReadingV2Draft(invalidDocument);

    expect(result.canPublish).toBe(false);
    expect(result.blockingIssues.map((issue) => issue.message).join(' ')).toContain('flowchart blank step');
  });

  it('blocks diagram labelling without an image or valid answer-field anchor', () => {
    const document = structuredClone(READING_V2_CANONICAL_FIXTURES['diagram-labeling']) as ReadingV2Document;
    const taskGroup = Object.values(document.taskGroups)[0]!;
    const stimulus = document.stimuli[taskGroup.stimulusRefs[0]!.stimulusId]!;

    if (stimulus.content.kind !== 'diagram-content') {
      throw new Error('Expected diagram fixture');
    }

    const invalidDocument: ReadingV2Document = {
      ...document,
      stimuli: {
        ...document.stimuli,
        [stimulus.stimulusId]: {
          ...stimulus,
          content: {
            ...stimulus.content,
            imageUrl: '',
            hotspots: [
              {
                ...stimulus.content.hotspots[0]!,
                anchorId: 'missing-diagram-anchor',
              },
            ],
          },
        },
      },
    };

    const result = validateReadingV2Draft(invalidDocument);

    expect(result.canPublish).toBe(false);
    expect(result.blockingIssues.map((issue) => issue.message).join(' ')).toContain('needs an image');
    expect(result.blockingIssues.map((issue) => issue.message).join(' ')).toContain('valid diagram-hotspot anchor');
  });

  it('blocks multiple selection when the answer key count does not match the selection count', () => {
    const document = structuredClone(READING_V2_CANONICAL_FIXTURES['multiple-select']) as ReadingV2Document;
    const [interactionId] = Object.keys(document.interactions);
    const interaction = document.interactions[interactionId]!;
    if (interaction.responseShape.kind !== 'multi-select') {
      throw new Error('Expected multiple-select fixture');
    }

    const invalidDocument: ReadingV2Document = {
      ...document,
      interactions: {
        ...document.interactions,
        [interactionId]: {
          ...interaction,
          responseShape: {
            kind: 'multi-select',
            optionSetId: interaction.responseShape.optionSetId,
            selectionLimit: 2,
          },
          scoringRule: {
            ...interaction.scoringRule,
            acceptableAnswers: ['A'],
            orderMatters: false,
          },
        },
      },
    };

    const result = validateReadingV2Draft(invalidDocument);

    expect(result.canPublish).toBe(false);
    expect(result.blockingIssues.map((issue) => issue.message).join(' ')).toContain('exactly 2 correct answers');
  });

  it('blocks single-choice interactions with multiple keyed answers', () => {
    const document = structuredClone(READING_V2_CANONICAL_FIXTURES['multiple-choice']) as ReadingV2Document;
    const [interactionId] = Object.keys(document.interactions);
    const interaction = document.interactions[interactionId]!;
    const invalidDocument: ReadingV2Document = {
      ...document,
      interactions: {
        ...document.interactions,
        [interactionId]: {
          ...interaction,
          scoringRule: {
            ...interaction.scoringRule,
            acceptableAnswers: ['A', 'B'],
          },
        },
      },
    };

    const result = validateReadingV2Draft(invalidDocument);

    expect(result.canPublish).toBe(false);
    expect(result.blockingIssues.map((issue) => issue.message).join(' ')).toContain('exactly one correct answer');
  });

  it('blocks multi-select scoring when imported keys still depend on answer order', () => {
    const document = structuredClone(READING_V2_CANONICAL_FIXTURES['multiple-select']) as ReadingV2Document;
    const [interactionId] = Object.keys(document.interactions);
    const interaction = document.interactions[interactionId]!;

    const invalidDocument: ReadingV2Document = {
      ...document,
      interactions: {
        ...document.interactions,
        [interactionId]: {
          ...interaction,
          scoringRule: {
            ...interaction.scoringRule,
            orderMatters: true,
          },
        },
      },
    };

    const result = validateReadingV2Draft(invalidDocument);

    expect(result.canPublish).toBe(false);
    expect(result.blockingIssues.map((issue) => issue.message).join(' ')).toContain('orderMatters to false');
  });

  it('accepts trimmed labels and option IDs for choice-family answer keys', () => {
    const document = structuredClone(READING_V2_CANONICAL_FIXTURES['multiple-choice']) as ReadingV2Document;
    const taskGroup = Object.values(document.taskGroups)[0]!;
    const [firstInteractionId, secondInteractionId] = taskGroup.interactionIds;
    const firstInteraction = document.interactions[firstInteractionId]!;
    const secondInteraction = document.interactions[secondInteractionId]!;
    const optionSet = Object.values(document.optionSets)[0]!;

    const validDocument: ReadingV2Document = {
      ...document,
      interactions: {
        ...document.interactions,
        [firstInteractionId]: {
          ...firstInteraction,
          scoringRule: { ...firstInteraction.scoringRule, acceptableAnswers: [' A '] },
        },
        [secondInteractionId]: {
          ...secondInteraction,
          scoringRule: { ...secondInteraction.scoringRule, acceptableAnswers: [optionSet.options[1]!.optionId] },
        },
      },
    };

    const result = validateReadingV2Draft(validDocument);

    expect(result.canPublish).toBe(true);
    expect(result.blockingIssues).toEqual([]);
  });

  it('blocks choice and matching answers that are missing from their option banks', () => {
    const choiceDocument = structuredClone(READING_V2_CANONICAL_FIXTURES['multiple-choice']) as ReadingV2Document;
    const [choiceInteractionId] = Object.keys(choiceDocument.interactions);
    const choiceInteraction = choiceDocument.interactions[choiceInteractionId]!;
    const invalidChoiceDocument: ReadingV2Document = {
      ...choiceDocument,
      interactions: {
        ...choiceDocument.interactions,
        [choiceInteractionId]: {
          ...choiceInteraction,
          scoringRule: { ...choiceInteraction.scoringRule, acceptableAnswers: ['Z'] },
        },
      },
    };
    const matchingDocument = structuredClone(READING_V2_CANONICAL_FIXTURES['matching-headings']) as ReadingV2Document;
    const [matchingInteractionId] = Object.keys(matchingDocument.interactions);
    const matchingInteraction = matchingDocument.interactions[matchingInteractionId]!;
    const invalidMatchingDocument: ReadingV2Document = {
      ...matchingDocument,
      interactions: {
        ...matchingDocument.interactions,
        [matchingInteractionId]: {
          ...matchingInteraction,
          scoringRule: { ...matchingInteraction.scoringRule, acceptableAnswers: ['ix'] },
        },
      },
    };

    const choiceResult = validateReadingV2Draft(invalidChoiceDocument);
    const matchingResult = validateReadingV2Draft(invalidMatchingDocument);

    expect(choiceResult.canPublish).toBe(false);
    expect(choiceResult.blockingIssues.map((issue) => issue.message).join(' ')).toContain('not in its option list');
    expect(matchingResult.canPublish).toBe(false);
    expect(matchingResult.blockingIssues.map((issue) => issue.message).join(' ')).toContain('matching answer that is not in its option list');
  });

  it('accepts matching labels and option IDs while allowing reuse for matching-information', () => {
    const headingDocument = structuredClone(READING_V2_CANONICAL_FIXTURES['matching-headings']) as ReadingV2Document;
    const headingTaskGroup = Object.values(headingDocument.taskGroups)[0]!;
    const [firstHeadingId, secondHeadingId] = headingTaskGroup.interactionIds;
    const firstHeading = headingDocument.interactions[firstHeadingId]!;
    const secondHeading = headingDocument.interactions[secondHeadingId]!;
    const headingOptionSet = Object.values(headingDocument.optionSets)[0]!;
    const headingWithOptionIds: ReadingV2Document = {
      ...headingDocument,
      interactions: {
        ...headingDocument.interactions,
        [firstHeadingId]: {
          ...firstHeading,
          scoringRule: { ...firstHeading.scoringRule, acceptableAnswers: [headingOptionSet.options[0]!.optionId] },
        },
        [secondHeadingId]: {
          ...secondHeading,
          scoringRule: { ...secondHeading.scoringRule, acceptableAnswers: [' ii '] },
        },
      },
    };
    const informationDocument = structuredClone(READING_V2_CANONICAL_FIXTURES['matching-information']) as ReadingV2Document;
    const informationTaskGroup = Object.values(informationDocument.taskGroups)[0]!;
    const [firstInformationId, secondInformationId] = informationTaskGroup.interactionIds;
    const firstInformation = informationDocument.interactions[firstInformationId]!;
    const secondInformation = informationDocument.interactions[secondInformationId]!;
    const informationReuse: ReadingV2Document = {
      ...informationDocument,
      interactions: {
        ...informationDocument.interactions,
        [firstInformationId]: {
          ...firstInformation,
          scoringRule: { ...firstInformation.scoringRule, acceptableAnswers: ['A'] },
        },
        [secondInformationId]: {
          ...secondInformation,
          scoringRule: { ...secondInformation.scoringRule, acceptableAnswers: ['A'] },
        },
      },
    };

    expect(validateReadingV2Draft(headingWithOptionIds).canPublish).toBe(true);
    expect(validateReadingV2Draft(informationReuse).canPublish).toBe(true);
  });

  it('accepts a repaired matching-information answer once option E exists in the bank', () => {
    const document = structuredClone(READING_V2_CANONICAL_FIXTURES['matching-information']) as ReadingV2Document;
    const [optionSet] = Object.values(document.optionSets);
    const [interactionId] = Object.keys(document.interactions);
    const interaction = document.interactions[interactionId]!;
    const repairedDocument: ReadingV2Document = {
      ...document,
      interactions: {
        ...document.interactions,
        [interactionId]: {
          ...interaction,
          scoringRule: { ...interaction.scoringRule, acceptableAnswers: ['E'] },
        },
      },
    };
    const missingEOptionSet = {
      ...optionSet!,
      options: optionSet!.options.filter((option) => option.label !== 'E'),
    };
    const unrepairedDocument: ReadingV2Document = {
      ...repairedDocument,
      optionSets: {
        ...repairedDocument.optionSets,
        [missingEOptionSet.optionSetId]: missingEOptionSet,
      },
    };

    const repairedResult = validateReadingV2Draft(repairedDocument);
    const unrepairedResult = validateReadingV2Draft(unrepairedDocument);

    expect(repairedResult.canPublish).toBe(true);
    expect(repairedResult.blockingIssues.map((issue) => issue.message).join(' ')).not.toContain('matching answer that is not in its option list');
    expect(unrepairedResult.canPublish).toBe(false);
    expect(unrepairedResult.blockingIssues.map((issue) => issue.message).join(' ')).toContain('matching answer that is not in its option list');
  });

  it('invalidates stale option labels after relabeling while stable option IDs remain valid', () => {
    const document = structuredClone(READING_V2_CANONICAL_FIXTURES['multiple-choice']) as ReadingV2Document;
    const [optionSet] = Object.values(document.optionSets);
    const [interactionId] = Object.keys(document.interactions);
    const interaction = document.interactions[interactionId]!;
    const relabeledOptionSet = {
      ...optionSet!,
      options: optionSet!.options.map((option, index) =>
        index === 0 ? { ...option, label: 'Z' } : option,
      ),
    };
    const staleLabelDocument: ReadingV2Document = {
      ...document,
      optionSets: {
        ...document.optionSets,
        [relabeledOptionSet.optionSetId]: relabeledOptionSet,
      },
      interactions: {
        ...document.interactions,
        [interactionId]: {
          ...interaction,
          scoringRule: { ...interaction.scoringRule, acceptableAnswers: ['A'] },
        },
      },
    };
    const stableIdDocument: ReadingV2Document = {
      ...staleLabelDocument,
      interactions: {
        ...staleLabelDocument.interactions,
        [interactionId]: {
          ...interaction,
          scoringRule: { ...interaction.scoringRule, acceptableAnswers: [relabeledOptionSet.options[0]!.optionId] },
        },
      },
    };

    const staleLabelResult = validateReadingV2Draft(staleLabelDocument);
    const stableIdResult = validateReadingV2Draft(stableIdDocument);

    expect(staleLabelResult.canPublish).toBe(false);
    expect(staleLabelResult.blockingIssues.map((issue) => issue.message).join(' ')).toContain('not in its option list');
    expect(stableIdResult.canPublish).toBe(true);
  });

  it('blocks completion answers that exceed the imported word limit', () => {
    const document = fixtureDocument();
    const [interactionId] = Object.keys(document.interactions);
    const interaction = document.interactions[interactionId]!;
    const invalidDocument: ReadingV2Document = {
      ...document,
      interactions: {
        ...document.interactions,
        [interactionId]: {
          ...interaction,
          scoringRule: { ...interaction.scoringRule, acceptableAnswers: ['three word answer'] },
        },
      },
    };

    const result = validateReadingV2Draft(invalidDocument);

    expect(result.canPublish).toBe(false);
    expect(result.blockingIssues.map((issue) => issue.message).join(' ')).toContain('word limit');
  });

  it('accepts IELTS one-word-and-or-number answers that include one number expression plus one word', () => {
    const document = fixtureDocument();
    const [taskGroupId] = Object.keys(document.taskGroups);
    const [interactionId] = Object.keys(document.interactions);
    const taskGroup = document.taskGroups[taskGroupId]!;
    const interaction = document.interactions[interactionId]!;
    const validDocument: ReadingV2Document = {
      ...document,
      taskGroups: {
        ...document.taskGroups,
        [taskGroupId]: {
          ...taskGroup,
          instructionBlocks: [
            {
              id: taskGroup.instructionBlocks[0]!.id,
              text: 'Choose ONE WORD AND/OR A NUMBER from the passage for each answer.',
            },
          ],
        },
      },
      interactions: {
        ...document.interactions,
        [interactionId]: {
          ...interaction,
          scoringRule: { ...interaction.scoringRule, acceptableAnswers: ['ten times'] },
        },
      },
    };

    const result = validateReadingV2Draft(validDocument);

    expect(result.canPublish).toBe(true);
    expect(result.blockingIssues).toEqual([]);
  });

  it('blocks note-completion groups that flatten repeated note headings into question text', () => {
    const document = structuredClone(READING_V2_CANONICAL_FIXTURES['note-completion']) as ReadingV2Document;
    const taskGroup = Object.values(document.taskGroups)[0]!;
    const [firstInteractionId, secondInteractionId] = taskGroup.interactionIds;
    const invalidDocument: ReadingV2Document = {
      ...document,
      taskGroups: {
        ...document.taskGroups,
        [taskGroup.taskGroupId]: {
          ...taskGroup,
          layoutHint: undefined,
        },
      },
      interactions: {
        ...document.interactions,
        [firstInteractionId!]: {
          ...document.interactions[firstInteractionId!]!,
          promptText: 'Early silk production in China. Cocoon fell into wife’s ___.',
        },
        [secondInteractionId!]: {
          ...document.interactions[secondInteractionId!]!,
          promptText: 'Early silk production in China. Wife invented a ___.',
        },
      },
    };

    const result = validateReadingV2Draft(invalidDocument);

    expect(result.canPublish).toBe(false);
    expect(result.blockingIssues.map((issue) => issue.message).join(' ')).toContain(
      'repeated source note headings inside question text',
    );
  });

  it('blocks passage titles that contain timing instruction text', () => {
    const document = structuredClone(READING_V2_CANONICAL_FIXTURES['true-false-not-given']) as ReadingV2Document;
    const stimulus = Object.values(document.stimuli)[0]!;
    document.stimuli[stimulus.stimulusId] = {
      ...stimulus,
      title: 'You should spend about 20 minutes on Questions 1-2, which are based on Reading Passage 1 below.',
    };

    const result = validateReadingV2Draft(document);

    expect(result.canPublish).toBe(false);
    expect(result.blockingIssues.map((issue) => issue.message).join(' ')).toContain('real passage title');
  });

  it('blocks summary-completion-text groups split into overlapping source fragments', () => {
    const document = structuredClone(READING_V2_CANONICAL_FIXTURES['summary-completion-text']) as ReadingV2Document;
    const taskGroup = Object.values(document.taskGroups)[0]!;
    const [firstInteractionId, secondInteractionId] = taskGroup.interactionIds;
    const firstText = 'The source summary says the first process depends on ___ and the second result produces';
    const secondText = 'and the second result produces ___ before the final outcome is reached.';
    const invalidDocument: ReadingV2Document = {
      ...document,
      interactions: {
        ...document.interactions,
        [firstInteractionId!]: {
          ...document.interactions[firstInteractionId!]!,
          promptText: firstText,
        },
        [secondInteractionId!]: {
          ...document.interactions[secondInteractionId!]!,
          promptText: secondText,
        },
      },
    };

    const result = validateReadingV2Draft(invalidDocument);

    expect(result.canPublish).toBe(false);
    expect(result.blockingIssues.map((issue) => issue.message).join(' ')).toContain('overlapping question fragments');
  });

  it('blocks summary-completion-text layouts with repeated source fragments', () => {
    const document = structuredClone(READING_V2_CANONICAL_FIXTURES['summary-completion-text']) as ReadingV2Document;
    const taskGroup = Object.values(document.taskGroups)[0]!;
    const repeated = 'and the copied source fragment continues for enough words';
    const invalidDocument: ReadingV2Document = {
      ...document,
      taskGroups: {
        ...document.taskGroups,
        [taskGroup.taskGroupId]: {
          ...taskGroup,
          layoutHint: JSON.stringify({
            kind: 'summary-text',
            segments: [
              'Summary starts',
              `${repeated} ${repeated}`,
              'Summary ends',
            ],
          }),
        },
      },
    };

    const result = validateReadingV2Draft(invalidDocument);

    expect(result.canPublish).toBe(false);
    expect(result.blockingIssues.map((issue) => issue.message).join(' ')).toContain('repeated or overlapping source fragments');
  });

  it('blocks structured-entry task groups when response shape does not match the visible shell', () => {
    const document = structuredClone(READING_V2_CANONICAL_FIXTURES['table-completion']) as ReadingV2Document;
    const taskGroup = Object.values(document.taskGroups)[0]!;
    const [interactionId] = taskGroup.interactionIds;
    const interaction = document.interactions[interactionId]!;
    const invalidDocument: ReadingV2Document = {
      ...document,
      taskGroups: {
        ...document.taskGroups,
        [taskGroup.taskGroupId]: {
          ...taskGroup,
          answerRule: {
            ...taskGroup.answerRule,
            responseShape: { kind: 'structured-entry', structure: 'flowchart' },
          },
        },
      },
      interactions: {
        ...document.interactions,
        [interactionId]: {
          ...interaction,
          responseShape: { kind: 'structured-entry', structure: 'flowchart' },
        },
      },
    };

    const result = validateReadingV2Draft(invalidDocument);

    expect(result.canPublish).toBe(false);
    expect(result.blockingIssues.map((issue) => issue.message).join(' ')).toContain('table structured-entry response shape');
  });

  it('allows binary judgement answer aliases before publish', () => {
    const document = structuredClone(READING_V2_CANONICAL_FIXTURES['true-false-not-given']) as ReadingV2Document;
    const taskGroup = Object.values(document.taskGroups)[0]!;
    const [firstInteractionId, secondInteractionId] = taskGroup.interactionIds;
    const firstInteraction = document.interactions[firstInteractionId]!;
    const secondInteraction = document.interactions[secondInteractionId]!;
    const aliasedDocument: ReadingV2Document = {
      ...document,
      interactions: {
        ...document.interactions,
        [firstInteractionId]: {
          ...firstInteraction,
          scoringRule: { ...firstInteraction.scoringRule, acceptableAnswers: ['t'] },
        },
        [secondInteractionId]: {
          ...secondInteraction,
          scoringRule: { ...secondInteraction.scoringRule, acceptableAnswers: ['f'] },
        },
      },
    };

    const result = validateReadingV2Draft(aliasedDocument);

    expect(result.canPublish).toBe(true);
    expect(result.blockingIssues).toHaveLength(0);
  });

  it('blocks binary judgement aliases from the wrong vocabulary', () => {
    const document = structuredClone(READING_V2_CANONICAL_FIXTURES['true-false-not-given']) as ReadingV2Document;
    const [interactionId] = Object.keys(document.interactions);
    const interaction = document.interactions[interactionId]!;
    const invalidDocument: ReadingV2Document = {
      ...document,
      interactions: {
        ...document.interactions,
        [interactionId]: {
          ...interaction,
          scoringRule: { ...interaction.scoringRule, acceptableAnswers: ['yes'] },
        },
      },
    };

    const result = validateReadingV2Draft(invalidDocument);

    expect(result.canPublish).toBe(false);
    expect(result.blockingIssues.map((issue) => issue.message).join(' ')).toContain('wrong judgement vocabulary');
  });

  it('blocks completion-family prompts without a visible blank marker', () => {
    const document = fixtureDocument();
    const [interactionId] = Object.keys(document.interactions);
    const interaction = document.interactions[interactionId]!;
    const invalidDocument: ReadingV2Document = {
      ...document,
      interactions: {
        ...document.interactions,
        [interactionId]: {
          ...interaction,
          promptText: 'The answer belongs here but no blank marker is visible.',
        },
      },
    };

    const result = validateReadingV2Draft(invalidDocument);

    expect(result.canPublish).toBe(false);
    expect(result.blockingIssues.map((issue) => issue.message).join(' ')).toContain('visible blank marker');
  });

  it('blocks duplicate matching answers when the task disallows option reuse', () => {
    const document = structuredClone(READING_V2_CANONICAL_FIXTURES['matching-headings']) as ReadingV2Document;
    const taskGroup = Object.values(document.taskGroups)[0]!;
    const [firstInteractionId, secondInteractionId] = taskGroup.interactionIds;
    const firstInteraction = document.interactions[firstInteractionId]!;
    const secondInteraction = document.interactions[secondInteractionId]!;
    const optionSetId = firstInteraction.responseShape.kind === 'matching'
      ? firstInteraction.responseShape.optionSetId
      : taskGroup.optionSetRefs[0]!;

    const invalidDocument: ReadingV2Document = {
      ...document,
      interactions: {
        ...document.interactions,
        [firstInteractionId]: {
          ...firstInteraction,
          responseShape: { kind: 'matching', optionSetId, optionReuse: 'disallowed' },
          scoringRule: { ...firstInteraction.scoringRule, acceptableAnswers: ['i'] },
        },
        [secondInteractionId]: {
          ...secondInteraction,
          responseShape: { kind: 'matching', optionSetId, optionReuse: 'disallowed' },
          scoringRule: { ...secondInteraction.scoringRule, acceptableAnswers: ['i'] },
        },
      },
    };

    const result = validateReadingV2Draft(invalidDocument);

    expect(result.canPublish).toBe(false);
    expect(result.blockingIssues.map((issue) => issue.message).join(' ')).toContain('cannot reuse matching answer i');
  });

  it('blocks duplicate visible question numbers before binding or publish', () => {
    const document = fixtureDocument();
    const [firstInteractionId, secondInteractionId] = Object.keys(document.interactions);
    const firstInteraction = document.interactions[firstInteractionId]!;
    const secondInteraction = document.interactions[secondInteractionId]!;
    const invalidDocument: ReadingV2Document = {
      ...document,
      interactions: {
        ...document.interactions,
        [firstInteractionId]: {
          ...firstInteraction,
          reviewLabel: { displayNumber: 1 },
        },
        [secondInteractionId]: {
          ...secondInteraction,
          reviewLabel: { displayNumber: 1 },
        },
      },
    };

    const result = validateReadingV2Draft(invalidDocument);

    expect(result.canPublish).toBe(false);
    expect(result.blockingIssues.map((issue) => issue.code)).toContain('duplicate-numbering');
  });
});
