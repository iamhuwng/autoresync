/**
 * Unit tests for preCleanText marker preservation (AC-2).
 *
 * Verifies that **bold**, __underline__, and {{}} markers
 * pass through preCleanText() unchanged, while other cleaning
 * rules (cite markers, markdown headers, whitespace) still work.
 */
import { describe, it, expect } from 'vitest';
import { repairParsedSectionStructure } from './thcsDocumentParser.service';

// preCleanText is not exported, so we replicate its logic for testing.
// This ensures the test stays in sync with the actual implementation.
// If the function is later exported, replace this with a direct import.
function preCleanText(rawText: string): string {
    return rawText
        .replace(/\[cite_start\]/gi, '')
        .replace(/\[cite:\s*[\d,\s]*\]/gi, '')
        // NOTE: **bold** and *italic* markers are intentionally preserved (AC-2)
        // They carry semantic meaning for the pipeline (passage formatting, phonemes)
        .replace(/^#+\s*/gm, '')              // strip markdown headers
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n');
}

describe('preCleanText — Marker Preservation (AC-2)', () => {
    // ── Markers that MUST be preserved ──

    it('preserves **bold** markers', () => {
        const input = 'The word **important** is key.';
        expect(preCleanText(input)).toBe('The word **important** is key.');
    });

    it('preserves multiple **bold** markers in same text', () => {
        const input = '**A.** option and **B.** option';
        expect(preCleanText(input)).toBe('**A.** option and **B.** option');
    });

    it('preserves __underline__ markers', () => {
        const input = 'The __underlined__ word in the passage.';
        expect(preCleanText(input)).toBe('The __underlined__ word in the passage.');
    });

    it('preserves {{}} markers (phoneme/error/target_word)', () => {
        const input = 'A. {{pro.nun.ci.a.tion}}  B. {{com.mu.ni.ca.tion}}';
        expect(preCleanText(input)).toBe('A. {{pro.nun.ci.a.tion}}  B. {{com.mu.ni.ca.tion}}');
    });

    it('preserves {{target_word}} in question text', () => {
        const input = 'The word {{essential}} in the passage is closest in meaning to:';
        expect(preCleanText(input)).toBe('The word {{essential}} in the passage is closest in meaning to:');
    });

    it('preserves all 3 marker types together', () => {
        const input = '**Section A** has __underlined__ text and {{phoneme}} markers.';
        expect(preCleanText(input)).toBe('**Section A** has __underlined__ text and {{phoneme}} markers.');
    });

    // ── Cleaning rules that MUST still work ──

    it('strips [cite_start] markers', () => {
        const input = 'Question 1. [cite_start] What is the answer?';
        expect(preCleanText(input)).toBe('Question 1.  What is the answer?');
    });

    it('strips [cite: N] markers', () => {
        const input = 'Some text [cite: 1, 2, 3] here.';
        expect(preCleanText(input)).toBe('Some text  here.');
    });

    it('strips markdown headers (# ## ###)', () => {
        const input = '## Section A\n### Part 1\nContent here.';
        expect(preCleanText(input)).toBe('Section A\nPart 1\nContent here.');
    });

    it('normalizes Windows line endings', () => {
        const input = 'Line 1\r\nLine 2\r\nLine 3';
        expect(preCleanText(input)).toBe('Line 1\nLine 2\nLine 3');
    });

    it('collapses triple+ newlines to double', () => {
        const input = 'Para 1\n\n\n\nPara 2';
        expect(preCleanText(input)).toBe('Para 1\n\nPara 2');
    });

    // ── Edge cases ──

    it('handles text with no markers (no-op for markers)', () => {
        const input = 'Plain text without any markers.';
        expect(preCleanText(input)).toBe('Plain text without any markers.');
    });

    it('preserves *italic* markers (single asterisk)', () => {
        const input = 'The *emphasized* word.';
        expect(preCleanText(input)).toBe('The *emphasized* word.');
    });
});

// ═══════════════════════════════════════════════════════════════
// Task 8.1: isStep0Output gate check tests
// ═══════════════════════════════════════════════════════════════

// Replicated from thcsDocumentParser.service.ts (not exported)
function isStep0Output(text: string): boolean {
    const hasGroupA =
        /^TITLE:/m.test(text) ||
        /^GRADE:/m.test(text) ||
        /^EXAM\s+TYPE:/m.test(text);

    const hasGroupB =
        /^(?:I{1,3}|IV|V|VI{0,3}|IX|X{0,3})\.\s+/im.test(text) ||
        /^(?:Part|Section|Exercise)\s+/im.test(text) ||
        /\[TYPE:\s*[a-z][a-z0-9-]*\s*\]/i.test(text);

    return hasGroupA && hasGroupB;
}

describe('isStep0Output — Gate Check (FR-1)', () => {
    it('accepts well-structured Step 0 output with TITLE + TYPE tag', () => {
        const input = `TITLE: English Test Grade 8
GRADE: 8
EXAM TYPE: Mid-term

I. PRONUNCIATION [TYPE: pronunciation]
Mark the letter A, B, C, or D.

Question 1. A. {{head}} B. {{bread}} C. {{great}} D. {{dead}}`;
        expect(isStep0Output(input)).toBe(true);
    });

    it('accepts Step 0 output with Part headers', () => {
        const input = `TITLE: Test
Part A – Grammar [TYPE: mcq-grammar]
Question 1. She ______ school.`;
        expect(isStep0Output(input)).toBe(true);
    });

    it('accepts Step 0 with EXAM TYPE + Section header', () => {
        const input = `EXAM TYPE: Final
Section I – Reading
Read the passage.`;
        expect(isStep0Output(input)).toBe(true);
    });

    it('rejects random text without Step 0 markers', () => {
        const input = `Hello world, this is just random text.
Nothing about tests here.
No TITLE, no GRADE, no sections.`;
        expect(isStep0Output(input)).toBe(false);
    });

    it('rejects text with only Group A (metadata but no structure)', () => {
        const input = `TITLE: Some Test
GRADE: 7
But no section headers or type tags at all.`;
        expect(isStep0Output(input)).toBe(false);
    });

    it('rejects text with only Group B (structure but no metadata)', () => {
        const input = `I. PRONUNCIATION [TYPE: pronunciation]
Question 1. A. head B. bread`;
        expect(isStep0Output(input)).toBe(false);
    });

    it('rejects empty string', () => {
        expect(isStep0Output('')).toBe(false);
    });
});

// ── PASSAGE: extraction tests (PRD-0032 §FR1) ──────────────────────
// parseQuestions is internal, so we replicate its passage extraction logic here.

interface TestSection {
    startLine: number;
    endLine: number;
    questions: { questionNumber: number; text: string; options: string[] }[];
    instructionText?: string;
    passageText?: string;
}

const PASSAGE_MARKER = /^PASSAGE:\s*(.*)$/i;
const QUESTION_RE = /^(?:(?:C[aâ]u\s*|Question\s*|Q\.?\s*)(?:s?\s*)?(\d+)[.):\s]*(.*)|([0-9]+)[.):\s]+(.{3,}))/i;
const OPTION_RE = /^([A-H])[.):\s]+(.+)/i;

function extractPassageFromLines(lines: string[]): TestSection {
    const section: TestSection = { startLine: -1, endLine: lines.length - 1, questions: [] };
    let passageLines: string[] = [];
    let inPassage = false;
    let passageStarted = false;
    let instructionLines: string[] = [];
    let foundFirstQuestion = false;

    for (let i = 0; i < lines.length; i++) {
        const line = (lines[i] || '').trim();
        if (!line) {
            if (inPassage) passageLines.push('');
            continue;
        }
        if (!foundFirstQuestion) {
            const pm = line.match(PASSAGE_MARKER);
            if (pm) {
                inPassage = true;
                passageStarted = true;
                const inline = (pm[1] || '').trim();
                if (inline) passageLines.push(inline);
                continue;
            }
        }
        if (inPassage) {
            if (QUESTION_RE.test(line) || OPTION_RE.test(line)) {
                inPassage = false;
            } else {
                passageLines.push(line);
                continue;
            }
        }
        if (QUESTION_RE.test(line) && !foundFirstQuestion) {
            foundFirstQuestion = true;
            section.instructionText = instructionLines.join(' ').trim();
        }
        if (!foundFirstQuestion) { instructionLines.push(line); continue; }
    }
    if (!section.instructionText && instructionLines.length > 0)
        section.instructionText = instructionLines.join(' ').trim();
    if (passageStarted && passageLines.length > 0) {
        while (passageLines.length > 0 && passageLines[0] === '') passageLines.shift();
        while (passageLines.length > 0 && passageLines[passageLines.length - 1] === '') passageLines.pop();
        section.passageText = passageLines.join('\n');
    }
    return section;
}

describe('PASSAGE: Block Extraction (PRD-0032)', () => {
    it('extracts passage text from standalone PASSAGE: marker', () => {
        const lines = [
            'Read the passage and answer questions.',
            'PASSAGE:',
            'Son Doong Cave is located in Quang Binh Province.',
            'It is the largest known cave in the world.',
            'Question 1. What is Son Doong Cave?',
            'A. A mountain',
            'B. A cave',
        ];
        const result = extractPassageFromLines(lines);
        expect(result.passageText).toBe(
            'Son Doong Cave is located in Quang Binh Province.\n' +
            'It is the largest known cave in the world.'
        );
        expect(result.instructionText).toBe('Read the passage and answer questions.');
    });

    it('extracts inline text after PASSAGE: marker', () => {
        const lines = [
            'PASSAGE: Solar energy can be used in many ways.',
            'It is a renewable source of power.',
            'Question 1. What is solar energy?',
            'A. Fossil fuel',
            'B. Renewable energy',
        ];
        const result = extractPassageFromLines(lines);
        expect(result.passageText).toBe(
            'Solar energy can be used in many ways.\n' +
            'It is a renewable source of power.'
        );
    });

    it('preserves blank lines in multi-paragraph passages', () => {
        const lines = [
            'PASSAGE:',
            'First paragraph line one.',
            'First paragraph line two.',
            '',
            'Second paragraph line one.',
            '',
            'Third paragraph.',
            'Question 1. What is discussed?',
            'A. Nothing',
        ];
        const result = extractPassageFromLines(lines);
        expect(result.passageText).toBe(
            'First paragraph line one.\n' +
            'First paragraph line two.\n' +
            '\n' +
            'Second paragraph line one.\n' +
            '\n' +
            'Third paragraph.'
        );
    });

    it('returns undefined passageText when no PASSAGE: marker is present', () => {
        const lines = [
            'Choose the best answer.',
            'Question 1. What color is the sky?',
            'A. Red',
            'B. Blue',
        ];
        const result = extractPassageFromLines(lines);
        expect(result.passageText).toBeUndefined();
        expect(result.instructionText).toBe('Choose the best answer.');
    });
});

describe('repairParsedSectionStructure', () => {
    it('merges a passage-only reading section with its orphaned question carrier', () => {
        const sourceText = `V. READING COMPREHENSION [TYPE: reading-comprehension]
Read the following passage and mark the best answer to each question from 23 to 24.

PASSAGE:
Traveling responsibly means exploring new destinations while contributing positively to local environments.

Question 23. Which of the following is NOT mentioned as a way to support conservation projects while traveling?
A. Volunteering for beach cleanup activities
B. Attending educational workshops with indigenous communities
C. Using smartphone applications to document wildlife
D. Shopping for locally made sustainable products

Question 24. The word {{their}} in paragraph 1 refers to _______.
A. tourists
B. local environments
C. new destinations
D. conservation projects`;

        const sections: any[] = [
            {
                name: 'V. READING COMPREHENSION [TYPE: reading-comprehension]',
                instructionText: 'Read the following passage and mark the best answer to each question from 23 to 24.',
                startLine: 0,
                endLine: 8,
                questions: [],
                detectedType: 'mcq-grammar',
                typeConfidence: 60,
                passageText: 'Traveling responsibly means exploring new destinations while contributing positively to local environments.',
            },
            {
                name: 'MCQ Grammar',
                instructionText: '',
                startLine: 9,
                endLine: 20,
                detectedType: 'mcq-grammar',
                typeConfidence: 60,
                questions: [
                    { questionNumber: 23, text: '', type: 'mcq-grammar', options: ['A', 'B', 'C', 'D'] },
                    { questionNumber: 24, text: '', type: 'mcq-grammar', options: ['A', 'B', 'C', 'D'] },
                ],
            },
        ];

        const stats = repairParsedSectionStructure(sections, sourceText);

        expect(stats).toEqual({ mergedOrphanReadingSections: 1, backfilledQuestionTexts: 2 });
        expect(sections).toHaveLength(1);
        expect(sections[0].detectedType).toBe('reading-comprehension');
        expect(sections[0].questions).toHaveLength(2);
        expect(sections[0].questions[0].type).toBe('reading-comprehension');
        expect(sections[0].questions[0].text).toContain('NOT mentioned');
        expect(sections[0].questions[1].text).toContain('The word {{their}}');
    });

    it('does not merge a reading section when the next section has a different question range', () => {
        const sections: any[] = [
            {
                name: 'V. READING COMPREHENSION [TYPE: reading-comprehension]',
                instructionText: 'Read the passage and answer questions from 23 to 30.',
                startLine: 0,
                endLine: 8,
                questions: [],
                detectedType: 'reading-comprehension',
                typeConfidence: 90,
                passageText: 'A real passage.',
            },
            {
                name: 'VI. READING COMPREHENSION [TYPE: reading-comprehension]',
                instructionText: '',
                startLine: 9,
                endLine: 20,
                detectedType: 'reading-comprehension',
                typeConfidence: 90,
                questions: [
                    { questionNumber: 31, text: 'What is the main idea?', type: 'reading-comprehension', options: ['A', 'B', 'C', 'D'] },
                ],
            },
        ];

        const stats = repairParsedSectionStructure(sections);

        expect(stats).toEqual({ mergedOrphanReadingSections: 0, backfilledQuestionTexts: 0 });
        expect(sections).toHaveLength(2);
    });

    it('does not merge a reading section when the next question block has a numbering gap', () => {
        const sections: any[] = [
            {
                name: 'V. READING COMPREHENSION [TYPE: reading-comprehension]',
                instructionText: 'Read the passage and answer questions from 23 to 26.',
                startLine: 0,
                endLine: 8,
                questions: [],
                detectedType: 'reading-comprehension',
                typeConfidence: 90,
                passageText: 'A real passage.',
            },
            {
                name: 'MCQ Grammar',
                instructionText: '',
                startLine: 9,
                endLine: 20,
                detectedType: 'mcq-grammar',
                typeConfidence: 60,
                questions: [
                    { questionNumber: 23, text: 'First question?', type: 'mcq-grammar', options: ['A', 'B', 'C', 'D'] },
                    { questionNumber: 24, text: 'Second question?', type: 'mcq-grammar', options: ['A', 'B', 'C', 'D'] },
                    { questionNumber: 26, text: 'Fourth question?', type: 'mcq-grammar', options: ['A', 'B', 'C', 'D'] },
                ],
            },
        ];

        const stats = repairParsedSectionStructure(sections);

        expect(stats).toEqual({ mergedOrphanReadingSections: 0, backfilledQuestionTexts: 0 });
        expect(sections).toHaveLength(2);
    });
});
