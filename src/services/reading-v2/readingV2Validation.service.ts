import {
  type ReadingV2Document,
  type ReadingV2Interaction,
  type ReadingV2OptionSet,
  type ReadingV2PublishBlockCode,
  type ReadingV2TableCellContent,
  type ReadingV2TaskGroup,
  type ReadingV2ValidationIssue,
} from '../../types/readingV2.types';
import {
  assertValidReadingV2CanonicalDocument,
  isReadingV2PublishBlocked,
} from './readingV2ContractGuards.service';
import { canonicalizeReadingV2JudgementAnswer } from './readingV2JudgementAnswers.service';
import { deriveReadingV2VisibleNumbers } from './readingV2Numbering.service';

export interface ReadingV2ValidationResult {
  readonly issues: readonly ReadingV2ValidationIssue[];
  readonly blockingIssues: readonly ReadingV2ValidationIssue[];
  readonly warningIssues: readonly ReadingV2ValidationIssue[];
  readonly informationalIssues: readonly ReadingV2ValidationIssue[];
  readonly canPublish: boolean;
}

export class ReadingV2PublishGateError extends Error {
  readonly result: ReadingV2ValidationResult;

  constructor(result: ReadingV2ValidationResult) {
    super('Reading V2 publish is blocked by validation errors.');
    this.result = result;
  }
}

const issue = (
  code: ReadingV2PublishBlockCode | string,
  message: string,
  objectId?: string,
): ReadingV2ValidationIssue => ({
  code,
  severity: 'error',
  message,
  objectId,
});

const hasScoringAnswer = (interaction: ReadingV2Interaction): boolean => {
  const acceptableAnswers = interaction.scoringRule.acceptableAnswers ?? [];
  if (interaction.scoringRule.maxScore <= 0) {
    return false;
  }

  if (interaction.responseShape.kind === 'free-text' || interaction.responseShape.kind === 'structured-entry') {
    return acceptableAnswers.some((answer) => answer.trim().length > 0);
  }

  return acceptableAnswers.length > 0;
};

const answerKey = (answer: string): string => answer.trim().toLowerCase();

const optionAnswerKey = (answer: string): string => answer.trim().toLowerCase();

const optionAnswerKeys = (optionSet: ReadingV2OptionSet | undefined): ReadonlySet<string> =>
  new Set((optionSet?.options ?? []).flatMap((option) => [
    optionAnswerKey(option.label),
    optionAnswerKey(option.optionId),
  ]).filter(Boolean));

const structuredEntryKindFor = (
  taskGroup: ReadingV2TaskGroup,
): 'table' | 'flowchart' | 'diagram' | null => {
  switch (taskGroup.officialTaskType) {
    case 'table-completion':
      return 'table';
    case 'flowchart-completion':
      return 'flowchart';
    case 'diagram-labeling':
      return 'diagram';
    default:
      return null;
  }
};

const answerWordCount = (answer: string): number =>
  answer.trim().split(/\s+/).filter(Boolean).length;

const COMPLETION_TASK_TYPES = new Set([
  'sentence-completion',
  'summary-completion-text',
  'summary-completion-list',
  'note-completion',
]);

const visibleBlankPattern = /_{3,}|\[\s*(?:blank|\d+)\s*\]|\{\{\s*(?:blank|\d+)\s*\}\}/i;

interface NoteCompletionLayoutSection {
  readonly heading?: string;
  readonly questionNumbers?: readonly number[];
}

interface NoteCompletionLayout {
  readonly kind?: string;
  readonly sections?: readonly NoteCompletionLayoutSection[];
}

const orderedTaskGroups = (document: ReadingV2Document): ReadingV2TaskGroup[] =>
  document.sectionIds.flatMap((sectionId) => {
    const section = document.sections[sectionId];
    return section
      ? section.taskGroupIds
          .map((taskGroupId) => document.taskGroups[taskGroupId])
          .filter((taskGroup): taskGroup is ReadingV2TaskGroup => taskGroup !== undefined)
      : [];
  });

const tableCellAnchorIds = (
  cell: ReadingV2TableCellContent,
): readonly string[] => {
  const anchors = cell.anchorIds && cell.anchorIds.length > 0
    ? cell.anchorIds
    : cell.anchorId
      ? [cell.anchorId]
      : [];

  return anchors.filter((anchorId, index) => anchors.indexOf(anchorId) === index);
};

const tableInlineBlankCount = (text: string): number =>
  text.match(/_{3,}|\[\s*blank\s*\]|\{\{\s*blank\s*\}\}|\{\s*blank\s*\}/gi)?.length ?? 0;

const parseNoteCompletionLayout = (taskGroup: ReadingV2TaskGroup): NoteCompletionLayout | null => {
  if (!taskGroup.layoutHint) {
    return null;
  }

  try {
    const parsed = JSON.parse(taskGroup.layoutHint) as NoteCompletionLayout;
    return parsed.kind === 'note-completion-layout' ? parsed : null;
  } catch {
    return null;
  }
};

const repeatedFlattenedNoteHeadings = (
  interactions: readonly ReadingV2Interaction[],
): readonly string[] => {
  const headingCounts = new Map<string, number>();

  interactions.forEach((interaction) => {
    const prompt = (interaction.promptText ?? '').replace(/\s*\n\s*/g, ' ').trim();
    const match = prompt.match(/^(.{4,90}?)[.:]\s+(.+)$/);
    const heading = match?.[1]?.trim();
    const rest = match?.[2]?.trim();

    if (heading && rest && visibleBlankPattern.test(rest)) {
      headingCounts.set(heading.toLowerCase(), (headingCounts.get(heading.toLowerCase()) ?? 0) + 1);
    }
  });

  return [...headingCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([heading]) => heading);
};

const validateNoteCompletionTaskGroup = (
  document: ReadingV2Document,
  taskGroup: ReadingV2TaskGroup,
): readonly ReadingV2ValidationIssue[] => {
  if (taskGroup.officialTaskType !== 'note-completion') {
    return [];
  }

  const issues: ReadingV2ValidationIssue[] = [];
  const interactions = taskGroup.interactionIds
    .map((interactionId) => document.interactions[interactionId])
    .filter((interaction): interaction is ReadingV2Interaction => Boolean(interaction));
  const interactionNumbers = new Set(
    interactions
      .map((interaction) => interaction.reviewLabel.displayNumber)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
  );
  const layout = parseNoteCompletionLayout(taskGroup);
  const layoutSections = layout?.sections?.filter((section) => section.heading?.trim()) ?? [];

  if (layoutSections.length === 0 && repeatedFlattenedNoteHeadings(interactions).length > 0) {
    issues.push(
      issue(
        'student-visible-structured-mismatch',
        'Note Completion appears to have repeated source note headings inside question text. Preserve those headings as note layout sections before publishing.',
        taskGroup.taskGroupId,
      ),
    );
  }

  const seenLayoutNumbers = new Set<number>();
  layoutSections.forEach((section) => {
    (section.questionNumbers ?? []).forEach((questionNumber) => {
      if (!interactionNumbers.has(questionNumber)) {
        issues.push(
          issue(
            'student-visible-structured-mismatch',
            `Note Completion layout references Question ${questionNumber}, but that question is not in this group.`,
            taskGroup.taskGroupId,
          ),
        );
      }

      if (seenLayoutNumbers.has(questionNumber)) {
        issues.push(
          issue(
            'student-visible-structured-mismatch',
            `Note Completion layout references Question ${questionNumber} in more than one note section.`,
            taskGroup.taskGroupId,
          ),
        );
      }

      seenLayoutNumbers.add(questionNumber);
    });
  });

  return issues;
};

const validateTableCompletionTaskGroup = (
  document: ReadingV2Document,
  taskGroup: ReadingV2TaskGroup,
): readonly ReadingV2ValidationIssue[] => {
  if (taskGroup.officialTaskType !== 'table-completion') {
    return [];
  }

  const issues: ReadingV2ValidationIssue[] = [];
  const tableStimulus = taskGroup.stimulusRefs
    .map((stimulusRef) => document.stimuli[stimulusRef.stimulusId])
    .find((stimulus) => stimulus?.content.kind === 'table-content');

  if (!tableStimulus || tableStimulus.content.kind !== 'table-content') {
    return [
      issue(
        'invalid-packaged-material-assembly',
        'Table Completion needs a table before publishing.',
        taskGroup.taskGroupId,
      ),
    ];
  }

  const seenCellIds = new Set<string>();
  const occupied = new Set<string>();
  const blankAnchorIds = new Set<string>();
  const tableRows = tableStimulus.content.rows;

  tableRows.forEach((row, rowIndex) => {
    let columnIndex = 0;

    if (row.length === 0) {
      issues.push(
        issue(
          'invalid-packaged-material-assembly',
          `Table row ${rowIndex + 1} needs at least one cell before publishing.`,
          taskGroup.taskGroupId,
        ),
      );
    }

    row.forEach((cell, cellIndex) => {
      while (occupied.has(`${rowIndex}:${columnIndex}`)) {
        columnIndex += 1;
      }

      if (!cell.cellId?.trim()) {
        issues.push(
          issue(
            'invalid-packaged-material-assembly',
            `Table cell ${rowIndex + 1}.${cellIndex + 1} needs a stable cell ID before publishing.`,
            taskGroup.taskGroupId,
          ),
        );
      } else if (seenCellIds.has(cell.cellId)) {
        issues.push(
          issue(
            'invalid-packaged-material-assembly',
            `Table cell ID ${cell.cellId} is duplicated.`,
            cell.cellId,
          ),
        );
      } else {
        seenCellIds.add(cell.cellId);
      }

      const rowSpan = cell.rowSpan ?? 1;
      const colSpan = cell.colSpan ?? 1;
      if (rowSpan < 1 || colSpan < 1) {
        issues.push(
          issue(
            'invalid-packaged-material-assembly',
            `Table cell ${cell.cellId ?? `${rowIndex + 1}.${cellIndex + 1}`} has invalid span values.`,
            cell.cellId ?? taskGroup.taskGroupId,
          ),
        );
      }
      if (rowIndex + Math.max(1, rowSpan) > tableRows.length) {
        issues.push(
          issue(
            'invalid-packaged-material-assembly',
            `Table cell ${cell.cellId ?? `${rowIndex + 1}.${cellIndex + 1}`} extends beyond the table rows.`,
            cell.cellId ?? taskGroup.taskGroupId,
          ),
        );
      }

      for (let rowOffset = 0; rowOffset < Math.max(1, rowSpan); rowOffset += 1) {
        for (let columnOffset = 0; columnOffset < Math.max(1, colSpan); columnOffset += 1) {
          const key = `${rowIndex + rowOffset}:${columnIndex + columnOffset}`;
          if (occupied.has(key)) {
            issues.push(
              issue(
                'invalid-packaged-material-assembly',
                `Table cell ${cell.cellId ?? `${rowIndex + 1}.${cellIndex + 1}`} overlaps another merged cell.`,
                cell.cellId ?? taskGroup.taskGroupId,
              ),
            );
          }
          occupied.add(key);
        }
      }

      const inlineBlankCount = tableInlineBlankCount(cell.text);

      if (cell.isBlank || inlineBlankCount > 0) {
        const anchors = tableCellAnchorIds(cell);
        if (anchors.length === 0) {
          issues.push(
            issue(
              'orphan-anchor-reference',
              `Blank table cell ${cell.cellId ?? `${rowIndex + 1}.${cellIndex + 1}`} is not linked to a question.`,
              cell.cellId ?? taskGroup.taskGroupId,
            ),
          );
        }
        if (inlineBlankCount === 0) {
          issues.push(
            issue(
              'missing-scoring-response-shape',
              `Blank table cell ${cell.cellId ?? `${rowIndex + 1}.${cellIndex + 1}`} needs an inline blank marker such as ___.`,
              cell.cellId ?? taskGroup.taskGroupId,
            ),
          );
        }
        if (inlineBlankCount > 0 && anchors.length !== inlineBlankCount) {
          issues.push(
            issue(
              'orphan-anchor-reference',
              `Blank table cell ${cell.cellId ?? `${rowIndex + 1}.${cellIndex + 1}`} has ${inlineBlankCount} visible blank markers but ${anchors.length} linked questions.`,
              cell.cellId ?? taskGroup.taskGroupId,
            ),
          );
        }
        anchors.forEach((anchorId) => blankAnchorIds.add(anchorId));
      }

      columnIndex += Math.max(1, colSpan);
    });
  });

  taskGroup.interactionIds.forEach((interactionId) => {
    const interaction = document.interactions[interactionId];
    if (interaction?.primaryAnchorId && !blankAnchorIds.has(interaction.primaryAnchorId)) {
      issues.push(
        issue(
          'orphan-anchor-reference',
          `Question ${interactionId} is not linked to a blank table cell.`,
          interactionId,
        ),
      );
    }
  });

  return issues;
};

const validateFlowchartCompletionTaskGroup = (
  document: ReadingV2Document,
  taskGroup: ReadingV2TaskGroup,
): readonly ReadingV2ValidationIssue[] => {
  if (taskGroup.officialTaskType !== 'flowchart-completion') {
    return [];
  }

  const flowchartStimulus = taskGroup.stimulusRefs
    .map((stimulusRef) => document.stimuli[stimulusRef.stimulusId])
    .find((stimulus) => stimulus?.content.kind === 'flowchart-content');

  if (!flowchartStimulus || flowchartStimulus.content.kind !== 'flowchart-content') {
    return [
      issue(
        'invalid-packaged-material-assembly',
        'Flowchart Completion needs a flowchart before publishing.',
        taskGroup.taskGroupId,
      ),
    ];
  }

  const issues: ReadingV2ValidationIssue[] = [];
  const stepAnchorIds = new Set<string>();
  const stepIds = new Set<string>();

  if (flowchartStimulus.content.steps.length === 0) {
    issues.push(
      issue(
        'invalid-packaged-material-assembly',
        'Flowchart Completion needs at least one step before publishing.',
        taskGroup.taskGroupId,
      ),
    );
  }

  flowchartStimulus.content.steps.forEach((step, index) => {
    if (!step.stepId.trim()) {
      issues.push(
        issue(
          'invalid-packaged-material-assembly',
          `Flowchart step ${index + 1} needs a stable step ID before publishing.`,
          taskGroup.taskGroupId,
        ),
      );
    } else if (stepIds.has(step.stepId)) {
      issues.push(
        issue(
          'invalid-packaged-material-assembly',
          `Flowchart step ID ${step.stepId} is duplicated.`,
          step.stepId,
        ),
      );
    } else {
      stepIds.add(step.stepId);
    }

    if (!step.text.trim()) {
      issues.push(
        issue(
          'invalid-packaged-material-assembly',
          `Flowchart step ${step.stepId || index + 1} needs visible text before publishing.`,
          step.stepId || taskGroup.taskGroupId,
        ),
      );
    }

    if (step.anchorId) {
      stepAnchorIds.add(step.anchorId);
      const anchor = document.anchors[step.anchorId];
      if (!anchor || anchor.kind !== 'flow-step' || anchor.stimulusId !== flowchartStimulus.stimulusId) {
        issues.push(
          issue(
            'orphan-anchor-reference',
            `Flowchart blank ${step.stepId || index + 1} is not linked to a valid flow-step anchor.`,
            step.anchorId,
          ),
        );
      }
    }
  });

  taskGroup.interactionIds.forEach((interactionId) => {
    const interaction = document.interactions[interactionId];
    if (!interaction?.primaryAnchorId || !stepAnchorIds.has(interaction.primaryAnchorId)) {
      issues.push(
        issue(
          'orphan-anchor-reference',
          `Question ${interactionId} is not linked to a flowchart blank step.`,
          interactionId,
        ),
      );
    }
  });

  return issues;
};

const validateDiagramLabelingTaskGroup = (
  document: ReadingV2Document,
  taskGroup: ReadingV2TaskGroup,
): readonly ReadingV2ValidationIssue[] => {
  if (taskGroup.officialTaskType !== 'diagram-labeling') {
    return [];
  }

  const diagramStimulus = taskGroup.stimulusRefs
    .map((stimulusRef) => document.stimuli[stimulusRef.stimulusId])
    .find((stimulus) => stimulus?.content.kind === 'diagram-content');

  if (!diagramStimulus || diagramStimulus.content.kind !== 'diagram-content') {
    return [
      issue(
        'invalid-packaged-material-assembly',
        'Diagram Labelling needs a diagram before publishing.',
        taskGroup.taskGroupId,
      ),
    ];
  }

  const issues: ReadingV2ValidationIssue[] = [];
  const hotspotAnchorIds = new Set<string>();

  if (!diagramStimulus.content.imageUrl?.trim()) {
    issues.push(
      issue(
        'invalid-packaged-material-assembly',
        'Diagram Labelling needs an image before publishing.',
        diagramStimulus.stimulusId,
      ),
    );
  }

  if (diagramStimulus.content.hotspots.length === 0) {
    issues.push(
      issue(
        'invalid-packaged-material-assembly',
        'Diagram Labelling needs at least one label target before publishing.',
        taskGroup.taskGroupId,
      ),
    );
  }

  diagramStimulus.content.hotspots.forEach((hotspot, index) => {
    hotspotAnchorIds.add(hotspot.anchorId);
    const anchor = document.anchors[hotspot.anchorId];
    if (!anchor || anchor.kind !== 'diagram-hotspot' || anchor.stimulusId !== diagramStimulus.stimulusId) {
      issues.push(
        issue(
          'orphan-anchor-reference',
          `Diagram label ${index + 1} is not linked to a valid diagram-hotspot anchor.`,
          hotspot.anchorId,
        ),
      );
    }
  });

  taskGroup.interactionIds.forEach((interactionId) => {
    const interaction = document.interactions[interactionId];
    if (!interaction?.primaryAnchorId || !hotspotAnchorIds.has(interaction.primaryAnchorId)) {
      issues.push(
        issue(
          'orphan-anchor-reference',
          `Question ${interactionId} is not linked to a diagram label target.`,
          interactionId,
        ),
      );
    }
  });

  return issues;
};

export const validateReadingV2Draft = (
  document: ReadingV2Document,
): ReadingV2ValidationResult => {
  const issues: ReadingV2ValidationIssue[] = [
    ...document.validationState.issues,
    ...Object.values(document.taskGroups).flatMap((taskGroup) => taskGroup.validationState.issues),
  ];

  try {
    assertValidReadingV2CanonicalDocument(document);
  } catch (error) {
    issues.push(
      issue(
        'invalid-packaged-material-assembly',
        error instanceof Error ? error.message : 'Reading V2 canonical document failed structural validation.',
        document.documentId,
      ),
    );
  }

  Object.values(document.stimuli).forEach((stimulus) => {
    if (stimulus.content.kind !== 'media-content') {
      return;
    }

    if (!stimulus.content.mediaUrl?.trim()) {
      issues.push(
        issue(
          'missing-media-source',
          `Image block ${stimulus.stimulusId} needs an image source before publishing.`,
          stimulus.stimulusId,
        ),
      );
    }

    if (!stimulus.content.alt.trim()) {
      issues.push(
        issue(
          'student-visible-structured-mismatch',
          `Image block ${stimulus.stimulusId} needs alt text before publishing.`,
          stimulus.stimulusId,
        ),
      );
    }
  });

  Object.values(document.taskGroups).forEach((taskGroup) => {
    if (taskGroup.stimulusRefs.length === 0) {
      issues.push(
        issue(
          'missing-primary-stimulus-reference',
          `Task group ${taskGroup.taskGroupId} must reference at least one stimulus before publish.`,
          taskGroup.taskGroupId,
        ),
      );
    }

    if (taskGroup.importEvidenceRefs && taskGroup.importEvidenceRefs.length > 0) {
      issues.push(
        issue(
          'unresolved-import-uncertainty',
          `Task group ${taskGroup.taskGroupId} still has unresolved import evidence.`,
          taskGroup.taskGroupId,
        ),
      );
    }

    issues.push(...validateNoteCompletionTaskGroup(document, taskGroup));
    issues.push(...validateTableCompletionTaskGroup(document, taskGroup));
    issues.push(...validateFlowchartCompletionTaskGroup(document, taskGroup));
    issues.push(...validateDiagramLabelingTaskGroup(document, taskGroup));

    const expectedStructuredKind = structuredEntryKindFor(taskGroup);
    if (expectedStructuredKind) {
      if (
        taskGroup.answerRule.responseShape.kind !== 'structured-entry'
        || taskGroup.answerRule.responseShape.structure !== expectedStructuredKind
      ) {
        issues.push(
          issue(
            'invalid-packaged-material-assembly',
            `${taskGroup.taskGroupId} answer rule must use ${expectedStructuredKind} structured-entry response shape.`,
            taskGroup.taskGroupId,
          ),
        );
      }
    }
  });

  Object.values(document.interactions).forEach((interaction) => {
    const parentTaskGroup = document.taskGroups[interaction.taskGroupId];
    if (interaction.placeholder === true) {
      issues.push(
        issue(
          'unresolved-draft-placeholder',
          `Interaction ${interaction.interactionId} is still a draft placeholder.`,
          interaction.interactionId,
        ),
      );
    }

    if (!hasScoringAnswer(interaction)) {
      issues.push(
        issue(
          'missing-scoring-response-shape',
          `Interaction ${interaction.interactionId} is missing a publishable answer key or scoring rule.`,
          interaction.interactionId,
        ),
      );
    }

    if (
      parentTaskGroup
      && COMPLETION_TASK_TYPES.has(parentTaskGroup.officialTaskType)
      && !visibleBlankPattern.test(interaction.promptText ?? '')
    ) {
      issues.push(
        issue(
          'missing-scoring-response-shape',
          `Interaction ${interaction.interactionId} needs a visible blank marker such as [blank] or ___.`,
          interaction.interactionId,
        ),
      );
    }

    if (interaction.responseShape.kind === 'free-text' && interaction.responseShape.wordLimit) {
      const wordLimit = interaction.responseShape.wordLimit;
      (interaction.scoringRule.acceptableAnswers ?? []).forEach((answer) => {
        if (answer.trim() && answerWordCount(answer) > wordLimit) {
          issues.push(
            issue(
              'invalid-packaged-material-assembly',
              `Interaction ${interaction.interactionId} answer exceeds the ${wordLimit} word limit.`,
              interaction.interactionId,
            ),
          );
        }
      });
    }

    if (parentTaskGroup) {
      const expectedStructuredKind = structuredEntryKindFor(parentTaskGroup);
      if (expectedStructuredKind) {
        if (
          interaction.responseShape.kind !== 'structured-entry'
          || interaction.responseShape.structure !== expectedStructuredKind
        ) {
          issues.push(
            issue(
              'invalid-packaged-material-assembly',
              `Interaction ${interaction.interactionId} must use ${expectedStructuredKind} structured-entry response shape.`,
              interaction.interactionId,
            ),
          );
        }
      }
    }

    if (interaction.responseShape.kind === 'multi-select') {
      const answerCount = interaction.scoringRule.acceptableAnswers?.filter((answer) => answer.trim().length > 0).length ?? 0;
      if (interaction.responseShape.selectionLimit < 1) {
        issues.push(
          issue(
            'missing-scoring-response-shape',
            `Interaction ${interaction.interactionId} needs a selection count of at least 1.`,
            interaction.interactionId,
          ),
        );
      } else if (answerCount > 0 && answerCount !== interaction.responseShape.selectionLimit) {
        issues.push(
          issue(
            'missing-scoring-response-shape',
            `Interaction ${interaction.interactionId} needs exactly ${interaction.responseShape.selectionLimit} correct answers.`,
            interaction.interactionId,
          ),
        );
      }

      if (interaction.scoringRule.orderMatters !== false) {
        issues.push(
          issue(
            'missing-scoring-response-shape',
            `Interaction ${interaction.interactionId} must set orderMatters to false for multi-select scoring.`,
            interaction.interactionId,
          ),
        );
      }
    }

    if (interaction.responseShape.kind === 'single-choice') {
      const answerCount = interaction.scoringRule.acceptableAnswers?.filter((answer) => answer.trim().length > 0).length ?? 0;
      const optionSet = document.optionSets[interaction.responseShape.optionSetId];
      const validOptionAnswers = optionAnswerKeys(optionSet);

      if (!optionSet || optionSet.options.length < 2) {
        issues.push(
          issue(
            'missing-scoring-response-shape',
            `Interaction ${interaction.interactionId} needs at least two answer options.`,
            interaction.interactionId,
          ),
        );
      }

      if (answerCount !== 1) {
        issues.push(
          issue(
            'missing-scoring-response-shape',
            `Interaction ${interaction.interactionId} needs exactly one correct answer.`,
            interaction.interactionId,
          ),
        );
      }

      (interaction.scoringRule.acceptableAnswers ?? []).forEach((answer) => {
        if (answer.trim() && !validOptionAnswers.has(optionAnswerKey(answer))) {
          issues.push(
            issue(
              'invalid-packaged-material-assembly',
              `Interaction ${interaction.interactionId} has a correct answer that is not in its option list.`,
              interaction.interactionId,
            ),
          );
        }
      });
    }

    if (interaction.responseShape.kind === 'multi-select') {
      const optionSet = document.optionSets[interaction.responseShape.optionSetId];
      const validOptionAnswers = optionAnswerKeys(optionSet);

      if (!optionSet || optionSet.options.length < 2) {
        issues.push(
          issue(
            'missing-scoring-response-shape',
            `Interaction ${interaction.interactionId} needs at least two answer options.`,
            interaction.interactionId,
          ),
        );
      }

      (interaction.scoringRule.acceptableAnswers ?? []).forEach((answer) => {
        if (answer.trim() && !validOptionAnswers.has(optionAnswerKey(answer))) {
          issues.push(
            issue(
              'invalid-packaged-material-assembly',
              `Interaction ${interaction.interactionId} has a correct answer that is not in its option list.`,
              interaction.interactionId,
            ),
          );
        }
      });
    }

    if (interaction.responseShape.kind === 'matching') {
      const answerCount = interaction.scoringRule.acceptableAnswers?.filter((answer) => answer.trim().length > 0).length ?? 0;
      const optionSet = document.optionSets[interaction.responseShape.optionSetId];
      const validOptionAnswers = optionAnswerKeys(optionSet);

      if (!optionSet || optionSet.options.length < 2) {
        issues.push(
          issue(
            'missing-scoring-response-shape',
            `Interaction ${interaction.interactionId} needs a matching option bank.`,
            interaction.interactionId,
          ),
        );
      }

      if (answerCount !== 1) {
        issues.push(
          issue(
            'missing-scoring-response-shape',
            `Interaction ${interaction.interactionId} needs exactly one matching answer.`,
            interaction.interactionId,
          ),
        );
      }

      (interaction.scoringRule.acceptableAnswers ?? []).forEach((answer) => {
        if (answer.trim() && !validOptionAnswers.has(optionAnswerKey(answer))) {
          issues.push(
            issue(
              'invalid-packaged-material-assembly',
              `Interaction ${interaction.interactionId} has a matching answer that is not in its option list.`,
              interaction.interactionId,
            ),
          );
        }
      });
    }

    if (interaction.responseShape.kind === 'binary-judgement') {
      const answerCount = interaction.scoringRule.acceptableAnswers?.filter((answer) => answer.trim().length > 0).length ?? 0;
      const vocabulary = interaction.responseShape.vocabulary;

      if (answerCount !== 1) {
        issues.push(
          issue(
            'missing-scoring-response-shape',
            `Interaction ${interaction.interactionId} needs exactly one judgement answer.`,
            interaction.interactionId,
          ),
        );
      }

      (interaction.scoringRule.acceptableAnswers ?? []).forEach((answer) => {
        if (answer.trim() && !canonicalizeReadingV2JudgementAnswer(answer, vocabulary)) {
          issues.push(
            issue(
              'invalid-packaged-material-assembly',
              `Interaction ${interaction.interactionId} uses the wrong judgement vocabulary.`,
              interaction.interactionId,
            ),
          );
        }
      });
    }
  });

  Object.values(document.taskGroups).forEach((taskGroup) => {
    const matchingInteractions = taskGroup.interactionIds
      .map((interactionId) => document.interactions[interactionId])
      .filter((interaction): interaction is ReadingV2Interaction => interaction?.responseShape.kind === 'matching');
    const reuseDisallowed = matchingInteractions.some((interaction) =>
      interaction.responseShape.kind === 'matching' && interaction.responseShape.optionReuse !== 'allowed',
    );

    if (reuseDisallowed) {
      const usedAnswers = new Set<string>();
      matchingInteractions.forEach((interaction) => {
        (interaction.scoringRule.acceptableAnswers ?? []).forEach((answer) => {
          const key = answerKey(answer);
          if (!key) {
            return;
          }
          if (usedAnswers.has(key)) {
            issues.push(
              issue(
                'invalid-packaged-material-assembly',
                `${taskGroup.taskGroupId} cannot reuse matching answer ${answer}.`,
                interaction.interactionId,
              ),
            );
          }
          usedAnswers.add(key);
        });
      });
    }
  });

  const derivedNumbers = deriveReadingV2VisibleNumbers(orderedTaskGroups(document), document.interactions);
  const duplicateNumbers = new Set<number>();
  const seenNumbers = new Set<number>();
  const explicitDuplicateNumbers = new Set<number>();
  const explicitSeenNumbers = new Set<number>();

  Object.values(document.interactions).forEach((interaction) => {
    const displayNumber = interaction.reviewLabel.displayNumber;
    if (typeof displayNumber !== 'number' || !Number.isFinite(displayNumber)) {
      return;
    }

    if (explicitSeenNumbers.has(displayNumber)) {
      explicitDuplicateNumbers.add(displayNumber);
    }
    explicitSeenNumbers.add(displayNumber);
  });

  derivedNumbers.forEach((entry) => {
    if (seenNumbers.has(entry.displayNumber)) {
      duplicateNumbers.add(entry.displayNumber);
    }
    seenNumbers.add(entry.displayNumber);
  });

  explicitDuplicateNumbers.forEach((displayNumber) => {
    issues.push(
      issue(
        'duplicate-numbering',
        `Visible Reading V2 question number ${displayNumber} is duplicated in imported review labels.`,
        document.documentId,
      ),
    );
  });

  duplicateNumbers.forEach((displayNumber) => {
    issues.push(
      issue(
        'duplicate-numbering',
        `Visible Reading V2 question number ${displayNumber} is duplicated after derivation.`,
        document.documentId,
      ),
    );
  });

  const blockingIssues = issues.filter((candidate) => candidate.severity === 'error');
  const warningIssues = issues.filter((candidate) => candidate.severity === 'warning');
  const informationalIssues = issues.filter((candidate) => candidate.severity === 'info');

  return {
    issues,
    blockingIssues,
    warningIssues,
    informationalIssues,
    canPublish: !isReadingV2PublishBlocked(issues),
  };
};

export const assertReadingV2PublishGate = (
  document: ReadingV2Document,
): ReadingV2ValidationResult => {
  const result = validateReadingV2Draft(document);

  if (!result.canPublish) {
    throw new ReadingV2PublishGateError(result);
  }

  return result;
};
