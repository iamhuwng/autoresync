/**
 * IELTS Listening Parser
 * Specialized parser for IELTS Listening test format
 * 
 * PHASE 3 ENHANCEMENTS (Nov 27, 2025):
 * - Uses shared types from parser/types
 * - Returns Result<> type for consistency
 * - IELTS validation with section/question counts
 * - canHandle() method for router
 * - Test-level metadata generation
 * 
 * Handles:
 * - Section structure detection (Questions X-Y with instructions)
 * - Note/Form completion context extraction
 * - Matching options box extraction
 * - Map/diagram labelling
 * - Sentence completion with inline blanks
 */

import type { ParsedQuestion, QuestionType } from '../../types/document.types';
import type { Result } from '../../types/result.types';
import type { IELTSTaskType } from '../../types/ielts.types';
import type { CanHandleResult } from './types/parser.types';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ListeningSection {
  sectionNumber: number;           // 1-4 for IELTS
  questionRange: { start: number; end: number };
  instructions: string;
  wordLimit?: string;
  type: ListeningSectionType;
  rawText: string;
  context?: SectionContext;
  optionsBox?: string[];
}

export type ListeningSectionType =
  | 'completion'           // Unified completion type
  | 'note-completion'
  | 'form-completion'
  | 'table-completion'
  | 'sentence-completion'
  | 'summary-completion'
  | 'multiple-choice'
  | 'multiple-select'
  | 'matching'
  | 'map-labelling'
  | 'plan-labelling'
  | 'diagram-labeling'     // Match QuestionType spelling
  | 'short-answer'
  | 'unknown';

/**
 * Map internal Listening types to standard QuestionType
 */
const mapToQuestionType = (type: ListeningSectionType): QuestionType => {
  const typeMap: Record<ListeningSectionType, QuestionType> = {
    'completion': 'completion',
    'note-completion': 'completion',
    'form-completion': 'completion',
    'table-completion': 'completion',
    'sentence-completion': 'completion',
    'summary-completion': 'completion',
    'multiple-choice': 'multiple-choice',
    'multiple-select': 'multiple-select',
    'matching': 'matching',
    'map-labelling': 'diagram-labeling',
    'plan-labelling': 'diagram-labeling',
    'diagram-labeling': 'diagram-labeling',
    'short-answer': 'short-answer',
    'unknown': 'short-answer',
  };
  return typeMap[type] || 'short-answer';
};

export interface SectionContext {
  heading?: string;              // e.g., "CHILDREN'S ENGINEERING WORKSHOPS"
  subheadings?: string[];        // e.g., "Outdoor play sessions", "Booking information"
  contextLines?: ContextLine[];  // Lines with blanks embedded
  tableHeaders?: string[];       // For table completion
  tableRows?: TableRow[];
}

export interface ContextLine {
  text: string;
  blankNumber?: number;          // Question number for this blank
  indentLevel: number;           // 0, 1, 2 for visual hierarchy
}

/**
 * Internal question type (without required answerSource/confidence)
 * These fields are added by the builder after parsing
 */
export interface ListeningParsedQuestion {
  id: string;
  number: number;
  questionNumber: number;
  questionText: string;
  question: string;
  type: string;
  answer: string | string[];
  options?: string[];
  context?: {
    sectionHeading?: string;
    contextLines?: string[];
    currentLineIndex?: number;
  };
}

export interface TableRow {
  cells: string[];
  blankNumbers?: number[];
}

/**
 * IELTS Listening validation result
 */
export interface ListeningValidation {
  isValidIELTS: boolean;
  sectionCount: { actual: number; expected: number; valid: boolean };
  questionCount: { actual: number; expected: number; valid: boolean };
  questionsPerSection: Array<{ section: number; actual: number; expected: number; valid: boolean }>;
  warnings: string[];
  errors: string[];
}

/**
 * Test-level metadata for listening
 */
export interface ListeningMetadata {
  totalTime: number; // ~30 minutes + 10 min transfer
  totalSections: number;
  totalQuestions: number;
  sectionTypes: ListeningSectionType[];
  taskTypeSummary: Partial<Record<IELTSTaskType, number>>;
  overallConfidence: number;
}

export interface ListeningParseResult {
  sections: ListeningSection[];
  questions: ParsedQuestion[];
  totalQuestions: number;
  parseConfidence: number;
  validation?: ListeningValidation;
  metadata?: ListeningMetadata;
  parserUsed: 'listening';
}

// ═══════════════════════════════════════════════════════════════
// MAIN PARSER CLASS
// ═══════════════════════════════════════════════════════════════

class ListeningParser {

  /**
   * Parse IELTS Listening test text
   */
  async parseListeningText(
    text: string,
    onProgress?: (stage: string, progress: number) => void
  ): Promise<ListeningParseResult> {
    onProgress?.('Detecting section structure...', 10);

    // Step 1: Detect sections (Questions X-Y blocks)
    const sections = this.detectSections(text);

    onProgress?.('Extracting section contexts...', 30);

    // Step 2: Extract context for each section
    for (const section of sections) {
      section.context = this.extractSectionContext(section);
      section.optionsBox = this.extractOptionsBox(section);
    }

    onProgress?.('Parsing questions...', 50);

    // Step 3: Parse questions with context
    const questions = await this.parseQuestionsWithContext(sections, onProgress);

    onProgress?.('Validating IELTS structure...', 85);

    // Step 4: Validate IELTS structure
    const validation = this.validateIELTSStructure(sections, questions);

    onProgress?.('Generating metadata...', 90);

    // Step 5: Generate metadata
    const parseConfidence = this.calculateConfidence(sections, questions);
    const metadata = this.generateMetadata(sections, questions, parseConfidence);

    // Log validation results
    if (validation.warnings.length > 0) {
      console.warn('📋 [Listening Parser] IELTS validation warnings:', validation.warnings);
    }
    if (validation.errors.length > 0) {
      console.error('❌ [Listening Parser] IELTS validation errors:', validation.errors);
    }

    onProgress?.('Complete', 100);

    return {
      sections,
      questions,
      totalQuestions: questions.length,
      parseConfidence,
      validation,
      metadata,
      parserUsed: 'listening',
    };
  }

  /**
   * Parse with Result wrapper for router compatibility
   */
  async parse(
    text: string,
    onProgress?: (stage: string, progress: number) => void
  ): Promise<Result<ListeningParseResult>> {
    try {
      const result = await this.parseListeningText(text, onProgress);
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Listening parser failed',
      };
    }
  }

  /**
   * Check if this parser can handle the given text
   */
  canHandle(text: string): CanHandleResult {
    // Look for IELTS Listening-specific patterns
    const hasQuestionRanges = /questions?\s*\d+\s*[-–—]\s*\d+/i.test(text);
    const hasListeningKeywords = /listening\s*(test|section)|section\s*[1-4]/i.test(text);
    const hasCompletionInstructions = /complete\s+(the\s+)?(notes?|form|table|sentences?)/i.test(text);
    const hasAudioReferences = /audio|recording|speaker|listen/i.test(text);
    const hasWordLimit = /no\s+more\s+than\s+(one|two|three|\d+)\s+words?/i.test(text);

    let confidence = 50; // Base confidence for listening parser

    if (hasQuestionRanges) confidence += 15;
    if (hasListeningKeywords) confidence += 15;
    if (hasCompletionInstructions) confidence += 10;
    if (hasAudioReferences) confidence += 5;
    if (hasWordLimit) confidence += 5;

    // Listening parser is specialized - only handle if we see Listening-specific patterns
    const canHandle = confidence >= 60;

    return {
      canHandle,
      confidence: Math.min(confidence, 95),
      reason: canHandle
        ? 'Text contains IELTS Listening patterns'
        : 'Text does not appear to be IELTS Listening format',
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION DETECTION
  // ═══════════════════════════════════════════════════════════════

  /**
   * Detect IELTS Listening sections from text
   * Pattern: "Questions X-Y" followed by instructions
   */
  private detectSections(text: string): ListeningSection[] {
    const sections: ListeningSection[] = [];
    const lines = text.split('\n');

    // More flexible patterns for section headers
    // Matches: "Questions 1-6", "**Questions 1–6**", "SECTION 1: Questions 1-10", 
    //          "Questions 1 - 10", "PART 1 Questions 1-10", etc.
    const sectionHeaderPatterns = [
      /^\*{0,2}Questions?\s+(\d+)\s*[-–—]\s*(\d+)\*{0,2}$/i,                    // Questions 1-6
      /^\*{0,2}Questions?\s+(\d+)\s*[-–—]\s*(\d+)\s*[:(]/i,                      // Questions 1-6: or Questions 1-6 (
      /(?:SECTION|PART|SECTION\s*\d+:?)\s*Questions?\s+(\d+)\s*[-–—]\s*(\d+)/i,  // SECTION 1: Questions 1-10
      /Questions?\s+(\d+)\s*[-–—]\s*(\d+)/i,                                     // Questions 1-10 (anywhere in line)
    ];

    let currentSectionStart = -1;
    let currentSection: Partial<ListeningSection> | null = null;

    console.log('📋 [Listening Parser] Detecting sections from', lines.length, 'lines');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const trimmedLine = line.trim();

      // Try each pattern
      let match: RegExpMatchArray | null = null;
      for (const pattern of sectionHeaderPatterns) {
        match = trimmedLine.match(pattern);
        if (match && match[1] && match[2]) {
          console.log('📋 [Listening Parser] Found section header:', trimmedLine);
          break;
        }
      }

      if (match && match[1] && match[2]) {
        // Save previous section
        if (currentSection && currentSectionStart >= 0) {
          currentSection.rawText = lines.slice(currentSectionStart, i).join('\n');
          sections.push(currentSection as ListeningSection);
        }

        // Start new section
        const startQ = parseInt(match[1], 10);
        const endQ = parseInt(match[2], 10);

        currentSectionStart = i;
        currentSection = {
          sectionNumber: Math.ceil(startQ / 10), // Estimate section 1-4
          questionRange: { start: startQ, end: endQ },
          instructions: '',
          type: 'unknown',
          rawText: '',
        };

        // Extract instructions (next lines until question numbers or empty block)
        const instructions = this.extractInstructions(lines, i + 1);
        currentSection.instructions = instructions.text;
        currentSection.wordLimit = instructions.wordLimit;
        currentSection.type = this.detectSectionType(instructions.text);
      }
    }

    // Save last section
    if (currentSection && currentSectionStart >= 0) {
      currentSection.rawText = lines.slice(currentSectionStart).join('\n');
      sections.push(currentSection as ListeningSection);
    }

    // If no sections detected, treat entire text as one section
    if (sections.length === 0) {
      sections.push({
        sectionNumber: 1,
        questionRange: { start: 1, end: 40 },
        instructions: '',
        type: 'unknown',
        rawText: text,
      });
    }

    return sections;
  }

  /**
   * Extract instructions after section header
   */
  private extractInstructions(lines: string[], startLine: number): { text: string; wordLimit?: string } {
    let instructions = '';
    let wordLimit: string | undefined;
    let emptyCount = 0;

    for (let i = startLine; i < Math.min(startLine + 25, lines.length); i++) {
      const line = lines[i].trim();

      // Stop at question numbers (1. or 1) etc.) but not embedded blanks
      if (/^\d+[\.\)]\s+[A-Z]/.test(line) && !line.includes('_')) {
        break;
      }

      // Count empty lines
      if (line.length === 0) {
        emptyCount++;
        if (emptyCount >= 3 && instructions.length > 30) break;
        continue;
      }
      emptyCount = 0;

      // Extract word limit instruction
      if (line.toLowerCase().includes('no more than') ||
        line.toLowerCase().includes('one word only') ||
        line.toLowerCase().includes('write')) {
        wordLimit = line;
      }

      instructions += ' ' + line;
    }

    return { text: instructions.trim(), wordLimit };
  }

  /**
   * Detect section type from instructions
   */
  private detectSectionType(instructions: string): ListeningSectionType {
    const lower = instructions.toLowerCase();

    // Note/Form/Table Completion
    if (lower.includes('complete the notes') || lower.includes('note completion')) {
      return 'note-completion';
    }
    if (lower.includes('complete the form') || lower.includes('form below')) {
      return 'form-completion';
    }
    if (lower.includes('complete the table') || lower.includes('table below')) {
      return 'table-completion';
    }
    if (lower.includes('complete the summary') || lower.includes('summary below')) {
      return 'summary-completion';
    }
    if (lower.includes('complete the sentence') || lower.includes('sentences below')) {
      return 'sentence-completion';
    }

    // Map/Plan/Diagram Labelling
    if (lower.includes('label the map') || lower.includes('map below')) {
      return 'map-labelling';
    }
    if (lower.includes('label the plan') || lower.includes('plan below')) {
      return 'plan-labelling';
    }
    if (lower.includes('label the diagram') || lower.includes('diagram below')) {
      return 'diagram-labeling';
    }

    // Matching
    if (lower.includes('match') || lower.includes('which') && lower.includes('letter')) {
      return 'matching';
    }
    if (lower.includes('choose') && lower.includes('list')) {
      return 'matching';
    }

    // Multiple Choice/Select
    if (lower.includes('choose two') || lower.includes('choose three') ||
      lower.includes('select two') || lower.includes('select three')) {
      return 'multiple-select';
    }
    if (lower.includes('choose the correct letter') || lower.includes('circle the correct')) {
      return 'multiple-choice';
    }

    // Short Answer
    if (lower.includes('answer the questions') || lower.includes('answer the following')) {
      return 'short-answer';
    }

    return 'unknown';
  }

  // ═══════════════════════════════════════════════════════════════
  // CONTEXT EXTRACTION
  // ═══════════════════════════════════════════════════════════════

  /**
   * Extract context for completion-type sections
   * This extracts the form/note structure with blanks
   */
  private extractSectionContext(section: ListeningSection): SectionContext | undefined {
    if (!this.isCompletionType(section.type)) {
      return undefined;
    }

    const context: SectionContext = {
      contextLines: [],
      subheadings: [],
    };

    const lines = section.rawText.split('\n');
    let inContextBlock = false;
    let foundBlank = false;

    // Patterns
    const blankPattern = /(\d+)\s*[_\.]{2,}|_{2,}\s*(\d+)|__+\s*\((\d+)\)/;
    const headingPattern = /^[A-Z][A-Z\s]+$/; // ALL CAPS = heading
    const subheadingPattern = /^[A-Z][a-z]/;  // Title Case = subheading

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Skip section headers
      if (/^Questions?\s+\d+/i.test(trimmed)) continue;
      if (trimmed.toLowerCase().includes('no more than')) continue;
      if (trimmed.toLowerCase().includes('write')) continue;

      // Detect heading (ALL CAPS)
      if (headingPattern.test(trimmed) && trimmed.length > 3) {
        context.heading = trimmed;
        inContextBlock = true;
        continue;
      }

      // Check for blanks
      const blankMatch = trimmed.match(blankPattern);
      if (blankMatch) {
        foundBlank = true;
        inContextBlock = true;
        const blankNum = parseInt(blankMatch[1] || blankMatch[2] || blankMatch[3]);

        // Calculate indent level based on leading whitespace
        const leadingSpaces = line.length - line.trimStart().length;
        const indentLevel = Math.min(2, Math.floor(leadingSpaces / 4));

        context.contextLines?.push({
          text: trimmed,
          blankNumber: blankNum,
          indentLevel,
        });
      } else if (inContextBlock && subheadingPattern.test(trimmed)) {
        // Subheading within context
        context.subheadings?.push(trimmed);
        context.contextLines?.push({
          text: trimmed,
          indentLevel: 0,
        });
      } else if (foundBlank && trimmed.length > 5) {
        // Context line without blank
        const leadingSpaces = line.length - line.trimStart().length;
        const indentLevel = Math.min(2, Math.floor(leadingSpaces / 4));

        context.contextLines?.push({
          text: trimmed,
          indentLevel,
        });
      }
    }

    return context.contextLines && context.contextLines.length > 0 ? context : undefined;
  }

  /**
   * Check if section type is completion-based
   */
  private isCompletionType(type: ListeningSectionType): boolean {
    return [
      'note-completion',
      'form-completion',
      'table-completion',
      'sentence-completion',
      'summary-completion',
    ].includes(type);
  }

  // ═══════════════════════════════════════════════════════════════
  // OPTIONS BOX EXTRACTION
  // ═══════════════════════════════════════════════════════════════

  /**
   * Extract options box for matching questions
   * Pattern: A. option text, B. option text, etc.
   */
  private extractOptionsBox(section: ListeningSection): string[] | undefined {
    if (!this.needsOptionsBox(section.type)) {
      return undefined;
    }

    const options: string[] = [];
    const lines = section.rawText.split('\n');

    // Pattern for options: "A.", "A)", "A -" followed by text
    const optionPattern = /^([A-I])[\.\)\-:]\s*(.+)$/i;

    let inOptionsBlock = false;

    for (const line of lines) {
      const trimmed = line.trim();
      const match = trimmed.match(optionPattern);

      if (match) {
        inOptionsBlock = true;
        options.push(match[2].trim());
      } else if (inOptionsBlock && trimmed.length === 0) {
        // Empty line after options block ends it
        if (options.length >= 3) break;
      }
    }

    return options.length > 0 ? options : undefined;
  }

  /**
   * Check if section type needs options box
   */
  private needsOptionsBox(type: ListeningSectionType): boolean {
    return [
      'matching',
      'map-labelling',
      'plan-labelling',
    ].includes(type);
  }

  // ═══════════════════════════════════════════════════════════════
  // QUESTION PARSING
  // ═══════════════════════════════════════════════════════════════

  /**
   * Parse questions with context from sections
   */
  private async parseQuestionsWithContext(
    sections: ListeningSection[],
    onProgress?: (stage: string, progress: number) => void
  ): Promise<ParsedQuestion[]> {
    const allQuestions: ParsedQuestion[] = [];

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      if (!section) continue;
      const progress = 50 + (i / sections.length) * 35;
      onProgress?.(`Parsing section ${i + 1}...`, progress);

      const sectionQuestions = await this.parseSectionQuestions(section);
      allQuestions.push(...sectionQuestions);
    }

    return allQuestions;
  }

  /**
   * Parse questions from a single section
   */
  private async parseSectionQuestions(section: ListeningSection): Promise<ParsedQuestion[]> {
    const questions: ParsedQuestion[] = [];
    const { start, end } = section.questionRange;

    // For completion types with context, extract questions from context lines
    if (section.context?.contextLines) {
      for (const contextLine of section.context.contextLines) {
        if (contextLine.blankNumber) {
          questions.push({
            id: `q-${contextLine.blankNumber}`,
            number: contextLine.blankNumber,
            questionNumber: contextLine.blankNumber,
            questionText: contextLine.text,
            question: contextLine.text,
            type: mapToQuestionType(section.type),
            answer: '',
            answerSource: 'ai-suggestion' as const,
            confidence: 100,
            options: section.optionsBox,
            context: {
              sectionHeading: section.context?.heading || '',
              contextLines: section.context?.contextLines?.map(cl => cl.text) || [],
              currentLineIndex: section.context?.contextLines?.indexOf(contextLine) ?? 0,
            },
          });
        }
      }
    }

    // If no questions from context, extract from raw text
    if (questions.length === 0) {
      const extractedQuestions = this.extractQuestionsFromText(section);
      questions.push(...extractedQuestions);
    }

    // Ensure we have the right number of questions
    const expectedCount = end - start + 1;
    if (questions.length < expectedCount) {
      // Fill in missing questions
      for (let num = start; num <= end; num++) {
        if (!questions.find(q => q.number === num)) {
          questions.push({
            id: `q-${num}`,
            number: num,
            questionNumber: num,
            questionText: '',
            question: '',
            type: mapToQuestionType(section.type),
            answer: '',
            answerSource: 'ai-suggestion' as const,
            confidence: 100,
            options: section.optionsBox,
          });
        }
      }
    }

    // Sort by question number
    return questions.sort((a, b) => a.number - b.number);
  }

  /**
   * Extract questions from raw section text
   */
  private extractQuestionsFromText(section: ListeningSection): ParsedQuestion[] {
    const questions: ParsedQuestion[] = [];
    const lines = section.rawText.split('\n');

    // Pattern: "1.", "1)", "1 " followed by text
    const questionPattern = /^(\d+)[\.\)\s]+(.+)/;

    let currentQuestion: Partial<ParsedQuestion> | null = null;
    let currentOptions: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Check for question number
      const qMatch = trimmed.match(questionPattern);
      if (qMatch) {
        // Save previous question
        if (currentQuestion) {
          currentQuestion.options = currentOptions.length > 0 ? currentOptions : section.optionsBox;
          questions.push(currentQuestion as ParsedQuestion);
        }

        const num = parseInt(qMatch[1]);
        const text = qMatch[2];

        // Check if within section range
        if (num >= section.questionRange.start && num <= section.questionRange.end) {
          currentQuestion = {
            id: `q-${num}`,
            number: num,
            questionNumber: num,
            questionText: text || '',
            question: text || '',
            type: mapToQuestionType(section.type),
            answer: '',
          };
          currentOptions = [];
        }
        continue;
      }

      // Check for options (A., B., etc.)
      const optionMatch = trimmed.match(/^([A-D])[\.\)]\s*(.+)/i);
      if (optionMatch && currentQuestion) {
        currentOptions.push(optionMatch[2].trim());
      }
    }

    // Save last question
    if (currentQuestion) {
      currentQuestion.options = currentOptions.length > 0 ? currentOptions : section.optionsBox;
      questions.push(currentQuestion as ParsedQuestion);
    }

    return questions;
  }

  // ═══════════════════════════════════════════════════════════════
  // CONFIDENCE CALCULATION
  // ═══════════════════════════════════════════════════════════════

  /**
   * Calculate parsing confidence score
   */
  private calculateConfidence(sections: ListeningSection[], questions: ParsedQuestion[]): number {
    let score = 100;

    // Penalize if no sections detected
    if (sections.length === 0) score -= 30;

    // Penalize if sections have unknown type
    const unknownSections = sections.filter(s => s.type === 'unknown').length;
    score -= unknownSections * 10;

    // Penalize if questions missing text
    const emptyQuestions = questions.filter(q => !q.questionText).length;
    score -= emptyQuestions * 2;

    // Bonus for context extraction
    const questionsWithContext = questions.filter(q => q.context).length;
    if (questionsWithContext > 0) {
      score += 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  // ═══════════════════════════════════════════════════════════════
  // IELTS VALIDATION
  // ═══════════════════════════════════════════════════════════════

  /**
   * Validate parsed content against IELTS Listening standards
   */
  private validateIELTSStructure(
    sections: ListeningSection[],
    questions: ParsedQuestion[]
  ): ListeningValidation {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Section validation (IELTS Listening has 4 sections)
    const sectionCount = {
      actual: sections.length,
      expected: 4,
      valid: sections.length === 4 || sections.length === 0, // 0 = single block parsing
    };

    if (!sectionCount.valid && sections.length > 0) {
      warnings.push(`IELTS Listening typically has 4 sections (found ${sections.length})`);
    }

    // Question count validation (IELTS Listening has 40 questions)
    const questionCount = {
      actual: questions.length,
      expected: 40,
      valid: questions.length === 40,
    };

    if (!questionCount.valid) {
      if (questions.length === 0) {
        errors.push('No questions detected in the document');
      } else {
        warnings.push(`IELTS Listening has 40 questions (found ${questions.length})`);
      }
    }

    // Questions per section (10 each)
    const questionsPerSection = sections.map((section, index) => {
      const sectionQuestions = questions.filter(
        q => q.number >= section.questionRange.start && q.number <= section.questionRange.end
      );
      return {
        section: index + 1,
        actual: sectionQuestions.length,
        expected: 10,
        valid: sectionQuestions.length === 10 || sectionQuestions.length === (section.questionRange.end - section.questionRange.start + 1),
      };
    });

    // Check for unknown section types
    const unknownSections = sections.filter(s => s.type === 'unknown');
    if (unknownSections.length > 0) {
      warnings.push(`${unknownSections.length} section(s) have undetected question type`);
    }

    return {
      isValidIELTS: errors.length === 0,
      sectionCount,
      questionCount,
      questionsPerSection,
      warnings,
      errors,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // METADATA GENERATION
  // ═══════════════════════════════════════════════════════════════

  /**
   * Generate test-level metadata
   */
  private generateMetadata(
    sections: ListeningSection[],
    questions: ParsedQuestion[],
    confidence: number
  ): ListeningMetadata {
    // Map section types to IELTS task types
    const taskTypeSummary: Partial<Record<IELTSTaskType, number>> = {};

    for (const section of sections) {
      const ieltsType = this.mapSectionTypeToIELTS(section.type);
      if (ieltsType) {
        taskTypeSummary[ieltsType] = (taskTypeSummary[ieltsType] || 0) +
          (section.questionRange.end - section.questionRange.start + 1);
      }
    }

    return {
      totalTime: 40, // ~30 minutes audio + 10 minutes transfer time
      totalSections: sections.length,
      totalQuestions: questions.length,
      sectionTypes: sections.map(s => s.type),
      taskTypeSummary,
      overallConfidence: confidence,
    };
  }

  /**
   * Map internal section types to IELTS task types
   */
  private mapSectionTypeToIELTS(sectionType: ListeningSectionType): IELTSTaskType | null {
    const typeMap: Partial<Record<ListeningSectionType, IELTSTaskType>> = {
      'note-completion': 'note-completion',
      'form-completion': 'note-completion',
      'table-completion': 'table-completion',
      'sentence-completion': 'sentence-completion',
      'summary-completion': 'summary-completion-text',
      'multiple-choice': 'multiple-choice',
      'multiple-select': 'multiple-select',
      'matching': 'matching-features',
      'map-labelling': 'diagram-labeling',
      'plan-labelling': 'diagram-labeling',
      'diagram-labeling': 'diagram-labeling',
      'short-answer': 'short-answer',
    };

    return typeMap[sectionType] || null;
  }
}

// Export singleton instance
export const listeningParser = new ListeningParser();
