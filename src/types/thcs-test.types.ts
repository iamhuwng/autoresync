// ═══════════════════════════════════════════════════════════════
// PRD-0027/0028: THCS-THPT Test Data Model
// Phase 1: Editor + MCQ Flow | Phase 2: Fill-in, Writing, Cloze
// ═══════════════════════════════════════════════════════════════

/**
 * MCQ Intent Types — determines auto-generated section instruction
 * and analytics categorization. All use the same 4-option MCQ widget.
 */
export type MCQIntent =
    | 'pronunciation'          // A1: Odd-one-out underlined pronunciation
    | 'word-stress'            // A2: Odd-one-out stress pattern
    | 'mcq-grammar'            // B1: Gap-fill grammar
    | 'mcq-vocabulary'         // B2: Vocabulary/phrasal verbs
    | 'mcq-sign-notice'        // B5: Image prompt + MCQ
    | 'dialogue-response'      // B6: Situational/pragmatic response
    | 'reading-cloze-mcq'      // C1: Passage cloze with MCQ per blank
    | 'reading-comprehension'  // C3: Passage + MCQ questions
    | 'reading-announcement'   // C4: Short text + MCQ
    | 'sentence-arrangement'   // D1: Arrange sentences (MCQ answer)
    | 'closest-meaning'        // D2: Sentence closest in meaning
    | 'error-identification'   // D3: Underlined part needing correction
    | 'synonym-mcq'            // D4: Word synonym
    | 'antonym-mcq'            // D5: Word antonym
    | 'word-reference';        // D6: Pronoun/word reference in passage

/** Phase 2 widget types (defined here for data model completeness) */
export type Phase2QuestionType =
    | 'verb-form'              // B3: Supply correct verb form
    | 'word-form'              // B4: Supply correct word form
    | 'reading-cloze-wordbank' // C2: Passage cloze with word bank dropdown
    | 'sentence-rewrite'       // E1: Rewrite with given start
    | 'sentence-rewrite-keyword'; // E2: Rewrite using keyword

/** All question types (Phase 1 + Phase 2) */
export type THCSQuestionType = MCQIntent | Phase2QuestionType;

/**
 * A single MCQ question within a section.
 */
export interface THCSQuestion {
    id: string;                          // UUID generated client-side via crypto.randomUUID()
    questionNumber: number;              // Sequential across entire test (1, 2, 3...) — recalculate on any reorder per PRD §9 EC13
    type: THCSQuestionType;              // Discriminator for all question types
    intent?: MCQIntent;                  // Phase 2: optional — only set when type is an MCQIntent value. Phase 2 types leave this undefined.
    questionText: string;                // The question/prompt text
    options: [string, string, string, string]; // Exactly 4 options: index 0=A, 1=B, 2=C, 3=D
    correctAnswer: 'A' | 'B' | 'C' | 'D'; // Single correct answer (MCQ only)
    points?: number;                     // undefined = auto-calculated from section. Only set when section pointMode === 'manual'
    imageUrl?: string;                   // Optional image for question prompt
    imageCaption?: string;               // Alt text for image — accessibility per PRD §6.3

    // Pronunciation-specific: underline markup in options
    // `options` stores PLAIN TEXT (e.g., "drink"). `optionUnderlines` stores
    // the SAME text WITH {{}} markup (e.g., "dr{{i}}nk").
    // The student view renders `optionUnderlines` by converting {{}} to <u> tags.
    // If `optionUnderlines` is undefined, `options` renders as-is (no underlines).
    // Only used when intent === 'pronunciation'
    optionUnderlines?: [string, string, string, string];

    // Error identification (D3): underlined parts in questionText
    // Format: "She {{go}} to school {{every day}} and {{study}} {{very hard}}."
    // Labels A/B/C/D auto-assigned to underlined parts in order
    underlinedParts?: string; // questionText with {{}} markup

    // Answer explanation (Phase 1: teacher-written; Phase 2: AI suggestions)
    // Store as object from day 1 to avoid migration.
    explanation?: {
        text: string;              // Explanation text (why this answer is correct)
        source: 'teacher' | 'ai'; // Who wrote it (Phase 1: only 'teacher')
        approvedByTeacher: boolean; // Teacher verified AI suggestion
    };

    // ═══════════════════════════════════════════════════════════
    // Phase 2 fields — only populated for Phase2QuestionType values
    // ═══════════════════════════════════════════════════════════

    // Fill-in (verb-form / word-form)
    sentenceTemplate?: string;           // Sentence with `___` markers for blanks
    blankAnswers?: BlankAnswer[];        // Correct answers per blank

    // Writing (sentence-rewrite / sentence-rewrite-keyword)
    originalSentence?: string;           // The original sentence to rewrite
    sentenceStarter?: string;            // E1: given start text
    keyword?: string;                    // E2: keyword that must be used
    modelAnswers?: string[];             // Acceptable rewritten sentences
    autoGradeWriting?: boolean;          // Teacher toggle, default false — per PRD §4.2.3

    // Cloze word bank (reading-cloze-wordbank)
    passageTemplate?: string;            // Passage with `___(N)___` numbered blank markers
    wordBank?: string[];                 // All words including distractors
    blankMapping?: Record<number, string>; // Blank number → correct word
    allowWordReuse?: boolean;            // Default false
}

/**
 * A section within a test (e.g., "PART A: PRONUNCIATION")
 */
export interface THCSSection {
    id: string;                          // UUID
    name: string;                        // e.g., "PART A: PRONUNCIATION"
    order: number;                       // Display order (0-based) — used for sorting sections
    totalPoints: number;                 // Total points for this section (initial default: 0 — display auto-calculated value when 0 per PRD §9 EC14)
    pointMode: 'auto' | 'manual';       // 'auto' = equally distributed; 'manual' = per-question
    instructionText: string;             // Auto-generated from intent, teacher-editable
    isCustomInstruction: boolean;        // true if teacher edited the auto-generated text
    layout: 'single-column' | 'two-column'; // Layout preference for student view
    isCustomLayout?: boolean;            // Phase 2: true if teacher manually changed layout. Prevents auto-reverting on type change.
    questions: THCSQuestion[];           // Questions in this section

    // Reading sections: optional passage (only for reading sections)
    // Note: includes `id` and `wordCount` from PRD
    passage?: {
        id: string;
        content: string;                   // Passage text (Markdown supported)
        title?: string;                    // e.g., "Read the following passage..."
        imageUrl?: string;                 // Optional passage-level image
        wordCount: number;
    };

    // Phase 3: Question shuffling (Mã Đề — §4.5)
    shuffle?: boolean;                     // true = shuffle question order within this section per student (default false)
    shuffleOptions?: boolean;              // true = also shuffle MCQ options A↔B↔C↔D (only meaningful when shuffle === true, default false)
}

/**
 * Test metadata
 */
export interface THCSTestMetadata {
    title: string;                       // e.g., "Đề kiểm tra giữa kì 1 - Lớp 9"
    duration: number;                    // Minutes (common: 45, 50, 60, 90)
    gradeLevel: 6 | 7 | 8 | 9 | 10 | 11 | 12; // Typed union, not generic number
    examType: string;                    // Predefined options in UI but string type allows custom
    subjectVariant?: string;             // e.g., "Global Success", "Friends Global"
    province?: string;                   // e.g., "Thanh Hóa"
    school?: string;                     // e.g., "THPT Lam Sơn"
    description?: string;
    tags?: string[];

    // Phase 3: Timer mode (§4.9)
    timerMode?: 'strict' | 'informational' | 'none'; // 'strict' = auto-submit at 0:00, 'informational' = timer shown but no auto-submit, 'none' = no timer. Default: 'strict'
}

/**
 * Complete THCS-THPT test document (published, stored in RTDB)
 */
export interface THCSTest {
    id: string;
    testType: 'THCS-THPT';              // Literal — this is the discriminator
    metadata: THCSTestMetadata;
    sections: THCSSection[];
    questionCount: number;               // Total questions across all sections
    totalPoints: number;                 // Sum of all section points
    createdBy: string;                   // Teacher UID
    ownerId: string;                     // Owner UID (same as createdBy)
    isPublic: boolean;
    isComplete: boolean;
    createdAt: number;                   // timestamp
    updatedAt: number;
    publishedAt?: number;
    sourceDraftId?: string;              // The Firestore draft ID this test was published from — needed for "Edit" action in Teacher Lobby

    // Runtime statistics (updated after sessions)
    // Field name is `stats` NOT `statistics` per PRD §4.1.1
    // Optional — initialized on first submission via runTransaction()
    stats?: {
        attempts: number;
        averageScore: number;
        averageTime: number;
        completionRate: number;
    };

    // Settings (Phase 1 hardcodes behavior, settings UI in Phase 2)
    settings?: {
        showTimer: boolean;
        showResults: 'immediate' | 'after-submission';
        allowReview: boolean;
    };

    // Delta-based version changelog (Phase 1: DEFINED but not actively used. Phase 2 will record edits here.)
    _changelog?: Record<string, ChangelogEntry>;
}

/**
 * Changelog entry for version tracking
 * Phase 1: define only, do NOT implement changelog recording
 */
export interface ChangelogEntry {
    publishedAt: number;
    publishedBy: string;
    label: string;                       // Auto-generated: "Edit #2 — 3 fields changed"
    previousValues: Record<string, any>; // Keys use `~` separator for paths, e.g. "sections~0~questions~2~correctAnswer": "B"
}

/**
 * THCS-THPT draft document (stored in Firestore)
 * Define EXPLICITLY — do NOT just say "same as THCSTest"
 */
export interface THCSDraft {
    id: string;                          // Firestore auto-generated doc ID
    userId: string;                      // The teacher who created this draft — needed for getUserThcsDrafts() query
    testType: 'THCS-THPT';
    metadata: THCSTestMetadata;
    sections: THCSSection[];
    questionCount: number;
    totalPoints: number;
    status: 'editing' | 'review' | 'published'; // 'review' for Phase 2 preview
    publishedTestId?: string;            // RTDB testId — set after first publish, reused for re-publish + version dropdown
    createdAt: Date;                     // Firestore Timestamp, converted to Date on read
    updatedAt: Date;                     // Firestore Timestamp, converted to Date on read
}

// ═══════════════════════════════════════════════════════════════
// Phase 2 Helper Types
// ═══════════════════════════════════════════════════════════════

/**
 * Blank answer for fill-in questions (verb-form / word-form)
 */
export interface BlankAnswer {
    acceptedAnswers: string[];           // Multiple correct answers per blank
    aiSuggestions?: Array<{
        answer: string;
        confidence: number;              // 0-100
        approved: boolean;               // Teacher approved → added to acceptedAnswers
    }>;
}

/**
 * Per-blank grading result (fill-in and cloze)
 */
export interface BlankResult {
    isCorrect: boolean;
    studentAnswer: string;
    correctAnswer: string;
    pointsEarned: number;
}

/**
 * Writing grading tier — two-tier grading system
 * Explicit state machine for writing answer grading pipeline
 */
export type WritingGradingTier =
    | 'pending'           // Initial state — not yet processed
    | 'auto-correct'      // Tier 1 string similarity ≥ 80% → auto-graded as correct
    | 'auto-incorrect'    // Tier 1 string similarity < 30% → auto-graded as incorrect
    | 'ai-correct'        // Tier 2 LLM score ≥ 80% → auto-graded as correct via AI
    | 'ai-incorrect'      // Tier 2 LLM score < 50% → auto-graded as incorrect via AI
    | 'teacher-review'    // Tier 2 LLM score 50-79%, OR AI unavailable → flagged for teacher
    | 'teacher-graded';   // Teacher has manually graded this answer

/**
 * Writing grading result (sentence-rewrite / sentence-rewrite-keyword)
 */
export interface WritingGradingResult {
    studentAnswer: string;
    modelAnswers: string[];
    aiScore?: number;                    // 0-100 from AI grading
    aiConfidence?: number;               // 0-100 confidence of AI assessment
    aiFeedback?: string;                 // AI's constructive feedback
    teacherScore?: number;               // Teacher's manual score
    teacherFeedback?: string;            // Teacher's feedback text
    gradingTier?: WritingGradingTier;    // Current grading state
}

/**
 * Grading status state machine — PRD §4.4
 */
export type THCSGradingStatus =
    | 'submitted'         // Student submitted, grading not started
    | 'auto-graded'       // MCQ/fill-in auto-graded, writing questions pending
    | 'partially-graded'  // Some writing questions graded by teacher
    | 'fully-graded';     // All questions graded (MCQ-only tests or all writing graded)

// ═══════════════════════════════════════════════════════════════
// Grading Results
// ═══════════════════════════════════════════════════════════════

/**
 * THCS grading result — must match PRD §4.4.1 EXACTLY
 */
export interface THCSGradingResult {
    testId: string;
    studentId: string;
    totalPoints: number;                 // Points earned
    maxPoints: number;                   // Total possible
    scaledScore: number;                 // Formula: (totalPoints / maxPoints) * 10, rounded to 1 decimal
    sectionResults: SectionResult[];
    questionResults: Record<number, QuestionResult>; // Keyed by questionNumber (NOT an Array, NOT keyed by UUID)
    gradedAt: number;                    // Timestamp
    gradingStatus: THCSGradingStatus;    // Phase 2: partial grading state machine
}

/**
 * Section-level grading result
 */
export interface SectionResult {
    sectionId: string;
    sectionName: string;
    pointsEarned: number;
    pointsMax: number;
    correctCount: number;
    totalCount: number;
    percentage: number;                  // Formula: (correctCount / totalCount) * 100
    intentBreakdown: Record<THCSQuestionType, { correct: number; total: number }>; // Phase 2: all question types, not just MCQIntent
}

/**
 * Per-question grading result
 */
export interface QuestionResult {
    questionNumber: number;
    isCorrect: boolean;
    studentAnswer: string | string[];    // string for MCQ/writing, string[] for fill-in/cloze blanks
    correctAnswer: string | string[] | undefined; // undefined for writing (model answers in writingResult)
    pointsEarned: number;
    pointsMax: number;

    // Phase 2: type-specific results
    blankResults?: BlankResult[];        // For fill-in and cloze questions
    writingResult?: WritingGradingResult; // For sentence rewriting questions
}

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

/**
 * Section instruction templates — PRD §4.2.4
 * Auto-generated when teacher selects an intent for the first question in a section.
 * EXACT strings from PRD — do NOT modify.
 */
export const INSTRUCTION_TEMPLATES: Record<MCQIntent, string> = {
    'pronunciation': 'Mark the letter A, B, C, or D on your answer sheet to indicate the word whose underlined part differs from the other three in pronunciation.',
    'word-stress': 'Mark the letter A, B, C, or D on your answer sheet to indicate the word that differs from the other three in the position of primary stress.',
    'mcq-grammar': 'Mark the letter A, B, C, or D on your answer sheet to indicate the correct answer to each of the following questions.',
    'mcq-vocabulary': 'Mark the letter A, B, C, or D on your answer sheet to indicate the correct answer to each of the following questions.',
    'mcq-sign-notice': 'Mark the letter A, B, C, or D on your answer sheet to indicate the correct answer to each of the following questions.',
    'dialogue-response': 'Mark the letter A, B, C, or D on your answer sheet to indicate the most suitable response to complete each of the following exchanges.',
    'reading-cloze-mcq': 'Read the following passage and mark the letter A, B, C, or D on your answer sheet to indicate the correct word or phrase that best fits each of the numbered blanks.',
    'reading-comprehension': 'Read the following passage and mark the letter A, B, C, or D on your answer sheet to indicate the correct answer to each of the questions.',
    'reading-announcement': 'Read the following advertisement/announcement and mark the letter A, B, C, or D on your answer sheet to indicate the correct answer to each of the questions.',
    'sentence-arrangement': 'Mark the letter A, B, C, or D on your answer sheet to indicate the correct arrangement of the given sentences to make a meaningful paragraph.',
    'closest-meaning': 'Mark the letter A, B, C, or D on your answer sheet to indicate the sentence that is closest in meaning to each of the following questions.',
    'error-identification': 'Mark the letter A, B, C, or D on your answer sheet to indicate the underlined part that needs correction in each of the following questions.',
    'synonym-mcq': 'Mark the letter A, B, C, or D on your answer sheet to indicate the word(s) CLOSEST in meaning to the underlined word(s) in each of the following questions.',
    'antonym-mcq': 'Mark the letter A, B, C, or D on your answer sheet to indicate the word(s) OPPOSITE in meaning to the underlined word(s) in each of the following questions.',
    'word-reference': 'Mark the letter A, B, C, or D on your answer sheet to indicate what the underlined word refers to in the passage.',
};

/**
 * Unified instruction templates — Phase 1 MCQ + Phase 2 question types
 * Use this for section instruction auto-generation.
 * Keeps INSTRUCTION_TEMPLATES above for backward compatibility.
 */
export const ALL_INSTRUCTION_TEMPLATES: Record<THCSQuestionType, string> = {
    // Phase 1 MCQ intents (copied from INSTRUCTION_TEMPLATES)
    ...INSTRUCTION_TEMPLATES,
    // Phase 2 question types
    'verb-form': 'Supply the correct form of the verbs in brackets.',
    'word-form': 'Supply the correct form of the words in brackets.',
    'reading-cloze-wordbank': 'Read the passage and fill in each blank with a word from the word bank.',
    'sentence-rewrite': 'Rewrite each sentence so that it has the same meaning, beginning with the given words.',
    'sentence-rewrite-keyword': 'Rewrite each sentence using the given word. Do not change the word given.',
};

/**
 * Duration presets in minutes
 */
export const DURATION_PRESETS = [45, 50, 60, 90] as const;

/**
 * Grade levels for THCS (6-9) and THPT (10-12)
 */
export const GRADE_LEVELS = [6, 7, 8, 9, 10, 11, 12] as const;

/**
 * Predefined exam type options (Vietnamese)
 */
export const EXAM_TYPE_OPTIONS = [
    'giữa kì', 'cuối kì', 'thi vào 10', 'ôn tập',
    'unit 1', 'unit 2', 'unit 3', 'unit 4', 'unit 5', 'unit 6',
    'unit 7', 'unit 8', 'unit 9', 'unit 10', 'unit 11', 'unit 12',
] as const;

/**
 * Color-coded question navigation — PRD §4.3.3 EXACTLY
 * Bold/saturated colors from the spec, NOT pastel variants
 */
export const QUESTION_NAV_COLORS = {
    unanswered: { bg: '#e2e8f0', text: '#64748b' },                          // PRD: light gray
    answered: { bg: '#3b82f6', text: '#ffffff' },                              // PRD: blue with white text
    current: { bg: '#1e293b', text: '#ffffff', ring: '#3b82f6' },              // PRD: dark with blue ring — CSS box-shadow: 0 0 0 3px #3b82f6
    flagged: { bg: '#f59e0b', text: '#ffffff' },                               // PRD: amber
    correct: { bg: '#10b981', text: '#ffffff' },                               // PRD: green — post-submit only
    incorrect: { bg: '#ef4444', text: '#ffffff' },                             // PRD: red — post-submit only
    pending: { bg: '#8b5cf6', text: '#ffffff' },                               // PRD: purple — Phase 2 only, define now
} as const;

// ═══════════════════════════════════════════════════════════════
// Phase 3: Test Templates
// ═══════════════════════════════════════════════════════════════

/**
 * Test template — stores structural info (section names, point distribution,
 * question types, counts) WITHOUT question content.
 * Stored in `thcs_templates/` Firestore collection.
 */
export interface THCSTestTemplate {
    id: string;
    name: string;
    description: string;
    ownerId: string;
    isPublic: boolean;
    createdAt: number;
    metadata: {
        gradeLevel: number;
        examType: string;
        difficulty: string;
        duration: number;
    };
    sections: Array<{
        name: string;
        instruction: string;
        layout: 'single-column' | 'two-column';
        defaultQuestionType: THCSQuestionType;
        questionCount: number;
        pointsPerQuestion: number;
        sectionPoints: number;
        shuffle: boolean;
        shuffleOptions: boolean;
    }>;
}

// ═══════════════════════════════════════════════════════════════
// Formative Feedback Types (used by formativeFeedback.service + FormativeFeedbackPanel)
// ═══════════════════════════════════════════════════════════════

/** Skill-level analysis entry for a single intent/question-type */
export interface SkillAnalysis {
    intent: THCSQuestionType;
    skillName: string;
    correct: number;
    total: number;
    percentage: number;
    questionNumbers: number[];
    wrongQuestionNumbers: number[];
}

/** Complete formative feedback stored at test_results/{id}/formativeFeedback */
export interface FormativeFeedback {
    analysis: {
        strengths: SkillAnalysis[];
        revision: SkillAnalysis[];
        critical: SkillAnalysis[];
    };
    deterministicFeedback: string;
    generatedAt: number;
    totalCorrect: number;
    totalQuestions: number;
    scaledScore: number;
    /** AI-generated per-question topics (optional, from AI enrichment) */
    questionTopics?: Record<string, { topic: string; category: string }>;
    /** AI-generated per-question explanations (optional, from AI enrichment) */
    questionExplanations?: Record<string, string>;
    /** AI-generated narrative feedback (optional, from AI enrichment) */
    aiFeedback?: {
        summary: string;
        strengths: string;
        revision: string;
        critical: string;
    };
    /** Which AI model produced the enrichment */
    aiModel?: string;
}

/**
 * Maps question intent → human-readable skill name + category.
 * Used by formativeFeedback.service for skill analysis bucketing.
 */
export const INTENT_SKILL_MAP: Record<string, { name: string; category: string }> = {
    'pronunciation': { name: 'Pronunciation', category: 'Phonetics' },
    'word-stress': { name: 'Word Stress', category: 'Phonetics' },
    'mcq-grammar': { name: 'Grammar', category: 'Language Use' },
    'mcq-vocabulary': { name: 'Vocabulary', category: 'Language Use' },
    'mcq-sign-notice': { name: 'Signs & Notices', category: 'Reading' },
    'dialogue-response': { name: 'Dialogue Response', category: 'Communication' },
    'reading-cloze-mcq': { name: 'Reading Cloze (MCQ)', category: 'Reading' },
    'reading-comprehension': { name: 'Reading Comprehension', category: 'Reading' },
    'reading-announcement': { name: 'Reading Announcements', category: 'Reading' },
    'sentence-arrangement': { name: 'Sentence Arrangement', category: 'Writing' },
    'closest-meaning': { name: 'Closest Meaning', category: 'Language Use' },
    'error-identification': { name: 'Error Identification', category: 'Language Use' },
    'synonym-mcq': { name: 'Synonyms', category: 'Vocabulary' },
    'antonym-mcq': { name: 'Antonyms', category: 'Vocabulary' },
    'word-reference': { name: 'Word Reference', category: 'Reading' },
    'verb-form': { name: 'Verb Form', category: 'Grammar' },
    'word-form': { name: 'Word Form', category: 'Grammar' },
    'reading-cloze-wordbank': { name: 'Reading Cloze (Word Bank)', category: 'Reading' },
    'sentence-rewrite': { name: 'Sentence Rewriting', category: 'Writing' },
    'sentence-rewrite-keyword': { name: 'Sentence Rewriting (Keyword)', category: 'Writing' },
};
