import type { ParsedTest, ParsedSection } from './thcsDocumentParser.service';
import { convertParsedToThcsDraft } from './thcs-draft-converter';

export interface ThcsImportIssue {
    kind: 'skipped-content' | 'unusable-structure';
    message: string;
    sectionIndex?: number;
}

const hasQuestionContent = (section: ParsedSection) => section.questions.some(question =>
    question.text.trim() || question.options?.some(option => option.trim()) || section.passageText?.trim());

/** Mechanical loss only: confidence and answer completeness belong in the editor. */
export function classifyThcsImportAttention(parsed: ParsedTest, rawInput: string): ThcsImportIssue[] {
    const issues: ThcsImportIssue[] = [];
    for (const skipped of parsed._pipelineDebug?.skippedSections ?? []) {
        issues.push({ kind: 'skipped-content', message: skipped.reason });
    }
    for (const warning of parsed.warnings ?? []) {
        // This historical warning describes the parser used, not discarded content.
        if (warning.type === 'skipped-content' && warning.message.startsWith('Using fallback regex parser.')) continue;
        if (warning.type === 'skipped-content' || warning.type === 'skipped-section') {
            if (!issues.some(issue => issue.message === warning.message)) {
                issues.push({ kind: 'skipped-content', message: warning.message });
            }
        }
    }
    if (!parsed.sections.length) issues.push({ kind: 'unusable-structure', message: 'No editable sections were found.' });
    parsed.sections.forEach((section, sectionIndex) => {
        if (!hasQuestionContent(section) || section.detectedType === 'raw-text-fallback'
            || section.questions.some(question => question.options && question.options.length > 4)) {
            issues.push({ kind: 'unusable-structure', sectionIndex, message: `${section.name || `Section ${sectionIndex + 1}`} could not be mapped safely.` });
        }
    });
    const parsedNumbers = new Set(parsed.sections.flatMap(section => section.questions.map(question => question.questionNumber)));
    // Explicit question labels are evidence; bare numbers may be answer keys or passage text.
    const sourceNumbers = [...rawInput.matchAll(/^\s*(?:Question|Câu|Q\.?)\s*(\d+)\s*[.):]/gimu)].map(match => Number(match[1]));
    const missingNumbers = [...new Set(sourceNumbers.filter(number => !parsedNumbers.has(number)))];
    if (missingNumbers.length) issues.push({ kind: 'skipped-content', message: `Source questions were not imported: ${missingNumbers.join(', ')}.` });
    return issues;
}

export function resolveThcsImportAttention(parsed: ParsedTest, rawInput: string, resolution: 'keep-source' | 'discard') {
    const issues = classifyThcsImportAttention(parsed, rawInput);
    const excluded = new Set(issues.flatMap(issue => issue.sectionIndex === undefined ? [] : [issue.sectionIndex]));
    const draft = convertParsedToThcsDraft({ ...parsed, sections: parsed.sections.filter((_, index) => !excluded.has(index)) });
    if (resolution === 'keep-source' && issues.length && rawInput.trim()) {
        // AI line ranges refer to rewritten text. Preserve the entire input rather than guess source slices.
        const questionNumber = Math.max(0, ...draft.sections.flatMap(section => section.questions.map(question => question.questionNumber))) + 1;
        const sourceSection: (typeof draft.sections)[number] & { rawText: string; isRawTextFallback: boolean; importSourceNeedsReview: boolean } = {
            id: crypto.randomUUID(), name: 'Original source · editable text', order: draft.sections.length,
            instructionText: 'Review the original source and edit this section manually.', isCustomInstruction: true,
            pointMode: 'manual', totalPoints: 0, defaultQuestionType: 'raw-text-fallback',
            shuffle: false, shuffleOptions: false, layout: 'single-column',
            rawText: rawInput, isRawTextFallback: true, importSourceNeedsReview: true,
            questions: [{ id: crypto.randomUUID(), questionNumber, type: 'raw-text-fallback', questionText: rawInput,
                options: ['', '', '', ''], correctAnswer: '' }],
        };
        draft.sections.push(sourceSection);
    }
    return draft;
}
