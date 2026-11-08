import { describe, expect, it } from 'vitest';
import { createReadingV2CanonicalFixture } from './fixtures/readingV2CanonicalFixtures';
import { mapReadingV2AuthoringFindingsToReviewIssues } from './readingV2ReviewIssueMapping.service';
import type { ReadingV2AuthoringFinding } from './readingV2AuthoringQuality.service';

const document = createReadingV2CanonicalFixture('sentence-completion');
const group = Object.values(document.taskGroups)[0]!;
const firstId = group.interactionIds[0]!;
const secondId = group.interactionIds[1]!;
const finding: ReadingV2AuthoringFinding = {
  id: `answer:${secondId}`, code: 'answer-required', severity: 'error', blocking: true,
  message: 'Question 40 needs an answer.', target: { interactionId: secondId }, action: 'edit',
};

describe('current authoring finding presentation', () => {
  it('shows the source-rule correction once and retains an independently invalid answer after that correction', () => {
    const keyIssue: ReadingV2AuthoringFinding = { ...finding, code: 'completion-answer-rule-mismatch',
      target: { interactionId: secondId, taskGroupId: group.taskGroupId, field: 'answer' } };
    const sourceIssue: ReadingV2AuthoringFinding = { ...finding, id: 'source-rule', code: 'source-instruction-mismatch',
      target: { taskGroupId: group.taskGroupId, sourceRequirementId: 'source-rule' }, action: 'interpret' };
    expect(mapReadingV2AuthoringFindingsToReviewIssues([keyIssue, sourceIssue], document).map((entry) => entry.id)).toEqual(['source-rule']);
    expect(mapReadingV2AuthoringFindingsToReviewIssues([keyIssue], document)).toEqual([expect.objectContaining({ id: keyIssue.id, actionLabel: 'Edit answer' })]);
  });
  it('keeps stable identity and target when display numbering changes', () => {
    const [before] = mapReadingV2AuthoringFindingsToReviewIssues([finding], document);
    const changed = { ...document, taskGroups: { ...document.taskGroups, [group.taskGroupId]: { ...group, interactionIds: [secondId] } } };
    const [after] = mapReadingV2AuthoringFindingsToReviewIssues([finding], changed);
    expect(before).toMatchObject({ id: finding.id, label: 'Question 2', target: { interactionId: secondId, questionRange: { start: 2, end: 2 } } });
    expect(after).toMatchObject({ id: finding.id, label: 'Question 1', target: { interactionId: secondId, questionRange: { start: 1, end: 1 } } });
    expect(after?.target.interactionId).not.toBe(firstId);
  });

  it('never infers target or publication effect from diagnostic prose', () => {
    const [issue] = mapReadingV2AuthoringFindingsToReviewIssues([{ ...finding, blocking: false, severity: 'warning', target: { sourceRequirementId: 'missing-original' } }], document);
    expect(issue).toMatchObject({ severity: 'needs-review', label: 'Supplied content', target: { sourceRequirementId: 'missing-original' } });
    expect(issue?.target.interactionId).toBeUndefined();
    expect(issue?.target.questionRange).toBeUndefined();
  });

  it('presents a wrong bank association as a source association issue', () => {
    const [issue] = mapReadingV2AuthoringFindingsToReviewIssues([{
      id: 'source-bank-association-invalid:bank-1',
      code: 'source-bank-association-invalid',
      severity: 'error',
      blocking: true,
      message: 'The supplied answer bank is linked to an incompatible question group.',
      target: { sourceRequirementId: 'bank-1', taskGroupId: group.taskGroupId },
      action: 'link',
    }], document);

    expect(issue).toMatchObject({
      type: 'source-bank-association-invalid',
      source: 'source-comparison',
      detail: 'Wrong answer bank association',
      action: 'link',
      target: { sourceRequirementId: 'bank-1', taskGroupId: group.taskGroupId },
    });
  });
});
