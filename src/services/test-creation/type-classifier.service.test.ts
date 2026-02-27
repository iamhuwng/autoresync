/**
 * Unit Tests for Type Classifier Service
 * 
 * Tests detection of all 16 IELTS question types using real Cambridge samples.
 * 
 * @module type-classifier.service.test
 * @date 2026-02-06
 * @see PRD-0020 Task 4.10
 * @see documentation/IELTS-question-task-type-samples
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    TypeClassifierService,
    ClassificationResult,
    WordLimitResult,
    hasTrueFalseNotGivenOptions,
    hasYesNoNotGivenOptions,
    hasRomanNumerals,
} from './type-classifier.service';

// ═══════════════════════════════════════════════════════════════
// TEST DATA - REAL CAMBRIDGE IELTS SAMPLES
// ═══════════════════════════════════════════════════════════════

/**
 * Real instruction samples from Cambridge IELTS tests
 * Sourced from: documentation/IELTS-question-task-type-samples
 */
const SAMPLE_INSTRUCTIONS = {
    // Type 1: Sentence Completion
    sentenceCompletion: `Complete the sentences below.
Choose ONE WORD ONLY from the passage for each answer.
Write your answers in boxes 1–3 on your answer sheet.`,

    // Type 2: Summary Completion (Text)
    summaryCompletionText: `Complete the summary below.
Choose NO MORE THAN TWO WORDS from the passage for each answer.
Write your answers in boxes 4–8 on your answer sheet.`,

    // Type 3: Summary Completion (List)
    summaryCompletionList: `Complete the summary using the list of phrases, A–H, below.
Write the correct letter, A–H, in boxes 9–13 on your answer sheet.`,

    // Type 4: Note Completion
    noteCompletion: `Complete the notes below.
Choose ONE WORD AND/OR A NUMBER from the passage for each answer.
Write your answers in boxes 14–17 on your answer sheet.`,

    // Type 5: Table Completion
    tableCompletion: `Complete the table below.
Choose NO MORE THAN TWO WORDS from the passage for each answer.
Write your answers in boxes 18–20 on your answer sheet.`,

    // Type 6: Flow-Chart Completion
    flowchartCompletion: `Complete the flow-chart below.
Choose NO MORE THAN TWO WORDS from the passage for each answer.
Write your answers in boxes 21–23 on your answer sheet.`,

    // Type 7: Diagram Label Completion
    diagramLabeling: `Label the diagram below.
Choose ONE WORD ONLY from the passage for each answer.
Write your answers in boxes 24–26 on your answer sheet.`,

    // Type 8: True/False/Not Given
    trueFalseNotGiven: `Do the following statements agree with the information given in Reading Passage 1?
In boxes 27–30 on your answer sheet, write
TRUE if the statement agrees with the information
FALSE if the statement contradicts the information
NOT GIVEN if there is no information on this`,

    // Type 9: Yes/No/Not Given
    yesNoNotGiven: `Do the following statements agree with the claims of the writer in Reading Passage 2?
In boxes 31–34 on your answer sheet, write
YES if the statement agrees with the claims of the writer
NO if the statement contradicts the claims of the writer
NOT GIVEN if it is impossible to say what the writer thinks about this`,

    // Type 10: Matching Headings
    matchingHeadings: `Reading Passage 2 has five sections, A–E.
Choose the correct heading for each section from the list of headings below.
Write the correct number, i–viii, in boxes 1–5 on your answer sheet.`,

    // Type 11: Matching Information
    matchingInformation: `Which paragraph contains the following information?
Write the correct letter, A–F, in boxes 6–9 on your answer sheet.
NB You may use any letter more than once.`,

    // Type 12: Matching Features
    matchingFeatures: `Look at the following statements (Questions 10–13) and the list of scientists below.
Match each statement with the correct scientist, A, B or C.
Write the correct letter, A, B or C, in boxes 10–13 on your answer sheet.
NB You may use any letter more than once.`,

    // Type 13: Matching Sentence Endings
    matchingSentenceEndings: `Complete each sentence with the correct ending, A–F, below.
Write the correct letter, A–F, in boxes 14–16 on your answer sheet.`,

    // Type 14: Multiple Choice (Standard)
    multipleChoice: `Choose the correct letter, A, B, C or D.
Write the correct letter in boxes 17–18 on your answer sheet.`,

    // Type 15: List Selection (Multiple Select)
    multipleSelect: `Choose TWO letters, A–E.
Write the correct letters in boxes 19–20 on your answer sheet.`,

    // Type 16: Short Answer Questions
    shortAnswer: `Answer the questions below.
Choose NO MORE THAN THREE WORDS AND/OR A NUMBER from the passage for each answer.
Write your answers in boxes 21–23 on your answer sheet.`,
};

// ═══════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════

describe('TypeClassifierService', () => {
    let classifier: TypeClassifierService;

    beforeEach(() => {
        classifier = new TypeClassifierService();
    });

    // ═══════════════════════════════════════════════════════════════
    // COMPLETION TYPES (7 types)
    // ═══════════════════════════════════════════════════════════════

    describe('Completion Types', () => {
        describe('1. Sentence Completion', () => {
            it('should detect sentence completion from official instruction', () => {
                const result = classifier.classifyQuestion(SAMPLE_INSTRUCTIONS.sentenceCompletion);

                expect(result.type).toBe('sentence-completion');
                expect(result.confidence).toBeGreaterThanOrEqual(80);
                expect(result.uncertain).toBe(false);
            });

            it('should detect sentence completion from blank indicators', () => {
                const result = classifier.classifyQuestion(
                    'The colony of ants constructs its nest using a mixture of soil and ______ found in the nearby forest.'
                );

                expect(result.type).toBe('sentence-completion');
                expect(result.confidence).toBeGreaterThanOrEqual(70);
            });

            it('should detect from "finish the sentence" variation', () => {
                const result = classifier.classifyQuestion('Finish the sentences below.');

                expect(result.type).toBe('sentence-completion');
            });
        });

        describe('2. Summary Completion (Text)', () => {
            it('should detect summary completion from text instruction', () => {
                const result = classifier.classifyQuestion(SAMPLE_INSTRUCTIONS.summaryCompletionText);

                expect(result.type).toBe('summary-completion-text');
                expect(result.confidence).toBeGreaterThanOrEqual(80);
            });

            it('should detect from "complete the summary using words" pattern', () => {
                const result = classifier.classifyQuestion(
                    'Complete the summary using words from the passage.'
                );

                expect(result.type).toBe('summary-completion-text');
            });
        });

        describe('3. Summary Completion (List)', () => {
            it('should detect summary completion from list instruction', () => {
                const result = classifier.classifyQuestion(SAMPLE_INSTRUCTIONS.summaryCompletionList);

                expect(result.type).toBe('summary-completion-list');
                expect(result.confidence).toBeGreaterThanOrEqual(80);
            });

            it('should detect from "choose from the box" pattern', () => {
                const result = classifier.classifyQuestion(
                    'Complete the summary. Choose words from the box below.'
                );

                expect(result.type).toBe('summary-completion-list');
            });

            it('should detect from "list of phrases" pattern', () => {
                const result = classifier.classifyQuestion(
                    'Complete the summary using the list of phrases provided.'
                );

                expect(result.type).toBe('summary-completion-list');
            });
        });

        describe('4. Note Completion', () => {
            it('should detect note completion from official instruction', () => {
                const result = classifier.classifyQuestion(SAMPLE_INSTRUCTIONS.noteCompletion);

                expect(result.type).toBe('note-completion');
                expect(result.confidence).toBeGreaterThanOrEqual(80);
            });

            it('should detect from "complete the form" variation', () => {
                const result = classifier.classifyQuestion('Complete the form below.');

                expect(result.type).toBe('note-completion');
            });
        });

        describe('5. Table Completion', () => {
            it('should detect table completion from official instruction', () => {
                const result = classifier.classifyQuestion(SAMPLE_INSTRUCTIONS.tableCompletion);

                expect(result.type).toBe('table-completion');
                expect(result.confidence).toBeGreaterThanOrEqual(80);
            });

            it('should detect from "table below" pattern', () => {
                const result = classifier.classifyQuestion('Look at the table below.');

                expect(result.type).toBe('table-completion');
            });
        });

        describe('6. Flow-Chart Completion', () => {
            it('should detect flowchart completion from official instruction', () => {
                const result = classifier.classifyQuestion(SAMPLE_INSTRUCTIONS.flowchartCompletion);

                expect(result.type).toBe('flowchart-completion');
                expect(result.confidence).toBeGreaterThanOrEqual(80);
            });

            it('should detect with hyphenated "flow-chart"', () => {
                const result = classifier.classifyQuestion('Complete the flow-chart below.');

                expect(result.type).toBe('flowchart-completion');
            });

            it('should detect without hyphen "flowchart"', () => {
                const result = classifier.classifyQuestion('Complete the flowchart below.');

                expect(result.type).toBe('flowchart-completion');
            });
        });

        describe('7. Diagram Labeling', () => {
            it('should detect diagram labeling from official instruction', () => {
                const result = classifier.classifyQuestion(SAMPLE_INSTRUCTIONS.diagramLabeling);

                expect(result.type).toBe('diagram-labeling');
                expect(result.confidence).toBeGreaterThanOrEqual(80);
            });

            it('should detect from "label the map" variation', () => {
                const result = classifier.classifyQuestion('Label the map below.');

                expect(result.type).toBe('diagram-labeling');
            });

            it('should detect from "label the plan" variation', () => {
                const result = classifier.classifyQuestion('Label the plan below.');

                expect(result.type).toBe('diagram-labeling');
            });
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // TRUE/FALSE TYPES (2 types)
    // ═══════════════════════════════════════════════════════════════

    describe('True/False Types', () => {
        describe('8. True/False/Not Given', () => {
            it('should detect TFNG from official instruction', () => {
                const result = classifier.classifyQuestion(SAMPLE_INSTRUCTIONS.trueFalseNotGiven);

                expect(result.type).toBe('true-false-not-given');
                expect(result.confidence).toBeGreaterThanOrEqual(90);
                expect(result.uncertain).toBe(false);
            });

            it('should detect from "statements agree with the information" pattern', () => {
                const result = classifier.classifyQuestion(
                    'Do the statements agree with the information in the passage?'
                );

                expect(result.type).toBe('true-false-not-given');
            });

            it('should detect from options array', () => {
                const result = classifier.classifyQuestion(
                    'Read the statements below.',
                    ['TRUE', 'FALSE', 'NOT GIVEN']
                );

                expect(result.type).toBe('true-false-not-given');
                expect(result.detectionSource).toBe('options');
            });

            it('should detect from "claims agree with" pattern (YNNG, not TFNG - claims = opinions)', () => {
                // Note: "claims of the writer" is YNNG because claims = opinions
                // TFNG uses "information" (facts), YNNG uses "claims/views" (opinions)
                const result = classifier.classifyQuestion(
                    'Do the claims agree with the writer?'
                );

                expect(result.type).toBe('yes-no-not-given');
            });
        });

        describe('9. Yes/No/Not Given', () => {
            it('should detect YNNG from official instruction', () => {
                const result = classifier.classifyQuestion(SAMPLE_INSTRUCTIONS.yesNoNotGiven);

                expect(result.type).toBe('yes-no-not-given');
                expect(result.confidence).toBeGreaterThanOrEqual(90);
            });

            it('should detect from "views agree with" pattern', () => {
                const result = classifier.classifyQuestion(
                    'Do the views agree with the claims of the writer?'
                );

                expect(result.type).toBe('yes-no-not-given');
            });

            it('should detect from "opinions agree with" pattern', () => {
                const result = classifier.classifyQuestion(
                    'Do these opinions agree with the writer?'
                );

                expect(result.type).toBe('yes-no-not-given');
            });

            it('should detect from options array', () => {
                const result = classifier.classifyQuestion(
                    'Read the statements below.',
                    ['YES', 'NO', 'NOT GIVEN']
                );

                expect(result.type).toBe('yes-no-not-given');
                expect(result.detectionSource).toBe('options');
            });
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // MATCHING TYPES (4 types)
    // ═══════════════════════════════════════════════════════════════

    describe('Matching Types', () => {
        describe('10. Matching Headings', () => {
            it('should detect matching headings from official instruction', () => {
                const result = classifier.classifyQuestion(SAMPLE_INSTRUCTIONS.matchingHeadings);

                expect(result.type).toBe('matching-headings');
                expect(result.confidence).toBeGreaterThanOrEqual(90);
            });

            it('should detect from "list of headings" pattern', () => {
                const result = classifier.classifyQuestion('List of Headings');

                expect(result.type).toBe('matching-headings');
            });

            it('should detect from "choose the correct heading" pattern', () => {
                const result = classifier.classifyQuestion(
                    'Choose the correct heading for each paragraph.'
                );

                expect(result.type).toBe('matching-headings');
            });
        });

        describe('11. Matching Information', () => {
            it('should detect matching information from official instruction', () => {
                const result = classifier.classifyQuestion(SAMPLE_INSTRUCTIONS.matchingInformation);

                expect(result.type).toBe('matching-information');
                expect(result.confidence).toBeGreaterThanOrEqual(80);
            });

            it('should detect from "which paragraph contains" pattern', () => {
                const result = classifier.classifyQuestion(
                    'Which paragraph contains the following information?'
                );

                expect(result.type).toBe('matching-information');
            });

            it('should detect from "which section contains" pattern', () => {
                const result = classifier.classifyQuestion(
                    'Which section contains this detail?'
                );

                expect(result.type).toBe('matching-information');
            });
        });

        describe('12. Matching Features', () => {
            it('should detect matching features from official instruction', () => {
                const result = classifier.classifyQuestion(SAMPLE_INSTRUCTIONS.matchingFeatures);

                expect(result.type).toBe('matching-features');
                expect(result.confidence).toBeGreaterThanOrEqual(90);
            });

            it('should detect from "list of scientists" pattern', () => {
                const result = classifier.classifyQuestion(
                    'Match each statement with the list of scientists below.'
                );

                expect(result.type).toBe('matching-features');
            });

            it('should detect from "list of researchers" pattern', () => {
                const result = classifier.classifyQuestion(
                    'Look at the list of researchers provided.'
                );

                expect(result.type).toBe('matching-features');
            });

            it('should detect from "which person" pattern', () => {
                const result = classifier.classifyQuestion(
                    'Which person made the following discovery?'
                );

                expect(result.type).toBe('matching-features');
            });
        });

        describe('13. Matching Sentence Endings', () => {
            it('should detect matching sentence endings from official instruction', () => {
                const result = classifier.classifyQuestion(SAMPLE_INSTRUCTIONS.matchingSentenceEndings);

                expect(result.type).toBe('matching-sentence-endings');
                expect(result.confidence).toBeGreaterThanOrEqual(90);
            });

            it('should detect from "list of endings" pattern', () => {
                const result = classifier.classifyQuestion('List of Endings');

                expect(result.type).toBe('matching-sentence-endings');
            });

            it('should detect from "complete the sentence with ending" pattern', () => {
                const result = classifier.classifyQuestion(
                    'Complete the sentence with the correct ending.'
                );

                expect(result.type).toBe('matching-sentence-endings');
            });

            it('should detect from "complete sentences by choosing" pattern', () => {
                const result = classifier.classifyQuestion(
                    'Complete the sentences by choosing the correct ending.'
                );

                expect(result.type).toBe('matching-sentence-endings');
            });
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // CHOICE TYPES (2 types)
    // ═══════════════════════════════════════════════════════════════

    describe('Choice Types', () => {
        describe('14. Multiple Choice (Standard)', () => {
            it('should detect multiple choice from official instruction', () => {
                const result = classifier.classifyQuestion(SAMPLE_INSTRUCTIONS.multipleChoice);

                expect(result.type).toBe('multiple-choice');
                expect(result.confidence).toBeGreaterThanOrEqual(75);
            });

            it('should detect from "choose the correct letter" pattern', () => {
                const result = classifier.classifyQuestion(
                    'Choose the correct letter, A, B, C or D.'
                );

                expect(result.type).toBe('multiple-choice');
            });

            it('should detect from "circle the correct answer" pattern', () => {
                const result = classifier.classifyQuestion('Circle the correct answer.');

                expect(result.type).toBe('multiple-choice');
            });
        });

        describe('15. Multiple Select (List Selection)', () => {
            it('should detect multiple select from official instruction', () => {
                const result = classifier.classifyQuestion(SAMPLE_INSTRUCTIONS.multipleSelect);

                expect(result.type).toBe('multiple-select');
                expect(result.confidence).toBeGreaterThanOrEqual(80);
            });

            it('should detect from "choose two" pattern', () => {
                const result = classifier.classifyQuestion('Choose TWO letters, A–E.');

                expect(result.type).toBe('multiple-select');
            });

            it('should detect from "choose three" pattern', () => {
                const result = classifier.classifyQuestion('Choose THREE correct answers.');

                expect(result.type).toBe('multiple-select');
            });

            it('should detect from "which two" pattern', () => {
                const result = classifier.classifyQuestion(
                    'Which TWO of the following are mentioned?'
                );

                expect(result.type).toBe('multiple-select');
            });

            it('should detect from "select all" pattern', () => {
                const result = classifier.classifyQuestion('Select all that apply.');

                expect(result.type).toBe('multiple-select');
            });
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // SHORT ANSWER TYPE (1 type)
    // ═══════════════════════════════════════════════════════════════

    describe('Short Answer Type', () => {
        describe('16. Short Answer Questions', () => {
            it('should detect short answer from official instruction', () => {
                const result = classifier.classifyQuestion(SAMPLE_INSTRUCTIONS.shortAnswer);

                expect(result.type).toBe('short-answer');
                expect(result.confidence).toBeGreaterThanOrEqual(80);
            });

            it('should detect from "answer the questions below" pattern', () => {
                const result = classifier.classifyQuestion('Answer the questions below.');

                expect(result.type).toBe('short-answer');
            });

            it('should detect from direct question format', () => {
                const result = classifier.classifyQuestion(
                    'What is the primary diet of the giant panda?'
                );

                expect(result.type).toBe('short-answer');
            });

            it('should detect from "what was" question format', () => {
                const result = classifier.classifyQuestion(
                    'What was the main cause of the migration?'
                );

                expect(result.type).toBe('short-answer');
            });
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // CONTEXT-AWARE DETECTION (detectFromSectionContext)
    // ═══════════════════════════════════════════════════════════════

    describe('Context-Aware Detection', () => {
        it('should use instruction context for better accuracy', () => {
            const result = classifier.detectFromSectionContext(
                SAMPLE_INSTRUCTIONS.matchingSentenceEndings,
                'The introduction of non-native species often leads to ______',
                ['A. soil salinity increased', 'B. biodiversity is protected', 'C. disruption of the local ecosystem']
            );

            expect(result.type).toBe('matching-sentence-endings');
            expect(result.confidence).toBeGreaterThanOrEqual(90);
        });

        it('should detect matching-features when "list of people" is present', () => {
            const result = classifier.detectFromSectionContext(
                'Match each statement with the correct scientist from the list of people below.',
                'Suggests that marsupials migrated from South America.',
                []
            );

            expect(result.type).toBe('matching-features');
            expect(result.confidence).toBeGreaterThanOrEqual(90);
        });

        it('should fallback to question text when instruction confidence is low', () => {
            const result = classifier.detectFromSectionContext(
                'Read the passage carefully.', // Vague instruction
                'Complete the table below with no more than two words.',
                []
            );

            expect(result.type).toBe('table-completion');
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // WORD LIMIT EXTRACTION (Task 4.8)
    // ═══════════════════════════════════════════════════════════════

    describe('Word Limit Extraction', () => {
        it('should extract "one word only" limit', () => {
            const result = classifier.extractWordLimit(
                'Choose ONE WORD ONLY from the passage.'
            );

            expect(result).not.toBeNull();
            expect(result!.maxWords).toBe(1);
            expect(result!.allowNumber).toBe(false);
        });

        it('should extract "no more than two words" limit', () => {
            const result = classifier.extractWordLimit(
                'Choose NO MORE THAN TWO WORDS from the passage.'
            );

            expect(result).not.toBeNull();
            expect(result!.maxWords).toBe(2);
        });

        it('should extract "no more than three words" limit', () => {
            const result = classifier.extractWordLimit(
                'Choose NO MORE THAN THREE WORDS from the passage.'
            );

            expect(result).not.toBeNull();
            expect(result!.maxWords).toBe(3);
        });

        it('should extract "one word and/or a number" limit', () => {
            const result = classifier.extractWordLimit(
                'Choose ONE WORD AND/OR A NUMBER from the passage.'
            );

            expect(result).not.toBeNull();
            expect(result!.maxWords).toBe(1);
            expect(result!.allowNumber).toBe(true);
        });

        it('should extract "three words and/or a number" limit', () => {
            const result = classifier.extractWordLimit(
                'Choose NO MORE THAN THREE WORDS AND/OR A NUMBER from the passage.'
            );

            expect(result).not.toBeNull();
            expect(result!.maxWords).toBe(3);
            expect(result!.allowNumber).toBe(true);
        });

        it('should return null when no word limit is found', () => {
            const result = classifier.extractWordLimit('Choose the correct letter.');

            expect(result).toBeNull();
        });

        it('should extract dynamic word limit (e.g., "no more than 4 words")', () => {
            const result = classifier.extractWordLimit(
                'Choose no more than 4 words from the passage.'
            );

            expect(result).not.toBeNull();
            expect(result!.maxWords).toBe(4);
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // REUSE LETTERS DETECTION (Task 4.7)
    // ═══════════════════════════════════════════════════════════════

    describe('Reuse Letters Detection', () => {
        it('should detect "NB You may use any letter more than once"', () => {
            const result = classifier.detectReuseLetters(
                'NB You may use any letter more than once.'
            );

            expect(result).toBe(true);
        });

        it('should detect "letters may be used more than once"', () => {
            const result = classifier.detectReuseLetters(
                'Some letters may be used more than once.'
            );

            expect(result).toBe(true);
        });

        it('should detect "not all letters will be used"', () => {
            const result = classifier.detectReuseLetters(
                'Not all letters will be used.'
            );

            expect(result).toBe(true);
        });

        it('should return false when no reuse pattern is found', () => {
            const result = classifier.detectReuseLetters(
                'Choose the correct letter for each question.'
            );

            expect(result).toBe(false);
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // OPTION LABEL FORMAT DETECTION
    // ═══════════════════════════════════════════════════════════════

    describe('Option Label Format Detection', () => {
        it('should detect letter format (A, B, C)', () => {
            const result = classifier.detectOptionLabelFormat([
                'A. First option',
                'B. Second option',
                'C. Third option',
            ]);

            expect(result).toBe('letter');
        });

        it('should detect roman numeral format (i, ii, iii)', () => {
            const result = classifier.detectOptionLabelFormat([
                'i. First heading',
                'ii. Second heading',
                'iii. Third heading',
                'iv. Fourth heading',
            ]);

            expect(result).toBe('roman');
        });

        it('should default to letter when format is unclear', () => {
            const result = classifier.detectOptionLabelFormat([
                'First option',
                'Second option',
            ]);

            expect(result).toBe('letter');
        });

        it('should default to letter for empty array', () => {
            const result = classifier.detectOptionLabelFormat([]);

            expect(result).toBe('letter');
        });

        it('should detect letter format with parentheses (A), B))', () => {
            const result = classifier.detectOptionLabelFormat([
                'A) First option',
                'B) Second option',
                'C) Third option',
            ]);

            expect(result).toBe('letter');
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // HELPER FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    describe('Helper Functions', () => {
        describe('hasTrueFalseNotGivenOptions', () => {
            it('should return true for valid TFNG options', () => {
                expect(hasTrueFalseNotGivenOptions(['TRUE', 'FALSE', 'NOT GIVEN'])).toBe(true);
                expect(hasTrueFalseNotGivenOptions(['True', 'False', 'Not Given'])).toBe(true);
                expect(hasTrueFalseNotGivenOptions(['true', 'false', 'not given'])).toBe(true);
            });

            it('should return false for invalid options', () => {
                expect(hasTrueFalseNotGivenOptions(['YES', 'NO', 'NOT GIVEN'])).toBe(false);
                expect(hasTrueFalseNotGivenOptions(['TRUE', 'FALSE'])).toBe(false);
                expect(hasTrueFalseNotGivenOptions([])).toBe(false);
            });
        });

        describe('hasYesNoNotGivenOptions', () => {
            it('should return true for valid YNNG options', () => {
                expect(hasYesNoNotGivenOptions(['YES', 'NO', 'NOT GIVEN'])).toBe(true);
                expect(hasYesNoNotGivenOptions(['Yes', 'No', 'Not Given'])).toBe(true);
                expect(hasYesNoNotGivenOptions(['yes', 'no', 'not given'])).toBe(true);
            });

            it('should return false for invalid options', () => {
                expect(hasYesNoNotGivenOptions(['TRUE', 'FALSE', 'NOT GIVEN'])).toBe(false);
                expect(hasYesNoNotGivenOptions(['YES', 'NO'])).toBe(false);
                expect(hasYesNoNotGivenOptions([])).toBe(false);
            });
        });

        describe('hasRomanNumerals', () => {
            it('should return true for roman numeral options', () => {
                expect(hasRomanNumerals(['i. First', 'ii. Second', 'iii. Third'])).toBe(true);
                expect(hasRomanNumerals(['iv. Fourth', 'v. Fifth'])).toBe(true);
            });

            it('should return false for letter options', () => {
                expect(hasRomanNumerals(['A. First', 'B. Second'])).toBe(false);
                expect(hasRomanNumerals(['1. First', '2. Second'])).toBe(false);
                expect(hasRomanNumerals([])).toBe(false);
            });
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // BATCH CLASSIFICATION
    // ═══════════════════════════════════════════════════════════════

    describe('Batch Classification', () => {
        it('should classify multiple questions in a section', () => {
            const results = classifier.classifySection(
                SAMPLE_INSTRUCTIONS.trueFalseNotGiven,
                [
                    'The total population of the island declined in the 1990s.',
                    'Tourism is now the primary source of income for the residents.',
                    'The government has refused to fund the new airport project.',
                ]
            );

            expect(results).toHaveLength(3);
            results.forEach(result => {
                expect(result.type).toBe('true-false-not-given');
            });
        });

        it('should handle empty questions array', () => {
            const results = classifier.classifySection(
                SAMPLE_INSTRUCTIONS.multipleChoice,
                []
            );

            expect(results).toHaveLength(0);
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // UTILITY METHODS
    // ═══════════════════════════════════════════════════════════════

    describe('Utility Methods', () => {
        it('should validate question types', () => {
            expect(classifier.isValidQuestionType('sentence-completion')).toBe(true);
            expect(classifier.isValidQuestionType('true-false-not-given')).toBe(true);
            expect(classifier.isValidQuestionType('invalid-type')).toBe(false);
        });

        it('should return all supported types', () => {
            const types = classifier.getSupportedTypes();

            expect(types).toContain('sentence-completion');
            expect(types).toContain('true-false-not-given');
            expect(types).toContain('matching-headings');
            expect(types.length).toBe(16);
        });

        it('should return sorted detection patterns', () => {
            const patterns = classifier.getPatterns();

            expect(patterns.length).toBeGreaterThan(0);
            // Verify patterns are sorted by priority (descending)
            for (let i = 1; i < patterns.length; i++) {
                expect(patterns[i - 1].priority).toBeGreaterThanOrEqual(patterns[i].priority);
            }
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // EDGE CASES & FALLBACKS
    // ═══════════════════════════════════════════════════════════════

    describe('Edge Cases & Fallbacks', () => {
        it('should flag uncertain when using fallback', () => {
            const result = classifier.classifyQuestion(
                'Read the following passage carefully.'
            );

            expect(result.uncertain).toBe(true);
            expect(result.detectionSource).toBe('fallback');
        });

        it('should default to multiple-choice with options but no pattern', () => {
            const result = classifier.classifyQuestion(
                'Consider the following options.',
                ['A. Option A', 'B. Option B', 'C. Option C']
            );

            expect(result.type).toBe('multiple-choice');
            expect(result.detectionSource).toBe('fallback');
        });

        it('should handle empty text', () => {
            const result = classifier.classifyQuestion('');

            expect(result.type).toBe('multiple-choice');
            expect(result.uncertain).toBe(true);
            expect(result.confidence).toBeLessThanOrEqual(50);
        });

        it('should handle whitespace-only text', () => {
            const result = classifier.classifyQuestion('   \n\t  ');

            expect(result.uncertain).toBe(true);
        });

        it('should include matched pattern description', () => {
            const result = classifier.classifyQuestion(SAMPLE_INSTRUCTIONS.matchingHeadings);

            expect(result.matchedPattern).toBeDefined();
            expect(result.matchedPattern).toContain('heading');
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // CONFIDENCE SCORING
    // ═══════════════════════════════════════════════════════════════

    describe('Confidence Scoring', () => {
        it('should calculate weighted confidence', () => {
            const confidence = classifier.calculateWeightedConfidence(80, true, true, true);

            expect(confidence).toBe(95); // 80 + 5 + 5 + 5
        });

        it('should cap confidence at 100', () => {
            const confidence = classifier.calculateWeightedConfidence(95, true, true, true);

            expect(confidence).toBe(100);
        });

        it('should not boost without signals', () => {
            const confidence = classifier.calculateWeightedConfidence(80, false, false, false);

            expect(confidence).toBe(80);
        });
    });
});
