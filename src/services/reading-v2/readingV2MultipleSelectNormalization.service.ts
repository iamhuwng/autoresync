import type { ReadingV2Document } from '../../types/readingV2.types';

// Repair editable copies only: published snapshots and their answer bindings stay immutable.
export const normalizeReadingV2MultipleSelectSlots = (document: ReadingV2Document): ReadingV2Document => {
  let result = document;
  for (const group of Object.values(document.taskGroups)) {
    if (group.officialTaskType !== 'multiple-select') continue;
    const entries = group.interactionIds.map((id) => document.interactions[id]);
    const first = entries[0];
    if (!first || first.responseShape.kind !== 'multi-select' || entries.length < 2
      || entries.length !== first.responseShape.selectionLimit) continue;
    const start = first.reviewLabel.displayNumber;
    const options = document.optionSets[first.responseShape.optionSetId]?.options;
    const prompt = first.promptText?.replace(/\s+/g, ' ').trim();
    if (!Number.isInteger(start) || !options?.length || !prompt) continue;
    const optionSignature = JSON.stringify(options.map(({ label, text }) => [label, text]));
    const answers = new Set<string>();
    const compatible = entries.every((entry, index) => {
      if (!entry || entry.placeholder || entry.reviewLabel.answerSlotCount !== undefined
        || entry.reviewLabel.displayNumber !== start! + index
        || entry.taskGroupId !== group.taskGroupId
        || entry.scoringRule.maxScore !== 1
        || entry.responseShape.kind !== 'multi-select'
        || entry.responseShape.selectionLimit !== entries.length
        || (entry.promptText?.replace(/\s+/g, ' ').trim() || prompt) !== prompt
        || entry.scoringRule.caseSensitive !== first.scoringRule.caseSensitive
        || entry.scoringRule.punctuationSensitive !== first.scoringRule.punctuationSensitive) return false;
      const entryOptions = document.optionSets[entry.responseShape.optionSetId]?.options;
      if (!entryOptions || JSON.stringify(entryOptions.map(({ label, text }) => [label, text])) !== optionSignature
        || !entry.scoringRule.acceptableAnswers?.length) return false;
      return entry.scoringRule.acceptableAnswers.every((answer) => {
        const option = entryOptions.find(({ optionId, label }) => optionId === answer || label === answer);
        if (!option) return false;
        answers.add(option.label);
        return true;
      });
    });
    if (!compatible || answers.size !== entries.length) continue;
    const contextAnchorIds = Array.from(new Set(entries.flatMap((entry) => [
      ...(entry.primaryAnchorId ? [entry.primaryAnchorId] : []),
      ...(entry.contextAnchorIds ?? []),
    ]))).filter((anchorId) => anchorId !== first.primaryAnchorId);
    const interactions = { ...result.interactions };
    entries.slice(1).forEach((entry) => { delete interactions[entry.interactionId]; });
    interactions[first.interactionId] = {
      ...first,
      reviewLabel: { ...first.reviewLabel, answerSlotCount: entries.length },
      scoringRule: { ...first.scoringRule, maxScore: entries.length, acceptableAnswers: [...answers], orderMatters: false },
      ...(contextAnchorIds.length ? { contextAnchorIds } : {}),
    };
    result = {
      ...result,
      interactions,
      taskGroups: { ...result.taskGroups, [group.taskGroupId]: { ...group, interactionIds: [first.interactionId] } },
    };
  }
  return result;
};
