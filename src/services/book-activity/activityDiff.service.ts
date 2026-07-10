import type {
  BookActivityChangeClassification,
  BookActivityEditableAnswerRule,
  BookActivityVersionRecord,
} from '../../types/bookActivity.types';
import { interactionStructureSignature } from './activitySchema.service';

export interface BookActivityChangeResult {
  readonly classification: BookActivityChangeClassification;
  readonly reasons: readonly string[];
}

const sameJson = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

const answerRuleWithoutRubric = (rule: BookActivityEditableAnswerRule) => ({
  type: rule.type,
  correctChoiceIndexes: rule.correctChoiceIndexes ?? null,
  acceptableAnswers: rule.acceptableAnswers ?? null,
  matchingPairs: rule.matchingPairs ?? null,
  ordering: rule.ordering ?? null,
});

export const classifyActivityChange = (
  oldVersion: BookActivityVersionRecord,
  newVersion: BookActivityVersionRecord,
): BookActivityChangeResult => {
  const oldContent = oldVersion.content;
  const newContent = newVersion.content;
  const reasons: string[] = [];

  const oldInteractionSignatures = oldContent.interactions.map(interactionStructureSignature);
  const newInteractionSignatures = newContent.interactions.map(interactionStructureSignature);

  if (!sameJson(oldInteractionSignatures, newInteractionSignatures)) {
    reasons.push('interaction structure, prompt, choices, source metadata, or order changed');
    return { classification: 'redo-required', reasons };
  }

  if (oldContent.contextRequirement !== newContent.contextRequirement) {
    reasons.push('context requirement changed');
    return { classification: 'redo-required', reasons };
  }

  if ((oldContent.scoring?.points ?? null) !== (newContent.scoring?.points ?? null)) {
    reasons.push('point value changed');
    return { classification: 'recalculate-no-redo', reasons };
  }

  if (!sameJson(answerRuleWithoutRubric(oldContent.answerRule), answerRuleWithoutRubric(newContent.answerRule))) {
    reasons.push('answer key changed');
    return { classification: 'regrade-no-redo', reasons };
  }

  if ((oldContent.answerRule.rubric ?? oldContent.scoring?.rubric ?? null) !==
    (newContent.answerRule.rubric ?? newContent.scoring?.rubric ?? null)) {
    reasons.push('rubric changed');
    return { classification: 'teacher-regrade-no-redo', reasons };
  }

  return {
    classification: 'no-redo',
    reasons: ['metadata, title, instruction, or formatting-only change'],
  };
};
