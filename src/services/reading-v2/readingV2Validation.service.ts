import {
  type ReadingV2Document,
  type ReadingV2Interaction,
  type ReadingV2PublishBlockCode,
  type ReadingV2TaskGroup,
  type ReadingV2ValidationIssue,
} from '../../types/readingV2.types';
import {
  assertValidReadingV2CanonicalDocument,
  isReadingV2PublishBlocked,
} from './readingV2ContractGuards.service';
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

const orderedTaskGroups = (document: ReadingV2Document): ReadingV2TaskGroup[] =>
  document.sectionIds.flatMap((sectionId) => {
    const section = document.sections[sectionId];
    return section
      ? section.taskGroupIds
          .map((taskGroupId) => document.taskGroups[taskGroupId])
          .filter((taskGroup): taskGroup is ReadingV2TaskGroup => taskGroup !== undefined)
      : [];
  });

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
  });

  Object.values(document.interactions).forEach((interaction) => {
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
  });

  const derivedNumbers = deriveReadingV2VisibleNumbers(orderedTaskGroups(document), document.interactions);
  const duplicateNumbers = new Set<number>();
  const seenNumbers = new Set<number>();

  derivedNumbers.forEach((entry) => {
    if (seenNumbers.has(entry.displayNumber)) {
      duplicateNumbers.add(entry.displayNumber);
    }
    seenNumbers.add(entry.displayNumber);
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
