import { describe, expect, it } from 'vitest';
import type { ReadingV2Document } from '../../types/readingV2.types';
import { READING_V2_CANONICAL_FIXTURES } from './fixtures/readingV2CanonicalFixtures';
import {
  associateReadingV2ImportedContent,
  bindReadingV2SourceRequirement,
  createReadingV2AuthoringSourceRecord,
  createReadingV2ImportAuthoringContext,
  createReadingV2ManualAuthoringContext,
  resolveReadingV2AnswerKeyRow,
  restoreReadingV2SourceInstruction,
  correctReadingV2PassageSourceSpan,
  correctReadingV2SourceQuestionRange,
  evaluateReadingV2AuthoringReadiness,
  interpretReadingV2SourceRequirement,
  recordReadingV2AuthoredInstructionEdit,
  type ReadingV2AuthoringContext,
  type ReadingV2AuthoringSourceRecord,
} from './readingV2AuthoringQuality.service';
import { createReadingV2ImportCandidateFromText } from './readingV2ImportNormalization.service';
import { normalizeReadingV2ImportCandidate } from './readingV2ImportNormalization.service';
import { READING_V2_FULL_TEST_40_PASTE_IMPORT_FIXTURE } from './fixtures/readingV2PasteImportFixtures';

const documentFor = (type: keyof typeof READING_V2_CANONICAL_FIXTURES = 'sentence-completion'): ReadingV2Document => structuredClone(READING_V2_CANONICAL_FIXTURES[type]);
const source: ReadingV2AuthoringSourceRecord = {
  kind: 'reading-v2-import-source', schemaVersion: 1, sourceId: 'source-attempt', ownerId: 'teacher', createdAt: '2026-11-06T00:00:00Z', sourceKind: 'pasted-text',
  rawText: 'Question 1 supplied content', lineIndex: [{ lineId: 'l1', lineNumber: 1, rawText: 'Question 1 supplied content', normalizedText: 'Question 1 supplied content' }],
};
const contextFor = (document: ReadingV2Document): ReadingV2AuthoringContext => {
  const interaction = Object.values(document.interactions)[0];
  return { ...createReadingV2ManualAuthoringContext(), origin: { kind: 'import', sourceId: source.sourceId }, scope: { kind: 'supplied', requirementIds: ['required-q'] },
    requirements: [{ requirementId: 'required-q', kind: 'question', sourceId: source.sourceId, lineIds: ['l1'], target: { interactionId: interaction.interactionId, taskGroupId: interaction.taskGroupId } }] };
};
const evaluate = (document: ReadingV2Document, authoringContext = contextFor(document)) => evaluateReadingV2AuthoringReadiness({ document, metadata: { title: 'Test' }, authoringContext }, [source]);

describe('current Reading V2 authoring readiness', () => {
  it('retains all supplied structured full-test questions without requiring raw JSON associations', () => {
    const fixture = READING_V2_FULL_TEST_40_PASTE_IMPORT_FIXTURE;
    const candidate = createReadingV2ImportCandidateFromText({ text: fixture.rawText, answerKeyText: fixture.answerKeyText });
    const document = normalizeReadingV2ImportCandidate(candidate).document;
    const record = createReadingV2AuthoringSourceRecord({ sourceId: source.sourceId, ownerId: source.ownerId, createdAt: source.createdAt, candidate });
    const context = createReadingV2ImportAuthoringContext({ sourceId: source.sourceId, candidate, document });
    expect(context.requirements.filter((entry) => entry.kind === 'question')).toHaveLength(40);
    expect(evaluateReadingV2AuthoringReadiness({ document, metadata: { title: 'Test' }, authoringContext: JSON.parse(JSON.stringify(context)) }, [record]).canPublish).toBe(true);
    expect(record.rawText).toBe(fixture.rawText);
  });
  it('associates a complete people bank using its content when the supplied heading is wrong', () => {
    const document = documentFor('matching-features');
    const group = Object.values(document.taskGroups)[0];
    const options = document.optionSets[group.optionSetRefs[0]].options;
    const rawText = ['READING PASSAGE 1', 'Questions 6-13', 'List of People', ...options.map((option) => `${option.label}   ${option.text}`)].join('\n');
    const candidate = { ...createReadingV2ImportCandidateFromText({ text: rawText, sourceKind: 'pasted-text' }), sourceRawText: rawText };
    const context = createReadingV2ImportAuthoringContext({ sourceId: source.sourceId, candidate, document });
    const bank = context.requirements.find((item) => item.kind === 'bank');
    expect(bank).toMatchObject({ expectedTaskType: 'matching-features', target: { taskGroupId: group.taskGroupId } });
  });

  it('rejects incompatible bank links and classifies saved ones as an association issue', () => {
    const document = documentFor('yes-no-not-given');
    const group = Object.values(document.taskGroups)[0];
    const context: ReadingV2AuthoringContext = { ...createReadingV2ManualAuthoringContext(), scope: { kind: 'supplied', requirementIds: ['bank'] },
      requirements: [{ requirementId: 'bank', sourceId: source.sourceId, kind: 'bank', lineIds: ['l1'], expectedTaskType: 'matching-features',
        target: { taskGroupId: group.taskGroupId }, bankItems: [{ label: 'A', text: 'A person' }] }] };
    expect(() => bindReadingV2SourceRequirement(context, 'bank', { taskGroupId: group.taskGroupId }, document)).toThrow(/compatible/);
    expect(evaluate(document, context).blockingFindings).toEqual([expect.objectContaining({ code: 'source-bank-association-invalid', action: 'link' })]);
  });

  it.each([true, false])('uses passage location to disambiguate otherwise identical banks (passage supplied: %s)', (hasPassage) => {
    const bank = documentFor('matching-features');
    const other = documentFor('summary-completion-list');
    const bankGroup = Object.values(bank.taskGroups)[0];
    const otherGroup = Object.values(other.taskGroups)[0];
    const options = bank.optionSets[bankGroup.optionSetRefs[0]].options;
    const otherSet = other.optionSets[otherGroup.optionSetRefs[0]];
    other.optionSets[otherSet.optionSetId] = { ...otherSet, options: otherSet.options.map((option) => ({ ...option, text: options.find((item) => item.label === option.label)?.text ?? option.text })) };
    const document = { ...bank, sectionIds: [...bank.sectionIds, ...other.sectionIds], sections: { ...bank.sections, ...other.sections },
      stimuli: { ...bank.stimuli, ...other.stimuli }, anchors: { ...bank.anchors, ...other.anchors }, taskGroups: { ...bank.taskGroups, ...other.taskGroups },
      interactions: { ...bank.interactions, ...other.interactions }, optionSets: { ...bank.optionSets, ...other.optionSets } };
    const rawText = [...(hasPassage ? ['READING PASSAGE 1'] : []), 'Questions 6-13', 'Write the correct letter, A-E, in boxes 6-13.', ...options.map((option) => `${option.label}   ${option.text}`)].join('\n');
    const candidate = { ...createReadingV2ImportCandidateFromText({ text: rawText, sourceKind: 'pasted-text' }), sourceRawText: rawText };
    const context = createReadingV2ImportAuthoringContext({ sourceId: source.sourceId, candidate, document });
    expect(context.requirements.find((item) => item.kind === 'bank')?.target?.taskGroupId).toBe(hasPassage ? bankGroup.taskGroupId : undefined);
    if (hasPassage) {
      const requirement = context.requirements.find((item) => item.kind === 'bank')!;
      expect(() => bindReadingV2SourceRequirement(context, requirement.requirementId, { taskGroupId: otherGroup.taskGroupId }, document)).toThrow(/source passage/);
    }
  });

  it('keeps local source numbering and evidence distinct between passages', () => {
    const first = documentFor();
    const second = documentFor('true-false-not-given');
    const document = { ...first, sectionIds: [...first.sectionIds, ...second.sectionIds], sections: { ...first.sections, ...second.sections },
      stimuli: { ...first.stimuli, ...second.stimuli }, anchors: { ...first.anchors, ...second.anchors }, taskGroups: { ...first.taskGroups, ...second.taskGroups },
      interactions: Object.fromEntries([first, second].flatMap((part) => Object.entries(part.interactions).map(([id, interaction], index) => [id, { ...interaction, reviewLabel: { displayNumber: index + 1 } }]))),
      optionSets: { ...first.optionSets, ...second.optionSets } };
    const candidate = createReadingV2ImportCandidateFromText({ text: 'READING PASSAGE 1\nQuestions 1-2\n1 First passage item\n2 Second item\nREADING PASSAGE 2\nQuestions 1-2\n1 Other passage statement\n2 Other statement' });
    const context = createReadingV2ImportAuthoringContext({ sourceId: source.sourceId, candidate, document });
    const record = createReadingV2AuthoringSourceRecord({ sourceId: source.sourceId, ownerId: source.ownerId, createdAt: source.createdAt, candidate });
    const local = context.requirements.filter((entry) => entry.kind === 'question' && entry.sourceQuestionNumber === 1);
    expect(local).toHaveLength(2);
    expect(local.map((entry) => entry.target?.sectionId)).toEqual(document.sectionIds);
    expect(local.map((entry) => record.lineIndex.find((line) => entry.lineIds.includes(line.lineId))?.rawText)).toEqual(['1 First passage item', '1 Other passage statement']);
  });

  it('reads inline bank entries within their passage and reevaluates a saved malformed bank', () => {
    const document = documentFor('summary-completion-list');
    const group = Object.values(document.taskGroups)[0];
    const optionSet = document.optionSets[group.optionSetRefs[0]];
    const options = optionSet.options.slice(0, 3).map((option, index) => ({ ...option, label: String.fromCharCode(65 + index), text: `phrase ${index + 1}` }));
    document.optionSets[optionSet.optionSetId] = { ...optionSet, options };
    const rawText = 'READING PASSAGE 1\nQuestions 1-3\nWrite the correct letter, A-C, in boxes 1-3.\nA   phrase 1        B   phrase 2\nC   phrase 3\nREADING PASSAGE 2\nA different passage\nQuestions 4-5';
    const candidate = { ...createReadingV2ImportCandidateFromText({ text: rawText, sourceKind: 'pasted-text' }), sourceRawText: rawText };
    const record = createReadingV2AuthoringSourceRecord({ sourceId: source.sourceId, ownerId: source.ownerId, createdAt: source.createdAt, candidate });
    const context = createReadingV2ImportAuthoringContext({ sourceId: source.sourceId, candidate, document });
    const bank = context.requirements.find((item) => item.kind === 'bank')!;
    expect(bank.bankItems?.map(({ label, text }) => ({ label, text }))).toEqual(options.map(({ label, text }) => ({ label, text })));
    expect(bank.lineIds).not.toContain(record.lineIndex.find((line) => line.rawText === 'READING PASSAGE 2')!.lineId);
    const saved = { ...context, unboundTargets: [], scope: { kind: 'supplied' as const, requirementIds: [bank.requirementId] }, requirements: [{ ...bank, target: { taskGroupId: group.taskGroupId }, bankItems: [{ label: 'A', text: 'phrase 1        B   phrase 2' }, { label: 'C', text: 'phrase 3' }] }] };
    expect(evaluateReadingV2AuthoringReadiness({ document, metadata: { title: 'Test' }, authoringContext: saved }, [record]).findings).toEqual([]);
    document.optionSets[optionSet.optionSetId] = { ...optionSet, options: options.slice(0, 2) };
    expect(evaluateReadingV2AuthoringReadiness({ document, metadata: { title: 'Test' }, authoringContext: saved }, [record]).findings.map((finding) => finding.code)).toContain('source-bank-mismatch');
  });

  it('records an explicit bank wording correction but never confirms a missing source label', () => {
    const document = documentFor('summary-completion-list');
    const group = Object.values(document.taskGroups)[0];
    const optionSet = document.optionSets[group.optionSetRefs[0]];
    const option = optionSet.options[0];
    const context: ReadingV2AuthoringContext = { ...createReadingV2ManualAuthoringContext(), scope: { kind: 'supplied', requirementIds: ['bank'] },
      requirements: [{ requirementId: 'bank', sourceId: source.sourceId, kind: 'bank', lineIds: ['l1'], target: { taskGroupId: group.taskGroupId }, bankItems: [{ label: option.label, text: 'Original source wording' }] }] };
    expect(evaluate(document, context).findings.map((finding) => finding.code)).toContain('source-bank-mismatch');
    const interpretation = { requirementId: 'bank', actorId: 'teacher', updatedAt: source.createdAt };
    const confirmed = interpretReadingV2SourceRequirement(context, interpretation, document, source);
    const resumed = JSON.parse(JSON.stringify(confirmed));
    expect(evaluate(document, resumed).canPublish).toBe(true);
    expect(resumed.interpretations[0]).toMatchObject({ ...interpretation, bankItems: [{ optionId: option.optionId }] });
    const removed = { ...document, optionSets: { ...document.optionSets, [optionSet.optionSetId]: { ...optionSet, options: optionSet.options.slice(1) } } };
    expect(() => interpretReadingV2SourceRequirement(context, interpretation, removed, source)).toThrow(/Restore one option/);
    expect(evaluate(removed, resumed).findings.map((finding) => finding.code)).toContain('source-bank-mismatch');
  });

  it('uses current content rather than historical diagnostic strings or generic acceptance', () => {
    const document = documentFor();
    const group = Object.values(document.taskGroups)[0];
    const edited = { ...document, validationState: { issues: [{ code: 'unknown-old-error', severity: 'error' as const, message: 'No longer true' }] },
      taskGroups: { ...document.taskGroups, [group.taskGroupId]: { ...group, importEvidenceRefs: ['old-evidence' as never] } } };
    expect(evaluate(edited).canPublish).toBe(true);
  });

  it('retains missing source ownership through delete, renumber and unrelated replacement until explicitly linked', () => {
    const document = documentFor();
    const context = contextFor(document);
    const original = Object.values(document.interactions)[0];
    const replacementId = 'replacement' as typeof original.interactionId;
    const { [original.interactionId]: _removed, ...remaining } = document.interactions;
    const edited: ReadingV2Document = { ...document,
      interactions: { ...remaining, [replacementId]: { ...original, interactionId: replacementId, reviewLabel: { displayNumber: original.reviewLabel.displayNumber } } },
      taskGroups: { ...document.taskGroups, [original.taskGroupId]: { ...document.taskGroups[original.taskGroupId], interactionIds: document.taskGroups[original.taskGroupId].interactionIds.map((id) => id === original.interactionId ? replacementId : id) } } };
    const missing = evaluate(edited, context).findings.find((finding) => finding.code === 'source-question-missing');
    expect(missing).toMatchObject({ id: 'source-question-missing:required-q', target: { interactionId: original.interactionId }, action: 'add' });
    const bound = bindReadingV2SourceRequirement(context, 'required-q', { interactionId: replacementId, taskGroupId: original.taskGroupId }, edited);
    expect(evaluate(edited, bound).findings.some((finding) => finding.code === 'source-question-missing')).toBe(false);
  });

  it('keeps answer-slot coverage and concrete type interpretation while authored answers remain authority', () => {
    const document = documentFor();
    const context = contextFor(document);
    const requirement = context.requirements[0];
    const group = Object.values(document.taskGroups)[0];
    const withFacts: ReadingV2AuthoringContext = { ...context, scope: { kind: 'supplied', requirementIds: ['required-q', 'slot-2'] }, requirements: [
      { ...requirement, expectedTaskType: 'summary-completion-list' },
      { ...requirement, requirementId: 'slot-2', kind: 'answer-slot', answerSlotIndex: 1 },
    ] };
    expect(evaluate(document, withFacts).findings.map((finding) => finding.code)).toEqual(expect.arrayContaining(['source-task-type-mismatch', 'source-answer-slot-missing']));
    const corrected = interpretReadingV2SourceRequirement(withFacts, { requirementId: 'required-q', taskType: group.officialTaskType, actorId: 'teacher', updatedAt: source.createdAt }, document);
    expect(evaluate(document, corrected).findings.map((finding) => finding.code)).not.toContain('source-task-type-mismatch');
    expect(evaluate(document, corrected).findings.map((finding) => finding.code)).toContain('source-answer-slot-missing');
  });

  it('allows ordinary bank text edits but detects removal of a required bound option', () => {
    const document = documentFor('summary-completion-list');
    const group = Object.values(document.taskGroups)[0];
    const optionSet = document.optionSets[group.optionSetRefs[0]];
    const option = optionSet.options[0];
    const context: ReadingV2AuthoringContext = { ...createReadingV2ManualAuthoringContext(), origin: { kind: 'import', sourceId: source.sourceId },
      scope: { kind: 'supplied', requirementIds: ['bank'] }, requirements: [{ requirementId: 'bank', kind: 'bank', sourceId: source.sourceId, lineIds: ['l1'],
        target: { taskGroupId: group.taskGroupId }, bankItems: [{ label: option.label, text: option.text, optionId: option.optionId }] }] };
    const edited = { ...document, optionSets: { ...document.optionSets, [optionSet.optionSetId]: { ...optionSet, options: optionSet.options.map((entry) => ({ ...entry, text: 'Teacher authored text' })) } } };
    expect(evaluate(edited, context).findings.map((finding) => finding.code)).not.toContain('source-bank-mismatch');
    const removed = { ...edited, optionSets: { ...edited.optionSets, [optionSet.optionSetId]: { ...optionSet, options: optionSet.options.filter((entry) => entry.optionId !== option.optionId) } } };
    expect(evaluate(removed, context).findings.map((finding) => finding.code)).toContain('source-bank-mismatch');
  });

  it('retains ambiguous generated content and permits only an explicit supplied-line association', () => {
    const document = documentFor();
    const interaction = Object.values(document.interactions)[0];
    const context: ReadingV2AuthoringContext = { ...createReadingV2ManualAuthoringContext(), origin: { kind: 'import', sourceId: source.sourceId }, unboundTargets: [{ interactionId: interaction.interactionId }] };
    expect(evaluate(document, context).findings.map((finding) => finding.code)).toContain('source-content-unbound');
    expect(() => associateReadingV2ImportedContent(context, { target: { interactionId: interaction.interactionId }, sourceId: source.sourceId, lineIds: ['absent'], actorId: 'teacher', updatedAt: source.createdAt }, document, source)).toThrow();
    const associated = associateReadingV2ImportedContent(context, { target: { interactionId: interaction.interactionId }, sourceId: source.sourceId, lineIds: ['l1'], actorId: 'teacher', updatedAt: source.createdAt }, document, source);
    expect(evaluate(document, associated).findings.map((finding) => finding.code)).not.toContain('source-content-unbound');
  });

  it('captures actual supplied text and alternate Q2 numbering once without guessing replacement ownership', () => {
    const document = documentFor();
    const candidate = { ...createReadingV2ImportCandidateFromText({ text: 'Question 1 First item\nQ2 Second item', sourceKind: 'pasted-text' }), sourceRawText: 'Question 1 First item\nQ2 Second item' };
    const record = createReadingV2AuthoringSourceRecord({ sourceId: source.sourceId, ownerId: source.ownerId, createdAt: source.createdAt, candidate });
    const context = createReadingV2ImportAuthoringContext({ sourceId: source.sourceId, candidate, document });
    expect(record.rawText).toBe(candidate.sourceRawText);
    expect(context.requirements.filter((item) => item.kind === 'question').map((item) => item.requirementId)).toContain(`${source.sourceId}:question:2`);
  });

  it('keeps a separate answer key durable and lets the teacher explicitly narrow an extra row', () => {
    const document = documentFor();
    const interaction = Object.values(document.interactions)[0];
    const authored = { ...document, interactions: { ...document.interactions, [interaction.interactionId]: { ...interaction, reviewLabel: { displayNumber: 1 }, promptText: 'Question one' } } };
    const candidate = createReadingV2ImportCandidateFromText({ text: 'READING PASSAGE 1\nQuestions 1-1\nQuestion one', answerKeyText: '1 one\n41 stray' });
    const context = createReadingV2ImportAuthoringContext({ sourceId: source.sourceId, candidate, document: authored });
    const record = createReadingV2AuthoringSourceRecord({ sourceId: source.sourceId, ownerId: source.ownerId, createdAt: source.createdAt, candidate });
    expect(record.teacherAnswerKey?.rows.map((row) => row.questionNumber)).toEqual([1, 41]);
    const before = evaluateReadingV2AuthoringReadiness({ document: authored, metadata: { title: 'Test' }, authoringContext: context }, [record]);
    const extra = before.findings.find((finding) => finding.code === 'source-answer-key-unbound');
    expect(extra).toBeDefined();
    const corrected = resolveReadingV2AnswerKeyRow(context, extra!.target.sourceRequirementId!, authored, 'teacher', source.createdAt);
    expect(evaluateReadingV2AuthoringReadiness({ document: authored, metadata: { title: 'Test' }, authoringContext: corrected }, [record]).findings).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: 'source-answer-key-unbound' })]));
  });

  it('does not turn an embedded key row into a required question', () => {
    const candidate = createReadingV2ImportCandidateFromText({ text: 'Questions 1-2\n1 First ___\n2 Second ___\n### Answer key\nQ1 stone\nQ2 wood\nQ41 stray' });
    const context = createReadingV2ImportAuthoringContext({ sourceId: source.sourceId, candidate, document: documentFor() });
    expect(context.requirements.filter((entry) => entry.kind === 'question').map((entry) => entry.sourceQuestionNumber)).toEqual([1, 2]);
    expect(context.requirements.some((entry) => entry.kind === 'answer-key' && entry.sourceQuestionNumber === 41)).toBe(true);
  });

  it('reevaluates concrete source instruction facts after correction rather than replaying import diagnostics', () => {
    const fixture = documentFor();
    const document = { ...fixture, interactions: Object.fromEntries(Object.entries(fixture.interactions).map(([id, interaction], index) => [id, { ...interaction, reviewLabel: { displayNumber: index + 1 } }])) };
    const group = Object.values(document.taskGroups)[0];
    const candidate = createReadingV2ImportCandidateFromText({ text: 'READING PASSAGE 1\nQuestions 1-2\nChoose ONE WORD ONLY from the passage.\n1 First ___\n2 Second ___', sourceKind: 'auto-gemini' });
    const context = createReadingV2ImportAuthoringContext({ sourceId: source.sourceId, candidate, document });
    const record = createReadingV2AuthoringSourceRecord({ sourceId: source.sourceId, ownerId: source.ownerId, createdAt: source.createdAt, candidate });
    const before = evaluateReadingV2AuthoringReadiness({ document, metadata: { title: 'Test' }, authoringContext: context }, [record]);
    const issue = before.findings.find((finding) => finding.code === 'source-instruction-mismatch');
    expect(issue).toBeDefined();
    const corrected = restoreReadingV2SourceInstruction(context, issue!.target.sourceRequirementId!, document);
    expect(evaluateReadingV2AuthoringReadiness({ document: corrected, metadata: { title: 'Test' }, authoringContext: context }, [record]).findings).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: 'source-instruction-mismatch' })]));
    const interpreted = interpretReadingV2SourceRequirement(context, { requirementId: issue!.target.sourceRequirementId!, actorId: 'teacher', updatedAt: source.createdAt }, document);
    expect(interpreted.interpretations[0].instructionFacts?.wordLimit).toBe(group.answerRule.wordLimit);
    expect(evaluateReadingV2AuthoringReadiness({ document: corrected, metadata: { title: 'Test' }, authoringContext: interpreted }, [record]).findings.map((entry) => entry.code)).toContain('source-instruction-mismatch');
  });

  it('detects an internally valid choose-three import when the source requires choose-two', () => {
    const fixture = documentFor('multiple-select');
    const group = Object.values(fixture.taskGroups)[0];
    const document = { ...fixture,
      taskGroups: { ...fixture.taskGroups, [group.taskGroupId]: { ...group,
        instructionBlocks: [{ id: 'choice-rule', text: 'Choose THREE letters, A-E.' }],
        answerRule: { ...group.answerRule, responseShape: { ...group.answerRule.responseShape, selectionLimit: 3 } } } },
      interactions: Object.fromEntries(Object.entries(fixture.interactions).map(([id, interaction], index) => [id, { ...interaction,
        responseShape: { ...interaction.responseShape, selectionLimit: 3 }, reviewLabel: { displayNumber: index * 3 + 1, answerSlotCount: 3 },
        scoringRule: { ...interaction.scoringRule, maxScore: 3, acceptableAnswers: ['A', 'B', 'C'] } }])) };
    const candidate = createReadingV2ImportCandidateFromText({ text: 'Questions 1-6\nChoose TWO letters, A-E.\n1 First pair\n3 Second pair\n5 Third pair', sourceKind: 'auto-gemini' });
    const context = createReadingV2ImportAuthoringContext({ sourceId: source.sourceId, candidate, document });
    const record = createReadingV2AuthoringSourceRecord({ sourceId: source.sourceId, ownerId: source.ownerId, createdAt: source.createdAt, candidate });
    const readiness = evaluateReadingV2AuthoringReadiness({ document, metadata: { title: 'Test' }, authoringContext: context }, [record]);
    expect(readiness.validationResult.blockingIssues).toEqual([]);
    expect(readiness.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'source-instruction-mismatch' })]));
    const issue = readiness.findings.find((entry) => entry.code === 'source-instruction-mismatch')!;
    const restored = restoreReadingV2SourceInstruction(context, issue.target.sourceRequirementId!, document);
    expect(Object.values(restored.interactions).every((entry) => entry.responseShape.kind === 'multi-select'
      && entry.responseShape.selectionLimit === 2 && entry.reviewLabel.answerSlotCount === 2 && entry.scoringRule.maxScore === 2)).toBe(true);
    expect(Object.values(restored.interactions)[0].scoringRule.acceptableAnswers).toEqual(['A', 'B', 'C']);
    const deliberate = recordReadingV2AuthoredInstructionEdit(context, restored, document, group.taskGroupId, 'teacher', source.createdAt);
    const resumed = JSON.parse(JSON.stringify(deliberate));
    expect(evaluateReadingV2AuthoringReadiness({ document, metadata: { title: 'Test' }, authoringContext: resumed }, [record]).canPublish).toBe(true);
    expect(resumed.requirements.find((entry) => entry.kind === 'instruction').instructionFacts.selectionLimit).toBe(2);
    expect(recordReadingV2AuthoredInstructionEdit(deliberate, document, { ...document, title: 'Edited title' }, group.taskGroupId, 'teacher', source.createdAt)).toBe(deliberate);
  });

  it('compares number allowance separately from the word limit and restores it without replacing answers', () => {
    const fixture = documentFor();
    const group = Object.values(fixture.taskGroups)[0];
    const document = { ...fixture, taskGroups: { ...fixture.taskGroups, [group.taskGroupId]: { ...group,
      instructionBlocks: [{ id: 'words', text: 'Choose ONE WORD ONLY.' }],
      answerRule: { ...group.answerRule, wordLimit: 1, responseShape: { kind: 'free-text' as const, wordLimit: 1 } } } },
      interactions: Object.fromEntries(Object.entries(fixture.interactions).map(([id, interaction], index) => [id, { ...interaction,
        reviewLabel: { displayNumber: index + 1 }, responseShape: { kind: 'free-text' as const, wordLimit: 1 }, scoringRule: { ...interaction.scoringRule, acceptableAnswers: ['stone'] } }])) };
    const candidate = createReadingV2ImportCandidateFromText({ text: 'Questions 1-2\nChoose ONE WORD AND/OR A NUMBER.\n1 First ___\n2 Second ___' });
    const context = createReadingV2ImportAuthoringContext({ sourceId: source.sourceId, candidate, document });
    const record = createReadingV2AuthoringSourceRecord({ sourceId: source.sourceId, ownerId: source.ownerId, createdAt: source.createdAt, candidate });
    const readiness = evaluateReadingV2AuthoringReadiness({ document, metadata: { title: 'Test' }, authoringContext: context }, [record]);
    expect(readiness.validationResult.canPublish).toBe(true);
    const issue = readiness.findings.find((entry) => entry.code === 'source-instruction-mismatch');
    expect(issue).toBeDefined();
    const restored = restoreReadingV2SourceInstruction(context, issue!.target.sourceRequirementId!, document);
    expect(restored.interactions).toEqual(document.interactions);
    expect(evaluateReadingV2AuthoringReadiness({ document: restored, metadata: { title: 'Test' }, authoringContext: context }, [record]).canPublish).toBe(true);
  });

  it('cannot clear missing later-slot coverage by linking to the first slot', () => {
    const document = documentFor();
    const interaction = Object.values(document.interactions)[0];
    const context: ReadingV2AuthoringContext = { ...contextFor(document), requirements: [{ ...contextFor(document).requirements[0], kind: 'answer-slot', answerSlotIndex: 1 }] };
    expect(() => bindReadingV2SourceRequirement(context, 'required-q', { interactionId: interaction.interactionId }, document)).toThrow(/answer slot/);
    expect(evaluate(document, context).findings.map((entry) => entry.code)).toContain('source-answer-slot-missing');
  });

  it('checks paired answer slots when relinking a source question', () => {
    const document = documentFor('multiple-select');
    const interaction = Object.values(document.interactions)[0];
    document.interactions[interaction.interactionId] = { ...interaction, reviewLabel: { ...interaction.reviewLabel, answerSlotCount: 2 },
      scoringRule: { ...interaction.scoringRule, maxScore: 2 } };
    const target = { interactionId: interaction.interactionId };
    const context: ReadingV2AuthoringContext = { ...contextFor(document), requirements: [
      { requirementId: 'first-slot', kind: 'answer-slot', sourceId: source.sourceId, lineIds: [], sourceQuestionNumber: 1, answerSlotIndex: 0, target },
      { requirementId: 'second-question', kind: 'question', sourceId: source.sourceId, lineIds: [], sourceQuestionNumber: 2, answerSlotIndex: 1 },
      { requirementId: 'second-slot', kind: 'answer-slot', sourceId: source.sourceId, lineIds: [], sourceQuestionNumber: 2, answerSlotIndex: 1 },
    ] };
    expect(() => bindReadingV2SourceRequirement(context, 'second-question', { ...target, answerSlotIndex: 0 }, document)).toThrow(/unassigned answer slot/);
    const corrected = bindReadingV2SourceRequirement(context, 'second-question', target, document);
    expect(corrected.requirements.find((entry) => entry.requirementId === 'second-slot')).toMatchObject({ target, answerSlotIndex: 1 });
  });

  it('narrows an inferred heading range while keeping every visible source question', () => {
    const document = documentFor();
    const candidate = createReadingV2ImportCandidateFromText({ text: 'Questions 1-5\nChoose ONE WORD ONLY.\n1 First ___\n2 Second ___\n4 Fourth ___' });
    const record = createReadingV2AuthoringSourceRecord({ sourceId: source.sourceId, ownerId: source.ownerId, createdAt: source.createdAt, candidate });
    const context = createReadingV2ImportAuthoringContext({ sourceId: source.sourceId, candidate, document });
    const inferred = context.requirements.find((entry) => entry.kind === 'question' && entry.sourceQuestionNumber === 5)!;
    expect(() => correctReadingV2SourceQuestionRange(context, inferred.requirementId, 1, 3, record, 'teacher', source.createdAt)).toThrow(/Visible source questions/);
    const corrected = correctReadingV2SourceQuestionRange(context, inferred.requirementId, 1, 4, record, 'teacher', source.createdAt);
    expect(corrected.requirements).toEqual(context.requirements);
    expect(corrected.scope.requirementIds).not.toContain(inferred.requirementId);
    expect(corrected.scope.requirementIds).not.toContain(`${source.sourceId}:slot:5`);
    expect(corrected.scope.requirementIds).toContain(`${source.sourceId}:question:4`);
  });

  it('retains headerless passage omissions and only accepts a represented corrected source span', () => {
    const document = documentFor();
    const stimulus = Object.values(document.stimuli)[0];
    const rawText = 'A complete source passage has a long opening paragraph.\n\nA second source paragraph must also be retained.\n\nQuestions 1-2\nChoose ONE WORD ONLY.\n1 First ___\n2 Second ___';
    const candidate = createReadingV2ImportCandidateFromText({ text: rawText, sourceKind: 'auto-gemini' });
    const record = createReadingV2AuthoringSourceRecord({ sourceId: source.sourceId, ownerId: source.ownerId, createdAt: source.createdAt, candidate });
    const context = createReadingV2ImportAuthoringContext({ sourceId: source.sourceId, candidate, document });
    const passage = context.requirements.find((entry) => entry.kind === 'passage')!;
    expect(passage.passageNeedsComparison).toBe(true);
    expect(evaluateReadingV2AuthoringReadiness({ document, metadata: { title: 'Test' }, authoringContext: context }, [record]).findings.map((entry) => entry.code)).toContain('source-passage-incomplete');
    expect(() => correctReadingV2PassageSourceSpan(context, passage.requirementId, passage.lineIds, document, record, 'teacher', source.createdAt)).toThrow(/Restore missing text/);
    if (stimulus.content.kind !== 'passage-content') throw new Error('Expected passage fixture');
    const restored = { ...document, stimuli: { ...document.stimuli, [stimulus.stimulusId]: { ...stimulus, content: { ...stimulus.content, paragraphs: stimulus.content.paragraphs.map((paragraph, index) => ({ ...paragraph, text: index === 0 ? passage.sourceText! : '' })) } } } };
    expect(evaluateReadingV2AuthoringReadiness({ document: restored, metadata: { title: 'Test' }, authoringContext: context }, [record]).findings.map((entry) => entry.code)).not.toContain('source-passage-incomplete');
    const explicit = { ...context, requirements: context.requirements.map((entry) => entry.requirementId === passage.requirementId ? { ...entry, sourcePassageNumber: 1 } : entry) };
    expect(() => correctReadingV2PassageSourceSpan(explicit, passage.requirementId, [passage.lineIds[0]], restored, record, 'teacher', source.createdAt)).toThrow(/Restore missing text/);
  });

  it('will not dismiss a malformed bound key until its authored answer is valid', () => {
    const document = documentFor();
    const interaction = Object.values(document.interactions)[0];
    const requirement = { requirementId: 'key', kind: 'answer-key' as const, sourceId: source.sourceId, lineIds: ['l1'], answerKeyStatus: 'duplicate' as const, target: { interactionId: interaction.interactionId } };
    const context = { ...contextFor(document), requirements: [requirement], scope: { kind: 'supplied' as const, requirementIds: ['key'] } };
    const incomplete = { ...document, interactions: { ...document.interactions, [interaction.interactionId]: { ...interaction, scoringRule: { ...interaction.scoringRule, acceptableAnswers: [] } } } };
    expect(() => resolveReadingV2AnswerKeyRow(context, 'key', incomplete, 'teacher', source.createdAt)).toThrow(/authored answer/);
    const corrected = resolveReadingV2AnswerKeyRow(context, 'key', document, 'teacher', source.createdAt);
    expect(evaluate(document, corrected).findings.map((entry) => entry.code)).not.toContain('source-answer-key-invalid');
    expect(evaluate(incomplete, corrected).canPublish).toBe(false);
  });
});
