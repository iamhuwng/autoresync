/**
 * IELTS Questions Panel Component
 * Authentic IELTS Reading CBT experience
 * 
 * Displays ALL questions for the current passage simultaneously in a scrollable panel
 * Questions are grouped by task type with instructions, matching real IELTS CBT format
 * 
 * UPDATED: Paper-test style interface (non-gamified)
 */

import React, { useRef, useEffect } from 'react';
import { AuthenticAnswerInput } from './AuthenticAnswerInput';
import { DragDropMatchingInput } from './DragDropMatchingInput';
import { MatchingInformationInput } from './MatchingInformationInput';
import { MatchingFeaturesInput } from './MatchingFeaturesInput';
import type { ReadingSectionReference } from '../../types/document.types';
import {
  getReadingOptionDisplayText,
  getReadingOptionText,
  getReadingQuestionOptions,
  getReadingOptionSelectionValue,
  type ReadingOptionDisplayValue,
  type ReadingOptionDisplayFormat,
} from '../../utils/readingOptionDisplay';

interface StudentAnswers {
  [questionNumber: number]: string | string[] | Record<string, string>;
}

interface Question {
  number: number;
  type: string;
  question: string;
  options?: ReadingOptionDisplayValue[];
  labeledOptions?: ReadingOptionDisplayValue[];
  sectionReferences?: ReadingSectionReference[];
  answer: string | string[] | Record<string, string>;
  passageId: string;
  points: number;
  imageUrl?: string;
  context?: any;
  items?: Array<{ id: string; text: string }>;
  optionLabelFormat?: ReadingOptionDisplayFormat; // Format for matching question options (A,B,C / i,ii,iii / 1,2,3)
  wordLimit?: number;
  summaryGroupId?: string; // unique ID for multi-group summary exercises (e.g. "sc-1", "sc-2")
}

interface IELTSQuestionsPanelProps {
  questions: Question[];
  currentPassageId: string | null;
  answers: StudentAnswers;
  onAnswerChange: (questionNumber: number, answer: string | string[] | Record<string, string>) => void;
  activeQuestionNumber: number;
  onQuestionClick: (questionNumber: number) => void;
  testSubmitted?: boolean;
  questionResults?: Record<number, boolean>;
  partIndex?: number;
  skill?: string;
}

interface QuestionGroup {
  startNumber: number;
  endNumber: number;
  type: string;
  questions: Question[];
  instructions: string;
}

type OptionLike = ReadingOptionDisplayValue;
type OptionLabelFormat = NonNullable<Question['optionLabelFormat']>;

const getQuestionOptions = (question: Question): OptionLike[] => getReadingQuestionOptions(question);

const getOptionSelectionValue = (
  option: OptionLike,
  index: number,
  labelFormat: OptionLabelFormat = 'letter',
): string => getReadingOptionSelectionValue(option, index, labelFormat, true);

const getOptionDisplayText = (
  option: OptionLike,
  index: number,
  labelFormat: OptionLabelFormat = 'letter',
  includeFallbackLabel = true,
): string => getReadingOptionDisplayText(option, index, labelFormat, includeFallbackLabel);

const getOptionContentText = (option: OptionLike): string => getReadingOptionText(option);

/**
 * Get instructions for each question type (authentic IELTS wording)
 */
const getTaskInstructions = (type: string, startNum: number, endNum: number, wordLimit?: number): string => {
  const range = startNum === endNum ? `Question ${startNum}` : `Questions ${startNum}-${endNum}`;

  const formatWordLimit = (limit?: number, defaultLimitStr = 'ONE WORD ONLY') => {
    if (!limit) return defaultLimitStr;
    const wordMap: Record<number, string> = { 1: 'ONE WORD ONLY', 2: 'NO MORE THAN TWO WORDS', 3: 'NO MORE THAN THREE WORDS' };
    return wordMap[limit] || `NO MORE THAN ${limit} WORDS`;
  };

  const instructionMap: Record<string, string> = {
    // Type 1: Sentence Completion
    'sentence-completion': `${range}\n\nComplete the sentences below.\n\nChoose ${formatWordLimit(wordLimit, 'ONE WORD ONLY')} from the passage for each answer.`,

    // Type 2: Summary Completion (from Text)
    'summary-completion-text': `${range}\n\nComplete the summary below.\n\nChoose ${formatWordLimit(wordLimit, 'NO MORE THAN TWO WORDS')} from the passage for each answer.`,

    // Type 3: Summary Completion (from List)
    'summary-completion-list': `${range}\n\nComplete the summary using the list of phrases, A–H, below.\n\nWrite the correct letter, A–H.`,

    // Type 4: Note Completion
    'note-completion': `${range}\n\nComplete the notes below.\n\nChoose ${formatWordLimit(wordLimit, 'ONE WORD AND/OR A NUMBER').replace('WORDS', 'WORDS AND/OR A NUMBER').replace('WORD ONLY', 'WORD AND/OR A NUMBER')} from the passage for each answer.`,

    // Type 5: Table Completion
    'table-completion': `${range}\n\nComplete the table below.\n\nChoose ${formatWordLimit(wordLimit, 'NO MORE THAN TWO WORDS')} from the passage for each answer.`,

    // Type 6: Flow-Chart Completion
    'flowchart-completion': `${range}\n\nComplete the flow-chart below.\n\nChoose ${formatWordLimit(wordLimit, 'NO MORE THAN TWO WORDS')} from the passage for each answer.`,

    // Type 7: Diagram Label Completion
    'diagram-labeling': `${range}\n\nLabel the diagram below.\n\nChoose ${formatWordLimit(wordLimit, 'ONE WORD ONLY')} from the passage for each answer.`,

    // Type 8: True/False/Not Given
    'true-false-not-given': `${range}\n\nDo the following statements agree with the information given in the reading passage?\n\nWrite:\nTRUE if the statement agrees with the information\nFALSE if the statement contradicts the information\nNOT GIVEN if there is no information on this`,

    // Type 9: Yes/No/Not Given
    'yes-no-not-given': `${range}\n\nDo the following statements agree with the views/claims of the writer?\n\nWrite:\nYES if the statement agrees with the views/claims of the writer\nNO if the statement contradicts the views/claims of the writer\nNOT GIVEN if it is impossible to say what the writer thinks about this`,

    // Type 10: Matching Headings
    'matching-headings': `${range}\n\nChoose the correct heading for each section from the list of headings below.`,

    // Type 11: Matching Information
    'matching-information': `${range}\n\nWhich section contains the following information?`,

    // Type 12: Matching Features
    'matching-features': `${range}\n\nMatch each statement with the correct person/theory.`,

    // Type 13: Matching Sentence Endings
    'matching-sentence-endings': `${range}\n\nComplete each sentence with the correct ending, A–F, below.`,

    // Type 14: Multiple Choice (Standard)
    'multiple-choice': `${range}\n\nChoose the correct letter, A, B, C or D.`,

    // Type 15: List Selection (Multiple Choice)
    'multiple-select': `${range}\n\nChoose TWO letters from the list.`,

    // Type 16: Short Answer Questions
    'short-answer': `${range}\n\nAnswer the questions below.\n\nChoose ${formatWordLimit(wordLimit, 'NO MORE THAN THREE WORDS AND/OR A NUMBER').replace('WORDS', 'WORDS AND/OR A NUMBER').replace('WORD ONLY', 'WORD AND/OR A NUMBER')} from the passage for each answer.`,

    // Legacy fallback
    'completion': `${range}\n\nComplete the sentences below.\n\nChoose ${formatWordLimit(wordLimit, 'NO MORE THAN TWO WORDS')} from the passage for each answer.`,
  };

  return instructionMap[type] || `${range}\n\nAnswer the following questions.`;
};

/**
 * Clean instruction prefixes from question text
 * These prefixes are already shown in the section header, so we strip them from individual questions
 */
const cleanQuestionText = (text: string): string => {
  if (!text) return '';

  // Common instruction prefixes to remove (these are shown in the header)
  const instructionPrefixes = [
    /^Choose (ONE WORD ONLY|NO MORE THAN (ONE|TWO|THREE) WORDS?( AND\/OR A NUMBER)?|ONE WORD AND\/OR A NUMBER) (taken )?from the passage( for (each|the) answer)?:\s*/i,
    /^Write the correct letter,?\s*(A[\s–-]+[A-Z])?\s*\.?\s*/i,
    /^Choose the correct (letter|option|answer),?\s*(A[\s,–-]+B[\s,–-]+C[\s,–-]+D?)?\s*\.?\s*/i,
    /^Write:\s*(TRUE|FALSE|NOT GIVEN|YES|NO)\s+if.*/i,
    /^Select (ONE|TWO|THREE) (letters?|options?|answers?) from the list\.?\s*/i,
    /^Answer the questions? below\.?\s*/i,
    /^Complete the (sentences?|summary|notes?|table|flow-?chart|diagram) below\.?\s*/i,
  ];

  let cleaned = text;
  for (const prefix of instructionPrefixes) {
    cleaned = cleaned.replace(prefix, '');
  }

  return cleaned.trim();
};

/**
 * Group questions by task type (consecutive questions of same type)
 */
const groupQuestionsByTaskType = (questions: Question[]): QuestionGroup[] => {
  if (questions.length === 0) return [];

  const firstQuestion = questions[0];
  if (!firstQuestion) return [];

  const groups: QuestionGroup[] = [];
  let currentGroup: Question[] = [firstQuestion];
  let currentType = firstQuestion.type;
  // Track summaryGroupId string or undefined
  let currentSummaryGroupId = firstQuestion.summaryGroupId;

  for (let i = 1; i < questions.length; i++) {
    const question = questions[i];
    if (!question) continue;

    const qSummaryGroupId = question.summaryGroupId;

    // A question belongs to the current group IF:
    // 1. Same task type
    // 2. AND they share the exact same summaryGroupId (even if both are undefined)
    const isSameType = question.type === currentType;
    const isSameSummaryGroup = qSummaryGroupId === currentSummaryGroupId;

    if (isSameType && isSameSummaryGroup) {
      currentGroup.push(question);
    } else {
      // Save current group and start new one
      const firstQ = currentGroup[0];
      const lastQ = currentGroup[currentGroup.length - 1];
      if (firstQ && lastQ) {
        // Use the wordLimit from the first question in the group for instructions
        const groupWordLimit = firstQ.wordLimit;
        groups.push({
          startNumber: firstQ.number,
          endNumber: lastQ.number,
          type: currentType,
          questions: currentGroup,
          instructions: getTaskInstructions(currentType, firstQ.number, lastQ.number, groupWordLimit),
        });
      }

      currentGroup = [question];
      currentType = question.type;
      currentSummaryGroupId = qSummaryGroupId;
    }
  }

  // Add the last group
  if (currentGroup.length > 0) {
    const firstQ = currentGroup[0];
    const lastQ = currentGroup[currentGroup.length - 1];
    if (firstQ && lastQ) {
      // Use the wordLimit from the first question in the group for instructions
      const groupWordLimit = firstQ.wordLimit;
      groups.push({
        startNumber: firstQ.number,
        endNumber: lastQ.number,
        type: currentType,
        questions: currentGroup,
        instructions: getTaskInstructions(currentType, firstQ.number, lastQ.number, groupWordLimit),
      });
    }
  }

  return groups;
};

export const IELTSQuestionsPanel: React.FC<IELTSQuestionsPanelProps> = ({
  questions,
  currentPassageId,
  answers,
  onAnswerChange,
  activeQuestionNumber,
  testSubmitted = false,
  questionResults,
  partIndex: _partIndex,
  skill,
}) => {
  const questionRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [showHelp, setShowHelp] = React.useState(false);

  // Filter questions for current passage
  const passageQuestions = questions.filter(q => q.passageId === currentPassageId);

  // Group questions by task type
  const questionGroups = groupQuestionsByTaskType(passageQuestions);

  // ── DIAGNOSTIC: Log matching-headings groups ──
  const matchingHeadingsGroups = questionGroups.filter(g => g.type === 'matching-headings');
  if (matchingHeadingsGroups.length > 0) {
    console.log('🔍 [IELTSQuestionsPanel] matching-headings groups found:', matchingHeadingsGroups.length);
    matchingHeadingsGroups.forEach((g, idx) => {
      console.log(`  📌 Group ${idx + 1}: Q${g.startNumber}–Q${g.endNumber} (${g.questions.length} questions)`);
      console.log('    Instructions:', g.instructions.substring(0, 80) + '...');
      g.questions.forEach(q => {
        console.log(`    Q${q.number}: type=${q.type}, options=${(q.options || []).length}, items=${(q.items || []).length}, optionLabelFormat=${(q as any).optionLabelFormat || 'none'}, question="${q.question.substring(0, 60)}..."`);
        if (q.options && q.options.length > 0) {
          console.log(`      Options:`, q.options);
        }
        if (q.items && q.items.length > 0) {
          console.log(`      Items:`, q.items);
        }
      });
    });
  }

  // Scroll to active question when it changes
  useEffect(() => {
    if (activeQuestionNumber && questionRefs.current[activeQuestionNumber]) {
      questionRefs.current[activeQuestionNumber]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [activeQuestionNumber]);

  if (passageQuestions.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '2rem',
        textAlign: 'center',
        color: '#64748b',
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📝</div>
        <div style={{ fontSize: '1rem', fontWeight: 600 }}>
          No questions for this passage
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#ffffff',
    }}>
      {/* Header - Simplified (navigation moved to footer) */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: 'white',
        borderBottom: '1px solid #d1d5db',
        padding: '0.625rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '40px',
        flexShrink: 0,
      }}>
        <div style={{
          fontSize: '15px',
          fontWeight: 700,
          color: '#000000',
        }}>
          Questions {passageQuestions.length > 0
            ? `${passageQuestions[0]?.number || 1}–${passageQuestions[passageQuestions.length - 1]?.number || 1}`
            : ''}
        </div>
        <div style={{
          fontSize: '13px',
          color: '#666666',
        }}>
          {Object.keys(answers).filter(n => passageQuestions.some(q => q.number === parseInt(n))).length} of {passageQuestions.length} answered
        </div>
      </div>

      {/* Scrollable Questions Area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '1.5rem',
      }}>
        {questionGroups.map((group, groupIndex) => (
          <div
            key={`group-${groupIndex}`}
            style={{
              marginBottom: groupIndex < questionGroups.length - 1 ? '3rem' : '0',
            }}
          >
            {/* Task Instructions Box */}
            <div style={{
              background: '#f1f5f9',
              border: '1px solid #d1d5db',
              padding: '1rem 1.25rem',
              marginBottom: '1.5rem',
              borderRadius: '2px',
            }}>
              <div style={{
                fontSize: '16px',
                color: '#000000',
                lineHeight: 1.6,
                fontFamily: 'Arial, sans-serif',
              }}>
                {/* Format the instructions with bold title + legend for T/F/NG and Y/N/NG */}
                {(() => {
                  const lines = group.instructions.split('\n\n');
                  const header = lines[0];

                  // For T/F/NG and Y/N/NG, render a colored legend box instead of plain text
                  if (group.type === 'true-false-not-given') {
                    const mainInstruction = lines[1] || '';
                    return (
                      <>
                        <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>{header}</div>
                        <div style={{ fontWeight: 400, marginBottom: '0.75rem' }}>{mainInstruction}</div>
                        <div style={{
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '4px',
                          padding: '0.625rem 0.875rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.25rem',
                        }}>
                          {[
                            { label: 'TRUE', desc: 'the statement agrees with the information', color: '#16a34a' },
                            { label: 'FALSE', desc: 'the statement contradicts the information', color: '#dc2626' },
                            { label: 'NOT GIVEN', desc: 'there is no information on this', color: '#6b7280' },
                          ].map(item => (
                            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '14px' }}>
                              <span style={{ fontWeight: 700, color: item.color, minWidth: '80px' }}>{item.label}</span>
                              <span style={{ color: '#64748b' }}>– {item.desc}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  }

                  if (group.type === 'yes-no-not-given') {
                    const mainInstruction = lines[1] || '';
                    return (
                      <>
                        <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>{header}</div>
                        <div style={{ fontWeight: 400, marginBottom: '0.75rem' }}>{mainInstruction}</div>
                        <div style={{
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '4px',
                          padding: '0.625rem 0.875rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.25rem',
                        }}>
                          {[
                            { label: 'YES', desc: 'agrees with the views/claims of the writer', color: '#16a34a' },
                            { label: 'NO', desc: 'contradicts the views/claims of the writer', color: '#dc2626' },
                            { label: 'NOT GIVEN', desc: 'impossible to say what the writer thinks', color: '#6b7280' },
                          ].map(item => (
                            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '14px' }}>
                              <span style={{ fontWeight: 700, color: item.color, minWidth: '80px' }}>{item.label}</span>
                              <span style={{ color: '#64748b' }}>– {item.desc}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  }

                  // Default: bold title + rest
                  const rest = lines.slice(1).join('\n\n');
                  return (
                    <>
                      <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>{header}</div>
                      <div style={{ fontWeight: 400, whiteSpace: 'pre-line' }}>{rest}</div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Questions in this group */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '2rem',
            }}>
              {(() => {
                // Matching Features uses dropdown selection (different from drag-drop)
                if (group.type === 'matching-features') {
                  const groupAnswers: Record<number, string> = {};
                  group.questions.forEach(q => {
                    if (answers[q.number]) {
                      groupAnswers[q.number] = answers[q.number] as string;
                    }
                  });

                  return (
                    <div style={{
                      background: 'white',
                      padding: '1.25rem 0',
                    }}>
                      <MatchingFeaturesInput
                        questions={group.questions}
                        answers={groupAnswers}
                        onAnswerChange={(num: number, ans: string) => onAnswerChange(num, ans)}
                        disabled={testSubmitted}
                      />
                    </div>
                  );
                }

                // Matching Information uses reusable section labels, not text-bearing feature options.
                if (group.type === 'matching-information') {
                  const groupAnswers: Record<number, string> = {};
                  group.questions.forEach(q => {
                    if (answers[q.number]) {
                      groupAnswers[q.number] = answers[q.number] as string;
                    }
                  });

                  return (
                    <div style={{
                      background: 'white',
                      padding: '1.25rem 0',
                    }}>
                      <MatchingInformationInput
                        questions={group.questions}
                        answers={groupAnswers}
                        onAnswerChange={(num: number, ans: string) => onAnswerChange(num, ans)}
                        disabled={testSubmitted}
                      />
                    </div>
                  );
                }

                // Matching questions with drag-drop (headings, sentence-endings)
                const dragDropMatchingTypes = [
                  'matching-headings',
                  'matching-sentence-endings'
                ];

                if (dragDropMatchingTypes.includes(group.type)) {
                  const groupAnswers: Record<number, string> = {};
                  group.questions.forEach(q => {
                    if (answers[q.number]) {
                      groupAnswers[q.number] = answers[q.number] as string;
                    }
                  });

                  // Get label format from first question's data (all questions in group should have same format)
                  // Default: 'roman' for matching-headings (IELTS standard), 'letter' for others
                  const labelFormat = group.questions[0]?.optionLabelFormat
                    || (group.type === 'matching-headings' ? 'roman' : 'letter');

                  // Determine list title based on question type
                  let listTitle = 'List of Options';
                  if (group.type === 'matching-headings') {
                    listTitle = 'List of Headings';
                  } else if (group.type === 'matching-sentence-endings') {
                    listTitle = 'List of Endings';
                  }

                  // ── DIAGNOSTIC: Log drag-drop matching data being passed ──
                  if (group.type === 'matching-headings') {
                    console.log('🎯 [IELTSQuestionsPanel] Rendering matching-headings DragDropMatchingInput');
                    console.log('  labelFormat:', labelFormat, '(raw optionLabelFormat:', group.questions[0]?.optionLabelFormat, ')');
                    console.log('  listTitle:', listTitle);
                    console.log('  questions count:', group.questions.length);
                    console.log('  first question options:', group.questions[0]?.options);
                    console.log('  first question items:', group.questions[0]?.items);
                    console.log('  groupAnswers:', groupAnswers);
                    console.log('  disabled (testSubmitted):', testSubmitted);
                    group.questions.forEach(q => {
                      console.log(`  Q${q.number}:`, {
                        type: q.type,
                        question: q.question.substring(0, 80),
                        optionsCount: (q.options || []).length,
                        itemsCount: (q.items || []).length,
                        answer: q.answer,
                        currentStudentAnswer: answers[q.number],
                      });
                    });
                  }

                  return (
                    <div style={{
                      background: 'white',
                      padding: '1.25rem 0',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
                        <button
                          onClick={() => setShowHelp(true)}
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            background: 'rgb(65, 142, 200)',
                            color: 'white',
                            border: 'none',
                            fontSize: '16px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          title="Click for help with this question type"
                        >
                          ?
                        </button>
                      </div>
                      <DragDropMatchingInput
                        questions={group.questions}
                        answers={groupAnswers}
                        onAnswerChange={(num: number, ans: string) => onAnswerChange(num, ans)}
                        disabled={testSubmitted}
                        labelType={labelFormat === 'roman' ? 'roman' : 'letter'}
                        listTitle={listTitle}
                      />
                    </div>
                  );
                }

                // Summary Completion (From a List) — flowing paragraph with inline dropdowns
                // Per IELTS design doc: ONE continuous paragraph with [▼ Select] dropdowns at blank positions
                if (group.type === 'summary-completion-list') {
                  // Collect all used answers across this group
                  const usedLetters: string[] = [];
                  group.questions.forEach(q => {
                    const val = answers[q.number] as string;
                    if (val) usedLetters.push(val);
                  });

                  // Get options from first question (shared across the group)
                  const optionLabelFormat = group.questions[0]?.optionLabelFormat || 'letter';
                  const options = (group.questions[0] ? getQuestionOptions(group.questions[0]) : []) ?? [];

                  // Helper to check if option is available in dropdown
                  const isOptionAvailable = (letter: string, currentValue: string) => {
                    if (letter === currentValue) return true; // Keep own selection visible
                    return !usedLetters.includes(letter);
                  };

                  // Build the flowing paragraph: reconstruct summary text with inline dropdowns
                  // Strategy: check if first question contains ALL blanks, otherwise concatenate fragments
                  const firstText = group.questions[0]?.question || '';
                  const blankCount = (firstText.match(/_{3,}/g) || []).length;

                  // Build paragraph segments: array of { type: 'text' | 'dropdown', content/questionIndex }
                  type Segment = { type: 'text'; content: string } | { type: 'dropdown'; questionIndex: number };
                  const segments: Segment[] = [];

                  if (blankCount >= group.questions.length) {
                    // First question's text contains ALL blanks — use it as the full summary
                    const parts = firstText.split(/_{3,}/);
                    parts.forEach((part, idx) => {
                      if (part.trim()) segments.push({ type: 'text', content: part });
                      if (idx < group.questions.length) {
                        segments.push({ type: 'dropdown', questionIndex: idx });
                      }
                    });
                  } else {
                    // Each question has its own text fragment — concatenate into paragraph
                    group.questions.forEach((q, idx) => {
                      const text = q.question;
                      const parts = text.split(/_{3,}/);
                      if (parts.length >= 2) {
                        // Has a blank — add text before blank, then dropdown, then text after
                        segments.push({ type: 'text', content: (idx > 0 ? ' ' : '') + parts[0] });
                        segments.push({ type: 'dropdown', questionIndex: idx });
                        if (parts[1]?.trim()) {
                          segments.push({ type: 'text', content: parts.slice(1).join(' ') });
                        }
                      } else {
                        // No blank — just text (shouldn't normally happen for summary-completion-list)
                        segments.push({ type: 'text', content: (idx > 0 ? ' ' : '') + text });
                      }
                    });
                  }

                  return (
                    <div style={{
                      background: 'white',
                      padding: '1.25rem 0',
                    }}>
                      {/* Summary container card — flowing paragraph */}
                        <div
                          ref={(el) => {
                          // Register all question refs for scroll-to
                          if (el) {
                            group.questions.forEach(q => {
                              questionRefs.current[q.number] = el;
                            });
                          }
                        }}
                        style={{
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          padding: '1.25rem 1.5rem',
                          marginBottom: '1rem',
                          background: '#ffffff',
                          fontSize: '16px',
                          lineHeight: 1.8,
                          color: '#000000',
                          fontFamily: 'Arial, sans-serif',
                        }}
                      >
                        {segments.map((seg, segIdx) => {
                          if (seg.type === 'text') {
                            return <span key={`t-${segIdx}`}>{seg.content}</span>;
                          }
                          // Render inline dropdown for this blank
                          const question = group.questions[seg.questionIndex];
                          if (!question) return null;
                          const currentVal = (answers[question.number] as string) || '';
                          const qNum = question.number;
                          const isCorrect = testSubmitted && questionResults ? questionResults[qNum] : null;

                          return (
                            <span key={`d-${segIdx}`} style={{ whiteSpace: 'nowrap' }}>
                              <strong style={{
                                color: testSubmitted && isCorrect !== null
                                  ? isCorrect ? '#16a34a' : '#dc2626'
                                  : '#333',
                                fontSize: '15px',
                              }}>
                                {qNum}.
                              </strong>{' '}
                              <select
                                value={currentVal}
                                onChange={(e) => !testSubmitted && onAnswerChange(qNum, e.target.value)}
                                disabled={testSubmitted}
                                style={{
                                  margin: '0 4px',
                                  padding: '2px 8px',
                                  border: `1px solid ${currentVal ? 'rgb(65, 142, 200)' : 'rgb(83, 83, 83)'}`,
                                  borderRadius: '3px',
                                  fontSize: '15px',
                                  height: '26px',
                                  minWidth: '140px',
                                  outline: 'none',
                                  background: currentVal ? 'rgba(65, 142, 200, 0.05)' : 'white',
                                  cursor: testSubmitted ? 'default' : 'pointer',
                                  verticalAlign: 'middle',
                                }}
                              >
                                <option value="">Select...</option>
                                {options.map((opt, i) => {
                                  const letter = getOptionSelectionValue(opt, i, optionLabelFormat);
                                  const available = isOptionAvailable(letter, currentVal);
                                  return (
                                    <option
                                      key={i}
                                      value={letter}
                                      disabled={!available}
                                      style={{ color: available ? '#000' : '#94a3b8' }}
                                    >
                                      {getOptionDisplayText(opt, i, optionLabelFormat)}{!available ? ' (used)' : ''}
                                    </option>
                                  );
                                })}
                              </select>
                            </span>
                          );
                        })}
                      </div>

                      {/* Shared reference panel — ONE for the entire group */}
                      {options.length > 0 && (
                        <div style={{
                          background: '#f8fafc',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          padding: '1rem 1.25rem',
                        }}>
                          <div style={{
                            fontSize: '14px',
                            fontWeight: 700,
                            color: '#374151',
                            marginBottom: '0.625rem',
                            borderBottom: '1px solid #e5e7eb',
                            paddingBottom: '0.5rem',
                          }}>
                            List of Phrases
                          </div>
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(2, 1fr)',
                            gap: '0.5rem 1.5rem',
                          }}>
                            {options.map((opt, i) => {
                              const letter = getOptionSelectionValue(opt, i, optionLabelFormat);
                              const text = getOptionContentText(opt);
                              const isUsed = usedLetters.includes(letter);
                              return (
                                <div key={i} style={{
                                  fontSize: '14px',
                                  color: isUsed ? '#94a3b8' : '#000000',
                                  textDecoration: isUsed ? 'line-through' : 'none',
                                  lineHeight: 1.5,
                                  fontFamily: 'Arial, sans-serif',
                                  padding: '0.25rem 0',
                                }}>
                                  <strong style={{ color: isUsed ? '#94a3b8' : '#000' }}>{letter}</strong>
                                  {text ? <>  {text}</> : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }

                // ═══════════════════════════════════════════════════════════
                // Table Completion — render as an actual HTML table
                // Per IELTS design doc: clean table with clear borders, header row,
                // inputs within cells, and structured layout
                // ═══════════════════════════════════════════════════════════
                if (group.type === 'table-completion') {

                  // ── Step 1: Try to detect table structure from question texts ──
                  // AI may output questions as:
                  //   Format A: "Plant | North Africa | Soothes ______"  (pipe-delimited)
                  //   Format B: "Gingko Biloba | 18. ______ | Improves cognitive function"
                  //   Format C: "Native Region: ______ (for Gingko Biloba)"  (label: value)
                  //   Format D: Plain sentence "The plant is used for ______" (no table cues)

                  // Check if any question has pipe separators (Format A/B)
                  const hasPipes = group.questions.some(q => cleanQuestionText(q.question).includes('|'));

                  // ── Format A/B: Pipe-delimited table ──
                  if (hasPipes) {
                    // Try to extract column headers from the first question or the section instruction
                    // Many IELTS table completions share a common header structure
                    const allRows = group.questions.map(q => {
                      const cells = cleanQuestionText(q.question).split('|').map(c => c.trim());
                      return { question: q, cells };
                    });

                    // Detect number of columns from the row with most cells
                    const maxCols = Math.max(...allRows.map(r => r.cells.length));

                    // Try to extract headers: check if sectionInstruction or first question's text
                    // contains a header-like pipe row (no blanks)
                    let headers: string[] = [];

                    // Priority 1: Use options as headers (set by extractor from TABLE_HEADERS in sectionInstruction)
                    // For table-completion, options carry column header names since they're otherwise unused
                    const firstQ = group.questions[0];
                    if (firstQ?.options && firstQ.options.length >= 2) {
                      headers = firstQ.options.map((option, index) => getOptionDisplayText(option, index));
                    }
                    // Priority 2: Check if first row looks like a header (no blanks, short text)
                    else {
                      const firstRowCells = allRows[0]?.cells || [];
                      if (firstRowCells.length > 0 && !firstRowCells.some(c => c.includes('___'))) {
                        const looksLikeHeader = firstRowCells.every(c => c.length < 40 && !/\d+\./.test(c));
                        if (looksLikeHeader) {
                          headers = firstRowCells;
                          allRows.shift(); // Remove header row from data rows
                        }
                      }
                    }
                    // Priority 3: Generic fallback headers
                    if (headers.length === 0) {
                      if (maxCols === 3) {
                        headers = ['Category', 'Detail', 'Description'];
                      } else if (maxCols === 2) {
                        headers = ['Item', 'Detail'];
                      } else {
                        headers = Array.from({ length: maxCols }, (_, i) => `Column ${i + 1}`);
                      }
                    }

                    return (
                      <div
                        style={{
                          background: 'white',
                          padding: '1.25rem 0',
                        }}
                      >
                        {/* Table container with horizontal scroll for mobile */}
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            border: '1px solid #d1d5db',
                            fontSize: '15px',
                            fontFamily: 'Arial, sans-serif',
                          }}>
                            {/* Header Row */}
                            <thead>
                              <tr>
                                <th style={{
                                  padding: '0.625rem 0.875rem',
                                  background: '#f1f5f9',
                                  borderBottom: '2px solid #94a3b8',
                                  borderRight: '1px solid #d1d5db',
                                  fontWeight: 700,
                                  fontSize: '14px',
                                  color: '#374151',
                                  textAlign: 'left',
                                  width: '36px',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.05em',
                                }}>
                                  #
                                </th>
                                {headers.map((h, i) => (
                                  <th key={i} style={{
                                    padding: '0.625rem 0.875rem',
                                    background: '#f1f5f9',
                                    borderBottom: '2px solid #94a3b8',
                                    borderRight: i < headers.length - 1 ? '1px solid #d1d5db' : 'none',
                                    fontWeight: 700,
                                    fontSize: '14px',
                                    color: '#374151',
                                    textAlign: 'left',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                  }}>
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            {/* Data Rows */}
                            <tbody>
                              {allRows.map((row, rowIdx) => {
                                const q = row.question;
                                const isCorrect = testSubmitted && questionResults ? questionResults[q.number] : null;
                                const isEvenRow = rowIdx % 2 === 0;

                                return (
                                  <tr
                                    key={q.number}
                                    ref={(el) => { if (el) questionRefs.current[q.number] = el; }}
                                    style={{
                                      background: isEvenRow ? '#ffffff' : '#f9fafb',
                                    }}
                                  >
                                    {/* Question number cell */}
                                    <td style={{
                                      padding: '0.625rem 0.875rem',
                                      borderBottom: '1px solid #e5e7eb',
                                      borderRight: '1px solid #d1d5db',
                                      fontWeight: 700,
                                      fontSize: '14px',
                                      color: testSubmitted && isCorrect !== null
                                        ? isCorrect ? '#16a34a' : '#dc2626'
                                        : '#333333',
                                      textAlign: 'center',
                                      verticalAlign: 'top',
                                      background: testSubmitted && isCorrect !== null
                                        ? isCorrect ? '#f0fdf4' : '#fef2f2'
                                        : 'transparent',
                                    }}>
                                      {q.number}
                                    </td>

                                    {/* Data cells */}
                                    {row.cells.map((cell, cellIdx) => {
                                      const hasBlank = cell.includes('___');
                                      const currentVal = (answers[q.number] as string) || '';

                                      if (hasBlank) {
                                        // Split cell content around the blank(s)
                                        const parts = cell.split(/_{3,}/);
                                        const blankCount = parts.length - 1;
                                        // Multi-blank: parse pipe-delimited answer into array
                                        const answerParts = blankCount > 1 ? currentVal.split('|') : [currentVal];
                                        while (answerParts.length < blankCount) answerParts.push('');

                                        const handlePipeCellBlankChange = (blankIdx: number, newValue: string) => {
                                          if (blankCount === 1) {
                                            !testSubmitted && onAnswerChange(q.number, newValue);
                                          } else {
                                            const updated = [...answerParts];
                                            updated[blankIdx] = newValue;
                                            !testSubmitted && onAnswerChange(q.number, updated.join('|'));
                                          }
                                        };

                                        return (
                                          <td
                                            key={cellIdx}
                                            style={{
                                              padding: '0.625rem 0.875rem',
                                              borderBottom: '1px solid #e5e7eb',
                                              borderRight: cellIdx < row.cells.length - 1 ? '1px solid #d1d5db' : 'none',
                                              fontSize: '15px',
                                              lineHeight: 1.5,
                                              verticalAlign: 'top',
                                            }}
                                          >
                                            {parts.map((part, partIdx) => (
                                              <React.Fragment key={partIdx}>
                                                {part}
                                                {partIdx < blankCount && (() => {
                                                  const blankVal = answerParts[partIdx] || '';
                                                  return (
                                                    <input
                                                      type="text"
                                                      value={blankVal}
                                                      onChange={(e) => handlePipeCellBlankChange(partIdx, e.target.value)}
                                                      disabled={testSubmitted}
                                                      autoComplete="off"
                                                      style={{
                                                        border: `1px solid ${blankVal ? 'rgb(65, 142, 200)' : 'rgb(83, 83, 83)'}`,
                                                        borderRadius: '3px',
                                                        padding: '2px 8px',
                                                        fontSize: '14px',
                                                        height: '26px',
                                                        width: '160px',
                                                        outline: 'none',
                                                        background: blankVal ? 'rgba(65, 142, 200, 0.05)' : 'white',
                                                        fontWeight: 500,
                                                        color: 'rgb(65, 142, 200)',
                                                        margin: '0 4px',
                                                        verticalAlign: 'middle',
                                                      }}
                                                      onFocus={(e) => {
                                                        e.currentTarget.style.borderColor = 'rgb(65, 142, 200)';
                                                        e.currentTarget.style.boxShadow = '0 0 0 1px rgb(65, 142, 200)';
                                                      }}
                                                      onBlur={(e) => {
                                                        e.currentTarget.style.borderColor = blankVal ? 'rgb(65, 142, 200)' : 'rgb(83, 83, 83)';
                                                        e.currentTarget.style.boxShadow = 'none';
                                                      }}
                                                    />
                                                  );
                                                })()}
                                              </React.Fragment>
                                            ))}
                                          </td>
                                        );
                                      }

                                      // Normal cell (no blank)
                                      return (
                                        <td
                                          key={cellIdx}
                                          style={{
                                            padding: '0.625rem 0.875rem',
                                            borderBottom: '1px solid #e5e7eb',
                                            borderRight: cellIdx < row.cells.length - 1 ? '1px solid #d1d5db' : 'none',
                                            fontSize: '15px',
                                            lineHeight: 1.5,
                                            verticalAlign: 'top',
                                          }}
                                        >
                                          {cell}
                                        </td>
                                      );
                                    })}

                                    {/* Pad remaining columns if this row has fewer cells */}
                                    {row.cells.length < maxCols && Array.from(
                                      { length: maxCols - row.cells.length },
                                      (_, i) => (
                                        <td key={`pad-${i}`} style={{
                                          padding: '0.625rem 0.875rem',
                                          borderBottom: '1px solid #e5e7eb',
                                          borderRight: i < maxCols - row.cells.length - 1 ? '1px solid #d1d5db' : 'none',
                                        }} />
                                      )
                                    )}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  }

                  // ── Format C/D: No pipes — render as a proper table per IELTS design guide ──
                  // Detect "Name: Description" pattern (e.g., "Rani Ki Vav: Excellent condition...")
                  // and render as a 2-column table. Otherwise render as single-column table.

                  // Check if questions follow "Name: Description" colon pattern
                  const colonPattern = /^([^:]+):\s+(.+)$/;
                  const parsedRows = group.questions.map(q => {
                    const text = cleanQuestionText(q.question);
                    const match = text.match(colonPattern);
                    if (match && match[1] && match[2]) {
                      return { question: q, name: match[1].trim(), description: match[2].trim() };
                    }
                    return { question: q, name: '', description: text };
                  });

                  // Determine if we have a 2-column layout (most questions have the "Name:" pattern)
                  const hasColonFormat = parsedRows.filter(r => r.name).length >= Math.ceil(group.questions.length * 0.5);



                  // Determine column headers — use options from extractor if available
                  const formatCDFirstQ = group.questions[0];
                  const formatCHeaders = formatCDFirstQ?.options?.map((option, index) => getOptionDisplayText(option, index)) || [];
                  const hasOptionsHeaders = formatCHeaders.length >= 2;
                  const col1Header = hasColonFormat
                    ? (hasOptionsHeaders ? formatCHeaders[0] || 'Name' : 'Name')
                    : '';
                  const col2Header = hasColonFormat
                    ? (hasOptionsHeaders ? formatCHeaders[1] || 'Feature / Detail' : 'Feature / Detail')
                    : (hasOptionsHeaders ? formatCHeaders[0] || 'Description' : 'Description');

                  return (
                    <div style={{ background: 'white', padding: '1.25rem 0' }}>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{
                          width: '100%',
                          borderCollapse: 'collapse',
                          border: '1px solid #d1d5db',
                          fontSize: '15px',
                          fontFamily: 'Arial, sans-serif',
                        }}>
                          {/* Header Row */}
                          <thead>
                            <tr>
                              <th style={{
                                padding: '0.625rem 0.875rem',
                                background: '#f1f5f9',
                                borderBottom: '2px solid #94a3b8',
                                borderRight: '1px solid #d1d5db',
                                fontWeight: 700,
                                fontSize: '14px',
                                color: '#374151',
                                textAlign: 'left',
                                width: '36px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                              }}>
                                #
                              </th>
                              {hasColonFormat && (
                                <th style={{
                                  padding: '0.625rem 0.875rem',
                                  background: '#f1f5f9',
                                  borderBottom: '2px solid #94a3b8',
                                  borderRight: '1px solid #d1d5db',
                                  fontWeight: 700,
                                  fontSize: '14px',
                                  color: '#374151',
                                  textAlign: 'left',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.05em',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {col1Header}
                                </th>
                              )}
                              <th style={{
                                padding: '0.625rem 0.875rem',
                                background: '#f1f5f9',
                                borderBottom: '2px solid #94a3b8',
                                fontWeight: 700,
                                fontSize: '14px',
                                color: '#374151',
                                textAlign: 'left',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                              }}>
                                {col2Header}
                              </th>
                            </tr>
                          </thead>
                          {/* Data Rows */}
                          <tbody>
                            {parsedRows.map((row, rowIdx) => {
                              const q = row.question;
                              // Normalize the description text for cleaner table cell display:
                              // 1. Convert dot-based blanks (.........) to underscore blanks (___)
                              // 2. Strip redundant inline question number refs like "(9)" or "(10)"
                              // 3. Strip trailing instruction text like "(ONE WORD AND/OR A NUMBER)"
                              let descText = row.description
                                .replace(/\.{4,}/g, '___')           // dots → underscores
                                .replace(/…{2,}/g, '___')            // multi-ellipsis → underscores
                                .replace(/\(\d+\)\s*/g, '')          // strip (9), (10), etc.
                                .replace(/\((?:ONE WORD|NO MORE THAN|CHOOSE)[^)]*\)\s*/gi, '') // strip word limit instructions
                                .replace(/\s{2,}/g, ' ')             // collapse extra spaces
                                .trim();
                              const hasBlank = descText.includes('___');
                              const currentVal = (answers[q.number] as string) || '';
                              const isCorrect = testSubmitted && questionResults ? questionResults[q.number] : null;
                              const isEvenRow = rowIdx % 2 === 0;

                              return (
                                <tr
                                  key={q.number}
                                  ref={(el) => { if (el) questionRefs.current[q.number] = el; }}
                                  style={{
                                    background: isEvenRow ? '#ffffff' : '#f9fafb',
                                  }}
                                >
                                  {/* Question number cell */}
                                  <td style={{
                                    padding: '0.625rem 0.875rem',
                                    borderBottom: '1px solid #e5e7eb',
                                    borderRight: '1px solid #d1d5db',
                                    fontWeight: 700,
                                    fontSize: '14px',
                                    color: testSubmitted && isCorrect !== null
                                      ? isCorrect ? '#16a34a' : '#dc2626'
                                      : '#333333',
                                    textAlign: 'center',
                                    verticalAlign: 'top',
                                    background: testSubmitted && isCorrect !== null
                                      ? isCorrect ? '#f0fdf4' : '#fef2f2'
                                      : 'transparent',
                                  }}>
                                    {q.number}
                                  </td>

                                  {/* Name column (if colon format) */}
                                  {hasColonFormat && (
                                    <td style={{
                                      padding: '0.625rem 0.875rem',
                                      borderBottom: '1px solid #e5e7eb',
                                      borderRight: '1px solid #d1d5db',
                                      fontSize: '15px',
                                      fontWeight: 600,
                                      lineHeight: 1.5,
                                      verticalAlign: 'top',
                                      whiteSpace: 'nowrap',
                                    }}>
                                      {row.name}
                                    </td>
                                  )}

                                  {/* Description / Detail cell with inline input */}
                                  <td style={{
                                    padding: '0.625rem 0.875rem',
                                    borderBottom: '1px solid #e5e7eb',
                                    fontSize: '15px',
                                    lineHeight: 1.5,
                                    verticalAlign: 'top',
                                  }}>
                                    {hasBlank ? (
                                      <>
                                        {(() => {
                                          const parts = descText.split(/_{3,}/);
                                          const blankCount = parts.length - 1;
                                          // Multi-blank: parse pipe-delimited answer into array
                                          const answerParts = blankCount > 1 ? currentVal.split('|') : [currentVal];
                                          while (answerParts.length < blankCount) answerParts.push('');

                                          const handleCellBlankChange = (blankIdx: number, newValue: string) => {
                                            if (blankCount === 1) {
                                              !testSubmitted && onAnswerChange(q.number, newValue);
                                            } else {
                                              const updated = [...answerParts];
                                              updated[blankIdx] = newValue;
                                              !testSubmitted && onAnswerChange(q.number, updated.join('|'));
                                            }
                                          };

                                          return (
                                            <span>
                                              {parts.map((part, idx) => (
                                                <React.Fragment key={idx}>
                                                  {part}
                                                  {idx < blankCount && (() => {
                                                    const blankVal = answerParts[idx] || '';
                                                    return (
                                                      <input
                                                        type="text"
                                                        value={blankVal}
                                                        onChange={(e) => handleCellBlankChange(idx, e.target.value)}
                                                        disabled={testSubmitted}
                                                        autoComplete="off"
                                                        style={{
                                                          border: `1px solid ${blankVal ? 'rgb(65, 142, 200)' : 'rgb(83, 83, 83)'}`,
                                                          borderRadius: '3px',
                                                          padding: '2px 8px',
                                                          fontSize: '14px',
                                                          height: '26px',
                                                          width: '160px',
                                                          outline: 'none',
                                                          background: blankVal ? 'rgba(65, 142, 200, 0.05)' : 'white',
                                                          fontWeight: 500,
                                                          color: 'rgb(65, 142, 200)',
                                                          margin: '0 4px',
                                                          verticalAlign: 'middle',
                                                        }}
                                                        onFocus={(e) => {
                                                          e.currentTarget.style.borderColor = 'rgb(65, 142, 200)';
                                                          e.currentTarget.style.boxShadow = '0 0 0 1px rgb(65, 142, 200)';
                                                        }}
                                                        onBlur={(e) => {
                                                          e.currentTarget.style.borderColor = blankVal ? 'rgb(65, 142, 200)' : 'rgb(83, 83, 83)';
                                                          e.currentTarget.style.boxShadow = 'none';
                                                        }}
                                                      />
                                                    );
                                                  })()}
                                                </React.Fragment>
                                              ))}
                                            </span>
                                          );
                                        })()}
                                      </>
                                    ) : (
                                      <div>
                                        <div style={{ marginBottom: '0.5rem' }}>{descText}</div>
                                        <AuthenticAnswerInput
                                          question={q}
                                          answer={answers[q.number] || ''}
                                          onChange={(answer) => onAnswerChange(q.number, answer)}
                                          disabled={testSubmitted}
                                        />
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                }

                // Default: render questions individually
                return group.questions.map((question) => {
                  return (
                    <div
                      key={question.number}
                      ref={(el) => { if (el) questionRefs.current[question.number] = el; }}
                      style={{
                        background: 'white',
                        borderBottom: '1px solid #e5e7eb',
                        padding: '1.25rem 0',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      {/* Question Text with Number */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.75rem',
                        marginBottom: '0.75rem',
                      }}>
                        <div style={{
                          minWidth: '24px',
                          height: '24px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '15px',
                          color: testSubmitted && questionResults
                            ? questionResults[question.number] ? '#16a34a' : '#dc2626'
                            : '#333333',
                          flexShrink: 0,
                          border: activeQuestionNumber === question.number ? '2px solid rgb(65, 142, 200)' : 'none',
                          borderRadius: '3px',
                          background: (testSubmitted && questionResults) ? (questionResults[question.number] ? '#f0fdf4' : '#fef2f2') : 'transparent',
                        }}>
                          {question.number}
                        </div>
                        <div style={{
                          flex: 1,
                          fontSize: '16px',
                          fontWeight: 400,
                          color: '#000000',
                          lineHeight: 1.6,
                          fontFamily: 'Arial, sans-serif',
                        }}>
                          {/* Skip rendering text here if it's a completion question with inline blanks, 
                              as the AuthenticAnswerInput will handle the text rendering */}
                          {!(
                            (question.type === 'completion' ||
                              question.type === 'sentence-completion' ||
                              question.type === 'summary-completion-text' ||
                              question.type === 'note-completion' ||
                              question.type === 'table-completion' ||
                              question.type === 'flowchart-completion' ||
                              question.type === 'diagram-labeling') &&
                            question.question.includes('___')
                          ) && cleanQuestionText(question.question)}
                        </div>
                      </div>

                      {/* Question Image (if exists) */}
                      {question.imageUrl && (
                        <div style={{
                          marginBottom: '1.25rem',
                          borderRadius: '0.5rem',
                          overflow: 'hidden',
                          border: '1px solid #e2e8f0',
                        }}>
                          <img
                            src={question.imageUrl}
                            alt={`Question ${question.number} diagram`}
                            style={{
                              width: '100%',
                              height: 'auto',
                              display: 'block',
                            }}
                          />
                        </div>
                      )}

                      {/* Answer Input */}
                      <div style={{
                        padding: '0.5rem 0',
                      }}>
                        <AuthenticAnswerInput
                          question={question}
                          answer={answers[question.number] || ''}
                          onChange={(answer) => onAnswerChange(question.number, answer)}
                          disabled={testSubmitted}
                          skill={skill}
                        />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        ))}
      </div>

      {showHelp && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            background: 'white',
            padding: '2rem',
            borderRadius: '8px',
            maxWidth: '400px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ marginTop: 0, color: 'rgb(65, 142, 200)' }}>How to Match Headings</h3>
            <p style={{ fontSize: '15px', lineHeight: 1.5, color: '#333' }}>Drag a heading from the 'List of Headings' and drop it onto the target box for the correct paragraph.</p>
            <p style={{ fontSize: '15px', lineHeight: 1.5, color: '#333' }}>You can change your answer by dragging a different heading onto the box or by clicking the '×' to clear it.</p>
            <button
              onClick={() => setShowHelp(false)}
              style={{
                width: '100%',
                padding: '0.75rem',
                marginTop: '1rem',
                background: 'rgb(65, 142, 200)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default IELTSQuestionsPanel;
