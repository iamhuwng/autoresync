import type { ReadingV2Document, ReadingV2TaskGroup, ReadingV2ValidationIssue } from '../../types/readingV2.types';
import type { ReadingV2CanonicalTaskType } from '../../types/readingV2Taxonomy';
import { getReadingV2AuthoringSourceText, parseReadingV2TeacherAnswerKey, type ReadingV2ImportCandidate, type ReadingV2TeacherAnswerKeyPayload } from './readingV2ImportNormalization.service';
import { buildReadingV2AutoSourceLedger, isReadingV2SourceAnswerKeyHeading, readReadingV2SourceBank, type ReadingV2AutoSourceReferenceBankKind } from './readingV2AutoImportSourceLedger.service';
import { readingV2TaskNeedsOptionSet } from './readingV2TaskComponentContracts.service';
import { validateReadingV2Draft, type ReadingV2ValidationResult } from './readingV2Validation.service';
import { readReadingV2InstructionFacts, type ReadingV2InstructionFacts } from './readingV2InstructionTemplates.service';
import { setReadingV2MultipleSelectCount } from './readingV2MultipleSelectNormalization.service';

export interface ReadingV2FindingTarget {
  readonly sectionId?: string;
  readonly stimulusId?: string;
  readonly taskGroupId?: string;
  readonly interactionId?: string;
  readonly anchorId?: string;
  readonly sourceRequirementId?: string;
  readonly sourcePassageNumber?: number;
  readonly sourceSectionId?: string;
  readonly answerSlotIndex?: number;
  readonly field?: 'answer' | 'question' | 'options' | 'passage' | 'instruction';
}

export interface ReadingV2AuthoringSourceRecord {
  readonly kind: 'reading-v2-import-source';
  readonly schemaVersion: 1;
  readonly sourceId: string;
  readonly ownerId: string;
  readonly createdAt: string;
  readonly sourceKind: ReadingV2ImportCandidate['sourceKind'];
  readonly fileName?: string;
  readonly supportedFileType?: 'txt' | 'docx' | 'pdf';
  readonly rawText: string;
  readonly lineIndex: readonly {
    readonly lineId: string;
    readonly lineNumber: number;
    readonly rawText: string;
    readonly normalizedText: string;
  }[];
  /** Supplied marking evidence is retained separately from the pasted source body. */
  readonly teacherAnswerKey?: ReadingV2TeacherAnswerKeyPayload;
  readonly autoImportDiagnostics?: ReadingV2ImportCandidate['autoImportDiagnostics'];
}

export interface ReadingV2SourceRequirement {
  readonly requirementId: string;
  readonly kind: 'passage' | 'question' | 'answer-slot' | 'answer-key' | 'instruction' | 'bank';
  readonly sourceId: string;
  readonly lineIds: readonly string[];
  readonly target?: ReadingV2FindingTarget;
  readonly expectedTaskType?: ReadingV2CanonicalTaskType;
  readonly answerSlotIndex?: number;
  readonly sourcePassageNumber?: number;
  readonly sourceSectionId?: string;
  readonly sourceQuestionNumber?: number;
  readonly answerKeyStatus?: 'unbound' | 'bound' | 'invalid' | 'duplicate';
  readonly answerKeyDiagnostics?: readonly string[];
  readonly sourceText?: string;
  readonly instructionFacts?: ReadingV2InstructionFacts;
  readonly passageNeedsComparison?: boolean;
  readonly bankItems?: readonly { readonly label: string; readonly text: string; readonly optionId?: string }[];
}

export interface ReadingV2SourceInterpretation {
  readonly requirementId: string;
  readonly taskType?: ReadingV2CanonicalTaskType;
  readonly bankItems?: ReadingV2SourceRequirement['bankItems'];
  readonly instructionFacts?: ReadingV2InstructionFacts;
  readonly answerKeyResolution?: 'outside-scope' | 'authored-answer';
  readonly actorId: string;
  readonly updatedAt: string;
}

export interface ReadingV2AuthoringContext {
  readonly origin: { readonly kind: 'manual' }
    | { readonly kind: 'import'; readonly sourceId: string }
    | { readonly kind: 'published'; readonly materialId: string; readonly snapshotVersionId: string };
  readonly scope: { readonly kind: 'supplied' | 'selected'; readonly requirementIds: readonly string[] };
  readonly requirements: readonly ReadingV2SourceRequirement[];
  readonly interpretations: readonly ReadingV2SourceInterpretation[];
  readonly unboundTargets: readonly ReadingV2FindingTarget[];
}

export interface ReadingV2AuthoringFinding {
  readonly id: string;
  readonly code: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly blocking: boolean;
  readonly target: ReadingV2FindingTarget;
  readonly action: 'edit' | 'add' | 'link' | 'interpret' | 'exclude';
  readonly sourceExcerpt?: string;
}

export interface ReadingV2AuthoringReadiness {
  readonly findings: readonly ReadingV2AuthoringFinding[];
  readonly blockingFindings: readonly ReadingV2AuthoringFinding[];
  readonly canPublish: boolean;
  readonly validationResult: ReadingV2ValidationResult;
}

const normalized = (text: string): string => text.normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase();

const passageTextCovered = (current: string, sourceLines: readonly string[], title?: string): boolean => {
  const text = normalized(current);
  return sourceLines.some((line) => normalized(line) && normalized(line) !== normalized(title ?? ''))
    && sourceLines.every((line) => !normalized(line) || normalized(line) === normalized(title ?? '') || text.includes(normalized(line)));
};

const bankTaskTypes: Partial<Record<ReadingV2AutoSourceReferenceBankKind, ReadingV2CanonicalTaskType>> = {
  'people-list': 'matching-features', 'headings-list': 'matching-headings',
  'matching-endings': 'matching-sentence-endings', 'paragraph-labels': 'matching-information',
};

export const getReadingV2SourceBankTargets = (
  document: ReadingV2Document, requirement: ReadingV2SourceRequirement,
): readonly { readonly group: ReadingV2TaskGroup; readonly matchesSource: boolean }[] => requirement.kind !== 'bank' ? []
  : Object.values(document.taskGroups)
    .filter((group) => readingV2TaskNeedsOptionSet(group.officialTaskType)
      && (!requirement.sourceSectionId || requirement.sourceSectionId === group.sectionId)
      && (!requirement.expectedTaskType || requirement.expectedTaskType === group.officialTaskType))
    .map((group) => {
      const options = group.optionSetRefs.flatMap((id) => document.optionSets[id]?.options ?? []);
      return { group, matchesSource: Boolean(requirement.bankItems?.length && requirement.bankItems.every((item) => options.some((option) =>
        item.optionId === option.optionId || (normalized(item.label) === normalized(option.label) && normalized(item.text) === normalized(option.text))))) };
    });

export const createReadingV2ManualAuthoringContext = (): ReadingV2AuthoringContext => ({
  origin: { kind: 'manual' }, scope: { kind: 'supplied', requirementIds: [] },
  requirements: [], interpretations: [], unboundTargets: [],
});

const currentInstructionFacts = (document: ReadingV2Document, group: ReadingV2TaskGroup): ReadingV2InstructionFacts => {
  const shape = group.answerRule.responseShape;
  const displayed = readReadingV2InstructionFacts(group.instructionBlocks.map((block) => block.text).join('\n'));
  return {
    ...(group.answerRule.wordLimit !== undefined ? { wordLimit: group.answerRule.wordLimit }
      : shape.kind === 'free-text' && shape.wordLimit !== undefined ? { wordLimit: shape.wordLimit } : {}),
    ...(displayed.numberAllowance ? { numberAllowance: displayed.numberAllowance } : {}),
    ...(shape.kind === 'multi-select' ? { selectionLimit: shape.selectionLimit } : shape.kind === 'single-choice' ? { selectionLimit: 1 } : {}),
    ...(shape.kind === 'binary-judgement' ? { vocabulary: shape.vocabulary } : {}),
    ...(group.answerRule.optionReuse ? { optionReuse: group.answerRule.optionReuse }
      : shape.kind === 'matching' ? { optionReuse: shape.optionReuse } : {}),
  };
};

const instructionFactsMatch = (document: ReadingV2Document, group: ReadingV2TaskGroup, facts: ReadingV2InstructionFacts): boolean => {
  const actual = currentInstructionFacts(document, group);
  return Object.entries(facts).every(([key, value]) => actual[key as keyof ReadingV2InstructionFacts] === value)
    && group.interactionIds.every((id) => {
      const shape = document.interactions[id]?.responseShape;
      return shape && (shape.kind !== 'free-text' || facts.wordLimit === undefined || shape.wordLimit === facts.wordLimit)
        && (shape.kind !== 'binary-judgement' || !facts.vocabulary || shape.vocabulary === facts.vocabulary)
        && (facts.selectionLimit === undefined || (shape.kind === 'multi-select' ? shape.selectionLimit === facts.selectionLimit : shape.kind === 'single-choice' && facts.selectionLimit === 1))
        && (shape.kind !== 'matching' || !facts.optionReuse || shape.optionReuse === facts.optionReuse);
    });
};

export const createReadingV2AuthoringSourceRecord = (input: {
  readonly sourceId: string; readonly ownerId: string; readonly createdAt: string; readonly candidate: ReadingV2ImportCandidate;
}): ReadingV2AuthoringSourceRecord => {
  if (!input.sourceId || !input.ownerId || !input.createdAt) throw new Error('Reading V2 source requires its attempt, owner and creation time.');
  const candidate = input.candidate;
  const rawText = candidate.importSourceArtifact?.rawTextOriginal ?? candidate.sourceRawText ?? candidate.rawText ?? '';
  return {
    kind: 'reading-v2-import-source', schemaVersion: 1, sourceId: input.sourceId,
    ownerId: input.ownerId, createdAt: input.createdAt, sourceKind: candidate.sourceKind,
    ...(candidate.fileName ? { fileName: candidate.fileName } : {}),
    ...(candidate.supportedFileType ? { supportedFileType: candidate.supportedFileType } : {}),
    rawText, lineIndex: candidate.importSourceArtifact?.lineIndex ?? buildReadingV2AutoSourceLedger({ rawText: getReadingV2AuthoringSourceText(candidate) }).lineIndex,
    ...(candidate.teacherAnswerKey || candidate.answerKeyText !== undefined
      ? { teacherAnswerKey: candidate.teacherAnswerKey ?? parseReadingV2TeacherAnswerKey(candidate.answerKeyText) } : {}),
    ...(candidate.autoImportDiagnostics ? { autoImportDiagnostics: candidate.autoImportDiagnostics } : {}),
  };
};

const targetExists = (document: ReadingV2Document, target: ReadingV2FindingTarget | undefined): boolean => Boolean(target && (
  target.interactionId ? document.interactions[target.interactionId]
    : target.taskGroupId ? document.taskGroups[target.taskGroupId]
      : target.stimulusId ? document.stimuli[target.stimulusId]
        : target.sectionId ? document.sections[target.sectionId] : false
));

const targetKey = (target: ReadingV2FindingTarget): string => target.interactionId ?? target.taskGroupId ?? target.stimulusId ?? target.sectionId ?? '';

const targetMatchesSourcePassage = (
  document: ReadingV2Document,
  target: ReadingV2FindingTarget | undefined,
  expectedSectionId: string | undefined,
): boolean => {
  if (!expectedSectionId || !target) return true;
  if (target.interactionId) return document.taskGroups[document.interactions[target.interactionId]?.taskGroupId ?? '']?.sectionId === expectedSectionId;
  if (target.taskGroupId) return document.taskGroups[target.taskGroupId]?.sectionId === expectedSectionId;
  if (target.stimulusId) return document.sections[expectedSectionId]?.stimulusIds.includes(target.stimulusId as never) ?? false;
  return target.sectionId === expectedSectionId;
};

const targetForInteraction = (document: ReadingV2Document, interactionId: string): ReadingV2FindingTarget => {
  const interaction = document.interactions[interactionId];
  const group = interaction && document.taskGroups[interaction.taskGroupId];
  return { interactionId, ...(group ? { taskGroupId: group.taskGroupId, sectionId: group.sectionId } : {}) };
};

const targetForIssue = (document: ReadingV2Document, issue: ReadingV2ValidationIssue): ReadingV2FindingTarget => {
  const id = issue.objectId ?? '';
  if (document.interactions[id]) return targetForInteraction(document, id);
  if (document.taskGroups[id]) return { taskGroupId: id, sectionId: document.taskGroups[id].sectionId };
  if (document.stimuli[id]) return { stimulusId: id, sectionId: document.sectionIds.find((sectionId) => document.sections[sectionId].stimulusIds.includes(id as never)) };
  if (document.anchors[id]) return { anchorId: id, stimulusId: document.anchors[id].stimulusId };
  return {};
};

export const createReadingV2ImportAuthoringContext = (input: {
  readonly sourceId: string; readonly candidate: ReadingV2ImportCandidate; readonly document: ReadingV2Document;
}): ReadingV2AuthoringContext => {
  const { sourceId, candidate, document } = input;
  const ledger = buildReadingV2AutoSourceLedger({ rawText: getReadingV2AuthoringSourceText(candidate) });
  const requirements: ReadingV2SourceRequirement[] = [];
  const lineIdAt = (lineNumber: number): string => ledger.lineIndex.find((line) => line.lineNumber === lineNumber)?.lineId ?? `line-${lineNumber}`;
  const add = (requirement: Omit<ReadingV2SourceRequirement, 'sourceId'>): void => { requirements.push({ ...requirement, sourceId }); };
  const sourceSections = new Map(ledger.passages.map((passage, index) => [passage.passageNumber, document.sectionIds[index]]));

  // Initial source labels establish associations once; all subsequent checks use these canonical IDs.
  const questionHeading = ledger.lineIndex.findIndex((line) => isReadingV2SourceAnswerKeyHeading(line.rawText));
  const rangedQuestions: { number: number; passageNumber?: number; range?: typeof ledger.questionRanges[number] }[] = ledger.questionRanges.flatMap((range) => Array.from(
    { length: Math.max(0, range.end - range.start + 1) },
    (_value, offset) => ({ number: range.start + offset, passageNumber: range.passageNumber, range }),
  ));
  ledger.questionNumbers.forEach((number) => {
    if (!rangedQuestions.some((entry) => entry.number === number)) rangedQuestions.push({ number });
  });
  ledger.lineIndex.forEach((line, index) => {
    if (questionHeading >= 0 && index >= questionHeading) return;
    const match = line.rawText.match(/^\s*(?:Q(?:uestion)?\s*)(\d{1,3})\b/i);
    if (match && !rangedQuestions.some((entry) => entry.number === Number(match[1]))) rangedQuestions.push({ number: Number(match[1]), passageNumber: undefined, range: undefined });
  });
  const duplicateQuestionNumbers = new Set(rangedQuestions.filter((entry, index, all) => all.some((other, otherIndex) => otherIndex !== index && other.number === entry.number)).map((entry) => entry.number));
  const questionEntries = rangedQuestions.filter((entry, index, all) => all.findIndex((other) => `${other.passageNumber ?? ''}:${other.number}` === `${entry.passageNumber ?? ''}:${entry.number}`) === index)
    .sort((left, right) => left.number - right.number || (left.passageNumber ?? 0) - (right.passageNumber ?? 0));
  questionEntries.forEach(({ number, passageNumber, range }) => {
    const sourceSectionId = passageNumber ? sourceSections.get(passageNumber) : undefined;
    const matching = Object.values(document.interactions).filter((interaction) => {
      const start = interaction.reviewLabel.displayNumber;
      return typeof start === 'number' && number >= start && number < start + (interaction.reviewLabel.answerSlotCount ?? 1)
        && targetMatchesSourcePassage(document, targetForInteraction(document, interaction.interactionId), sourceSectionId);
    });
    const interaction = matching.length === 1 ? matching[0] : undefined;
    const passage = ledger.passages.find((entry) => entry.passageNumber === passageNumber);
    const nextPassageLine = passage ? ledger.passages.find((entry) => entry.lineNumber > passage.lineNumber)?.lineNumber ?? Infinity : Infinity;
    const explicitLine = ledger.lineIndex.find((line, index) => (questionHeading < 0 || index < questionHeading)
      && (!passage || line.lineNumber > passage.lineNumber && line.lineNumber < nextPassageLine)
      && new RegExp(`^\\s*(?:(?:Q(?:uestion)?\\s*)|(?:[-*]\\s*)?)(?:\\*\\*)?${number}(?:\\*\\*)?(?:[.) :]|$)`, 'i').test(line.rawText));
    const lineIds = [lineIdAt(explicitLine?.lineNumber ?? range?.lineNumber ?? 1)];
    const target = interaction ? targetForInteraction(document, interaction.interactionId) : undefined;
    const requirementSuffix = duplicateQuestionNumbers.has(number) && passageNumber !== undefined ? `:p${passageNumber}` : '';
    add({ requirementId: `${sourceId}:question:${number}${requirementSuffix}`, kind: 'question', lineIds, sourceQuestionNumber: number,
      ...(interaction ? { answerSlotIndex: number - (interaction.reviewLabel.displayNumber ?? number) } : {}),
      ...(sourceSectionId ? { sourceSectionId } : {}), ...(passageNumber ? { sourcePassageNumber: passageNumber } : {}), ...(target ? { target } : {}) });
    const answerRow = ledger.answerKeyRows.find((row) => row.questionNumber === number);
    add({ requirementId: `${sourceId}:slot:${number}${requirementSuffix}`, kind: 'answer-slot', lineIds: answerRow ? [lineIdAt(answerRow.sourceLine)] : lineIds,
      sourceQuestionNumber: number,
      ...(sourceSectionId ? { sourceSectionId } : {}), ...(passageNumber ? { sourcePassageNumber: passageNumber } : {}), ...(target ? { target, answerSlotIndex: number - (interaction!.reviewLabel.displayNumber ?? number) } : { answerSlotIndex: 0 }) });
  });

  const suppliedAnswerKey = candidate.teacherAnswerKey
    ?? (candidate.answerKeyText !== undefined ? parseReadingV2TeacherAnswerKey(candidate.answerKeyText) : undefined);
  const answerRows = suppliedAnswerKey?.rows ?? ledger.answerKeyRows.map((row) => ({
    questionNumber: row.questionNumber, rawAnswerText: '', parsedAnswerValues: [], sourceLine: row.sourceLine,
    diagnostics: [], bindingStatus: 'unbound' as const,
  }));
  answerRows.forEach((row, index) => {
    const range = ledger.questionRanges.find((entry) => row.questionNumber >= entry.start && row.questionNumber <= entry.end);
    const matching = Object.values(document.interactions).find((interaction) => {
      const start = interaction.reviewLabel.displayNumber;
      return typeof start === 'number' && row.questionNumber >= start
        && row.questionNumber < start + (interaction.reviewLabel.answerSlotCount ?? 1)
        && targetMatchesSourcePassage(document, targetForInteraction(document, interaction.interactionId), range?.passageNumber ? sourceSections.get(range.passageNumber) : undefined);
    });
    add({
      requirementId: `${sourceId}:answer-key:${row.questionNumber}:${index + 1}`,
      kind: 'answer-key',
      lineIds: suppliedAnswerKey ? [] : [lineIdAt(row.sourceLine)],
      ...(range?.passageNumber ? { sourcePassageNumber: range.passageNumber } : {}),
      sourceQuestionNumber: row.questionNumber,
      answerKeyStatus: row.bindingStatus,
      answerKeyDiagnostics: row.diagnostics.map((diagnostic) => diagnostic.message),
      sourceText: row.rawAnswerText || ledger.lineIndex.find((line) => line.lineNumber === row.sourceLine)?.rawText || '',
      ...(range?.passageNumber && sourceSections.get(range.passageNumber) ? { sourceSectionId: sourceSections.get(range.passageNumber) } : {}),
      ...(matching ? { target: targetForInteraction(document, matching.interactionId) } : {}),
    });
  });
  suppliedAnswerKey?.diagnostics.filter((diagnostic) => diagnostic.code === 'unparsed-answer-key-line').forEach((diagnostic) => {
    add({ requirementId: `${sourceId}:answer-key:line:${diagnostic.sourceLine}`, kind: 'answer-key', lineIds: [], answerKeyStatus: 'invalid',
      answerKeyDiagnostics: [diagnostic.message], sourceText: suppliedAnswerKey.rawText.split(/\r?\n/)[diagnostic.sourceLine - 1] ?? '' });
  });

  ledger.questionRanges.forEach((range) => {
    const text = range.instructionPreview ?? '';
    const facts = readReadingV2InstructionFacts(text);
    if (!Object.keys(facts).length) return;
    const sectionId = range.passageNumber ? sourceSections.get(range.passageNumber) : undefined;
    const matchingGroup = Object.values(document.taskGroups).find((group) => (!sectionId || group.sectionId === sectionId) && group.interactionIds.some((id) => {
      const number = document.interactions[id]?.reviewLabel.displayNumber;
      return typeof number === 'number' && number >= range.start && number <= range.end;
    }));
    add({
      requirementId: `${sourceId}:instruction:${lineIdAt(range.lineNumber)}`,
      kind: 'instruction', lineIds: [lineIdAt(range.lineNumber)], sourceQuestionNumber: range.start,
      ...(matchingGroup ? { target: { taskGroupId: matchingGroup.taskGroupId, sectionId: matchingGroup.sectionId } } : {}),
      ...(sectionId ? { sourceSectionId: sectionId } : {}), sourceText: text, instructionFacts: facts,
    });
  });

  const passageBoundaries = ledger.passages.length ? ledger.passages : ledger.questionRanges.length
    ? [{ passageNumber: 1, lineNumber: 0 }] : [];
  passageBoundaries.forEach((passage, index) => {
    const endLine = Math.min(ledger.passages[index + 1]?.lineNumber ?? Infinity,
      ...ledger.questionRanges.filter((range) => range.lineNumber > passage.lineNumber).map((range) => range.lineNumber),
      ...ledger.answerKeyRows.filter((row) => row.sourceLine > passage.lineNumber).map((row) => row.sourceLine), ledger.lineCount + 1);
    const lines = ledger.lineIndex.filter((line) => line.lineNumber > passage.lineNumber && line.lineNumber < endLine && line.rawText.trim()
      && !/You should spend|Questions?\s+\d+|READING\s+PASSAGE/i.test(line.rawText));
    if (!lines.length) return;
    const passageText = normalized(lines.map((line) => line.rawText).join(' '));
    const matches = Object.values(document.stimuli).filter((stimulus) => stimulus.content.kind === 'passage-content'
      && passageText && (normalized(stimulus.content.paragraphs.map((paragraph) => paragraph.text).join(' ')).includes(passageText)
        || (stimulus.title && lines.some((line) => normalized(line.rawText) === normalized(stimulus.title!)))));
    const positionalStimulusId = document.sections[document.sectionIds[index]]?.stimulusIds.find((id) => document.stimuli[id]?.content.kind === 'passage-content');
    const stimulus = matches.length === 1 ? matches[0] : positionalStimulusId ? document.stimuli[positionalStimulusId] : undefined;
    const sectionId = stimulus && document.sectionIds.find((id) => document.sections[id].stimulusIds.includes(stimulus.stimulusId));
    add({ requirementId: `${sourceId}:passage:${lineIdAt(passage.lineNumber)}`, kind: 'passage', lineIds: lines.map((line) => line.lineId),
      ...(ledger.passages.length ? { sourcePassageNumber: passage.passageNumber } : {}),
      sourceText: lines.map((line) => line.rawText).join('\n\n'),
      passageNeedsComparison: !stimulus || stimulus.content.kind !== 'passage-content'
        || !passageTextCovered(stimulus.content.paragraphs.map((paragraph) => paragraph.text).join(' '), lines.map((line) => line.rawText), stimulus.title),
      ...(stimulus ? { target: { stimulusId: stimulus.stimulusId, sectionId } } : {}) });
  });

  ledger.referenceBanks.forEach((bank) => {
    const { lineIds, bankItems } = readReadingV2SourceBank(ledger, bank);
    const requirement: ReadingV2SourceRequirement = { requirementId: `${sourceId}:bank:${lineIdAt(bank.lineNumber)}`, sourceId, kind: 'bank', lineIds, bankItems,
      ...(bankTaskTypes[bank.kind] ? { expectedTaskType: bankTaskTypes[bank.kind] } : {}) };
    const passageIndex = ledger.passages.findIndex((passage) => passage.passageNumber === bank.passageNumber);
    const sectionId = document.sectionIds[passageIndex];
    const candidates = getReadingV2SourceBankTargets(document, requirement).filter(({ group }) => !sectionId || group.sectionId === sectionId);
    const groups = candidates.filter(({ group }) => bank.questionRange && group.interactionIds.some((id) => {
      const number = document.interactions[id]?.reviewLabel.displayNumber;
      return typeof number === 'number' && number >= bank.questionRange!.start && number <= bank.questionRange!.end;
    }));
    const matching = candidates.filter((candidate) => candidate.matchesSource);
    const matchingRange = groups.filter((candidate) => candidate.matchesSource);
    const group = (matchingRange.length === 1 ? matchingRange[0] : matching.length === 1 ? matching[0]
      : !matching.length && groups.length === 1 ? groups[0] : undefined)?.group;
    const options = group ? group.optionSetRefs.flatMap((id) => document.optionSets[id]?.options ?? []) : [];
    const boundItems = bankItems.map((item) => {
      const matches = options.filter((option) => normalized(option.label) === normalized(item.label) && normalized(option.text) === normalized(item.text));
      return matches.length === 1 ? { ...item, optionId: matches[0].optionId } : item;
    });
    add({ ...requirement, bankItems: boundItems, ...(sectionId ? { sourceSectionId: sectionId } : {}),
      ...(group ? { target: { taskGroupId: group.taskGroupId, sectionId: group.sectionId } } : {}) });
  });
  const boundInteractions = new Set(requirements.filter((item) => item.kind === 'question').map((item) => item.target?.interactionId));
  const boundStimuli = new Set(requirements.filter((item) => item.kind === 'passage').map((item) => item.target?.stimulusId));
  const unboundTargets = [
    ...Object.keys(document.interactions).filter((id) => !boundInteractions.has(id)).map((id) => targetForInteraction(document, id)),
    ...((ledger.passages.length || (candidate.autoImportDiagnostics ?? []).some((diagnostic) => /passage|trim|no-passages/i.test(diagnostic.code)))
      ? Object.values(document.stimuli).filter((stimulus) => stimulus.content.kind === 'passage-content' && !boundStimuli.has(stimulus.stimulusId)).map((stimulus) => ({ stimulusId: stimulus.stimulusId })) : []),
  ];
  return { origin: { kind: 'import', sourceId }, scope: { kind: 'supplied', requirementIds: requirements.map((item) => item.requirementId) }, requirements, interpretations: [], unboundTargets };
};

export const bindReadingV2SourceRequirement = (
  context: ReadingV2AuthoringContext, requirementId: string, target: ReadingV2FindingTarget, document: ReadingV2Document,
  source?: ReadingV2AuthoringSourceRecord,
): ReadingV2AuthoringContext => {
  const savedRequirement = context.requirements.find((entry) => entry.requirementId === requirementId);
  if (!savedRequirement || !targetExists(document, target)) throw new Error('Choose an existing source requirement and current content target.');
  if (target.interactionId) target = { ...targetForInteraction(document, target.interactionId), ...(target.answerSlotIndex !== undefined ? { answerSlotIndex: target.answerSlotIndex } : {}) };
  else if (target.taskGroupId) target = { taskGroupId: target.taskGroupId, sectionId: document.taskGroups[target.taskGroupId].sectionId };
  else if (target.stimulusId) target = { stimulusId: target.stimulusId, sectionId: document.sectionIds.find((id) => document.sections[id].stimulusIds.includes(target.stimulusId as never)) };
  if (!targetMatchesSourcePassage(document, target, savedRequirement.sourceSectionId)) {
    throw new Error('Choose content from the source passage for this requirement.');
  }
  if (source && source.sourceId !== savedRequirement.sourceId) throw new Error('Load the associated source before linking this bank.');
  const requirement = savedRequirement.kind === 'bank' && source ? resolveReadingV2SourceBankRequirement(savedRequirement, source) : savedRequirement;
  if (requirement.kind === 'passage' ? !target.stimulusId || document.stimuli[target.stimulusId]?.content.kind !== 'passage-content'
    : requirement.kind === 'bank' || requirement.kind === 'instruction' ? !target.taskGroupId : !target.interactionId) throw new Error('Source binding has the wrong content kind.');
  const slotIndex = target.answerSlotIndex ?? requirement.answerSlotIndex ?? 0;
  if ((requirement.kind === 'answer-slot' || requirement.kind === 'question') && (!Number.isInteger(slotIndex) || slotIndex < 0
    || slotIndex >= (document.interactions[target.interactionId!].reviewLabel.answerSlotCount ?? 1)
    || context.requirements.some((entry) => entry.kind === 'answer-slot' && entry.requirementId !== requirementId
      && !(requirement.kind === 'question' && requirement.sourceQuestionNumber !== undefined && entry.sourceId === requirement.sourceId && entry.sourceQuestionNumber === requirement.sourceQuestionNumber
        && entry.sourceSectionId === requirement.sourceSectionId)
      && entry.target?.interactionId === target.interactionId && (entry.answerSlotIndex ?? 0) === slotIndex))) {
    throw new Error('Choose an existing, unassigned answer slot for this source answer.');
  }
  if (requirement.kind === 'bank') {
    if (!getReadingV2SourceBankTargets(document, requirement).some(({ group }) => group.taskGroupId === target.taskGroupId)) {
      throw new Error('Choose a compatible question group for this answer bank.');
    }
  }
  if (context.requirements.some((entry) => entry.requirementId !== requirementId && entry.kind === requirement.kind && entry.kind !== 'answer-slot' && entry.kind !== 'answer-key'
    && entry.target && targetKey(entry.target) === targetKey(target)
    && (entry.kind !== 'question' || (entry.answerSlotIndex ?? 0) === slotIndex))) throw new Error('This content is already bound to a different required source item.');
  const group = target.taskGroupId && document.taskGroups[target.taskGroupId];
  const options = group ? group.optionSetRefs.flatMap((id) => document.optionSets[id]?.options ?? []) : [];
  const bankItems = requirement.bankItems?.map((item) => {
    const matches = options.filter((option) => normalized(option.label) === normalized(item.label) && normalized(option.text) === normalized(item.text));
    return { label: item.label, text: item.text, ...(matches.length === 1 ? { optionId: matches[0].optionId } : {}) };
  });
  return { ...context,
    requirements: context.requirements.map((entry) => {
      const paired = requirement.kind === 'question' && requirement.sourceQuestionNumber !== undefined && entry.sourceId === requirement.sourceId
        && entry.sourceQuestionNumber === requirement.sourceQuestionNumber && entry.sourceSectionId === requirement.sourceSectionId
        && (entry.kind === 'answer-slot' || entry.kind === 'answer-key' || entry.kind === 'instruction');
      return entry.requirementId === requirementId ? { ...requirement, target: { ...target }, ...(requirement.kind === 'answer-slot' || requirement.kind === 'question' ? { answerSlotIndex: slotIndex } : {}), ...(bankItems ? { bankItems } : {}) }
        : paired ? { ...entry, ...(entry.kind === 'answer-slot' ? { answerSlotIndex: slotIndex } : {}), target: entry.kind === 'instruction' ? { taskGroupId: target.taskGroupId, sectionId: target.sectionId } : { ...target } } : entry;
    }),
    interpretations: requirement.kind === 'bank' ? context.interpretations.filter((entry) => entry.requirementId !== requirementId) : context.interpretations,
    unboundTargets: context.unboundTargets.filter((entry) => targetKey(entry) !== targetKey(target)),
  };
};

export const interpretReadingV2SourceRequirement = (
  context: ReadingV2AuthoringContext, interpretation: ReadingV2SourceInterpretation, document: ReadingV2Document,
  source?: ReadingV2AuthoringSourceRecord,
): ReadingV2AuthoringContext => {
  const requirement = context.requirements.find((entry) => entry.requirementId === interpretation.requirementId);
  if (!requirement || !interpretation.actorId || !interpretation.updatedAt
    || (requirement.kind !== 'instruction' && !targetExists(document, requirement.target))) throw new Error('Only a concrete task interpretation with current associated content can be changed.');
  if (requirement.kind === 'bank') {
    if (!source || source.sourceId !== requirement.sourceId) throw new Error('Load the supplied answer bank before confirming it.');
    const expected = resolveReadingV2SourceBankRequirement(requirement, source);
    const group = document.taskGroups[requirement.target!.taskGroupId!];
    const options = group.optionSetRefs.flatMap((id) => document.optionSets[id]?.options ?? []);
    const authoredBankItems = interpretation.bankItems;
    const bankItems = authoredBankItems
      ? (() => {
          const labels = new Set<string>();
          const optionIds = new Set<string>();
          const hasInvalidOption = options.some((option) => {
            const label = normalized(option.label);
            const duplicate = labels.has(label);
            labels.add(label);
            return !option.label.trim() || !option.text.trim() || duplicate;
          });
          if (!options.length || hasInvalidOption) throw new Error('Give every answer option a unique label and non-empty text before approving this bank.');
          return authoredBankItems.map((item) => {
            const option = options.find((entry) => entry.optionId === item.optionId);
            if (!option || optionIds.has(option.optionId)) throw new Error(`Choose each current answer option only once before approving this bank.`);
            optionIds.add(option.optionId);
            return { label: option.label, text: option.text, optionId: option.optionId };
          });
        })()
      : expected.bankItems?.map((item) => {
          const matches = options.filter((option) => normalized(option.label) === normalized(item.label) && option.text.trim());
          if (matches.length !== 1) throw new Error(`Restore one option labelled ${item.label} before confirming this bank.`);
          return { label: item.label, text: matches[0].text, optionId: matches[0].optionId };
        });
    if (!bankItems?.length) throw new Error('The supplied answer bank could not be read.');
    interpretation = { requirementId: interpretation.requirementId, actorId: interpretation.actorId, updatedAt: interpretation.updatedAt, bankItems };
  } else if (requirement.kind === 'instruction') {
    const group = requirement.target?.taskGroupId ? document.taskGroups[requirement.target.taskGroupId] : undefined;
    if (!group) throw new Error('Link the source questions to their group before correcting this instruction.');
    interpretation = { requirementId: requirement.requirementId, actorId: interpretation.actorId, updatedAt: interpretation.updatedAt,
      instructionFacts: currentInstructionFacts(document, group) };
  } else if (!requirement.expectedTaskType || !interpretation.taskType) throw new Error('Choose a concrete task interpretation.');
  return { ...context, interpretations: [...context.interpretations.filter((entry) => entry.requirementId !== interpretation.requirementId), interpretation] };
};

export const recordReadingV2AuthoredInstructionEdit = (
  context: ReadingV2AuthoringContext, previousDocument: ReadingV2Document, nextDocument: ReadingV2Document,
  taskGroupId: string, actorId: string, updatedAt: string,
): ReadingV2AuthoringContext => {
  const previous = previousDocument.taskGroups[taskGroupId];
  const next = nextDocument.taskGroups[taskGroupId];
  if (!actorId || !previous || !next) return context;
  const before = currentInstructionFacts(previousDocument, previous);
  const after = currentInstructionFacts(nextDocument, next);
  if (!Object.keys({ ...before, ...after }).some((key) => before[key as keyof ReadingV2InstructionFacts] !== after[key as keyof ReadingV2InstructionFacts])) return context;
  return context.requirements.filter((requirement) => requirement.kind === 'instruction' && requirement.target?.taskGroupId === taskGroupId)
    .reduce((current, requirement) => interpretReadingV2SourceRequirement(current, { requirementId: requirement.requirementId, actorId, updatedAt }, nextDocument), context);
};

export const resolveReadingV2AnswerKeyRow = (
  context: ReadingV2AuthoringContext,
  requirementId: string,
  document: ReadingV2Document,
  actorId: string,
  updatedAt: string,
): ReadingV2AuthoringContext => {
  const requirement = context.requirements.find((entry) => entry.requirementId === requirementId);
  if (!requirement || requirement.kind !== 'answer-key' || !actorId || !updatedAt) {
    throw new Error('Choose a supplied answer-key row to correct.');
  }
  const interaction = requirement.target?.interactionId ? document.interactions[requirement.target.interactionId] : undefined;
  if (interaction && (!interaction.scoringRule.acceptableAnswers?.some((answer) => answer.trim())
    || validateReadingV2Draft(document).blockingIssues.some((issue) => issue.objectId === interaction.interactionId))) {
    throw new Error('Correct this question and its authored answer before choosing it as the marking answer.');
  }
  if (!interaction && context.requirements.some((entry) => context.scope.requirementIds.includes(entry.requirementId) && entry.kind === 'question'
    && entry.sourceQuestionNumber === requirement.sourceQuestionNumber)) {
    throw new Error('Restore or link the supplied question before resolving its answer-key row.');
  }
  const interpretation: ReadingV2SourceInterpretation = { requirementId, actorId, updatedAt,
    answerKeyResolution: interaction ? 'authored-answer' : 'outside-scope' };
  return { ...context, interpretations: [...context.interpretations.filter((entry) => entry.requirementId !== requirementId), interpretation] };
};

export const restoreReadingV2SourceInstruction = (
  context: ReadingV2AuthoringContext, requirementId: string, document: ReadingV2Document,
): ReadingV2Document => {
  const requirement = context.requirements.find((entry) => entry.requirementId === requirementId && entry.kind === 'instruction');
  const group = requirement?.target?.taskGroupId ? document.taskGroups[requirement.target.taskGroupId] : undefined;
  if (!requirement?.instructionFacts || !group) throw new Error('Link the supplied questions to their group first.');
  const facts = requirement.instructionFacts;
  if (facts.vocabulary && group.answerRule.responseShape.kind !== 'binary-judgement'
    || facts.wordLimit !== undefined && !group.interactionIds.some((id) => ['free-text', 'structured-entry'].includes(document.interactions[id]?.responseShape.kind))
    || facts.selectionLimit !== undefined && group.answerRule.responseShape.kind !== 'multi-select'
      && !(facts.selectionLimit === 1 && group.answerRule.responseShape.kind === 'single-choice')) {
    throw new Error('Choose the question type supported by the supplied instruction before restoring its response rules.');
  }
  const updateShape = (shape: ReadingV2TaskGroup['answerRule']['responseShape']) => shape.kind === 'free-text' && facts.wordLimit !== undefined ? { ...shape, wordLimit: facts.wordLimit }
    : shape.kind === 'binary-judgement' && facts.vocabulary ? { ...shape, vocabulary: facts.vocabulary }
      : shape.kind === 'matching' && facts.optionReuse ? { ...shape, optionReuse: facts.optionReuse }
        : shape.kind === 'multi-select' && facts.selectionLimit !== undefined ? { ...shape, selectionLimit: facts.selectionLimit } : shape;
  return { ...document,
    taskGroups: { ...document.taskGroups, [group.taskGroupId]: { ...group,
      instructionBlocks: [{ id: group.instructionBlocks[0]?.id ?? `${group.taskGroupId}-instructions`, text: requirement.sourceText ?? '' }],
      answerRule: { ...group.answerRule, responseShape: updateShape(group.answerRule.responseShape),
        ...(facts.wordLimit !== undefined ? { wordLimit: facts.wordLimit } : {}), ...(facts.optionReuse ? { optionReuse: facts.optionReuse } : {}) } } },
    interactions: Object.fromEntries(Object.entries(document.interactions).map(([id, interaction]) => [id,
      group.interactionIds.includes(interaction.interactionId) ? interaction.responseShape.kind === 'multi-select' && facts.selectionLimit !== undefined
        ? setReadingV2MultipleSelectCount(interaction, facts.selectionLimit) : { ...interaction, responseShape: updateShape(interaction.responseShape) } : interaction])),
  };
};

export const correctReadingV2PassageSourceSpan = (
  context: ReadingV2AuthoringContext, requirementId: string, lineIds: readonly string[],
  document: ReadingV2Document, source: ReadingV2AuthoringSourceRecord, actorId: string, updatedAt: string,
): ReadingV2AuthoringContext => {
  const requirement = context.requirements.find((entry) => entry.requirementId === requirementId);
  const stimulus = requirement?.target?.stimulusId ? document.stimuli[requirement.target.stimulusId] : undefined;
  const lines = source.lineIndex.filter((line) => lineIds.includes(line.lineId));
  const passageLines = source.lineIndex.filter((line) => requirement?.lineIds.includes(line.lineId) && line.rawText.trim());
  const first = passageLines.findIndex((line) => lineIds.includes(line.lineId));
  const last = passageLines.findIndex((line) => line.lineId === lines.at(-1)?.lineId);
  if (!requirement || requirement.kind !== 'passage' || requirement.sourceId !== source.sourceId || !actorId || !updatedAt
    || requirement.sourcePassageNumber !== undefined || lineIds.some((id) => !requirement.lineIds.includes(id))
    || passageLines.slice(first, last + 1).some((line) => !lineIds.includes(line.lineId))
    || !lines.length || lines.length !== new Set(lineIds).size || stimulus?.content.kind !== 'passage-content'
    || !passageTextCovered(stimulus.content.paragraphs.map((paragraph) => paragraph.text).join(' '), lines.map((line) => line.rawText), stimulus.title)) {
    throw new Error('Select the source passage lines represented in the current passage. Restore missing text before linking those lines.');
  }
  return { ...context,
    requirements: context.requirements.map((entry) => entry.requirementId === requirementId
      ? { ...entry, lineIds: lines.map((line) => line.lineId), sourceText: lines.map((line) => line.rawText).join('\n\n'), passageNeedsComparison: false } : entry),
    interpretations: [...context.interpretations.filter((entry) => entry.requirementId !== requirementId), { requirementId, actorId, updatedAt }],
  };
};

export const correctReadingV2SourceQuestionRange = (
  context: ReadingV2AuthoringContext, requirementId: string, start: number, end: number,
  source: ReadingV2AuthoringSourceRecord, actorId: string, updatedAt: string,
): ReadingV2AuthoringContext => {
  const requirement = context.requirements.find((entry) => entry.requirementId === requirementId);
  const heading = source.lineIndex.find((line) => requirement?.lineIds.includes(line.lineId)
    && /Questions?\s+\d+\s*[-–—]\s*\d+/i.test(line.rawText));
  const original = heading?.rawText.match(/Questions?\s+(\d+)\s*[-–—]\s*(\d+)/i);
  if (!requirement || !['question', 'answer-slot'].includes(requirement.kind) || !heading || !original
    || source.sourceId !== requirement.sourceId || !actorId || !updatedAt || !Number.isInteger(start) || !Number.isInteger(end)
    || start < Number(original[1]) || end > Number(original[2]) || end < start) {
    throw new Error('Choose a corrected range within the supplied question heading. Visible source questions must be kept.');
  }
  if (context.requirements.some((entry) => entry.kind === 'question' && entry.sourceId === source.sourceId
    && entry.sourceSectionId === requirement.sourceSectionId && entry.sourceQuestionNumber !== undefined
    && entry.sourceQuestionNumber >= Number(original[1]) && entry.sourceQuestionNumber <= Number(original[2])
    && (entry.sourceQuestionNumber < start || entry.sourceQuestionNumber > end) && !entry.lineIds.includes(heading.lineId))) {
    throw new Error('Visible source questions must be kept in the corrected range.');
  }
  const excludedQuestions = context.requirements.filter((entry) => entry.sourceId === source.sourceId
    && entry.kind === 'question' && entry.lineIds.includes(heading.lineId)
    && entry.sourceQuestionNumber !== undefined && (entry.sourceQuestionNumber < start || entry.sourceQuestionNumber > end));
  const excluded = context.requirements.filter((entry) => (entry.kind === 'question' || entry.kind === 'answer-slot')
    && excludedQuestions.some((question) => question.sourceId === entry.sourceId && question.sourceSectionId === entry.sourceSectionId
      && question.sourceQuestionNumber === entry.sourceQuestionNumber));
  const excludedIds = new Set(excluded.map((entry) => entry.requirementId));
  return { ...context, scope: { kind: 'selected', requirementIds: context.scope.requirementIds.filter((id) => !excludedIds.has(id)) },
    interpretations: [...context.interpretations.filter((entry) => entry.requirementId !== requirementId), { requirementId, actorId, updatedAt }] };
};

export const resolveReadingV2SourceBankRequirement = (
  requirement: ReadingV2SourceRequirement, source: ReadingV2AuthoringSourceRecord,
  ledger = buildReadingV2AutoSourceLedger({ rawText: getReadingV2AuthoringSourceText({ rawText: source.rawText }) }),
): ReadingV2SourceRequirement => {
  const firstLine = source.lineIndex.find((line) => line.lineId === requirement.lineIds[0]);
  const bank = ledger.referenceBanks.find((entry) => entry.lineNumber === firstLine?.lineNumber);
  if (!bank) return requirement;
  const parsed = readReadingV2SourceBank(ledger, bank);
  if (!parsed.bankItems.length) return requirement;
  return { ...requirement, ...parsed, ...(bankTaskTypes[bank.kind] ? { expectedTaskType: bankTaskTypes[bank.kind] } : {}), bankItems: parsed.bankItems.map((item) => {
    const bound = requirement.bankItems?.find((entry) => normalized(entry.label) === normalized(item.label) && normalized(entry.text) === normalized(item.text));
    return bound?.optionId ? { ...item, optionId: bound.optionId } : item;
  }) };
};

export const associateReadingV2ImportedContent = (
  context: ReadingV2AuthoringContext,
  input: { readonly target: ReadingV2FindingTarget; readonly sourceId: string; readonly lineIds: readonly string[]; readonly actorId: string; readonly updatedAt: string },
  document: ReadingV2Document,
  source: ReadingV2AuthoringSourceRecord,
): ReadingV2AuthoringContext => {
  if (source.sourceId !== input.sourceId || !input.lineIds.length || !input.actorId || !input.updatedAt
    || input.lineIds.some((id) => !source.lineIndex.some((line) => line.lineId === id))
    || !targetExists(document, input.target)
    || !context.unboundTargets.some((target) => targetKey(target) === targetKey(input.target))) {
    throw new Error('Select supplied source lines and the current unassociated imported content.');
  }
  const kind = input.target.interactionId ? 'question' : input.target.stimulusId ? 'passage' : undefined;
  if (!kind) throw new Error('Only imported passages or questions need a supplied-source association.');
  const suppliedText = source.lineIndex.filter((line) => input.lineIds.includes(line.lineId)).map((line) => line.rawText);
  if (kind === 'passage') {
    const stimulus = document.stimuli[input.target.stimulusId!];
    if (stimulus.content.kind !== 'passage-content'
      || !passageTextCovered(stimulus.content.paragraphs.map((paragraph) => paragraph.text).join(' '), suppliedText, stimulus.title)) {
      throw new Error('Restore the selected source passage text before linking it.');
    }
  }
  const requirementId = `${source.sourceId}:associated:${kind}:${targetKey(input.target)}`;
  const requirements: ReadingV2SourceRequirement[] = [{ requirementId, kind, sourceId: source.sourceId,
    lineIds: [...new Set(input.lineIds)], target: { ...input.target }, ...(kind === 'passage' ? { sourceText: suppliedText.join('\n\n'), passageNeedsComparison: false } : {}) }];
  if (kind === 'question') requirements.push({ ...requirements[0], requirementId: `${requirementId}:slot`, kind: 'answer-slot', answerSlotIndex: 0 });
  return { ...context,
    scope: { ...context.scope, requirementIds: [...context.scope.requirementIds, ...requirements.map((item) => item.requirementId)] },
    requirements: [...context.requirements, ...requirements],
    interpretations: [...context.interpretations, { requirementId, actorId: input.actorId, updatedAt: input.updatedAt }],
    unboundTargets: context.unboundTargets.filter((target) => targetKey(target) !== targetKey(input.target)),
  };
};

export const projectReadingV2AuthoringContext = (
  context: ReadingV2AuthoringContext,
  input: {
    readonly taskGroupIds: readonly string[];
    readonly taskGroupIdMap?: ReadonlyMap<string, string>;
    readonly interactionIdMap?: ReadonlyMap<string, string>;
    readonly stimulusIdMap?: ReadonlyMap<string, string>;
    readonly sectionIdMap?: ReadonlyMap<string, string>;
    readonly requirementIds?: readonly string[];
    readonly sourceDocument: ReadingV2Document;
  },
): ReadingV2AuthoringContext => {
  const selected = new Set(input.taskGroupIds);
  const selectedStimuli = new Set(input.taskGroupIds.flatMap((id) => input.sourceDocument.taskGroups[id]?.stimulusRefs.map((ref) => ref.stimulusId) ?? []));
  const selectedSections = new Set(input.taskGroupIds.map((id) => input.sourceDocument.taskGroups[id]?.sectionId));
  const includesTarget = (target: ReadingV2FindingTarget | undefined): boolean => Boolean(target && (target.taskGroupId
    ? selected.has(target.taskGroupId) : target.stimulusId ? selectedStimuli.has(target.stimulusId as never) : target.sectionId && selectedSections.has(target.sectionId as never)));
  const remap = (target: ReadingV2FindingTarget): ReadingV2FindingTarget => ({ ...target,
    ...(target.taskGroupId ? { taskGroupId: input.taskGroupIdMap?.get(target.taskGroupId) ?? target.taskGroupId } : {}),
    ...(target.interactionId ? { interactionId: input.interactionIdMap?.get(target.interactionId) ?? target.interactionId } : {}),
    ...(target.stimulusId ? { stimulusId: input.stimulusIdMap?.get(target.stimulusId) ?? target.stimulusId } : {}),
    ...(target.sectionId ? { sectionId: input.sectionIdMap?.get(target.sectionId) ?? target.sectionId } : {}),
  });
  const requested = input.requirementIds ? new Set(input.requirementIds) : undefined;
  const requirements = context.requirements.filter((item) => requested?.has(item.requirementId) || includesTarget(item.target)).map((item) => ({
    ...item, ...(item.target ? { target: remap(item.target) } : {}), ...(item.sourceSectionId ? { sourceSectionId: input.sectionIdMap?.get(item.sourceSectionId) ?? item.sourceSectionId } : {}),
  }));
  const ids = new Set(requirements.map((item) => item.requirementId));
  return { ...context, scope: { kind: 'selected', requirementIds: [...ids] }, requirements,
    interpretations: context.interpretations.filter((item) => ids.has(item.requirementId)),
    unboundTargets: context.unboundTargets.filter(includesTarget).map(remap),
  };
};

export const evaluateReadingV2AuthoringReadiness = (state: {
  readonly document: ReadingV2Document; readonly metadata: { readonly title: string }; readonly authoringContext?: ReadingV2AuthoringContext;
}, resolvedSourceEvidence: readonly ReadingV2AuthoringSourceRecord[] = []): ReadingV2AuthoringReadiness => {
  const { document, authoringContext: context } = state;
  const validationResult = validateReadingV2Draft(document);
  const findings: ReadingV2AuthoringFinding[] = [];
  validationResult.issues.forEach((issue) => {
    if (issue.code === 'unresolved-draft-placeholder' && validationResult.issues.some((entry) => entry.objectId === issue.objectId && entry.field === 'answer' && entry.code === 'missing-scoring-response-shape')) return;
    const id = `canonical:${issue.code}:${issue.objectId ?? document.documentId}:${issue.field ?? 'content'}`;
    const existingIndex = findings.findIndex((finding) => finding.id === id);
    const severity = issue.severity;
    if (existingIndex >= 0) {
      const existing = findings[existingIndex];
      findings[existingIndex] = { ...existing, message: `${existing.message} ${issue.message}`, blocking: existing.blocking || severity === 'error', severity: existing.blocking || severity === 'error' ? 'error' : existing.severity };
    } else findings.push({ id, code: issue.code, severity, message: issue.message,
      blocking: severity === 'error', target: { ...targetForIssue(document, issue), ...(issue.field ? { field: issue.field } : {}) }, action: 'edit' });
  });
  const add = (code: string, message: string, target: ReadingV2FindingTarget, action: ReadingV2AuthoringFinding['action'] = 'edit', sourceExcerpt?: string): void => {
    findings.push({ id: `${code}:${target.sourceRequirementId ?? (targetKey(target) || document.documentId)}`, code, severity: 'error', message, blocking: true, target, action, ...(sourceExcerpt ? { sourceExcerpt } : {}) });
  };
  if (!state.metadata.title.trim()) add('metadata-title-required', 'Add a test title before publishing.', {});
  document.sectionIds.forEach((sectionId) => {
    const section = document.sections[sectionId];
    section.stimulusIds.forEach((stimulusId) => {
      const stimulus = document.stimuli[stimulusId];
      if (stimulus?.content.kind !== 'passage-content') return;
      if (!stimulus.title?.trim()) add('passage-title-required', 'Add a passage title before publishing.', { sectionId, stimulusId });
      if (!stimulus.content.paragraphs.some((paragraph) => paragraph.text.trim())) add('passage-text-required', 'Add passage text before publishing.', { sectionId, stimulusId });
    });
    if (!section.taskGroupIds.length) add('question-group-required', 'Add a question group for this passage.', { sectionId }, 'add');
  });
  Object.values(document.taskGroups).forEach((group) => {
    group.optionSetRefs.forEach((optionSetId) => {
      if (group.officialTaskType === 'matching-information') return;
      document.optionSets[optionSetId]?.options.forEach((option) => {
        if (!option.text.trim()) add(`option-text-required:${option.optionId}`, `Option ${option.label} needs text.`, { taskGroupId: group.taskGroupId, sectionId: group.sectionId });
      });
    });
    if (['table-completion', 'flowchart-completion', 'diagram-labeling'].includes(group.officialTaskType)) return;
    group.interactionIds.forEach((id) => { if (!document.interactions[id]?.promptText?.trim()) add('question-text-required', 'Add question text before publishing.', targetForInteraction(document, id)); });
  });
  if (context) {
    const scope = new Set(context.scope.requirementIds);
    const ledgers = new Map<string, ReturnType<typeof buildReadingV2AutoSourceLedger>>();
    context.requirements.filter((requirement) => scope.has(requirement.requirementId)).forEach((savedRequirement) => {
      let requirement = savedRequirement;
      const source = resolvedSourceEvidence.find((record) => record.sourceId === requirement.sourceId);
      if (requirement.kind === 'bank' && source) {
        if (!ledgers.has(source.sourceId)) ledgers.set(source.sourceId, buildReadingV2AutoSourceLedger({ rawText: getReadingV2AuthoringSourceText({ rawText: source.rawText }) }));
        requirement = resolveReadingV2SourceBankRequirement(requirement, source, ledgers.get(source.sourceId));
      }
      const sourceExcerpt = requirement.sourceText
        || source?.lineIndex.filter((line) => requirement.lineIds.includes(line.lineId)).map((line) => line.rawText).join('\n');
      const target = { ...requirement.target, sourceRequirementId: requirement.requirementId, ...(requirement.sourcePassageNumber ? { sourcePassageNumber: requirement.sourcePassageNumber } : {}) };
      if (!source) { add('source-unavailable', 'Reload the original source before publishing.', target, 'link'); return; }
      if (requirement.kind === 'answer-key') {
        const resolution = context.interpretations.find((entry) => entry.requirementId === requirement.requirementId)?.answerKeyResolution;
        const hasSourceQuestion = context.requirements.some((entry) => scope.has(entry.requirementId) && entry.kind === 'question' && entry.sourceQuestionNumber === requirement.sourceQuestionNumber);
        const interaction = requirement.target?.interactionId ? document.interactions[requirement.target.interactionId] : undefined;
        if (resolution === 'outside-scope' && !hasSourceQuestion && !interaction) return;
        if (resolution === 'authored-answer' && interaction?.scoringRule.acceptableAnswers?.some((answer) => answer.trim())) return;
        if (!interaction) {
          add('source-answer-key-unbound', `Answer key row ${requirement.sourceQuestionNumber ?? ''} is outside the current questions. Confirm the row is outside this import or add its question.`, target, 'exclude', sourceExcerpt);
        } else if (requirement.answerKeyStatus === 'invalid' || requirement.answerKeyStatus === 'duplicate') {
          add('source-answer-key-invalid', `Answer key row ${requirement.sourceQuestionNumber ?? ''} is ${requirement.answerKeyStatus}. Use the current authored answer or restore the supplied row.`, target, 'exclude', sourceExcerpt);
        }
        return;
      }
      if (requirement.kind === 'instruction') {
        const group = requirement.target?.taskGroupId ? document.taskGroups[requirement.target.taskGroupId] : undefined;
        const facts = context.interpretations.find((entry) => entry.requirementId === requirement.requirementId)?.instructionFacts ?? requirement.instructionFacts;
        if (group && facts && instructionFactsMatch(document, group, facts)) return;
        add('source-instruction-mismatch', 'Compare the supplied response rules with this question group. Restore the supplied rules, or correct their interpretation to the rules you intend to teach.', target, group ? 'interpret' : 'link', sourceExcerpt);
        return;
      }
      if (!targetMatchesSourcePassage(document, requirement.target, requirement.sourceSectionId)) {
        add('source-question-association-invalid', 'Link this source question to the question in the matching passage.', target, 'link', sourceExcerpt);
        return;
      }
      if (!targetExists(document, requirement.target)) {
        add(`source-${requirement.kind}-missing`, `Required source ${requirement.kind.replace('-', ' ')} needs content and an explicit association.`, target, requirement.kind === 'bank' ? 'link' : requirement.target ? 'add' : 'link', sourceExcerpt);
        return;
      }
      if (requirement.kind === 'passage' && requirement.passageNeedsComparison && requirement.target?.stimulusId) {
        const stimulus = document.stimuli[requirement.target.stimulusId];
        if (stimulus?.content.kind === 'passage-content' && !passageTextCovered(
          stimulus.content.paragraphs.map((paragraph) => paragraph.text).join(' '), (requirement.sourceText ?? '').split(/\n+/), stimulus.title,
        )) add('source-passage-incomplete', 'The import omitted supplied passage text. Restore the missing text, or select the correct source passage span.', target, 'edit', sourceExcerpt);
      }
      if (requirement.kind === 'answer-slot' && requirement.target?.interactionId) {
        const interaction = document.interactions[requirement.target.interactionId];
        const count = interaction.reviewLabel.answerSlotCount ?? 1;
        if ((requirement.answerSlotIndex ?? 0) >= count) add('source-answer-slot-missing', 'Restore the required answer slot.', target, 'edit', sourceExcerpt);
      }
      if (requirement.kind === 'bank') {
        if (!getReadingV2SourceBankTargets(document, requirement).some(({ group }) => group.taskGroupId === requirement.target?.taskGroupId)) {
          add('source-bank-association-invalid', 'The supplied answer bank is linked to an incompatible question group. Change its association to the group that uses this bank.', target, 'link', sourceExcerpt);
          return;
        }
        const group = requirement.target?.taskGroupId && document.taskGroups[requirement.target.taskGroupId];
        const options = group ? group.optionSetRefs.flatMap((id) => document.optionSets[id]?.options ?? []) : [];
        if (!options.length) add('source-bank-missing', 'Restore the required source answer bank.', target, 'edit', sourceExcerpt);
        const bankItems = context.interpretations.find((entry) => entry.requirementId === requirement.requirementId)?.bankItems ?? requirement.bankItems;
        if (options.length && bankItems?.some((item) => item.optionId
          ? !options.some((option) => option.optionId === item.optionId)
          : !options.some((option) => normalized(option.label) === normalized(item.label) && normalized(option.text) === normalized(item.text)))) {
          add('source-bank-mismatch', 'Compare the required source options with the current answer bank. Restore missing labels or confirm the current wording.', target, 'interpret', sourceExcerpt);
        }
      }
      const taskType = context.interpretations.find((entry) => entry.requirementId === requirement.requirementId)?.taskType ?? requirement.expectedTaskType;
      const group = requirement.target?.taskGroupId && document.taskGroups[requirement.target.taskGroupId];
      if (taskType && group && group.officialTaskType !== taskType) add('source-task-type-mismatch', 'Choose the task type supported by the source or correct its interpretation.', target, 'interpret', sourceExcerpt);
    });
    context.unboundTargets.filter((target) => targetExists(document, target)).forEach((target) => add('source-content-unbound', 'Associate this imported content with its source, or remove unsupported content.', target, 'link'));
  }
  const unique = findings.filter((finding, index) => findings.findIndex((entry) => entry.id === finding.id) === index);
  const blockingFindings = unique.filter((finding) => finding.blocking);
  return { findings: unique, blockingFindings, canPublish: blockingFindings.length === 0, validationResult };
};
