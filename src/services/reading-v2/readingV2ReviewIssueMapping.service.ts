import type { ReadingV2Document } from '../../types/readingV2.types';
import { deriveReadingV2VisibleNumbers } from './readingV2Numbering.service';
import type { ReadingV2AuthoringFinding } from './readingV2AuthoringQuality.service';

export type ReadingV2ReviewIssueSeverity = 'publish-blocker' | 'needs-review' | 'info';
export type ReadingV2ReviewIssueSource = 'answer-key' | 'question-text' | 'source-comparison' | 'layout' | 'validation' | 'import-review';
export interface ReadingV2ReviewIssueTarget {
  readonly questionRange?: { readonly start: number; readonly end: number };
  readonly passageNumber?: number;
  readonly sectionId?: string;
  readonly stimulusId?: string;
  readonly taskGroupId?: string;
  readonly interactionId?: string;
  readonly anchorId?: string;
  readonly field?: string;
  readonly sourceRequirementId?: string;
  readonly sourcePassageNumber?: number;
}
export interface ReadingV2ReviewIssue {
  readonly id: string;
  readonly severity: ReadingV2ReviewIssueSeverity;
  readonly source: ReadingV2ReviewIssueSource;
  readonly type: string;
  readonly label: string;
  readonly detail: string;
  readonly target: ReadingV2ReviewIssueTarget;
  readonly originalMessage: string;
  readonly sourceExcerpt?: string;
  readonly actionLabel?: string;
  readonly action?: ReadingV2AuthoringFinding['action'];
}

export const mapReadingV2AuthoringFindingsToReviewIssues = (
  findings: readonly ReadingV2AuthoringFinding[],
  document: ReadingV2Document,
): readonly ReadingV2ReviewIssue[] => {
  const groups = document.sectionIds.flatMap((id) => document.sections[id]?.taskGroupIds.flatMap((id) => document.taskGroups[id] ?? []) ?? []);
  const numbers = deriveReadingV2VisibleNumbers(groups, document.interactions);
  const correctiveFindings = findings.filter((finding) => {
    if (finding.code === 'completion-answer-rule-mismatch' && findings.some((other) => other.code === 'source-instruction-mismatch'
      && other.target.taskGroupId === finding.target.taskGroupId)) return false;
    if (finding.code === 'source-answer-slot-missing' && findings.some((other) => other.code === 'source-question-missing'
      && (finding.target.interactionId ? other.target.interactionId === finding.target.interactionId
        : other.target.sourceRequirementId === finding.target.sourceRequirementId?.replace(':slot:', ':question:')))) return false;
    if (finding.code.startsWith('option-text-required:') && findings.some((other) => other.code === 'source-bank-mismatch'
      && other.target.taskGroupId === finding.target.taskGroupId)) return false;
    return true;
  });
  return correctiveFindings.map((finding) => {
    const interaction = finding.target.interactionId ? document.interactions[finding.target.interactionId] : undefined;
    const taskGroupId = finding.target.taskGroupId ?? interaction?.taskGroupId;
    const taskGroup = taskGroupId ? document.taskGroups[taskGroupId] : undefined;
    const sectionId = finding.target.sectionId ?? taskGroup?.sectionId;
    const passageIndex = document.sectionIds.findIndex((id) => id === sectionId
      || (finding.target.stimulusId && document.sections[id]?.stimulusIds.some((id) => id === finding.target.stimulusId)));
    const displayNumbers = numbers.filter((number) => finding.target.interactionId
      ? number.interactionId === finding.target.interactionId
      : taskGroup?.interactionIds.includes(number.interactionId));
    const first = displayNumbers[0]?.displayNumber;
    const last = displayNumbers.at(-1)?.displayNumberEnd ?? displayNumbers.at(-1)?.displayNumber;
    const questionRange = first !== undefined && last !== undefined ? { start: first, end: last } : undefined;
    const answer = finding.target.field === 'answer' || ['answer-required', 'source-answer-slot-missing'].includes(finding.code);
    const title = /title/.test(finding.code);
    const label = questionRange ? first === last ? `Question ${first}` : `Questions ${first}-${last}`
      : passageIndex >= 0 ? `Passage ${passageIndex + 1}` : finding.target.sourceRequirementId ? 'Supplied content' : 'Test';
    const sourceDetails: Record<string, string> = {
      'source-question-missing': 'Question needed',
      'source-question-association-invalid': 'Wrong passage association',
      'source-answer-slot-missing': 'Answer slot needed',
      'source-answer-key-unbound': 'Answer key row needs review',
      'source-answer-key-invalid': 'Answer key row needs review',
      'source-instruction-mismatch': 'Review imported instruction',
      'source-passage-missing': 'Passage needed',
      'source-passage-incomplete': 'Restore passage text',
      'source-bank-missing': 'Answer bank needed',
      'source-bank-mismatch': 'Approve or edit answer bank',
      'source-bank-association-invalid': 'Wrong answer bank association',
      'source-content-unbound': 'Link supplied content',
      'source-task-type-mismatch': 'Check question type',
      'source-unavailable': 'Source unavailable',
      'completion-answer-rule-mismatch': 'Check answer rule',
      'question-group-required': 'Question group needed',
    };
    const detail = sourceDetails[finding.code] ?? (answer ? 'Answer needed' : title ? 'Title needed'
      : finding.target.field === 'question' && finding.code === 'missing-scoring-response-shape' ? 'Blank needed'
      : /prompt|question-text/.test(finding.code) ? 'Question text needed'
      : /passage.*text|passage.*content/.test(finding.code) ? 'Passage text needed'
      : 'Needs attention');
    const message = finding.message
      .replace(/\bInteraction\s+\S+/gi, label)
      .replace(/canonical draft/gi, 'draft')
      .replace(/canonical/gi, 'test')
      .replace(/task group/gi, 'question group')
      .replace(/stimulus/gi, 'passage')
      .replace(/draft placeholder/gi, 'unfinished question');
    return {
      id: finding.id,
      severity: finding.blocking ? 'publish-blocker' : finding.severity === 'info' ? 'info' : 'needs-review',
      source: finding.target.sourceRequirementId ? 'source-comparison' : answer ? 'answer-key' : 'validation',
      type: finding.code,
      label,
      detail,
      target: { ...finding.target, sectionId, taskGroupId, questionRange, sourcePassageNumber: finding.target.sourcePassageNumber, field: /source-bank/.test(finding.code) ? 'options' : answer ? 'answer' : title ? 'title' : finding.target.field },
      originalMessage: message,
      sourceExcerpt: finding.sourceExcerpt,
      action: finding.action,
      actionLabel: finding.action === 'exclude' ? 'Resolve answer-key row' : /source-bank/.test(finding.code) ? 'Edit answer choices' : finding.action === 'add' && !finding.target.sourceRequirementId ? 'Add Question Group'
        : finding.action === 'edit' ? answer ? 'Edit answer' : title && passageIndex < 0 ? 'Edit test title' : passageIndex >= 0 && !taskGroupId ? 'Edit passage' : 'Edit question' : undefined,
    };
  });
};
